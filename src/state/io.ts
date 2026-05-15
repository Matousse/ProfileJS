import type { SessionV1 } from '../types'

export type ImportResult =
  | { ok: true; session: SessionV1 }
  | { ok: false; error: string }

export function validateSessionJson(raw: unknown): ImportResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Session JSON is not an object.' }
  }
  const obj = raw as Record<string, unknown>
  if (obj.version !== 1) {
    return { ok: false, error: `Unsupported session version: ${String(obj.version)}` }
  }
  if (typeof obj.xlsx !== 'object' || obj.xlsx === null) {
    return { ok: false, error: 'Session JSON missing xlsx fingerprint.' }
  }
  if (typeof obj.profiles !== 'object' || obj.profiles === null) {
    return { ok: false, error: 'Session JSON missing profiles map.' }
  }
  return { ok: true, session: raw as SessionV1 }
}

export function downloadBlob(filename: string, data: string | Blob, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
