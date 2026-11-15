import type { ShadowingSpeaker } from "./shadowing-dialogues"

// 跟读的本地会话状态：学习位置（当前场景/目标句/扮演角色）与侧栏偏好（等级筛选、随机
// 模式）。刷新后回到上次学到的地方、按偏好组织场景列表。这些是纯导航/便利状态，不是
// 学习事件——不进学习记忆，也不参与云端同步。

export const shadowingPositionStorageKey = "moss:shadowing-position:v1"
export const shadowingLevelFilterStorageKey = "moss:shadowing-filter:v1"
export const shadowingRandomModeStorageKey = "moss:shadowing-random:v1"

export type ShadowingPosition = {
  dialogueId: string
  lineId: string | null
  role: ShadowingSpeaker
}

export const shadowingLevelFilters = ["all", "A2", "B1", "B2", "C1"] as const

export type ShadowingLevelFilter = (typeof shadowingLevelFilters)[number]

function isSpeaker(value: unknown): value is ShadowingSpeaker {
  return value === "learner" || value === "partner"
}

function readJson<T>(key: string, validate: (value: unknown) => T | null): T | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    return validate(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储不可用（隐私模式/配额）时静默跳过：这些都是便利状态。
  }
}

export function readShadowingPosition(): ShadowingPosition | null {
  return readJson(shadowingPositionStorageKey, (value) => {
    const parsed = value as Partial<ShadowingPosition>
    if (
      typeof parsed?.dialogueId !== "string" ||
      !parsed.dialogueId ||
      !(parsed.lineId === null || typeof parsed.lineId === "string") ||
      !isSpeaker(parsed.role)
    ) {
      return null
    }
    return {
      dialogueId: parsed.dialogueId,
      lineId: parsed.lineId || null,
      role: parsed.role,
    }
  })
}

export function saveShadowingPosition(position: ShadowingPosition) {
  writeJson(shadowingPositionStorageKey, position)
}

export function parseShadowingLevelFilter(value: string | null): ShadowingLevelFilter {
  return shadowingLevelFilters.includes(value as ShadowingLevelFilter)
    ? (value as ShadowingLevelFilter)
    : "all"
}

export function readShadowingLevelFilter(): ShadowingLevelFilter {
  if (typeof window === "undefined") {
    return "all"
  }
  return parseShadowingLevelFilter(window.localStorage.getItem(shadowingLevelFilterStorageKey))
}

export function saveShadowingLevelFilter(filter: ShadowingLevelFilter) {
  writeJson(shadowingLevelFilterStorageKey, filter)
}

export function readShadowingRandomMode(): boolean {
  return readJson(shadowingRandomModeStorageKey, (value) => value === true) ?? false
}

export function saveShadowingRandomMode(enabled: boolean) {
  writeJson(shadowingRandomModeStorageKey, enabled)
}
