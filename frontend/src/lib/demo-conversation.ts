import {
  analyzeConversationInput,
  type ConversationInputAnalysis,
  createExpressionValidation,
  type ExpressionValidation,
} from "@/lib/conversation-feedback"

type DemoConversationReply = {
  content: string
  translation: string
  recall: string
  inputAnalysis: ConversationInputAnalysis
  validation: ExpressionValidation
  source: "demo"
}

const demoReplies: Record<
  string,
  Omit<DemoConversationReply, "source" | "inputAnalysis" | "validation">
> = {
  coffee: {
    content: "That sounds good. Would you like it hot or iced, and what size should I make it?",
    translation: "好的。你想要热的还是冰的？需要多大杯？",
    recall: "找回提示：继续使用 Could I get... 延续礼貌请求。",
  },
  "small-talk": {
    content: "I've been busy too. What have you been working on lately?",
    translation: "我最近也挺忙的。你最近在忙什么？",
    recall: "找回提示：用 What have you been up to? 可以自然延续近况话题。",
  },
  meeting: {
    content:
      "That sounds reasonable. What risk would the extra week reduce, and how should we explain the delay?",
    translation: "这个建议有道理。多一周能降低什么风险？我们应该如何解释延期？",
    recall: "找回提示：用 From my perspective... 表明观点，再用 because 补充依据。",
  },
  airport: {
    content:
      "Thank you. Are you checking any bags today, or is this carry-on your only luggage?",
    translation: "谢谢。你今天需要托运行李吗，还是只有这件随身行李？",
    recall: "找回提示：用 Can I check this bag? 主动确认托运需求。",
  },
  restaurant: {
    content:
      "Certainly. Do you have any allergies, and would you like to hear today's special?",
    translation: "当然。你有食物过敏吗？需要听一下今日特色菜吗？",
    recall: "找回提示：用 What would you recommend? 询问服务员的建议。",
  },
  shopping: {
    content: "We have that in two colors. Which size would you like to try on first?",
    translation: "这款有两种颜色。你想先试哪个尺码？",
    recall: "找回提示：用 Could I try this on? 礼貌提出试穿需求。",
  },
  hotel: {
    content:
      "I found your reservation. Would you prefer a quiet room or one near the elevator?",
    translation: "我找到了你的预订。你更喜欢安静的房间，还是靠近电梯的房间？",
    recall: "找回提示：用 Would it be possible to...? 礼貌提出房间需求。",
  },
  doctor: {
    content: "I see. When did the symptoms start, and what makes them feel worse?",
    translation: "明白了。症状什么时候开始的？什么情况下会加重？",
    recall: "找回提示：用 It started... ago. 清楚说明症状持续时间。",
  },
  interview: {
    content: "Thanks for that overview. Could you share a specific example of your impact?",
    translation: "感谢你的概述。能否分享一个体现你工作成果的具体例子？",
    recall: "找回提示：先说明行动，再用 The result was... 总结成果。",
  },
  grocery: {
    content: "That item is in aisle six. Would you like a similar option that is on sale?",
    translation: "那件商品在第六通道。需要看看正在促销的类似选择吗？",
    recall: "找回提示：用 Do you have a substitute for...? 询问替代品。",
  },
  renting: {
    content:
      "The rent includes water, but electricity is separate. When would you like to move in?",
    translation: "租金包含水费，但电费另付。你希望什么时候入住？",
    recall: "找回提示：用 Are utilities included? 核对费用范围。",
  },
  taxi: {
    content: "Sure. The fastest route should take about twenty minutes. Is that okay?",
    translation: "可以。最快路线大约需要二十分钟，可以吗？",
    recall: "找回提示：用 How long will it take? 确认预计用时。",
  },
  train: {
    content: "The next train leaves from platform four, and you will need to transfer once.",
    translation: "下一班车从四号站台出发，你需要换乘一次。",
    recall: "找回提示：用 Do I need to transfer? 确认换乘安排。",
  },
  pharmacy: {
    content: "This medicine may help. Are you taking anything else at the moment?",
    translation: "这种药可能有帮助。你目前还在服用其他药物吗？",
    recall: "找回提示：确认 How often should I take it? 和可能的副作用。",
  },
  networking: {
    content: "Your work sounds interesting. What kind of projects are you focusing on now?",
    translation: "你的工作听起来很有意思。你目前主要关注哪类项目？",
    recall: "找回提示：用 I'd love to keep in touch. 自然提出后续联系。",
  },
  banking: {
    content: "I can help with that. Do you have your ID and proof of address with you?",
    translation: "我可以帮你办理。你带了身份证件和地址证明吗？",
    recall: "找回提示：用 What documents do I need? 核对所需材料。",
  },
  bakery: {
    content:
      "The almond croissant is lightly sweet and has a nut filling. How many would you like?",
    translation: "杏仁可颂甜度较低，里面有坚果馅。你想要几个？",
    recall: "找回提示：用 Does this contain...? 确认配料或过敏原。",
  },
  customs: {
    content:
      "Thank you. How long will you be staying, and where will you be staying during your visit?",
    translation: "谢谢。你会停留多久？这次来访期间会住在哪里？",
    recall: "找回提示：用 I'll be staying for... 清楚说明停留时间。",
  },
  directions: {
    content:
      "Go straight for two blocks, then turn left at the pharmacy. The station will be on your right.",
    translation: "直走两个街区，在药房处左转，车站就在你的右手边。",
    recall: "找回提示：用 So I turn left at...? 复述并确认关键路线。",
  },
  "home-repair": {
    content:
      "Thanks for letting me know. Is the leak constant, and would tomorrow morning work for a repair visit?",
    translation: "谢谢你告知我。漏水是持续的吗？明天上午上门维修方便吗？",
    recall: "找回提示：用 It started... ago. 说明故障从何时开始。",
  },
  "customer-support": {
    content:
      "I'm sorry the item arrived damaged. I can start a refund once I verify your order number.",
    translation: "很抱歉商品到货时有损坏。核对订单号后，我可以为你发起退款。",
    recall: "找回提示：用 When should I expect the refund? 确认到账时间。",
  },
  "emergency-help": {
    content:
      "Help is on the way. Stay where you are if it is safe, and tell me whether anyone is injured.",
    translation: "救援人员正在赶来。如果现场安全，请留在原地，并告诉我是否有人受伤。",
    recall: "找回提示：紧急沟通先说准确位置，再用短句说明人员状态。",
  },
  "class-discussion": {
    content: "That's a useful distinction. What evidence would you use to support your view?",
    translation: "这个区分很有帮助。你会用什么证据支持自己的观点？",
    recall: "找回提示：用 One example is... 把观点连接到具体依据。",
  },
  "one-on-one": {
    content:
      "That progress is clear. Which blocker is most urgent, and what support would help this week?",
    translation: "进展很清楚。哪个阻碍最紧急？这周提供什么支持会最有帮助？",
    recall: "找回提示：用 I'm currently blocked by... 明确说明当前阻碍。",
  },
  negotiation: {
    content:
      "We could be flexible on the timeline if the revised scope is reflected in the pricing. Would that give us a workable basis?",
    translation:
      "如果调整后的范围能体现在价格中，我们可以在时间线上保持灵活。这能否成为双方可行的基础？",
    recall: "找回提示：先明确核心关切，再用 provided that... 提出有条件让步。",
  },
  "panel-debate": {
    content:
      "That distinction is useful, but it depends on whether we accept the original premise. What evidence supports it?",
    translation: "这个区分很有价值，但前提是我们接受最初的假设。有什么证据支持它？",
    recall: "找回提示：用 I take your point, but... 承认合理部分后再提出异议。",
  },
  "crisis-briefing": {
    content:
      "Understood. Separate the confirmed facts from assumptions, then identify the decision that cannot wait.",
    translation: "明白。请区分已确认事实与推测，再指出哪项决策不能等待。",
    recall: "找回提示：用 What we have confirmed so far is... 限定信息边界。",
  },
}

export function getDemoConversationReply(
  sceneId: string,
  userContent = "",
  suggestedPhrase = "Could you tell me more?",
  sceneTag = "自然交流",
): DemoConversationReply {
  const inputAnalysis = analyzeConversationInput(userContent)
  const validation = createExpressionValidation(userContent, suggestedPhrase, sceneTag)
  if (inputAnalysis.intent === "translation_request") {
    return {
      content: validation.corrected,
      translation: `可以说：“${validation.corrected}”`,
      recall: "巩固提示：先记住核心句，再替换时间、人物或地点造句。",
      inputAnalysis,
      validation,
      source: "demo",
    }
  }

  return {
    ...(demoReplies[sceneId] ?? demoReplies.coffee),
    inputAnalysis,
    validation,
    source: "demo",
  }
}
