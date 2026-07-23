package config

import (
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/env"

	"github.com/google/uuid"
)

var SystemName = env.String("SYSTEM_NAME", "AI API Platform")
var ServerAddress = env.String("SERVER_ADDRESS", "http://localhost:3000")
var Footer = ""
var Logo = ""
var TopUpLink = ""
var ChatLink = ""
var QuotaPerUnit = 500 * 1000.0 // $0.002 / 1K tokens
var DisplayInCurrencyEnabled = true
var DisplayTokenStatEnabled = true

// Any options with "Secret", "Token" in its key won't be return by GetOptions

var SessionSecret = uuid.New().String()

var OptionMap map[string]string
var OptionMapRWMutex sync.RWMutex

var ItemsPerPage = 10
var MaxRecentItems = 100

var PasswordLoginEnabled = true
var PasswordRegisterEnabled = true
var EmailVerificationEnabled = false
var GitHubOAuthEnabled = false
var OidcEnabled = false
var WeChatAuthEnabled = false
var TurnstileCheckEnabled = false
var RegisterEnabled = true

var EmailDomainRestrictionEnabled = false
var EmailDomainWhitelist = []string{
	"gmail.com",
	"163.com",
	"126.com",
	"qq.com",
	"outlook.com",
	"hotmail.com",
	"icloud.com",
	"yahoo.com",
	"foxmail.com",
}

var DebugEnabled = strings.ToLower(os.Getenv("DEBUG")) == "true"
var DebugSQLEnabled = strings.ToLower(os.Getenv("DEBUG_SQL")) == "true"
var MemoryCacheEnabled = strings.ToLower(os.Getenv("MEMORY_CACHE_ENABLED")) == "true"

var LogConsumeEnabled = true

var SMTPServer = ""
var SMTPPort = 587
var SMTPAccount = ""
var SMTPFrom = ""
var SMTPToken = ""

var GitHubClientId = ""
var GitHubClientSecret = ""

var LarkClientId = ""
var LarkClientSecret = ""

var OidcClientId = ""
var OidcClientSecret = ""
var OidcWellKnown = ""
var OidcAuthorizationEndpoint = ""
var OidcTokenEndpoint = ""
var OidcUserinfoEndpoint = ""

var WeChatServerAddress = ""
var WeChatServerToken = ""
var WeChatAccountQRCodeImageURL = ""

var MessagePusherAddress = ""
var MessagePusherToken = ""

var TurnstileSiteKey = ""
var TurnstileSecretKey = ""

var QuotaForNewUser int64 = 0
var QuotaForInviter int64 = 0
var QuotaForInvitee int64 = 0
var ChannelDisableThreshold = 5.0
var AutomaticDisableChannelEnabled = false
var AutomaticEnableChannelEnabled = false
// QuotaRemindThreshold 低余额提醒阈值（扣费后余额跌破此值时触发邮件+站内通知）
// 单位：quota（1 元 = 500000 quota）；默认 5000000 = ¥10
// 可在 admin「系统设置」里覆盖；老数据库若 options 表已有此 key 则以 DB 值为准
var QuotaRemindThreshold int64 = 5000000
var PreConsumedQuota int64 = 500
var ApproximateTokenEnabled = false
var RetryTimes = 0

var RootUserEmail = env.String("ROOT_USER_EMAIL", "admin@example.com")

var IsMasterNode = os.Getenv("NODE_TYPE") != "slave"

var requestInterval, _ = strconv.Atoi(os.Getenv("POLLING_INTERVAL"))
var RequestInterval = time.Duration(requestInterval) * time.Second

var SyncFrequency = env.Int("SYNC_FREQUENCY", 10*60) // unit is second

var BatchUpdateEnabled = false
var BatchUpdateInterval = env.Int("BATCH_UPDATE_INTERVAL", 5)

var RelayTimeout = env.Int("RELAY_TIMEOUT", 0) // unit is second

var GeminiSafetySetting = env.String("GEMINI_SAFETY_SETTING", "BLOCK_NONE")

var Theme = env.String("THEME", "default")
var ValidThemes = map[string]bool{
	"default": true,
	"berry":   true,
	"air":     true,
}

