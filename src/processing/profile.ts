import type { ParsedSheet, ProfileState } from '../types'

export type ProfileRow = {
  /** Original row index inside the sheet's data rows (0-based, excludes header). */
  rowIndex: number
  /** Raw depth value from column B. */
  rawDepth: number | null
  /** Depth normalized to the user-marked 0-depth point. */
  normalizedDepth: number | null
  /** Raw sensor value in mV from the profile column. */
  rawMv: number | null
  /** User-flagged incoherent. */
  flagged: boolean
}

export type ProfileSeries = {
  sheet: string
  header: string
  rows: ProfileRow[]
}

export function buildProfileSeries(
  sheet: ParsedSheet,
  colIndex: number,
  state: ProfileState,
): ProfileSeries {
  const depthCol = sheet.depthCol
  const flagged = new Set(state.flaggedRowIndices)
  const zeroDepth = state.zeroDepthValue

  const rows: ProfileRow[] = sheet.rows.map((row, i) => {
    const rawDepth = depthCol != null ? numOrNull(row[depthCol]) : null
    const normalizedDepth =
      rawDepth != null && zeroDepth != null ? rawDepth - zeroDepth : null
    const rawMv = numOrNull(row[colIndex])
    return {
      rowIndex: i,
      rawDepth,
      normalizedDepth,
      rawMv,
      flagged: flagged.has(i),
    }
  })

  return { sheet: sheet.name, header: sheet.headers[colIndex] ?? '', rows }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
