import { useRef, useState } from 'react'
import { parseXlsxFile } from '../parser/xlsx'
import { useSession } from '../state/session'
import { validateSessionJson } from '../state/io'

export function UploadStep() {
  const [pendingSession, setPendingSession] = useState<{
    file: File
    json: ReturnType<typeof validateSessionJson> & { ok: true }
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const sessionInputRef = useRef<HTMLInputElement>(null)
  const resetForNewXlsx = useSession((s) => s.resetForNewXlsx)
  const hydrateFromSession = useSession((s) => s.hydrateFromSession)

  const onPickXlsx = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const parsed = await parseXlsxFile(file)
      if (parsed.dataSheets.length === 0) {
        setError('No "Data (Profile experiment N)" sheets detected in this XLSX.')
        return
      }
      if (pendingSession) {
        if (pendingSession.json.session.xlsx.sha256 !== parsed.file.sha256) {
          const proceed = confirm(
            'The XLSX SHA-256 does not match the one captured in the session JSON. Hydrate anyway?',
          )
          if (!proceed) {
            setBusy(false)
            return
          }
        }
        hydrateFromSession(pendingSession.json.session, parsed)
        setPendingSession(null)
      } else {
        resetForNewXlsx(parsed)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onPickSession = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const result = validateSessionJson(parsed)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPendingSession({ file, json: result })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">ProfileJS</h1>
      <p className="mt-2 text-zinc-400">
        Static, client-only oxygen / pH profile processor. Nothing leaves your browser.
      </p>

      <div className="mt-10 grid gap-6">
        <Card title="1. Load XLSX">
          <p className="text-sm text-zinc-400 mb-3">
            Drop in your Unisense Profiling export. The app detects each{' '}
            <code className="text-zinc-300">Data (Profile experiment N)</code> tab and the{' '}
            <code className="text-zinc-300">Raw, Sensor … (MilliVolt)</code> columns within.
          </p>
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-white file:hover:bg-indigo-500"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onPickXlsx(f)
            }}
          />
        </Card>

        <Card title="2. (optional) Restore a session">
          <p className="text-sm text-zinc-400 mb-3">
            If you have a previously exported session JSON, load it <em>first</em>, then load
            its paired XLSX above. The SHA-256 will be checked.
          </p>
          <input
            ref={sessionInputRef}
            type="file"
            accept=".json,application/json"
            className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-white file:hover:bg-zinc-600"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onPickSession(f)
            }}
          />
          {pendingSession && (
            <p className="mt-3 text-sm text-amber-300">
              Session loaded: expects XLSX <code className="text-zinc-200">{pendingSession.json.session.xlsx.name}</code>{' '}
              (SHA-256 {pendingSession.json.session.xlsx.sha256.slice(0, 12)}…). Pick the XLSX above to hydrate.
            </p>
          )}
        </Card>

        {busy && <p className="text-zinc-400">Parsing…</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      <h2 className="text-lg font-medium mb-3">{title}</h2>
      {children}
    </div>
  )
}
