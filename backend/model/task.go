package model

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type TaskStatus string

const (
	TaskStatusNotStart   TaskStatus = "NOT_START"
	TaskStatusSubmitted  TaskStatus = "SUBMITTED"
	TaskStatusQueued     TaskStatus = "QUEUED"
	TaskStatusInProgress TaskStatus = "IN_PROGRESS"
	TaskStatusSuccess    TaskStatus = "SUCCESS"
	TaskStatusFailure    TaskStatus = "FAILURE"
	TaskStatusUnknown    TaskStatus = "UNKNOWN"
	TaskStatusTimeout    TaskStatus = "TIMEOUT"
)

// TaskProperties 任务属性（业务无关元数据，写到 properties 列）
type TaskProperties struct {
	Input             string `json:"input"`
	UpstreamModelName string `json:"upstream_model_name,omitempty"`
	OriginModelName   string `json:"origin_model_name,omitempty"`
}

func (p *TaskProperties) Scan(v interface{}) error {
	if v == nil {
		return nil
	}
	return json.Unmarshal(v.([]byte), p)
}
func (p TaskProperties) Value() (driver.Value, error) { return json.Marshal(p) }

// TaskPrivateData 任务私有数据（含上游 task id、billing 上下文）
type TaskPrivateData struct {
	UpstreamTaskID string                 `json:"upstream_task_id,omitempty"`
	ResultURL      string                 `json:"result_url,omitempty"`
	TokenId        int                    `json:"token_id,omitempty"`
	BillingContext map[string]interface{} `json:"billing_context,omitempty"`
}

func (p *TaskPrivateData) Scan(v interface{}) error {
	if v == nil {
		return nil
	}
	return json.Unmarshal(v.([]byte), p)
}
func (p TaskPrivateData) Value() (driver.Value, error) { return json.Marshal(p) }

type Task struct {
	ID          int64           `json:"id" gorm:"primary_key;AUTO_INCREMENT"`
	CreatedAt   int64           `json:"created_at" gorm:"index"`
	UpdatedAt   int64           `json:"updated_at"`
	TaskID      string          `json:"task_id" gorm:"type:varchar(191);uniqueIndex;not null"`
	Platform    string          `json:"platform" gorm:"type:varchar(30);index;not null"`
	UserId      int             `json:"user_id" gorm:"index;not null"`
	Group       string          `json:"group" gorm:"type:varchar(50);column:group"`
	ChannelId   int             `json:"channel_id" gorm:"index;not null"`
	Quota       int             `json:"quota" gorm:"not null;default:0"`
	Action      string          `json:"action" gorm:"type:varchar(40);index"`
	Status      TaskStatus      `json:"status" gorm:"type:varchar(20);index;not null"`
	FailReason  string          `json:"fail_reason" gorm:"type:text"`
	SubmitTime  int64           `json:"submit_time"`
	StartTime   int64           `json:"start_time"`
	FinishTime  int64           `json:"finish_time"`
	Progress    string          `json:"progress" gorm:"type:varchar(20)"`
	Properties  TaskProperties  `json:"properties" gorm:"type:json"`
	PrivateData TaskPrivateData `json:"-" gorm:"type:json;column:private_data"`
	Data        json.RawMessage `json:"data" gorm:"type:json"`
	RefundLogId int             `json:"refund_log_id" gorm:"default:0"`
	TimeoutAt   int64           `json:"timeout_at" gorm:"index"`
}

func (Task) TableName() string { return "tasks" }

func (t *Task) BeforeCreate(tx *gorm.DB) error {
	now := time.Now().Unix()
	if t.CreatedAt == 0 {
		t.CreatedAt = now
	}
	t.UpdatedAt = now
	if t.SubmitTime == 0 {
		t.SubmitTime = now
	}
	return nil
}

func (t *Task) BeforeUpdate(tx *gorm.DB) error {
	t.UpdatedAt = time.Now().Unix()
	return nil
}

func CreateTask(t *Task) error { return DB.Create(t).Error }

func GetTaskByTaskID(taskID string) (*Task, error) {
	var t Task
	err := DB.Where("task_id = ?", taskID).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func GetUserTask(userId int, taskID string) (*Task, error) {
	var t Task
	err := DB.Where("task_id = ? AND user_id = ?", taskID, userId).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func ListPendingTasks(limit int) ([]Task, error) {
	var tasks []Task
	pending := []TaskStatus{TaskStatusSubmitted, TaskStatusQueued, TaskStatusInProgress, TaskStatusUnknown}
	err := DB.Where("status IN ? AND timeout_at >= ?", pending, time.Now().Unix()).
		Order("updated_at ASC").
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

func ListTimeoutTasks(limit int) ([]Task, error) {
	var tasks []Task
	pending := []TaskStatus{TaskStatusSubmitted, TaskStatusQueued, TaskStatusInProgress, TaskStatusUnknown}
	err := DB.Where("status IN ? AND timeout_at < ?", pending, time.Now().Unix()).
		Limit(limit).
		Find(&tasks).Error
	return tasks, err
}

func UpdateTaskStatus(tx *gorm.DB, taskID string, updates map[string]interface{}) error {
	return tx.Model(&Task{}).Where("task_id = ?", taskID).Updates(updates).Error
}

func CleanOldTasks(retentionDays int) (int64, error) {
	cutoff := time.Now().Unix() - int64(retentionDays*86400)
	done := []TaskStatus{TaskStatusSuccess, TaskStatusFailure, TaskStatusTimeout}
	res := DB.Where("status IN ? AND finish_time < ?", done, cutoff).Delete(&Task{})
	return res.RowsAffected, res.Error
}
