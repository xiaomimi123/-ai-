package payment

import "strings"

// NormalizePublicKeyPEM 把支付宝后台拷出来的裸 base64 公钥包成 PEM 格式
// 兼容已经是 PEM 格式的输入（直接返回 trim 后的原值）
//
// 支付宝/微信/OAuth 后台拷出来的公钥常常没有 BEGIN/END PEM 头 + 没换行，
// go-pay 的 client.AutoVerifySign 和 alipay.VerifySign 都严格要求 PEM 格式，
// 否则 pem.Decode 直接返回 nil → "verification error"。
func NormalizePublicKeyPEM(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "BEGIN PUBLIC KEY") || strings.Contains(raw, "BEGIN RSA PUBLIC KEY") {
		return raw
	}
	return wrapBase64PEM(stripWhitespace(raw), "PUBLIC KEY")
}

// NormalizePrivateKeyPEM 同上，处理 PKCS#1 / PKCS#8 私钥
func NormalizePrivateKeyPEM(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.Contains(raw, "BEGIN PRIVATE KEY") || strings.Contains(raw, "BEGIN RSA PRIVATE KEY") {
		return raw
	}
	// 默认 PKCS#8（支付宝开放平台密钥工具默认输出 PKCS#8）
	return wrapBase64PEM(stripWhitespace(raw), "PRIVATE KEY")
}

func stripWhitespace(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func wrapBase64PEM(b64, label string) string {
	var b strings.Builder
	b.WriteString("-----BEGIN ")
	b.WriteString(label)
	b.WriteString("-----\n")
	for i := 0; i < len(b64); i += 64 {
		end := i + 64
		if end > len(b64) {
			end = len(b64)
		}
		b.WriteString(b64[i:end])
		b.WriteString("\n")
	}
	b.WriteString("-----END ")
	b.WriteString(label)
	b.WriteString("-----\n")
	return b.String()
}
