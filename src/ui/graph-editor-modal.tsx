import { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import type { ProfileSeries } from '../processing/profile'

type ToolMode = 'zero-depth' | 'flag-points'

type DragState = {
  startPx: { x: number; y: number }
  endPx: { x: number; y: number }
}

type PanState = {
  xPx: number
  yPx: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  cssW: number
  cssH: number
}

/**
 * Full-size graph editor.
 *
 *  - **0-depth picker** — left-click anywhere → y-coord of the click becomes the
 *    pending 0-depth value. Validate prompts for confirmation, then commits.
 *  - **Flag incoherent points** — left-click a point toggles its pending state.
 *    A pending toggle on a not-yet-flagged point queues a flag; a pending toggle
 *    on an already-flagged point queues an un-flag. Drag a rectangle (left-mouse)
 *    to bulk-add un-flagged points to pending. Validate commits the toggles.
 *  - **Pan** — middle-mouse drag pans the chart.
 *  - **Zoom** — scroll wheel zooms toward the cursor.
 *  - Close (button or ESC) exits.
 */
export function GraphEditorModal({
  series,
  initialZeroDepth,
  initialFlags,
  onCommitZeroDepth,
  onCommitFlagToggles,
  onClose,
}: {
  series: ProfileSeries
  initialZeroDepth: number | null
  initialFlags: number[]
  onCommitZeroDepth: (value: number | null) => void
  /** Toggle the flag state of each row index in turn. */
  onCommitFlagToggles: (rowIndices: number[]) => void
  onClose: () => void
}) {
  const [tool, setTool] = useState<ToolMode>('zero-depth')
  const toolRef = useRef<ToolMode>(tool)
  toolRef.current = tool

  // 0-depth pending
  const [pendingZero, setPendingZero] = useState<number | null>(initialZeroDepth)
  const pendingZeroRef = useRef<number | null>(initialZeroDepth)
  pendingZeroRef.current = pendingZero
  const preferXRef = useRef<number | null>(null)

  // Flag pending = set of row indices whose flagged state will flip on Validate.
  const [pendingFlags, setPendingFlags] = useState<Set<number>>(new Set())
  const pendingFlagsRef = useRef<Set<number>>(pendingFlags)
  pendingFlagsRef.current = pendingFlags

  // Drag rectangle (flag tool, left mouse).
  const dragRef = useRef<DragState | null>(null)

  // Currently-committed flags (informational).
  const initialFlagsSet = useMemo(() => new Set(initialFlags), [initialFlags])
  const initialFlagsRef = useRef<Set<number>>(initialFlagsSet)
  initialFlagsRef.current = initialFlagsSet

  // Last-validated feedback (auto-clears).
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<uPlot | null>(null)
  const initialScalesRef = useRef<{ xMin: number; xMax: number; yMin: number; yMax: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const xs: number[] = []
    const ys: number[] = []
    const indices: number[] = []
    for (const r of series.rows) {
      if (r.rawMv == null || r.rawDepth == null) continue
      xs.push(r.rawMv)
      ys.push(r.rawDepth)
      indices.push(r.rowIndex)
    }
    const data: uPlot.AlignedData = [xs, ys]

    function findCurveCrossingX(yTarget: number, preferX: number): number | null {
      let bestX: number | null = null
      let bestDist = Infinity
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i]
        const y1 = ys[i + 1]
        const lo = Math.min(y0, y1)
        const hi = Math.max(y0, y1)
        if (yTarget < lo || yTarget > hi) continue
        const t = y1 === y0 ? 0.5 : (yTarget - y0) / (y1 - y0)
        const x = xs[i] + t * (xs[i + 1] - xs[i])
        const dist = Math.abs(x - preferX)
        if (dist < bestDist) {
          bestDist = dist
          bestX = x
        }
      }
      return bestX
    }

    const drawPlugin: uPlot.Plugin = {
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx
            ctx.save()

            const committed = initialFlagsRef.current
            const pending = pendingFlagsRef.current
            for (let i = 0; i < xs.length; i++) {
              const idx = indices[i]
              const isCommitted = committed.has(idx)
              const isPending = pending.has(idx)
              if (!isCommitted && !isPending) continue
              const cx = u.valToPos(xs[i], 'x', true)
              const cy = u.valToPos(ys[i], 'y', true)
              if (isCommitted && !isPending) {
                // Currently flagged, no change queued — red ring.
                ctx.strokeStyle = '#ef4444'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.arc(cx, cy, 6, 0, Math.PI * 2)
                ctx.stroke()
              } else if (isCommitted && isPending) {
                // Currently flagged, queued for un-flag — dimmed gray ring + X.
                ctx.strokeStyle = '#71717a'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.arc(cx, cy, 6, 0, Math.PI * 2)
                ctx.stroke()
                ctx.beginPath()
                ctx.moveTo(cx - 4, cy - 4)
                ctx.lineTo(cx + 4, cy + 4)
                ctx.moveTo(cx + 4, cy - 4)
                ctx.lineTo(cx - 4, cy + 4)
                ctx.stroke()
              } else if (!isCommitted && isPending) {
                // Queued for flag — orange filled.
                ctx.fillStyle = '#f59e0b'
                ctx.beginPath()
                ctx.arc(cx, cy, 5, 0, Math.PI * 2)
                ctx.fill()
                ctx.strokeStyle = '#7c2d12'
                ctx.lineWidth = 1.5
                ctx.stroke()
              }
            }

            const p = pendingZeroRef.current
            if (p != null) {
              const yPx = u.valToPos(p, 'y', true)
              ctx.strokeStyle = '#10b981'
              ctx.lineWidth = 1.5
              ctx.setLineDash([6, 4])
              ctx.beginPath()
              ctx.moveTo(u.bbox.left, yPx)
              ctx.lineTo(u.bbox.left + u.bbox.width, yPx)
              ctx.stroke()
              ctx.setLineDash([])
              const preferX =
                preferXRef.current ?? ((u.scales.x.min as number) + (u.scales.x.max as number)) / 2
              const xCross = findCurveCrossingX(p, preferX)
              if (xCross != null) {
                const cx = u.valToPos(xCross, 'x', true)
                ctx.fillStyle = '#10b981'
                ctx.beginPath()
                ctx.arc(cx, yPx, 7, 0, Math.PI * 2)
                ctx.fill()
                ctx.strokeStyle = '#064e3b'
                ctx.lineWidth = 1.5
                ctx.stroke()
              }
            }

            if (dragRef.current) {
              const { startPx, endPx } = dragRef.current
              // startPx/endPx are CSS pixels (from getBoundingClientRect-based
              // capture); the canvas context works in device pixels — scale.
              const dpr = uPlot.pxRatio
              const x0 = Math.min(startPx.x, endPx.x) * dpr
              const x1 = Math.max(startPx.x, endPx.x) * dpr
              const y0 = Math.min(startPx.y, endPx.y) * dpr
              const y1 = Math.max(startPx.y, endPx.y) * dpr
              ctx.fillStyle = 'rgba(245, 158, 11, 0.15)'
              ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
              ctx.strokeStyle = '#f59e0b'
              ctx.lineWidth = 1
              ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
            }

            ctx.restore()
          },
        ],
      },
    }

    const wheelZoom: uPlot.Plugin = {
      hooks: {
        ready: [
          (u) => {
            const over = u.over
            over.addEventListener(
              'wheel',
              (e: WheelEvent) => {
                e.preventDefault()
                const left = u.cursor.left
                const top = u.cursor.top
                if (left == null || top == null) return
                const xMin = u.scales.x.min as number
                const xMax = u.scales.x.max as number
                const yMin = u.scales.y.min as number
                const yMax = u.scales.y.max as number
                if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return
                const xVal = u.posToVal(left, 'x')
                const yVal = u.posToVal(top, 'y')
                const oxRange = xMax - xMin
                const oyRange = yMax - yMin
                const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
                let nxRange = oxRange * factor
                let nyRange = oyRange * factor

                // Clamp zoom so the visible window never shrinks below 0.1 %
                // of the original data extent — otherwise uPlot can drop the
                // curve when both axes get too narrow.
                const init = initialScalesRef.current
                if (init) {
                  const minX = (init.xMax - init.xMin) * 0.001
                  const minY = (init.yMax - init.yMin) * 0.001
                  if (nxRange < minX) nxRange = minX
                  if (nyRange < minY) nyRange = minY
                  // Also clamp zoom-out so we don't drift miles past the data.
                  const maxX = (init.xMax - init.xMin) * 50
                  const maxY = (init.yMax - init.yMin) * 50
                  if (nxRange > maxX) nxRange = maxX
                  if (nyRange > maxY) nyRange = maxY
                }

                const xFrac = (xVal - xMin) / oxRange
                const yFrac = (yVal - yMin) / oyRange
                const nxMin = xVal - xFrac * nxRange
                const nyMin = yVal - yFrac * nyRange
                u.batch(() => {
                  u.setScale('x', { min: nxMin, max: nxMin + nxRange })
                  u.setScale('y', { min: nyMin, max: nyMin + nyRange })
                })
              },
              { passive: false },
            )
          },
        ],
      },
    }

    const interactions: uPlot.Plugin = {
      hooks: {
        ready: [
          (u) => {
            const over = u.over

            // ---- middle-mouse pan ----
            let panState: PanState | null = null
            const onPanMove = (ev: MouseEvent) => {
              if (!panState) return
              const dxPx = ev.clientX - panState.xPx
              const dyPx = ev.clientY - panState.yPx
              const xRange = panState.xMax - panState.xMin
              const yRange = panState.yMax - panState.yMin
              const shiftX = (dxPx / panState.cssW) * xRange
              const shiftY = (dyPx / panState.cssH) * yRange
              const dirY = (u.scales.y.dir as number | undefined) ?? 1
              const newXMin = panState.xMin - shiftX
              const newXMax = panState.xMax - shiftX
              const yDelta = dirY === -1 ? -shiftY : shiftY
              const newYMin = panState.yMin + yDelta
              const newYMax = panState.yMax + yDelta
              u.batch(() => {
                u.setScale('x', { min: newXMin, max: newXMax })
                u.setScale('y', { min: newYMin, max: newYMax })
              })
            }
            const onPanUp = (ev: MouseEvent) => {
              if (ev.button !== 1) return
              panState = null
              over.style.cursor = ''
              window.removeEventListener('mousemove', onPanMove)
              window.removeEventListener('mouseup', onPanUp)
            }

            // ---- flag-tool drag (left-mouse) ----
            const finalizeDrag = () => {
              const drag = dragRef.current
              if (!drag) return
              const { startPx, endPx } = drag
              const dx = endPx.x - startPx.x
              const dy = endPx.y - startPx.y
              const dist = Math.hypot(dx, dy)
              const next = new Set(pendingFlagsRef.current)
              if (dist < 4) {
                // Single click → toggle nearest data point in pending.
                const cIdx = u.cursor.idx
                if (cIdx != null && cIdx >= 0 && cIdx < indices.length) {
                  const rowIdx = indices[cIdx]
                  if (next.has(rowIdx)) next.delete(rowIdx)
                  else next.add(rowIdx)
                }
              } else {
                // Rectangle → add every NOT-currently-flagged data point in the
                // rect to pending. Already-flagged rows untouched (use a click
                // to queue an un-flag).
                const xa = u.posToVal(Math.min(startPx.x, endPx.x), 'x')
                const xb = u.posToVal(Math.max(startPx.x, endPx.x), 'x')
                const ya = u.posToVal(Math.min(startPx.y, endPx.y), 'y')
                const yb = u.posToVal(Math.max(startPx.y, endPx.y), 'y')
                const xLo = Math.min(xa, xb)
                const xHi = Math.max(xa, xb)
                const yLo = Math.min(ya, yb)
                const yHi = Math.max(ya, yb)
                const committed = initialFlagsRef.current
                for (let i = 0; i < indices.length; i++) {
                  if (xs[i] < xLo || xs[i] > xHi) continue
                  if (ys[i] < yLo || ys[i] > yHi) continue
                  const idx = indices[i]
                  if (committed.has(idx)) continue
                  next.add(idx)
                }
              }
              pendingFlagsRef.current = next
              setPendingFlags(next)
              dragRef.current = null
              u.redraw(false)
            }
            const onDragMove = (ev: MouseEvent) => {
              const drag = dragRef.current
              if (!drag) return
              const rect = over.getBoundingClientRect()
              drag.endPx = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }
              u.redraw(false)
            }
            const onDragUp = (ev: MouseEvent) => {
              if (ev.button !== 0) return
              window.removeEventListener('mousemove', onDragMove)
              window.removeEventListener('mouseup', onDragUp)
              finalizeDrag()
            }

            over.addEventListener('mousedown', (e: MouseEvent) => {
              if (e.button === 1) {
                // middle-mouse pan
                e.preventDefault()
                const xMin = u.scales.x.min as number
                const xMax = u.scales.x.max as number
                const yMin = u.scales.y.min as number
                const yMax = u.scales.y.max as number
                if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return
                panState = {
                  xPx: e.clientX,
                  yPx: e.clientY,
                  xMin,
                  xMax,
                  yMin,
                  yMax,
                  cssW: over.clientWidth,
                  cssH: over.clientHeight,
                }
                over.style.cursor = 'grabbing'
                window.addEventListener('mousemove', onPanMove)
                window.addEventListener('mouseup', onPanUp)
                return
              }
              if (e.button !== 0) return
              if (toolRef.current !== 'flag-points') return
              const rect = over.getBoundingClientRect()
              const px = e.clientX - rect.left
              const py = e.clientY - rect.top
              dragRef.current = { startPx: { x: px, y: py }, endPx: { x: px, y: py } }
              window.addEventListener('mousemove', onDragMove)
              window.addEventListener('mouseup', onDragUp)
            })

            // Browser middle-click default (autoscroll on Windows/Linux) — suppress.
            over.addEventListener('auxclick', (e: MouseEvent) => {
              if (e.button === 1) e.preventDefault()
            })

            // Zero-depth tool: left-mouseup picks the y of the click.
            over.addEventListener('mouseup', (e: MouseEvent) => {
              if (e.button !== 0) return
              if (toolRef.current !== 'zero-depth') return
              const top = u.cursor.top
              const left = u.cursor.left
              if (top == null || left == null) return
              const yVal = u.posToVal(top, 'y')
              const xVal = u.posToVal(left, 'x')
              if (!Number.isFinite(yVal)) return
              preferXRef.current = Number.isFinite(xVal) ? xVal : null
              pendingZeroRef.current = yVal
              setPendingZero(yVal)
              u.redraw(false)
            })
          },
        ],
      },
    }

    const opts: uPlot.Options = {
      width: containerRef.current.clientWidth || 600,
      height: containerRef.current.clientHeight || 400,
      title: series.header,
      scales: { x: { time: false }, y: { dir: -1 } },
      axes: [
        { label: 'Raw (mV)', side: 0, stroke: '#a1a1aa' },
        { label: 'Depth (µm)', side: 3, stroke: '#a1a1aa' },
      ],
      series: [
        {},
        {
          label: 'profile',
          stroke: '#818cf8',
          width: 1.5,
          points: { show: true, size: 5, stroke: '#818cf8', fill: '#1e1b4b' },
        },
      ],
      plugins: [drawPlugin, wheelZoom, interactions],
      select: { show: false, left: 0, top: 0, width: 0, height: 0 },
      cursor: {
        drag: { x: false, y: false, setScale: false },
      },
    }

    plotRef.current = new uPlot(opts, data, containerRef.current)
    initialScalesRef.current = {
      xMin: plotRef.current.scales.x.min as number,
      xMax: plotRef.current.scales.x.max as number,
      yMin: plotRef.current.scales.y.min as number,
      yMax: plotRef.current.scales.y.max as number,
    }

    const ro = new ResizeObserver(() => {
      if (containerRef.current && plotRef.current) {
        plotRef.current.setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [series])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    dragRef.current = null
    plotRef.current?.redraw(false)
  }, [tool])

  // Auto-clear the "Saved" indicator after a moment.
  useEffect(() => {
    if (!lastSaved) return
    const t = setTimeout(() => setLastSaved(null), 2500)
    return () => clearTimeout(t)
  }, [lastSaved])

  const onValidateZero = () => {
    const v = pendingZeroRef.current
    const label = v == null ? 'no 0-depth (raw)' : `${formatDepth(v)}`
    if (!confirm(`Set 0-depth to ${label}?`)) return
    onCommitZeroDepth(v)
    setLastSaved(`0-depth saved: ${label}`)
  }
  const onValidateFlags = () => {
    const toggles = Array.from(pendingFlagsRef.current)
    if (toggles.length === 0) return
    onCommitFlagToggles(toggles)
    pendingFlagsRef.current = new Set()
    setPendingFlags(new Set())
    plotRef.current?.redraw(false)
    setLastSaved(`Applied ${toggles.length} flag change${toggles.length === 1 ? '' : 's'}`)
  }
  const onClearPendingZero = () => {
    pendingZeroRef.current = null
    setPendingZero(null)
    plotRef.current?.redraw(false)
  }
  const onClearPendingFlags = () => {
    pendingFlagsRef.current = new Set()
    setPendingFlags(new Set())
    plotRef.current?.redraw(false)
  }
  const onResetZoom = () => {
    const u = plotRef.current
    const s = initialScalesRef.current
    if (!u || !s) return
    u.batch(() => {
      u.setScale('x', { min: s.xMin, max: s.xMax })
      u.setScale('y', { min: s.yMin, max: s.yMax })
    })
  }

  // Count pending breakdown (for the toolbar readout).
  const pendingAdds = Array.from(pendingFlags).filter((i) => !initialFlagsSet.has(i)).length
  const pendingRemoves = pendingFlags.size - pendingAdds

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col">
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-6">
          <h2 className="font-semibold">Modify graph — {series.header}</h2>
          <div className="flex items-center gap-2 text-sm">
            <ToolBtn
              active={tool === 'zero-depth'}
              color="emerald"
              onClick={() => setTool('zero-depth')}
              label="0-depth picker"
            />
            <ToolBtn
              active={tool === 'flag-points'}
              color="orange"
              onClick={() => setTool('flag-points')}
              label="Flag incoherent points"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs px-2 py-1 rounded border border-emerald-700 bg-emerald-950/50 text-emerald-200">
              ✓ {lastSaved}
            </span>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-sm"
          >
            Close (esc)
          </button>
        </div>
      </div>

      {tool === 'zero-depth' ? (
        <div className="px-6 py-2 border-b border-zinc-800 bg-zinc-950/80 flex items-center gap-3 text-xs flex-wrap">
          <span className="text-zinc-400">
            Left-click anywhere — y of the click becomes the 0-depth value. Middle-click+drag to
            pan · scroll wheel to zoom.
          </span>
          <span className="ml-auto text-zinc-500">
            Pending:{' '}
            <span
              className={pendingZero != null ? 'text-emerald-300 font-mono' : 'text-zinc-500'}
            >
              {pendingZero != null ? formatDepth(pendingZero) : 'none'}
            </span>
          </span>
          <button
            onClick={onClearPendingZero}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Clear pending
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Reset zoom
          </button>
          <button
            onClick={onValidateZero}
            className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 font-medium"
          >
            Validate 0-depth
          </button>
        </div>
      ) : (
        <div className="px-6 py-2 border-b border-zinc-800 bg-zinc-950/80 flex items-center gap-3 text-xs flex-wrap">
          <span className="text-zinc-400">
            Click a point to toggle (red ring → un-flag, normal → flag) · drag a rectangle to
            bulk-flag new points · middle-click+drag to pan · wheel to zoom.
          </span>
          <span className="ml-auto text-zinc-500">
            Flagged: <span className="text-red-300 font-mono">{initialFlagsSet.size}</span> ·
            queued: <span className="text-orange-300 font-mono">+{pendingAdds}</span>{' '}
            <span className="text-zinc-400 font-mono">−{pendingRemoves}</span>
          </span>
          <button
            onClick={onClearPendingFlags}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Clear pending
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Reset zoom
          </button>
          <button
            onClick={onValidateFlags}
            disabled={pendingFlags.size === 0}
            className="px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-500 font-medium disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            Validate flags ({pendingFlags.size})
          </button>
        </div>
      )}

      <div className="flex-1 p-4 min-h-0">
        <div
          ref={containerRef}
          className="w-full h-full bg-zinc-950 rounded border border-zinc-800 overflow-hidden"
        />
      </div>
    </div>
  )
}

function ToolBtn({
  active,
  color,
  onClick,
  label,
}: {
  active: boolean
  color: 'emerald' | 'orange'
  onClick: () => void
  label: string
}) {
  const activeCls =
    color === 'emerald'
      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-100'
      : 'border-orange-500 bg-orange-950/40 text-orange-100'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded border ${
        active ? activeCls : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}

function formatDepth(v: number): string {
  if (Math.abs(v) >= 1000) return `${v.toFixed(0)} µm`
  return `${v.toFixed(2)} µm`
}
