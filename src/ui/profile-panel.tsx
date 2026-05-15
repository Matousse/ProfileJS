import { useMemo, useState } from 'react'
import type { ParsedSheet, ParsedXlsx, ParsedProfileColumn } from '../types'
import { useSession } from '../state/session'
import { buildProfileSeries } from '../processing/profile'
import { ProfileChart, type MarkMode } from './profile-chart'
import { resolveCalibration, applyCalibration } from '../processing/calibrate'

export function ProfilePanel({
  xlsx,
  sheet,
  col,
}: {
  xlsx: ParsedXlsx
  sheet: ParsedSheet
  col: ParsedProfileColumn
}) {
  const state = useSession((s) => s.profiles[`${sheet.name}::${col.index}`])
  const setZeroDepth = useSession((s) => s.setZeroDepth)
  const toggleFlagged = useSession((s) => s.toggleFlagged)
  const updateProfile = useSession((s) => s.updateProfile)

  const [mode, setMode] = useState<MarkMode>('zero-depth')

  const series = useMemo(
    () => buildProfileSeries(sheet, col.index, state),
    [sheet, col.index, state],
  )

  const cal = useMemo(
    () => resolveCalibration(state, xlsx.calibrations, col.sensorLabel),
    [state, xlsx.calibrations, col.sensorLabel],
  )

  const calibrationsForSensor = xlsx.calibrations.filter((c) => c.sensor === col.sensorLabel)

  const previewCalibrated = (rawMv: number | null) =>
    applyCalibration(rawMv, {
      slope: cal.slope,
      intercept: cal.intercept,
      temperatureC: state.temperatureC,
      salinityPSU: state.salinityPSU,
      sensorKind: col.sensor,
    })

  const onPickRow = (rowIndex: number) => {
    if (mode === 'zero-depth') {
      setZeroDepth({ sheet: sheet.name, colIndex: col.index }, rowIndex)
    } else {
      toggleFlagged({ sheet: sheet.name, colIndex: col.index }, rowIndex)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-zinc-100">{col.header}</h3>
          <p className="text-xs text-zinc-500">
            {sheet.name} · <span className="text-zinc-300">{col.sensor}</span> · {col.sensorLabel}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <ModeButton current={mode} mode="zero-depth" onClick={setMode} label="0-depth click" />
          <ModeButton current={mode} mode="flag" onClick={setMode} label="flag click" />
        </div>
      </div>

      <ProfileChart
        series={series}
        zeroDepthRowIndex={state.zeroDepthRowIndex}
        flagged={state.flaggedRowIndices}
        mode={mode}
        onPickRow={onPickRow}
      />

      <div className="grid grid-cols-2 gap-4 text-sm">
        <Field label="0-depth row">
          {state.zeroDepthRowIndex == null ? (
            <span className="text-zinc-500 text-xs">
              not set · chart-click in 0-depth mode, or click a Depth cell in the viewer
            </span>
          ) : (
            <button
              className="text-emerald-300 hover:text-emerald-200 underline text-xs"
              onClick={() => setZeroDepth({ sheet: sheet.name, colIndex: col.index }, null)}
            >
              row {state.zeroDepthRowIndex} — clear
            </button>
          )}
        </Field>
        <Field label="Flagged rows">
          {state.flaggedRowIndices.length === 0 ? (
            <span className="text-zinc-500">none</span>
          ) : (
            <span className="text-red-300">{state.flaggedRowIndices.length}</span>
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border-t border-zinc-800 pt-4">
        <Field label="Calibration ID">
          <select
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs"
            value={state.manualCalibration.calibrationId ?? cal.calibrationId ?? ''}
            onChange={(e) =>
              updateProfile(
                { sheet: sheet.name, colIndex: col.index },
                {
                  manualCalibration: {
                    ...state.manualCalibration,
                    calibrationId: e.target.value || null,
                  },
                },
              )
            }
          >
            <option value="">(auto: first match)</option>
            {calibrationsForSensor.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · slope {c.slope?.toPrecision(4)} · int {c.intercept?.toPrecision(4)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Resolved slope / intercept">
          <span className="text-zinc-300 text-xs">
            {cal.slope?.toPrecision(5) ?? '—'} / {cal.intercept?.toPrecision(5) ?? '—'}
          </span>
        </Field>

        <Field label="Manual slope override">
          <input
            type="number"
            step="any"
            value={state.manualCalibration.slope ?? ''}
            placeholder="(use XLSX)"
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs w-40"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              updateProfile(
                { sheet: sheet.name, colIndex: col.index },
                {
                  manualCalibration: {
                    ...state.manualCalibration,
                    slope: Number.isFinite(v as number) ? (v as number) : null,
                  },
                },
              )
            }}
          />
        </Field>
        <Field label="Manual intercept override">
          <input
            type="number"
            step="any"
            value={state.manualCalibration.intercept ?? ''}
            placeholder="(use XLSX)"
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs w-40"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              updateProfile(
                { sheet: sheet.name, colIndex: col.index },
                {
                  manualCalibration: {
                    ...state.manualCalibration,
                    intercept: Number.isFinite(v as number) ? (v as number) : null,
                  },
                },
              )
            }}
          />
        </Field>

        <Field label="Temperature (°C)">
          <input
            type="number"
            step="any"
            value={state.temperatureC ?? ''}
            placeholder="(none)"
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs w-40"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              updateProfile(
                { sheet: sheet.name, colIndex: col.index },
                { temperatureC: Number.isFinite(v as number) ? (v as number) : null },
              )
            }}
          />
        </Field>
        <Field label="Salinity (PSU)">
          <input
            type="number"
            step="any"
            value={state.salinityPSU ?? ''}
            placeholder="(none)"
            className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs w-40"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              updateProfile(
                { sheet: sheet.name, colIndex: col.index },
                { salinityPSU: Number.isFinite(v as number) ? (v as number) : null },
              )
            }}
          />
        </Field>
      </div>

      <FlaggedRowsList sheet={sheet.name} col={col.index} indices={state.flaggedRowIndices} />

      <Preview series={series} previewCalibrated={previewCalibrated} />
    </div>
  )
}

