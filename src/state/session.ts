import { create } from 'zustand'
import type { ParsedXlsx, ProfileKey, ProfileState, SessionV1 } from '../types'
import { profileKeyStr } from '../types'

type Store = {
  xlsx: ParsedXlsx | null
  profiles: Record<string, ProfileState>

  setXlsx: (x: ParsedXlsx | null) => void
  resetForNewXlsx: (x: ParsedXlsx) => void
  hydrateFromSession: (session: SessionV1, x: ParsedXlsx) => void

  getProfile: (k: ProfileKey) => ProfileState
  updateProfile: (k: ProfileKey, patch: Partial<ProfileState>) => void
  toggleEnabled: (k: ProfileKey) => void
  setZeroDepth: (k: ProfileKey, rowIndex: number | null) => void
  toggleFlagged: (k: ProfileKey, rowIndex: number) => void

  exportSession: () => SessionV1
}

const defaultProfileState = (): ProfileState => ({
  enabled: true,
  zeroDepthRowIndex: null,
  flaggedRowIndices: [],
  manualCalibration: { slope: null, intercept: null, calibrationId: null },
  temperatureC: null,
  salinityPSU: null,
})

const buildInitialProfiles = (x: ParsedXlsx): Record<string, ProfileState> => {
  const out: Record<string, ProfileState> = {}
  for (const sh of x.dataSheets) {
    for (const col of sh.profileCols) {
      const k = profileKeyStr({ sheet: sh.name, colIndex: col.index })
      out[k] = defaultProfileState()
      // Default-disable "Other" (e.g. Pressure) — user can re-enable.
      if (col.sensor !== 'O2' && col.sensor !== 'pH') {
        out[k].enabled = false
      }
    }
  }
  return out
}

export const useSession = create<Store>((set, get) => ({
  xlsx: null,
  profiles: {},

  setXlsx: (x) => set({ xlsx: x }),

  resetForNewXlsx: (x) => set({ xlsx: x, profiles: buildInitialProfiles(x) }),

  hydrateFromSession: (session, x) => {
    const fresh = buildInitialProfiles(x)
    for (const [k, st] of Object.entries(session.profiles)) {
      if (k in fresh) fresh[k] = { ...fresh[k], ...st }
    }
    set({ xlsx: x, profiles: fresh })
  },

  getProfile: (k) => {
    const key = profileKeyStr(k)
    return get().profiles[key] ?? defaultProfileState()
  },

  updateProfile: (k, patch) =>
    set((s) => {
      const key = profileKeyStr(k)
      const prev = s.profiles[key] ?? defaultProfileState()
      return { profiles: { ...s.profiles, [key]: { ...prev, ...patch } } }
    }),

  toggleEnabled: (k) =>
    set((s) => {
      const key = profileKeyStr(k)
      const prev = s.profiles[key] ?? defaultProfileState()
      return { profiles: { ...s.profiles, [key]: { ...prev, enabled: !prev.enabled } } }
    }),

  setZeroDepth: (k, rowIndex) =>
    set((s) => {
      const key = profileKeyStr(k)
      const prev = s.profiles[key] ?? defaultProfileState()
      return { profiles: { ...s.profiles, [key]: { ...prev, zeroDepthRowIndex: rowIndex } } }
    }),

  toggleFlagged: (k, rowIndex) =>
    set((s) => {
      const key = profileKeyStr(k)
      const prev = s.profiles[key] ?? defaultProfileState()
      const has = prev.flaggedRowIndices.includes(rowIndex)
      const flaggedRowIndices = has
        ? prev.flaggedRowIndices.filter((i) => i !== rowIndex)
        : [...prev.flaggedRowIndices, rowIndex].sort((a, b) => a - b)
      return { profiles: { ...s.profiles, [key]: { ...prev, flaggedRowIndices } } }
    }),

  exportSession: () => {
    const { xlsx, profiles } = get()
    if (!xlsx) throw new Error('No XLSX loaded')
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      xlsx: { name: xlsx.file.name, size: xlsx.file.size, sha256: xlsx.file.sha256 },
      profiles,
    }
  },
}))
