import { describe, expect, it } from "vitest"

describe("llm.txt", () => {
  it("is served from public with the llm.txt header shape", async () => {
    const { readFile } = await import("node:fs/promises")
    const content = await readFile("public/llm.txt", "utf8")
    const lines = content.split("\n")

    expect(lines[0]).toBe("# Moss")
    // llm.txt requires a blockquote summary directly after the title.
    expect(lines[2]?.startsWith("> ")).toBe(true)
  })

  it("states the deployment-dependent parts instead of guessing them", async () => {
    const { readFile } = await import("node:fs/promises")
    const content = await readFile("public/llm.txt", "utf8")

    // The canonical production domain is unknown, so no absolute link may be presented as fact.
    expect(content).toContain("moss.example.com")
    expect(content).toContain("请替换为实际部署地址")
  })
})
