// 模型定价展示工具
//
// 背景：model_prices 表的 input_price / output_price 字段对不同类型模型语义不同：
//   - 聊天模型（gpt / claude / deepseek 等）：每 1M tokens 的 USD 价格
//   - 图像模型（gpt-image-2 / nano-banana 等，tags 含 "画图"）：每张图的 USD 价格
//
// 数据库 schema 不区分，前端按 tags 检测后渲染正确单位。

/**
 * 是否图像模型（按 tags 检测）。
 * 优先用 tags 而非硬编码 model_id 列表，运营加新图像模型时不用改前端。
 */
const IMAGE_TAGS = new Set(['生图', '画图', '图像', 'image', 'images', '图片', '文生图'])

export function isImageModel(tags?: string | null): boolean {
  if (!tags) return false
  return tags
    .split(',')
    .map(t => t.trim())
    .some(t => IMAGE_TAGS.has(t))
}

export interface PriceDisplayOptions {
  inputPrice: number          // model_prices.input_price (USD)
  outputPrice?: number        // model_prices.output_price (USD)，仅 chat 模型有意义
  tags?: string | null
}

export interface FormattedPrice {
  unit: '张' | 'M tokens'
  /** 列表卡片用的一行简介 */
  briefDisplay: string
  /** 输入价格（含单位）。图像模型即"每张图价格"。 */
  inputDisplay: string
  /** 输出价格（含单位），仅 chat 模型 */
  outputDisplay?: string
}

/**
 * 格式化价格用于展示。
 * - 图像模型：返回 "$0.0060/张"（4 位小数，与文档展示一致）
 * - 聊天模型：返回 "$0.50/M tokens (输入)" / "$1.00/M tokens (输出)"
 */
export function formatPrice(opts: PriceDisplayOptions): FormattedPrice {
  if (isImageModel(opts.tags)) {
    const per = `$${(opts.inputPrice ?? 0).toFixed(4)}/张`
    return {
      unit: '张',
      inputDisplay: per,
      briefDisplay: per,
    }
  }
  const input = `$${(opts.inputPrice ?? 0).toFixed(2)}/M tokens (输入)`
  const output = opts.outputPrice != null
    ? `$${opts.outputPrice.toFixed(2)}/M tokens (输出)`
    : undefined
  return {
    unit: 'M tokens',
    inputDisplay: input,
    outputDisplay: output,
    briefDisplay: opts.outputPrice != null
      ? `输入 $${(opts.inputPrice ?? 0).toFixed(2)} / 输出 $${opts.outputPrice.toFixed(2)} per M tokens`
      : `$${(opts.inputPrice ?? 0).toFixed(2)}/M tokens`,
  }
}
