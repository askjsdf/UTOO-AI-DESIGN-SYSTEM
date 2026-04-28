import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useAppStore } from '../../../store/appStore'
import { base64ToDataUrl } from '../../../services/FileService'

export default function RunProgressDrawer() {
  const { isProgressDrawerOpen, setProgressDrawerOpen, jobProgress, generatedImages, isRunning } = useAppStore()

  if (!isRunning && generatedImages.length === 0) return null

  return (
    <div
      className="flex-shrink-0 border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-panel)', maxHeight: isProgressDrawerOpen ? 280 : 44, transition: 'max-height 0.2s ease' }}
    >
      {/* 标题栏 */}
      <div
        className="flex items-center gap-3 px-4 cursor-pointer"
        style={{ height: 44 }}
        onClick={() => setProgressDrawerOpen(!isProgressDrawerOpen)}
      >
        {isRunning && (
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
        )}
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
          {isRunning
            ? jobProgress?.step ?? '运行中...'
            : `已完成 ${generatedImages.length} 张图片`}
        </span>

        {/* 进度条 */}
        {jobProgress && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${jobProgress.overallPercent}%`, background: '#3b82f6' }}
              />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {jobProgress.completedImages}/{jobProgress.totalImages}
            </span>
          </div>
        )}

        {isProgressDrawerOpen
          ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          : <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
      </div>

      {/* 展开内容：图片缩略图 */}
      {isProgressDrawerOpen && (
        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 236 }}>
          {generatedImages.length > 0 ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
              {generatedImages.map((img) => (
                <div key={img.id} className="relative group">
                  <img
                    src={base64ToDataUrl(img.filePath)}
                    className="w-full aspect-square object-cover rounded"
                    style={{ border: '1px solid var(--border)' }}
                  />
                  <div
                    className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center"
                    style={{ background: 'rgba(0,0,0,0.6)', fontSize: 9, color: 'rgba(255,255,255,0.7)', borderRadius: '0 0 4px 4px' }}
                  >
                    {img.outputType}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
              图片生成后将在此实时显示
            </p>
          )}
        </div>
      )}
    </div>
  )
}
