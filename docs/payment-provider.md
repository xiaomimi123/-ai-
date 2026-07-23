# 接入支付渠道

## 1. 默认状态

新部署开箱即未配置任何支付渠道。此时：

- 用户前台只显示**兑换码**充值入口，在线充值（支付宝/微信）入口自动隐藏
  （`payment.AnyConfigured()` 返回 `false` 时前端隐藏该入口）。
- 管理员可以在后台「订单管理」里手动为用户补单加余额（`AdminManualTopup` / `AdminCompleteOrder`），
  不依赖任何支付渠道。

这是刻意设计的开箱默认状态：没有支付账号的人也能正常把平台跑起来，只是暂时没有在线自助充值。

## 2. 启用虎皮椒

项目内置的支付渠道是[虎皮椒](https://www.xunhupay.com/)（`payment/hupijiao`），支付宝和微信是它后台
两个独立的商户应用（各自的 AppID / AppSecret）。去管理后台「支付设置」分别填：

- **支付宝渠道**：网关地址（留空则用官方默认 `https://api.xunhupay.com`）、商户 PID（`appid`）、
  商户密钥（`appsecret`，保存后不会回传显示，留空表示不改）。
- **微信渠道**：同上三项，独立配置（虎皮椒后台通常是另一个应用）。

**回调 URL 统一填**：

```
<你的站点>/api/lingjing/pay/notify/hupijiao
```

例如站点是 `https://example.com`，回调 URL 就是 `https://example.com/api/lingjing/pay/notify/hupijiao`。
如果配置了独立 API 子域名（`PUBLIC_API_BASE_URL` / 见 [deployment.md](deployment.md#5-放在-cdn-或外层反代后面)），
用那个子域名替换即可，路径不变。

## 3. 接入新渠道

新增一个渠道只需要实现 `payment.Provider` 接口。以下是接口全文（`backend/payment/provider.go`）：

```go
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
```

逐个方法的契约：

- **`Name()`** —— 渠道标识，只能是 URL 路径安全的字符串（会直接拼进 `/pay/notify/:provider`）。
- **`Configured(payType)`** —— 商户参数是否齐备。`payType` 为空串时表示"任意一种支付方式是否可用"，
  影响前台是否显示在线充值入口（`payment.AnyConfigured()` 遍历所有已注册渠道调用 `Configured("")`）。
- **`CreatePayment(req)`** —— 向支付平台下单，返回跳转链接或二维码地址。`req.NotifyURL` /
  `req.ReturnURL` 由 controller 拼好传入，不需要自己拼。
- **`VerifyNotify(c)`** —— **必须验签**。验签失败必须返回 `error`，**不得**返回非 nil 的
  `*NotifyResult`——`NotifyResult` 非空即代表"签名已验证通过"，这是整个安全模型的前提。
  任何人都能对着回调地址 POST 数据，不验签就处理等于允许任何人伪造支付成功刷余额。
- **`SuccessResponse()` / `FailResponse()`** —— 回调处理完之后要返回给支付平台的响应体，**各家要求不同**，
  返回错了轻则平台无限重推回调，重则被判定异常商户。虎皮椒是纯文本 `"success"` / `"fail"`（`Content-Type`
  不重要，内容必须精确匹配）；接入新渠道前请查它的官方文档确认期望的响应格式（纯文本 / 特定 JSON 结构 /
  特定 HTTP 状态码）。

**订单幂等、金额比对、加余额、佣金分发、站内通知都由 `controller.PayNotify` 统一处理**
（`backend/controller/lingjing_pay.go`），实现者不需要、也不应该在 `VerifyNotify` 里自己做这些事——
这是这套接口刻意的职责划分：验签是渠道特有的，其余是所有渠道共用的业务逻辑，写错了容易出现
重复加款、并发双倍加款、金额被篡改仍通过等问题。

## 4. 注册方式

在自己的 provider 包的 `init()` 里注册：

```go
// package yourprovider

func init() {
	payment.Register(&Provider{})
}
```

然后在会被编译进最终二进制的地方加一行**空导入**（触发 `init()` 执行）。目前 `hupijiao` 是在
`backend/controller/lingjing_pay.go` 里这样引入的：

```go
_ "github.com/songquanpeng/one-api/payment/hupijiao" // 注册 hupijiao provider（init 中 payment.Register）
```

新渠道同理，在 `backend/controller`（或 `backend/main.go`）里加一行 `_ "github.com/songquanpeng/one-api/payment/yourprovider"`。

## 5. 回调路由

新渠道注册后，回调路由是**自动**的：`backend/router/lingjing-router.go` 用通配路由
`/api/lingjing/pay/notify/:provider` 统一接收，`controller.PayNotify` 按 URL 里的 `:provider`
段调用 `payment.Get(name)` 找到对应实现——新渠道不需要改路由代码，注册后自动获得
`/api/lingjing/pay/notify/<你的 Name()>`。

**但下单入口目前是单渠道硬编码的**：`CreatePayOrder`（用户前台点"充值"时调的接口）目前固定用
`payment.Get("hupijiao")`（`backend/controller/lingjing_pay.go` 里的 `const providerName = "hupijiao"`）。
也就是说，新渠道注册后**回调能收到、但用户在前台还下不了这个渠道的单**——要让新渠道真正可选，
还需要把这个常量改造成可配置（比如按管理员在后台选择的"当前渠道"动态取），这部分目前还没做，
接入新渠道时请一并处理，否则新 Provider 只是"能被回调路由到"但永远不会被调用到 `CreatePayment`。
