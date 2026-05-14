package jimeng

import (
	"encoding/hex"
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

func TestHmacSHA256(t *testing.T) {
	Convey("hmacSHA256 matches known test vector", t, func() {
		out := hmacSHA256([]byte("key"), []byte("The quick brown fox jumps over the lazy dog"))
		So(hex.EncodeToString(out), ShouldEqual,
			"f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8")
	})
}

func TestDeriveSigningKey(t *testing.T) {
	Convey("deriveSigningKey returns 32-byte HMAC-SHA256 output", t, func() {
		k := deriveSigningKey("AKIDEXAMPLE", "20220101", "cn-north-1", "cv")
		So(k, ShouldNotBeEmpty)
		So(len(k), ShouldEqual, 32)
	})
}
