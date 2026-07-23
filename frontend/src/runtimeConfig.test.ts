import { describe, it, expect } from 'vitest'
import { readRuntimeConfig, displayHost } from './runtimeConfig'

describe('readRuntimeConfig', () => {
  it('优先取 window.__CONFIG__', () => {
    const cfg = readRuntimeConfig(
      { __CONFIG__: { apiBaseUrl: 'https://api.example.com', siteName: '我的站' } },
      { VITE_API_BASE_URL: 'https://dev.example.com' }
    )
    expect(cfg.apiBaseUrl).toBe('https://api.example.com')
    expect(cfg.siteName).toBe('我的站')
  })

  it('window.__CONFIG__ 缺失时回落到 Vite env（开发态）', () => {
    const cfg = readRuntimeConfig({}, { VITE_API_BASE_URL: 'https://dev.example.com' })
    expect(cfg.apiBaseUrl).toBe('https://dev.example.com')
  })

  it('两者都没有时 apiBaseUrl 为空字符串（走同源 /api）', () => {
    const cfg = readRuntimeConfig({}, {})
    expect(cfg.apiBaseUrl).toBe('')
  })

  it('去掉 apiBaseUrl 结尾斜杠，避免拼出双斜杠', () => {
    const cfg = readRuntimeConfig({ __CONFIG__: { apiBaseUrl: 'https://api.example.com/' } }, {})
    expect(cfg.apiBaseUrl).toBe('https://api.example.com')
  })

  it('siteName 缺失时给默认值而不是 undefined', () => {
    const cfg = readRuntimeConfig({}, {})
    expect(cfg.siteName).toBe('AI API Platform')
    expect(cfg.primaryColor).toBe('#2ECC71')
    expect(cfg.footerText).toBe('')
  })

  it('footerText 形如 markdown 加粗（双下划线包裹）应原样保留，不当作占位符清空', () => {
    const cfg = readRuntimeConfig(
      { __CONFIG__: { footerText: '__本站由 XX 提供技术支持__' } },
      {}
    )
    expect(cfg.footerText).toBe('__本站由 XX 提供技术支持__')
  })
})

describe('displayHost', () => {
  it('合法 URL 取到 host', () => {
    expect(displayHost('https://api.example.com')).toBe('api.example.com')
  })

  it('裸域名（漏填 scheme）解析失败时回落原字符串，而不是抛异常', () => {
    expect(displayHost('api.example.com')).toBe('api.example.com')
  })

  it('空字符串不抛异常', () => {
    expect(() => displayHost('')).not.toThrow()
    expect(displayHost('')).toBe('')
  })
})
