package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	. "github.com/smartystreets/goconvey/convey"
	"github.com/songquanpeng/one-api/common/ctxkey"
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
