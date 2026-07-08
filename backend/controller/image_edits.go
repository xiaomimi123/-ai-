package controller

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// /v1/images/edits — OpenAI 官方图生图协议（multipart/form-data）。
//
// 我们不落盘：读进内存 → base64 data URI → 塞进 image_urls / mask_url →
// 改写请求为 JSON 版 /v1/images/generations → 走标准 dispatch。
//
// 上游（apimart / Gemini）已经接受 image_urls / mask_url，所以这一层
// 只是"多种前端形态"的适配层，不引入新的存储或渠道能力。

// maxEditsFileSize 单文件上限。apimart 官方文档没有硬限；20 MB 覆盖 4K PNG
// 有余，且 base64 后不会撞 Gin 默认 32 MB body limit。总 body 上限在
// http.MaxBytesReader 那里控制（≈45 MB / image + mask + fields + boundary）。
const maxEditsFileSize = 20 * 1024 * 1024

// imageEditsForm 多部分表单解析后的结构。data URI 已经 base64 编码，
// 可以直接塞进下游 JSON 而不需再动。
type imageEditsForm struct {
	Model         string
	Prompt        string
	N             int
	Size          string
	Resolution    string // apimart 的 1k / 2k / 4k 分辨率档位
	ImageDataURIs []string
	MaskDataURI   string
}

// parseImageEditsMultipart 从 multipart/form-data 请求里抽出编辑用的所有字段。
// 强制要求：image 文件 + prompt 字段。mask、n、size 都是可选。
func parseImageEditsMultipart(c *gin.Context) (*imageEditsForm, error) {
	// ParseMultipartForm 会在 memory 里缓 32MB，够我们用；超过则 spill 到临时
	// 文件（Gin 默认 tmpdir）。这里显式设一次上限。
	if err := c.Request.ParseMultipartForm(maxEditsFileSize + 5<<20); err != nil {
		return nil, errors.New("parse multipart: " + err.Error())
	}

	prompt := strings.TrimSpace(c.PostForm("prompt"))
	if prompt == "" {
		return nil, errors.New("prompt is required")
	}

	model := strings.TrimSpace(c.PostForm("model"))
	if model == "" {
		// 官方 image edits 允许省略 model 时用默认；我们不假设，让上游报错
		// 更清晰。这里给一个 gpt-image-1 兜底，跟 openai/getImageRequest 一致。
		model = "gpt-image-1"
	}

	n, _ := strconv.Atoi(c.PostForm("n"))
	if n <= 0 {
		n = 1
	}
	size := c.PostForm("size")
	resolution := c.PostForm("resolution") // 1k/2k/4k，可选

	imageDataURIs, err := readAllImageFilesAsDataURIs(c)
	if err != nil {
		return nil, err
	}

	maskDataURI, _ := readMultipartFileAsDataURI(c, "mask")
	// mask 是可选，找不到就静默忽略；找到但读取失败不 fatal，log 一下
	// TODO(F+1): 增加 warning log。目前静默是为了让老客户端不带 mask 也能过。

	return &imageEditsForm{
		Model:         model,
		Prompt:        prompt,
		N:             n,
		Size:          size,
		Resolution:    resolution,
		ImageDataURIs: imageDataURIs,
		MaskDataURI:   maskDataURI,
	}, nil
}

// readAllImageFilesAsDataURIs 收集 multipart form 里所有参考图字段，
// 转成 data URI slice 返回。兼容以下字段名（OpenAI SDK + 常见客户端）：
//
//   - image           OpenAI 官方单图字段
//   - image[]         OpenAI SDK 当 image=[f1,f2,...] 传 list 时用的字段名
//   - image[0]/[1]…   Google/OpenAPI codegen 常见 indexed 变体
//
// 至少要有一张图，否则返回错误（供上层 400）。上限跟 apimart 保持一致
// 最多 16 张（参见 apimart docs）。
//
// Fix ⑥（2026-07-08）：老版本只查 field="image" 单字段，客户传 image[]
// 时报 "missing image file: http: no such file"。
func readAllImageFilesAsDataURIs(c *gin.Context) ([]string, error) {
	mf := c.Request.MultipartForm
	if mf == nil {
		if err := c.Request.ParseMultipartForm(maxEditsFileSize + 5<<20); err != nil {
			return nil, errors.New("parse multipart: " + err.Error())
		}
		mf = c.Request.MultipartForm
	}

	// 优先级：image[N] indexed → image[] list → image singular。
	// 三者组合出现的极端情况按顺序拼接，去重靠客户端约束。
	type hit struct {
		field string
		fh    *multipart.FileHeader
		order int // 展示顺序：indexed 用 N；bracket-list 用 -1 保留 map 顺序；single 用 0
	}
	var hits []hit
	for name, fhs := range mf.File {
		switch {
		case name == "image" || name == "image[]":
			for _, fh := range fhs {
				hits = append(hits, hit{name, fh, 0})
			}
		case strings.HasPrefix(name, "image[") && strings.HasSuffix(name, "]"):
			// image[0], image[1] … 抽 index
			idxStr := name[len("image[") : len(name)-1]
			idx, err := strconv.Atoi(idxStr)
			if err != nil {
				continue // image[abc] 之类非数字 index 忽略
			}
			for _, fh := range fhs {
				hits = append(hits, hit{name, fh, idx + 1}) // +1 让 indexed 排在 image/image[] 之后
			}
		case strings.HasPrefix(name, "image_"):
			// image_0, image_1 … 数字后缀也接
			idxStr := name[len("image_"):]
			idx, err := strconv.Atoi(idxStr)
			if err != nil {
				continue
			}
			for _, fh := range fhs {
				hits = append(hits, hit{name, fh, idx + 1})
			}
		}
	}

	if len(hits) == 0 {
		return nil, errors.New("missing image file: no field named image, image[], image[N] or image_N found in multipart form")
	}

	// 按 order 升序排稳定；image/image[]（order=0）先，然后 image[0]<image[1]<…
	sort.SliceStable(hits, func(i, j int) bool { return hits[i].order < hits[j].order })

	if len(hits) > 16 {
		return nil, errors.New("too many reference images: max 16 supported by upstream")
	}

	uris := make([]string, 0, len(hits))
	for _, h := range hits {
		if h.fh.Size > maxEditsFileSize {
			return nil, errors.New(h.field + " file exceeds " + strconv.Itoa(maxEditsFileSize/1024/1024) + " MB")
		}
		f, err := h.fh.Open()
		if err != nil {
			return nil, errors.New("open " + h.field + ": " + err.Error())
		}
		buf, err := io.ReadAll(io.LimitReader(f, maxEditsFileSize+1))
		_ = f.Close()
		if err != nil {
			return nil, errors.New("read " + h.field + ": " + err.Error())
		}
		if int64(len(buf)) > maxEditsFileSize {
			return nil, errors.New(h.field + " file exceeds " + strconv.Itoa(maxEditsFileSize/1024/1024) + " MB")
		}
		uris = append(uris, fileBytesToDataURI(buf, h.fh.Filename))
	}
	return uris, nil
}

