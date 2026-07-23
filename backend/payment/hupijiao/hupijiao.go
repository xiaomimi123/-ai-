package hupijiao

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/logger"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/payment"
	"gorm.io/gorm"
)

// 虎皮椒下单接口默认网关（管理员没填时使用）
const defaultGateway = "https://api.xunhupay.com"

// 独立 http client，10s 超时防挂住支付创建接口
var httpClient = &http.Client{Timeout: 10 * time.Second}

type Provider struct{}

func init() {
	payment.Register(&Provider{})
}

func (p *Provider) Name() string { return "hupijiao" }

func (p *Provider) Configured(payType string) bool {
	if payType != "" {
		_, appid, secret, enabled := model.GetHupijiaoChannel(payType)
		return enabled && appid != "" && secret != ""
	}
	for _, t := range []string{"alipay", "wxpay"} {
		if p.Configured(t) {
			return true
		}
	}
	return false
}

func (p *Provider) SuccessResponse() string { return "success" }
func (p *Provider) FailResponse() string    { return "fail" }

// CreatePayment 下单：POST 到 {gateway}/payment/do.html，取 JSON 里的 url 或 url_qrcode。
// 一个 appid/appsecret 对应商户后台配置的单一渠道（微信 or 支付宝），
// req.PayType 用于选取对应的商户配置。
// 迁自 controller.CreatePayOrder 中构造参数、Sign、POST、解析响应的部分，行为不变。
func (p *Provider) CreatePayment(req payment.CreateRequest) (string, error) {
	// 按支付类型读对应渠道配置（支付宝和微信在虎皮椒后台是两个独立应用 / AppID）
	gateway, appid, appsecret, enabled := model.GetHupijiaoChannel(req.PayType)
	if !enabled || appid == "" || appsecret == "" {
		channelName := "支付宝"
		if req.PayType == "wxpay" {
			channelName = "微信"
		}
		return "", fmt.Errorf("%s支付未开通，请联系管理员", channelName)
	}
	if gateway == "" {
		gateway = defaultGateway
	}
	gateway = strings.TrimRight(gateway, "/")

	serverAddr := strings.TrimRight(model.GetOptionValue("ServerAddress"), "/")
	if serverAddr == "" {
		serverAddr = strings.TrimRight(config.ServerAddress, "/")
	}

	siteName := model.GetOptionValue("site_name")
	if siteName == "" {
		siteName = config.SystemName
	}

	// 虎皮椒下单参数
	params := map[string]string{
		"version":        "1.1",
		"lang":           "zh-cn",
		"appid":          appid,
		"trade_order_id": req.OrderNo,
		"total_fee":      fmt.Sprintf("%.2f", req.Amount),
		"title":          req.OrderName,
		"time":           fmt.Sprintf("%d", time.Now().Unix()),
		"notify_url":     req.NotifyURL,
		"return_url":     req.ReturnURL,
		"nonce_str":      Nonce(),
		"wap_name":       siteName,
		"wap_url":        serverAddr,
	}
	// 微信支付始终传 type=WAP（虎皮椒 / dpweixin 微信渠道有些版本不接受空 type 会 502；
	// WAP 模式扫码后支付页是 H5，PC 扫码和移动端都兼容）
	if req.PayType == "wxpay" {
		params["type"] = "WAP"
	}
	params["hash"] = Sign(params, appsecret)

	// POST form 到虎皮椒
	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}
	// 容错：管理员可能填域名（https://api.xxx.com）或完整接口（https://api.xxx.com/payment/do.html）
	endpoint := gateway
	if !strings.HasSuffix(endpoint, "/payment/do.html") {
		endpoint = endpoint + "/payment/do.html"
	}

	// 排查参数差异时需要的日志：打印本次下单请求（hash 脱敏）
	debugParams := make(map[string]string, len(params))
	for k, v := range params {
		if k == "hash" {
			debugParams[k] = "***"
		} else {
			debugParams[k] = v
		}
	}
	logger.SysLog(fmt.Sprintf("hupijiao create order request: endpoint=%s payType=%s params=%v", endpoint, req.PayType, debugParams))

	// 加 User-Agent，避免某些网关拒绝默认 Go-http-client/1.1
	httpReq, _ := http.NewRequest("POST", endpoint, strings.NewReader(form.Encode()))
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("User-Agent", "one-api-platform/1.0")
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		logger.SysError("hupijiao create order: POST failed: " + err.Error())
		return "", fmt.Errorf("支付网关请求失败，请稍后重试")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	bodyStr := string(body)
	bodySnippet := bodyStr
	if len(bodySnippet) > 500 {
		bodySnippet = bodySnippet[:500] + "...(truncated)"
	}

	var apiResp struct {
		OpenId    int             `json:"openid"`
		UrlQrCode string          `json:"url_qrcode"`
		Url       string          `json:"url"`
		ErrCode   json.RawMessage `json:"errcode"` // 虎皮椒 errcode 可能是 int 或 string，用 RawMessage 兼容
		ErrMsg    string          `json:"errmsg"`
		Hash      string          `json:"hash"`
	}
	if err := json.Unmarshal(body, &apiResp); err != nil {
		logger.SysError(fmt.Sprintf("hupijiao create order: parse response failed: %s, httpStatus=%d body=%s", err.Error(), resp.StatusCode, bodyStr))
		// 把原始 body 回传到前端方便排查第三方兼容网关的协议差异
		return "", fmt.Errorf("支付网关返回异常 (HTTP %d): %s", resp.StatusCode, bodySnippet)
	}

	// errcode 兼容 0 / "0" 两种写法
	errCodeStr := strings.Trim(string(apiResp.ErrCode), `"`)
	if errCodeStr != "" && errCodeStr != "0" {
		logger.SysError(fmt.Sprintf("hupijiao create order: errcode=%s errmsg=%s body=%s", errCodeStr, apiResp.ErrMsg, bodyStr))
		msg := apiResp.ErrMsg
		if msg == "" {
			msg = "支付下单失败"
		}
		return "", fmt.Errorf("支付下单失败（错误码 %s）：%s", errCodeStr, msg)
	}

	payUrl := apiResp.Url
	if payUrl == "" {
		payUrl = apiResp.UrlQrCode
	}
	if payUrl == "" {
		logger.SysError("hupijiao create order: empty url, body=" + bodyStr)
		return "", fmt.Errorf("支付网关未返回跳转地址：%s", bodySnippet)
	}

	logger.SysLog(fmt.Sprintf("hupijiao create order: order=%s amount=%.2f type=%s", req.OrderNo, req.Amount, req.PayType))

	return payUrl, nil
}

