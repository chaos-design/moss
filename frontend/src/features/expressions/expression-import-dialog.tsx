"use client"

import {
  BracesIcon,
  CheckIcon,
  CircleHelpIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileUpIcon,
  LoaderCircleIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ExpressionJsonEditor } from "@/features/expressions/expression-json-editor"
import {
  createExpressionImportTemplate,
  type ExpressionImportResult,
  parseExpressionImport,
  parseExpressionJsonImport,
} from "@/lib/expression-import"

type ImportMode = "json" | "file"

const jsonPlaceholder = JSON.stringify(
  [
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
  ],
  null,
  2,
)

const jsonFieldDescriptions = [
  ["phrase", "英文表达"],
  ["meaning", "中文含义"],
  ["why", "表达含义与语义推导"],
  ["origin", "来源或词源说明"],
  ["example", "完整英文例句"],
  ["sceneCategory", "场景英文标识，如 social、work"],
  ["context", "使用语境：日常、职场、通用；可选"],
  ["kind", "类型：collocation、idiom、phrasal-verb、sentence-pattern；可选"],
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
  onImport,
}: {
  cloudAvailable: boolean
  loadingCloud: boolean
  onImport: (result: ExpressionImportResult) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>("json")
  const [jsonContent, setJsonContent] = useState("")
  const [fileName, setFileName] = useState("")
  const [fileResult, setFileResult] = useState<ExpressionImportResult | null>(null)
  const [fileError, setFileError] = useState("")
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
  const activeResult = mode === "json" ? (jsonPending ? null : jsonPreview.result) : fileResult
  const validCount = activeResult?.items.length ?? 0
  const activePending = mode === "json" && jsonPending

  function reset() {
    setMode("json")
    setJsonContent("")
    setFileName("")
    setFileResult(null)
    setFileError("")
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

  async function handleSubmit() {
    if (!activeResult?.items.length || importing) {
      return
    }
    setImporting(true)
    try {
      if (await onImport(activeResult)) {
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
          <DialogDescription>直接粘贴 JSON，或上传 CSV/JSON 文件。</DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as ImportMode)}
          className="min-h-0 gap-0 overflow-hidden"
        >
          <TabsList className="mx-4 grid w-[calc(100%-2rem)] grid-cols-2">
            <TabsTrigger value="json">
              <BracesIcon data-icon="inline-start" />
              粘贴 JSON
            </TabsTrigger>
            <TabsTrigger value="file">
              <UploadIcon data-icon="inline-start" />
              上传文件
            </TabsTrigger>
          </TabsList>

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

              {jsonPreview.result && !jsonPending ? (
                <ImportSummary result={jsonPreview.result} />
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
            ) : mode === "json" ? (
              <BracesIcon data-icon="inline-start" />
            ) : (
              <FileUpIcon data-icon="inline-start" />
            )}
            {importing ? "正在导入" : activePending ? "正在校验" : `导入 ${validCount} 条`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
