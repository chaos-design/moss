import Image from "next/image"
import type { SceneCategory } from "@/lib/demo-data"
import { cn } from "@/lib/utils"

const categoryImages: Record<SceneCategory, string> = {
  clothing: "/scenes/clothing.jpg",
  dining: "/scenes/dining.jpg",
  emergency: "/scenes/emergency.jpg",
  health: "/scenes/health.jpg",
  housing: "/scenes/housing.jpg",
  learning: "/scenes/learning.jpg",
  services: "/scenes/services.jpg",
  social: "/scenes/social.jpg",
  transport: "/scenes/transport.jpg",
  work: "/scenes/work.jpg",
}

export function SceneImage({
  category,
  title,
  className,
  eager = false,
}: {
  category: SceneCategory
  title: string
  className?: string
  eager?: boolean
}) {
  return (
    <div className={cn("relative aspect-[16/9] min-h-0 overflow-hidden bg-muted", className)}>
      <Image
        src={categoryImages[category]}
        alt={`${title}场景`}
        fill
        loading={eager ? "eager" : "lazy"}
        sizes="(min-width: 1536px) 28vw, (min-width: 768px) 44vw, 92vw"
        className="object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
      />
    </div>
  )
}