function ModeButton({
  current,
  mode,
  onClick,
  label,
}: {
  current: MarkMode
  mode: MarkMode
  onClick: (m: MarkMode) => void
  label: string
}) {
  const active = current === mode
  return (
    <button
      type="button"
      onClick={() => onClick(mode)}
      className={`px-2 py-1 rounded border text-xs ${
        active
          ? 'border-indigo-500 bg-indigo-950 text-indigo-100'
          : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {label}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function FlaggedRowsList({
  sheet,
  col,
  indices,
}: {
  sheet: string
  col: number
  indices: number[]
}) {
  const toggleFlagged = useSession((s) => s.toggleFlagged)
  if (indices.length === 0) return null
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Flagged rows</div>
      <div className="flex flex-wrap gap-1">
        {indices.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggleFlagged({ sheet, colIndex: col }, i)}
            className="text-[11px] px-1.5 py-0.5 rounded bg-red-950 text-red-200 border border-red-800 hover:bg-red-900"
          >
            row {i} ×
          </button>
        ))}
      </div>
    </div>
  )
}

function Preview({
  series,
  previewCalibrated,
}: {
  series: ReturnType<typeof buildProfileSeries>
  previewCalibrated: (raw: number | null) => number | null
}) {
  const sample = series.rows.slice(0, 5)
  return (
    <details>
      <summary className="text-xs text-zinc-400 cursor-pointer">
        Preview first 5 rows (with placeholder calibration)
      </summary>
      <table className="text-xs mt-2 font-mono">
        <thead className="text-zinc-500">
          <tr>
            <th className="text-left pr-3">row</th>
            <th className="text-left pr-3">raw depth</th>
            <th className="text-left pr-3">norm depth</th>
            <th className="text-left pr-3">raw mV</th>
            <th className="text-left pr-3">calibrated*</th>
          </tr>
        </thead>
        <tbody>
          {sample.map((r) => (
            <tr key={r.rowIndex}>
              <td className="pr-3">{r.rowIndex}</td>
              <td className="pr-3">{r.rawDepth ?? ''}</td>
              <td className="pr-3">{r.normalizedDepth ?? ''}</td>
              <td className="pr-3">{r.rawMv ?? ''}</td>
              <td className="pr-3">{previewCalibrated(r.rawMv) ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-zinc-500 mt-1">
        * Placeholder linear formula (slope × raw + intercept). Real compensation drops in later.
      </p>
    </details>
  )
}
