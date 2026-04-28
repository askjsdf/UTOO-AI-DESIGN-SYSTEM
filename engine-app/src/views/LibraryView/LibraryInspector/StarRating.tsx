import { useState } from 'react'
import { Star } from 'lucide-react'
import { useLibraryStore } from '../../../store/libraryStore'
import { type LibraryFile } from '../../../services/LibraryFileService'

export default function StarRating({ file }: { file: LibraryFile }) {
  const updateRating = useLibraryStore((s) => s.updateRating)
  const [hoverVal, setHoverVal] = useState(0)
  const value = file.rating

  const handleClick = async (i: number) => {
    const newVal = i === value ? 0 : i  // 点击已选值 = 清除
    await updateRating(file, newVal)
  }

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= (hoverVal || value)
        return (
          <button
            key={i}
            onMouseEnter={() => setHoverVal(i)}
            onMouseLeave={() => setHoverVal(0)}
            onClick={() => handleClick(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex' }}
          >
            <Star
              size={13}
              style={{
                color: filled ? '#D4AF37' : '#2a2a2a',
                fill: filled ? '#D4AF37' : 'none',
                transition: 'color 0.1s, fill 0.1s',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}
