"use client"

import { CircleAlertIcon, MessagesSquareIcon, RefreshCwIcon, SaveIcon } from "lucide-react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useConversationPrefs } from "@/features/conversation/use-conversation-prefs"
import { settingsCardHeightClass } from "@/features/settings/settings-layout"
import { conversationPromptMaxLength } from "@/lib/conversation-prefs"
import { defaultConversationPrompt } from "@/lib/memory/conversation-prompt-text"
import { cn } from "@/lib/utils"

/** The heading the parser keys off, and the one place a learner edit silently breaks reply parsing. */
const contractHeading = "## Output Contract"

/**
 * The whole system prompt, editable.
 *
 * Split out of `SettingsForm` and memoized with its draft held locally, because the textarea holds
 * several thousand characters of text: if every keystroke re-rendered the model-config cards and
 * their selects alongside it, typing cost far more interaction latency than the save button did.
 *
 * Nothing here is enforced. The learner owns the prompt, so removing the output contract is allowed
 * and warned about rather than blocked — the transcript already reports a reply that failed to match
 * it, and this is the same fact surfaced before it happens.
 */
export const ConversationPromptEditor = memo(function ConversationPromptEditor() {
  const { prefs, setPrefs } = useConversationPrefs()
  const [draft, setDraft] = useState(prefs.conversationPrompt || defaultConversationPrompt)
  const skipNextSync = useRef(false)

  // The prefs store hydrates from storage after the server snapshot paints, so an existing custom
  // prompt has to be adopted once it is known. The ref keeps a self-inflicted save from bouncing the
  // draft back to a pre-normalization value.
  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    setDraft(prefs.conversationPrompt || defaultConversationPrompt)
  }, [prefs.conversationPrompt])

  const save = useCallback(() => {
    const trimmed = draft.trim()
    const next = trimmed === defaultConversationPrompt ? "" : trimmed
    if (next === prefs.conversationPrompt) {
      return
    }
    skipNextSync.current = true
    setPrefs((current) => ({ ...current, conversationPrompt: next }))
    setDraft(next || defaultConversationPrompt)
    toast.success(next ? "对话 Prompt 已保存" : "已恢复内置 Prompt")
  }, [draft, prefs.conversationPrompt, setPrefs])

  const restore = useCallback(() => {
    setDraft(defaultConversationPrompt)
    if (prefs.conversationPrompt) {
      skipNextSync.current = true
      setPrefs((current) => ({ ...current, conversationPrompt: "" }))
      toast.success("已恢复内置 Prompt")
    }
  }, [prefs.conversationPrompt, setPrefs])

  const isCustomized = Boolean(
    prefs.conversationPrompt && prefs.conversationPrompt !== defaultConversationPrompt,
  )
  const contractMissing = !draft.includes(contractHeading)

  return (
    <Card
      className={cn(
        "order-1 rounded-lg lg:col-span-2 lg:col-start-1 lg:row-start-1",
        settingsCardHeightClass,
      )}
    >
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <MessagesSquareIcon className="size-4 text-primary" aria-hidden="true" />
          对话 Prompt
        </CardTitle>
        <CardDescription>
          每次对话实际发送给模型的系统 Prompt，可整段改写。角色、规则和输出契约都归你所有。
        </CardDescription>
        <CardAction>
          <Badge variant={isCustomized ? "default" : "outline"}>
            {isCustomized ? "已自定义" : "使用内置"}
          </Badge>
        </CardAction>
        <div className="col-span-full mt-2 w-full border-b" aria-hidden="true" />
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain">
        <Field>
          <FieldLabel htmlFor="conversation-prompt">系统 Prompt（当前生效）</FieldLabel>
          <Textarea
            id="conversation-prompt"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            rows={18}
            maxLength={conversationPromptMaxLength}
            spellCheck={false}
            className="min-h-96 resize-y font-mono text-xs leading-5"
          />
          <FieldDescription>
            双花括号占位符由服务端按每轮场景替换，例如 {"{{sceneTitle}}"}、
            {"{{longTermMemory}}"}、{"{{tutorModeInstruction}}"}。仅保存在本机，不进入学习记忆。
          </FieldDescription>
        </Field>

        {contractMissing ? (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
            data-contract-warning
          >
            <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              当前 Prompt 里没有 <code className="font-mono">{contractHeading}</code>{" "}
              段落。模型不被要求返回 结构化 JSON
              时，回复仍会显示，但翻译、纠错、例句和记忆找回都会缺失，界面上会标注该轮未按契约返回。
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={save}>
            <SaveIcon data-icon="inline-start" />
            保存 Prompt
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={restore}
            disabled={!isCustomized && !draft.trim()}
          >
            <RefreshCwIcon data-icon="inline-start" />
            恢复内置
          </Button>
          <span className="font-mono text-[10px] text-muted-foreground">
            {draft.length} / {conversationPromptMaxLength}
          </span>
        </div>
      </CardContent>
    </Card>
  )
})
