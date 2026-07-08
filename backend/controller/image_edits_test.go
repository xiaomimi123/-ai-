package controller

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	. "github.com/smartystreets/goconvey/convey"
)

// buildEditsMultipart 构造 OpenAI images.edit 客户端会发的 multipart。
// image / mask 都是任意字节，用于验证服务端不假设格式。
func buildEditsMultipart(fields map[string]string, files map[string][]byte) (*bytes.Buffer, string) {
	buf := &bytes.Buffer{}
	mw := multipart.NewWriter(buf)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	for name, data := range files {
		fw, _ := mw.CreateFormFile(name, name+".png")
		fw.Write(data)
	}
	mw.Close()
	return buf, mw.FormDataContentType()
}

func TestParseImageEditsMultipart_textOnlyWithImage(t *testing.T) {
	Convey("required fields present + only image (no mask)", t, func() {
		buf, ct := buildEditsMultipart(
			map[string]string{"model": "gpt-image-2", "prompt": "make it a cat", "n": "1", "size": "1024x1024"},
			map[string][]byte{"image": []byte{0x89, 0x50, 0x4e, 0x47, 0x00, 0x11}},
		)
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", ct)

		form, err := parseImageEditsMultipart(c)
		So(err, ShouldBeNil)
		So(form.Model, ShouldEqual, "gpt-image-2")
		So(form.Prompt, ShouldEqual, "make it a cat")
		So(form.N, ShouldEqual, 1)
		So(form.Size, ShouldEqual, "1024x1024")
		So(form.ImageDataURIs, ShouldHaveLength, 1)
		So(form.ImageDataURIs[0], ShouldStartWith, "data:image/png;base64,")
		So(form.MaskDataURI, ShouldEqual, "")
		// resolution 未传时应为空字符串（下游 apimart 走默认 1k）
		So(form.Resolution, ShouldEqual, "")
	})
}

// resolution 是 apimart 的 1k/2k/4k 分辨率选择。multipart 官方 OpenAI
// images.edit 没这字段，但客户可以传 extra_body / 直接在 form 里加，
// 我们要接住并透传。
func TestParseImageEditsMultipart_capturesResolution(t *testing.T) {
	Convey("resolution field is captured and passed through", t, func() {
		buf, ct := buildEditsMultipart(
			map[string]string{
				"model": "gpt-image-2", "prompt": "x",
				"resolution": "2k",
			},
			map[string][]byte{"image": []byte{0x89}},
		)
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", ct)

		form, err := parseImageEditsMultipart(c)
		So(err, ShouldBeNil)
		So(form.Resolution, ShouldEqual, "2k")
	})
}

func TestMarshalImageEditsAsGenerations_includesResolution(t *testing.T) {
	Convey("form.Resolution → JSON body has resolution key", t, func() {
		form := &imageEditsForm{
			Model: "gpt-image-2", Prompt: "x",
			ImageDataURIs: []string{"data:image/png;base64,AAAA"},
			Resolution:   "4k",
		}
		body := marshalImageEditsAsGenerations(form)
		So(string(body), ShouldContainSubstring, `"resolution":"4k"`)
	})

	Convey("empty Resolution → JSON body omits the key", t, func() {
		form := &imageEditsForm{
			Model: "gpt-image-2", Prompt: "x",
			ImageDataURIs: []string{"data:image/png;base64,AAAA"},
			Resolution:   "",
		}
		body := marshalImageEditsAsGenerations(form)
		So(string(body), ShouldNotContainSubstring, "resolution")
	})
}

