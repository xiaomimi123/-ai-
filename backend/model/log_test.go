package model

import (
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

func TestLogHasTaskIdField(t *testing.T) {
	Convey("Log struct should have TaskId field for async task audit linkage", t, func() {
		l := Log{TaskId: "task_xxx"}
		So(l.TaskId, ShouldEqual, "task_xxx")
	})
}
