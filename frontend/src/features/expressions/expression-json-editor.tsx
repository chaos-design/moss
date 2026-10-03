"use client"

import dynamic from "next/dynamic"
import { useTheme } from "next-themes"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((module) => module.default),
  {
    ssr: false,
    loading: () => (
      <div
        className="relative h-64 overflow-hidden rounded-lg border"
        role="status"
        aria-label="正在加载 JSON 编辑器"
      >
        <Skeleton className="absolute inset-0 rounded-none" />
      </div>
    ),
  },
)

export function ExpressionJsonEditor({
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
}) {
  const { resolvedTheme } = useTheme()

  return (
    <div
      data-invalid={invalid}
      className={cn(
        "h-64 overflow-hidden rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 [&_.editorPlaceholder]:whitespace-pre-wrap!",
        invalid && "border-destructive ring-3 ring-destructive/20",
      )}
    >
      <MonacoEditor
        height="100%"
        language="json"
        path="inmemory://moss/expression-import.json"
        theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          accessibilitySupport: "auto",
          ariaLabel: "JSON 数据",
          automaticLayout: true,
          contextmenu: true,
          domReadOnly: disabled,
          folding: true,
          fontSize: 12,
          formatOnPaste: true,
          formatOnType: true,
          glyphMargin: false,
          lineDecorationsWidth: 8,
          lineHeight: 20,
          lineNumbersMinChars: 2,
          minimap: { enabled: false },
          overviewRulerBorder: false,
          overviewRulerLanes: 0,
          padding: { bottom: 10, top: 10 },
          placeholder,
          readOnly: disabled,
          renderLineHighlight: "line",
          scrollBeyondLastLine: false,
          scrollbar: {
            horizontalScrollbarSize: 8,
            verticalScrollbarSize: 8,
          },
          stickyScroll: { enabled: false },
          tabSize: 2,
          wordWrap: "on",
        }}
      />
    </div>
  )
}
