import Papa from 'papaparse'
import type { ParsedXlsx, SessionV1 } from '../types'
import { profileKeyStr } from '../types'
import { buildProfileSeries } from '../processing/profile'
import { applyCalibration, resolveCalibration } from '../processing/calibrate'

/**
 * Profile CSV: one row per (sheet, profile column, data row), keeping all
 * enabled profiles together. Every row carries provenance (calibration values,
 * temperature, salinity, incoherence flag) as required by FR20.
 */
export function buildProfileCsv(xlsx: ParsedXlsx, session: SessionV1): string {
  const rows: Record<string, string | number | null>[] = []

  for (const sheet of xlsx.dataSheets) {
    for (const col of sheet.profileCols) {
      const key = profileKeyStr({ sheet: sheet.name, colIndex: col.index })
      const state = session.profiles[key]
      if (!state || !state.enabled) continue

      const cal = resolveCalibration(state, xlsx.calibrations, col.sensorLabel)
      const series = buildProfileSeries(sheet, col.index, state)

      for (const r of series.rows) {
        const calibrated = applyCalibration(r.rawMv, {
          slope: cal.slope,
          intercept: cal.intercept,
          temperatureC: state.temperatureC,
          salinityPSU: state.salinityPSU,
          sensorKind: col.sensor,
        })
        rows.push({
          sheet: sheet.name,
          sensor_kind: col.sensor,
          sensor_label: col.sensorLabel,
          header: col.header,
          row_index: r.rowIndex,
          raw_depth_um: r.rawDepth,
          normalized_depth_um: r.normalizedDepth,
          raw_mv: r.rawMv,
          calibrated_value: calibrated,
          calibration_id: cal.calibrationId,
          calibration_slope: cal.slope,
          calibration_intercept: cal.intercept,
          temperature_c: state.temperatureC,
          salinity_psu: state.salinityPSU,
          incoherent: r.flagged ? 1 : 0,
        })
      }
    }
  }

  return Papa.unparse(rows, { newline: '\n' })
}
