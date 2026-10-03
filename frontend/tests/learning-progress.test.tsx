// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SceneLibrary, SceneLibrarySummary } from "@/features/scenes/scene-library"
import { sceneItems } from "@/lib/demo-data"
import {
  getCurrentLearningLevel,
  getLearningLevelProgress,
  getSceneLearningProgress,
  getSceneLibraryStats,
  targetTurnsPerScene,
} from "@/lib/learning-progress"
import { createEmptyLearningMemory, type LearningMemoryState } from "@/lib/memory"

const mocks = vi.hoisted(() => ({
  state: null as LearningMemoryState | null,
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({ state: mocks.state }),
}))

function getScene(sceneId: string) {
  const scene = sceneItems.find((item) => item.id === sceneId)
  if (!scene) {
    throw new Error(`Missing test scene: ${sceneId}`)
  }
  return scene
}

beforeEach(() => {
  mocks.state = createEmptyLearningMemory(new Date("2026-08-29T08:00:00.000Z"))
})

afterEach(cleanup)

describe("learning progress", () => {
  it("derives mastery only from real practice records", () => {
    const scene = getScene("small-talk")
    expect(scene.status).toBe("mastered")
    expect(getSceneLearningProgress(scene)).toMatchObject({
      mastered: false,
      progress: 0,
      status: "active",
    })

    expect(
      getSceneLearningProgress(scene, {
        sceneId: scene.id,
        sceneTitle: scene.title,
        turns: targetTurnsPerScene,
        accurateTurns: 5,
        practicedExpressions: [],
        lastPracticedAt: "2026-08-29T08:00:00.000Z",
      }),
    ).toMatchObject({
      mastered: true,
      progress: 100,
      status: "mastered",
    })
  })

  it("keeps locked scenes unavailable even if stale progress exists", () => {
    const scene = getScene("presentation")
    const staleProgress = {
      sceneId: scene.id,
      sceneTitle: scene.title,
      turns: 12,
      accurateTurns: 12,
      practicedExpressions: [],
      lastPracticedAt: "2026-08-29T08:00:00.000Z",
    }
    const progress = getSceneLearningProgress(scene, staleProgress)

    expect(progress).toMatchObject({
      completedTurns: 0,
      mastered: false,
      progress: 0,
      status: "locked",
    })
    expect(getSceneLibraryStats([scene], { [scene.id]: staleProgress }).practicedCount).toBe(0)
  })

  it("does not let locked scenes prevent progression to the next level", () => {
    if (!mocks.state) {
      throw new Error("Missing learning memory state")
    }
    for (const scene of sceneItems) {
      if (scene.status === "locked" || scene.level === "C1") {
        continue
      }
      mocks.state.sceneProgress[scene.id] = {
        sceneId: scene.id,
        sceneTitle: scene.title,
        turns: targetTurnsPerScene,
        accurateTurns: targetTurnsPerScene,
        practicedExpressions: [],
        lastPracticedAt: "2026-08-29T08:00:00.000Z",
      }
    }

    expect(getLearningLevelProgress(sceneItems, mocks.state.sceneProgress, "B2")).toMatchObject(
      {
        progress: 100,
        sceneCount: sceneItems.filter(
          (scene) => scene.level === "B2" && scene.status !== "locked",
        ).length,
      },
    )
    expect(getCurrentLearningLevel(sceneItems, mocks.state.sceneProgress)).toBe("C1")
  })

  it("shows real mastery totals and renders locked cards without links", () => {
    if (!mocks.state) {
      throw new Error("Missing learning memory state")
    }
    const scene = getScene("coffee")
    const lockedScene = getScene("presentation")
    const testScenes = [scene, lockedScene]
    mocks.state.sceneProgress[scene.id] = {
      sceneId: scene.id,
      sceneTitle: scene.title,
      turns: 6,
      accurateTurns: 5,
      practicedExpressions: [],
      lastPracticedAt: "2026-08-29T08:00:00.000Z",
    }

    expect(getSceneLibraryStats(testScenes, mocks.state.sceneProgress).masteredCount).toBe(1)

    render(
      <>
        <SceneLibrarySummary scenes={testScenes} />
        <SceneLibrary scenes={testScenes} />
      </>,
    )

    expect(screen.getByText("2 个场景 · 已掌握 1 个")).toBeTruthy()
    expect(screen.getByRole("link", { name: /咖啡店点单场景/ }).getAttribute("href")).toBe(
      "/workspace/conversation?scene=coffee",
    )
    expect(screen.queryByRole("link", { name: /英文演讲场景/ })).toBeNull()
    expect(screen.getByText("英文演讲").closest('[aria-disabled="true"]')).toBeTruthy()
  })
})
