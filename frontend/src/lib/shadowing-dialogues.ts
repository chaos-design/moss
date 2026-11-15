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
  "small-talk": {
    focusWord: "catch up",
    phonetic: "/kætʃ ʌp/",
    focusTip: "/ætʃ/ 的摩擦音收干净再接 /ʌp/；catch up 连读时中间不要加音。",
    lines: [
      {
        id: "small-talk-1",
        speaker: "partner",
        text: "Oh hey! I didn't expect to run into you here. How have you been?",
        translation: "哎，没想到在这儿碰到你。最近怎么样？",
      },
      {
        id: "small-talk-2",
        speaker: "learner",
        text: "Pretty good, thanks! Busy with work lately. How about you?",
        translation: "挺好的，谢谢！最近工作比较忙。你呢？",
      },
      {
        id: "small-talk-3",
        speaker: "partner",
        text: "Same here. We should really catch up over coffee sometime.",
        translation: "我也是。真该找个时间喝咖啡聊聊近况。",
      },
      {
        id: "small-talk-4",
        speaker: "learner",
        text: "Sounds good! Are you free this weekend?",
        translation: "好啊！这周末有空吗？",
      },
      {
        id: "small-talk-5",
        speaker: "partner",
        text: "Saturday morning works. There's a new place near the park.",
        translation: "周六上午可以。公园附近新开了一家店。",
      },
      {
        id: "small-talk-6",
        speaker: "learner",
        text: "Perfect. I'll message you the details. See you Saturday!",
        translation: "太好了，具体细节我发消息给你。周六见！",
      },
    ],
  },
  shopping: {
    focusWord: "in stock",
    phonetic: "/ɪn ˈstɒk/",
    focusTip: "/st/ 在句中不送气，听起来接近 /sd/；stock 与 stack 的元音要分清。",
    lines: [
      {
        id: "shopping-1",
        speaker: "partner",
        text: "Hi there! Are you looking for anything in particular?",
        translation: "你好！请问您在找什么吗？",
      },
      {
        id: "shopping-2",
        speaker: "learner",
        text: "I'm after a winter coat. Do you have this one in a medium?",
        translation: "我想买件冬衣。这款有中码吗？",
      },
      {
        id: "shopping-3",
        speaker: "partner",
        text: "Let me check the back... It's still in stock, but there's one left in medium.",
        translation: "我去后面看看……还有货，不过中码只剩最后一件。",
      },
      {
        id: "shopping-4",
        speaker: "learner",
        text: "Great. Can I try it on? Where are the fitting rooms?",
        translation: "太好了。能试穿吗？试衣间在哪？",
      },
      {
        id: "shopping-5",
        speaker: "partner",
        text: "Right over there. Take your time — the mirror's better in the second one.",
        translation: "就在那边。慢慢来——第二间的镜子更清楚。",
      },
      {
        id: "shopping-6",
        speaker: "learner",
        text: "It fits well. What's your return policy, just in case?",
        translation: "很合身。以防万一，你们的退换政策是什么？",
      },
      {
        id: "shopping-7",
        speaker: "partner",
        text: "Full refund within thirty days, as long as you keep the receipt.",
        translation: "三十天内凭小票全额退款。",
      },
      {
        id: "shopping-8",
        speaker: "learner",
        text: "Perfect, I'll take it. Card, please.",
        translation: "好，就要这件。刷卡。",
      },
    ],
  },
  interview: {
    focusWord: "strength",
    phonetic: "/streŋθ/",
    focusTip: "/str/ 三个辅音连缀之间不要插入元音；结尾 /ŋθ/ 先鼻音再咬舌。",
    lines: [
      {
        id: "interview-1",
        speaker: "partner",
        text: "Thanks for coming in. To start, could you walk me through your background?",
        translation: "感谢你来面试。先请你介绍一下自己的背景吧。",
      },
      {
        id: "interview-2",
        speaker: "learner",
        text: "Sure. I've spent the last four years building data pipelines for a logistics company.",
        translation: "好的。过去四年我在一家物流公司做数据管道建设。",
      },
      {
        id: "interview-3",
        speaker: "partner",
        text: "And could you give me an example of a real challenge you solved?",
        translation: "能举一个你实际解决过的难题吗？",
      },
      {
        id: "interview-4",
        speaker: "learner",
        text: "One launch kept failing at peak hours. I traced it to a race condition and rebuilt the scheduling layer.",
        translation: "有个上线总在高峰时段失败。我排查出是竞态条件，重写了调度层。",
      },
      {
        id: "interview-5",
        speaker: "partner",
        text: "What was the impact, in numbers?",
        translation: "用数字说说影响有多大？",
      },
      {
        id: "interview-6",
        speaker: "learner",
        text: "Failed batches dropped about seventy percent, and the team stopped doing manual reruns.",
        translation: "失败批次减少了大约七成，团队也不用再手动重跑了。",
      },
      {
        id: "interview-7",
        speaker: "partner",
        text: "Good. Now, what questions do you have for us?",
        translation: "很好。那么，你有什么想问我们的？",
      },
      {
        id: "interview-8",
        speaker: "learner",
        text: "How does the team handle on-call, and what does success look like in the first six months?",
        translation: "团队怎么安排值班？入职头六个月，做到什么才算成功？",
      },
    ],
  },
  grocery: {
    focusWord: "aisle",
    phonetic: "/aɪl/",
    focusTip: "字母 s 完全不发音，整个词读作 /aɪl/，与 I'll 同音。",
    lines: [
      {
        id: "grocery-1",
        speaker: "partner",
        text: "Good afternoon! What are you looking for today?",
        translation: "下午好！今天想找点什么？",
      },
      {
        id: "grocery-2",
        speaker: "learner",
        text: "Excuse me, which aisle has the olive oil?",
        translation: "打扰一下，橄榄油在哪条货架？",
      },
      {
        id: "grocery-3",
        speaker: "partner",
        text: "Aisle seven, next to the vinegar. The small bottles are on sale this week.",
        translation: "第七排，醋旁边。小瓶装这周特价。",
      },
      {
        id: "grocery-4",
        speaker: "learner",
        text: "Perfect. Do you have it in the larger size too?",
        translation: "太好了。有大瓶装的吗？",
      },
      {
        id: "grocery-5",
        speaker: "partner",
        text: "We're out of the one-liter bottles. The 750ml one is a good substitute.",
        translation: "一升装的缺货了。750 毫升的是不错的替代。",
      },
      {
        id: "grocery-6",
        speaker: "learner",
        text: "That works. Is this the final price, or is there a discount card?",
        translation: "这个可以。这是最终价格吗，还是有会员折扣？",
      },
      {
        id: "grocery-7",
        speaker: "partner",
        text: "The card takes another ten percent off. It's free to sign up at the counter.",
        translation: "办卡再打九折，在服务台免费办理。",
      },
      {
        id: "grocery-8",
        speaker: "learner",
        text: "I'll just take the bottle as it is, thanks.",
        translation: "那我就先按这个价买一瓶，谢谢。",
      },
    ],
  },
  renting: {
    focusWord: "deposit",
    phonetic: "/dɪˈpɒzɪt/",
    focusTip: "重音落在第二音节 /ˈpɒ/，别读成 DEposit。",
    lines: [
      {
        id: "renting-1",
        speaker: "partner",
        text: "You're here about the two-bedroom, right? Come in — mind the step.",
        translation: "你是来看那套两居室的吧？请进——小心台阶。",
      },
      {
        id: "renting-2",
        speaker: "learner",
        text: "Yes. Could we start with the rent? Are water and heating included?",
        translation: "是的。我们能先聊租金吗？水费和暖气包含在内吗？",
      },
      {
        id: "renting-3",
        speaker: "partner",
        text: "It's 2,800 a month. Utilities are separate — roughly 200 on average.",
        translation: "月租 2800。水电燃气另算，平均大概 200。",
      },
      {
        id: "renting-4",
        speaker: "learner",
        text: "And the deposit? How much is it, and when do I get it back?",
        translation: "那押金呢？要多少，什么时候退？",
      },
      {
        id: "renting-5",
        speaker: "partner",
        text: "One month's rent, returned within two weeks after you move out, minus any damages.",
        translation: "一个月房租，退租后两周内返还，会扣除损坏部分。",
      },
      {
        id: "renting-6",
        speaker: "learner",
        text: "About the lease — is there a minimum term? I might need some flexibility.",
        translation: "关于合同——有最短租期吗？我可能需要一些灵活性。",
      },
      {
        id: "renting-7",
        speaker: "partner",
        text: "It's a one-year lease with a break clause after six months, two months' notice.",
        translation: "一年期合同，六个月后可以解约，需提前两个月通知。",
      },
      {
        id: "renting-8",
        speaker: "learner",
        text: "That's workable. Could I see the washing machine and the heating again?",
        translation: "可以接受。我能再看一下洗衣机和暖气吗？",
      },
    ],
  },
  taxi: {
    focusWord: "fare",
    phonetic: "/feər/",
    focusTip: "/feər/ 与 fair 同音；美式读音里词尾 /r/ 要卷舌。",
    lines: [
      {
        id: "taxi-1",
        speaker: "partner",
        text: "Where to?",
        translation: "去哪儿？",
      },
      {
        id: "taxi-2",
        speaker: "learner",
        text: "To the Central Hospital, please. The main entrance, not the ER.",
        translation: "麻烦去中心医院。到正门，不是急诊入口。",
      },
      {
        id: "taxi-3",
        speaker: "partner",
        text: "Sure. I'll take the ring road — the expressway is jammed at this hour.",
        translation: "好的。我走环路——这个点高速堵。",
      },
      {
        id: "taxi-4",
        speaker: "learner",
        text: "Fine by me, as long as the meter runs normally. Roughly how much will the fare be?",
        translation: "没问题，只要计价器正常。大概要多少钱？",
      },
      {
        id: "taxi-5",
        speaker: "partner",
        text: "Around thirty, give or take. Traffic on Heping Street could add a bit.",
        translation: "三十上下，浮动不大。和平街的车流可能再加一点。",
      },
      {
        id: "taxi-6",
        speaker: "learner",
        text: "Okay. Could you drop me off at the gate instead of the parking lot?",
        translation: "好。能让我在大门口下车吗？别停停车场。",
      },
      {
        id: "taxi-7",
        speaker: "partner",
        text: "No problem. That'll be twenty-nine fifty — cash or card?",
        translation: "没问题。一共二十九块五——现金还是刷卡？",
      },
      {
        id: "taxi-8",
        speaker: "learner",
        text: "Card, please. And could I get a receipt?",
        translation: "刷卡。能给我一张收据吗？",
      },
    ],
  },
  train: {
    focusWord: "platform",
    phonetic: "/ˈplætfɔːrm/",
    focusTip: "重音在 /ˈplæt/；/tf/ 相邻爆破音只留一个气口。",
    lines: [
      {
        id: "train-1",
        speaker: "partner",
        text: "Good morning! Where are you headed today?",
        translation: "早上好！您今天去哪儿？",
      },
      {
        id: "train-2",
        speaker: "learner",
        text: "To Nanjing. One one-way ticket, please. When's the next train?",
        translation: "去南京。买一张单程票。下一班是几点？",
      },
      {
        id: "train-3",
        speaker: "partner",
        text: "11:40, from platform six. It's the express — about an hour and twenty.",
        translation: "11 点 40，第六站台。是快车——大约一小时二十分钟。",
      },
      {
        id: "train-4",
        speaker: "learner",
        text: "Do I need to transfer anywhere, or is it direct?",
        translation: "需要换乘吗，还是直达？",
      },
      {
        id: "train-5",
        speaker: "partner",
        text: "Direct. But your seat is in car nine, so leave time to walk down the platform.",
        translation: "直达。不过您的座位在 9 号车厢，留点时间走过去。",
      },
      {
        id: "train-6",
        speaker: "learner",
        text: "Got it. Is there a quiet carriage, by any chance?",
        translation: "明白了。请问有安静车厢吗？",
      },
      {
        id: "train-7",
        speaker: "partner",
        text: "Car four is the quiet zone. Here's your ticket — boarding closes two minutes before departure.",
        translation: "4 号车厢是静音区。这是您的票——发车前两分钟停止检票。",
      },
    ],
  },
  pharmacy: {
    focusWord: "dosage",
    phonetic: "/ˈdoʊsɪdʒ/",
    focusTip: "重音在首音节 /ˈdoʊ/，结尾 /sɪdʒ/ 轻读。",
    lines: [
      {
        id: "pharmacy-1",
        speaker: "partner",
        text: "Hi, what can I help you with today?",
        translation: "你好，今天需要什么药？",
      },
      {
        id: "pharmacy-2",
        speaker: "learner",
        text: "I've had a dry cough for a few days. Is there anything over the counter?",
        translation: "这几天一直干咳。有不用处方的药吗？",
      },
      {
        id: "pharmacy-3",
        speaker: "partner",
        text: "This syrup works well. One dose twice a day, after meals.",
        translation: "这个糖浆效果不错。每次一格，一天两次，饭后服用。",
      },
      {
        id: "pharmacy-4",
        speaker: "learner",
        text: "And what are the side effects? Will it make me drowsy?",
        translation: "副作用是什么？会犯困吗？",
      },
      {
        id: "pharmacy-5",
        speaker: "partner",
        text: "Some people feel a bit sleepy, so avoid driving after a dose.",
        translation: "有人会犯困，服药后别开车。",
      },
      {
        id: "pharmacy-6",
        speaker: "learner",
        text: "Noted. Can I take it with my allergy pills?",
        translation: "记住了。能和我的过敏药一起吃吗？",
      },
      {
        id: "pharmacy-7",
        speaker: "partner",
        text: "Good question — check with your doctor first; there can be an interaction.",
        translation: "问得好——先问问医生，可能有相互作用。",
      },
      {
        id: "pharmacy-8",
        speaker: "learner",
        text: "I will. If the cough doesn't clear in a week, I'll book an appointment.",
        translation: "我会的。如果一周后还咳，我就去挂号。",
      },
    ],
  },
  banking: {
    focusWord: "transfer",
    phonetic: "/ˈtrænsfɜːr/ 或 /trænsˈfɜːr/",
    focusTip: "名词重音在前，动词重音在后：a bank transfer 与 to transfer money 不同。",
    lines: [
      {
        id: "banking-1",
        speaker: "partner",
        text: "Good morning. What can I help you with at the counter today?",
        translation: "早上好。请问今天要办什么业务？",
      },
      {
        id: "banking-2",
        speaker: "learner",
        text: "I'd like to make an international transfer to my landlord in the UK.",
        translation: "我想给我的英国房东做一笔国际汇款。",
      },
      {
        id: "banking-3",
        speaker: "partner",
        text: "Certainly. Do you have the IBAN and the bank's full name?",
        translation: "好的。您有收款行的 IBAN 和完整银行名吗？",
      },
      {
        id: "banking-4",
        speaker: "learner",
        text: "I have them here on my phone. Do you also need proof of address?",
        translation: "都在我手机里。还需要地址证明吗？",
      },
      {
        id: "banking-5",
        speaker: "partner",
        text: "For amounts over ten thousand, yes — plus your passport for the identity check.",
        translation: "超过一万元需要——另外还要护照核对身份。",
      },
      {
        id: "banking-6",
        speaker: "learner",
        text: "It's just under that. How long does the transfer usually take?",
        translation: "刚好低于这个数。汇款一般多久到账？",
      },
      {
        id: "banking-7",
        speaker: "partner",
        text: "One to two business days. You'll get a reference number to track it here or online.",
        translation: "一到两个工作日。您会拿到一个流水号，可在柜台或网上查询进度。",
      },
      {
        id: "banking-8",
        speaker: "learner",
        text: "Great. Could I also get my latest statement while I'm here?",
        translation: "好。趁今天在，能不能也打一份最近的流水？",
      },
    ],
  },
  bakery: {
    focusWord: "filling",
    phonetic: "/ˈfɪlɪŋ/",
    focusTip: "双写 l 只发一个 /l/；短元音 /ɪ/ 别拖长，filling 与 feeling 靠元音长短区分。",
    lines: [
      {
        id: "bakery-1",
        speaker: "partner",
        text: "Welcome! Everything here was freshly baked this morning.",
        translation: "欢迎光临！这些都是今天早上现烤的。",
      },
      {
        id: "bakery-2",
        speaker: "learner",
        text: "They smell amazing. What's the filling in these buns?",
        translation: "好香啊。这些面包的馅是什么？",
      },
      {
        id: "bakery-3",
        speaker: "partner",
        text: "That one's red bean; the round ones are custard. This one is our best seller.",
        translation: "这个是红豆的；圆的是蛋奶馅的。这款是我们的招牌。",
      },
      {
        id: "bakery-4",
        speaker: "learner",
        text: "I'll take three red bean and two custard, please.",
        translation: "麻烦给我三个红豆的、两个蛋奶的。",
      },
      {
        id: "bakery-5",
        speaker: "partner",
        text: "A box of five, lovely. Anything from the bread shelf as well?",
        translation: "装一盒五个，好的。面包货架还需要点什么吗？",
      },
      {
        id: "bakery-6",
        speaker: "learner",
        text: "No, that's all. Could you warm the custard ones up?",
        translation: "不用了，就这些。能把蛋奶的加热一下吗？",
      },
      {
        id: "bakery-7",
        speaker: "partner",
        text: "Of course — one minute. To stay warm, or for eating right away?",
        translation: "当然——稍等一分钟。是要保温带走，还是马上吃？",
      },
    ],
  },
  customs: {
    focusWord: "declare",
    phonetic: "/dɪˈkler/",
    focusTip: "重音在第二音节 /ˈkler/；de- 弱读成 /dɪ/。",
    lines: [
      {
        id: "customs-1",
        speaker: "partner",
        text: "Good afternoon. May I see your passport and arrival card?",
        translation: "下午好。请出示您的护照和入境卡。",
      },
      {
        id: "customs-2",
        speaker: "learner",
        text: "Here you are. I'm here for a business conference.",
        translation: "给您。我是来参加一个商务会议的。",
      },
      {
        id: "customs-3",
        speaker: "partner",
        text: "And how long will you be staying?",
        translation: "您会停留多久？",
      },
      {
        id: "customs-4",
        speaker: "learner",
        text: "Six days, then I fly back on the 24th.",
        translation: "六天，24 号的飞机回去。",
      },
      {
        id: "customs-5",
        speaker: "partner",
        text: "Where will you be staying during the trip?",
        translation: "逗留期间住在哪里？",
      },
      {
        id: "customs-6",
        speaker: "learner",
        text: "At the Grand Hotel downtown. The address is on this card.",
        translation: "市中心的 Grand 酒店，地址写在这张卡片上。",
      },
      {
        id: "customs-7",
        speaker: "partner",
        text: "Anything to declare? Alcohol, tobacco, or goods over the duty limit?",
        translation: "有需要申报的物品吗？烟酒或超免税额度的商品？",
      },
      {
        id: "customs-8",
        speaker: "learner",
        text: "No, nothing to declare. Just clothes and a laptop for the conference.",
        translation: "没有，无需申报。只有衣物和一台开会用的笔记本。",
      },
    ],
  },
  directions: {
    focusWord: "intersection",
    phonetic: "/ˌɪntərˈsekʃən/",
    focusTip: "重音在 -sec-；四个音节均匀展开，别吞掉中间的 /tər/。",
    lines: [
      {
        id: "directions-1",
        speaker: "partner",
        text: "You look a little lost. Looking for somewhere in particular?",
        translation: "您看起来有点迷路。在找什么地方吗？",
      },
      {
        id: "directions-2",
        speaker: "learner",
        text: "Yes! The City Museum — the new building with the glass roof.",
        translation: "是的！城市博物馆——玻璃屋顶的新馆。",
      },
      {
        id: "directions-3",
        speaker: "partner",
        text: "Ah, go straight to the second intersection and turn left there.",
        translation: "哦，直走到第二个路口左转。",
      },
      {
        id: "directions-4",
        speaker: "learner",
        text: "Second left. Then how do I recognize it?",
        translation: "第二个路口左转。之后怎么认？",
      },
      {
        id: "directions-5",
        speaker: "partner",
        text: "It's across from the library — huge glass roof, you can't miss it.",
        translation: "在图书馆对面——巨大的玻璃屋顶，您肯定认得出来。",
      },
      {
        id: "directions-6",
        speaker: "learner",
        text: "About how long does it take on foot from here?",
        translation: "从这儿步行大概要多久？",
      },
      {
        id: "directions-7",
        speaker: "partner",
        text: "Ten minutes or so. Head down this street and it's on your right.",
        translation: "十分钟左右。沿这条街走，就在您右手边。",
      },
    ],
  },
  "home-repair": {
    focusWord: "leaking",
    phonetic: "/ˈliːkɪŋ/",
    focusTip: "长元音 /iː/ 要拉满；/kɪŋ/ 轻收，与 liking 的 /aɪ/ 区分。",
    lines: [
      {
        id: "home-repair-1",
        speaker: "partner",
        text: "Hi, you called about a repair? What's going on with the unit?",
        translation: "你好，您报修了？房子出了什么问题？",
      },
      {
        id: "home-repair-2",
        speaker: "learner",
        text: "The kitchen ceiling is leaking. It started last night during the rain.",
        translation: "厨房天花板在漏水。昨晚下雨时开始的。",
      },
      {
        id: "home-repair-3",
        speaker: "partner",
        text: "Is the water dripping or pouring? And has it reached any wiring?",
        translation: "是渗滴还是流水？有没有碰到电线？",
      },
      {
        id: "home-repair-4",
        speaker: "learner",
        text: "It's a steady drip into a bucket — but there's a light fixture right next to it, so I've switched that circuit off.",
        translation: "是持续滴漏，我用桶接着——不过旁边就是灯具，我已经把那路电闸关了。",
      },
      {
        id: "home-repair-5",
        speaker: "partner",
        text: "Good thinking. I'll flag it as urgent — that sounds like a pipe, not condensation.",
        translation: "想得周到。我会标成紧急——听起来像水管问题，不是冷凝水。",
      },
      {
        id: "home-repair-6",
        speaker: "learner",
        text: "When could someone come by? I work from home, so mornings are easiest.",
        translation: "什么时候能上门？我在家办公，上午最方便。",
      },
      {
        id: "home-repair-7",
        speaker: "partner",
        text: "I can offer tomorrow between nine and eleven. Does that appointment window work?",
        translation: "明天九点到十一点可以。这个时间段合适吗？",
      },
      {
        id: "home-repair-8",
        speaker: "learner",
        text: "That works. I'll text you the entrance code.",
        translation: "可以。我会把门禁码发短信给你。",
      },
    ],
  },
  "customer-support": {
    focusWord: "refund",
    phonetic: "/ˈriːfʌnd/ 或 /rɪˈfʌnd/",
    focusTip: "名词重音在前：a full refund；动词重音在后：to refund the payment。",
    lines: [
      {
        id: "customer-support-1",
        speaker: "partner",
        text: "Thanks for holding. Could you walk me through the issue with your order?",
        translation: "感谢您的等待。能说一下您的订单出了什么问题吗？",
      },
      {
        id: "customer-support-2",
        speaker: "learner",
        text: "The package arrived yesterday, but two of the four mugs were broken.",
        translation: "包裹昨天到了，但四个马克杯里有两个碎了。",
      },
      {
        id: "customer-support-3",
        speaker: "partner",
        text: "I'm sorry about that. Could you give me the order number so I can pull it up?",
        translation: "非常抱歉。请提供订单号，我查一下。",
      },
      {
        id: "customer-support-4",
        speaker: "learner",
        text: "It's CS-88412. I have photos of the damaged boxes if that helps.",
        translation: "是 CS-88412。如果需要，我有破损包装的照片。",
      },
      {
        id: "customer-support-5",
        speaker: "partner",
        text: "Perfect, upload those to the chat. I can offer a replacement set or a full refund.",
        translation: "太好了，请把照片上传到对话里。我们可以补发一套或全额退款。",
      },
      {
        id: "customer-support-6",
        speaker: "learner",
        text: "I'd prefer the refund, please — I've already bought a set locally.",
        translation: "我想要退款——我已经在本地买了一套。",
      },
      {
        id: "customer-support-7",
        speaker: "partner",
        text: "Done. The refund goes back to your card in three to five business days.",
        translation: "好的。退款会在三到五个工作日原路退回。",
      },
      {
        id: "customer-support-8",
        speaker: "learner",
        text: "And will I get a confirmation email with a reference number?",
        translation: "会收到带流水号的确认邮件吗？",
      },
      {
        id: "customer-support-9",
        speaker: "partner",
        text: "Yes, within the hour. Anything else I can help with?",
        translation: "会的，一小时内发出。还有其他需要帮助的吗？",
      },
      {
        id: "customer-support-10",
        speaker: "learner",
        text: "No, that's everything. Thanks for sorting it out so quickly.",
        translation: "没有了，都解决了。谢谢这么快处理完。",
      },
    ],
  },
  "emergency-help": {
    focusWord: "injured",
    phonetic: "/ˈɪndʒərd/",
    focusTip: "重音在 /ˈɪn/，/dʒərd/ 轻收；不要读成两个都重的 in-JURED。",
    lines: [
      {
        id: "emergency-help-1",
        speaker: "partner",
        text: "Emergency services. What is the nature of your emergency?",
        translation: "急救中心。请问是什么紧急情况？",
      },
      {
        id: "emergency-help-2",
        speaker: "learner",
        text: "There's a cyclist injured on Riverside Road, near the bridge. A car hit him.",
        translation: "河滨路大桥附近有一名骑行人受伤。他被汽车撞了。",
      },
      {
        id: "emergency-help-3",
        speaker: "partner",
        text: "Is he conscious? Is he breathing?",
        translation: "他有意识吗？在呼吸吗？",
      },
      {
        id: "emergency-help-4",
        speaker: "learner",
        text: "He's conscious, but his leg looks bad and he can't stand up.",
        translation: "有意识，但腿伤得很重，站不起来。",
      },
      {
        id: "emergency-help-5",
        speaker: "partner",
        text: "Don't move him. We're dispatching an ambulance now. What's the nearest landmark?",
        translation: "不要移动他。我们正在派救护车。最近的地标是什么？",
      },
      {
        id: "emergency-help-6",
        speaker: "learner",
        text: "The gas station at the bridge crossing — we're right by the entrance.",
        translation: "桥口那家加油站——我们就在加油站门口。",
      },
      {
        id: "emergency-help-7",
        speaker: "partner",
        text: "Understood. Stay on the line and keep him warm and still.",
        translation: "收到。请保持通话，让他保暖、不要乱动。",
      },
      {
        id: "emergency-help-8",
        speaker: "learner",
        text: "Okay. The ambulance is here — I can see the lights.",
        translation: "好。救护车到了——我看见警灯了。",
      },
    ],
  },
  "class-discussion": {
    focusWord: "evidence",
    phonetic: "/ˈevɪdəns/",
    focusTip: "重音在开头的 /ˈe/；中间的 /dəns/ 弱读收尾。",
    lines: [
      {
        id: "class-discussion-1",
        speaker: "partner",
        text: "So, to open us up: does remote learning work as well as classroom teaching? Anyone?",
        translation: "先开个头：远程教学的效果和课堂一样好吗？有人想说说吗？",
      },
      {
        id: "class-discussion-2",
        speaker: "learner",
        text: "I'd say it depends on the subject. Theory works fine online, but labs don't.",
        translation: "我觉得要看科目。理论课线上没问题，实验课不行。",
      },
      {
        id: "class-discussion-3",
        speaker: "partner",
        text: "Interesting. Can you build on that with some evidence?",
        translation: "有意思。你能用一些依据进一步展开吗？",
      },
      {
        id: "class-discussion-4",
        speaker: "learner",
        text: "Sure. Our cohort's exam scores were unchanged online, but lab reports took twenty percent longer to complete.",
        translation: "当然。我们这届线上考试分数没变，但实验报告的完成时间多了两成。",
      },
      {
        id: "class-discussion-5",
        speaker: "partner",
        text: "That's a fair point, though one cohort isn't a lot of data.",
        translation: "有道理，不过一届学生的数据不算多。",
      },
      {
        id: "class-discussion-6",
        speaker: "learner",
        text: "In contrast, three universities in last year's study showed the same pattern — I can share the paper.",
        translation: "相反，去年的研究里三所大学也是同样的结果——我可以分享那篇论文。",
      },
      {
        id: "class-discussion-7",
        speaker: "partner",
        text: "Please do. So the evidence leans your way, but practice is the open question.",
        translation: "请发我。这么说证据偏向你的观点，但实践层面还有疑问。",
      },
      {
        id: "class-discussion-8",
        speaker: "learner",
        text: "Agreed — maybe a hybrid model is the pragmatic answer.",
        translation: "同意——混合模式也许才是务实的答案。",
      },
    ],
  },
  "one-on-one": {
    focusWord: "priority",
    phonetic: "/praɪˈɒrəti/",
    focusTip: "四个音节，重音落在 /ˈɒr/；praɪ- 与结尾 -ti 都轻读。",
    lines: [
      {
        id: "one-on-one-1",
        speaker: "partner",
        text: "Morning! Let's do a quick check-in. Where are things with the migration?",
        translation: "早！快速同步一下。迁移进展怎么样？",
      },
      {
        id: "one-on-one-2",
        speaker: "learner",
        text: "The staging environment is done. Production is about sixty percent.",
        translation: "预发布环境完成了。生产环境大概六成。",
      },
      {
        id: "one-on-one-3",
        speaker: "partner",
        text: "What's holding up the rest?",
        translation: "剩下的卡在哪里？",
      },
      {
        id: "one-on-one-4",
        speaker: "learner",
        text: "The legacy billing service. Two of its dependencies are still on the old runtime, and the owners keep changing.",
        translation: "是老的计费服务。它的两个依赖还在旧运行时上，而且负责团队一直在变。",
      },
      {
        id: "one-on-one-5",
        speaker: "partner",
        text: "Okay, that's the third week it's been blocked. What do you need from me?",
        translation: "明白，这已经是被卡住的第三周了。你需要我做什么？",
      },
      {
        id: "one-on-one-6",
        speaker: "learner",
        text: "A hard deadline and one escalation to their director. We can't slip the release again.",
        translation: "需要一个硬性截止时间，以及向他们总监升级一次。发布不能再拖了。",
      },
      {
        id: "one-on-one-7",
        speaker: "partner",
        text: "I'll set up the escalation today. Make the billing fix the priority over the dashboard work for now.",
        translation: "我今天安排升级。暂时把计费修复列为优先，仪表盘的活往后放。",
      },
      {
        id: "one-on-one-8",
        speaker: "learner",
        text: "Agreed. If the deadline holds, I'm confident we ship by the end of the month.",
        translation: "同意。只要截止时间守得住，我有信心月底前上线。",
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
