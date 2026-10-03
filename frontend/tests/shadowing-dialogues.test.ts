import { describe, expect, it } from "vitest"
import { getAvailableConversationScenes } from "@/lib/conversation-scenes"
import { createDefaultLearningMemory } from "@/lib/memory"
import { createMemoryShadowingDialogue, getShadowingDialogues } from "@/lib/shadowing-dialogues"

describe("shadowing dialogues", () => {
  it("provides a multi-turn script for every available scene", () => {
    const scenes = getAvailableConversationScenes("all")
    const dialogues = getShadowingDialogues()

    expect(dialogues).toHaveLength(scenes.length)
    expect(dialogues.map((dialogue) => dialogue.sceneId)).toEqual(
      scenes.map((scene) => scene.id),
    )
    expect(dialogues.every((dialogue) => dialogue.lines.length >= 4)).toBe(true)
    expect(
      dialogues.every(
        (dialogue) =>
          dialogue.lines.some((line) => line.speaker === "learner") &&
          dialogue.lines.some((line) => line.speaker === "partner"),
      ),
    ).toBe(true)
  })

  it("keeps a requested memory inside its transfer-scene dialogue", () => {
    const memory = createDefaultLearningMemory(new Date("2026-08-30T08:00:00.000Z"))
    const item = memory.items.find((candidate) => candidate.id === "polite-request")
    if (!item) {
      throw new Error("Missing polite request memory")
    }

    const dialogue = createMemoryShadowingDialogue(item)

    expect(dialogue).toMatchObject({
      sceneId: "restaurant",
      sceneTitle: "餐厅用餐",
      targetMemoryItemId: "polite-request",
    })
    expect(dialogue.lines).toContainEqual(
      expect.objectContaining({
        speaker: "learner",
        text: "Could I get something, please?",
      }),
    )
  })

  it("uses a dedicated role-balanced preset for idiomatic English", () => {
    const dialogue = getShadowingDialogues().find(
      (candidate) => candidate.sceneId === "idiomatic-english",
    )

    expect(dialogue).toMatchObject({
      scriptKind: "preset",
      focusWord: "tabs",
    })
    expect(dialogue?.lines).toHaveLength(12)
    expect(dialogue?.lines.filter((line) => line.speaker === "learner")).toHaveLength(6)
    expect(dialogue?.lines.map((line) => line.text).join(" ")).toContain("keeping tabs on")
    expect(dialogue?.lines.map((line) => line.text).join(" ")).toContain("circle back")
  })
})