// All duration's unit is seconds
// Shouldn't larger then RateLimitKeyExpirationDuration
var (
	GlobalApiRateLimitNum            = env.Int("GLOBAL_API_RATE_LIMIT", 480)
	GlobalApiRateLimitDuration int64 = 3 * 60

	GlobalWebRateLimitNum            = env.Int("GLOBAL_WEB_RATE_LIMIT", 240)
	GlobalWebRateLimitDuration int64 = 3 * 60

	UploadRateLimitNum            = 10
	UploadRateLimitDuration int64 = 60

	DownloadRateLimitNum            = 10
	DownloadRateLimitDuration int64 = 60

	CriticalRateLimitNum            = 20
	CriticalRateLimitDuration int64 = 20 * 60
)

var RateLimitKeyExpirationDuration = 20 * time.Minute

var EnableMetric = env.Bool("ENABLE_METRIC", false)
var MetricQueueSize = env.Int("METRIC_QUEUE_SIZE", 10)
var MetricSuccessRateThreshold = env.Float64("METRIC_SUCCESS_RATE_THRESHOLD", 0.8)
var MetricSuccessChanSize = env.Int("METRIC_SUCCESS_CHAN_SIZE", 1024)
var MetricFailChanSize = env.Int("METRIC_FAIL_CHAN_SIZE", 128)

var InitialRootToken = os.Getenv("INITIAL_ROOT_TOKEN")

var InitialRootAccessToken = os.Getenv("INITIAL_ROOT_ACCESS_TOKEN")

var GeminiVersion = env.String("GEMINI_VERSION", "v1")

var OnlyOneLogFile = env.Bool("ONLY_ONE_LOG_FILE", false)

var RelayProxy = env.String("RELAY_PROXY", "")
var UserContentRequestProxy = env.String("USER_CONTENT_REQUEST_PROXY", "")
var UserContentRequestTimeout = env.Int("USER_CONTENT_REQUEST_TIMEOUT", 30)

var EnforceIncludeUsage = env.Bool("ENFORCE_INCLUDE_USAGE", false)
var TestPrompt = env.String("TEST_PROMPT", "Output only your specific model name with no additional text.")

// ===== Async task system =====
var (
	EnableTaskSystem        = false
	TaskWorkerInterval      = 5 * time.Second
	TaskWorkerBatchSize     = 50
	TaskTimeoutMinutes      = 10
	TaskRetentionDays       = 30
	// TaskUpstreamHTTPTimeout 是 adaptor.DoRequest / FetchTask 单次 HTTP
	// 请求的读超时。以前默认 30s 是给"异步 submit"设的（apimart submit 秒
	// 级返回 task_id）。Fix ④ 之后 apimart 的 gpt-image-1 / gpt-image-1.5
	// 直接返回内联 b64_json / URL，那时候整个 HTTP 请求要跑到上游把图生完，
	// 30s 会先断开。180s 覆盖 apimart sync 系模型的 p95 实测。
	TaskUpstreamHTTPTimeout = 180 * time.Second
	TaskMaxFetchErrors      = 5
	// sync-mode wait (Fix ③): how long RelayTaskImage blocks polling upstream
	// before falling back to 202 + task_id. 300s 覆盖 apimart 图生图 p95
	// (~65s) + 文生图 p50（apimart 官方 estimated 100s，实测 200-450s 都见
	// 过）；超出仍然给客户端 task_id 让其自主 poll，不 504。
	// 部署侧：nginx proxy_read_timeout 必须 ≥ 320s，否则连接会先被 nginx 断开。
	TaskSyncWaitSeconds         = 300
	TaskSyncPollIntervalSeconds = 2
)

// InitTaskConfig reads ENABLE_TASK_SYSTEM and related env vars.
// Call after env.* package is loaded.
func InitTaskConfig() {
	EnableTaskSystem = env.Bool("ENABLE_TASK_SYSTEM", false)
	TaskWorkerInterval = env.Duration("TASK_WORKER_INTERVAL", 5*time.Second)
	TaskWorkerBatchSize = env.Int("TASK_WORKER_BATCH_SIZE", 50)
	TaskTimeoutMinutes = env.Int("TASK_TIMEOUT_MINUTES", 10)
	TaskRetentionDays = env.Int("TASK_RETENTION_DAYS", 30)
	TaskUpstreamHTTPTimeout = env.Duration("TASK_UPSTREAM_HTTP_TIMEOUT", 180*time.Second)
	TaskMaxFetchErrors = env.Int("TASK_MAX_FETCH_ERRORS", 5)
	TaskSyncWaitSeconds = env.Int("TASK_SYNC_WAIT_SECONDS", 300)
	TaskSyncPollIntervalSeconds = env.Int("TASK_SYNC_POLL_INTERVAL_SECONDS", 2)
}