// VerifyNotify 解析并验签回调。
// 验签 key 按订单的 payment_method 选取——支付宝与微信在虎皮椒后台是
// 两个独立应用，AppSecret 不同。
// 迁自 controller.HupijiaoNotify 中参数收集、选 key、恒时比较验签的部分，行为不变。
func (p *Provider) VerifyNotify(c *gin.Context) (*payment.NotifyResult, error) {
	// 收集所有参数（form 优先、query 兜底）
	params := map[string]string{}
	for k, v := range c.Request.URL.Query() {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}
	_ = c.Request.ParseForm()
	for k, v := range c.Request.PostForm {
		if len(v) > 0 {
			params[k] = v[0]
		}
	}

	orderNo := params["trade_order_id"]
	tradeNo := params["transaction_id"]
	if tradeNo == "" {
		tradeNo = params["open_order_id"]
	}
	totalFee := params["total_fee"]
	status := params["status"]
	hash := params["hash"]

	// 按订单的 payment_method 选验签 key（支付宝、微信两个渠道的 AppSecret 不一样）
	// 先读订单，再选 key；订单不存在时两套 key 都试一下（兜底历史订单）
	var orderForSign model.Order
	var payType string
	if orderNo != "" {
		if err := model.DB.Select("id", "order_no", "payment_method").Where("order_no = ?", orderNo).First(&orderForSign).Error; err == nil {
			payType = orderForSign.PaymentMethod
		}
	}
	_, _, appsecret, _ := model.GetHupijiaoChannel(payType)
	if appsecret == "" {
		logger.SysError("hupijiao notify: AppSecret not configured for payType=" + payType)
		return nil, fmt.Errorf("AppSecret not configured for payType=%s", payType)
	}

	expected := Sign(params, appsecret)
	// 恒时比较防 timing attack（同时用 ToLower 容忍大小写差异）
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(expected)), []byte(strings.ToLower(hash))) != 1 {
		logger.SysError(fmt.Sprintf("hupijiao notify: hash verify failed, order=%s trade=%s amount=%s expect=%s got=%s",
			orderNo, tradeNo, totalFee, expected, hash))
		if orderNo != "" {
			model.DB.Model(&model.Order{}).Where("order_no = ? AND status = 0", orderNo).
				Update("remark", gorm.Expr("CONCAT(IFNULL(remark, ''), ?)",
					fmt.Sprintf(" | [验签失败 %s] trade=%s amount=%s", time.Now().Format("01-02 15:04"), tradeNo, totalFee)))
		}
		return nil, fmt.Errorf("hash verify failed for order=%s", orderNo)
	}

	logger.SysLog(fmt.Sprintf("hupijiao notify: order=%s status=%s trade=%s amount=%s (sign verified)", orderNo, status, tradeNo, totalFee))

	// 虎皮椒支付成功状态码为 OD
	paidAmount, _ := strconv.ParseFloat(totalFee, 64)
	return &payment.NotifyResult{
		OrderNo:    orderNo,
		TradeNo:    tradeNo,
		PaidAmount: paidAmount,
		Paid:       status == "OD",
	}, nil
}
