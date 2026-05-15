/**
 * XLSX parser for the Unisense Profiling export format.
 *
 * Conventions (locked in with Damien 2026-05-15):
 *  - "Data (Profile experiment N)" sheets contain casts.
 *  - Row 1 = headers; rest = measurements.
 *  - Column A = "Profile name", Column B = "Depth (um)" (always).
 *  - A profile sensor column has a header matching /^Raw,/ AND containing "(MilliVolt)".
 *  - Sensor kind: header contains "OX" → O2, "pH" → pH, "Pressure" → Pressure, else Other.
 *  - "Devices" sheet maps sensor metadata.
 *  - "Calibration data" sheet has slope / R² / intercept per Calibration ID + Sensor.
 *
 * Note on `xlsx` (SheetJS Community): known npm advisory for prototype-pollution
 * in malformed sheets. ProfileJS runs entirely in the user's browser on the
 * user's own files — no attacker-controlled input — so the surface is empty.
 */
import * as XLSX from 'xlsx'
import type {
  ParsedXlsx,
  ParsedSheet,
  ParsedProfileColumn,
  ParsedDevice,
  ParsedCalibration,
  SensorKind,
} from '../types'
import { sha256 } from '../lib/sha256'

const DATA_SHEET_RX = /^Data \(Profile experiment \d+\)$/i
const DEVICES_SHEET = 'Devices'
const CALIBRATION_SHEET = 'Calibration data'

function classifySensor(header: string): SensorKind {
  if (/\bOX\b/i.test(header)) return 'O2'
  if (/\bpH\b/.test(header)) return 'pH'
  if (/pressure/i.test(header)) return 'Pressure'
  return 'Other'
}

function extractSensorLabel(header: string): string {
  // Pull the "Sensor N - X" fragment out of e.g. "Raw, Sensor 1 - OX (MilliVolt)"
  const m = header.match(/Sensor\s*\d+\s*-\s*\S+/i)
  return m ? m[0] : header
}

function isProfileHeader(h: string | null | undefined): boolean {
  if (!h) return false
  if (!/^Raw\b/i.test(h)) return false
  return /\(MilliVolt\)/i.test(h)
}

function aoaOf(sheet: XLSX.WorkSheet): (string | number | null)[][] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  }) as (string | number | null)[][]
}

function parseDataSheet(name: string, sheet: XLSX.WorkSheet): ParsedSheet {
  const aoa = aoaOf(sheet)
  if (aoa.length === 0) {
    return { name, headers: [], rows: [], profileNameCol: null, depthCol: null, profileCols: [] }
  }
  const headerRow = aoa[0].map((c) => (c == null ? '' : String(c)))
  const dataRows = aoa.slice(1)

  const profileNameCol = headerRow.findIndex((h) => /^Profile name$/i.test(h))
  const depthCol = headerRow.findIndex((h) => /^Depth\b/i.test(h))

  const profileCols: ParsedProfileColumn[] = []
  headerRow.forEach((h, idx) => {
    if (!isProfileHeader(h)) return
    profileCols.push({
      index: idx,
      header: h,
      sensor: classifySensor(h),
      sensorLabel: extractSensorLabel(h),
    })
  })

  return {
    name,
    headers: headerRow,
    rows: dataRows,
    profileNameCol: profileNameCol === -1 ? null : profileNameCol,
    depthCol: depthCol === -1 ? null : depthCol,
    profileCols,
  }
}

function parseDevicesSheet(sheet: XLSX.WorkSheet): ParsedDevice[] {
  const aoa = aoaOf(sheet)
  if (aoa.length < 2) return []
  const headers = aoa[0].map((c) => (c == null ? '' : String(c).trim().toLowerCase()))
  const col = (name: string) => headers.indexOf(name)
  const idxInstr = col('instrument name')
  const idxChan = col('channel')
  const idxType = col('type')
  const idxUnit = col('unit')
  const idxRange = col('range')
  const idxSensor = col('sensor name')
  const idxComment = col('comment')

  return aoa.slice(1).map((row): ParsedDevice => ({
    instrumentName: row[idxInstr] != null ? String(row[idxInstr]) : '',
    channel: idxChan >= 0 ? (row[idxChan] as string | number) ?? '' : '',
    type: idxType >= 0 ? String(row[idxType] ?? '') : '',
    unit: idxUnit >= 0 ? String(row[idxUnit] ?? '') : '',
    range: idxRange >= 0 ? String(row[idxRange] ?? '') : '',
    sensorName: idxSensor >= 0 ? String(row[idxSensor] ?? '') : '',
    comment: idxComment >= 0 ? String(row[idxComment] ?? '') : '',
  }))
}

function parseCalibrationSheet(sheet: XLSX.WorkSheet): ParsedCalibration[] {
  const aoa = aoaOf(sheet)
  if (aoa.length < 2) return []
  const headers = aoa[0].map((c) => (c == null ? '' : String(c).trim().toLowerCase()))
  const col = (name: string) => headers.indexOf(name)
  const idxId = col('calibration id')
  const idxSensor = col('sensor')
  const idxSlope = col('slope')
  const idxR2 = col('r2')
  const idxIntercept = col('intercept')

  // Each Calibration ID may have multiple rows (one per calibrated point).
  // Slope/R²/Intercept are identical across rows for a given (id, sensor). Dedup.
  const seen = new Set<string>()
  const out: ParsedCalibration[] = []
  for (const row of aoa.slice(1)) {
    const id = idxId >= 0 ? String(row[idxId] ?? '') : ''
    const sensor = idxSensor >= 0 ? String(row[idxSensor] ?? '') : ''
    if (!id || !sensor) continue
    const key = `${id}::${sensor}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id,
      sensor,
      slope: idxSlope >= 0 ? toNum(row[idxSlope]) : null,
      r2: idxR2 >= 0 ? toNum(row[idxR2]) : null,
      intercept: idxIntercept >= 0 ? toNum(row[idxIntercept]) : null,
    })
  }
  return out
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export async function parseXlsxFile(file: File): Promise<ParsedXlsx> {
  const buf = await file.arrayBuffer()
  const hash = await sha256(buf)
  const wb = XLSX.read(buf, { type: 'array' })

  const dataSheets: ParsedSheet[] = []
  let devices: ParsedDevice[] = []
  let calibrations: ParsedCalibration[] = []
  let calibrationSheet: ParsedSheet | null = null
  const otherSheets: string[] = []

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    if (DATA_SHEET_RX.test(name)) {
      dataSheets.push(parseDataSheet(name, sheet))
    } else if (name === DEVICES_SHEET) {
      devices = parseDevicesSheet(sheet)
    } else if (name === CALIBRATION_SHEET) {
      calibrations = parseCalibrationSheet(sheet)
      // Reuse the data-sheet parser to capture the raw rows + headers for UI;
      // profileCols / depthCol will be empty since this sheet has no Raw columns.
      calibrationSheet = parseDataSheet(name, sheet)
    } else {
      otherSheets.push(name)
    }
  }

  return {
    file: { name: file.name, size: file.size, sha256: hash },
    dataSheets,
    devices,
    calibrations,
    calibrationSheet,
    otherSheets,
  }
}
