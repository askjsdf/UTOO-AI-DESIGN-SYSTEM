import { useEffect, useRef, useState } from 'react'

interface SaveDialogProps {
  defaultName?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function SaveDialog({ defaultName = '', onConfirm, onCancel }: SaveDialogProps) {
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    // 遮罩层
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '20px 24px',
        width: 320,
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 14 }}>
          保存工作流
        </div>

        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') handleConfirm()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="输入工作流名称"
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 13,
            color: '#e0e0e0',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              color: '#888',
            }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!name.trim()}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
              background: name.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
              border: 'none',
              color: name.trim() ? '#000' : '#555',
              fontWeight: 500,
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
