package jimeng

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
	. "github.com/smartystreets/goconvey/convey"
)

func newInfo() *common.TaskRelayInfo {
	cfg := ChannelConfig{
		AccessKeyID:     "AK_TEST",
		SecretAccessKey: "SK_TEST",
		Region:          "cn-north-1",
		Service:         "cv",
	}
	keyJSON, _ := json.Marshal(cfg)
	return &common.TaskRelayInfo{
		BaseURL:           "https://visual.volcengineapi.com",
		APIKey:            string(keyJSON),
		OriginModelName:   "jimeng-v3.0",
		UpstreamModelName: "jimeng_t2v_v30",
		Prompt:            "a cat",
	}
}

func TestParseChannelConfig(t *testing.T) {
	Convey("Init parses ChannelConfig JSON from APIKey", t, func() {
		a := &Adaptor{}
		info := newInfo()
		a.Init(info)
		So(a.cfg.AccessKeyID, ShouldEqual, "AK_TEST")
		So(a.cfg.Region, ShouldEqual, "cn-north-1")
		So(a.cfg.Service, ShouldEqual, "cv")
	})
}

func TestBuildRequestURL_submit(t *testing.T) {
	Convey("BuildRequestURL has Action=CVSync2AsyncSubmitTask and Version=2022-08-31", t, func() {
		a := &Adaptor{}
		info := newInfo()
		a.Init(info)
		url, err := a.BuildRequestURL(info)
		So(err, ShouldBeNil)
		So(strings.Contains(url, "Action=CVSync2AsyncSubmitTask"), ShouldBeTrue)
		So(strings.Contains(url, "Version=2022-08-31"), ShouldBeTrue)
	})
}

func TestJimeng_E2E_signed_request(t *testing.T) {
	Convey("DoRequest sends signed headers (Authorization HMAC-SHA256 / X-Date / X-Content-Sha256)", t, func() {
		var gotAuth, gotXDate, gotXSha string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotAuth = r.Header.Get("Authorization")
			gotXDate = r.Header.Get("X-Date")
			gotXSha = r.Header.Get("X-Content-Sha256")
			w.Write([]byte(`{"code":10000,"message":"ok","data":{"task_id":"j_task_001"}}`))
		}))
		defer srv.Close()

		a := &Adaptor{}
		info := newInfo()
		info.BaseURL = srv.URL
		a.Init(info)

		body, _ := a.BuildRequestBody(info)
		taskID, _, err := a.DoRequest(info, body)
		So(err, ShouldBeNil)
		So(taskID, ShouldEqual, "j_task_001")
		So(gotAuth, ShouldStartWith, "HMAC-SHA256 Credential=AK_TEST/")
		So(strings.Contains(gotAuth, "Signature="), ShouldBeTrue)
		So(gotXDate, ShouldNotBeBlank)
		So(gotXSha, ShouldNotBeBlank)
	})
}

func TestJimeng_FetchTask_signed_and_status_mapping(t *testing.T) {
	Convey("FetchTask sends signed request and maps each upstream status", t, func() {
		Convey("upstream 'done' → FetchResult.Status='completed'", func() {
			var gotAuth, gotAction string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth = r.Header.Get("Authorization")
				gotAction = r.URL.Query().Get("Action")
				w.Write([]byte(`{"code":10000,"message":"ok","data":{"status":"done","image_urls":["https://x/done.png"]}}`))
			}))
			defer srv.Close()

			a := &Adaptor{}
			info := newInfo()
			info.BaseURL = srv.URL
			a.Init(info)

			res, err := a.FetchTask(info, "j_task_001")
			So(err, ShouldBeNil)
			So(gotAction, ShouldEqual, "CVSync2AsyncGetResult")
			So(gotAuth, ShouldStartWith, "HMAC-SHA256 Credential=AK_TEST/")
			So(res.Status, ShouldEqual, "completed")
			So(res.Progress, ShouldEqual, "100")
		})

		Convey("upstream 'generating' → FetchResult.Status='processing'", func() {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"code":10000,"message":"ok","data":{"status":"generating"}}`))
			}))
			defer srv.Close()

			a := &Adaptor{}
			info := newInfo()
			info.BaseURL = srv.URL
			a.Init(info)

			res, err := a.FetchTask(info, "j_task_001")
			So(err, ShouldBeNil)
			So(res.Status, ShouldEqual, "processing")
			So(res.Progress, ShouldEqual, "50")
		})

		Convey("upstream 'failed' → FetchResult.Status='failed' with FailReason", func() {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"code":10000,"message":"ok","data":{"status":"failed","fail_reason":"content blocked"}}`))
			}))
			defer srv.Close()

			a := &Adaptor{}
			info := newInfo()
			info.BaseURL = srv.URL
			a.Init(info)

			res, err := a.FetchTask(info, "j_task_001")
			So(err, ShouldBeNil)
			So(res.Status, ShouldEqual, "failed")
			So(res.FailReason, ShouldEqual, "content blocked")
		})

		Convey("upstream business error code → returns error", func() {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Write([]byte(`{"code":50000,"message":"server error","data":{}}`))
			}))
			defer srv.Close()

			a := &Adaptor{}
			info := newInfo()
			info.BaseURL = srv.URL
			a.Init(info)

			_, err := a.FetchTask(info, "j_task_001")
			So(err, ShouldNotBeNil)
			So(err.Error(), ShouldContainSubstring, "50000")
		})
	})
}
