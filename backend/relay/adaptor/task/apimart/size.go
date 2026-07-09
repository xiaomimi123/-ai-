package apimart

import (
	"regexp"
	"strconv"
	"strings"
)

// apimart 允许的 aspect ratio 白名单（gemini 系图像模型只认这些）。
// 来源：apimart 官方文档 aspect_ratios 字段。
var apimartAllowedRatios = []string{
	"auto",
	"1:1", "3:2", "2:3", "4:3", "3:4",
	"16:9", "9:16", "5:4", "4:5",
	"21:9", "1:4", "4:1", "1:8", "8:1",
}

// pixelSizePattern 匹配 "1024x1024" / "1792X1024" 这种像素格式。
var pixelSizePattern = regexp.MustCompile(`^(\d+)[xX](\d+)$`)

// isAspectRatioOnlyModel 判断该模型是否只接受 aspect ratio 格式而不接受像素。
// gemini 系（含 nano-banana 别名）和 imagen 系是"只认 ratio"，其他（gpt-image-*、
// flux-*、sora-*）两种格式都接受。
//
// 判定用 substring 匹配以覆盖新老命名（gemini-2.5-flash-image-preview,
// gemini-3.1-flash-image-preview, nano-banana, nano-banana2, imagen-4.0-apimart
// 等）。同时也兜住上游后续加的 "gemini-4-*"、"imagen-5-*"。
func isAspectRatioOnlyModel(model string) bool {
	lower := strings.ToLower(model)
	patterns := []string{"gemini", "flash-image", "nano-banana", "imagen"}
	for _, p := range patterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

// normalizeSizeForModel 按模型家族翻译 size 字段。
//
// Fix ⑦（2026-07-09）：apimart gemini/imagen 系模型只接受 aspect ratio，
// 传 "1024x1024" 会在生成阶段报 "This aspect_ratio is not within the range
// of allowed options"（error code: task_failed）。我们在这里把常见 OpenAI
// SDK 客户端传的像素格式翻译成最接近的 apimart 允许的 aspect ratio。
//
// 对不需要翻译的模型（gpt-image-2 / flux / gpt-image-1.5 等），原样透传，
// 因为它们本身接受两种格式。
func normalizeSizeForModel(model, size string) string {
	if size == "" {
		return ""
	}
	if !isAspectRatioOnlyModel(model) {
		return size
	}
	// 已经是 ratio 格式（含 "auto"）就不动
	if !pixelSizePattern.MatchString(size) {
		return size
	}
	// 像素格式 → 翻译成最接近的允许 ratio
	m := pixelSizePattern.FindStringSubmatch(size)
	w, _ := strconv.Atoi(m[1])
	h, _ := strconv.Atoi(m[2])
	if w <= 0 || h <= 0 {
		return "1:1" // 兜底
	}
	return pixelToClosestRatio(w, h)
}

// pixelToClosestRatio 把 w×h 转成 apimart 允许的最接近 aspect ratio。
// 先尝试精确匹配（GCD 化简后正好在白名单里），失败就找数值上最接近的。
func pixelToClosestRatio(w, h int) string {
	g := gcd(w, h)
	rw, rh := w/g, h/g
	exact := strconv.Itoa(rw) + ":" + strconv.Itoa(rh)
	for _, r := range apimartAllowedRatios {
		if r == exact {
			return r
		}
	}

	// 找数值上最接近的
	target := float64(w) / float64(h)
	best := "1:1"
	bestDiff := 1e18
	for _, r := range apimartAllowedRatios {
		if r == "auto" {
			continue
		}
		parts := strings.SplitN(r, ":", 2)
		if len(parts) != 2 {
			continue
		}
		pw, _ := strconv.Atoi(parts[0])
		ph, _ := strconv.Atoi(parts[1])
		if pw <= 0 || ph <= 0 {
			continue
		}
		diff := abs(target - float64(pw)/float64(ph))
		if diff < bestDiff {
			bestDiff = diff
			best = r
		}
	}
	return best
}

func gcd(a, b int) int {
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
