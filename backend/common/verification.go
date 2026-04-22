package common

import (
	crand "crypto/rand"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type verificationValue struct {
	code string
	time time.Time
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationMapMaxSize = 10
var VerificationValidMinutes = 10

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

// GenerateNumericCode 生成 length 位纯数字验证码（crypto/rand，防穷举猜测）。
// 专用于邮箱/短信验证码等需要用户手动输入的场景——手机端纯数字键盘输入友好，
// 而 GenerateVerificationCode 生成的是十六进制（含 a-f 字母），手机不方便输。
func GenerateNumericCode(length int) string {
	if length <= 0 {
		return ""
	}
	const digits = "0123456789"
	max := big.NewInt(int64(len(digits)))
	b := make([]byte, length)
	for i := 0; i < length; i++ {
		n, err := crand.Int(crand.Reader, max)
		if err != nil {
			n = big.NewInt(time.Now().UnixNano() % int64(len(digits)))
		}
		b[i] = digits[n.Int64()]
	}
	return string(b)
}

// 验证码 Redis key 形如 verification:v:user@example.com，TTL 由 Redis 自己管。
// Redis 不可用时降级到进程内 map，进程一重启就丢。
func verificationRedisKey(purpose, key string) string {
	return "verification:" + purpose + ":" + key
}

func RegisterVerificationCodeWithKey(key string, code string, purpose string) {
	if RDB != nil {
		ttl := time.Duration(VerificationValidMinutes) * time.Minute
		if err := RedisSet(verificationRedisKey(purpose, key), code, ttl); err == nil {
			return
		}
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap[purpose+key] = verificationValue{
		code: code,
		time: time.Now(),
	}
	if len(verificationMap) > verificationMapMaxSize {
		removeExpiredPairs()
	}
}

func VerifyCodeWithKey(key string, code string, purpose string) bool {
	if RDB != nil {
		if stored, err := RedisGet(verificationRedisKey(purpose, key)); err == nil {
			return stored == code
		}
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	value, okay := verificationMap[purpose+key]
	now := time.Now()
	if !okay || int(now.Sub(value.time).Seconds()) >= VerificationValidMinutes*60 {
		return false
	}
	return code == value.code
}

func DeleteKey(key string, purpose string) {
	if RDB != nil {
		_ = RedisDel(verificationRedisKey(purpose, key))
	}
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	delete(verificationMap, purpose+key)
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if int(now.Sub(verificationMap[key].time).Seconds()) >= VerificationValidMinutes*60 {
			delete(verificationMap, key)
		}
	}
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
}
