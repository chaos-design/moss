"use client"

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  EarIcon,
  LoaderCircleIcon,
  Volume2Icon,
} from "lucide-react"
import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { settingsCardHeightClass } from "@/features/settings/settings-layout"
import { useSpeechConfig } from "@/features/speech/use-speech-config"
import {
  describeSpeechTransport,
  getDefaultApiEndpoint,
  getDefaultLocalEndpoint,
  isValidSpeechEndpoint,
  type SpeechEndpoint,
  type SpeechService,
  type SpeechTransport,
  speechTransportLabels,
  speechTransports,
} from "@/lib/speech-config"
import { cn } from "@/lib/utils"

const transportItems = speechTransports.map((transport) => ({
  label: speechTransportLabels[transport],
  value: transport,
}))

const transportHints: Record<SpeechTransport, string> = {
  local: "使用本机 pnpm asr:start / pnpm tts:start 启动的服务；未启动时会自动回退。",
  api: "对接任意 OpenAI 兼容的 HTTP 接口，请求由本站代理转发。",
  browser: "直接使用浏览器内置语音能力，无需任何本地服务。",
}

// Batch transcription has no interim results and no speech-onset signal, so the caller must not
// promise barge-in or live partials when the HTTP API transport is selected.
const serviceTransportHints: Record<SpeechTransport, string> = {
  ...transportHints,
  api: "整段上传识别，不提供实时字幕与说话打断；请求由本站代理转发。",
}

type TestStatus = "idle" | "testing" | "success" | "error"

