import {
  type ConversationScene,
  getAvailableConversationScenes,
  getConversationScene,
} from "@/lib/conversation-scenes"
import type { LearningMemoryItem } from "@/lib/memory"

export type ShadowingSpeaker = "learner" | "partner"

export type ShadowingDialogueLine = {
  id: string
  speaker: ShadowingSpeaker
  text: string
  translation: string
}

export type ShadowingDialogue = {
  id: string
  sceneId: string
  sceneTitle: string
  scriptKind: "preset" | "generated" | "memory"
  partnerName: string
  partnerRole: string
  level: string
  objective: string
  focusWord: string
  phonetic: string
  focusTip: string
  lines: ShadowingDialogueLine[]
  targetMemoryItemId?: string
}

type DialoguePreset = Pick<ShadowingDialogue, "focusWord" | "phonetic" | "focusTip" | "lines">

const dialoguePresets: Partial<Record<string, DialoguePreset>> = {
  coffee: {
    focusWord: "oat",
    phonetic: "/oʊt/",
    focusTip: "双元音从 /o/ 滑向 /ʊ/，最后轻触齿龈读出 /t/。",
    lines: [
      {
        id: "coffee-1",
        speaker: "partner",
        text: "Good morning! What can I get started for you today?",
        translation: "早上好！今天想先来点什么？",
      },
      {
        id: "coffee-2",
        speaker: "learner",
        text: "Could I get a latte with oat milk, please?",
        translation: "我可以要一杯燕麦奶拿铁吗？",
      },
      {
        id: "coffee-3",
        speaker: "partner",
        text: "Of course. Would you like that hot or iced?",
        translation: "当然。你想要热的还是冰的？",
      },
      {
        id: "coffee-4",
        speaker: "learner",
        text: "Iced, please, and could I have it to go?",
        translation: "请做成冰的，我可以外带吗？",
      },
      {
        id: "coffee-5",
        speaker: "partner",
        text: "Absolutely. A medium iced oat latte to go.",
        translation: "没问题。一杯中杯冰燕麦拿铁，外带。",
      },
      {
        id: "coffee-6",
        speaker: "learner",
        text: "That's right. Thank you.",
        translation: "对的，谢谢。",
      },
    ],
  },
  restaurant: {
    focusWord: "allergic",
    phonetic: "/əˈlɜːrdʒɪk/",
    focusTip: "重音落在第二音节，结尾 /dʒɪk/ 保持清楚。",
    lines: [
      {
        id: "restaurant-1",
        speaker: "partner",
        text: "Are you ready to order, or would you like a few more minutes?",
        translation: "你准备好点餐了吗，还是需要再看几分钟？",
      },
      {
        id: "restaurant-2",
        speaker: "learner",
        text: "We're ready. What would you recommend?",
        translation: "我们准备好了。你会推荐什么？",
      },
      {
        id: "restaurant-3",
        speaker: "partner",
        text: "The grilled salmon is popular, and it comes with a seasonal salad.",
        translation: "烤三文鱼很受欢迎，配时令沙拉。",
      },
      {
        id: "restaurant-4",
        speaker: "learner",
        text: "That sounds good. I'm allergic to nuts. Does the sauce contain any?",
        translation: "听起来不错。我对坚果过敏，酱汁里含有坚果吗？",
      },
      {
        id: "restaurant-5",
        speaker: "partner",
        text: "I'll confirm with the kitchen and note the allergy on your order.",
        translation: "我会和厨房确认，并在订单上注明过敏信息。",
      },
      {
        id: "restaurant-6",
        speaker: "learner",
        text: "Thank you. I'll have the salmon if the sauce is safe.",
        translation: "谢谢。如果酱汁安全，我就要三文鱼。",
      },
    ],
  },
  meeting: {
    focusWord: "clarify",
    phonetic: "/ˈklerəfaɪ/",
    focusTip: "首音节重读，结尾 /faɪ/ 保持完整滑音。",
    lines: [
      {
        id: "meeting-1",
        speaker: "partner",
        text: "Let's review the launch plan. What is our biggest trade-off?",
        translation: "我们来复盘发布计划。当前最大的取舍是什么？",
      },
      {
        id: "meeting-2",
        speaker: "learner",
        text: "From my perspective, we are balancing speed against reliability.",
        translation: "在我看来，我们正在速度和可靠性之间取舍。",
      },
      {
        id: "meeting-3",
        speaker: "partner",
        text: "I agree, but the timeline is already tight.",
        translation: "我同意，但时间线已经很紧。",
      },
      {
        id: "meeting-4",
        speaker: "learner",
        text: "Could you clarify which deadline cannot move?",
        translation: "你能澄清一下哪个截止日期不能调整吗？",
      },
      {
        id: "meeting-5",
        speaker: "partner",
        text: "The customer preview is fixed, but the public release is flexible.",
        translation: "客户预览日期固定，但公开发布可以调整。",
      },
      {
        id: "meeting-6",
        speaker: "learner",
        text: "Then let's follow up on a smaller preview scope.",
        translation: "那我们继续确认一个更小的预览范围。",
      },
    ],
  },
  "idiomatic-english": {
    focusWord: "tabs",
    phonetic: "/tæbz/",
    focusTip: "元音保持短促的 /æ/，结尾先读浊音 /b/，再自然接 /z/；固定搭配使用复数 tabs。",
    lines: [
      {
        id: "idiomatic-english-1",
        speaker: "partner",
        text: "Before we call it a day, can we touch base on the launch?",
        translation: "今天收工前，我们能快速同步一下发布事项吗？",
      },
      {
        id: "idiomatic-english-2",
        speaker: "learner",
        text: "Sure. I have been keeping tabs on the final tests.",
        translation: "可以。我一直在关注最后一轮测试。",
      },
      {
        id: "idiomatic-english-3",
        speaker: "partner",
        text: "Great. Is everyone on the same page about the release window?",
        translation: "很好。大家对发布时间窗口的理解一致吗？",
      },
      {
        id: "idiomatic-english-4",
        speaker: "learner",
        text: "Almost. I need to bring the support team up to speed.",
        translation: "基本一致。我还需要让支持团队了解最新情况。",
      },
      {
        id: "idiomatic-english-5",
        speaker: "partner",
        text: "Keep me in the loop, and we can circle back tomorrow.",
        translation: "随时让我知情，我们明天再回到这个话题。",
      },
      {
        id: "idiomatic-english-6",
        speaker: "learner",
        text: "Will do. Fixing the alert copy should be a quick win.",
        translation: "没问题。修正文案提示应该是一个短期内可完成的成果。",
      },
      {
        id: "idiomatic-english-7",
        speaker: "partner",
        text: "Agreed, but let's not cut corners on the accessibility review.",
        translation: "同意，但无障碍检查不能为了省事而降低标准。",
      },
      {
        id: "idiomatic-english-8",
        speaker: "learner",
        text: "Absolutely. That review could really move the needle.",
        translation: "当然。那项检查确实能带来实质进展。",
      },
      {
        id: "idiomatic-english-9",
        speaker: "partner",
        text: "Do you have the bandwidth for a deep dive on Monday?",
        translation: "你周一有精力做一次深入分析吗？",
      },
      {
        id: "idiomatic-english-10",
        speaker: "learner",
        text: "I think so, but I will sleep on the timeline tonight.",
        translation: "应该有，不过我今晚会再考虑一下时间安排。",
      },
      {
        id: "idiomatic-english-11",
        speaker: "partner",
        text: "No big deal if we need to move it. We can play it by ear.",
        translation: "需要调整也没什么大不了，我们可以见机行事。",
      },
      {
        id: "idiomatic-english-12",
        speaker: "learner",
        text: "Sounds good. Let's call it a day and hit the road.",
        translation: "好。我们今天就到这里，出发回去吧。",
      },
    ],
  },
  airport: {
    focusWord: "twenty-four",
    phonetic: "/ˌtwenti ˈfɔːr/",
    focusTip: "数字组合中把主要重音放在 four 上。",
    lines: [
      {
        id: "airport-1",
        speaker: "partner",
        text: "May I see your passport and booking confirmation?",
        translation: "可以看一下你的护照和预订确认吗？",
      },
      {
        id: "airport-2",
        speaker: "learner",
        text: "Here you are. Can I check this bag?",
        translation: "给你。这件行李可以托运吗？",
      },
      {
        id: "airport-3",
        speaker: "partner",
        text: "Yes. Please place it on the scale.",
        translation: "可以。请把它放到秤上。",
      },
      {
        id: "airport-4",
        speaker: "learner",
        text: "Thanks. Could you tell me where gate twenty-four is?",
        translation: "谢谢。你能告诉我 24 号登机口在哪里吗？",
      },
      {
        id: "airport-5",
        speaker: "partner",
        text: "Go through security and turn left. It is a ten-minute walk.",
        translation: "通过安检后左转，步行大约十分钟。",
      },
      {
        id: "airport-6",
        speaker: "learner",
        text: "Got it. Thank you for your help.",
        translation: "明白了。谢谢你的帮助。",
      },
    ],
  },
  hotel: {
    focusWord: "possible",
    phonetic: "/ˈpɑːsəbəl/",
    focusTip: "弱读中间音节，让重音稳定落在第一个音节。",
    lines: [
      {
        id: "hotel-1",
        speaker: "partner",
        text: "Welcome. May I have the name on your reservation?",
        translation: "欢迎光临。请问预订时使用的姓名是什么？",
      },
      {
        id: "hotel-2",
        speaker: "learner",
        text: "The reservation is under Chen.",
        translation: "预订人姓名是 Chen。",
      },
      {
        id: "hotel-3",
        speaker: "partner",
        text: "I found it. You booked a standard room for two nights.",
        translation: "找到了。你预订了两晚标准间。",
      },
      {
        id: "hotel-4",
        speaker: "learner",
        text: "Would it be possible to have a room on a higher floor?",
        translation: "可以安排一间高楼层的房间吗？",
      },
      {
        id: "hotel-5",
        speaker: "partner",
        text: "Yes, I can move you to the eighth floor.",
        translation: "可以，我能帮你换到八楼。",
      },
      {
        id: "hotel-6",
        speaker: "learner",
        text: "Perfect. Is breakfast included?",
        translation: "很好。包含早餐吗？",
      },
    ],
  },
  doctor: {
    focusWord: "dizzy",
    phonetic: "/ˈdɪzi/",
    focusTip: "两个音节长度接近，首音节稍重，/z/ 保持浊音。",
    lines: [
      {
        id: "doctor-1",
        speaker: "partner",
        text: "What symptoms have you been experiencing?",
        translation: "你最近有哪些症状？",
      },
      {
        id: "doctor-2",
        speaker: "learner",
        text: "I have been feeling dizzy since yesterday afternoon.",
        translation: "从昨天下午开始，我一直觉得头晕。",
      },
      {
        id: "doctor-3",
        speaker: "partner",
        text: "Does it get worse when you stand up?",
        translation: "你站起来时会更严重吗？",
      },
      {
        id: "doctor-4",
        speaker: "learner",
        text: "Yes, and I also feel slightly nauseous.",
        translation: "是的，而且我还有一点恶心。",
      },
      {
        id: "doctor-5",
        speaker: "partner",
        text: "Have you had enough water and food today?",
        translation: "你今天有补充足够的水和食物吗？",
      },
      {
        id: "doctor-6",
        speaker: "learner",
        text: "I skipped breakfast, but I have been drinking water.",
        translation: "我没吃早餐，但一直有喝水。",
      },
    ],
  },
  networking: {
    focusWord: "continue",
    phonetic: "/kənˈtɪnjuː/",
    focusTip: "第一音节弱读，重音落在第二音节 tin。",
    lines: [
      {
        id: "networking-1",
        speaker: "partner",
        text: "Hi, I don't think we've met. What brings you to the event?",
        translation: "你好，我们好像没见过。你为什么来参加这个活动？",
      },
      {
        id: "networking-2",
        speaker: "learner",
        text: "I work in product design, and I'm here to learn about your industry.",
        translation: "我从事产品设计，来这里了解你所在的行业。",
      },
      {
        id: "networking-3",
        speaker: "partner",
        text: "Interesting. My team is exploring a similar area.",
        translation: "很有意思。我的团队也在探索类似领域。",
      },
      {
        id: "networking-4",
        speaker: "learner",
        text: "I would love to keep in touch and continue this conversation.",
        translation: "我很希望保持联系，继续我们刚才的话题。",
      },
      {
        id: "networking-5",
        speaker: "partner",
        text: "Absolutely. Let me share my contact details.",
        translation: "当然。我把联系方式给你。",
      },
      {
        id: "networking-6",
        speaker: "learner",
        text: "Thanks. I'll send you a note tomorrow.",
        translation: "谢谢。我明天给你发消息。",
      },
    ],
  },
  "client-demo": {
    focusWord: "through",
    phonetic: "/θruː/",
    focusTip: "舌尖轻触上下齿之间送气，再自然过渡到 /ruː/。",
    lines: [
      {
        id: "client-demo-1",
        speaker: "partner",
        text: "Could you show us how the reporting workflow works?",
        translation: "你能展示一下报告工作流如何运作吗？",
      },
      {
        id: "client-demo-2",
        speaker: "learner",
        text: "Let me walk you through the most important use case.",
        translation: "我来带你看一下最重要的使用场景。",
      },
      {
        id: "client-demo-3",
        speaker: "partner",
        text: "Can administrators control who sees each report?",
        translation: "管理员能控制每份报告的查看权限吗？",
      },
      {
        id: "client-demo-4",
        speaker: "learner",
        text: "Yes. Permissions can be set by team, role, or individual.",
        translation: "可以。权限可按团队、角色或个人设置。",
      },
      {
        id: "client-demo-5",
        speaker: "partner",
        text: "That addresses our main concern. What would a trial involve?",
        translation: "这解决了我们的主要顾虑。试用会如何进行？",
      },
      {
        id: "client-demo-6",
        speaker: "learner",
        text: "We can set up a two-week trial with your sample data.",
        translation: "我们可以用你们的样例数据安排两周试用。",
      },
    ],
  },
  "performance-review": {
    focusWord: "feedback",
    phonetic: "/ˈfiːdbæk/",
    focusTip: "保持 feed 与 back 的边界清晰，首音节重读。",
    lines: [
      {
        id: "performance-review-1",
        speaker: "partner",
        text: "You delivered strong results. Where do you want to improve next?",
        translation: "你取得了很好的成果。下一步想提升哪方面？",
      },
      {
        id: "performance-review-2",
        speaker: "learner",
        text: "I want to involve stakeholders earlier in the planning process.",
        translation: "我想在规划阶段更早让相关方参与。",
      },
      {
        id: "performance-review-3",
        speaker: "partner",
        text: "That would help. Your updates could also be more concise.",
        translation: "这会有帮助。你的进展同步也可以更简洁。",
      },
      {
        id: "performance-review-4",
        speaker: "learner",
        text: "That is helpful feedback, and I will apply it to my next project.",
        translation: "这条反馈很有帮助，我会在下一个项目中落实。",
      },
      {
        id: "performance-review-5",
        speaker: "partner",
        text: "Good. Let's agree on one measurable development goal.",
        translation: "很好。我们来确定一个可衡量的成长目标。",
      },
      {
        id: "performance-review-6",
        speaker: "learner",
        text: "I'll send a one-page update before each milestone review.",
        translation: "每次里程碑评审前，我会发一页进展摘要。",
      },
    ],
  },
  "panel-debate": {
    focusWord: "underlying",
    phonetic: "/ˌʌndərˈlaɪɪŋ/",
    focusTip: "主重音落在 ly，前半段保持轻而连贯。",
    lines: [
      {
        id: "panel-debate-1",
        speaker: "partner",
        text: "Would stricter rules necessarily improve the outcome?",
        translation: "更严格的规则一定会改善结果吗？",
      },
      {
        id: "panel-debate-2",
        speaker: "learner",
        text: "I take your point, but the underlying assumption may not hold.",
        translation: "我理解你的观点，但背后的假设可能并不成立。",
      },
      {
        id: "panel-debate-3",
        speaker: "partner",
        text: "Which assumption do you think is weakest?",
        translation: "你认为哪个假设最薄弱？",
      },
      {
        id: "panel-debate-4",
        speaker: "learner",
        text: "The argument assumes that every group faces the same incentives.",
        translation: "这个论点假设每个群体面对相同的激励。",
      },
      {
        id: "panel-debate-5",
        speaker: "partner",
        text: "So how would you account for that difference?",
        translation: "那你会如何考虑这种差异？",
      },
      {
        id: "panel-debate-6",
        speaker: "learner",
        text: "I would test the policy with several distinct groups first.",
        translation: "我会先在几个不同群体中测试这项政策。",
      },
    ],
  },
  "crisis-briefing": {
    focusWord: "immediate",
    phonetic: "/ɪˈmiːdiət/",
    focusTip: "重音落在 me，后两个音节快速但不要吞音。",
    lines: [
      {
        id: "crisis-briefing-1",
        speaker: "partner",
        text: "What has been confirmed, and what remains uncertain?",
        translation: "目前确认了什么，还有哪些信息不确定？",
      },
      {
        id: "crisis-briefing-2",
        speaker: "learner",
        text: "We have confirmed the outage, but we do not know the cause yet.",
        translation: "我们已经确认服务中断，但暂时不知道原因。",
      },
      {
        id: "crisis-briefing-3",
        speaker: "partner",
        text: "Do we know how many customers are affected?",
        translation: "我们知道有多少客户受到影响吗？",
      },
      {
        id: "crisis-briefing-4",
        speaker: "learner",
        text: "It is too early to give a reliable number.",
        translation: "现在给出可靠数字还为时过早。",
      },
      {
        id: "crisis-briefing-5",
        speaker: "partner",
        text: "What should the response team do first?",
        translation: "响应团队首先应该做什么？",
      },
      {
        id: "crisis-briefing-6",
        speaker: "learner",
        text: "Our immediate priority should be to verify the facts.",
        translation: "我们当前最优先的事项应该是核实事实。",
      },
    ],
  },
}

