// 运行时配置。
//
// 为什么不用 Vite 的 import.meta.env：compose 部署下前端是预构建镜像，
// 编译期注入意味着用户改个站名就得自己 build 镜像，"一条命令起站"就不成立了。
// 所以生产走 window.__CONFIG__（由容器 entrypoint 从环境变量生成 config.js），
// 只有本地 dev 才回落到 Vite env。

export interface RuntimeConfig {
  /** 后端基址。空字符串 = 走同源 /api（由 nginx 反代） */
  apiBaseUrl: string
  siteName: string
  logoUrl: string
  primaryColor: string
  footerText: string
  icpNumber: string
  contactUrl: string
}

const DEFAULTS: RuntimeConfig = {
  apiBaseUrl: '',
  siteName: 'AI API Platform',
  logoUrl: '',
  primaryColor: '#2ECC71',
  footerText: '',
  icpNumber: '',
  contactUrl: '',
}

function clean(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.trim()
}

/** 安全地从 URL 取主机名。解析失败（例如部署者漏填 scheme）时回落到原字符串，
 *  避免因一个配置笔误导致整页崩溃。 */
export function displayHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function readRuntimeConfig(
  win: Record<string, unknown>,
  viteEnv: Record<string, unknown>
): RuntimeConfig {
  const injected = (win.__CONFIG__ ?? {}) as Record<string, unknown>
  const pick = (key: keyof RuntimeConfig, viteKey?: string): string => {
    const fromWindow = clean(injected[key])
    if (fromWindow) return fromWindow
    if (viteKey) {
      const fromVite = clean(viteEnv[viteKey])
      if (fromVite) return fromVite
    }
    return DEFAULTS[key]
  }
  return {
    apiBaseUrl: pick('apiBaseUrl', 'VITE_API_BASE_URL').replace(/\/$/, ''),
    siteName: pick('siteName'),
    logoUrl: pick('logoUrl'),
    primaryColor: pick('primaryColor'),
    footerText: pick('footerText'),
    icpNumber: pick('icpNumber'),
    contactUrl: pick('contactUrl'),
  }
}

export const runtimeConfig: RuntimeConfig = readRuntimeConfig(
  typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {},
  import.meta.env as unknown as Record<string, unknown>
)
