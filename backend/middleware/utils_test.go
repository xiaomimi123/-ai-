package middleware

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	. "github.com/smartystreets/goconvey/convey"
)

// getRequestModel 必须能从 multipart/form-data body 里取出 model 字段。
// 2026-07-06 部署时踩坑：`/v1/images/edits` multipart 请求走进 distributor
// middleware 后，因为 UnmarshalBodyReusable 对 multipart 的 ShouldBind 没
// 把 model 塞进 ModelRequest，导致 requestModel 是空字符串，最终 503
// "对于模型 (空) 无可用渠道"。这个 test 锁住修复行为。
func TestGetRequestModel_multipartExtractsModel(t *testing.T) {
	Convey("multipart body with model field → getRequestModel returns model", t, func() {
		buf := &bytes.Buffer{}
		mw := multipart.NewWriter(buf)
		_ = mw.WriteField("model", "gpt-image-2")
		_ = mw.WriteField("prompt", "hi")
		fw, _ := mw.CreateFormFile("image", "in.png")
		fw.Write([]byte{0x89, 0x50, 0x4e, 0x47})
		mw.Close()

		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", mw.FormDataContentType())

		got, err := getRequestModel(c)
		So(err, ShouldBeNil)
		So(got, ShouldEqual, "gpt-image-2")
	})

	Convey("multipart /v1/images/edits without model → defaults to gpt-image-1", t, func() {
		buf := &bytes.Buffer{}
		mw := multipart.NewWriter(buf)
		_ = mw.WriteField("prompt", "hi")
		fw, _ := mw.CreateFormFile("image", "in.png")
		fw.Write([]byte{0x89})
		mw.Close()

		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/edits", buf)
		c.Request.Header.Set("Content-Type", mw.FormDataContentType())

		got, err := getRequestModel(c)
		So(err, ShouldBeNil)
		So(got, ShouldEqual, "gpt-image-1")
	})
}
