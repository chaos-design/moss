import type { SceneItem, SceneLevel } from "@/lib/demo-data"
import type { LearningMemoryState, SceneMemoryProgress } from "@/lib/memory"

export const targetTurnsPerScene = 6
export const learningLevelOrder: SceneLevel[] = ["A2", "B1", "B2", "C1"]

export function getSceneLearningProgress(scene: SceneItem, memory?: SceneMemoryProgress) {
  const turns = memory?.turns ?? 0
  const accurateTurns = memory?.accurateTurns ?? 0
  const locked = scene.status === "locked"
  const completedTurns = locked ? 0 : Math.min(targetTurnsPerScene, turns)
  const progress = Math.round((completedTurns / targetTurnsPerScene) * 100)
  const mastered = !locked && turns >= targetTurnsPerScene && accurateTurns / turns >= 0.8

  return {
    accurateTurns,
    completedTurns,
    mastered,
    progress,
    status: locked ? "locked" : mastered ? "mastered" : "active",
    turns,
  } as const
}

export function getSceneLibraryStats(
  scenes: readonly SceneItem[],
  sceneProgress: LearningMemoryState["sceneProgress"],
) {
  let masteredCount = 0
  let practicedCount = 0

  for (const scene of scenes) {
    const progress = getSceneLearningProgress(scene, sceneProgress[scene.id])
    if (progress.status !== "locked" && progress.turns > 0) {
      practicedCount += 1
    }
    if (progress.mastered) {
      masteredCount += 1
    }
  }

  return {
    masteredCount,
    practicedCount,
    totalCount: scenes.length,
  }
}

export function getLearningLevelProgress(
  scenes: readonly SceneItem[],
  sceneProgress: LearningMemoryState["sceneProgress"],
  level: SceneLevel,
) {
  const availableScenes = scenes.filter(
    (scene) => scene.level === level && scene.status !== "locked",
  )
  const completedTurns = availableScenes.reduce(
    (sum, scene) =>
      sum + getSceneLearningProgress(scene, sceneProgress[scene.id]).completedTurns,
    0,
  )
  const targetTurns = availableScenes.length * targetTurnsPerScene

  return {
    completedTurns,
    practicedScenes: availableScenes.filter(
      (scene) => getSceneLearningProgress(scene, sceneProgress[scene.id]).turns > 0,
    ).length,
    progress: targetTurns > 0 ? Math.round((completedTurns / targetTurns) * 100) : 100,
    sceneCount: availableScenes.length,
  }
}

export function getCurrentLearningLevel(
  scenes: readonly SceneItem[],
  sceneProgress: LearningMemoryState["sceneProgress"],
) {
  return (
    learningLevelOrder.find(
      (level) => getLearningLevelProgress(scenes, sceneProgress, level).progress < 100,
    ) ??
    learningLevelOrder.at(-1) ??
    "C1"
  )
}