const categoryLearnerOpenings: Record<ConversationScene["category"], string> = {
  clothing: "I'm looking for something suitable, and I'd like to compare a few options.",
  dining: "Could I ask about today's options before I order, please?",
  housing: "I'd like to go over the details before we make an arrangement.",
  transport: "Could you help me confirm the best way to complete this trip?",
  work: "I'd like to align on the goal and clarify the next step.",
  social: "It's good to meet you. I'd love to hear more about this.",
  health: "I'd like to explain what has been happening and ask what I should do next.",
  services: "I'd like some help with this request and the documents I need.",
  learning: "I'd like to clarify the task and make a practical plan.",
  emergency: "I need help. Let me explain where I am and what happened.",
}

function createGeneratedLines(scene: ConversationScene): ShadowingDialogueLine[] {
  const [firstTerm = "the options", secondTerm = "the details", thirdTerm = "the next step"] =
    scene.vocabulary

  return [
    {
      id: `${scene.id}-1`,
      speaker: "partner",
      text: scene.opening.content,
      translation: scene.opening.translation,
    },
    {
      id: `${scene.id}-2`,
      speaker: "learner",
      text: categoryLearnerOpenings[scene.category],
      translation: `我想先围绕“${scene.tags[0] ?? scene.title}”说明自己的需求。`,
    },
    {
      id: `${scene.id}-3`,
      speaker: "partner",
      text: `Of course. Let's start with ${firstTerm} and then check ${secondTerm}.`,
      translation: `当然。我们先确认 ${firstTerm}，再检查 ${secondTerm}。`,
    },
    {
      id: `${scene.id}-4`,
      speaker: "learner",
      text: `Could you clarify how ${thirdTerm} works in this situation?`,
      translation: `你能说明一下在这个情境中 ${thirdTerm} 是怎么安排的吗？`,
    },
    {
      id: `${scene.id}-5`,
      speaker: "partner",
      text: "Certainly. I'll explain the options and confirm what happens next.",
      translation: "当然。我会说明可选方案，并确认接下来的安排。",
    },
    {
      id: `${scene.id}-6`,
      speaker: "learner",
      text: "That makes sense. Just to confirm, we can move forward today.",
      translation: "明白了。再确认一下，我们今天就可以继续办理。",
    },
  ]
}

