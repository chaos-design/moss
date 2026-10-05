import { describe, expect, it } from "vitest"
import { getAvailableConversationScenes } from "@/lib/conversation-scenes"
import { createDefaultLearningMemory } from "@/lib/memory"
import {
  createMemoryShadowingDialogue,
  getShadowingDialogues,
  getShadowingTurn,
} from "@/lib/shadowing-dialogues"

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

  it("links every practice line to the partner cue, reply, and same-role next line", () => {
    const dialogue = getShadowingDialogues().find((item) => item.sceneId === "coffee")
    if (!dialogue) {
      throw new Error("Missing coffee shop dialogue")
    }

    const [opening, firstTurn, firstReply, secondTurn, secondReply, closing] = dialogue.lines
    if (!opening || !firstTurn || !firstReply || !secondTurn || !secondReply || !closing) {
      throw new Error("Coffee shop dialogue must contain six alternating lines")
    }

    // 首句之前没有提示；角色台词按脚本顺序推进，不在角色之间跳转。
    expect(getShadowingTurn(dialogue, opening)).toEqual({
      cue: null,
      next: dialogue.lines.filter((line) => line.speaker === "partner")[1],
      reply: firstTurn,
    })
    expect(getShadowingTurn(dialogue, firstTurn)).toEqual({
      cue: opening,
      next: secondTurn,
      reply: firstReply,
    })
    expect(getShadowingTurn(dialogue, secondReply)).toEqual({
      cue: secondTurn,
      next: null,
      reply: closing,
    })
    // 末句之后没有接话也没有下一句，工作区据此停止而不回绕。
    expect(getShadowingTurn(dialogue, closing)).toEqual({
      cue: secondReply,
      next: null,
      reply: null,
    })
  })

  it("resolves turns for a memory-targeted script and rejects unknown lines", () => {
    const memory = createDefaultLearningMemory(new Date("2026-08-30T08:00:00.000Z"))
    const item = memory.items.find((candidate) => candidate.id === "polite-request")
    if (!item) {
      throw new Error("Missing polite request memory")
    }

    const dialogue = createMemoryShadowingDialogue(item)
    const [first, second] = dialogue.lines.filter((line) => line.speaker === "learner")
    if (!first || !second) {
      throw new Error("Memory dialogue must contain two learner lines")
    }

    expect(getShadowingTurn(dialogue, first)).toMatchObject({
      cue: { speaker: "partner" },
      next: second,
      reply: expect.objectContaining({ speaker: "partner" }),
    })
    expect(
      getShadowingTurn(dialogue, {
        id: "missing-line",
        speaker: "learner",
        text: "Not part of this script.",
        translation: "",
      }),
    ).toEqual({ cue: null, next: null, reply: null })
  })
})
