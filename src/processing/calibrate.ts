import type { ParsedCalibration, ProfileState, SensorKind } from '../types'

/**
 * Calibration → concentration / pH.
 *
 * ============================================================
 *   PLACEHOLDER FORMULA — to be replaced with Damien's spec.
 * ============================================================
 *
 * Current behaviour (placeholder, NOT the final scientific formula):
 *   value = slope * raw_mV + intercept
 *
 * The XLSX's "Calibration data" sheet supplies slope/intercept per
 * (Calibration ID, Sensor). When the user wires a profile to a calibration,
 * we use those numbers. If the user enters a manual override (slope/intercept
 * via the Calibration form), the manual values win.
 *
 * Temperature + salinity compensation are NOT applied here yet —
 * `temperatureC` and `salinityPSU` are captured in state and threaded into
 * this function ready for the real formula. Replace the `compensate` step
 * below with the actual O2 (and pH) compensation when the spec lands.
 */
export type CalibrationInputs = {
  slope: number | null
  intercept: number | null
  temperatureC: number | null
  salinityPSU: number | null
  sensorKind: SensorKind
}

export function resolveCalibration(
  profile: ProfileState,
  calibrations: ParsedCalibration[],
  sensorLabel: string,
): { slope: number | null; intercept: number | null; calibrationId: string | null } {
  // Manual override wins.
  if (profile.manualCalibration.slope != null && profile.manualCalibration.intercept != null) {
    return {
      slope: profile.manualCalibration.slope,
      intercept: profile.manualCalibration.intercept,
      calibrationId: profile.manualCalibration.calibrationId,
    }
  }

  // User-selected calibration ID, matched by sensor label.
  const id = profile.manualCalibration.calibrationId
  if (id) {
    const match = calibrations.find((c) => c.id === id && c.sensor === sensorLabel)
    if (match) {
      return { slope: match.slope, intercept: match.intercept, calibrationId: id }
    }
  }

  // Fall back to the first calibration matching this sensor label.
  const fallback = calibrations.find((c) => c.sensor === sensorLabel)
  if (fallback) {
    return { slope: fallback.slope, intercept: fallback.intercept, calibrationId: fallback.id }
  }

  return { slope: null, intercept: null, calibrationId: null }
}

export function applyCalibration(rawMv: number | null, inputs: CalibrationInputs): number | null {
  if (rawMv == null || inputs.slope == null || inputs.intercept == null) return null
  // PLACEHOLDER: linear only. Real formula goes here.
  const linear = inputs.slope * rawMv + inputs.intercept
  return compensate(linear, inputs)
}

function compensate(value: number, _inputs: CalibrationInputs): number {
  // TODO(formula): apply temperature + salinity compensation per Damien's spec.
  // For now this is a no-op so the pipeline still produces numbers.
  return value
}