function createShadowingDialogue(scene: ConversationScene): ShadowingDialogue {
  const preset = dialoguePresets[scene.id]
  return {
    id: scene.id,
    sceneId: scene.id,
    sceneTitle: scene.title,
    scriptKind: preset ? "preset" : "generated",
    partnerName: scene.partnerName,
    partnerRole: scene.partnerRole,
    level: scene.level,
    objective: scene.objective,
    focusWord: preset?.focusWord ?? scene.vocabulary[0] ?? "rhythm",
    phonetic: preset?.phonetic ?? "场景表达",
    focusTip:
      preset?.focusTip ?? `先保持整句节奏，再清楚读出 ${scene.vocabulary[0] ?? "关键词"}。`,
    lines: preset?.lines ?? createGeneratedLines(scene),
  }
}

export function getShadowingDialogues(): ShadowingDialogue[] {
  return getAvailableConversationScenes("all").map(createShadowingDialogue)
}

/** 跟读一轮里学习者与另一角色之间的应答关系。 */
export type ShadowingTurn = {
  /** 紧邻本句之前的对方台词，作为跟读前的提示 */
  cue: ShadowingDialogueLine | null
  /** 本句之后对方的回应 */
  reply: ShadowingDialogueLine | null
  /** 本角色在本句之后的下一句 */
  next: ShadowingDialogueLine | null
}