export function SpeechServiceCard() {
  const { config, resolved, setEndpoint } = useSpeechConfig()
  const [testStatus, setTestStatus] = useState<TestStatus>("idle")
  const [testMessage, setTestMessage] = useState("")

  const asr = resolved.asr
  const tts = resolved.tts

  function updateEndpoint(service: SpeechService, patch: Partial<SpeechEndpoint>) {
    setTestStatus("idle")
    setTestMessage("")
    setEndpoint(service, (current) => ({ ...current, ...patch }))
  }

  async function handleTest() {
    setTestStatus("testing")
    setTestMessage("正在请求语音合成接口…")
    try {
      const response = await fetch("/api/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: { apiKey: tts.apiKey, endpoint: tts.endpoint, model: tts.model },
          text: "Moss 语音接口测试成功。",
          voice: "alloy",
        }),
      })
      if (!response.ok) {
        throw new Error(`接口返回 ${response.status}`)
      }
      setTestStatus("success")
      setTestMessage("语音合成接口可用，音频已正常返回。")
    } catch (error) {
      setTestStatus("error")
      setTestMessage(
        error instanceof Error
          ? `语音合成接口不可用：${error.message}`
          : "语音合成接口不可用。",
      )
    }
  }

  return (
    <Card size="sm" className={cn("w-full min-w-0 rounded-lg", settingsCardHeightClass)}>
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <EarIcon className="size-4 text-primary" aria-hidden="true" />
          语音服务接入
        </CardTitle>
        <CardDescription>
          本机 ASR / TTS 服务未启动时，仍可使用浏览器语音或任意 OpenAI 兼容接口。
        </CardDescription>
        <CardAction>
          <Badge variant="outline">
            识别 {describeSpeechTransport("asr", asr.transport)} · 合成{" "}
            {describeSpeechTransport("tts", tts.transport)}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="min-h-0 overflow-y-auto overscroll-contain">
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <SpeechEndpointFields
            idPrefix="asr"
            service="asr"
            endpoint={asr}
            stored={config.asr}
            onChange={(patch) => updateEndpoint("asr", patch)}
          />
          <SpeechEndpointFields
            idPrefix="tts"
            service="tts"
            endpoint={tts}
            stored={config.tts}
            onChange={(patch) => updateEndpoint("tts", patch)}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={tts.transport !== "api" || testStatus === "testing"}
            onClick={handleTest}
          >
            {testStatus === "testing" ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <Volume2Icon data-icon="inline-start" />
            )}
            测试合成接口
          </Button>
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs",
              testStatus === "error" && "text-destructive",
              testStatus === "success" && "text-[var(--success)]",
              testStatus !== "error" && testStatus !== "success" && "text-muted-foreground",
            )}
            role="status"
          >
            {testStatus === "success" ? (
              <CheckCircle2Icon className="size-3.5" aria-hidden="true" />
            ) : testStatus === "error" ? (
              <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
            ) : null}
            {tts.transport !== "api"
              ? "选择 HTTP API 接入后可在此验证合成接口。"
              : testMessage || "识别接口会在开始语音对话时验证。"}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function SpeechEndpointFields({
  endpoint,
  idPrefix,
  onChange,
  service,
  stored,
}: {
  endpoint: SpeechEndpoint
  idPrefix: SpeechService
  onChange: (patch: Partial<SpeechEndpoint>) => void
  service: SpeechService
  stored: SpeechEndpoint
}) {
  const endpointInvalid =
    Boolean(endpoint.endpoint) && !isValidSpeechEndpoint(endpoint.endpoint)

  const serviceLabels: Record<SpeechService, string> = {
    asr: "语音识别",
    tts: "语音合成",
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          {service === "asr" ? "语音识别（ASR）" : "语音合成（TTS）"}
        </h3>
        <Badge variant="secondary">{speechTransportLabels[endpoint.transport]}</Badge>
      </div>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-transport`}>
          {serviceLabels[service]}接入方式
        </FieldLabel>
        <Select
          items={transportItems}
          value={endpoint.transport}
          onValueChange={(value) => {
            if (value) {
              onChange({ transport: value as SpeechTransport })
            }
          }}
        >
          <SelectTrigger id={`${idPrefix}-transport`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {transportItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          {service === "asr"
            ? serviceTransportHints[endpoint.transport]
            : transportHints[endpoint.transport]}
        </FieldDescription>
      </Field>

      {endpoint.transport === "api" ? (
        <Field data-invalid={endpointInvalid || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-endpoint`}>
            {serviceLabels[service]}接口地址
          </FieldLabel>
          <Input
            id={`${idPrefix}-endpoint`}
            type="url"
            value={stored.endpoint}
            onChange={(event) => onChange({ endpoint: event.target.value })}
            placeholder={getDefaultApiEndpoint(service)}
            aria-invalid={endpointInvalid || undefined}
          />
          <FieldDescription>
            填写服务根地址，系统会追加 /audio/{service === "asr" ? "transcriptions" : "speech"}
            。
          </FieldDescription>
        </Field>
      ) : (
        <Field data-invalid={endpointInvalid || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-local-endpoint`}>
            {serviceLabels[service]}本机服务地址
          </FieldLabel>
          <Input
            id={`${idPrefix}-local-endpoint`}
            value={stored.endpoint}
            onChange={(event) => onChange({ endpoint: event.target.value })}
            placeholder={getDefaultLocalEndpoint(service)}
            aria-invalid={endpointInvalid || undefined}
          />
          <FieldDescription>
            留空则使用环境变量中的地址；服务未启动时会自动回退到浏览器语音。
          </FieldDescription>
        </Field>
      )}

      {endpoint.transport === "api" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-model`}>{serviceLabels[service]}模型</FieldLabel>
            <Input
              id={`${idPrefix}-model`}
              value={endpoint.model}
              onChange={(event) => onChange({ model: event.target.value })}
              placeholder={service === "asr" ? "whisper-1" : "tts-1"}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-key`}>
              {serviceLabels[service]}API 密钥
            </FieldLabel>
            <Input
              id={`${idPrefix}-key`}
              type="password"
              value={endpoint.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="可留空"
              autoComplete="off"
            />
          </Field>
        </div>
      ) : null}

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-status`}>
          {serviceLabels[service]}当前生效配置
        </FieldLabel>
        <p
          id={`${idPrefix}-status`}
          className={cn(
            "rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground",
            endpointInvalid && "text-destructive",
          )}
        >
          {describeSpeechTransport(service, endpoint.transport)}
          {` · ${endpoint.endpoint || getDefaultLocalEndpoint(service)}`}
          {endpoint.transport === "api" && endpoint.model ? ` · ${endpoint.model}` : ""}
        </p>
        <FieldDescription>
          {endpointInvalid
            ? "接口地址需要是 HTTPS 公网地址，或本机回环地址。"
            : "仅保存在当前浏览器，不会写入学习记忆或云端账户。"}
        </FieldDescription>
      </Field>
    </div>
  )
}
