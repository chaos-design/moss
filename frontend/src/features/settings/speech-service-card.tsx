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
import { useAsrConfig } from "@/features/speech/use-asr-config"
import { useSpeechConfig } from "@/features/speech/use-speech-config"
import { useTtsConfig } from "@/features/speech/use-tts-config"
import type { AsrEngine } from "@/lib/asr-config"
import { asrEngineOptions } from "@/lib/asr-config"
import { asrTestAudioMimeType, createAsrTestAudioBase64 } from "@/lib/asr-test-audio"
import {
  describeSpeechTransport,
  getDefaultApiEndpoint,
  getDefaultFishAudioEndpoint,
  getDefaultFishAudioModel,
  getDefaultLocalApiEndpoint,
  getDefaultLocalApiModel,
  getDefaultLocalEndpoint,
  getSpeechFieldPolicy,
  isLoopbackSpeechEndpoint,
  isValidSpeechEndpoint,
  type SpeechEndpoint,
  type SpeechService,
  type SpeechTransport,
  speechModelFieldHint,
  speechTransportLabels,
  speechTransports,
} from "@/lib/speech-config"
import { speechRules, testSynthesisDefaults } from "@/lib/speech-rules"
import { getSelectedVoiceValue, ttsVoiceOptions } from "@/lib/tts-config"
import { cn } from "@/lib/utils"

const transportItems = speechTransports.map((transport) => ({
  label: speechTransportLabels[transport],
  value: transport,
}))

const transportHints: Record<SpeechTransport, string> = {
  local: "使用本机 pnpm asr:start / pnpm tts:start 启动的服务；未启动时会自动回退。",
  api: "对接任意 OpenAI 兼容的 HTTP 接口（含本机 local 接口），请求由本站代理转发。",
  browser: "直接使用浏览器内置语音能力，无需任何本地服务。",
}

// Batch transcription has no interim results and no speech-onset signal, so the caller must not
// promise barge-in or live partials when the HTTP API transport is selected.
const serviceTransportHints: Record<SpeechTransport, string> = {
  ...transportHints,
  api: "整段上传识别，不提供实时字幕与说话打断；可指向本机 local 接口，由本站代理转发。",
}

type TestStatus = "idle" | "testing" | "success" | "error"
type TestTarget = "asr" | "tts"

type TestDiagnostic = {
  ok?: boolean
  contentType?: string
  bytes?: number
  durationMs?: number
  error?: { code?: string; message?: string }
}

type AsrTestResult = {
  data?: { text?: unknown }
  error?: { code?: string; message?: string }
}

