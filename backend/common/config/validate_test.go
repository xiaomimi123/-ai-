package config

import (
	"os"
	"strings"
	"testing"
)

func withEnv(t *testing.T, kv map[string]string, fn func()) {
	t.Helper()
	old := map[string]string{}
	for k, v := range kv {
		old[k] = os.Getenv(k)
		os.Setenv(k, v)
	}
	defer func() {
		for k, v := range old {
			if v == "" {
				os.Unsetenv(k)
			} else {
				os.Setenv(k, v)
			}
		}
	}()
	fn()
}

func TestValidateRejectsPlaceholder(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "CHANGE_ME_SESSION_SECRET",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi",
	}, func() {
		err := Validate()
		if err == nil {
			t.Fatal("占位符 SESSION_SECRET 应该被拒绝，但 Validate 返回 nil")
		}
		if !strings.Contains(err.Error(), "SESSION_SECRET") {
			t.Fatalf("错误信息应指明是哪个变量，实际: %v", err)
		}
	})
}

func TestValidateRejectsShortSecret(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "short",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi",
	}, func() {
		if err := Validate(); err == nil {
			t.Fatal("过短的 SESSION_SECRET 应该被拒绝")
		}
	})
}

func TestValidateRejectsMissingDSN(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "0123456789abcdef0123456789abcdef",
		"SQL_DSN":        "",
	}, func() {
		err := Validate()
		if err == nil {
			t.Fatal("缺失 SQL_DSN 应该被拒绝")
		}
		if !strings.Contains(err.Error(), "SQL_DSN") {
			t.Fatalf("错误信息应指明 SQL_DSN，实际: %v", err)
		}
	})
}

func TestValidateAcceptsValid(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "0123456789abcdef0123456789abcdef",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi?charset=utf8mb4&parseTime=True&loc=Local",
	}, func() {
		if err := Validate(); err != nil {
			t.Fatalf("合法配置不应报错，实际: %v", err)
		}
	})
}

func TestValidateWarnsOnMissingUtf8mb4(t *testing.T) {
	withEnv(t, map[string]string{
		"SESSION_SECRET": "0123456789abcdef0123456789abcdef",
		"SQL_DSN":        "root:pw@tcp(mysql:3306)/oneapi",
	}, func() {
		if got := DSNWarnings(); len(got) == 0 {
			t.Fatal("缺 charset=utf8mb4 的 DSN 应产生警告")
		}
	})
}
