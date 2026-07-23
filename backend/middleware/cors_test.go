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
		{"http://localhost:5173", true},
		{"http://127.0.0.1:3000", true},
		{"https://localhost.evil.com", false},
	}
	for _, tc := range cases {
		if got := originAllowed(tc.origin, allowed); got != tc.want {
			t.Errorf("origin %q: got %v want %v", tc.origin, got, tc.want)
		}
	}
}
