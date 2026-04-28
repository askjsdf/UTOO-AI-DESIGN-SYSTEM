import { useState, useEffect, useMemo } from 'react'
import { useLibraryStore } from '../../../store/libraryStore'
import { type LibraryFile } from '../../../services/LibraryFileService'

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export default function NoteEditor({ file }: { file: LibraryFile }) {
  const updateNote = useLibraryStore((s) => s.updateNote)
  const [text, setText] = useState(file.note ?? '')

  // 文件切换时同步
  useEffect(() => { setText(file.note ?? '') }, [file.name, file.folderPath.join('/')])

  const debouncedSave = useMemo(
    () => debounce((t: string) => updateNote(file, t), 500),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file.name, file.folderPath.join('/')]
  )

  return (
    <textarea
      value={text}
      onChange={(e) => { setText(e.target.value); debouncedSave(e.target.value) }}
      placeholder="添加备注…"
      rows={3}
      style={{
        width: '100%', fontSize: 11, padding: '6px 8px', borderRadius: 5,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        color: '#888', resize: 'none', outline: 'none',
        fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box',
        transition: 'border-color 0.15s',
      }}
      onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.18)' }}
      onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.07)' }}
    />
  )
}
