import { describe, expect, it } from "vitest"
import { getAvailableConversationScenes, getConversationScene } from "@/lib/conversation-scenes"
import { sceneItems } from "@/lib/demo-data"

describe("getConversationScene", () => {
  it("returns the requested available scene", () => {
    const meeting = getConversationScene("meeting")
    const airport = getConversationScene("airport")

    expect(meeting).toMatchObject({
      id: "meeting",
      title: "工作会议",
      partnerRole: "项目负责人",
    })
    expect(airport).toMatchObject({
      id: "airport",
      title: "机场出行",
      partnerRole: "值机柜台工作人员",
    })
    expect(meeting.opening.content).not.toBe(airport.opening.content)
  })

  it.each([undefined, "unknown", "presentation"])(
    "falls back to coffee for unavailable scene %s",
    (sceneId) => {
      expect(getConversationScene(sceneId).id).toBe("coffee")
    },
  )

  it("filters available scenes by life category", () => {
    const transportScenes = getAvailableConversationScenes("transport")

    expect(transportScenes.map((scene) => scene.id)).toEqual([
      "airport",
      "taxi",
      "train",
      "customs",
      "directions",
      "car-rental",
      "bus-route",
      "flight-delay",
      "lost-luggage",
      "bike-rental",
      "road-trip",
      "subway-disruption",
      "hotel-shuttle",
    ])
    expect(sceneItems).toHaveLength(101)
    expect(getAvailableConversationScenes("all")).toHaveLength(100)
    expect(getAvailableConversationScenes("work").map((scene) => scene.id)).toEqual([
      "meeting",
      "idiomatic-english",
      "interview",
      "one-on-one",
      "negotiation",
      "project-kickoff",
      "status-update",
      "performance-review",
      "salary-negotiation",
      "client-demo",
      "remote-collaboration",
      "conflict-resolution",
      "technical-interview",
      "sprint-retrospective",
      "conference-call",
    ])
  })

  it("filters scenes from A2 through C1", () => {
    expect(getAvailableConversationScenes("all", "A2")).not.toHaveLength(0)
    expect(getAvailableConversationScenes("all", "C1").map((scene) => scene.id)).toEqual([
      "negotiation",
      "panel-debate",
      "crisis-briefing",
      "salary-negotiation",
      "conflict-resolution",
      "technical-interview",
      "thesis-supervision",
    ])
    expect(getAvailableConversationScenes("work", "C1").map((scene) => scene.id)).toEqual([
      "negotiation",
      "salary-negotiation",
      "conflict-resolution",
      "technical-interview",
    ])
  })

  it("supports multiple categories and levels", () => {
    const scenes = getAvailableConversationScenes(["health", "learning"], ["B2", "C1"])

    expect(scenes.length).toBeGreaterThan(0)
    expect(scenes.every((scene) => ["health", "learning"].includes(scene.category))).toBe(true)
    expect(scenes.every((scene) => ["B2", "C1"].includes(scene.level))).toBe(true)
  })

  it("uses task-specific tags instead of the broad filter category", () => {
    expect(getConversationScene("coffee").tags).toEqual(["饮品定制", "柜台点单", "结账确认"])
    expect(getConversationScene("home-repair").tags).toContain("故障描述")
  })

  it("provides a meaning for every focus phrase", () => {
    for (const scene of getAvailableConversationScenes("all")) {
      expect(scene.focusPhrases).toHaveLength(3)
      for (const [label, phrase, meaning] of scene.focusPhrases) {
        expect(label).not.toBe("")
        expect(phrase).not.toBe("")
        expect(meaning).not.toBe("")
      }
    }
  })

  it("provides usage reasoning and origin notes for the idiomatic expression scene", () => {
    const scene = getConversationScene("idiomatic-english")
    const notes = scene.expressionNotes ?? []

    expect(notes).toHaveLength(100)
    expect(new Set(notes.map((note) => note.phrase.toLocaleLowerCase())).size).toBe(
      notes.length,
    )
    expect(notes).toContainEqual(
      expect.objectContaining({
        phrase: "keep tabs on",
        context: "通用",
      }),
    )
    expect(notes).toContainEqual(
      expect.objectContaining({
        phrase: "rule of thumb",
        context: "通用",
      }),
    )
    expect(notes.every((note) => note.meaning && note.why && note.origin && note.example)).toBe(
      true,
    )
    expect(notes.every((note) => /[.!?]$/.test(note.example))).toBe(true)
  })
})
