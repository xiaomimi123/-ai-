package apimart

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestBuildRequestBody(t *testing.T) {
	Convey("BuildRequestBody marshals to apimart SubmitRequest", t, func() {
		a := &Adaptor{}
		info := newInfo()
		info.UpstreamModelName = "gpt-image-2"
		body, err := a.BuildRequestBody(info)
		So(err, ShouldBeNil)

		var req SubmitRequest
		So(json.Unmarshal(body, &req), ShouldBeNil)
		So(req.Model, ShouldEqual, "gpt-image-2")
		So(req.Prompt, ShouldEqual, "a cat")
		So(req.Size, ShouldEqual, "16:9")
		So(req.Resolution, ShouldEqual, "2k")
		So(req.N, ShouldEqual, 1)
	})
}

func TestDoRequest_success(t *testing.T) {
	Convey("DoRequest extracts task_id from successful async response", t, func() {
		// Capture request path/auth from handler goroutine for assertion in main goroutine
		// (GoConvey's So() cannot be called from a goroutine outside the Convey stack).
		var gotPath, gotAuth string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotPath = r.URL.Path
			gotAuth = r.Header.Get("Authorization")
			w.WriteHeader(200)
			w.Write([]byte(`{"code":200,"data":[{"status":"submitted","task_id":"task_xxx"}]}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		body, _ := a.BuildRequestBody(info)
		taskID, raw, err := a.DoRequest(info, body)
		So(err, ShouldBeNil)
		So(taskID, ShouldEqual, "task_xxx")
		So(string(raw), ShouldContainSubstring, "submitted")
		So(gotPath, ShouldEqual, "/v1/images/generations")
		So(gotAuth, ShouldEqual, "Bearer sk-test")
	})
}

func TestDoRequest_upstream_html_error(t *testing.T) {
	Convey("DoRequest detects HTML error page (regression: 2026-05-13 invalid character '<' bug)", t, func() {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(404)
			w.Write([]byte("<html>not found</html>"))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		body, _ := a.BuildRequestBody(info)
		_, _, err := a.DoRequest(info, body)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "non-JSON")
	})
}

func TestDoRequest_upstream_business_error(t *testing.T) {
	Convey("DoRequest surfaces upstream business error (400 with structured error JSON)", t, func() {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(400)
			w.Write([]byte(`{"error":{"code":400,"message":"invalid prompt","type":"invalid_request_error"}}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		body, _ := a.BuildRequestBody(info)
		_, _, err := a.DoRequest(info, body)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "invalid prompt")
	})
}

func TestFetchTask_submitted(t *testing.T) {
	Convey("FetchTask returns submitted status", t, func() {
		var gotPath string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotPath = r.URL.Path
			w.Write([]byte(`{"code":200,"data":{"id":"task_xxx","status":"submitted","progress":0}}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		res, err := a.FetchTask(info, "task_xxx")
		So(err, ShouldBeNil)
		So(gotPath, ShouldEqual, "/v1/tasks/task_xxx")
		So(res.Status, ShouldEqual, "submitted")
	})
}

func TestFetchTask_processing(t *testing.T) {
	Convey("FetchTask returns processing with progress", t, func() {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{"code":200,"data":{"id":"task_xxx","status":"processing","progress":50}}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		res, err := a.FetchTask(info, "task_xxx")
		So(err, ShouldBeNil)
		So(res.Status, ShouldEqual, "processing")
		So(res.Progress, ShouldEqual, "50")
	})
}

func TestFetchTask_completed(t *testing.T) {
	Convey("FetchTask returns completed with full result body", t, func() {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{
				"code":200,
				"data":{
					"id":"task_xxx",
					"status":"completed",
					"progress":100,
					"actual_time":52,
					"cost":0.05279,
					"result":{"images":[{"url":["https://cdn.x/abc.png"],"expires_at":1747243204}]}
				}
			}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		res, err := a.FetchTask(info, "task_xxx")
		So(err, ShouldBeNil)
		So(res.Status, ShouldEqual, "completed")
		So(res.Result, ShouldNotBeEmpty)
	})
}

func TestFetchTask_failed(t *testing.T) {
	Convey("FetchTask returns failed with reason", t, func() {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(`{
				"code":200,
				"data":{"id":"task_xxx","status":"failed","error":{"code":500,"message":"upstream timeout","type":"server_error"}}
			}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		res, err := a.FetchTask(info, "task_xxx")
		So(err, ShouldBeNil)
		So(res.Status, ShouldEqual, "failed")
		So(res.FailReason, ShouldContainSubstring, "upstream timeout")
	})
}

func TestTruncate_utf8_safe(t *testing.T) {
	Convey("truncate preserves UTF-8 boundaries", t, func() {
		Convey("ASCII short", func() {
			So(truncate("hello", 10), ShouldEqual, "hello")
		})
		Convey("ASCII long", func() {
			So(truncate("abcdefghij", 5), ShouldEqual, "abcde...")
		})
		Convey("Chinese characters not split", func() {
			out := truncate("一只可爱的橘猫", 3)
			So(out, ShouldEqual, "一只可...")
		})
		Convey("Emoji not split", func() {
			out := truncate("🐶🐱🐰🦊", 2)
			So(out, ShouldEqual, "🐶🐱...")
		})
	})
}

func TestApiMart_E2E_submit_then_poll_to_completed(t *testing.T) {
	Convey("E2E: submit returns task_id, then 3 fetches transition processing→completed", t, func() {
		var fetchCount int
		var unexpectedPath string

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/v1/images/generations" {
				w.Write([]byte(`{"code":200,"data":[{"status":"submitted","task_id":"task_999"}]}`))
				return
			}
			if r.URL.Path == "/v1/tasks/task_999" {
				fetchCount++
				if fetchCount < 3 {
					w.Write([]byte(`{"code":200,"data":{"id":"task_999","status":"processing","progress":30}}`))
					return
				}
				w.Write([]byte(`{
					"code":200,
					"data":{"id":"task_999","status":"completed","progress":100,
					        "result":{"images":[{"url":["https://cdn.x/done.png"]}]}}
				}`))
				return
			}
			unexpectedPath = r.URL.Path
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL

		// 1. Submit
		body, _ := a.BuildRequestBody(info)
		taskID, _, err := a.DoRequest(info, body)
		So(err, ShouldBeNil)
		So(taskID, ShouldEqual, "task_999")

		// 2. Poll 3 times: processing, processing, completed
		var last *common.FetchResult
		for i := 0; i < 3; i++ {
			last, err = a.FetchTask(info, taskID)
			So(err, ShouldBeNil)
		}

		So(unexpectedPath, ShouldBeBlank)  // server only got the expected 4 paths total
		So(last.Status, ShouldEqual, "completed")
		So(fetchCount, ShouldEqual, 3)
	})
}

func TestDoRequest_apimart_string_error_code(t *testing.T) {
	Convey("DoRequest tolerates apimart's `code:''` (empty string) in error", t, func() {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(401)
			w.Write([]byte(`{"error":{"code":"","message":"invalid API key","type":"apimart_error"}}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		body, _ := a.BuildRequestBody(info)
		_, _, err := a.DoRequest(info, body)
		So(err, ShouldNotBeNil)
		So(err.Error(), ShouldContainSubstring, "invalid API key")
	})
}
