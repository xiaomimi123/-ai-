package payment

import "github.com/gin-gonic/gin"

// NotifyResult 是回调解析并**验签通过**后的结果。
// 注意：返回非 nil 的 NotifyResult 即表示签名已验证通过——
// 实现者不得在验签失败时返回结果，必须返回 error。
type NotifyResult struct {
	// OrderNo 商户订单号
	OrderNo string
	// TradeNo 支付平台流水号
	TradeNo string
	// PaidAmount 实付金额（元）。controller 会与订单金额比对，防篡改。
	PaidAmount float64
	// Paid 是否为"支付成功"终态。非成功终态（如待支付、已关闭）时为 false，
	// controller 会直接回 SuccessResponse 让平台停止重推，但不加余额。
	Paid bool
}

// CreateRequest 是发起支付所需的信息。
type CreateRequest struct {
	OrderNo   string
	Amount    float64
	OrderName string
	PayType   string // alipay / wxpay
	NotifyURL string
	ReturnURL string
}

// Provider 是支付渠道的接入点。
//
// 设计意图：把**验签**放在接口的必经路径上（VerifyNotify），
// 而订单幂等、金额比对、加余额、佣金分发、站内通知全部留在 controller 统一处理。
// 这样新增一个支付渠道时，实现者不可能"忘记验签"，也不可能绕过金额校验。
type Provider interface {
	// Name 返回渠道标识，用于路由 /pay/notify/:provider
	Name() string

	// Configured 报告指定支付类型的商户参数是否齐备。
	// payType 为空字符串时表示"任意类型是否可用"。
	Configured(payType string) bool

	// CreatePayment 向支付平台下单，返回供前端跳转的支付链接或二维码地址。
	CreatePayment(req CreateRequest) (payURL string, err error)

	// VerifyNotify 解析回调并验签。验签失败必须返回 error，不得返回结果。
	VerifyNotify(c *gin.Context) (*NotifyResult, error)

	// SuccessResponse 是回调成功时应返回给支付平台的响应体。
	// 各家要求不同：虎皮椒要求纯文本 "success"，返回 JSON 会被判定失败并无限重推。
	SuccessResponse() string

	// FailResponse 是回调处理失败时的响应体。
	FailResponse() string
}
