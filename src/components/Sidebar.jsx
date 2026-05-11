import { useState } from 'react';
import {
  LayoutDashboard, Target, Code2, Shield, ChevronLeft, ChevronRight,
  TrendingUp, Zap, Menu, X,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sniper', label: 'Sniper System', icon: Target },
  { id: 'swing', label: 'Intraday Swing', icon: Zap },
  { id: 'pinescript', label: 'Pine Script', icon: Code2 },
  { id: 'risk', label: 'Risk Manager', icon: Shield },
];

export default function Sidebar({ activePage, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      <aside
        className={`
          flex flex-col h-screen sticky top-0 transition-all duration-300 z-50
          ${collapsed ? 'w-16' : 'w-64'}
        `}
        style={{ background: '#0a0e1a', borderRight: '1px solid #1a2444' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid #1a2444' }}>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center glow-gold" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                <TrendingUp size={16} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-amber-400">XAUUSD</div>
                <div className="text-xs text-slate-500">Sniper Pro</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto glow-gold" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
              <TrendingUp size={16} className="text-white" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1 mt-2">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activePage === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm
                  ${active
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }
                `}
              >
                <Icon size={18} className={active ? 'text-amber-400' : ''} />
                {!collapsed && <span className="font-medium">{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Live badge */}
        {!collapsed && (
          <div className="p-4" style={{ borderTop: '1px solid #1a2444' }}>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#0f1629' }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-green-400 font-medium">System Live</span>
              <Zap size={12} className="text-amber-400 ml-auto" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
