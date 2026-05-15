import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { ProfileSeries } from '../processing/profile'

/**
 * Compact in-panel chart. Read-only: no click-to-toggle-flag, no click-to-pick-depth.
 * All editing happens in the GraphEditorModal opened via the "Modify graph" button.
 * Flagged points are drawn as red rings for visual feedback only.
 */
export function ProfileChart({
  series,
  zeroDepthValue,
  flagged,
}: {
  series: ProfileSeries
  zeroDepthValue: number | null
  flagged: number[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!ref.current) return

    const normalized = zeroDepthValue != null
    const xs: number[] = []
    const ys: number[] = []
    const indices: number[] = []
    for (const r of series.rows) {
      if (r.rawMv == null) continue
      const y = normalized ? r.normalizedDepth : r.rawDepth
      if (y == null) continue
      xs.push(r.rawMv)
      ys.push(y)
      indices.push(r.rowIndex)
    }

    const flaggedSet = new Set(flagged)
    const data: uPlot.AlignedData = [xs, ys]

    const overlayPlugin: uPlot.Plugin = {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx
            ctx.save()
            for (let i = 0; i < xs.length; i++) {
              const idx = indices[i]
              if (!flaggedSet.has(idx)) continue
              const cx = u.valToPos(xs[i], 'x', true)
              const cy = u.valToPos(ys[i], 'y', true)
              ctx.strokeStyle = '#ef4444'
              ctx.lineWidth = 2
              ctx.beginPath()
              ctx.arc(cx, cy, 5, 0, Math.PI * 2)
              ctx.stroke()
            }
            // Horizontal reference line at y = 0.
            const yMin = u.scales.y.min
            const yMax = u.scales.y.max
            if (yMin != null && yMax != null && 0 >= Math.min(yMin, yMax) && 0 <= Math.max(yMin, yMax)) {
              const y0 = u.valToPos(0, 'y', true)
              ctx.strokeStyle = '#10b981'
              ctx.lineWidth = 1
              ctx.globalAlpha = 0.85
              ctx.beginPath()
              ctx.moveTo(u.bbox.left, y0)
              ctx.lineTo(u.bbox.left + u.bbox.width, y0)
              ctx.stroke()
              ctx.globalAlpha = 1
            }
            ctx.restore()
          },
        ],
      },
    }

    const opts: uPlot.Options = {
      width: 560,
      height: 360,
      title: series.header,
      scales: {
        x: { time: false },
        y: { dir: -1 },
      },
      axes: [
        { label: 'Raw (mV)', stroke: '#a1a1aa', side: 0 },
        {
          label: normalized ? 'Depth normalized (µm, 0 = chosen surface)' : 'Depth (µm)',
          stroke: '#a1a1aa',
          side: 3,
        },
      ],
      series: [
        {},
        {
          label: 'profile',
          stroke: '#818cf8',
          width: 1.5,
          points: { show: true, size: 4, stroke: '#818cf8', fill: '#1e1b4b' },
        },
      ],
      plugins: [overlayPlugin],
      // Non-interactive: no drag, no cursor binds. Hover crosshair still works.
      cursor: {
        drag: { x: false, y: false, setScale: false },
      },
    }

    if (plotRef.current) plotRef.current.destroy()
    plotRef.current = new uPlot(opts, data, ref.current)

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [series, zeroDepthValue, flagged])

  return <div ref={ref} />
}
