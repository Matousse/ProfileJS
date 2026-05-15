export type SensorKind = 'O2' | 'pH' | 'Pressure' | 'Other'

export type ParsedColumn = {
  /** Column index within the sheet (0-based, A=0) */
  index: number
  /** Raw header text from row 1 */
  header: string
}

export type ParsedProfileColumn = ParsedColumn & {
  /** Detected sensor kind from header text */
  sensor: SensorKind
  /** Sensor label e.g. "Sensor 1 - OX" (parsed out of header) */
  sensorLabel: string
}

export type ParsedSheet = {
  /** Sheet name e.g. "Data (Profile experiment 1)" */
  name: string
  /** Row 1 header strings, indexed by column */
  headers: string[]
  /** Data rows (row 1 excluded). Each row is array of cells aligned to headers. */
  rows: (string | number | null)[][]
  /** Column index of "Profile name" (A) if present */
  profileNameCol: number | null
  /** Column index of "Depth (um)" (B) if present */
  depthCol: number | null
  /** Detected profile (Raw, ... (MilliVolt)) columns */
  profileCols: ParsedProfileColumn[]
}

export type ParsedDevice = {
  instrumentName: string
  channel: string | number
  type: string
  unit: string
  range: string
  sensorName: string
  comment: string
}

export type ParsedCalibration = {
  /** Calibration ID as it appears in the XLSX */
  id: string
  /** Sensor label (e.g. "Sensor 1 - OX") */
  sensor: string
  /** Slope of the calibration line */
  slope: number | null
  /** R² of the calibration fit */
  r2: number | null
  /** Intercept of the calibration line */
  intercept: number | null
}

export type ParsedXlsx = {
  /** Original file metadata */
  file: { name: string; size: number; sha256: string }
  /** Data sheets in original order */
  dataSheets: ParsedSheet[]
  /** Optional supporting sheets */
  devices: ParsedDevice[]
  /** Deduplicated calibrations for processing logic (id + sensor → slope/intercept). */
  calibrations: ParsedCalibration[]
  /** Raw "Calibration data" sheet preserved with all columns for UI display. */
  calibrationSheet: ParsedSheet | null
  /** Names of any other sheets we don't model */
  otherSheets: string[]
}

/** A single profile = one detected column inside one data sheet. */
export type ProfileKey = {
  sheet: string
  colIndex: number
}

export type ProfileState = {
  /** Whether this profile column is enabled (sensor was actually plugged in for this cast). */
  enabled: boolean
  /** Manually-selected 0-depth row index (0-based within data rows). null = not set. */
  zeroDepthRowIndex: number | null
  /** Indices of rows the user has flagged as incoherent. */
  flaggedRowIndices: number[]
  /** Manually-entered calibration overrides (slope/intercept) when XLSX values are absent or user wants to override. */
  manualCalibration: {
    slope: number | null
    intercept: number | null
    /** Optional explicit calibration ID linkage if the user picks one from the Calibration sheet. */
    calibrationId: string | null
  }
  /** User-entered in-situ temperature (°C) for compensation. Optional. */
  temperatureC: number | null
  /** User-entered in-situ salinity (PSU) for compensation. Optional. */
  salinityPSU: number | null
}

export type EnvironmentVars = {
  /** Session-level reference temperature for the O₂ saturation calculator. */
  temperatureC: number | null
  /** Session-level reference salinity for the O₂ saturation calculator. */
  salinityPSU: number | null
}

export type UserCalibration = {
  /** Generated ID, e.g. "USER:1" — distinguishes from XLSX-derived calibration ids. */
  id: string
  /** User-friendly label. */
  label: string
  /** Optional sensor target (e.g. "Sensor 1 - OX"). */
  sensorLabel: string | null
  /** Inputs used to compute the saturation concentration. */
  temperatureC: number
  salinityPSU: number
  /** Computed O₂ saturation concentration (μmol/L). */
  concentrationUmolL: number
  /** Also captured for transparency. */
  concentrationUmolKg: number
  createdAt: string
}

export type SessionV1 = {
  version: 1
  createdAt: string
  xlsx: {
    name: string
    size: number
    sha256: string
  }
  /** One state record per (sheet, colIndex) profile column. */
  profiles: Record<string, ProfileState>
  /** Session-level reference environment used by the saturation calculator. */
  environment: EnvironmentVars
  /** User-defined calibration entries (concentration-at-saturation references). */
  userCalibrations: UserCalibration[]
}

export const profileKeyStr = (k: ProfileKey) => `${k.sheet}::${k.colIndex}`
