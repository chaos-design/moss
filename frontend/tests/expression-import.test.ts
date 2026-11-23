import { describe, expect, it } from "vitest"
import {
  applyExpressionImportDuplicateStrategy,
  countExistingExpressionDuplicates,
  createExpressionImportTemplate,
  parseExpressionImport,
  parseExpressionJsonImport,
} from "@/lib/expression-import"

const validExpression = {
  phrase: "keep an eye on",
  meaning: "留意；照看",
  why: "eye 代表观察，keep 表示持续维持注意。",
  origin: "由视觉动作形成的常用表达。",
  example: "Could you keep an eye on my bag?",
  sceneCategory: "social",
  context: "通用",
  kind: "idiom",
}

describe("expression import", () => {
  it("parses JSON arrays and removes same-scene duplicates", async () => {
    const result = await parseExpressionImport(
      JSON.stringify([validExpression, validExpression]),
      "expressions.json",
    )

    expect(result.items).toHaveLength(1)
    expect(result.duplicateCount).toBe(1)
    expect(result.issues).toEqual([])
    expect(result.items[0]).toMatchObject({
      phrase: "keep an eye on",
      sceneCategory: "social",
      source: "imported",
    })
  })

  it("parses directly pasted JSON data", () => {
    const result = parseExpressionJsonImport(
      JSON.stringify({
        items: [validExpression],
      }),
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.phrase).toBe("keep an eye on")
    expect(() => parseExpressionJsonImport("")).toThrow("JSON 数据为空")
    expect(() => parseExpressionJsonImport("{")).toThrow("JSON 格式错误")
  })

  it("parses quoted CSV and accepts Chinese field names and categories", async () => {
    const csv = [
      "表达,中文含义,为什么,来源,例句,场景分类,语境,类型",
      '"run something by someone","征求意见","run by 表示让内容经过对方查看。","现代职场口语。","Can I run this idea by you?","职场沟通","职场","固定搭配"',
    ].join("\n")

    const result = await parseExpressionImport(csv, "expressions.csv")

    expect(result.issues).toEqual([])
    expect(result.items[0]).toMatchObject({
      kind: "collocation",
      phrase: "run something by someone",
      sceneCategory: "work",
    })
  })

  it("reports invalid rows without discarding valid rows", async () => {
    const result = await parseExpressionImport(
      JSON.stringify({
        items: [validExpression, { ...validExpression, phrase: "", sceneCategory: "unknown" }],
      }),
      "expressions.json",
    )

    expect(result.items).toHaveLength(1)
    expect(result.issues).toEqual([{ row: 3, message: "缺少英文表达" }])
  })

  it("parses translation, usage, memory tip and extra examples", () => {
    const result = parseExpressionJsonImport(
      JSON.stringify({
        items: [
          {
            ...validExpression,
            exampleTranslation: "能帮我看一下包吗？",
            usage: "常接宾语。",
            memoryTip: "想象眼睛停在目标上。",
            examples: [
              {
                text: "Keep an eye on the kids.",
                translation: "照看一下孩子。",
              },
            ],
          },
        ],
      }),
    )

    expect(result.issues).toEqual([])
    expect(result.items[0]).toMatchObject({
      exampleTranslation: "能帮我看一下包吗？",
      usage: "常接宾语。",
      memoryTip: "想象眼睛停在目标上。",
      examples: [{ text: "Keep an eye on the kids.", translation: "照看一下孩子。" }],
    })
  })

  it("creates an importable CSV template with the enriched fields", async () => {
    const template = createExpressionImportTemplate()
    const result = await parseExpressionImport(template, "template.csv")

    expect(result.items).toHaveLength(1)
    expect(result.issues).toEqual([])
    expect(result.items[0]).toMatchObject({
      exampleTranslation: expect.any(String),
      usage: expect.any(String),
      memoryTip: expect.any(String),
    })
    expect(result.items[0]?.examples).toHaveLength(1)
  })

  it("counts duplicates against the existing library and skips them unless overwrite is chosen", () => {
    const result = parseExpressionJsonImport(JSON.stringify([validExpression]))
    const existing = new Set(["social:keep an eye on"])

    expect(countExistingExpressionDuplicates(result, existing)).toBe(1)
    expect(countExistingExpressionDuplicates(result, new Set())).toBe(0)
    expect(applyExpressionImportDuplicateStrategy(result, existing, "skip").items).toHaveLength(
      0,
    )
    expect(
      applyExpressionImportDuplicateStrategy(result, existing, "overwrite").items,
    ).toHaveLength(1)
  })

  it("accepts expression rows from a Moss account export", async () => {
    const result = await parseExpressionImport(
      JSON.stringify({
        data: {
          expression_library_items: [
            {
              ...validExpression,
              reasoning: validExpression.why,
              origin_note: validExpression.origin,
              scene_category: validExpression.sceneCategory,
              why: undefined,
              origin: undefined,
              sceneCategory: undefined,
            },
          ],
        },
      }),
      "moss-account-export.json",
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.phrase).toBe("keep an eye on")
  })
})
