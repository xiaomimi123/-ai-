package channeltype

import (
	. "github.com/smartystreets/goconvey/convey"
	"testing"
)

func TestAsyncTaskChannelTypes(t *testing.T) {
	Convey("async task channel types", t, func() {
		So(ApiMart, ShouldEqual, 57)
		So(Jimeng, ShouldEqual, 58)
	})
}
