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

// TestShouldReturnTaskIDImmediately covers the sync-vs-async decision
// (Fix ③). Order of precedence: request body's async:true wins, then the
// context ForceAsync flag set by Playground, else sync.
func TestShouldReturnTaskIDImmediately(t *testing.T) {
	Convey("default is sync (return image URL, not task_id)", t, func() {
		c := newCtxWithChannelType(channeltype.ApiMart)
		So(shouldReturnTaskIDImmediately(c, taskRequestBody{}), ShouldBeFalse)
	})

	Convey("body.async:true → return task_id immediately", t, func() {
		c := newCtxWithChannelType(channeltype.ApiMart)
		So(shouldReturnTaskIDImmediately(c, taskRequestBody{Async: true}), ShouldBeTrue)
	})

	Convey("ctxkey.ForceAsync=true (Playground path) → return task_id immediately", t, func() {
		c := newCtxWithChannelType(channeltype.ApiMart)
		c.Set(ctxkey.ForceAsync, true)
		So(shouldReturnTaskIDImmediately(c, taskRequestBody{}), ShouldBeTrue)
	})

	Convey("body.async:false with ForceAsync=true still returns task_id (context wins to protect Playground)", t, func() {
		c := newCtxWithChannelType(channeltype.ApiMart)
		c.Set(ctxkey.ForceAsync, true)
		So(shouldReturnTaskIDImmediately(c, taskRequestBody{Async: false}), ShouldBeTrue)
	})
}

// TestBuildSyncImagesResponse locks the OpenAI-standard shape returned when
// the sync waiter succeeds: {created, data:[{url:"..."}]} — no task_id, no
// status, no lingjing extensions. Direct SDK compatibility depends on this.
func TestBuildSyncImagesResponse(t *testing.T) {
	Convey("single image → data has one entry with url", t, func() {
		resp := buildSyncImagesResponse([]string{"https://cdn.x/a.png"})
		So(resp["data"], ShouldHaveLength, 1)
		data := resp["data"].([]gin.H)
		So(data[0]["url"], ShouldEqual, "https://cdn.x/a.png")
		_, hasTaskID := data[0]["task_id"]
		So(hasTaskID, ShouldBeFalse)
		_, hasStatus := data[0]["status"]
		So(hasStatus, ShouldBeFalse)
	})

	Convey("multiple images → data preserves order", t, func() {
		resp := buildSyncImagesResponse([]string{"u1", "u2", "u3"})
		data := resp["data"].([]gin.H)
		So(data, ShouldHaveLength, 3)
		So(data[0]["url"], ShouldEqual, "u1")
		So(data[2]["url"], ShouldEqual, "u3")
	})

	Convey("response has 'created' timestamp", t, func() {
		resp := buildSyncImagesResponse([]string{"u1"})
		_, ok := resp["created"]
		So(ok, ShouldBeTrue)
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