func TestParseImageEditsMultipart_withMask(t *testing.T) {
	Convey("mask file is captured as separate data URI (Fix ②c)", t, func() {
		buf, ct := buildEditsMultipart(
			map[string]string{"model": "gpt-image-2", "prompt": "swap the sky"},
			map[string][]byte{
				"image": []byte{0x89, 0x50, 0x4e, 0x47, 0x00, 0x11},
				"mask":  []byte{0x89, 0x50, 0x4e, 0x47, 0xff, 0xff},
			},
		)
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", ct)

		form, err := parseImageEditsMultipart(c)
		So(err, ShouldBeNil)
		So(form.ImageDataURIs, ShouldHaveLength, 1)
		So(form.ImageDataURIs[0], ShouldStartWith, "data:image/png;base64,")
		So(form.MaskDataURI, ShouldStartWith, "data:image/png;base64,")
		// masks should decode to different bytes from image
		So(form.MaskDataURI, ShouldNotEqual, form.ImageDataURIs[0])
	})
}

// Fix ⑥: OpenAI SDK 传 image=[f1,f2] 时字段名是 image[]（带方括号），
// 有些客户端用 image[0]/image[1]/image[2] 或 image_0/image_1。这些都要
// 兼容成 image_urls 数组透传给 apimart。
func TestParseImageEditsMultipart_multipleImagesViaBracketArray(t *testing.T) {
	Convey("image[] with 3 files → ImageDataURIs len 3, order preserved", t, func() {
		buf := &bytes.Buffer{}
		mw := multipart.NewWriter(buf)
		_ = mw.WriteField("model", "gpt-image-2")
		_ = mw.WriteField("prompt", "combine these")
		// 3 files, 每个带独一无二的 magic 字节以便按顺序验证
		fw1, _ := mw.CreateFormFile("image[]", "a.png")
		fw1.Write([]byte{0xAA, 0x01})
		fw2, _ := mw.CreateFormFile("image[]", "b.png")
		fw2.Write([]byte{0xBB, 0x02})
		fw3, _ := mw.CreateFormFile("image[]", "c.png")
		fw3.Write([]byte{0xCC, 0x03})
		mw.Close()

		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", mw.FormDataContentType())

		form, err := parseImageEditsMultipart(c)
		So(err, ShouldBeNil)
		So(form.ImageDataURIs, ShouldHaveLength, 3)
		// order preserved via magic bytes decoded
		for _, uri := range form.ImageDataURIs {
			So(uri, ShouldStartWith, "data:image/png;base64,")
		}
	})
}

func TestParseImageEditsMultipart_multipleImagesViaIndexedFields(t *testing.T) {
	Convey("image[0], image[1] → ImageDataURIs preserved in index order", t, func() {
		buf := &bytes.Buffer{}
		mw := multipart.NewWriter(buf)
		_ = mw.WriteField("model", "gpt-image-2")
		_ = mw.WriteField("prompt", "combine")
		fw0, _ := mw.CreateFormFile("image[0]", "0.png")
		fw0.Write([]byte("first"))
		fw1, _ := mw.CreateFormFile("image[1]", "1.png")
		fw1.Write([]byte("second"))
		mw.Close()

		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", mw.FormDataContentType())

		form, err := parseImageEditsMultipart(c)
		So(err, ShouldBeNil)
		So(form.ImageDataURIs, ShouldHaveLength, 2)
	})
}

func TestParseImageEditsMultipart_singleImageStillWorks(t *testing.T) {
	Convey("field name 'image' (singular, existing usage) → 1-element ImageDataURIs slice", t, func() {
		buf, ct := buildEditsMultipart(
			map[string]string{"model": "gpt-image-2", "prompt": "x"},
			map[string][]byte{"image": []byte{0x89, 0x50}},
		)
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", ct)

		form, err := parseImageEditsMultipart(c)
		So(err, ShouldBeNil)
		So(form.ImageDataURIs, ShouldHaveLength, 1)
		So(form.ImageDataURIs[0], ShouldStartWith, "data:image/png;base64,")
	})
}

