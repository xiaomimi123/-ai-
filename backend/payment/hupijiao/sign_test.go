package hupijiao

import "testing"

func TestSign(t *testing.T) {
	// 虎皮椒签名规则：参数按 key 字典序拼成 k=v&k=v，末尾拼 secret 后 md5。
	// hash 字段本身不参与签名；空值参数跳过。
	params := map[string]string{
		"version":        "1.1",
		"appid":          "test_appid",
		"trade_order_id": "LJ1700000000123456",
		"total_fee":      "10.00",
		"hash":           "should_be_ignored",
		"empty_field":    "",
	}
	got := Sign(params, "test_secret")

	if len(got) != 32 {
		t.Fatalf("md5 结果应为 32 位十六进制，实际 %d 位: %q", len(got), got)
	}
	// hash 字段必须不参与签名：改掉它签名不应变化
	params["hash"] = "different_value"
	if again := Sign(params, "test_secret"); again != got {
		t.Error("hash 字段不应参与签名计算")
	}
	// 空值字段必须跳过：删掉空值字段签名不应变化
	delete(params, "empty_field")
	if again := Sign(params, "test_secret"); again != got {
		t.Error("空值参数不应参与签名计算")
	}
	// 换 secret 签名必须变
	if other := Sign(params, "other_secret"); other == got {
		t.Error("不同 secret 应产生不同签名")
	}
}
