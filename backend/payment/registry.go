package payment

import "sync"

var (
	mu        sync.RWMutex
	providers = map[string]Provider{}
)

// Register 注册一个支付渠道。在各 provider 包的 init() 中调用。
func Register(p Provider) {
	mu.Lock()
	defer mu.Unlock()
	providers[p.Name()] = p
}

// Get 按名取渠道。
func Get(name string) (Provider, bool) {
	mu.RLock()
	defer mu.RUnlock()
	p, ok := providers[name]
	return p, ok
}

// All 返回所有已注册渠道。
func All() []Provider {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]Provider, 0, len(providers))
	for _, p := range providers {
		out = append(out, p)
	}
	return out
}

// AnyConfigured 是否有任一渠道已配置好商户参数。
// 全部未配置时，前台应隐藏在线充值入口，只保留兑换码充值。
// 这是新部署的开箱默认状态——没有支付账号的人也能正常用起来。
func AnyConfigured() bool {
	for _, p := range All() {
		if p.Configured("") {
			return true
		}
	}
	return false
}
