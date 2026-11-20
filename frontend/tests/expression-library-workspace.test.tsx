// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExpressionLibraryWorkspace } from "@/features/expressions/expression-library-workspace"
import { builtInExpressionItems } from "@/lib/expression-library"
import {
  createEmptyExpressionStudyState,
  createEmptyLearningMemory,
  createExpressionMemoryItemId,
  type LearningMemoryState,
} from "@/lib/memory"

const fetchMock = vi.fn()
let intersectionCallback: IntersectionObserverCallback = () => {}
const importedExpression = {
  id: "imported:item-1",
  clientId: "item-1",
  phrase: "custom imported phrase",
  meaning: "自定义导入含义",
  why: "用于测试用户导入表达的解释。",
  origin: "由测试数据导入。",
  example: "This is a custom imported phrase.",
  context: "通用",
  kind: "collocation",
  sceneCategory: "social",
  source: "imported",
} as const
const validImportContent = JSON.stringify([
  {
    phrase: "keep an eye on",
    meaning: "留意；照看",
    why: "eye 代表观察，keep 表示持续维持注意。",
    origin: "由视觉动作形成的常用表达。",
    example: "Could you keep an eye on my bag?",
    sceneCategory: "social",
    context: "通用",
    kind: "idiom",
  },
])
const generatedImportItem = {
  ...(JSON.parse(validImportContent)[0] as Record<string, unknown>),
  exampleTranslation: "能帮我看一下包吗？",
  usage: "常接宾语，也可接 over 引出照看范围。",
  memoryTip: "想象眼睛停在目标上。",
  examples: [{ text: "Keep an eye on the kids for me.", translation: "帮我照看一下孩子。" }],
}

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => null,
}))

const routerPush = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}))

// Local toasts append an account-state suffix only for non-authenticated learners; these tests pin
// the signed-in copy, so the hook is stubbed instead of standing up Supabase.
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated",
    accountLabel: "学习账户",
    requireSignIn: () => true,
  }),
}))

const memoryMocks = vi.hoisted(() => ({
  recordExpressionStudy: vi.fn(),
  toggleFavorite: vi.fn(),
  createGroup: vi.fn(),
  addGroupItems: vi.fn(),
  renameGroup: vi.fn(),
  deleteGroup: vi.fn(),
  toggleGroupItem: vi.fn(),
  recordExpressionProgress: vi.fn(),
  saveExpressionFilters: vi.fn(),
  rateReview: vi.fn(),
  state: null as LearningMemoryState | null,
}))

vi.mock("@/components/learning-memory-provider", () => ({
  useLearningMemory: () => ({
    hydrated: true,
    recordExpressionStudy: memoryMocks.recordExpressionStudy,
    toggleFavorite: memoryMocks.toggleFavorite,
    createGroup: memoryMocks.createGroup,
    addGroupItems: memoryMocks.addGroupItems,
    renameGroup: memoryMocks.renameGroup,
    deleteGroup: memoryMocks.deleteGroup,
    toggleGroupItem: memoryMocks.toggleGroupItem,
    recordExpressionProgress: memoryMocks.recordExpressionProgress,
    saveExpressionFilters: memoryMocks.saveExpressionFilters,
    rateReview: memoryMocks.rateReview,
    state: memoryMocks.state,
  }),
}))

