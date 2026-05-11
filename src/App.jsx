import { useState, useEffect } from 'react'
import './index.css'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import SniperSystem from './pages/SniperSystem'
import PineScriptPage from './pages/PineScriptPage'
import RiskManager from './pages/RiskManager'
import IntradaySwing from './pages/IntradaySwing'
import { fetchLiveGoldQuote } from './services/marketData'

function App() {
  const [activePage, setActivePage] = useState('dashboard')
  const [livePrice, setLivePrice] = useState(3320.50)
  const [priceChange, setPriceChange] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])

  useEffect(() => {
    let mounted = true

    const syncQuote = async () => {
      const controller = new AbortController()

      try {
        const quote = await fetchLiveGoldQuote(controller.signal)

        if (!mounted) {
          return
        }

        setLivePrice((previousPrice) => {
          if (Number.isFinite(previousPrice) && previousPrice > 0) {
            const change = ((quote.price - previousPrice) / previousPrice) * 100
            setPriceChange(parseFloat(change.toFixed(2)))
          }

          return parseFloat(quote.price.toFixed(2))
        })

        setLastUpdated(quote.updatedAt)
        setPriceHistory((previousHistory) => {
          const nextPoint = {
            price: parseFloat(quote.price.toFixed(2)),
            timestamp: quote.updatedAt ?? new Date().toISOString(),
          }

          return [...previousHistory.slice(-9999), nextPoint]
        })
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to refresh XAUUSD price', error)
        }
      }

      return () => controller.abort()
    }

    syncQuote()
    const id = setInterval(syncQuote, 1500)

    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0e1a', color: '#e2e8f0' }}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header activePage={activePage} livePrice={livePrice} priceChange={priceChange} />
        <main className="flex-1 overflow-y-auto">
          <div style={{ display: activePage === 'dashboard' ? 'block' : 'none' }}>
            <Dashboard livePrice={livePrice} priceChange={priceChange} lastUpdated={lastUpdated} priceHistory={priceHistory} />
          </div>
          <div style={{ display: activePage === 'sniper' ? 'block' : 'none' }}>
            <SniperSystem livePrice={livePrice} priceChange={priceChange} lastUpdated={lastUpdated} priceHistory={priceHistory} />
          </div>
          <div style={{ display: activePage === 'swing' ? 'block' : 'none' }}>
            <IntradaySwing livePrice={livePrice} priceChange={priceChange} lastUpdated={lastUpdated} priceHistory={priceHistory} />
          </div>
          <div style={{ display: activePage === 'pinescript' ? 'block' : 'none' }}>
            <PineScriptPage />
          </div>
          <div style={{ display: activePage === 'risk' ? 'block' : 'none' }}>
            <RiskManager livePrice={livePrice} priceChange={priceChange} lastUpdated={lastUpdated} priceHistory={priceHistory} />
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
