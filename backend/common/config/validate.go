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

	// SQL_DSN 为空是合法状态：One API 原生支持不设 SQL_DSN 时自动回退到 SQLite
	// （见 model.openSQLite()），这是开源项目最低摩擦的部署路径，不应拦截启动。
	// 只有非空的 DSN 才需要检查是否还残留占位符。
	dsn := os.Getenv("SQL_DSN")
	if dsn != "" && strings.Contains(dsn, placeholderPrefix) {
		problems = append(problems, "SQL_DSN 中含占位符（通常是 MYSQL_PASSWORD 没改），请填写真实数据库密码")
	}

	if len(problems) == 0 {
		return nil
	}
	return fmt.Errorf("配置自检未通过：\n  - %s", strings.Join(problems, "\n  - "))
}

// DSNWarnings 返回 DSN 相关的非致命提示。这些不阻止启动：
// 一部分是"配置了 MySQL 但参数不全"会导致中文乱码或时间字段解析异常，
// 另一部分是"根本没配置 MySQL"——提醒部署者这是不是他想要的。
func DSNWarnings() []string {
	dsn := os.Getenv("SQL_DSN")
	if dsn == "" {
		return []string{"未设置 SQL_DSN，将使用 SQLite（数据存于本地文件）。生产环境或多实例部署请配置 MySQL。"}
	}
	if !strings.Contains(dsn, "@tcp(") {
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
