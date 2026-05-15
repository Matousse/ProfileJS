import { useSession } from '../state/session'
import { buildProfileCsv } from '../export/profile-csv'
import { buildResultsCsv } from '../export/results-csv'
import { downloadBlob } from '../state/io'

export function ExportPanel() {
  const xlsx = useSession((s) => s.xlsx)
  const exportSession = useSession((s) => s.exportSession)

  if (!xlsx) return null

  const stem = xlsx.file.name.replace(/\.xlsx$/i, '') || 'profilejs'

  const onDownloadProfile = () => {
    const session = exportSession()
    const csv = buildProfileCsv(xlsx, session)
    downloadBlob(`${stem}.profile.csv`, csv, 'text/csv;charset=utf-8')
  }
  const onDownloadResults = () => {
    const session = exportSession()
    const csv = buildResultsCsv(xlsx, session)
    downloadBlob(`${stem}.results.csv`, csv, 'text/csv;charset=utf-8')
  }
  const onDownloadSession = () => {
    const session = exportSession()
    downloadBlob(`${stem}.session.json`, JSON.stringify(session, null, 2), 'application/json')
  }

  return (
    <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur px-6 py-3">
      <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
        <div className="text-xs text-zinc-500">
          {xlsx.file.name} · {(xlsx.file.size / 1024).toFixed(1)} KB · sha256{' '}
          <code className="text-zinc-300">{xlsx.file.sha256.slice(0, 10)}…</code>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onDownloadProfile}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500"
          >
            Profile CSV
          </button>
          <button
            onClick={onDownloadResults}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-500"
          >
            Results CSV
          </button>
          <button
            onClick={onDownloadSession}
            className="px-3 py-1.5 rounded bg-zinc-700 text-white text-sm hover:bg-zinc-600"
          >
            Session JSON
          </button>
        </div>
      </div>
    </div>
  )
}
