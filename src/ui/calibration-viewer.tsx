import { useMemo, useState } from 'react'
import type { ParsedSheet, ParsedXlsx, ProfileKey } from '../types'
import { profileKeyStr } from '../types'
import { useSession } from '../state/session'

type ColIdx = {
  id: number
  sensor: number
  slope: number
  r2: number
  intercept: number
  point: number
}

function findColIdx(headers: string[]): ColIdx {
  const find = (rx: RegExp) => headers.findIndex((h) => rx.test(String(h).trim()))
  return {
    id: find(/^calibration id$/i),
    sensor: find(/^sensor$/i),
    slope: find(/^slope$/i),
    r2: find(/^r2$/i),
    intercept: find(/^intercept$/i),
    point: find(/^calibrated point$/i),
  }
}

type ProfileOption = {
  key: ProfileKey
  label: string
  sensorLabel: string
}

export function CalibrationViewer({
  xlsx,
  sheet,
}: {
  xlsx: ParsedXlsx
  sheet: ParsedSheet
}) {
  const profiles = useSession((s) => s.profiles)
  const updateProfile = useSession((s) => s.updateProfile)

  const enabledProfiles = useMemo<ProfileOption[]>(() => {
    const out: ProfileOption[] = []
    for (const sh of xlsx.dataSheets) {
      for (const c of sh.profileCols) {
        const key = { sheet: sh.name, colIndex: c.index }
        if (profiles[profileKeyStr(key)]?.enabled) {
          out.push({
            key,
            label: `${sh.name.replace(/^Data \(Profile experiment (\d+)\)$/, 'Exp $1')} · ${c.sensorLabel}`,
            sensorLabel: c.sensorLabel,
          })
        }
      }
    }
    return out
  }, [xlsx, profiles])

  const [targetKey, setTargetKey] = useState<string>(() =>
    enabledProfiles.length > 0 ? profileKeyStr(enabledProfiles[0].key) : '',
  )
  const target = enabledProfiles.find((p) => profileKeyStr(p.key) === targetKey) ?? null

  const colIdx = useMemo(() => findColIdx(sheet.headers), [sheet.headers])

  const currentCalibrationId = target
    ? profiles[profileKeyStr(target.key)]?.manualCalibration.calibrationId ?? null
    : null

  const onPickRow = (rowIndex: number) => {
    if (!target) return
    const row = sheet.rows[rowIndex]
    if (!row) return
    const id = colIdx.id >= 0 ? row[colIdx.id] : null
    const sensor = colIdx.sensor >= 0 ? row[colIdx.sensor] : null
    const slope = colIdx.slope >= 0 ? toNum(row[colIdx.slope]) : null
    const intercept = colIdx.intercept >= 0 ? toNum(row[colIdx.intercept]) : null
    updateProfile(target.key, {
      manualCalibration: {
        calibrationId: id != null ? String(id) : null,
        slope,
        intercept,
      },
    })
    void sensor
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-medium">{sheet.name}</h3>
          <p className="text-xs text-zinc-500">
            {sheet.rows.length} rows. Click a row to apply its slope / intercept / id to the
            target profile.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-400">Apply to:</span>
          <select
            value={targetKey}
            onChange={(e) => setTargetKey(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 min-w-[18rem]"
          >
            {enabledProfiles.length === 0 ? (
              <option value="">(no enabled profiles)</option>
            ) : (
              enabledProfiles.map((p) => (
                <option key={profileKeyStr(p.key)} value={profileKeyStr(p.key)}>
                  {p.label}
                </option>
              ))
            )}
          </select>
          {target && (
            <span className="text-zinc-500">
              · current:{' '}
              <span className="text-zinc-300">
                {currentCalibrationId ?? '(auto)'}
              </span>
            </span>
          )}
        </div>
      </div>

      {target && (
        <div className="px-4 py-2 border-b border-zinc-800 bg-amber-950/20 text-xs text-amber-200">
          Target sensor:{' '}
          <span className="font-semibold">{target.sensorLabel}</span>. Rows matching this sensor
          are highlighted; you can still pick any row.
        </div>
      )}

      <div className="overflow-auto max-h-[60vh]">
        <table className="text-xs whitespace-nowrap font-mono">
          <thead className="sticky top-0 z-10 bg-zinc-900">
            <tr>
              <th className="px-2 py-1 border-b border-zinc-800 sticky left-0 bg-zinc-900 z-20 text-[10px] text-zinc-500">
                #
              </th>
              {sheet.headers.map((h, idx) => (
                <th
                  key={idx}
                  className="px-2 py-1 border-b border-zinc-800 text-left font-normal text-zinc-300"
                >
                  {h || `(col ${idx})`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => {
              const id = colIdx.id >= 0 ? row[colIdx.id] : null
              const sensor = colIdx.sensor >= 0 ? String(row[colIdx.sensor] ?? '') : ''
              const isMatch = target ? sensor === target.sensorLabel : false
              const isCurrent =
                target != null &&
                currentCalibrationId != null &&
                String(id ?? '') === currentCalibrationId &&
                isMatch
              const clickable = target != null
              return (
                <tr
                  key={ri}
                  className={`${ri % 2 ? 'bg-zinc-950/30' : ''} ${
                    isMatch ? 'bg-amber-950/15' : ''
                  } ${isCurrent ? 'outline outline-1 outline-emerald-500/60 bg-emerald-950/30' : ''} ${
                    clickable ? 'cursor-pointer hover:bg-indigo-950/30' : ''
                  }`}
                  onClick={() => clickable && onPickRow(ri)}
                  title={clickable ? `Apply to ${target!.label}` : 'Select a target profile first'}
                >
                  <td className="px-2 py-0.5 border-b border-zinc-900 sticky left-0 bg-zinc-900/95 text-zinc-500 text-[10px]">
                    {ri}
                  </td>
                  {sheet.headers.map((_, ci) => (
                    <td
                      key={ci}
                      className={`px-2 py-0.5 border-b border-zinc-900 ${
                        ci === colIdx.slope || ci === colIdx.intercept
                          ? 'text-indigo-200'
                          : 'text-zinc-300'
                      }`}
                    >
                      {formatCell(row[ci])}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function formatCell(v: string | number | null): string {
  if (v == null) return ''
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1000 || Math.abs(v) < 0.001) return v.toExponential(3)
    return Number(v.toPrecision(7)).toString()
  }
  return v
}
