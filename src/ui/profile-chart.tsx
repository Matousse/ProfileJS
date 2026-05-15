import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { ProfileSeries } from '../processing/profile'

export type MarkMode = 'zero-depth' | 'flag'

export function ProfileChart({
  series,
  zeroDepthRowIndex,
  flagged,
  mode,
  onPickRow,
}: {
  series: ProfileSeries
  zeroDepthRowIndex: number | null
  flagged: number[]
  mode: MarkMode
  onPickRow: (rowIndex: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!ref.current) return

    const normalized = zeroDepthRowIndex != null
    // X = raw mV, Y = depth. When the user has set a 0-depth row, plot the
    // normalized depth (raw - zero) so the scale shifts but every data point
    // is preserved. Without a 0-depth row, plot raw depth.
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

    const flaggedPlugin: uPlot.Plugin = {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx
            ctx.save()
            for (let i = 0; i < xs.length; i++) {
              const idx = indices[i]
              const cx = u.valToPos(xs[i], 'x', true)
              const cy = u.valToPos(ys[i], 'y', true)
              if (idx === zeroDepthRowIndex) {
                ctx.fillStyle = '#10b981'
                ctx.beginPath()
                ctx.arc(cx, cy, 5, 0, Math.PI * 2)
                ctx.fill()
              }
              if (flaggedSet.has(idx)) {
                ctx.strokeStyle = '#ef4444'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.arc(cx, cy, 5, 0, Math.PI * 2)
                ctx.stroke()
              }
            }
            // Horizontal reference line at y = 0 — always.
            // When normalized: marks the user-selected surface.
            // When raw:       marks the XLSX's native depth zero.
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
        // depth grows downward in the original data; keep -1 so deeper = lower on screen
        y: { dir: -1 },
      },
      axes: [
        {
          label: 'Raw (mV)',
          stroke: '#a1a1aa',
          // X axis on the top edge of the plot.
          side: 0,
        },
        {
          label: normalized ? 'Depth normalized (um, 0 = marked row)' : 'Depth (um)',
          stroke: '#a1a1aa',
          side: 3, // left
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
      plugins: [flaggedPlugin],
      cursor: {
        // Disable drag-to-zoom entirely — clicks should pick a point, not zoom.
        drag: { x: false, y: false, setScale: false },
        bind: {
          mouseup: (u, _target, handler) => {
            return (e: MouseEvent) => {
              const idx = u.cursor.idx
              if (idx != null && idx >= 0 && idx < indices.length) {
                onPickRow(indices[idx])
              }
              return handler(e)
            }
          },
        },
      },
    }

    if (plotRef.current) {
      plotRef.current.destroy()
    }
    plotRef.current = new uPlot(opts, data, ref.current)

    return () => {
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [series, zeroDepthRowIndex, flagged, mode, onPickRow])

  return (
    <div>
      <div ref={ref} />
      <p className="text-xs text-zinc-500 mt-1">
        Click a point to{' '}
        {mode === 'zero-depth' ? (
          <span className="text-emerald-400">mark it as 0-depth</span>
        ) : (
          <span className="text-red-400">toggle its incoherence flag</span>
        )}
        .
      </p>
    </div>
  )
}
