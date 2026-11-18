import { useState, type FormEvent } from 'react'
import './App.css'

function App() {
  const [barcode, setBarcode] = useState('')
  const [searchedBarcode, setSearchedBarcode] = useState('')
  const [product, setProduct] = useState<PosProduct>()
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  async function findProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const code = barcode.trim()
    if (!code) {
      setError('Barcode enter karein.')
      setProduct(undefined)
      setSearchedBarcode('')
      return
    }

    setIsSearching(true)
    setError('')
    setProduct(undefined)
    setSearchedBarcode(code)

    try {
      setProduct(await window.api.findByBarcode(code))
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Product search fail ho gayi.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <main className="pos-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">P</div>
        <div>
          <p className="eyebrow">COUNTER 01</p>
          <h1>POS Desk</h1>
        </div>
        <span className="local-badge"><span /> Local database</span>
      </header>

      <section className="lookup-panel" aria-labelledby="lookup-title">
        <p className="eyebrow">QUICK LOOKUP</p>
        <h2 id="lookup-title">Product dhoondein</h2>
        <p className="intro">Barcode scan karein ya code type karke Enter dabayein.</p>

        <form className="lookup-form" onSubmit={findProduct}>
          <label htmlFor="barcode">Product barcode</label>
          <div className="input-row">
            <input
              autoFocus
              id="barcode"
              inputMode="text"
              autoComplete="off"
              placeholder="Misal: 123456"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        <div className="result-area" aria-live="polite">
          {error && <p className="notice error">{error}</p>}
          {!error && product && (
            <article className="product-card">
              <div>
                <p className="eyebrow">PRODUCT FOUND</p>
                <h3>{product.name}</h3>
                <p className="product-barcode">{product.barcode}</p>
              </div>
              <div className="product-meta">
                <span>Price</span>
                <strong>{product.price.toFixed(2)}</strong>
                <span>Stock: {product.stock}</span>
              </div>
            </article>
          )}
          {!error && searchedBarcode && !isSearching && !product && (
            <p className="notice">Barcode “{searchedBarcode}” ka product database mein nahi mila.</p>
          )}
        </div>
      </section>

      <footer>Product data is stored on this device.</footer>
    </main>
  )
}

export default App