// readMultipartFileAsDataURI 找到指定 field 的第一个文件，读全部字节，
// 转 data URI 返回。找不到字段返回错误（找不到 header）。
func readMultipartFileAsDataURI(c *gin.Context, field string) (string, error) {
	file, header, err := c.Request.FormFile(field)
	if err != nil {
		return "", errors.New("missing " + field + " file: " + err.Error())
	}
	defer file.Close()

	if header.Size > maxEditsFileSize {
		return "", errors.New(field + " file exceeds " + strconv.Itoa(maxEditsFileSize/1024/1024) + " MB")
	}

	buf, err := io.ReadAll(io.LimitReader(file, maxEditsFileSize+1))
	if err != nil {
		return "", errors.New("read " + field + ": " + err.Error())
	}
	if int64(len(buf)) > maxEditsFileSize {
		return "", errors.New(field + " file exceeds " + strconv.Itoa(maxEditsFileSize/1024/1024) + " MB")
	}

	return fileBytesToDataURI(buf, header.Filename), nil
}

// fileBytesToDataURI 从原始字节 + 客户端上传时的 filename 猜 MIME，返回
// data:<mime>;base64,<b64> 字符串。文件名后缀不认识时默认 image/png（因为
// 图像编辑接口在实践中 99% 是 PNG）。
func fileBytesToDataURI(data []byte, filename string) string {
	mime := "image/png"
	lower := strings.ToLower(filename)
	switch {
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		mime = "image/jpeg"
	case strings.HasSuffix(lower, ".webp"):
		mime = "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		mime = "image/gif"
	}
	b64 := base64.StdEncoding.EncodeToString(data)
	return "data:" + mime + ";base64," + b64
}

// marshalImageEditsAsGenerations 把 imageEditsForm 序列化成
// /v1/images/generations 的 JSON 请求体。下游 apimart / Gemini 分支已经
// 认 image_urls 和 mask_url 两个字段，所以这里是简单直接的透传。
// image_urls 数组顺序 = 客户端 multipart 里参考图字段的解析顺序。
func marshalImageEditsAsGenerations(form *imageEditsForm) []byte {
	body := map[string]interface{}{
		"model":      form.Model,
		"prompt":     form.Prompt,
		"n":          form.N,
		"image_urls": form.ImageDataURIs,
	}
	if form.Size != "" {
		body["size"] = form.Size
	}
	if form.Resolution != "" {
		body["resolution"] = form.Resolution
	}
	if form.MaskDataURI != "" {
		body["mask_url"] = form.MaskDataURI
	}
	out, _ := json.Marshal(body)
	return out
}

// RelayImageEdits 是 /v1/images/edits 官方多部分入口。
//
// 流程：
//  1. 解析 multipart → 提取字段和文件
//  2. 图 / 遮罩转 base64 data URI（in-memory）
//  3. 打包成 /v1/images/generations JSON 请求体
//  4. 改写 c.Request（body / URL / Content-Type）
//  5. 调 Relay(c) 走标准 dispatch（会自动经 Gemini 分支 or apimart 分支）
func RelayImageEdits(c *gin.Context) {
	form, err := parseImageEditsMultipart(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{"message": err.Error(), "type": "invalid_request_error"},
		})
		return
	}

	body := marshalImageEditsAsGenerations(form)

	c.Request.Body = io.NopCloser(bytes.NewBuffer(body))
	c.Request.ContentLength = int64(len(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.URL.Path = "/v1/images/generations"

	Relay(c)
}
