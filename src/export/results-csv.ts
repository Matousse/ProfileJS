import Papa from 'papaparse'
import type { ParsedXlsx, SessionV1 } from '../types'
import { profileKeyStr } from '../types'
import { buildProfileSeries } from '../processing/profile'
import { applyCalibration, resolveCalibration } from '../processing/calibrate'

/**
 * Results CSV: one row per enabled profile, summarizing its processed values.
 * Provenance fields (calibration, temp, salinity) are repeated per row per FR20.
 */
export function buildResultsCsv(xlsx: ParsedXlsx, session: SessionV1): string {
  const rows: Record<string, string | number | null>[] = []

  for (const sheet of xlsx.dataSheets) {
    for (const col of sheet.profileCols) {
      const key = profileKeyStr({ sheet: sheet.name, colIndex: col.index })
      const state = session.profiles[key]
      if (!state || !state.enabled) continue

      const cal = resolveCalibration(state, xlsx.calibrations, col.sensorLabel)
      const series = buildProfileSeries(sheet, col.index, state)

      const valid = series.rows.filter((r) => !r.flagged && r.rawMv != null)
      const calibratedValues: number[] = []
      for (const r of valid) {
        const v = applyCalibration(r.rawMv, {
          slope: cal.slope,
          intercept: cal.intercept,
          temperatureC: state.temperatureC,
          salinityPSU: state.salinityPSU,
          sensorKind: col.sensor,
        })
        if (v != null) calibratedValues.push(v)
      }
      const depths = valid.map((r) => r.normalizedDepth).filter((d): d is number => d != null)

      rows.push({
        sheet: sheet.name,
        sensor_kind: col.sensor,
        sensor_label: col.sensorLabel,
        header: col.header,
        n_total_rows: series.rows.length,
        n_used_rows: valid.length,
        n_flagged_rows: state.flaggedRowIndices.length,
        min_normalized_depth_um: depths.length ? Math.min(...depths) : null,
        max_normalized_depth_um: depths.length ? Math.max(...depths) : null,
        mean_calibrated: mean(calibratedValues),
        min_calibrated: calibratedValues.length ? Math.min(...calibratedValues) : null,
        max_calibrated: calibratedValues.length ? Math.max(...calibratedValues) : null,
        calibration_id: cal.calibrationId,
        calibration_slope: cal.slope,
        calibration_intercept: cal.intercept,
        temperature_c: state.temperatureC,
        salinity_psu: state.salinityPSU,
        zero_depth_value_um: state.zeroDepthValue,
      })
    }
  }

  return Papa.unparse(rows, { newline: '\n' })
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}
