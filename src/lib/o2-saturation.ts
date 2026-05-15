/**
 * Oxygen saturation concentration in seawater.
 *
 * Solubility: Garcia & Gordon (1992), "Oxygen solubility in seawater:
 * Better fitting equations", Limnology and Oceanography 37(6) — using the
 * Benson & Krause refit constants. Output: μmol/kg.
 *
 *   ln(C*) = A0 + A1·Ts + A2·Ts² + A3·Ts³ + A4·Ts⁴ + A5·Ts⁵
 *          + S·(B0 + B1·Ts + B2·Ts² + B3·Ts³)
 *          + C0·S²
 *
 *   where  Ts = ln((298.15 − T) / (T + 273.15))
 *
 * Density: UNESCO EOS-80 surface seawater polynomial (atmospheric pressure),
 * used to convert μmol/kg → μmol/L since the XLSX template reports μmol/L.
 *
 * Valid range: T ≈ −2 to 40 °C, S ≈ 0 to 42 PSU, atmospheric pressure.
 * No vapor-pressure / atmospheric-pressure correction applied — assumes
 * 100 % air-saturated water at 1 atm.
 */

const A0 = 5.80871
const A1 = 3.20291
const A2 = 4.17887
const A3 = 5.10006
const A4 = -9.86643e-2
const A5 = 3.80369
const B0 = -7.01577e-3
const B1 = -7.70028e-3
const B2 = -1.13864e-2
const B3 = -9.51519e-3
const C0 = -2.75915e-7

export type O2SaturationResult = {
  /** μmol O₂ per kg of seawater (Garcia-Gordon direct output). */
  umolPerKg: number
  /** μmol O₂ per litre of seawater (after EOS-80 density conversion). */
  umolPerL: number
  /** Seawater density (kg/m³) at T, S, surface pressure. */
  densityKgPerM3: number
}

export function computeO2Saturation(temperatureC: number, salinityPSU: number): O2SaturationResult {
  const T = temperatureC
  const S = salinityPSU
  const Ts = Math.log((298.15 - T) / (T + 273.15))
  const Ts2 = Ts * Ts
  const Ts3 = Ts2 * Ts
  const Ts4 = Ts3 * Ts
  const Ts5 = Ts4 * Ts

  const lnC =
    A0 +
    A1 * Ts +
    A2 * Ts2 +
    A3 * Ts3 +
    A4 * Ts4 +
    A5 * Ts5 +
    S * (B0 + B1 * Ts + B2 * Ts2 + B3 * Ts3) +
    C0 * S * S

  const umolPerKg = Math.exp(lnC)
  const densityKgPerM3 = seawaterDensityEos80(T, S)
  const umolPerL = (umolPerKg * densityKgPerM3) / 1000

  return { umolPerKg, umolPerL, densityKgPerM3 }
}

/** UNESCO EOS-80 surface seawater density at atmospheric pressure (kg/m³). */
function seawaterDensityEos80(T: number, S: number): number {
  const t2 = T * T
  const t3 = t2 * T
  const t4 = t3 * T
  const t5 = t4 * T

  const rhoW =
    999.842594 +
    6.793952e-2 * T +
    -9.09529e-3 * t2 +
    1.001685e-4 * t3 +
    -1.120083e-6 * t4 +
    6.536336e-9 * t5

  const A = 8.24493e-1 + -4.0899e-3 * T + 7.6438e-5 * t2 + -8.2467e-7 * t3 + 5.3875e-9 * t4
  const B = -5.72466e-3 + 1.0227e-4 * T + -1.6546e-6 * t2
  const C = 4.8314e-4

  return rhoW + A * S + B * Math.pow(S, 1.5) + C * S * S
}
