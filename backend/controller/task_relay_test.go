package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	. "github.com/smartystreets/goconvey/convey"
	"github.com/songquanpeng/one-api/common/ctxkey"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

// newCtxWithChannelType builds a minimal gin.Context with the given channel.Type
// stored under ctxkey.Channel — mirroring what middleware.SetupContextForSelectedChannel
// does for a real request.
func newCtxWithChannelType(channelType int) *gin.Context {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(ctxkey.Channel, channelType)
	return c
}

func TestShouldDispatchToTaskRelay(t *testing.T) {
	Convey("feature flag off: never dispatches", t, func() {
		c := newCtxWithChannelType(channeltype.ApiMart)
		So(shouldDispatchToTaskRelay(c, false), ShouldBeFalse)

		c = newCtxWithChannelType(channeltype.Jimeng)
		So(shouldDispatchToTaskRelay(c, false), ShouldBeFalse)

		c = newCtxWithChannelType(channeltype.OpenAI)
		So(shouldDispatchToTaskRelay(c, false), ShouldBeFalse)
	})

	Convey("feature flag on: dispatches only for async task channel types", t, func() {
		c := newCtxWithChannelType(channeltype.ApiMart)
		So(shouldDispatchToTaskRelay(c, true), ShouldBeTrue)

		c = newCtxWithChannelType(channeltype.Jimeng)
		So(shouldDispatchToTaskRelay(c, true), ShouldBeTrue)
	})

	Convey("feature flag on: sync channel types fall through (no dispatch)", t, func() {
		c := newCtxWithChannelType(channeltype.OpenAI)
		So(shouldDispatchToTaskRelay(c, true), ShouldBeFalse)

		c = newCtxWithChannelType(channeltype.Gemini)
		So(shouldDispatchToTaskRelay(c, true), ShouldBeFalse)

		c = newCtxWithChannelType(channeltype.Anthropic)
		So(shouldDispatchToTaskRelay(c, true), ShouldBeFalse)
	})

	Convey("feature flag on: missing/zero channel type does not dispatch", t, func() {
		gin.SetMode(gin.TestMode)
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		// no c.Set for ctxkey.Channel — c.GetInt returns 0
		So(shouldDispatchToTaskRelay(c, true), ShouldBeFalse)
	})
}

// TestEstimateImageQuota covers the per-N scaling and zero-defaulting of the
// pre-consume estimator. F1 will replace the body with model-aware pricing;
// this test guards against accidental regression of the “n defaults to 1”
// invariant which protects against zero-quota rows.
func TestEstimateImageQuota(t *testing.T) {
	Convey("estimateImageQuota scales with n and defaults to 1", t, func() {
		So(estimateImageQuota(taskRequestBody{N: 0}), ShouldEqual, 1024)
		So(estimateImageQuota(taskRequestBody{N: 1}), ShouldEqual, 1024)
		So(estimateImageQuota(taskRequestBody{N: 3}), ShouldEqual, 3072)
		So(estimateImageQuota(taskRequestBody{N: -1}), ShouldEqual, 1024)
		So(estimateImageQuota(taskRequestBody{N: 10}), ShouldEqual, 10240)
	})
}

// TestTaskToOpenAIView locks the OpenAI-shape projection for the read
// endpoints (E3): status flattening, progress parsing, and which optional
// keys (result/usage/error) appear in which states.
func TestTaskToOpenAIView(t *testing.T) {
	Convey("taskToOpenAIView maps internal Task to OpenAI shape", t, func() {
		Convey("SUCCESS includes result and usage", func() {
			task := &model.Task{
				TaskID:     "task_abc",
				Status:     model.TaskStatusSuccess,
				Quota:      1024,
				Progress:   "100",
				Data:       []byte(`{"foo":"bar"}`),
				Properties: model.TaskProperties{OriginModelName: "gpt-image-1"},
			}
			v := taskToOpenAIView(task)
			So(v["id"], ShouldEqual, "task_abc")
			So(v["status"], ShouldEqual, "completed")
			So(v["progress"], ShouldEqual, 100)
			So(v["model"], ShouldEqual, "gpt-image-1")
			So(v["result"], ShouldNotBeNil)
			So(v["usage"], ShouldNotBeNil)
		})

		Convey("FAILURE includes error", func() {
			task := &model.Task{
				TaskID:     "task_xyz",
				Status:     model.TaskStatusFailure,
				FailReason: "upstream broke",
			}
			v := taskToOpenAIView(task)
			So(v["status"], ShouldEqual, "failed")
			So(v["error"], ShouldNotBeNil)
		})

		Convey("SUBMITTED returns 'submitted'", func() {
			task := &model.Task{TaskID: "task_q", Status: model.TaskStatusSubmitted}
			v := taskToOpenAIView(task)
			So(v["status"], ShouldEqual, "submitted")
		})

		Convey("TIMEOUT maps to 'failed'", func() {
			task := &model.Task{TaskID: "task_t", Status: model.TaskStatusTimeout, FailReason: "timeout"}
			v := taskToOpenAIView(task)
			So(v["status"], ShouldEqual, "failed")
			So(v["error"], ShouldNotBeNil)
		})
	})
}
