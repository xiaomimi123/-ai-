import { describe, it, expect } from 'vitest'
import { readRuntimeConfig } from './runtimeConfig'

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

  it('entrypoint 未替换的占位符视为未配置', () => {
    const cfg = readRuntimeConfig({ __CONFIG__: { apiBaseUrl: '__PUBLIC_API_BASE_URL__' } }, {})
    expect(cfg.apiBaseUrl).toBe('')
  })

  it('siteName 缺失时给默认值而不是 undefined', () => {
    const cfg = readRuntimeConfig({}, {})
    expect(cfg.siteName).toBe('AI API Platform')
    expect(cfg.primaryColor).toBe('#2ECC71')
    expect(cfg.footerText).toBe('')
  })
})
