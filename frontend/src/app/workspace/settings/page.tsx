import { SettingsIcon } from "lucide-react"
import type { Metadata } from "next"
import { PageHeading } from "@/components/page-heading"
import { SettingsForm } from "@/features/settings/settings-form"
import { probeLocalSpeechServices } from "@/lib/speech-services"

// 本机语音服务的在线状态依赖当前机器，必须在请求时探测，不能随构建固化。
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "偏好设置",
  description: "管理模型连接、学习策略和对话偏好。",
}

export default async function SettingsPage() {
  const speechProbes = await probeLocalSpeechServices()
  return (
    <div className="flex flex-col gap-7">
      <PageHeading
        eyebrow="Preferences"
        title="学习配置"
        description="集中管理模型连接、学习目标与练习方式；模型配置仅保存在当前浏览器。"
        icon={SettingsIcon}
        motif="settings"
      />
      <SettingsForm initialSpeechProbes={speechProbes} />
    </div>
  )
}
