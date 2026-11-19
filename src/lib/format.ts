export function formatMoney(n: number | null | undefined): string {
  const value = Number(n) || 0
  return `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
