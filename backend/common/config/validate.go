package config

import (
	"fmt"
	"os"
	"strings"
)

// placeholderPrefix 是 .env.example 里所有待填值的统一前缀。
// 带着它启动说明用户直接复制了模板没有改，必须拦下来——
// 否则会出现"服务起来了但 session 全员共享同一个 secret"这类难以诊断的问题。
const placeholderPrefix = "CHANGE_ME_"

// minSessionSecretLen 是 SESSION_SECRET 的最小长度。
// 推荐用 openssl rand -base64 32 生成。
const minSessionSecretLen = 16

// Validate 在服务启动时校验部署层必填环境变量。
// 返回非 nil 时调用方应打印错误并退出，不要继续启动。
func Validate() error {
	var problems []string

	secret := os.Getenv("SESSION_SECRET")
	switch {
	case secret == "":
		problems = append(problems, "SESSION_SECRET 未设置。请在 .env 中填写，可用 `openssl rand -base64 32` 生成")
	case strings.HasPrefix(secret, placeholderPrefix):
		problems = append(problems, "SESSION_SECRET 仍是 .env.example 的占位符，请改成真实随机值（openssl rand -base64 32）")
	case len(secret) < minSessionSecretLen:
		problems = append(problems, fmt.Sprintf("SESSION_SECRET 太短（%d 字符），至少需要 %d 字符", len(secret), minSessionSecretLen))
	}

	dsn := os.Getenv("SQL_DSN")
	switch {
	case dsn == "":
		problems = append(problems, "SQL_DSN 未设置。docker compose 部署下它由 compose 拼装，请检查 .env 的 MYSQL_PASSWORD 是否已填")
	case strings.Contains(dsn, placeholderPrefix):
		problems = append(problems, "SQL_DSN 中含占位符（通常是 MYSQL_PASSWORD 没改），请填写真实数据库密码")
	}

	if len(problems) == 0 {
		return nil
	}
	return fmt.Errorf("配置自检未通过：\n  - %s", strings.Join(problems, "\n  - "))
}

// DSNWarnings 返回 DSN 的非致命问题。这些不阻止启动，但会导致中文乱码
// 或时间字段解析异常，值得在日志里显眼提示。
func DSNWarnings() []string {
	dsn := os.Getenv("SQL_DSN")
	if dsn == "" || !strings.Contains(dsn, "@tcp(") {
		return nil
	}
	var warns []string
	if !strings.Contains(dsn, "charset=utf8mb4") {
		warns = append(warns, "SQL_DSN 缺少 charset=utf8mb4，中文与 emoji 会乱码")
	}
	if !strings.Contains(dsn, "parseTime=True") {
		warns = append(warns, "SQL_DSN 缺少 parseTime=True，时间字段可能解析失败")
	}
	if !strings.Contains(dsn, "loc=Local") {
		warns = append(warns, "SQL_DSN 缺少 loc=Local，时间会按 UTC 解读")
	}
	return warns
}
