import { useEffect, useState } from 'react'
import { useSession } from './state/session'
import { UploadStep } from './ui/upload-step'
import { SheetViewer } from './ui/sheet-viewer'
import { ProfilePanel } from './ui/profile-panel'
import { ExportPanel } from './ui/export-panel'
import { CalibrationViewer } from './ui/calibration-viewer'

type ActiveTab = { kind: 'data'; sheetIdx: number } | { kind: 'calibration' }

export function App() {
  const xlsx = useSession((s) => s.xlsx)
  const profiles = useSession((s) => s.profiles)
  const setXlsx = useSession((s) => s.setXlsx)
  const setZeroDepth = useSession((s) => s.setZeroDepth)

  const [tab, setTab] = useState<ActiveTab>({ kind: 'data', sheetIdx: 0 })
  const [selectedCol, setSelectedCol] = useState<number | null>(null)
  const [zeroDepthTargetCol, setZeroDepthTargetCol] = useState<number | null>(null)

  // Clear zero-depth target when the user switches data sheets or tab kind.
  useEffect(() => {
    setZeroDepthTargetCol(null)
    setSelectedCol(null)
  }, [tab])

  if (!xlsx) return <UploadStep />

  const sheet =
    tab.kind === 'data' ? (xlsx.dataSheets[tab.sheetIdx] ?? xlsx.dataSheets[0]) : null
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

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-[120rem] px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <h1 className="font-semibold tracking-tight">ProfileJS</h1>
            <p className="text-xs text-zinc-500">
              {xlsx.dataSheets.length} data sheets · {totalEnabled} enabled profiles ·{' '}
              {xlsx.calibrations.length} calibrations · {xlsx.devices.length} devices
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              className="text-zinc-400 hover:text-zinc-200"
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
            const active = tab.kind === 'data' && tab.sheetIdx === idx
            return (
              <button
                key={sh.name}
                onClick={() => setTab({ kind: 'data', sheetIdx: idx })}
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
          {xlsx.calibrationSheet && (
            <button
              key="__calibration__"
              onClick={() => setTab({ kind: 'calibration' })}
              className={`text-xs px-2 py-1 rounded border ml-2 ${
                tab.kind === 'calibration'
                  ? 'border-amber-500 bg-amber-950/40 text-amber-100'
                  : 'border-zinc-800 text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              Calibration data{' '}
              <span className="text-zinc-500">({xlsx.calibrations.length})</span>
            </button>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-[120rem] w-full px-6 py-6 space-y-6 flex-1 pb-24 min-w-0">
        {tab.kind === 'data' ? (
          <>
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
          </>
        ) : (
          <section className="space-y-3 min-w-0">
            <h2 className="text-sm uppercase tracking-wide text-zinc-400">Calibration viewer</h2>
            {xlsx.calibrationSheet ? (
              <CalibrationViewer xlsx={xlsx} sheet={xlsx.calibrationSheet} />
            ) : (
              <p className="text-sm text-zinc-500">No Calibration data sheet in this XLSX.</p>
            )}
          </section>
        )}
      </main>

      <ExportPanel />
    </div>
  )
}
