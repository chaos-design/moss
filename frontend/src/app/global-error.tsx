"use client"

import { useEffect } from "react"

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * It replaces the root layout, so it must not depend on the app shell: no shared components, no
 * theme tokens that are only defined once the layout has rendered, and no icon font. Everything it
 * needs is inlined, because the one guarantee this file cannot make is that the rest of the app
 * loaded successfully.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Root layout failed to render", error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#18181b",
          background: "#ffffff",
        }}
      >
        <div
          style={{ maxWidth: "28rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>页面遇到问题</h1>
          <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6, opacity: 0.75 }}>
            应用没能正常启动。你的学习记录已保存在本机，重新加载后可以继续。
          </p>
          {error.digest ? (
            <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.6 }}>
              错误编号：{error.digest}
            </p>
          ) : null}
          <div>
            <button
              type="button"
              onClick={reset}
              style={{
                height: "2rem",
                padding: "0 1rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(24,24,27,0.12)",
                background: "rgba(24,24,27,0.04)",
                color: "inherit",
                font: "inherit",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              重新加载
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
