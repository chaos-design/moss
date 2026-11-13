"use client"

import { EarIcon, LoaderCircleIcon, Volume2Icon } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
import { useLocalServiceConfig } from "@/features/speech/use-local-service-config"
import { useSpeechConfig } from "@/features/speech/use-speech-config"
import { useTtsConfig } from "@/features/speech/use-tts-config"
import type { AsrEngine } from "@/lib/asr-config"
import { asrEngineOptions } from "@/lib/asr-config"
import { asrTestAudioMimeType, createAsrTestAudioBase64 } from "@/lib/asr-test-audio"
import {
  buildLocalServiceSelection,
  getAsrEngineOptionsForService,
  getLocalService,
  getLocalServiceOptions,
  type LocalServiceOption,
  matchLocalService,
  resolveLocalService,
} from "@/lib/local-service-config"
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
type TestState = { status: TestStatus; message: string }

const idleTestState: TestState = { status: "idle", message: "" }

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

// 502 多来自上游：把常见原因转成可执行的下一步，同时保留原始错误码。
function describeSpeechFailureHint(message: string) {
  if (/unauthorized|invalid_api_key|invalid token/i.test(message)) {
    return " 上游凭据无效，请检查对应服务端的 API Key 是否完整有效。"
  }
  if (/unreachable|not_configured|ECONNREFUSED/i.test(message)) {
    return " 上游服务不可达，请确认服务已启动，且网络或代理可访问。"
  }
  if (/payment_required/i.test(message)) {
    return " 上游账户余额不足，请改用免费模型或先充值。"
  }
  return ""
}

