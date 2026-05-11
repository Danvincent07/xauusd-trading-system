import { useState, useEffect, useRef } from 'react';
import { Bell, RefreshCw, Clock, User, Settings, BarChart2, Shield, LogOut, ChevronDown } from 'lucide-react';

const pageTitles = {
  dashboard: { title: 'Trading Dashboard', sub: 'Real-time XAUUSD Analysis' },
  sniper: { title: 'Sniper Entry System', sub: 'Step-by-step trade qualification' },
  pinescript: { title: 'Pine Script Indicator', sub: 'TradingView indicator code' },
  risk: { title: 'Risk Manager', sub: 'Position sizing & risk control' },
};

const PROFILE = {
  name: 'Dan Vincent',
  role: 'Gold Trader',
  plan: 'Pro',
};

export default function Header({ activePage, livePrice, priceChange }) {
  const [time, setTime] = useState(new Date());
  const [alerts, setAlerts] = useState(2);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const { title, sub } = pageTitles[activePage] || pageTitles.dashboard;
  const isPositive = priceChange >= 0;

  return (
    <header
      className="flex items-center justify-between px-6 py-3 sticky top-0 z-40"
      style={{ background: '#0a0e1a', borderBottom: '1px solid #1a2444' }}
    >
      {/* Page title */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">{title}</h1>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>

      {/* Live price pill */}
      <div className="hidden md:flex items-center gap-4">
        <div
          className="flex items-center gap-3 px-4 py-2 rounded-xl"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        >
          <span className="text-amber-400 font-bold text-sm">XAU/USD</span>
          <span className="text-white font-mono font-bold text-base">
            {livePrice?.toFixed(2)}
          </span>
          <span className={`text-xs font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{priceChange?.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-slate-500 text-xs">
          <Clock size={12} />
          <span className="font-mono">{time.toLocaleTimeString()}</span>
        </div>
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors">
          <Bell size={16} />
          {alerts > 0 && (
            <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
              {alerts}
            </span>
          )}
        </button>
        <button
          onClick={() => setAlerts(0)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-amber-400 transition-colors"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-400">
              <User size={13} />
            </div>
            <span className="hidden sm:block text-xs font-semibold">{PROFILE.name}</span>
            <ChevronDown size={11} className={`transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl shadow-2xl z-50 overflow-hidden"
              style={{ background: '#0d1117', border: '1px solid #1a2444' }}
            >
              {/* User info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: '#1a2444' }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/20 text-amber-400">
                    <User size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100">{PROFILE.name}</div>
                    <div className="text-xs text-slate-500">{PROFILE.role}</div>
                  </div>
                  <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-400"
                    style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    {PROFILE.plan}
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {[
                  { icon: BarChart2, label: 'Performance', color: '#22c55e' },
                  { icon: Shield,    label: 'Risk Settings', color: '#3b82f6' },
                  { icon: Settings,  label: 'Settings',      color: '#94a3b8' },
                ].map(({ icon: Icon, label, color }) => (
                  <button key={label}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Icon size={13} style={{ color }} />
                    {label}
                  </button>
                ))}
              </div>

              <div className="border-t py-1" style={{ borderColor: '#1a2444' }}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  onClick={() => setProfileOpen(false)}
                >
                  <LogOut size={13} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
