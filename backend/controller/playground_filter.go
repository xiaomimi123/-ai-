package controller

import (
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/songquanpeng/one-api/model"
)

// Playground 内容过滤：管理员可配的关键词黑名单
//
// 设计取舍：
//   - 不走 /v1/moderations 外部 API：避免审核通道挂掉时业务停摆（用户约束）
//   - 关键词存 option 表（key = "playground_blocked_keywords"，逗号分隔）
//   - 默认空列表；管理员部署后在后台 option 页填入，重启无需
//   - 内存缓存 + 60s TTL，避免每次请求都查库
//
// 未来可选扩展（V2）：接 OpenAI /v1/moderations 做语义级过滤
const (
	blockedKeywordsOption = "playground_blocked_keywords"
	keywordsCacheTTL      = 10 * time.Second
)

type keywordCache struct {
	words     []string
	expiresAt int64 // unix nanoseconds
}

var (
	kwCacheMu sync.RWMutex
	kwCache   atomic.Pointer[keywordCache]
)

// getBlockedKeywords 读取黑名单，60s 缓存
// 返回小写后的关键词数组；匹配时也对待检查文本 ToLower
func getBlockedKeywords() []string {
	now := time.Now().UnixNano()
	if c := kwCache.Load(); c != nil && c.expiresAt > now {
		return c.words
	}
	kwCacheMu.Lock()
	defer kwCacheMu.Unlock()
	// double-check（并发进入的话只读一次库）
	if c := kwCache.Load(); c != nil && c.expiresAt > now {
		return c.words
	}
	raw := model.GetOptionValue(blockedKeywordsOption)
	parts := strings.Split(raw, ",")
	words := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(strings.ToLower(p))
		if p != "" {
			words = append(words, p)
		}
	}
	kwCache.Store(&keywordCache{
		words:     words,
		expiresAt: now + int64(keywordsCacheTTL),
	})
	return words
}

// checkContentSafety 返回 (ok, hitKeyword)
// ok=true 表示通过；ok=false 表示命中黑名单，hitKeyword 为命中的词（仅供日志）
// 空列表 = 全部通过
func checkContentSafety(text string) (bool, string) {
	if text == "" {
		return true, ""
	}
	words := getBlockedKeywords()
	if len(words) == 0 {
		return true, ""
	}
	lower := strings.ToLower(text)
	for _, w := range words {
		if strings.Contains(lower, w) {
			return false, w
		}
	}
	return true, ""
}

// extractLastUserMessage 从 messages 里取最后一条 user 消息的文本
// 仅 text role=user 的 content 是 string 时参与检查；多模态数组忽略
func extractLastUserMessage(messages []map[string]interface{}) string {
	for i := len(messages) - 1; i >= 0; i-- {
		m := messages[i]
		role, _ := m["role"].(string)
		if role != "user" {
			continue
		}
		if c, ok := m["content"].(string); ok {
			return c
		}
	}
	return ""
}