export function SpeechServiceCard() {
  const { config, resolved, setEndpoint } = useSpeechConfig()
  // ASR 与 TTS 的测试链路各自持有状态，一个服务的测试与结果不影响另一个服务。
  const [asrTest, setAsrTest] = useState<TestState>(idleTestState)
  const [ttsTest, setTtsTest] = useState<TestState>(idleTestState)

  const asr = resolved.asr
  const tts = resolved.tts

  function invalidateTest(service: SpeechService) {
    if (service === "asr") {
      setAsrTest(idleTestState)
    } else {
      setTtsTest(idleTestState)
    }
  }

  function updateEndpoint(service: SpeechService, patch: Partial<SpeechEndpoint>) {
    invalidateTest(service)
    // 手动切回本机服务时清掉可能残留的适配器地址，避免把 http://.../v1 当成
    // 本机 WebSocket/网关地址使用（地址与接入方式错配）。
    const normalized =
      patch.transport === "local" ? { ...patch, endpoint: "", model: "", voice: "" } : patch
    setEndpoint(service, (current) => ({ ...current, ...normalized }))
  }

  async function handleTtsTest() {
    setTtsTest({ status: "testing", message: "正在请求语音合成接口…" })
    try {
      const response = await fetch("/api/speech/tts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: { apiKey: tts.apiKey, endpoint: tts.endpoint, model: tts.model },
          text: testSynthesisDefaults.text,
          // 使用设置里配置的音色；留空时交给服务端默认音色，而不是强推 OpenAI 的 alloy。
          voice: tts.voice ?? "",
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
      setTtsTest({
        status: "success",
        message:
          `语音合成接口可用，音频已正常返回。${diagnostic.contentType ?? "audio"} · ` +
          `${describeAudioSize(diagnostic.bytes)} · ${diagnostic.durationMs ?? 0} ms`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      setTtsTest({
        status: "error",
        message: `语音合成接口不可用：${message}${describeSpeechFailureHint(message)}`,
      })
    }
  }

  async function handleAsrTest() {
    setAsrTest({ status: "testing", message: "正在请求语音识别接口…" })
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
      setAsrTest({
        status: "success",
        message: text
          ? `语音识别接口可用，返回文本：「${text}」。`
          : "语音识别接口可用，本次返回空文本。",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      setAsrTest({
        status: "error",
        message: `语音识别接口不可用：${message}${describeSpeechFailureHint(message)}`,
      })
    }
  }

  return (
    <Card
      size="sm"
      className={cn("flex w-full min-w-0 flex-col rounded-lg", settingsCardHeightClass)}
    >
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

      <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
      </CardContent>

      {/* 测试按钮按服务分栏，固定在卡片底部：内容区滚动时仍可直接验证对应服务。 */}
      <CardFooter className="grid shrink-0 items-start gap-4 max-lg:grid-cols-1 lg:grid-cols-2 lg:gap-5">
        <SpeechTestControl
          service="asr"
          state={asrTest}
          disabled={asr.transport !== "api"}
          onTest={handleAsrTest}
        />
        <SpeechTestControl
          service="tts"
          state={ttsTest}
          disabled={tts.transport !== "api"}
          onTest={handleTtsTest}
        />
      </CardFooter>
    </Card>
  )
}

function SpeechTestControl({
  disabled,
  onTest,
  service,
  state,
}: {
  disabled: boolean
  onTest: () => void
  service: SpeechService
  state: TestState
}) {
  const isTesting = state.status === "testing"
  const idleHint = service === "asr" ? "验证当前配置的识别接口。" : "验证当前配置的合成接口。"

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-center"
        disabled={disabled || isTesting}
        onClick={onTest}
      >
        {isTesting ? (
          <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
        ) : service === "asr" ? (
          <EarIcon data-icon="inline-start" />
        ) : (
          <Volume2Icon data-icon="inline-start" />
        )}
        {service === "asr" ? "测试识别接口" : "测试合成接口"}
      </Button>
      <p
        className={cn(
          "min-h-4 text-xs leading-5",
          state.status === "error" && "text-destructive",
          state.status === "success" && "text-[var(--success)]",
          state.status !== "error" && state.status !== "success" && "text-muted-foreground",
        )}
        role="status"
      >
        {state.message || (disabled ? "选择 HTTP API 接入后可验证。" : idleHint)}
      </p>
    </div>
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
          <LocalServiceSelect
            service={service}
            endpoint={endpoint}
            stored={stored}
            onChange={onChange}
          />
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
        <ApiVoiceField
          idPrefix={idPrefix}
          service={service}
          endpoint={endpoint}
          stored={stored}
          onChange={onChange}
        />
      ) : null}

      {endpoint.transport === "local" ? (
        <LocalServiceConfigField service={service} endpoint={endpoint} />
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
// 选项与取值都按所选本机服务独立匹配，切换服务不会沿用另一个服务的引擎或音色。
function LocalServiceConfigField({
  service,
  endpoint,
}: {
  service: SpeechService
  endpoint: SpeechEndpoint
}) {
  const { engine } = useAsrConfig()
  const option = resolveLocalService(
    service,
    endpoint.transport === "local" ? "" : endpoint.endpoint,
    engine,
  )
  if (service === "asr") {
    return <LocalAsrEngineField option={option} />
  }
  return <LocalTtsVoiceField option={option} />
}

/** 本机服务地址改为下拉输入选择，选项只来自通用规则配置的 MOSS 本机服务可用项。 */
function LocalServiceSelect({
  service,
  endpoint,
  stored,
  onChange,
}: {
  service: SpeechService
  endpoint: SpeechEndpoint
  stored: SpeechEndpoint
  onChange: (patch: Partial<SpeechEndpoint>) => void
}) {
  const { config: saved, replace } = useLocalServiceConfig()
  const { engine, selectEngine } = useAsrConfig()
  const { config: ttsConfig, selectVoice } = useTtsConfig()
  const options = getLocalServiceOptions(service)
  // 本机接入只看引擎与默认服务，忽略可能残留的适配器地址，避免地址与接入方式错配。
  const current = resolveLocalService(
    service,
    endpoint.transport === "local" ? "" : endpoint.endpoint,
    engine,
  )
  const items = options.map((option) => ({ value: option.id, label: option.label }))

  function handleSelect(value: string | null) {
    if (!value) {
      return
    }
    const option = getLocalService(service, value)
    const selection = buildLocalServiceSelection({
      service,
      option,
      previousId: current.id,
      current: stored,
      engine,
      gatewayVoice: getSelectedVoiceValue(ttsConfig),
      saved,
    })
    replace(selection.saved)
    if (selection.engine) {
      selectEngine(selection.engine)
    }
    if (selection.gatewayVoice) {
      selectVoice(selection.gatewayVoice)
    }
    onChange(selection.patch)
  }

  return (
    <Field>
      <FieldLabel htmlFor={`${service}-local-service`}>
        {serviceLabels[service]}本机服务地址
      </FieldLabel>
      <Select items={items} value={current.id} onValueChange={handleSelect}>
        <SelectTrigger
          id={`${service}-local-service`}
          className="h-auto w-full items-center py-1.5"
        >
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
            <span className="max-w-full truncate">{current.label}</span>
            <span
              className="max-w-full truncate font-mono text-[10px] text-muted-foreground"
              title={current.endpoint}
            >
              {current.endpoint}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span className="flex min-w-0 flex-col items-start gap-0.5 whitespace-normal">
                  <span className="truncate">{option.label}</span>
                  <span className="break-all text-left font-mono text-[10px] text-muted-foreground">
                    {option.endpoint}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        下拉选项与 MOSS 本机服务可用项一致，并直接展示服务地址；选择本机适配器时自动对齐到 HTTP
        API 接入。留空使用环境变量中的地址；服务未启动时会自动回退到浏览器语音。
      </FieldDescription>
    </Field>
  )
}

/** 接口音色按所选本机适配器分别保存，避免 ElevenLabs voice ID 与 Fish Audio reference_id 混用。 */
function ApiVoiceField({
  idPrefix,
  service,
  endpoint,
  stored,
  onChange,
}: {
  idPrefix: SpeechService
  service: SpeechService
  endpoint: SpeechEndpoint
  stored: SpeechEndpoint
  onChange: (patch: Partial<SpeechEndpoint>) => void
}) {
  const { setTtsVoice } = useLocalServiceConfig()
  const matched = service === "tts" ? matchLocalService("tts", endpoint.endpoint) : null
  const hint =
    matched?.voices === "fishaudio"
      ? "Fish Audio 填 voice model ID（reference_id）；留空使用内置默认音色。与对话页音色选择同步。"
      : matched?.voices === "elevenlabs"
        ? "ElevenLabs 填 voice ID 或 alloy/echo/fable/onyx/nova/shimmer 兼容别名；留空使用服务端默认音色。与对话页音色选择同步。"
        : "OpenAI 兼容服务常用 alloy/echo/fable/onyx/nova/shimmer；本机适配器可留空使用服务端默认音色，Fish Audio 填 voice model ID（reference_id）。对话页的接口音色与此同步。"

  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-voice`}>{serviceLabels[service]}音色</FieldLabel>
      <Input
        id={`${idPrefix}-voice`}
        value={stored.voice}
        onChange={(event) => {
          const voice = event.target.value.trim()
          if (matched) {
            setTtsVoice(matched.id, voice)
          }
          onChange({ voice })
        }}
        placeholder={matched?.voices === "fishaudio" ? "reference_id" : "alloy"}
      />
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  )
}

function LocalAsrEngineField({ option }: { option: LocalServiceOption }) {
  const { engine, selectEngine } = useAsrConfig()
  const { setAsrEngine } = useLocalServiceConfig()
  const items = getAsrEngineOptionsForService(option).map((item) => ({
    value: item.value,
    label: item.label,
  }))
  if (!items.length) {
    return null
  }
  const value = items.some((item) => item.value === engine) ? engine : items[0].value

  return (
    <Field>
      <FieldLabel htmlFor="asr-engine">识别引擎</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next) {
            selectEngine(next as AsrEngine)
            setAsrEngine(option.id, next)
          }
        }}
      >
        <SelectTrigger id="asr-engine" className="w-full" aria-label="选择语音识别引擎">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>
        {option.id === "funasr"
          ? "FunASR（外部）使用标准 2-pass 协议，需按开发文档单独启动。"
          : "仅对本机 ASR 服务生效（Qwen3-ASR / SenseVoice）；与对话页引擎选择同步。"}
      </FieldDescription>
    </Field>
  )
}

function LocalTtsVoiceField({ option }: { option: LocalServiceOption }) {
  const { config, selectVoice } = useTtsConfig()
  const { setTtsVoice } = useLocalServiceConfig()
  if (option.voices !== "gateway") {
    return null
  }
  const items = ttsVoiceOptions.map((voice) => ({
    value: voice.value,
    label: voice.label,
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
            setTtsVoice(option.id, value)
          }
        }}
      >
        <SelectTrigger id="tts-local-voice" className="w-full" aria-label="选择本机语音音色">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="max-h-64 overflow-y-auto">
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
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