function describeAudioSize(bytes: number | undefined) {
  if (typeof bytes !== "number" || bytes < 0) {
    return "0 B"
  }
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

export function SpeechServiceCard() {
  const { config, resolved, setEndpoint } = useSpeechConfig()
  const [testStatus, setTestStatus] = useState<TestStatus>("idle")
  const [testTarget, setTestTarget] = useState<TestTarget>("tts")
  const [testMessage, setTestMessage] = useState("")

  const asr = resolved.asr
  const tts = resolved.tts

  function updateEndpoint(service: SpeechService, patch: Partial<SpeechEndpoint>) {
    setTestStatus("idle")
    setTestMessage("")
    setEndpoint(service, (current) => ({ ...current, ...patch }))
  }

  async function handleTtsTest() {
    setTestTarget("tts")
    setTestStatus("testing")
    setTestMessage("正在请求语音合成接口…")
    try {
      const response = await fetch("/api/speech/tts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: { apiKey: tts.apiKey, endpoint: tts.endpoint, model: tts.model },
          text: testSynthesisDefaults.text,
          voice: testSynthesisDefaults.voice,
        }),
      })
      // 诊断端点始终回 JSON；非 JSON 响应按 HTTP 状态兜底，保证错误可读。
      let diagnostic: TestDiagnostic = {}
      try {
        diagnostic = (await response.json()) as TestDiagnostic
      } catch {
        // 保留空诊断，下面用 HTTP 状态描述失败。
      }
      if (!response.ok || !diagnostic.ok) {
        const reason = diagnostic.error?.message ?? `接口返回 ${response.status}`
        const code = diagnostic.error?.code
        throw new Error(code ? `${reason}（${code}）` : reason)
      }
      setTestStatus("success")
      setTestMessage(
        `语音合成接口可用，音频已正常返回。${diagnostic.contentType ?? "audio"} · ` +
          `${describeAudioSize(diagnostic.bytes)} · ${diagnostic.durationMs ?? 0} ms`,
      )
    } catch (error) {
      setTestStatus("error")
      setTestMessage(
        error instanceof Error
          ? `语音合成接口不可用：${error.message}`
          : "语音合成接口不可用。",
      )
    }
  }

  async function handleAsrTest() {
    setTestTarget("asr")
    setTestStatus("testing")
    setTestMessage("正在请求语音识别接口…")
    try {
      const response = await fetch("/api/speech/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: { apiKey: asr.apiKey, endpoint: asr.endpoint, model: asr.model },
          audioBase64: createAsrTestAudioBase64(),
          mimeType: asrTestAudioMimeType,
          language: "en",
        }),
      })
      let result: AsrTestResult = {}
      try {
        result = (await response.json()) as AsrTestResult
      } catch {
        // 非 JSON 响应按 HTTP 状态兜底，保证错误可读。
      }
      if (!response.ok || result.error) {
        const reason = result.error?.message ?? `接口返回 ${response.status}`
        const code = result.error?.code
        throw new Error(code ? `${reason}（${code}）` : reason)
      }
      const text = typeof result.data?.text === "string" ? result.data.text.trim() : ""
      setTestStatus("success")
      setTestMessage(
        text
          ? `语音识别接口可用，返回文本：「${text}」。`
          : "语音识别接口可用，本次返回空文本。",
      )
    } catch (error) {
      setTestStatus("error")
      setTestMessage(
        error instanceof Error
          ? `语音识别接口不可用：${error.message}`
          : "语音识别接口不可用。",
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
          可接入本机 ASR / TTS 服务、本机 local 接口、Fish Audio 或任意 OpenAI
          兼容接口；未启动时回退到浏览器语音。
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
          {asr.transport === "api" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testStatus === "testing"}
              onClick={handleAsrTest}
            >
              {testStatus === "testing" && testTarget === "asr" ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <EarIcon data-icon="inline-start" />
              )}
              测试识别接口
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={tts.transport !== "api" || testStatus === "testing"}
            onClick={handleTtsTest}
          >
            {testStatus === "testing" && testTarget === "tts" ? (
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
            {tts.transport !== "api" && testTarget === "tts"
              ? "选择 HTTP API 接入后可在此验证合成接口。"
              : testMessage ||
                (asr.transport === "api"
                  ? "两个接口都可以先用这里的测试按钮验证连通性。"
                  : "识别接口会在开始语音对话时验证。")}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

const serviceLabels: Record<SpeechService, string> = {
  asr: "语音识别",
  tts: "语音合成",
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
  const policy = getSpeechFieldPolicy(service, endpoint.transport)

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

      {policy.endpoint !== "hidden" ? (
        endpoint.transport === "api" ? (
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
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`填入${serviceLabels[service]}本机接口`}
                onClick={() =>
                  onChange({
                    endpoint: getDefaultLocalApiEndpoint(service),
                    model: getDefaultLocalApiModel(service),
                  })
                }
              >
                使用本机接口
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`填入${serviceLabels[service]}Fish Audio 接口`}
                onClick={() =>
                  onChange({
                    endpoint: getDefaultFishAudioEndpoint(service),
                    model: getDefaultFishAudioModel(service),
                  })
                }
              >
                使用 Fish Audio
              </Button>
              <span className="min-w-0 break-all text-xs text-muted-foreground">
                {getDefaultLocalApiEndpoint(service)} · {getDefaultFishAudioEndpoint(service)}
              </span>
            </div>
            <FieldDescription>
              填写服务根地址，系统会追加 /audio/
              {service === "asr" ? "transcriptions" : "speech"}
              ；「使用本机接口」「使用 Fish Audio」可一键填入对应本机适配器地址与模型。
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
        )
      ) : null}

      {policy.model !== "hidden" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-model`}>{serviceLabels[service]}模型</FieldLabel>
            <Input
              id={`${idPrefix}-model`}
              value={endpoint.model}
              onChange={(event) => onChange({ model: event.target.value })}
              placeholder={speechRules.models.remoteApi[service]}
            />
            <FieldDescription>{speechModelFieldHint}</FieldDescription>
          </Field>
          {policy.apiKey !== "hidden" ? (
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
          ) : null}
        </div>
      ) : null}

      {policy.voice !== "hidden" && endpoint.transport === "api" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-voice`}>{serviceLabels[service]}音色</FieldLabel>
          <Input
            id={`${idPrefix}-voice`}
            value={stored.voice}
            onChange={(event) => onChange({ voice: event.target.value.trim() })}
            placeholder="alloy"
          />
          <FieldDescription>
            OpenAI 兼容服务常用 alloy/echo/fable/onyx/nova/shimmer；本机适配器可留空使用服务端
            默认音色，Fish Audio 填 voice model ID（reference_id）。对话页的接口音色与此同步。
          </FieldDescription>
        </Field>
      ) : null}

      {endpoint.transport === "local" ? <LocalServiceConfigField service={service} /> : null}

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
          {endpoint.transport === "api" && isLoopbackSpeechEndpoint(endpoint.endpoint)
            ? "（本机接口）"
            : ""}
          {` · ${endpoint.endpoint || getDefaultLocalEndpoint(service)}`}
          {endpoint.transport === "api" && endpoint.model ? ` · ${endpoint.model}` : ""}
          <EffectiveServiceDetail endpoint={endpoint} service={service} />
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

