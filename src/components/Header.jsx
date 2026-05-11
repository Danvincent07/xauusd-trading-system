import { useState, useEffect } from 'react';
import { Bell, RefreshCw, Clock } from 'lucide-react';

const pageTitles = {
  dashboard: { title: 'Trading Dashboard', sub: 'Real-time XAUUSD Analysis' },
  sniper: { title: 'Sniper Entry System', sub: 'Step-by-step trade qualification' },
  pinescript: { title: 'Pine Script Indicator', sub: 'TradingView indicator code' },
  risk: { title: 'Risk Manager', sub: 'Position sizing & risk control' },
};

export default function Header({ activePage, livePrice, priceChange }) {
  const [time, setTime] = useState(new Date());
  const [alerts, setAlerts] = useState(2);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
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
      </div>
    </header>
  );
}
