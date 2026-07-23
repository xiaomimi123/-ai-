package middleware

import "testing"

func TestParseAllowedOrigins(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{"空字符串", "", []string{}},
		{"单个", "https://a.com", []string{"https://a.com"}},
		{"多个带空格", "https://a.com, https://b.com ", []string{"https://a.com", "https://b.com"}},
		{"忽略空段", "https://a.com,,https://b.com", []string{"https://a.com", "https://b.com"}},
		{"去尾斜杠", "https://a.com/", []string{"https://a.com"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ParseAllowedOrigins(tc.raw)
			if len(got) != len(tc.want) {
				t.Fatalf("长度不符: got %v want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("第 %d 项: got %q want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestOriginAllowed(t *testing.T) {
	allowed := []string{"https://example.com", "*.example.com"}
	cases := []struct {
		origin string
		want   bool
	}{
		{"https://example.com", true},
		{"https://api.example.com", true},
		{"https://admin.example.com", true},
		{"https://evil.com", false},
		{"https://notexample.com", false},
		{"https://localhost.evil.com", false},
	}
	for _, tc := range cases {
		if got := originAllowed(tc.origin, allowed, false); got != tc.want {
			t.Errorf("(allowLocalhost=false) origin %q: got %v want %v", tc.origin, got, tc.want)
		}
		if got := originAllowed(tc.origin, allowed, true); got != tc.want {
			t.Errorf("(allowLocalhost=true) origin %q: got %v want %v", tc.origin, got, tc.want)
		}
	}
}

func TestOriginAllowedLocalhostNonProduction(t *testing.T) {
	allowed := []string{"https://example.com"}
	localhostOrigins := []string{"http://localhost:5173", "http://127.0.0.1:3000"}
	for _, origin := range localhostOrigins {
		if got := originAllowed(origin, allowed, true); !got {
			t.Errorf("非生产环境应放行 %q，实际被拒绝", origin)
		}
	}
}

func TestOriginAllowedLocalhostRejectedInProduction(t *testing.T) {
	allowed := []string{"https://example.com"}
	localhostOrigins := []string{"http://localhost:5173", "http://127.0.0.1:3000"}
	for _, origin := range localhostOrigins {
		if got := originAllowed(origin, allowed, false); got {
			t.Errorf("生产环境不应放行 localhost %q，但被放行了", origin)
		}
	}
	// 生产环境下，显式列进白名单的 origin 仍应放行
	if got := originAllowed("https://example.com", allowed, false); !got {
		t.Error("生产环境下白名单里的 origin 应该放行")
	}
}
