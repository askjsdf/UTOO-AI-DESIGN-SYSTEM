/**
 * colorExtract — 从图片 Blob 提取主色调
 *
 * 算法：
 * 1. 将图片绘制到 64×64 canvas（降采样减少计算量）
 * 2. 读取所有像素
 * 3. 按 HSL 色相区间分成 20 个桶（18° 一档）
 * 4. 取权重最高的 5 个桶，每桶取平均颜色
 * 5. 返回 HEX 字符串数组
 */

const SAMPLE_SIZE = 64
const NUM_COLORS = 5
const NUM_BUCKETS = 20

function hexFromRgb(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const nr = r / 255, ng = g / 255, nb = b / 255
  const max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === nr) h = ((ng - nb) / d + (ng < nb ? 6 : 0)) / 6
  else if (max === ng) h = ((nb - nr) / d + 2) / 6
  else h = ((nr - ng) / d + 4) / 6
  return [h * 360, s, l]
}

export async function extractDominantColors(blob: Blob): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve([]); return }

        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

        // 分桶：按色相（饱和度低的归入黑白灰桶，不与彩色混)
        type Bucket = { r: number; g: number; b: number; count: number }
        const buckets: Bucket[] = Array.from({ length: NUM_BUCKETS + 1 }, () => ({ r: 0, g: 0, b: 0, count: 0 }))

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
          if (a < 128) continue  // 跳过透明像素

          const [h, s, l] = rgbToHsl(r, g, b)
          // 亮度极高（接近白）或极低（接近黑），或饱和度极低（灰色），归入灰度桶(桶 0)
          const bucketIdx = (s < 0.15 || l < 0.08 || l > 0.92)
            ? 0
            : Math.floor(h / (360 / NUM_BUCKETS)) + 1

          buckets[bucketIdx].r += r
          buckets[bucketIdx].g += g
          buckets[bucketIdx].b += b
          buckets[bucketIdx].count++
        }

        // 按像素数排序，取前 NUM_COLORS 个非空桶
        const sorted = buckets
          .filter((b) => b.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, NUM_COLORS)

        const colors = sorted.map((b) =>
          hexFromRgb(b.r / b.count, b.g / b.count, b.b / b.count)
        )

        resolve(colors)
      } catch {
        resolve([])
      }
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve([]) }
    img.src = url
  })
}

/**
 * 判断两个 HEX 颜色是否相似（用于颜色搜索）
 * 比较 HSL 色相差 + 亮度差，threshold 约 35-40 较为合适
 */
export function isColorSimilar(hex1: string, hex2: string, threshold = 38): boolean {
  const parse = (h: string): [number, number, number] => {
    const n = parseInt(h.replace('#', ''), 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }
  const [r1, g1, b1] = parse(hex1)
  const [r2, g2, b2] = parse(hex2)
  const [h1, s1, l1] = rgbToHsl(r1, g1, b1)
  const [h2, s2, l2] = rgbToHsl(r2, g2, b2)

  // 色相差（环形）
  let dh = Math.abs(h1 - h2)
  if (dh > 180) dh = 360 - dh

  const ds = Math.abs(s1 - s2) * 100
  const dl = Math.abs(l1 - l2) * 100

  return dh < threshold && ds < 40 && dl < 40
}
