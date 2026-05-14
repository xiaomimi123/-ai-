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

func TestTaskProperties_ScanRoundTrip(t *testing.T) {
	Convey("TaskProperties scan accepts both []byte and string", t, func() {
		original := TaskProperties{Input: "hello", OriginModelName: "gpt-image-1"}
		val, err := original.Value()
		So(err, ShouldBeNil)

		// Drivers may return either []byte or string
		Convey("from []byte", func() {
			var got TaskProperties
			So(got.Scan(val.([]byte)), ShouldBeNil)
			So(got.Input, ShouldEqual, "hello")
			So(got.OriginModelName, ShouldEqual, "gpt-image-1")
		})

		Convey("from string", func() {
			var got TaskProperties
			So(got.Scan(string(val.([]byte))), ShouldBeNil)
			So(got.Input, ShouldEqual, "hello")
		})

		Convey("from nil", func() {
			var got TaskProperties
			So(got.Scan(nil), ShouldBeNil)
		})

		Convey("from unsupported type", func() {
			var got TaskProperties
			err := got.Scan(12345)
			So(err, ShouldNotBeNil)
		})
	})
}

func TestTaskPrivateData_ScanRoundTrip(t *testing.T) {
	Convey("TaskPrivateData scan accepts both []byte and string", t, func() {
		original := TaskPrivateData{
			UpstreamTaskID: "upstream_123",
			ResultURL:      "https://example.com/result",
			TokenId:        42,
			BillingContext: map[string]interface{}{"key": "value"},
		}
		val, err := original.Value()
		So(err, ShouldBeNil)

		Convey("from []byte", func() {
			var got TaskPrivateData
			So(got.Scan(val.([]byte)), ShouldBeNil)
			So(got.UpstreamTaskID, ShouldEqual, "upstream_123")
			So(got.TokenId, ShouldEqual, 42)
		})

		Convey("from string", func() {
			var got TaskPrivateData
			So(got.Scan(string(val.([]byte))), ShouldBeNil)
			So(got.UpstreamTaskID, ShouldEqual, "upstream_123")
		})

		Convey("from nil", func() {
			var got TaskPrivateData
			So(got.Scan(nil), ShouldBeNil)
		})

		Convey("from unsupported type", func() {
			var got TaskPrivateData
			err := got.Scan(false)
			So(err, ShouldNotBeNil)
		})
	})
}
