package model

import (
	"encoding/json"
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

func TestTaskStatusConstants(t *testing.T) {
	Convey("task status constants", t, func() {
		So(string(TaskStatusSubmitted), ShouldEqual, "SUBMITTED")
		So(string(TaskStatusInProgress), ShouldEqual, "IN_PROGRESS")
		So(string(TaskStatusSuccess), ShouldEqual, "SUCCESS")
		So(string(TaskStatusFailure), ShouldEqual, "FAILURE")
		So(string(TaskStatusTimeout), ShouldEqual, "TIMEOUT")
	})
}

func TestTaskJSONFields(t *testing.T) {
	Convey("task json marshaling", t, func() {
		task := Task{
			TaskID:    "task_test_001",
			Platform:  "apimart",
			UserId:    22,
			ChannelId: 16,
			Status:    TaskStatusSubmitted,
			Quota:     1056,
		}
		b, err := json.Marshal(task)
		So(err, ShouldBeNil)

		var m map[string]interface{}
		err = json.Unmarshal(b, &m)
		So(err, ShouldBeNil)
		So(m["task_id"], ShouldEqual, "task_test_001")
		So(m["platform"], ShouldEqual, "apimart")
		So(m["status"], ShouldEqual, "SUBMITTED")
	})
}
