package task

import (
	"testing"

	. "github.com/smartystreets/goconvey/convey"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

func TestIsAsyncTaskType(t *testing.T) {
	Convey("IsAsyncTaskType true only for ApiMart and Jimeng", t, func() {
		So(IsAsyncTaskType(channeltype.ApiMart), ShouldBeTrue)
		So(IsAsyncTaskType(channeltype.Jimeng), ShouldBeTrue)
		So(IsAsyncTaskType(channeltype.OpenAI), ShouldBeFalse)
		So(IsAsyncTaskType(0), ShouldBeFalse)
		So(IsAsyncTaskType(999), ShouldBeFalse)
	})
}

func TestPlatformOf(t *testing.T) {
	Convey("PlatformOf returns stable platform string", t, func() {
		So(PlatformOf(channeltype.ApiMart), ShouldEqual, "apimart")
		So(PlatformOf(channeltype.Jimeng), ShouldEqual, "jimeng")
		So(PlatformOf(channeltype.OpenAI), ShouldEqual, "")
	})
}

func TestAdaptorOf(t *testing.T) {
	Convey("AdaptorOf returns non-nil for known platforms, nil for others", t, func() {
		So(AdaptorOf("apimart"), ShouldNotBeNil)
		So(AdaptorOf("jimeng"), ShouldNotBeNil)
		So(AdaptorOf("unknown"), ShouldBeNil)
		So(AdaptorOf(""), ShouldBeNil)
	})
}
