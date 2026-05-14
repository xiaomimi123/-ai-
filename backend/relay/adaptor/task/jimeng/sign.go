package jimeng

import (
	"crypto/hmac"
	"crypto/sha256"
)

// hmacSHA256 returns HMAC-SHA256(key, data) raw bytes (no hex encoding).
func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

// deriveSigningKey derives a Volcengine V4 signing key via AWS-style 4-level HMAC derivation:
//   kDate    = HMAC(secretKey, date)
//   kRegion  = HMAC(kDate, region)
//   kService = HMAC(kRegion, service)
//   kSigning = HMAC(kService, "request")
func deriveSigningKey(secretKey, date, region, service string) []byte {
	kDate := hmacSHA256([]byte(secretKey), []byte(date))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("request"))
	return kSigning
}
