"use client"

import { ArrowRightIcon, LockIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { SceneImage } from "@/features/scenes/scene-image"
import type { SceneItem } from "@/lib/demo-data"
import { cn } from "@/lib/utils"

const autoPlayIntervalMs = 5_000

export function HomeSceneCarousel({
  scenes,
  scenePreviews = scenes,
}: {
  scenes: SceneItem[]
  scenePreviews?: SceneItem[]
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused || scenes.length < 2) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % scenes.length)
    }, autoPlayIntervalMs)

    return () => window.clearInterval(timer)
  }, [isPaused, scenes.length])

  if (scenes.length === 0) {
    return null
  }

  const activeScene = scenes[activeIndex] ?? scenes[0]

  return (
    <section
      className="mt-6"
      aria-label="精选场景自动轮播"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsPaused(false)
        }
      }}
    >
      <Link
        key={activeScene.id}
        href={`/workspace/conversation?scene=${activeScene.id}`}
        aria-label={`${activeScene.title}，${activeScene.description}`}
        className="group/card relative block min-h-[390px] overflow-hidden rounded-lg bg-[#172722] text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-[430px]"
      >
        <SceneImage
          category={activeScene.category}
          title={activeScene.title}
          eager
          className="absolute inset-0 h-full w-full"
        />
        <span className="absolute inset-0 bg-[#10201b]/60" aria-hidden="true" />
        <span className="relative flex min-h-[390px] flex-col justify-between p-5 sm:min-h-[430px] lg:p-7">
          <span className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase">
            <span className="text-[#ff9b7f]">Featured situation</span>
            <span className="text-white/55">{activeScene.level}</span>
          </span>
          <span>
            <span className="block max-w-md font-serif text-3xl font-semibold leading-tight lg:text-4xl">
              {activeScene.title}
            </span>
            <span className="mt-2 block text-sm text-white/65">{activeScene.englishTitle}</span>
            <span className="mt-5 block max-w-md text-sm leading-6 text-white/80">
              {activeScene.description}
            </span>
            <span className="mt-5 flex items-center gap-2 text-sm font-medium">
              进入对话
              <ArrowRightIcon
                className="size-4 transition-transform group-hover/card:translate-x-1"
                aria-hidden="true"
              />
            </span>
          </span>
        </span>
      </Link>

      <nav
        className="scene-preview-scrollbar mt-3 flex gap-2 overflow-x-auto pb-3 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
        aria-label="全部场景快捷入口"
      >
        {scenePreviews.map((scene, index) => {
          const previewContent = (
            <>
              <SceneImage
                category={scene.category}
                title={scene.title}
                eager={index < 3}
                className="absolute inset-0 h-full w-full"
              />
              <span className="absolute inset-0 bg-[#10201b]/60" aria-hidden="true" />
              <span className="relative flex min-h-16 flex-col justify-end p-2.5">
                <span className="flex items-center gap-1 text-xs font-semibold">
                  {scene.status === "locked" ? (
                    <LockIcon className="size-3" aria-hidden="true" />
                  ) : null}
                  {scene.title}
                </span>
                <span className="mt-0.5 truncate text-[9px] text-white/60">
                  {scene.englishTitle}
                </span>
              </span>
            </>
          )
          const previewClassName = cn(
            "group/card relative min-h-16 w-32 flex-none overflow-hidden rounded-md border text-left text-white outline-none transition-[border-color,opacity] focus-visible:ring-3 focus-visible:ring-ring/50",
            scene.id === activeScene.id
              ? "border-primary opacity-100"
              : "border-transparent opacity-65 hover:opacity-90",
          )

          return scene.status === "locked" ? (
            <span
              key={scene.id}
              aria-disabled="true"
              className={cn(previewClassName, "cursor-not-allowed opacity-40")}
            >
              {previewContent}
            </span>
          ) : (
            <Link
              key={scene.id}
              href={`/workspace/conversation?scene=${scene.id}`}
              aria-label={`进入${scene.title}场景`}
              aria-current={scene.id === activeScene.id ? "true" : undefined}
              className={previewClassName}
            >
              {previewContent}
            </Link>
          )
        })}
      </nav>
    </section>
  )
}