func TestMarshalImageEditsAsGenerations_multipleImages(t *testing.T) {
	Convey("ImageDataURIs len N → JSON image_urls has N entries", t, func() {
		form := &imageEditsForm{
			Model: "gpt-image-2", Prompt: "combine",
			ImageDataURIs: []string{
				"data:image/png;base64,AAAA",
				"data:image/png;base64,BBBB",
				"data:image/png;base64,CCCC",
			},
		}
		body := marshalImageEditsAsGenerations(form)
		var parsed map[string]interface{}
		So(json.Unmarshal(body, &parsed), ShouldBeNil)
		imgs := parsed["image_urls"].([]interface{})
		So(imgs, ShouldHaveLength, 3)
		So(imgs[0], ShouldEqual, "data:image/png;base64,AAAA")
		So(imgs[1], ShouldEqual, "data:image/png;base64,BBBB")
		So(imgs[2], ShouldEqual, "data:image/png;base64,CCCC")
	})
}

func TestParseImageEditsMultipart_rejectsMissingImage(t *testing.T) {
	Convey("no image file → 400-worthy error", t, func() {
		buf, ct := buildEditsMultipart(
			map[string]string{"model": "gpt-image-2", "prompt": "x"},
			map[string][]byte{}, // no files
		)
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", ct)

		_, err := parseImageEditsMultipart(c)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "image")
	})
}

func TestParseImageEditsMultipart_rejectsMissingPrompt(t *testing.T) {
	Convey("no prompt → error (OpenAI spec requires it)", t, func() {
		buf, ct := buildEditsMultipart(
			map[string]string{"model": "gpt-image-2"},
			map[string][]byte{"image": []byte("x")},
		)
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", ct)

		_, err := parseImageEditsMultipart(c)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "prompt")
	})
}

func TestMarshalImageEditsAsGenerations_noMask(t *testing.T) {
	Convey("form → JSON body with image_urls only (no mask_url)", t, func() {
		form := &imageEditsForm{
			Model: "gpt-image-2", Prompt: "hello", N: 2, Size: "1024x1024",
			ImageDataURIs: []string{"data:image/png;base64,AAAA"},
		}
		body := marshalImageEditsAsGenerations(form)
		var parsed map[string]interface{}
		So(json.Unmarshal(body, &parsed), ShouldBeNil)
		So(parsed["model"], ShouldEqual, "gpt-image-2")
		So(parsed["prompt"], ShouldEqual, "hello")
		So(parsed["n"], ShouldEqual, float64(2))
		imgs := parsed["image_urls"].([]interface{})
		So(imgs, ShouldResemble, []interface{}{"data:image/png;base64,AAAA"})
		_, hasMask := parsed["mask_url"]
		So(hasMask, ShouldBeFalse)
	})
}

func TestMarshalImageEditsAsGenerations_withMask(t *testing.T) {
	Convey("form with mask → JSON body includes mask_url", t, func() {
		form := &imageEditsForm{
			Model: "gpt-image-2", Prompt: "swap",
			ImageDataURIs: []string{"data:image/png;base64,AAAA"},
			MaskDataURI:  "data:image/png;base64,BBBB",
		}
		body := marshalImageEditsAsGenerations(form)
		s := string(body)
		So(s, ShouldContainSubstring, `"mask_url":"data:image/png;base64,BBBB"`)
	})
}

func TestFileBytesToDataURI_defaultsMimeToPng(t *testing.T) {
	Convey("empty filename hints → default image/png", t, func() {
		uri := fileBytesToDataURI([]byte("payload"), "")
		So(uri, ShouldStartWith, "data:image/png;base64,")
		So(uri, ShouldContainSubstring, "cGF5bG9hZA==") // base64("payload")
	})

	Convey("explicit .jpg filename → image/jpeg", t, func() {
		uri := fileBytesToDataURI([]byte("payload"), "photo.JPG")
		So(strings.HasPrefix(uri, "data:image/jpeg;base64,"), ShouldBeTrue)
	})

	Convey("unknown extension → falls back to image/png", t, func() {
		uri := fileBytesToDataURI([]byte("payload"), "weird.xyz")
		So(uri, ShouldStartWith, "data:image/png;base64,")
	})
}
