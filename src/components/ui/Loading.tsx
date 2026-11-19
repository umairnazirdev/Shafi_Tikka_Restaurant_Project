export function Loading({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  )
}
