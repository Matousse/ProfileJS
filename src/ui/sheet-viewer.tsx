import { useMemo, useState } from 'react'
import type { ParsedSheet, ParsedProfileColumn } from '../types'
import { useSession } from '../state/session'
import { profileKeyStr } from '../types'

const PREVIEW_ROWS = 200

export type ZeroDepthTarget = {
  /** colIndex of the profile receiving the 0-depth pick. null = picking disabled. */
  colIndex: number | null
}

export function SheetViewer({
  sheet,
  selectedColIndex,
  onSelectProfile,
  zeroDepthTarget,
  onSetZeroDepthTarget,
  onPickZeroDepth,
}: {
  sheet: ParsedSheet
  selectedColIndex: number | null
  onSelectProfile: (colIndex: number) => void
  zeroDepthTarget: ZeroDepthTarget
  onSetZeroDepthTarget: (colIndex: number | null) => void
  onPickZeroDepth: (colIndex: number, rowIndex: number) => void
}) {
  const profiles = useSession((s) => s.profiles)
  const toggleEnabled = useSession((s) => s.toggleEnabled)
  const [showAllRows, setShowAllRows] = useState(false)

  const profileColByIndex = useMemo(() => {
    const m = new Map<number, ParsedProfileColumn>()
    for (const c of sheet.profileCols) m.set(c.index, c)
    return m
  }, [sheet])

  // Columns to render: depth (kept as spatial context + click target) and every
  // "Raw,…(MilliVolt)" profile column. Everything else (Profile name, X/Y/Time,
  // converted values, std. devs) is hidden — they add no signal here.
  const visibleColIdx = useMemo(() => {
    const out: number[] = []
    sheet.headers.forEach((_h, idx) => {
      if (idx === sheet.depthCol) {
        out.push(idx)
      } else if (profileColByIndex.has(idx)) {
        out.push(idx)
      }
    })
    return out
  }, [sheet, profileColByIndex])

  const enabledProfileCols = useMemo(
    () =>
      sheet.profileCols.filter(
        (c) => profiles[profileKeyStr({ sheet: sheet.name, colIndex: c.index })]?.enabled,
      ),
    [sheet, profiles],
  )

  const targetCol = zeroDepthTarget.colIndex
  const targetState =
    targetCol != null
      ? profiles[profileKeyStr({ sheet: sheet.name, colIndex: targetCol })]
      : undefined
  const targetZeroRow = targetState?.zeroDepthRowIndex ?? null

  const rowsToShow = showAllRows ? sheet.rows : sheet.rows.slice(0, PREVIEW_ROWS)
  const pickingActive = targetCol != null && sheet.depthCol != null

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-medium">{sheet.name}</h3>
          <p className="text-xs text-zinc-500">
            {sheet.rows.length} rows · {sheet.profileCols.length} profile column
            {sheet.profileCols.length === 1 ? '' : 's'} detected · scroll horizontally with
            shift+wheel or trackpad swipe
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Set 0-depth for:</span>
          <select
            value={zeroDepthTarget.colIndex ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onSetZeroDepthTarget(v === '' ? null : Number(v))
            }}
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
          >
            <option value="">(off — click chart instead)</option>
            {enabledProfileCols.map((c) => (
              <option key={c.index} value={c.index}>
                {c.sensorLabel}
              </option>
            ))}
          </select>
          {sheet.rows.length > PREVIEW_ROWS && (
            <button
              type="button"
              className="text-indigo-300 hover:text-indigo-200 ml-2"
              onClick={() => setShowAllRows((v) => !v)}
            >
              {showAllRows ? 'show first 200' : `show all ${sheet.rows.length}`}
            </button>
          )}
        </div>
      </div>

      {pickingActive && (
        <div className="px-4 py-2 border-b border-zinc-800 bg-emerald-950/30 text-xs text-emerald-200">
          Click any cell in the <span className="font-semibold">Depth</span> column to set 0-depth
          for{' '}
          <span className="font-semibold">
            {profileColByIndex.get(targetCol!)?.sensorLabel ?? `col ${targetCol}`}
          </span>
          .{' '}
          {targetZeroRow != null && (
            <>
              Current: row <span className="font-semibold">{targetZeroRow}</span>.{' '}
              <button
                type="button"
                onClick={() => onPickZeroDepth(targetCol!, -1)}
                className="underline hover:text-emerald-100"
              >
                clear
              </button>
            </>
          )}
        </div>
      )}

      <div className="overflow-auto max-h-[60vh]">
        <table className="text-xs whitespace-nowrap font-mono">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            {/* Checkbox row */}
            <tr>
              <th className="px-2 py-1 border-b border-zinc-800 sticky left-0 bg-zinc-900 z-20 text-[10px] text-zinc-500">
                row
              </th>
              {visibleColIdx.map((idx) => {
                const pc = profileColByIndex.get(idx)
                if (!pc) return <th key={idx} className="px-2 py-1 border-b border-zinc-800" />
                const key = profileKeyStr({ sheet: sheet.name, colIndex: idx })
                const enabled = profiles[key]?.enabled ?? false
                return (
                  <th
                    key={idx}
                    className={`px-2 py-1 border-b border-zinc-800 text-center ${
                      selectedColIndex === idx ? 'bg-indigo-950/50' : ''
                    }`}
                  >
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleEnabled({ sheet: sheet.name, colIndex: idx })}
                      />
                      <span className="text-[10px] text-zinc-400">{pc.sensor}</span>
                    </label>
                  </th>
                )
              })}
            </tr>
            {/* Header text row */}
            <tr>
              <th className="px-2 py-1 border-b border-zinc-800 sticky left-0 bg-zinc-900 z-20 text-[10px] text-zinc-500">
                #
              </th>
              {visibleColIdx.map((idx) => {
                const h = sheet.headers[idx]
                const pc = profileColByIndex.get(idx)
                const isSelected = pc && selectedColIndex === idx
                const isDepth = idx === sheet.depthCol
                return (
                  <th
                    key={idx}
                    className={`px-2 py-1 border-b border-zinc-800 text-left font-normal text-zinc-300 ${
                      pc ? 'cursor-pointer hover:bg-zinc-800/60' : ''
                    } ${isSelected ? 'bg-indigo-950/50 text-indigo-200' : ''} ${
                      isDepth ? 'text-amber-200' : ''
                    }`}
                    onClick={() => pc && onSelectProfile(idx)}
                    title={pc ? 'Click to chart this profile' : ''}
                  >
                    {h || `(col ${idx})`}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rowsToShow.map((row, ri) => {
              const isZero = targetZeroRow === ri
              return (
                <tr
                  key={ri}
                  className={`odd:bg-zinc-950/30 ${
                    isZero ? 'bg-emerald-950/40' : ''
                  }`}
                >
                  <td className="px-2 py-0.5 border-b border-zinc-900 sticky left-0 bg-zinc-900/95 text-zinc-500 text-[10px]">
                    {ri}
                  </td>
                  {visibleColIdx.map((ci) => {
                    const v = row[ci]
                    const pc = profileColByIndex.get(ci)
                    const isSelectedCol = pc && selectedColIndex === ci
                    const isDepthCell = ci === sheet.depthCol
                    const isDepthPickable = isDepthCell && pickingActive
                    return (
                      <td
                        key={ci}
                        className={`px-2 py-0.5 border-b border-zinc-900 ${
                          isSelectedCol ? 'bg-indigo-950/30' : ''
                        } ${
                          isDepthCell
                            ? isZero
                              ? 'text-emerald-200 font-semibold'
                              : 'text-amber-200'
                            : 'text-zinc-300'
                        } ${
                          isDepthPickable
                            ? 'cursor-pointer hover:bg-emerald-900/40 hover:ring-1 hover:ring-emerald-500'
                            : ''
                        }`}
                        onClick={() => {
                          if (isDepthPickable && targetCol != null) {
                            onPickZeroDepth(targetCol, ri)
                          }
                        }}
                        title={isDepthPickable ? `Set 0-depth = row ${ri}` : ''}
                      >
                        {formatCell(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatCell(v: string | number | null): string {
  if (v == null) return ''
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1000 || Math.abs(v) < 0.001) return v.toExponential(3)
    return Number(v.toPrecision(7)).toString()
  }
  return v
}
