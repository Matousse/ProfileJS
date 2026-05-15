import { useEffect, useState } from 'react'
import { useSession } from './state/session'
import { UploadStep } from './ui/upload-step'
import { SheetViewer } from './ui/sheet-viewer'
import { ProfilePanel } from './ui/profile-panel'
import { ExportPanel } from './ui/export-panel'
import { CalibrationDrawer } from './ui/calibration-drawer'

export function App() {
  const xlsx = useSession((s) => s.xlsx)
  const profiles = useSession((s) => s.profiles)
  const userCalibrations = useSession((s) => s.userCalibrations)
  const setXlsx = useSession((s) => s.setXlsx)
  const setZeroDepth = useSession((s) => s.setZeroDepth)

  const [activeSheetIdx, setActiveSheetIdx] = useState(0)
  const [selectedCol, setSelectedCol] = useState<number | null>(null)
  const [zeroDepthTargetCol, setZeroDepthTargetCol] = useState<number | null>(null)
  const [calibrationOpen, setCalibrationOpen] = useState(false)

  useEffect(() => {
    setZeroDepthTargetCol(null)
    setSelectedCol(null)
  }, [activeSheetIdx])

  if (!xlsx) return <UploadStep />

  const sheet = xlsx.dataSheets[activeSheetIdx] ?? xlsx.dataSheets[0]
  const enabledCols = sheet
    ? sheet.profileCols.filter(
        (c) => profiles[`${sheet.name}::${c.index}`]?.enabled,
      )
    : []

  const totalEnabled = xlsx.dataSheets.reduce(
    (n, sh) =>
      n +
      sh.profileCols.filter((c) => profiles[`${sh.name}::${c.index}`]?.enabled).length,
    0,
  )

  const totalCalibrations = xlsx.calibrations.length + userCalibrations.length

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-[120rem] px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <h1 className="font-semibold tracking-tight">ProfileJS</h1>
            <p className="text-xs text-zinc-500">
              {xlsx.dataSheets.length} data sheets · {totalEnabled} enabled profiles ·{' '}
              {totalCalibrations} calibrations · {xlsx.devices.length} devices
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setCalibrationOpen(true)}
              className="px-3 py-1.5 rounded border border-amber-600 bg-amber-950/40 text-amber-100 hover:bg-amber-900/40"
            >
              Calibration
              {userCalibrations.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] px-1 rounded bg-amber-700 text-amber-50 text-[10px] font-semibold">
                  {userCalibrations.length}
                </span>
              )}
            </button>
            <button
              className="text-zinc-400 hover:text-zinc-200 px-2"
              onClick={() => {
                if (confirm('Discard the current session and reload?')) {
                  setXlsx(null)
                }
              }}
            >
              ↻ start over
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-[120rem] px-6 pb-3 flex flex-wrap gap-2">
          {xlsx.dataSheets.map((sh, idx) => {
            const n = sh.profileCols.filter(
              (c) => profiles[`${sh.name}::${c.index}`]?.enabled,
            ).length
            const active = activeSheetIdx === idx
            return (
              <button
                key={sh.name}
                onClick={() => setActiveSheetIdx(idx)}
                className={`text-xs px-2 py-1 rounded border ${
                  active
                    ? 'border-indigo-500 bg-indigo-950 text-indigo-100'
                    : 'border-zinc-800 text-zinc-300 hover:bg-zinc-900'
                }`}
              >
                {sh.name.replace(/^Data \(Profile experiment (\d+)\)$/, 'Exp $1')}{' '}
                <span className="text-zinc-500">({n})</span>
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[120rem] w-full px-6 py-6 space-y-6 flex-1 pb-24 min-w-0">
        <section className="space-y-3 min-w-0">
          <h2 className="text-sm uppercase tracking-wide text-zinc-400">XLSX viewer</h2>
          {sheet ? (
            <SheetViewer
              sheet={sheet}
              selectedColIndex={selectedCol}
              onSelectProfile={(idx) => setSelectedCol(idx)}
              zeroDepthTarget={{ colIndex: zeroDepthTargetCol }}
              onSetZeroDepthTarget={setZeroDepthTargetCol}
              onPickZeroDepth={(colIndex, rowIndex) =>
                setZeroDepth({ sheet: sheet.name, colIndex }, rowIndex < 0 ? null : rowIndex)
              }
            />
          ) : (
            <p className="text-sm text-zinc-500">No data sheet.</p>
          )}
        </section>

        <section className="space-y-3 min-w-0">
          <h2 className="text-sm uppercase tracking-wide text-zinc-400">Enabled profiles</h2>
          {enabledCols.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No profiles enabled in this sheet. Tick a checkbox above the relevant{' '}
              <code className="text-zinc-300">Raw, …(MilliVolt)</code> column.
            </p>
          ) : (
            <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
              {sheet &&
                enabledCols.map((col) => (
                  <ProfilePanel
                    key={`${sheet.name}::${col.index}`}
                    xlsx={xlsx}
                    sheet={sheet}
                    col={col}
                  />
                ))}
            </div>
          )}
        </section>
      </main>

      <ExportPanel />

      {calibrationOpen && (
        <CalibrationDrawer xlsx={xlsx} onClose={() => setCalibrationOpen(false)} />
      )}
    </div>
  )
}
