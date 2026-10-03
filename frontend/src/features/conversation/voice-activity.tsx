"use client"

import { BrainCircuitIcon } from "lucide-react"
import type { VoiceCallStatus } from "@/lib/call-runtime"
import { cn } from "@/lib/utils"

const voiceBars = [34, 68, 48, 84, 56, 76, 42]
const stateLabels: Record<VoiceCallStatus, string> = {
  idle: "语音待机",
  connecting: "正在建立语音连接",
  listening: "麦克风已开启，可以说话",
  transcribing: "正在本机识别语音",
  thinking: "Moss 正在思考",
  speaking: "Moss 正在回应",
  muted: "麦克风已静音",
  manual: "语音识别不可用",
  ended: "语音通话已结束",
}

export function VoiceActivity({
  status,
  compact = false,
  className,
}: {
  status: VoiceCallStatus
  compact?: boolean
  className?: string
}) {
  const active = status !== "ended"
  const idle = status === "idle"
  const speaking = status === "speaking"
  const listening = status === "listening"
  const thinking = status === "thinking" || status === "connecting" || status === "transcribing"
  const unavailable = status === "manual"
  const energized = listening || speaking || thinking

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center [perspective:220px]",
        compact ? "size-10" : "size-16",
        status === "listening" && "text-[var(--success)]",
        status === "thinking" && "text-[var(--chart-3)]",
        status === "connecting" && "text-[var(--chart-3)]",
        status === "transcribing" && "text-[var(--chart-3)]",
        status === "speaking" && "text-primary",
        unavailable && "text-destructive",
        (status === "idle" || status === "ended" || status === "muted") &&
          "text-muted-foreground",
        className,
      )}
      role="img"
      aria-label={stateLabels[status]}
    >
      {energized || unavailable ? (
        <span
          data-agent-ambient-halo
          className={cn(
            "absolute inset-[8%] rounded-full bg-current/10 blur-sm motion-safe:animate-ping",
            thinking && "motion-safe:[animation-duration:1.8s]",
            speaking && "motion-safe:[animation-duration:1.2s]",
            listening && "motion-safe:[animation-duration:2.4s]",
            unavailable && "motion-safe:[animation-duration:3.2s]",
          )}
          aria-hidden="true"
        />
      ) : null}
      {listening ? (
        <>
          <span
            data-agent-listening-halo
            className="absolute -inset-1 rounded-full border border-current/25 motion-safe:animate-ping motion-safe:[animation-duration:2.8s]"
            aria-hidden="true"
          />
          <span data-agent-reticle className="absolute -inset-1" aria-hidden="true">
            <span className="absolute top-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-current/60" />
            <span className="absolute right-0 top-1/2 h-px w-1.5 -translate-y-1/2 bg-current/60" />
            <span className="absolute bottom-0 left-1/2 h-1.5 w-px -translate-x-1/2 bg-current/60" />
            <span className="absolute top-1/2 left-0 h-px w-1.5 -translate-y-1/2 bg-current/60" />
          </span>
        </>
      ) : null}
      <span
        data-agent-ring
        className={cn(
          "absolute inset-0 rounded-full border border-current/35 [border-left-color:transparent]",
          active && "motion-safe:animate-[spin_6s_linear_infinite]",
          thinking && "motion-safe:[animation-duration:2.4s]",
          idle && "motion-safe:[animation-duration:12s]",
        )}
      >
        <span
          data-agent-node
          className="absolute -top-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
        />
        <span
          data-agent-node
          className="absolute right-0 top-1/2 size-1 -translate-y-1/2 rounded-full bg-current"
        />
      </span>
      <span
        data-agent-ring
        className={cn(
          "absolute inset-[18%] rounded-full border border-dashed border-current/50",
          active && "motion-safe:animate-[spin_8s_linear_infinite_reverse]",
          speaking && "motion-safe:[animation-duration:2.8s]",
          idle && "motion-safe:[animation-duration:15s]",
        )}
      >
        <span
          data-agent-node
          className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
        />
      </span>
      <span
        data-agent-scanner
        className={cn(
          "absolute left-1/2 top-1/2 h-px w-[45%] origin-left bg-current/60",
          active && "motion-safe:animate-[spin_3.2s_linear_infinite]",
          listening && "motion-safe:[animation-duration:1.8s]",
          idle && "motion-safe:[animation-duration:8s]",
        )}
      />
      {energized ? (
        <span
          data-agent-secondary-scanner
          className="absolute left-1/2 top-1/2 h-px w-[34%] origin-left rotate-120 bg-current/30 motion-safe:animate-[spin_4.6s_linear_infinite_reverse]"
          aria-hidden="true"
        />
      ) : null}
      <span
        data-agent-core
        className={cn(
          "relative grid place-items-center border border-current/50 bg-background opacity-70 shadow-[0_0_18px_currentColor] [clip-path:polygon(25%_7%,75%_7%,100%_50%,75%_93%,25%_93%,0_50%)]",
          active && "motion-safe:animate-pulse",
          (listening || speaking) && "opacity-100",
          compact ? "size-5" : "size-8",
        )}
      >
        <BrainCircuitIcon
          className={compact ? "size-3" : "size-4"}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </span>
      <span
        className={cn(
          "absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-0.5",
          compact ? "h-2" : "h-3",
        )}
        aria-hidden="true"
      >
        {voiceBars.map((height, index) => (
          <span
            key={`${height}-${index}`}
            data-agent-bar
            className={cn(
              "h-full w-px origin-center rounded-full bg-current",
              active &&
                !idle &&
                "motion-safe:animate-[pulse_700ms_ease-in-out_infinite_alternate]",
            )}
            style={{
              opacity: 0.35 + height / 160,
              transform: `scaleY(${active ? height / 100 : 0.2})`,
              animationDelay: `${index * 55}ms`,
            }}
          />
        ))}
      </span>
    </div>
  )
}
