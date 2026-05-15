import { create } from 'zustand'
import type {
  EnvironmentVars,
  ParsedXlsx,
  ProfileKey,
  ProfileState,
  SessionV1,
  UserCalibration,
} from '../types'
import { profileKeyStr } from '../types'

type Store = {
  xlsx: ParsedXlsx | null
  profiles: Record<string, ProfileState>
  environment: EnvironmentVars
  userCalibrations: UserCalibration[]

  setXlsx: (x: ParsedXlsx | null) => void
  resetForNewXlsx: (x: ParsedXlsx) => void
  hydrateFromSession: (session: SessionV1, x: ParsedXlsx) => void

  getProfile: (k: ProfileKey) => ProfileState
  updateProfile: (k: ProfileKey, patch: Partial<ProfileState>) => void
  toggleEnabled: (k: ProfileKey) => void
  setZeroDepth: (k: ProfileKey, depthValue: number | null) => void
  toggleFlagged: (k: ProfileKey, rowIndex: number) => void

  setEnvironment: (patch: Partial<EnvironmentVars>) => void
  addUserCalibration: (cal: Omit<UserCalibration, 'id' | 'createdAt'>) => UserCalibration
  removeUserCalibration: (id: string) => void

  exportSession: () => SessionV1
}

const defaultProfileState = (): ProfileState => ({
  enabled: true,
  zeroDepthValue: null,
  flaggedRowIndices: [],
  manualCalibration: { slope: null, intercept: null, calibrationId: null },
  temperatureC: null,
  salinityPSU: null,
})

const defaultEnvironment = (): EnvironmentVars => ({
  temperatureC: null,
  salinityPSU: null,
})

const buildInitialProfiles = (x: ParsedXlsx): Record<string, ProfileState> => {
  const out: Record<string, ProfileState> = {}
  for (const sh of x.dataSheets) {
    for (const col of sh.profileCols) {
      const k = profileKeyStr({ sheet: sh.name, colIndex: col.index })
      out[k] = defaultProfileState()
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
  environment: defaultEnvironment(),
  userCalibrations: [],

  setXlsx: (x) => set({ xlsx: x }),

  resetForNewXlsx: (x) =>
    set({
      xlsx: x,
      profiles: buildInitialProfiles(x),
      environment: defaultEnvironment(),
      userCalibrations: [],
    }),

  hydrateFromSession: (session, x) => {
    const fresh = buildInitialProfiles(x)
    for (const [k, st] of Object.entries(session.profiles)) {
      if (k in fresh) fresh[k] = { ...fresh[k], ...st }
    }
    set({
      xlsx: x,
      profiles: fresh,
      environment: session.environment ?? defaultEnvironment(),
      userCalibrations: session.userCalibrations ?? [],
    })
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

  setZeroDepth: (k, depthValue) =>
    set((s) => {
      const key = profileKeyStr(k)
      const prev = s.profiles[key] ?? defaultProfileState()
      return { profiles: { ...s.profiles, [key]: { ...prev, zeroDepthValue: depthValue } } }
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

  setEnvironment: (patch) =>
    set((s) => ({ environment: { ...s.environment, ...patch } })),

  addUserCalibration: (cal) => {
    const existing = get().userCalibrations
    const nextNum = existing.reduce((max, c) => {
      const m = c.id.match(/^USER:(\d+)$/)
      return m ? Math.max(max, Number(m[1])) : max
    }, 0) + 1
    const entry: UserCalibration = {
      ...cal,
      id: `USER:${nextNum}`,
      createdAt: new Date().toISOString(),
    }
    set({ userCalibrations: [...existing, entry] })
    return entry
  },

  removeUserCalibration: (id) =>
    set((s) => ({ userCalibrations: s.userCalibrations.filter((c) => c.id !== id) })),

  exportSession: () => {
    const { xlsx, profiles, environment, userCalibrations } = get()
    if (!xlsx) throw new Error('No XLSX loaded')
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      xlsx: { name: xlsx.file.name, size: xlsx.file.size, sha256: xlsx.file.sha256 },
      profiles,
      environment,
      userCalibrations,
    }
  },
}))
