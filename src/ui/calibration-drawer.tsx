import { useEffect, useMemo, useState } from 'react'
import type { ParsedXlsx } from '../types'
import { useSession } from '../state/session'
import { CalibrationViewer } from './calibration-viewer'
import { computeO2Saturation } from '../lib/o2-saturation'

export function CalibrationDrawer({
  xlsx,
  onClose,
}: {
  xlsx: ParsedXlsx
  onClose: () => void
}) {
  const environment = useSession((s) => s.environment)
  const setEnvironment = useSession((s) => s.setEnvironment)
  const userCalibrations = useSession((s) => s.userCalibrations)
  const addUserCalibration = useSession((s) => s.addUserCalibration)
  const removeUserCalibration = useSession((s) => s.removeUserCalibration)

  const [label, setLabel] = useState('')
  const [sensorLabel, setSensorLabel] = useState<string>('')

  const allSensorLabels = useMemo(() => {
    const set = new Set<string>()
    for (const sh of xlsx.dataSheets) {
      for (const c of sh.profileCols) {
        if (c.sensor === 'O2') set.add(c.sensorLabel)
      }
    }
    return Array.from(set)
  }, [xlsx])

  // Default sensor label to the first O2 sensor available.
  useEffect(() => {
    if (sensorLabel === '' && allSensorLabels.length > 0) {
      setSensorLabel(allSensorLabels[0])
    }
  }, [allSensorLabels, sensorLabel])

  // ESC to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tempValid = environment.temperatureC != null && Number.isFinite(environment.temperatureC)
  const salValid = environment.salinityPSU != null && Number.isFinite(environment.salinityPSU)
  const canCompute = tempValid && salValid

  const result = canCompute
    ? computeO2Saturation(environment.temperatureC as number, environment.salinityPSU as number)
    : null

  const onAdd = () => {
    if (!canCompute || !result) return
    addUserCalibration({
      label: label.trim() || `O₂ sat. ${environment.temperatureC}°C / ${environment.salinityPSU} PSU`,
      sensorLabel: sensorLabel || null,
      temperatureC: environment.temperatureC as number,
      salinityPSU: environment.salinityPSU as number,
      concentrationUmolL: result.umolPerL,
      concentrationUmolKg: result.umolPerKg,
    })
    setLabel('')
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-6xl bg-zinc-950 border-l border-zinc-800 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">Calibration</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-sm px-2 py-1"
            aria-label="Close"
          >
            ✕  esc
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
            <header>
              <h3 className="font-medium text-zinc-100">O₂ saturation calculator</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Garcia & Gordon (1992), Benson-Krause refit. Output is for 100 %
                air-saturated water at 1 atm — no atmospheric-pressure correction.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <Field label="Temperature (°C)">
                <input
                  type="number"
                  step="any"
                  value={environment.temperatureC ?? ''}
                  placeholder="e.g. 20"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200"
                  onChange={(e) => {
                    const v = e.target.value
                    const n = v === '' ? null : Number(v)
                    setEnvironment({ temperatureC: Number.isFinite(n as number) ? (n as number) : null })
                  }}
                />
              </Field>
              <Field label="Salinity (PSU)">
                <input
                  type="number"
                  step="any"
                  value={environment.salinityPSU ?? ''}
                  placeholder="e.g. 35"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200"
                  onChange={(e) => {
                    const v = e.target.value
                    const n = v === '' ? null : Number(v)
                    setEnvironment({ salinityPSU: Number.isFinite(n as number) ? (n as number) : null })
                  }}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <ResultBox label="O₂ at saturation (μmol/L)" value={result?.umolPerL} primary />
              <ResultBox label="O₂ at saturation (μmol/kg)" value={result?.umolPerKg} />
              <ResultBox label="Seawater density (kg/m³)" value={result?.densityKgPerM3} />
            </div>

            <div className="border-t border-zinc-800 pt-4 grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-3 items-end">
              <Field label="Label (optional)">
                <input
                  type="text"
                  value={label}
                  placeholder="e.g. Surface 100 % air-sat"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-sm"
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
              <Field label="Sensor (optional)">
                <select
                  value={sensorLabel}
                  onChange={(e) => setSensorLabel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-sm"
                >
                  <option value="">(any O₂ sensor)</option>
                  {allSensorLabels.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={onAdd}
                disabled={!canCompute}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
              >
                Add as user calibration
              </button>
            </div>
          </section>

          {userCalibrations.length > 0 && (
            <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
              <header className="px-4 py-3 border-b border-zinc-800">
                <h3 className="font-medium text-zinc-100">User calibrations</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Saved O₂ saturation references — persisted in the session JSON.
                </p>
              </header>
              <div className="overflow-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="text-left px-3 py-2">ID</th>
                      <th className="text-left px-3 py-2">Label</th>
                      <th className="text-left px-3 py-2">Sensor</th>
                      <th className="text-right px-3 py-2">T (°C)</th>
                      <th className="text-right px-3 py-2">S (PSU)</th>
                      <th className="text-right px-3 py-2 text-emerald-300">C* (μmol/L)</th>
                      <th className="text-right px-3 py-2">C* (μmol/kg)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {userCalibrations.map((c) => (
                      <tr key={c.id} className="border-t border-zinc-800/50">
                        <td className="px-3 py-1.5 text-zinc-400">{c.id}</td>
                        <td className="px-3 py-1.5 text-zinc-200">{c.label}</td>
                        <td className="px-3 py-1.5 text-zinc-300">{c.sensorLabel ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right">{c.temperatureC}</td>
                        <td className="px-3 py-1.5 text-right">{c.salinityPSU}</td>
                        <td className="px-3 py-1.5 text-right text-emerald-300">
                          {c.concentrationUmolL.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-zinc-400">
                          {c.concentrationUmolKg.toFixed(2)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => removeUserCalibration(c.id)}
                            className="text-zinc-500 hover:text-red-400"
                            title="Delete"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-medium text-zinc-100">XLSX calibration table</h3>
            {xlsx.calibrationSheet ? (
              <CalibrationViewer xlsx={xlsx} sheet={xlsx.calibrationSheet} />
            ) : (
              <p className="text-sm text-zinc-500">
                No <code>Calibration data</code> sheet in this XLSX.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">{label}</div>
      {children}
    </div>
  )
}

function ResultBox({
  label,
  value,
  primary,
}: {
  label: string
  value: number | undefined
  primary?: boolean
}) {
  const formatted = value == null || !Number.isFinite(value) ? '—' : formatNum(value)
  return (
    <div
      className={`rounded border p-3 ${
        primary
          ? 'border-emerald-800 bg-emerald-950/30'
          : 'border-zinc-800 bg-zinc-950/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={`mt-1 font-mono ${
          primary ? 'text-emerald-200 text-xl' : 'text-zinc-200 text-base'
        }`}
      >
        {formatted}
      </div>
    </div>
  )
}

function formatNum(v: number): string {
  if (Math.abs(v) >= 1000 || Math.abs(v) < 0.001) return v.toExponential(4)
  return Number(v.toPrecision(6)).toString()
}