vi.mock("@/features/expressions/expression-json-editor", () => ({
  ExpressionJsonEditor: ({
    disabled,
    invalid,
    onChange,
    placeholder,
    value,
  }: {
    disabled: boolean
    invalid: boolean
    onChange: (value: string) => void
    placeholder: string
    value: string
  }) => (
    <textarea
      aria-label="JSON 数据"
      aria-invalid={invalid}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

beforeEach(() => {
  window.localStorage.clear()
  memoryMocks.state = createEmptyLearningMemory(new Date("2026-10-05T08:00:00.000Z"))
  memoryMocks.recordExpressionStudy.mockReset()
  memoryMocks.toggleFavorite.mockReset()
  memoryMocks.createGroup.mockReset()
  memoryMocks.addGroupItems.mockReset()
  memoryMocks.renameGroup.mockReset()
  memoryMocks.deleteGroup.mockReset()
  memoryMocks.toggleGroupItem.mockReset()
  memoryMocks.recordExpressionProgress.mockReset()
  memoryMocks.saveExpressionFilters.mockReset()
  memoryMocks.rateReview.mockReset()
  routerPush.mockReset()
  fetchMock.mockReset().mockImplementation((input, init: RequestInit | undefined) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    const method = init?.method ?? "GET"
    if (url.includes("/api/expressions/generate")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: { items: [generatedImportItem] } })),
      )
    }
    const data =
      method === "GET"
        ? {
            cloudAvailable: true,
            items: [],
            nextCursor: null,
            userId: "user-1",
          }
        : method === "DELETE"
          ? { deleted: true }
          : { stored: true }
    return Promise.resolve(new Response(JSON.stringify({ data })))
  })
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }

      disconnect() {}
      observe() {}
      unobserve() {}
      takeRecords() {
        return []
      }

      readonly root = null
      readonly rootMargin = "480px 0px"
      readonly thresholds = [0]
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ExpressionLibraryWorkspace", () => {
  it("shows the complete built-in count and filters detailed rows", async () => {
    render(<ExpressionLibraryWorkspace />)

    expect(screen.getAllByText("1170")).toHaveLength(2)
    fireEvent.change(screen.getByRole("textbox", { name: "搜索地道表达" }), {
      target: { value: "rule of thumb" },
    })

    expect(await screen.findByText("经验法则；实用但不精确的判断方法")).toBeTruthy()
    expect(screen.getByText(/打妻子的来源说法没有可靠依据/)).toBeTruthy()
    expect(screen.getByText("已显示 1 / 1 条")).toBeTruthy()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/expressions", expect.anything()),
    )
  })

  it("keeps filters sticky and loads the next batch at the bottom sentinel", async () => {
    render(<ExpressionLibraryWorkspace />)

    const filters = screen.getByRole("region", { name: "筛选表达" })
    expect(filters.className).toContain("sticky")
    expect(filters.className).toContain("top-16")
    expect(screen.getAllByRole("article")).toHaveLength(60)
    expect(screen.queryByRole("button", { name: /再显示/ })).toBeNull()

    act(() => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(120))
    expect(screen.getByText("已显示 120 / 1170 条")).toBeTruthy()
  })

  it("imports pasted JSON only after the database confirms storage", async () => {
    render(<ExpressionLibraryWorkspace />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole("button", { name: "导入" }))
    expect(
      screen.getByRole("tab", { name: "粘贴 JSON" }).getAttribute("data-active"),
    ).not.toBeNull()
    expect(screen.getByRole("tab", { name: "上传文件" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "添加一条" })).toBeNull()
    expect(screen.queryByText("sceneCategory")).toBeNull()
    expect(screen.getByRole("button", { name: "查看 JSON 字段说明" })).toBeTruthy()
    const jsonEditor = screen.getByRole("textbox", { name: "JSON 数据" })
    const placeholder = jsonEditor.getAttribute("placeholder") ?? ""
    expect(() => JSON.parse(placeholder)).not.toThrow()
    expect(placeholder).toContain('\n  {\n    "phrase":')
    fireEvent.change(jsonEditor, {
      target: { value: validImportContent },
    })

    const submit = await screen.findByRole("button", { name: "导入 1 条" })
    const summary = screen.getByRole("region", { name: "导入预检结果" })
    expect(summary.className).toContain("flex")
    expect(summary.className).not.toContain("grid-cols-3")
    expect(summary.textContent).toContain("有效1")
    fireEvent.click(submit)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(
      JSON.parse(window.localStorage.getItem("moss:expression-library:v1:user-1") ?? "{}")
        .items,
    ).toHaveLength(1)
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/expressions",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("keeps local state untouched and reports failure when the database rejects an import", async () => {
    fetchMock.mockImplementation((_input, init: RequestInit | undefined) => {
      const method = init?.method ?? "GET"
      const data =
        method === "GET"
          ? { cloudAvailable: true, items: [], nextCursor: null, userId: "user-1" }
          : { stored: false }
      return Promise.resolve(new Response(JSON.stringify({ data })))
    })
    render(<ExpressionLibraryWorkspace />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole("button", { name: "导入" }))
    fireEvent.change(screen.getByRole("textbox", { name: "JSON 数据" }), {
      target: { value: validImportContent },
    })
    fireEvent.click(await screen.findByRole("button", { name: "导入 1 条" }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/expressions",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    // 数据库未确认写入：本机保持原样，弹窗与内容保留供用户重试。
    expect(
      JSON.parse(window.localStorage.getItem("moss:expression-library:v1:user-1") ?? "{}")
        .items,
    ).toHaveLength(0)
    expect(screen.getByRole("textbox", { name: "JSON 数据" })).toBeTruthy()
  })

  it("generates an enriched import record from an input phrase", async () => {
    render(<ExpressionLibraryWorkspace />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole("button", { name: "导入" }))
    fireEvent.click(screen.getByRole("tab", { name: /AI 生成/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "英文短语" }), {
      target: { value: "keep an eye on" },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "生成导入数据" }))
    })

    expect(await screen.findByText(/已生成 1 条表达/)).toBeTruthy()
    const editor = screen.getByRole("textbox", { name: "JSON 数据" }) as HTMLTextAreaElement
    expect(editor.value).toContain("exampleTranslation")
    expect(editor.value).toContain("memoryTip")
    expect(await screen.findByRole("button", { name: "导入 1 条" })).toBeTruthy()
  })

  it("uploads a JSON file through the file mode", async () => {
    render(<ExpressionLibraryWorkspace />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole("button", { name: "导入" }))
    fireEvent.click(screen.getByRole("tab", { name: "上传文件" }))
    expect(screen.getByText("上传步骤")).toBeTruthy()
    expect(screen.getByRole("button", { name: "下载模板" })).toBeTruthy()
    const file = new File([validImportContent], "expressions.json", {
      type: "application/json",
    })
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue(validImportContent),
    })
    fireEvent.change(screen.getByLabelText("选择数据文件"), {
      target: { files: [file] },
    })

    const submit = await screen.findByRole("button", { name: "导入 1 条" })
    fireEvent.click(submit)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(
      JSON.parse(window.localStorage.getItem("moss:expression-library:v1:user-1") ?? "{}")
        .items,
    ).toHaveLength(1)
  })

  it("edits a user-imported expression locally before cloud sync", async () => {
    window.localStorage.setItem(
      "moss:expression-library:v1:user-1",
      JSON.stringify({ version: 1, items: [importedExpression] }),
    )
    render(<ExpressionLibraryWorkspace />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole("button", { name: "编辑 custom imported phrase" }))
    fireEvent.change(screen.getByRole("textbox", { name: "中文含义" }), {
      target: { value: "修改后的中文含义" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const stored = JSON.parse(
      window.localStorage.getItem("moss:expression-library:v1:user-1") ?? "{}",
    ) as { items: Array<{ meaning: string }> }
    expect(stored.items[0]?.meaning).toBe("修改后的中文含义")
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/expressions",
      expect.objectContaining({ method: "PUT" }),
    )
  })

  it("confirms deletion of a user-imported expression", async () => {
    window.localStorage.setItem(
      "moss:expression-library:v1:user-1",
      JSON.stringify({ version: 1, items: [importedExpression] }),
    )
    render(<ExpressionLibraryWorkspace />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole("button", { name: "删除 custom imported phrase" }))
    expect(screen.getByRole("alertdialog", { name: "删除这条表达？" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const stored = JSON.parse(
      window.localStorage.getItem("moss:expression-library:v1:user-1") ?? "{}",
    ) as { items: unknown[] }
    expect(stored.items).toEqual([])
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/expressions?clientId=item-1",
      expect.objectContaining({ method: "DELETE" }),
    )
  })

  it("sends an expression into long-term memory without cloud expression writes", async () => {
    render(<ExpressionLibraryWorkspace />)
    fireEvent.change(screen.getByRole("textbox", { name: "搜索地道表达" }), {
      target: { value: "rule of thumb" },
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "把 rule of thumb 加入长期记忆" }),
    )

    expect(memoryMocks.recordExpressionStudy).toHaveBeenCalledWith({
      // 内置习语条目使用 `builtin-reviewed-<序号>` 作为稳定 clientId。
      itemId: expect.stringMatching(/^expression-library-builtin-reviewed-\d+$/),
      sceneCategory: "learning",
      sceneTitle: "校园学习",
      label: "rule of thumb",
      phrase: "rule of thumb",
      explanation: "拇指可用于快速估量尺寸，代表依靠经验做近似判断，而不是进行精密计算。",
      example: "As a rule of thumb, leave ten percent of the budget for unexpected costs.",
      libraryKind: "idiom",
    })
    // 加入长期记忆走学习记忆快照，不触发表达词库的导入或删除接口。
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("navigates to the filtered study scope with the chosen mode", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /开始学习/ }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "例句填空" }))

    expect(routerPush).toHaveBeenCalledWith(
      "/workspace/expressions/study?scope=filtered&mode=cloze",
    )
  })

  it("marks expressions that already exist in long-term memory", async () => {
    const reviewedIndex =
      builtInExpressionItems.findIndex((item) => item.phrase === "rule of thumb") + 1
    const state = createEmptyLearningMemory(new Date("2026-10-05T08:00:00.000Z"))
    state.items = [
      {
        id: createExpressionMemoryItemId(`builtin-reviewed-${reviewedIndex}`),
        kind: "expression",
        label: "rule of thumb",
        cue: "主动学习并记住“rule of thumb”",
        answer: "rule of thumb",
        explanation: "以拇指表示的经验判断。",
        sourceSceneId: "learning",
        sourceSceneTitle: "校园学习",
        transferTargets: [],
        strength: 49,
        encounters: 1,
        successfulRecalls: 1,
        lapseCount: 0,
        intervalDays: 1,
        easeFactor: 2.3,
        repetitions: 0,
        lastSeenAt: "2026-10-05T08:00:00.000Z",
        nextReviewAt: "2026-10-05T08:10:00.000Z",
      },
    ]
    memoryMocks.state = state
    render(<ExpressionLibraryWorkspace />)
    fireEvent.change(screen.getByRole("textbox", { name: "搜索地道表达" }), {
      target: { value: "rule of thumb" },
    })

    expect(await screen.findByText("已在记忆中")).toBeTruthy()
    const addButton = screen.getByRole("button", { name: "rule of thumb 已在长期记忆中" })
    expect((addButton as HTMLButtonElement).disabled).toBe(true)
  })

  it("reveals the example translation only after the eye is pressed", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.change(screen.getByRole("textbox", { name: "搜索地道表达" }), {
      target: { value: "keep tabs on" },
    })

    const translation = "你能持续关注这批货的配送情况，如果延迟了就告诉我吗？"
    expect(await screen.findByText("已显示 1 / 1 条")).toBeTruthy()
    // 默认收起：译文尚未渲染，学习者先自己读英文例句。
    expect(screen.queryByText(translation)).toBeNull()

    // 译文开关紧跟例句，无障碍名称按当前动作区分。
    const eye = screen.getByRole("button", { name: "显示 keep tabs on 的例句译文" })
    expect(eye.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(eye)

    expect(eye.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText(translation)).toBeTruthy()

    fireEvent.click(eye)
    expect(screen.queryByText(translation)).toBeNull()
  })

  it("restores saved filters and persists each filter change", async () => {
    memoryMocks.state = {
      ...createEmptyLearningMemory(new Date("2026-10-05T08:00:00.000Z")),
      expressionStudy: {
        ...createEmptyExpressionStudyState(),
        filters: {
          value: { query: "rule of thumb", categories: [], source: "all" },
          updatedAt: "2026-10-05T08:00:00.000Z",
        },
      },
    }
    render(<ExpressionLibraryWorkspace />)

    const search = screen.getByRole("textbox", { name: "搜索地道表达" }) as HTMLInputElement
    await waitFor(() => expect(search.value).toBe("rule of thumb"))
    expect(await screen.findByText("已显示 1 / 1 条")).toBeTruthy()

    fireEvent.change(search, { target: { value: "break the ice" } })
    expect(memoryMocks.saveExpressionFilters).toHaveBeenCalledWith(
      expect.objectContaining({ query: "break the ice", source: "all" }),
    )
  })

  it("toggles a favorite by expression identity", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.change(screen.getByRole("textbox", { name: "搜索地道表达" }), {
      target: { value: "rule of thumb" },
    })
    const star = await screen.findByRole("button", { name: "收藏 rule of thumb" })
    fireEvent.click(star)
    expect(memoryMocks.toggleFavorite).toHaveBeenCalledWith(
      expect.stringContaining("rule of thumb"),
    )
  })

  it("creates a named study group from the my-study panel", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: "管理分组" }))
    const nameInput = await screen.findByRole("textbox", { name: "新分组名称" })
    fireEvent.change(nameInput, { target: { value: "面试表达" } })
    fireEvent.click(screen.getByRole("button", { name: "新建" }))
    expect(memoryMocks.createGroup).toHaveBeenCalledWith("面试表达")
  })

  it("opens the start learning menu without a Base UI context error", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /开始学习/ }))

    expect(await screen.findByRole("menuitem", { name: "闪卡自测" })).toBeTruthy()
  })

  it("exposes random and ebbinghaus learning methods in the start menu", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /开始学习/ }))

    expect(await screen.findByRole("menuitem", { name: "随机学 5 条" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "艾宾浩斯记忆循环" })).toBeTruthy()
  })

  it("navigates to the standalone study page with the scope and mode in the URL", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /开始学习/ }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "随机学 5 条" }))

    expect(routerPush).toHaveBeenCalledWith(
      "/workspace/expressions/study?scope=random&count=5&mode=flashcard",
    )
  })

  it("navigates to the ebbinghaus view on the standalone study page", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /开始学习/ }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "艾宾浩斯记忆循环" }))

    expect(routerPush).toHaveBeenCalledWith(
      "/workspace/expressions/study?scope=ebbinghaus&mode=flashcard",
    )
  })

  it("opens a row group menu without a Base UI context error", async () => {
    render(<ExpressionLibraryWorkspace />)
    fireEvent.change(screen.getByRole("textbox", { name: "搜索地道表达" }), {
      target: { value: "rule of thumb" },
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "管理 rule of thumb 的学习分组" }),
    )

    expect(await screen.findByText("加入分组")).toBeTruthy()
  })

  it("joins a recommended group with one memory write", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /推荐分组/ }))

    expect(await screen.findByText("A2 · 入门常用")).toBeTruthy()
    expect(screen.getByText("B2 · 熟练表达")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "仅加入推荐分组 A2 · 入门常用" }))

    expect(memoryMocks.addGroupItems).toHaveBeenCalledTimes(1)
    expect(memoryMocks.addGroupItems).toHaveBeenCalledWith(
      "recommended:level-A2",
      "A2 · 入门常用",
      expect.arrayContaining(["clothing:shop around"]),
    )
  })

  it("joins and immediately opens a recommended group for study", async () => {
    render(<ExpressionLibraryWorkspace />)

    fireEvent.click(screen.getByRole("button", { name: /推荐分组/ }))
    fireEvent.click(
      await screen.findByRole("button", { name: "加入并学习推荐分组 A2 · 入门常用" }),
    )

    expect(memoryMocks.addGroupItems).toHaveBeenCalledWith(
      "recommended:level-A2",
      "A2 · 入门常用",
      expect.arrayContaining(["clothing:shop around"]),
    )
    expect(routerPush).toHaveBeenCalledWith(
      "/workspace/expressions/study?scope=group&groupId=recommended%3Alevel-A2&mode=flashcard",
    )
  })
})
