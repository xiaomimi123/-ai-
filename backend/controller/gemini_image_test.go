package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	. "github.com/smartystreets/goconvey/convey"

	"github.com/songquanpeng/one-api/relay/channeltype"
)

func TestIsGeminiChannelType(t *testing.T) {
	Convey("only Gemini and GeminiOpenAICompatible dispatch to Gemini image path", t, func() {
		So(isGeminiChannelType(channeltype.Gemini), ShouldBeTrue)
		So(isGeminiChannelType(channeltype.GeminiOpenAICompatible), ShouldBeTrue)

		// negatives — must NOT hijack these
		So(isGeminiChannelType(channeltype.OpenAI), ShouldBeFalse)
		So(isGeminiChannelType(channeltype.ApiMart), ShouldBeFalse)
		So(isGeminiChannelType(channeltype.Anthropic), ShouldBeFalse)
		So(isGeminiChannelType(0), ShouldBeFalse)
	})
}

func TestRewriteToGeminiChatCompletion_textOnly(t *testing.T) {
	Convey("rewrites /v1/images/generations body to chat/completions with modalities", t, func() {
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		orig := `{"model":"nano-banana","prompt":"a cat","n":1,"size":"1024x1024"}`
		c.Request = httptest.NewRequest("POST", "/v1/images/generations", bytes.NewBufferString(orig))

		req, err := RewriteToGeminiChatCompletion(c)
		So(err, ShouldBeNil)
		So(req.Prompt, ShouldEqual, "a cat")
		So(req.Model, ShouldEqual, "nano-banana")

		// path is rewritten
		So(c.Request.URL.Path, ShouldEqual, "/v1/chat/completions")

		// body is rewritten to chat/completions form
		body, _ := io.ReadAll(c.Request.Body)
		var parsed map[string]interface{}
		So(json.Unmarshal(body, &parsed), ShouldBeNil)
		So(parsed["modalities"], ShouldResemble, []interface{}{"image", "text"})
		So(parsed["model"], ShouldEqual, "nano-banana")
		msgs := parsed["messages"].([]interface{})
		So(msgs, ShouldHaveLength, 1)
		firstMsg := msgs[0].(map[string]interface{})
		So(firstMsg["role"], ShouldEqual, "user")
		So(firstMsg["content"], ShouldEqual, "a cat")
	})
}

func TestRewriteToGeminiChatCompletion_withImageURLs(t *testing.T) {
	Convey("image_urls become image_url parts in the user message", t, func() {
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		orig := `{"model":"nano-banana","prompt":"cartoonify","image_urls":["https://x/in.png"]}`
		c.Request = httptest.NewRequest("POST", "/v1/images/generations", bytes.NewBufferString(orig))

		req, err := RewriteToGeminiChatCompletion(c)
		So(err, ShouldBeNil)
		So(req.ImageURLs, ShouldResemble, []string{"https://x/in.png"})

		body, _ := io.ReadAll(c.Request.Body)
		So(string(body), ShouldContainSubstring, `"type":"image_url"`)
		So(string(body), ShouldContainSubstring, "https://x/in.png")
		So(string(body), ShouldContainSubstring, `"type":"text"`)
		So(string(body), ShouldContainSubstring, "cartoonify")
	})
}

func TestRewriteToGeminiChatCompletion_rejectsEmptyPrompt(t *testing.T) {
	Convey("empty prompt is rejected before touching context", t, func() {
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/images/generations",
			bytes.NewBufferString(`{"model":"nano-banana","prompt":""}`))

		_, err := RewriteToGeminiChatCompletion(c)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "prompt")
	})
}

func TestBuildGeminiImageOKResponse_extractsImagesToOpenAIShape(t *testing.T) {
	Convey("chat/completions raw response with image_url part → images/generations shape", t, func() {
		raw := []byte(`{
			"choices":[{"message":{"content":[{"type":"image_url","image_url":{"url":"https://out/a.png"}}]}}]
		}`)
		resp, err := BuildGeminiImageOKResponse(raw)
		So(err, ShouldBeNil)
		data := resp["data"].([]gin.H)
		So(data, ShouldHaveLength, 1)
		So(data[0]["url"], ShouldEqual, "https://out/a.png")
	})
}

func TestBuildGeminiImageOKResponse_noImagesReturnsError(t *testing.T) {
	Convey("text-only chat response returns error — caller should surface upstream error", t, func() {
		raw := []byte(`{"choices":[{"message":{"content":"just words no picture"}}]}`)
		_, err := BuildGeminiImageOKResponse(raw)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "no image")
	})
}
