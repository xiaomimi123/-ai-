package task

import (
	"github.com/songquanpeng/one-api/relay/adaptor/task/apimart"
	"github.com/songquanpeng/one-api/relay/adaptor/task/common"
	"github.com/songquanpeng/one-api/relay/adaptor/task/jimeng"
	"github.com/songquanpeng/one-api/relay/channeltype"
)

// IsAsyncTaskType reports whether this channel.Type is handled by the async task framework.
func IsAsyncTaskType(channelType int) bool {
	switch channelType {
	case channeltype.ApiMart, channeltype.Jimeng:
		return true
	}
	return false
}

// PlatformOf maps a channel.Type to a stable platform string used in tasks.platform column.
func PlatformOf(channelType int) string {
	switch channelType {
	case channeltype.ApiMart:
		return "apimart"
	case channeltype.Jimeng:
		return "jimeng"
	}
	return ""
}

// AdaptorOf returns an adaptor instance for the given platform name (empty if unknown).
func AdaptorOf(platform string) common.TaskAdaptor {
	switch platform {
	case "apimart":
		return &apimart.Adaptor{}
	case "jimeng":
		return &jimeng.Adaptor{}
	}
	return nil
}
