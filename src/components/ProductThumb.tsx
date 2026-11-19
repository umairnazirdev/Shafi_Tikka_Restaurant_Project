import { useEffect, useState } from 'react'

export function ProductThumb({
  name,
  imagePath,
}: {
  name: string
  imagePath?: string | null
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!imagePath) {
      setSrc(null)
      return
    }
    void window.api.imageDataUrl(imagePath).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [imagePath])

  return (
    <div className="thumb">
      {src ? <img src={src} alt="" /> : name.slice(0, 2).toUpperCase()}
    </div>
  )
}
