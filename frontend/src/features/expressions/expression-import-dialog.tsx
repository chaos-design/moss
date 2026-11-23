"use client"

import {
  BracesIcon,
  CheckIcon,
  CircleHelpIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileUpIcon,
  LoaderCircleIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { requestGeneratedExpressions } from "@/features/expressions/expression-generation-client"
import { ExpressionJsonEditor } from "@/features/expressions/expression-json-editor"
import { expressionGenerationPhraseLimit } from "@/lib/expression-generation"
import {
  applyExpressionImportDuplicateStrategy,
  countExistingExpressionDuplicates,
  createExpressionImportTemplate,
  type ExpressionImportDuplicateStrategy,
  type ExpressionImportResult,
  parseExpressionImport,
  parseExpressionJsonImport,
} from "@/lib/expression-import"

type ImportMode = "json" | "file" | "ai"

const jsonPlaceholder = JSON.stringify(
  [
    {
      phrase: "keep an eye on",
      meaning: "留意；照看",
      why: "eye 代表观察，keep 表示持续维持注意。",
      origin: "由视觉动作形成的常用表达。",
      example: "Could you keep an eye on my bag?",
      exampleTranslation: "能帮我看一下包吗？",
      sceneCategory: "social",
      context: "通用",
      kind: "idiom",
      usage: "常接宾语，也可用 over 引出照看范围。",
      memoryTip: "想象眼睛一直停在目标上。",
      examples: [
        {
          text: "Keep an eye on the kids while I cook.",
          translation: "我做饭时照看一下孩子。",
        },
      ],
    },
  ],
  null,
  2,
)

const jsonFieldDescriptions = [
  ["phrase", "英文表达，必填"],
  ["meaning", "中文含义，必填"],
  ["why", "表达含义与语义推导，必填"],
  ["origin", "来源或词源说明，必填"],
  ["example", "完整英文例句，必填"],
  ["exampleTranslation", "例句译文；填写后词库显示展开按钮；可选"],
  ["sceneCategory", "场景英文标识，如 social、work；必填"],
  ["context", "使用语境：日常、职场、通用；可选"],
  ["kind", "类型：collocation、idiom、phrasal-verb、sentence-pattern；可选"],
  ["usage", "用法说明：句法位置、常见搭配与语域限制；可选"],
  ["memoryTip", "记忆提示：画面、对比或易错点；可选"],
  ["examples", "拓展例句数组，最多 4 条，每项含 text 与可选 translation；可选"],
] as const

function downloadImportTemplate() {
  const url = URL.createObjectURL(
    new Blob([createExpressionImportTemplate()], {
      type: "text/csv;charset=utf-8",
    }),
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = "moss-expression-import-template.csv"
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ExpressionImportDialog({
  cloudAvailable,
  loadingCloud,
  existingIdentities,
  onImport,
}: {
  cloudAvailable: boolean
  loadingCloud: boolean
  existingIdentities: ReadonlySet<string>
  onImport: (result: ExpressionImportResult) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>("json")
  const [jsonContent, setJsonContent] = useState("")
  const [fileName, setFileName] = useState("")
  const [fileResult, setFileResult] = useState<ExpressionImportResult | null>(null)
  const [fileError, setFileError] = useState("")
  const [phraseInput, setPhraseInput] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState("")
  const [generationSummary, setGenerationSummary] = useState("")
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<ExpressionImportDuplicateStrategy>("skip")
  const [importing, setImporting] = useState(false)
  const deferredJsonContent = useDeferredValue(jsonContent)
  const jsonPending = deferredJsonContent !== jsonContent
  const jsonPreview = useMemo(() => {
    if (!deferredJsonContent.trim()) {
      return { error: "", result: null }
    }
    try {
      return {
        error: "",
        result: parseExpressionJsonImport(deferredJsonContent),
      }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "JSON 数据无法解析。",
        result: null,
      }
    }
  }, [deferredJsonContent])
  const activeResult =
    mode === "json"
      ? jsonPending
        ? null
        : jsonPreview.result
      : mode === "file"
        ? fileResult
        : null
  const activePending = mode === "json" && jsonPending
  const existingDuplicateCount = activeResult
    ? countExistingExpressionDuplicates(activeResult, existingIdentities)
    : 0
  const finalItems = useMemo(
    () =>
      activeResult
        ? applyExpressionImportDuplicateStrategy(
            activeResult,
            existingIdentities,
            duplicateStrategy,
          ).items
        : [],
    [activeResult, duplicateStrategy, existingIdentities],
  )
  const validCount = finalItems.length

  function reset() {
    setMode("json")
    setJsonContent("")
    setFileName("")
    setFileResult(null)
    setFileError("")
    setPhraseInput("")
    setGenerationError("")
    setGenerationSummary("")
    setDuplicateStrategy("skip")
  }

  async function handleFile(file: File | undefined) {
    setFileName("")
    setFileResult(null)
    setFileError("")
    if (!file) {
      return
    }
    setFileName(file.name)
    if (file.size > 5 * 1024 * 1024) {
      setFileError("文件不能超过 5 MB。")
      return
    }
    try {
      setFileResult(await parseExpressionImport(await file.text(), file.name))
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "导入文件无法解析。")
    }
  }

  async function handleGenerate() {
    const phrases = phraseInput
      .split(/[\n,，;；]+/)
      .map((phrase) => phrase.trim())
      .filter(Boolean)
    setGenerationError("")
    setGenerationSummary("")
    if (phrases.length === 0) {
      setGenerationError("请先输入至少一个英文短语。")
      return
    }
    if (phrases.length > expressionGenerationPhraseLimit) {
      setGenerationError(`一次最多生成 ${expressionGenerationPhraseLimit} 条。`)
      return
    }
    setGenerating(true)
    try {
      const items = await requestGeneratedExpressions(phrases)
      setJsonContent(JSON.stringify(items, null, 2))
      setMode("json")
      setGenerationSummary(`已生成 ${items.length} 条表达并填入 JSON 预检，可修改后再导入。`)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "表达生成失败，请稍后重试。")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit() {
    if (!activeResult || finalItems.length === 0 || importing) {
      return
    }
    setImporting(true)
    try {
      if (await onImport({ ...activeResult, items: finalItems })) {
        setOpen(false)
        reset()
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!importing) {
          setOpen(nextOpen)
          if (!nextOpen) {
            reset()
          }
        }
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" disabled={loadingCloud}>
            {loadingCloud ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : (
              <FileUpIcon data-icon="inline-start" />
            )}
            {loadingCloud ? "加载中" : "导入"}
          </Button>
        }
      />
      <DialogContent className="max-h-[min(780px,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>批量导入表达数据</DialogTitle>
          <DialogDescription>
            输入短语让 AI 补全字段，或直接粘贴 JSON、上传 CSV/JSON 文件。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as ImportMode)}
          className="min-h-0 gap-0 overflow-hidden"
        >
          <TabsList className="mx-4 grid w-[calc(100%-2rem)] grid-cols-3">
            <TabsTrigger value="ai">
              <SparklesIcon data-icon="inline-start" />
              AI 生成
            </TabsTrigger>
            <TabsTrigger value="json">
              <BracesIcon data-icon="inline-start" />
              粘贴 JSON
            </TabsTrigger>
            <TabsTrigger value="file">
              <UploadIcon data-icon="inline-start" />
              上传文件
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="min-h-0 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-4">
              <Alert>
                <SparklesIcon />
                <AlertTitle>用 AI 补全导入字段</AlertTitle>
                <AlertDescription>
                  输入英文短语，使用当前配置的 AI 接口补全含义、语义推导、译文、用法和拓展例句。
                  生成结果会进入 JSON 预检，确认后再导入。
                </AlertDescription>
              </Alert>

              <Field data-invalid={Boolean(generationError)}>
                <FieldLabel htmlFor="expression-generation-phrases">英文短语</FieldLabel>
                <Textarea
                  id="expression-generation-phrases"
                  value={phraseInput}
                  onChange={(event) => setPhraseInput(event.target.value)}
                  placeholder={"keep an eye on\ncall it a day\nunder the weather"}
                  aria-invalid={Boolean(generationError)}
                  disabled={generating || importing}
                  rows={5}
                />
                <FieldDescription>
                  用换行或逗号分隔，一次最多 {expressionGenerationPhraseLimit} 条。
                </FieldDescription>
                {generationError ? <FieldError>{generationError}</FieldError> : null}
              </Field>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={generating || importing}
                  onClick={() => void handleGenerate()}
                >
                  {generating ? (
                    <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <SparklesIcon data-icon="inline-start" />
                  )}
                  {generating ? "正在生成" : "生成导入数据"}
                </Button>
                {generationSummary ? (
                  <span className="text-xs text-muted-foreground">{generationSummary}</span>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="json" className="min-h-0 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-4">
              <Field data-invalid={Boolean(jsonPreview.error) && !jsonPending}>
                <div className="flex items-center gap-1">
                  <FieldLabel>JSON 数据</FieldLabel>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground"
                          aria-label="查看 JSON 字段说明"
                        >
                          <CircleHelpIcon />
                        </Button>
                      }
                    />
                    <TooltipContent
                      align="start"
                      side="bottom"
                      className="block w-[min(28rem,calc(100vw-2rem))] max-w-none px-3 py-2 text-left"
                    >
                      <p className="font-medium">JSON 字段说明</p>
                      <p className="mt-1 text-background/80">
                        顶层使用数组或 {"{ items: [...] }"}；前 6 个字段必填。
                      </p>
                      <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
                        {jsonFieldDescriptions.map(([name, description]) => (
                          <div className="contents" key={name}>
                            <dt className="font-mono text-[11px]">{name}</dt>
                            <dd className="text-background/80">{description}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-2 border-t border-background/20 pt-2 text-background/80">
                        {cloudAvailable
                          ? "导入后会先保存到本机，并同步到当前账号的数据库。"
                          : "当前数据库不可用，导入后仅保存本机副本。"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                {open && mode === "json" ? (
                  <ExpressionJsonEditor
                    value={jsonContent}
                    placeholder={jsonPlaceholder}
                    invalid={Boolean(jsonPreview.error) && !jsonPending}
                    disabled={importing}
                    onChange={setJsonContent}
                  />
                ) : null}
                <FieldDescription>
                  {jsonPending ? "正在校验 JSON…" : "粘贴后自动校验，最多 5 MB。"}
                </FieldDescription>
                {jsonPreview.error && !jsonPending ? (
                  <FieldError>{jsonPreview.error}</FieldError>
                ) : null}
              </Field>

              {generationSummary && mode === "json" ? (
                <p className="text-xs text-muted-foreground">{generationSummary}</p>
              ) : null}
              {jsonPreview.result && !jsonPending ? (
                <ImportSummary result={jsonPreview.result} />
              ) : null}
              {jsonPreview.result && !jsonPending && existingDuplicateCount > 0 ? (
                <DuplicateStrategyPrompt
                  count={existingDuplicateCount}
                  finalCount={finalItems.length}
                  strategy={duplicateStrategy}
                  onChange={setDuplicateStrategy}
                />
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="file" className="min-h-0 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-4">
              <Alert>
                <FileSpreadsheetIcon />
                <AlertTitle>上传步骤</AlertTitle>
                <AlertDescription>
                  下载 CSV 模板并逐行填写，或准备同格式 JSON；选择文件后确认预检结果。
                </AlertDescription>
              </Alert>

              <Field data-invalid={Boolean(fileError)}>
                <FieldLabel htmlFor="expression-import-file">选择数据文件</FieldLabel>
                <Input
                  id="expression-import-file"
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  aria-invalid={Boolean(fileError)}
                  disabled={importing}
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                />
                <FieldDescription>支持 UTF-8 CSV 或 JSON，单个文件最大 5 MB。</FieldDescription>
                {fileError ? <FieldError>{fileError}</FieldError> : null}
              </Field>

              {fileResult ? <ImportSummary result={fileResult} /> : null}
              {fileResult && existingDuplicateCount > 0 ? (
                <DuplicateStrategyPrompt
                  count={existingDuplicateCount}
                  finalCount={finalItems.length}
                  strategy={duplicateStrategy}
                  onChange={setDuplicateStrategy}
                />
              ) : null}
              {fileName ? <p className="sr-only">已选择 {fileName}</p> : null}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="m-0">
          {mode === "file" ? (
            <Button type="button" variant="outline" onClick={downloadImportTemplate}>
              <DownloadIcon data-icon="inline-start" />
              下载模板
            </Button>
          ) : null}
          <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground sm:justify-end">
            {cloudAvailable ? (
              <>
                <CheckIcon className="size-4 text-[var(--success)]" aria-hidden="true" />
                本机与数据库
              </>
            ) : (
              <>数据库不可用，仅保存本机</>
            )}
          </div>
          <Button
            type="button"
            disabled={validCount === 0 || importing || activePending}
            onClick={() => void handleSubmit()}
          >
            {importing || activePending ? (
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
            ) : mode === "ai" ? (
              <SparklesIcon data-icon="inline-start" />
            ) : mode === "json" ? (
              <BracesIcon data-icon="inline-start" />
            ) : (
              <FileUpIcon data-icon="inline-start" />
            )}
            {importing
              ? "正在导入"
              : activePending
                ? "正在校验"
                : existingDuplicateCount > 0 && validCount === 0
                  ? "全部重复，跳过导入"
                  : `导入 ${validCount} 条`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DuplicateStrategyPrompt({
  count,
  finalCount,
  strategy,
  onChange,
}: {
  count: number
  finalCount: number
  strategy: ExpressionImportDuplicateStrategy
  onChange: (strategy: ExpressionImportDuplicateStrategy) => void
}) {
  return (
    <section
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
      role="status"
      aria-label="重复表达处理"
    >
      <p className="font-medium text-foreground">
        检测到 {count} 条与词库已有表达相同（同一场景 + 表达）。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={strategy === "skip" ? "default" : "outline"}
          aria-pressed={strategy === "skip"}
          onClick={() => onChange("skip")}
        >
          跳过重复
        </Button>
        <Button
          type="button"
          size="sm"
          variant={strategy === "overwrite" ? "default" : "outline"}
          aria-pressed={strategy === "overwrite"}
          onClick={() => onChange("overwrite")}
        >
          覆盖已有
        </Button>
        <span className="text-muted-foreground">
          {strategy === "skip"
            ? `重复条目保持原样，本次将导入 ${finalCount} 条。`
            : `用新数据覆盖这 ${count} 条，本次将导入 ${finalCount} 条。`}
        </span>
      </div>
    </section>
  )
}

function ImportSummary({ result }: { result: ExpressionImportResult }) {
  return (
    <>
      <section
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs"
        aria-label="导入预检结果"
      >
        <ImportStat label="有效" value={String(result.items.length)} />
        <ImportStat label="重复" value={String(result.duplicateCount)} />
        <ImportStat label="错误" value={String(result.issues.length)} />
      </section>

      {result.issues.length > 0 ? (
        <div className="max-h-36 overflow-y-auto rounded-lg border px-3 py-2 text-xs text-destructive">
          {result.issues.slice(0, 50).map((issue, index) => (
            <p key={`${issue.row}:${issue.message}:${index}`}>
              第 {issue.row} 行：{issue.message}
            </p>
          ))}
          {result.issues.length > 50 ? <p>另有 {result.issues.length - 50} 条错误。</p> : null}
        </div>
      ) : null}
    </>
  )
}

function ImportStat({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </p>
  )
}
