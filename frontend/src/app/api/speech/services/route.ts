import { NextResponse } from "next/server"
import { probeLocalSpeechServices } from "@/lib/speech-services"

/**
 * 「重新检测」按钮使用的诊断接口。首屏状态由设置页在服务端探测后直接注入，
 * 这里只在学习者主动刷新时重跑一次，并复用同一份缓存。
 */
export async function GET() {
  const checkedAt = Date.now()
  const services = await probeLocalSpeechServices({ now: checkedAt, force: true })
  return NextResponse.json(
    { data: { checkedAt, services } },
    { headers: { "Cache-Control": "no-store" } },
  )
}
