import type { Metadata } from "next"
import {
  LegalCrossLink,
  LegalDocument,
  LegalList,
  LegalSection,
} from "@/components/legal-document"

export const metadata: Metadata = {
  title: "服务条款",
  description: "使用 Moss 托管服务前需要知道的账号责任、可接受使用范围、数据权利与免责声明。",
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="服务条款"
      updated={`最后更新：${"[生效日期]"}`}
      summary="这些条款约定你与我们之间使用 Moss 托管服务的关系。数据如何处理由隐私政策单独说明。"
    >
      <LegalSection title="1. 协议主体">
        <p>
          本条款适用于你与 [运营者姓名]（下称「我们」）之间对 Moss
          托管服务的使用。注册、登录或以其他方式使用服务即表示你接受本条款与
          <LegalCrossLink href="/privacy">隐私政策</LegalCrossLink>
          。若你不同意其中任何内容，请不要使用服务。
        </p>
        <p>
          Moss 以 Apache-2.0
          许可证开源。你自行部署的实例不属于本条款范围，由你自行对使用该实例负责。
        </p>
      </LegalSection>

      <LegalSection title="2. 服务内容与可用性">
        <p>
          Moss
          提供基于对话、影子跟读和间隔复习的英语学习工作区。服务以「现状」提供，可能因维护、故障或外部依赖（身份服务、AI
          提供方、语音服务）中断而暂停。我们会尽力保障可用性，但不承诺不间断服务或特定响应时间。
        </p>
        <p>
          部分能力在浏览器本地完成，包括学习记忆的本地优先写入与模型连接配置。这些能力依赖你的设备环境，部分在演示模式下不可用。
        </p>
      </LegalSection>

      <LegalSection title="3. 账号责任">
        <LegalList
          items={[
            "你需提供真实、可接收邮件的邮箱，并完成邮箱验证后才能使用完整功能。",
            "你需妥善保管密码与登录凭据。账户下的活动视为你的行为。",
            "你须年满 13 周岁；未满该年龄需在监护人同意下使用。",
            "你不得共享、出售账户，或以他人身份使用本服务。",
          ]}
        />
        <p>发现未经授权的账户访问时，请立即通过下方方式联系我们。</p>
      </LegalSection>

      <LegalSection title="4. 可接受使用">
        <p>你承诺不以本服务从事下列行为：</p>
        <LegalList
          items={[
            "上传违法内容、侵害他人权利的内容，或恶意代码。",
            "试图绕过频率限制、访问控制、行级安全策略，或批量抓取数据。",
            "攻击、干扰或逆向工程服务，包括自动化探测与压测。",
            "违反适用法律，或侵犯他人隐私、知识产权的行为。",
          ]}
        />
        <p>
          违反本节时，我们可以限制功能、暂停或终止账户，并在必要时保存最小必要的记录以说明原因。
        </p>
      </LegalSection>

      <LegalSection title="5. 你的内容与权利">
        <p>
          你的对话文本、翻译、学习记录与学习记忆归你所有。我们仅在提供与改进本服务所必需的范围内处理这些内容，具体见
          <LegalCrossLink href="/privacy">隐私政策</LegalCrossLink>。
        </p>
        <p>
          对话中生成的纠错、翻译与建议由自动系统产出，可能不准确。它们的用途是语言练习参考，不构成专业意见。请勿将其用于医疗、法律或财务判断。
        </p>
      </LegalSection>

      <LegalSection title="6. 知识产权与许可">
        <LegalList
          items={[
            "Moss 的源代码以 Apache-2.0 许可证授权，你可以查看、修改并按该许可证分发。",
            "商标与品牌标识不随开源许可证授予，未经书面许可不得用于标示衍生作品为官方产品。",
            "场景内容、习语释义与学习素材的可许可范围以仓库内许可证声明为准。",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. 免责声明">
        <p>
          在法律允许的最大范围内，本服务按「现状」与「可用」状态提供，我们不作任何明示或默示担保，包括适销性、特定用途适用性与不侵权的担保。我们不保证学习效果、复习算法准确度或
          AI 回复的正确性。
        </p>
      </LegalSection>

      <LegalSection title="8. 责任限制">
        <p>
          在法律允许的最大范围内，我们对任何间接、附带、后果性或惩罚性损失不承担责任。我们对你的累计赔偿责任以你在受损事件前
          12 个月内为使用本服务实际支付的费用为限；服务免费时以 100
          元人民币为限。某些司法辖区不允许排除此类责任限制，此时限制仅在法律允许的范围内适用。
        </p>
      </LegalSection>

      <LegalSection title="9. 条款变更与终止">
        <p>
          本条款发生实质变更时，我们会更新页面顶部的「最后更新」日期，并在服务内以显著方式提示。你可在任何时候导出并删除账户数据；删除账户即终止本条款。条款终止不影响终止前已产生的责任。
        </p>
      </LegalSection>

      <LegalSection title="10. 适用法律与争议解决">
        <p>
          本条款适用
          [适用法律与管辖地]，不适用其冲突法规则。因本条款或服务使用产生的争议，应先通过协商解决；协商不成的，提交
          [适用法律与管辖地] 有管辖权的法院处理。
        </p>
        <p>
          条款相关问题可发送邮件至{" "}
          <a
            className="font-medium text-foreground underline underline-offset-4"
            href="mailto:[联系邮箱]"
          >
            [联系邮箱]
          </a>
          。
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
