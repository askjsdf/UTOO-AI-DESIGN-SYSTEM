import { NavLink } from 'react-router-dom'
import { Workflow, LayoutDashboard, ListTodo, Settings, BarChart2, Library } from 'lucide-react'
import { useAppStore } from '../store/appStore'

const NAV_ITEMS_LEFT = [
  { to: '/canvas',   icon: LayoutDashboard, label: '方案画布' },
  { to: '/workflow', icon: Workflow,        label: '工作流' },
  { to: '/library',  icon: Library,         label: '视觉资产库' },
  { to: '/batch',    icon: ListTodo,        label: '任务进度' },
]

function NavItem({ to, icon: Icon, label, badge }: {
  to: string; icon: React.ElementType; label: string; badge?: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
      {badge}
    </NavLink>
  )
}

export default function NavigationBar() {
  const { isTaskRunning, tasks } = useAppStore()
  const queuedCount = tasks.filter((t) => t.status === 'queued').length

  return (
    <nav
      style={{
        height: 48,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 8px',
        flexShrink: 0,
      }}
    >
      {/* 左侧：主导航 */}
      <div className="flex items-center gap-1">
        {NAV_ITEMS_LEFT.map(({ to, icon, label }) => (
          <NavItem
            key={to}
            to={to}
            icon={icon}
            label={label}
            badge={
              to === '/batch' ? (
                isTaskRunning
                  ? <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  : queuedCount > 0
                    ? <span style={{
                        minWidth: 16, height: 16, borderRadius: 8, background: 'rgba(99,102,241,0.3)',
                        color: '#818cf8', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                      }}>{queuedCount}</span>
                    : null
              ) : null
            }
          />
        ))}

        {/* 运行状态提示 */}
        {isTaskRunning && (
          <div
            className="flex items-center gap-3 px-4 py-1.5 rounded-full text-xs ml-2"
            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span>工作流执行中</span>
            {queuedCount > 0 && <span className="opacity-60">+{queuedCount} 排队</span>}
          </div>
        )}
      </div>

      {/* 中间：Logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}>
        <img src="/logo.svg" alt="UTOO" style={{ height: 32, display: 'block' }} />
      </div>

      {/* 右侧：用量统计 + 设置 */}
      <div className="flex items-center justify-end gap-1">
        <NavItem to="/usage" icon={BarChart2} label="用量统计" />
        <NavItem to="/settings" icon={Settings} label="设置" />
      </div>
    </nav>
  )
}
