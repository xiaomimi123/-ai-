package apimart

import (
	"testing"

	. "github.com/smartystreets/goconvey/convey"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
)

func newInfo() *common.TaskRelayInfo {
	return &common.TaskRelayInfo{
		BaseURL:         "https://api.apimart.ai",
		APIKey:          "sk-test",
		OriginModelName: "gpt-image-2",
		Prompt:          "a cat",
		Size:            "16:9",
		Resolution:      "2k",
		N:               1,
	}
}

func TestValidateRequest_empty_prompt(t *testing.T) {
	Convey("Validate rejects empty prompt", t, func() {
		a := &Adaptor{}
		info := newInfo()
		info.Prompt = ""
		err := a.ValidateRequest(info)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "prompt")
	})
}

func TestBuildRequestURL_normal(t *testing.T) {
	Convey("BuildRequestURL appends /v1/images/generations", t, func() {
		a := &Adaptor{}
		url, err := a.BuildRequestURL(newInfo())
		So(err, ShouldBeNil)
		So(url, ShouldEqual, "https://api.apimart.ai/v1/images/generations")
	})
}

func TestBuildRequestURL_strip_trailing_slash(t *testing.T) {
	Convey("BuildRequestURL strips trailing slash on BaseURL", t, func() {
		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = "https://api.apimart.ai/"
		url, _ := a.BuildRequestURL(info)
		So(url, ShouldEqual, "https://api.apimart.ai/v1/images/generations")
	})
}

func TestBuildRequestURL_strip_path_duplicate(t *testing.T) {
	Convey("BuildRequestURL does not duplicate /v1 (regression: 2026-05-13 prod bug)", t, func() {
		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = "https://api.apimart.ai/v1"
		url, _ := a.BuildRequestURL(info)
		So(url, ShouldEqual, "https://api.apimart.ai/v1/images/generations")
	})
}

func TestBuildRequestHeader(t *testing.T) {
	Convey("BuildRequestHeader sets Authorization and Content-Type", t, func() {
		a := &Adaptor{}
		h, err := a.BuildRequestHeader(newInfo())
		So(err, ShouldBeNil)
		So(h["Authorization"], ShouldEqual, "Bearer sk-test")
		So(h["Content-Type"], ShouldEqual, "application/json")
	})
}
