package payment

import (
	"fmt"
	"sync"

	"github.com/go-pay/gopay/alipay"
	"github.com/songquanpeng/one-api/model"
)

var (
	alipayClient *alipay.Client
	alipayMu     sync.RWMutex
)

func ResetAlipayClient() {
	alipayMu.Lock()
	defer alipayMu.Unlock()
	alipayClient = nil
}

func GetAlipayClient() (*alipay.Client, error) {
	alipayMu.RLock()
	if alipayClient != nil {
		defer alipayMu.RUnlock()
		return alipayClient, nil
	}
	alipayMu.RUnlock()

	alipayMu.Lock()
	defer alipayMu.Unlock()

	if alipayClient != nil {
		return alipayClient, nil
	}

	enabled := model.GetOptionValue("AlipayEnabled")
	if enabled != "true" {
		return nil, fmt.Errorf("支付宝未启用")
	}

	appID := model.GetOptionValue("AlipayAppID")
	privateKey := NormalizePrivateKeyPEM(model.GetOptionValue("AlipayPrivateKey"))

	if appID == "" || privateKey == "" {
		return nil, fmt.Errorf("支付宝配置不完整")
	}

	client, err := alipay.NewClient(appID, privateKey, true)
	if err != nil {
		return nil, fmt.Errorf("初始化失败: %v", err)
	}

	// 设置公钥用于验签（规范化裸 base64 → PEM，否则 pem.Decode 失败导致验签全挂）
	if pubKey := NormalizePublicKeyPEM(model.GetOptionValue("AlipayPublicKey")); pubKey != "" {
		client.AutoVerifySign([]byte(pubKey))
	}

	client.ReturnUrl = "https://aitoken.homes/topup?pay=success"
	client.NotifyUrl = "https://aitoken.homes/api/lingjing/pay/notify/alipay"
	client.Charset = "utf-8"
	client.SignType = alipay.RSA2

	alipayClient = client
	return alipayClient, nil
}

func IsAlipayConfigured() bool {
	return model.GetOptionValue("AlipayEnabled") == "true" &&
		model.GetOptionValue("AlipayAppID") != "" &&
		model.GetOptionValue("AlipayPrivateKey") != ""
}