/**
 * 影子跟读要形成真实对话，必须按脚本顺序推进，而不是只在角色台词之间跳转。
 * 缺失的引用返回 `null`，让工作区据此停止自动接话而不是回绕到已练过的句子。
 */
export function getShadowingTurn(
  dialogue: ShadowingDialogue,
  line: ShadowingDialogueLine,
): ShadowingTurn {
  const index = dialogue.lines.findIndex((candidate) => candidate.id === line.id)
  if (index < 0) {
    return { cue: null, next: null, reply: null }
  }
  const previous = dialogue.lines[index - 1]
  const following = dialogue.lines[index + 1]
  return {
    cue: previous && previous.speaker !== line.speaker ? previous : null,
    reply: following && following.speaker !== line.speaker ? following : null,
    next: dialogue.lines.slice(index + 1).find((item) => item.speaker === line.speaker) ?? null,
  }
}

function expandMemoryAnswer(answer: string) {
  return answer
    .replace(/\s*(?:\.{3}|…)\s*/g, " something ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export function createMemoryShadowingDialogue(item: LearningMemoryItem): ShadowingDialogue {
  const target = item.transferTargets[0] ?? {
    sceneId: item.sourceSceneId,
    sceneTitle: item.sourceSceneTitle,
  }
  const scene = getConversationScene(target.sceneId)
  const sentence = expandMemoryAnswer(item.answer)
  const words = sentence.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) ?? []
  const focusWord = words.reduce(
    (longest, word) => (word.length > longest.length ? word : longest),
    "",
  )

  return {
    id: `memory-${item.id}`,
    sceneId: target.sceneId,
    sceneTitle: target.sceneTitle,
    scriptKind: "memory",
    partnerName: scene.partnerName,
    partnerRole: scene.partnerRole,
    level: "记忆",
    objective: `在“${target.sceneTitle}”中主动找回“${item.label}”。`,
    focusWord: focusWord || "rhythm",
    phonetic: "整句重点",
    focusTip: item.explanation || "保持完整表达，先稳定节奏，再处理单词细节。",
    targetMemoryItemId: item.id,
    lines: [
      {
        id: `memory-${item.id}-1`,
        speaker: "partner",
        text: scene.opening.content,
        translation: scene.opening.translation,
      },
      {
        id: `memory-${item.id}-2`,
        speaker: "learner",
        text: sentence,
        translation: item.cue,
      },
      {
        id: `memory-${item.id}-3`,
        speaker: "partner",
        text: "Thanks for explaining that. Could you confirm one more detail?",
        translation: "谢谢你的说明。你能再确认一个细节吗？",
      },
      {
        id: `memory-${item.id}-4`,
        speaker: "learner",
        text: "Of course. Let me make that clearer.",
        translation: "当然。我再说清楚一些。",
      },
    ],
  }
}
