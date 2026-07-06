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
		So(form.ImageDataURI, ShouldStartWith, "data:image/png;base64,")
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
			ImageDataURI: "data:image/png;base64,AAAA",
			Resolution:   "4k",
		}
		body := marshalImageEditsAsGenerations(form)
		So(string(body), ShouldContainSubstring, `"resolution":"4k"`)
	})

	Convey("empty Resolution → JSON body omits the key", t, func() {
		form := &imageEditsForm{
			Model: "gpt-image-2", Prompt: "x",
			ImageDataURI: "data:image/png;base64,AAAA",
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
		So(form.ImageDataURI, ShouldStartWith, "data:image/png;base64,")
		So(form.MaskDataURI, ShouldStartWith, "data:image/png;base64,")
		// masks should decode to different bytes from image
		So(form.MaskDataURI, ShouldNotEqual, form.ImageDataURI)
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
			ImageDataURI: "data:image/png;base64,AAAA",
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
			ImageDataURI: "data:image/png;base64,AAAA",
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
