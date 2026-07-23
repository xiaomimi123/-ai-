package hupijiao

import (
	"crypto/md5"
	crand "crypto/rand"
	"encoding/hex"
	"sort"
	"strings"
	"time"
)

// Sign 虎皮椒 MD5 签名（官方 v1.1 规则）
// 由 controller.hupijiaoSign 迁入，算法未做任何改动。
// 规则：
//  1. 排除 hash 字段和所有空值参数
//  2. 剩下的 key 按 ASCII 升序
//  3. 按 "k1=v1&k2=v2..." 拼接 URL query 格式（值**不做** URL encode，原样拼）
//  4. 末尾直接拼上 AppSecret（注意：不是 "&key=AppSecret"，是直接 + AppSecret）
//  5. MD5 小写即为 hash
func Sign(params map[string]string, secret string) string {
	keys := make([]string, 0, len(params))
	for k, v := range params {
		if k == "hash" || v == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	raw := strings.Join(parts, "&") + secret
	sum := md5.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// Nonce 生成 nonce_str（32 位十六进制随机串，crypto/rand 不可预测）
// 由 controller.hupijiaoNonce 迁入。
func Nonce() string {
	b := make([]byte, 16)
	if _, err := crand.Read(b); err != nil {
		// crypto/rand 几乎不会失败；兜底用时间戳至少保证有值
		ts := time.Now().UnixNano()
		for i := range b {
			b[i] = byte(ts >> (i % 8))
		}
	}
	return hex.EncodeToString(b)
}