// 生效配置的补充段：本机接入显示引擎/音色，API 合成显示音色；由统一字段规范驱动。
function EffectiveServiceDetail({
  endpoint,
  service,
}: {
  endpoint: SpeechEndpoint
  service: SpeechService
}) {
  if (service === "asr" && endpoint.transport === "local") {
    return <LocalAsrEngineDetail />
  }
  if (service === "tts" && endpoint.transport === "local") {
    return <LocalTtsVoiceDetail />
  }
  if (service === "tts" && endpoint.transport === "api") {
    return endpoint.voice ? ` · 音色 ${endpoint.voice}` : " · 音色 alloy"
  }
  return null
}

function LocalAsrEngineDetail() {
  const { engine } = useAsrConfig()
  const option = asrEngineOptions.find((item) => item.value === engine)
  return ` · 引擎 ${option?.label ?? engine}`
}

function LocalTtsVoiceDetail() {
  const { config } = useTtsConfig()
  const selected = ttsVoiceOptions.find(
    (option) => option.value === getSelectedVoiceValue(config),
  )
  return ` · 音色 ${selected?.name ?? config.voice}`
}

// 本机接入的模型/音色配置：引擎与音色属于本机服务自己的配置，与 HTTP API 的 model 字段无关。
function LocalServiceConfigField({ service }: { service: SpeechService }) {
  if (service === "asr") {
    return <LocalAsrEngineField />
  }
  return <LocalTtsVoiceField />
}

function LocalAsrEngineField() {
  const { engine, selectEngine } = useAsrConfig()
  const items = asrEngineOptions.map((option) => ({
    value: option.value,
    label: option.label,
  }))

  return (
    <Field>
      <FieldLabel htmlFor="asr-engine">识别引擎</FieldLabel>
      <Select
        items={items}
        value={engine}
        onValueChange={(value) => {
          if (value) {
            selectEngine(value as AsrEngine)
          }
        }}
      >
        <SelectTrigger id="asr-engine" className="w-full" aria-label="选择语音识别引擎">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {asrEngineOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>仅对本机 ASR 服务生效；FunASR 需按开发文档单独启动。</FieldDescription>
    </Field>
  )
}

function LocalTtsVoiceField() {
  const { config, selectVoice } = useTtsConfig()
  const items = ttsVoiceOptions.map((option) => ({
    value: option.value,
    label: option.label,
  }))
  const selectedValue = getSelectedVoiceValue(config)

  return (
    <Field>
      <FieldLabel htmlFor="tts-local-voice">本机语音音色</FieldLabel>
      <Select
        items={items}
        value={selectedValue}
        onValueChange={(value) => {
          if (value) {
            selectVoice(value)
          }
        }}
      >
        <SelectTrigger id="tts-local-voice" className="w-full" aria-label="选择本机语音音色">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-64 overflow-y-auto">
          <SelectGroup>
            {items.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        仅对本机 TTS 网关生效（Kokoro / Audio8 / CosyVoice）；与对话页音色选择同步。
      </FieldDescription>
    </Field>
  )
}
