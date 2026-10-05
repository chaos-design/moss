import {
  AudioLinesIcon,
  BookOpenCheckIcon,
  BrainCircuitIcon,
  CalendarSyncIcon,
  ChartNoAxesCombinedIcon,
  CompassIcon,
  LibraryBigIcon,
  ListChecksIcon,
  MapIcon,
  MessagesSquareIcon,
  SettingsIcon,
} from "lucide-react"

// Navigation metadata is owned separately from `@/lib/demo-data` so the persistent workspace
// shell never pulls the full scene catalog into its client bundle.
export const navigationSections = [
  {
    label: "今日学习",
    items: [
      { href: "/workspace", label: "AI 学习 Agent", icon: BrainCircuitIcon },
      { href: "/workspace/conversation", label: "AI 对话", icon: MessagesSquareIcon },
      { href: "/workspace/shadowing", label: "影子跟读", icon: AudioLinesIcon },
    ],
  },
  {
    label: "学习路径",
    items: [
      { href: "/workspace/map", label: "Learning Map", icon: MapIcon },
      { href: "/workspace/scenes", label: "场景库", icon: CompassIcon },
      { href: "/workspace/expressions", label: "地道表达", icon: LibraryBigIcon },
      { href: "/workspace/review", label: "智能复习", icon: CalendarSyncIcon },
    ],
  },
  {
    label: "学习档案",
    items: [
      { href: "/workspace/analytics", label: "学习分析", icon: ChartNoAxesCombinedIcon },
      { href: "/workspace/notebook", label: "长期记忆", icon: BookOpenCheckIcon },
      { href: "/workspace/sentences", label: "句子列表", icon: ListChecksIcon },
      { href: "/workspace/settings", label: "偏好设置", icon: SettingsIcon },
    ],
  },
] as const
