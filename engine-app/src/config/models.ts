// 所有 Gemini 模型 ID 集中管理，不散落在业务代码中
export const MODELS = {
  TEXT: {
    PRO:        'gemini-3.1-pro-preview',
    FLASH:      'gemini-3-flash-preview',
    FLASH_LITE: 'gemini-3.1-flash-lite-preview',
  },
  IMAGE: {
    PRO:   'gemini-3-pro-image-preview',   // Nano Banana Pro
    FLASH: 'gemini-3.1-flash-image-preview', // Nano Banana 2
  }
} as const

export const DEFAULT_IMAGE_OPTIONS = {
  aspectRatio: '16:9' as const,
  imageSize: '1K' as const,   // 验证阶段先用 1K，通过后升 4K
}
