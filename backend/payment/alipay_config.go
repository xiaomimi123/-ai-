package payment

import (
	"fmt"
	"os"
	"sync"

	"github.com/go-pay/gopay/alipay"
)

var (
	alipayClient *alipay.Client
	alipayOnce   sync.Once
	alipayErr    error
)

const (
	AlipayAppID = "2021006146617774"
	NotifyURL   = "https://aitoken.homes/api/lingjing/pay/notify/alipay"
	ReturnURL   = "https://aitoken.homes/topup?pay=success"
)

func GetAlipayClient() (*alipay.Client, error) {
	alipayOnce.Do(func() {
		privateKey := os.Getenv("ALIPAY_PRIVATE_KEY")
		if privateKey == "" {
			alipayErr = fmt.Errorf("ALIPAY_PRIVATE_KEY 未配置")
			return
		}

		// isProd=true 正式环境
		client, err := alipay.NewClient(AlipayAppID, privateKey, true)
		if err != nil {
			alipayErr = fmt.Errorf("支付宝客户端初始化失败: %v", err)
			return
		}

		// 设置支付宝公钥
		if pubKey := os.Getenv("ALIPAY_PUBLIC_KEY"); pubKey != "" {
			client.SetCertSnByContent(nil, nil, nil) // 非证书模式
		}

		client.SetCharset("utf-8").
			SetSignType(alipay.RSA2).
			SetReturnUrl(ReturnURL).
			SetNotifyUrl(NotifyURL)

		alipayClient = client
	})
	return alipayClient, alipayErr
}

// IsAlipayConfigured 检查支付宝是否已配置
func IsAlipayConfigured() bool {
	return os.Getenv("ALIPAY_PRIVATE_KEY") != ""
}
