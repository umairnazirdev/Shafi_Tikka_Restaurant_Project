import { useEffect, useState } from 'react'

type ProductQuantitySelectorProps = {
  quantity: number
  onQuantityChange: (quantity: number) => void
  onAdd: (quantity: number) => void
}

export function ProductQuantitySelector({
  quantity,
  onQuantityChange,
  onAdd,
}: ProductQuantitySelectorProps) {
  const [draftQuantity, setDraftQuantity] = useState(String(quantity))

  useEffect(() => {
    setDraftQuantity(String(quantity))
  }, [quantity])

  function commitQuantity() {
    const parsed = Number.parseInt(draftQuantity, 10)
    const nextQuantity = Number.isFinite(parsed) ? Math.max(1, parsed) : 1
    setDraftQuantity(String(nextQuantity))
    onQuantityChange(nextQuantity)
  }

  return (
    <div
      className="product-add-row"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-primary product-add-button"
        onClick={() => onAdd(Math.max(1, Number.parseInt(draftQuantity, 10) || 1))}
      >
        Add
      </button>
      <div className="product-quantity-selector" aria-label="Selected quantity">
        <button
          type="button"
          onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
          disabled={quantity <= 1}
          aria-label="Decrease quantity"
        >
          -
        </button>
        <input
          type="number"
          min={1}
          step={1}
          value={draftQuantity}
          onChange={(event) => setDraftQuantity(event.target.value)}
          onBlur={commitQuantity}
          aria-label="Quantity"
        />
        <button
          type="button"
          onClick={() => onQuantityChange(quantity + 1)}
          aria-label="Increase quantity"
        >
          +
        </button>
      </div>
    </div>
  )
}
