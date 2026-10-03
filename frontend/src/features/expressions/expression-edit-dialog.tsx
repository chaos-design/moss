"use client"

import { LoaderCircleIcon, SaveIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { SceneCategory } from "@/lib/demo-data"
import { parseExpressionImportRows } from "@/lib/expression-import"
import {
  type ExpressionKind,
  type ExpressionLibraryItem,
  expressionKindLabels,
  expressionSceneCategories,
} from "@/lib/expression-library-schema"
import type { IdiomaticExpressionContext } from "@/lib/idiomatic-expressions"

type ExpressionDraft = Pick<
  ExpressionLibraryItem,
  "context" | "example" | "kind" | "meaning" | "origin" | "phrase" | "sceneCategory" | "why"
>

const contextOptions: Array<{ label: string; value: IdiomaticExpressionContext }> = [
  { label: "日常", value: "日常" },
  { label: "职场", value: "职场" },
  { label: "通用", value: "通用" },
]
const kindOptions = Object.entries(expressionKindLabels).map(([value, label]) => ({
  label,
  value: value as ExpressionKind,
}))

export function ExpressionEditDialog({
  item,
  onClose,
  onSave,
}: {
  item: ExpressionLibraryItem
  onClose: () => void
  onSave: (item: ExpressionLibraryItem) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<ExpressionDraft>(() => ({
    context: item.context,
    example: item.example,
    kind: item.kind,
    meaning: item.meaning,
    origin: item.origin,
    phrase: item.phrase,
    sceneCategory: item.sceneCategory,
    why: item.why,
  }))
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const result = useMemo(() => parseExpressionImportRows([draft]), [draft])
  const issues = showErrors ? result.issues.map((issue) => issue.message) : []

  function updateDraft<FieldName extends keyof ExpressionDraft>(
    field: FieldName,
    value: ExpressionDraft[FieldName],
  ) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit() {
    const parsed = result.items[0]
    if (!parsed || result.issues.length > 0 || saving) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    try {
      const saved = await onSave({
        ...parsed,
        clientId: item.clientId,
        createdAt: item.createdAt,
        id: item.id,
        updatedAt: new Date().toISOString(),
      })
      if (saved) {
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) {
          onClose()
        }
      }}
    >
      <DialogContent className="max-h-[min(780px,calc(100svh-2rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle>编辑导入表达</DialogTitle>
          <DialogDescription>修改后先保存到本机，再同步到云端。</DialogDescription>
        </DialogHeader>

        <form
          className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <FieldGroup className="grid min-h-0 gap-4 overflow-y-auto px-4 py-1">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={issues.some((issue) => issue.includes("英文表达"))}>
                <FieldLabel htmlFor="expression-edit-phrase">英文表达</FieldLabel>
                <Input
                  id="expression-edit-phrase"
                  value={draft.phrase}
                  maxLength={120}
                  aria-invalid={issues.some((issue) => issue.includes("英文表达"))}
                  onChange={(event) => updateDraft("phrase", event.target.value)}
                />
              </Field>
              <Field data-invalid={issues.some((issue) => issue.includes("中文含义"))}>
                <FieldLabel htmlFor="expression-edit-meaning">中文含义</FieldLabel>
                <Input
                  id="expression-edit-meaning"
                  value={draft.meaning}
                  maxLength={500}
                  aria-invalid={issues.some((issue) => issue.includes("中文含义"))}
                  onChange={(event) => updateDraft("meaning", event.target.value)}
                />
              </Field>
            </FieldGroup>

            <FieldGroup className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="expression-edit-category">场景分类</FieldLabel>
                <Select
                  items={expressionSceneCategories}
                  value={draft.sceneCategory}
                  onValueChange={(value) =>
                    value && updateDraft("sceneCategory", value as SceneCategory)
                  }
                >
                  <SelectTrigger id="expression-edit-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {expressionSceneCategories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="expression-edit-context">使用语境</FieldLabel>
                <Select
                  items={contextOptions}
                  value={draft.context}
                  onValueChange={(value) =>
                    value && updateDraft("context", value as IdiomaticExpressionContext)
                  }
                >
                  <SelectTrigger id="expression-edit-context" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {contextOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="expression-edit-kind">表达类型</FieldLabel>
                <Select
                  items={kindOptions}
                  value={draft.kind}
                  onValueChange={(value) =>
                    value && updateDraft("kind", value as ExpressionKind)
                  }
                >
                  <SelectTrigger id="expression-edit-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {kindOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={issues.some((issue) => issue.includes("含义解释"))}>
                <FieldLabel htmlFor="expression-edit-why">为什么这样表达</FieldLabel>
                <Textarea
                  id="expression-edit-why"
                  value={draft.why}
                  maxLength={1_000}
                  aria-invalid={issues.some((issue) => issue.includes("含义解释"))}
                  className="min-h-24 resize-y"
                  onChange={(event) => updateDraft("why", event.target.value)}
                />
              </Field>
              <Field data-invalid={issues.some((issue) => issue.includes("来源说明"))}>
                <FieldLabel htmlFor="expression-edit-origin">来源</FieldLabel>
                <Textarea
                  id="expression-edit-origin"
                  value={draft.origin}
                  maxLength={1_000}
                  aria-invalid={issues.some((issue) => issue.includes("来源说明"))}
                  className="min-h-24 resize-y"
                  onChange={(event) => updateDraft("origin", event.target.value)}
                />
              </Field>
            </FieldGroup>

            <Field data-invalid={issues.some((issue) => issue.includes("英文例句"))}>
              <FieldLabel htmlFor="expression-edit-example">英文例句</FieldLabel>
              <Textarea
                id="expression-edit-example"
                value={draft.example}
                maxLength={500}
                aria-invalid={issues.some((issue) => issue.includes("英文例句"))}
                className="min-h-20 resize-y"
                onChange={(event) => updateDraft("example", event.target.value)}
              />
            </Field>

            {issues.length > 0 ? <FieldError>{issues.join("；")}</FieldError> : null}
          </FieldGroup>

          <DialogFooter className="m-0 mt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {saving ? "正在保存" : "保存修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
