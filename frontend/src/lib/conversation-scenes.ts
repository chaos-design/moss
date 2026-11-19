import { type SceneItem, sceneItems } from "@/lib/demo-data"
import {
  type IdiomaticExpressionNote,
  idiomaticExpressionNotes,
} from "@/lib/idiomatic-expressions"

type AvailableSceneItem = SceneItem

type ConversationSceneDetails = {
  partnerName: string
  partnerRole: string
  objective: string
  focusPhrases: ReadonlyArray<readonly [label: string, phrase: string, meaning: string]>
  expressionNotes?: readonly IdiomaticExpressionNote[]
  opening: {
    content: string
    translation: string
  }
  recallItems: ReadonlyArray<{
    phrase: string
    source: string
  }>
}

const conversationSceneDetails: Partial<Record<string, ConversationSceneDetails>> = {
  coffee: {
    partnerName: "Mia",
    partnerRole: "咖啡店店员",
    objective: "自然完成定制点单，并确认杯型。",
    focusPhrases: [
      ["礼貌请求", "Could I get...?", "我可以要……吗？比 I want 更礼貌自然。"],
      ["追加要求", "with / without...", "用 with 或 without 补充需要加入或去除的内容。"],
      ["确认规格", "hot or iced / what size", "用于确认温度、杯型等具体选项。"],
    ],
    opening: {
      content: "Good morning! What can I get started for you today?",
      translation: "早上好！今天想先来点什么？",
    },
    recallItems: [
      {
        phrase: "Could I get...?",
        source: "来自“餐厅用餐”，用于自然地提出请求。",
      },
      {
        phrase: "Would you like...?",
        source: "来自“商店购物”，常用于向对方提供选择。",
      },
    ],
  },
  "small-talk": {
    partnerName: "Alex",
    partnerRole: "邻居",
    objective: "自然开启寒暄，延续两个来回后礼貌结束。",
    focusPhrases: [
      ["开启话题", "How have you been?", "用于询问一段时间没见后的近况。"],
      ["延续交流", "What have you been up to?", "询问对方最近在忙什么，让话题继续。"],
      ["礼貌结束", "It was great catching up.", "表达聊得很愉快，并自然结束寒暄。"],
    ],
    opening: {
      content: "Hey, it has been a while! How have you been?",
      translation: "嗨，好久不见！你最近怎么样？",
    },
    recallItems: [
      {
        phrase: "How have you been?",
        source: "用于久别重逢后的自然问候。",
      },
      {
        phrase: "That sounds good.",
        source: "来自“咖啡店点单”，可用于积极回应对方。",
      },
    ],
  },
  meeting: {
    partnerName: "Jordan",
    partnerRole: "项目负责人",
    objective: "清楚表达观点，澄清一项取舍并确认后续动作。",
    focusPhrases: [
      ["表达观点", "From my perspective...", "标记个人判断，避免把观点说得过于绝对。"],
      ["澄清信息", "Could you clarify...?", "礼貌请求对方进一步解释具体信息。"],
      ["推进讨论", "Let's follow up on...", "把待确认事项转化为明确的后续动作。"],
    ],
    opening: {
      content: "Let's review the launch plan. What do you think our biggest trade-off is?",
      translation: "我们来复盘发布计划。你认为当前最大的取舍是什么？",
    },
    recallItems: [
      {
        phrase: "Could you clarify...?",
        source: "来自“日常寒暄”的追问练习，用于确认细节。",
      },
      {
        phrase: "I'd suggest...",
        source: "用于提出清晰但不过度强硬的建议。",
      },
    ],
  },
  "idiomatic-english": {
    partnerName: "Jordan",
    partnerRole: "双语团队同事",
    objective: "在日常安排和工作同步中自然使用地道词组，并能根据隐喻解释真实含义。",
    focusPhrases: [
      ["持续关注", "keep tabs on", "固定搭配用复数 tabs，表示持续记录并关注某人或某事的状态。"],
      ["保持同步", "keep someone in the loop", "把对方留在信息回路中，表示持续让对方知情。"],
      ["稍后再谈", "circle back", "像绕一圈回到原点一样，表示处理完当前事项后再回到这个话题。"],
    ],
    expressionNotes: idiomaticExpressionNotes,
    opening: {
      content:
        "Before we call it a day, can we touch base on the launch and then make a plan for the weekend?",
      translation: "今天收工前，我们能先快速同步一下发布事项，再安排周末计划吗？",
    },
    recallItems: [
      {
        phrase: "keep tabs on",
        source: "来自 19 世纪美国英语中的 tab 记录用法；注意固定搭配通常使用复数 tabs。",
      },
      {
        phrase: "on the same page",
        source: "来自共同阅读同一页的画面，用于确认双方理解和目标一致。",
      },
    ],
  },
  airport: {
    partnerName: "Taylor",
    partnerRole: "值机柜台工作人员",
    objective: "完成值机，确认行李要求并找到登机口。",
    focusPhrases: [
      ["办理值机", "I'd like to check in.", "清楚说明要办理值机手续。"],
      ["确认行李", "Can I check this bag?", "询问某件行李是否可以托运。"],
      ["询问位置", "Where is gate...?", "询问具体登机口的位置。"],
    ],
    opening: {
      content: "Good afternoon. May I see your passport and booking confirmation?",
      translation: "下午好。可以看一下你的护照和预订确认吗？",
    },
    recallItems: [
      {
        phrase: "May I see...?",
        source: "与礼貌请求结构相似，常见于服务流程。",
      },
      {
        phrase: "Where can I find...?",
        source: "来自“商店购物”，可迁移到机场问路。",
      },
    ],
  },
  restaurant: {
    partnerName: "Sam",
    partnerRole: "餐厅服务员",
    objective: "询问推荐，说明饮食要求并完成点餐。",
    focusPhrases: [
      ["询问推荐", "What would you recommend?", "请服务员推荐菜品，语气自然开放。"],
      ["说明要求", "I'm allergic to...", "明确说明过敏原，避免仅表达个人偏好。"],
      ["完成点餐", "I'll have...", "确认选择并完成点餐。"],
    ],
    opening: {
      content: "Welcome! Are you ready to order, or would you like a few more minutes?",
      translation: "欢迎！你准备好点餐了吗，还是需要再看几分钟？",
    },
    recallItems: [
      {
        phrase: "Could I get...?",
        source: "来自“咖啡店点单”，可直接迁移到餐厅点餐。",
      },
      {
        phrase: "Would you recommend...?",
        source: "用礼貌问句替代直接要求。",
      },
    ],
  },
  shopping: {
    partnerName: "Riley",
    partnerRole: "商店店员",
    objective: "询问库存和尺寸，比较选择并确认退换方式。",
    focusPhrases: [
      ["询问库存", "Do you have this in...?", "询问商品是否有其他尺寸、颜色或规格。"],
      ["试穿比较", "Could I try this on?", "礼貌询问是否可以试穿。"],
      ["确认退换", "What's your return policy?", "了解退换货的时限与条件。"],
    ],
    opening: {
      content: "Hi! Let me know if you need another size or want to try anything on.",
      translation: "你好！如果需要其他尺寸或想试穿，请告诉我。",
    },
    recallItems: [
      {
        phrase: "Do you have...?",
        source: "来自“餐厅用餐”的可用性询问，可迁移到库存确认。",
      },
      {
        phrase: "Could I try...?",
        source: "复用礼貌请求结构提出试穿需求。",
      },
    ],
  },
  hotel: {
    partnerName: "Morgan",
    partnerRole: "酒店前台",
    objective: "确认预订信息，提出房间需求并了解入住安排。",
    focusPhrases: [
      ["确认预订", "I have a reservation under...", "用预订人姓名让前台快速查找订单。"],
      ["提出需求", "Would it be possible to...?", "委婉询问某项安排是否可行。"],
      ["询问设施", "Is breakfast included?", "确认价格中是否已经包含某项服务。"],
    ],
    opening: {
      content: "Welcome. May I have the name on your reservation, please?",
      translation: "欢迎光临。请问预订时使用的姓名是什么？",
    },
    recallItems: [
      {
        phrase: "I have a reservation under...",
        source: "用于酒店和餐厅等需要核对预订信息的场合。",
      },
      {
        phrase: "Would it be possible to...?",
        source: "比直接提出要求更委婉，适合协商房间安排。",
      },
    ],
  },
  doctor: {
    partnerName: "Dr. Lee",
    partnerRole: "全科医生",
    objective: "准确描述主要症状、持续时间和身体感受。",
    focusPhrases: [
      ["描述症状", "I've been feeling...", "描述持续到现在的身体感受。"],
      ["说明时长", "It started... ago.", "说明症状从多久以前开始。"],
      ["补充程度", "It gets worse when...", "指出会让症状加重的动作或情境。"],
    ],
    opening: {
      content: "Hello. What symptoms have you been experiencing?",
      translation: "你好。你最近有哪些症状？",
    },
    recallItems: [
      {
        phrase: "I've been feeling...",
        source: "现在完成进行时适合描述持续到现在的身体感受。",
      },
      {
        phrase: "Could you clarify...?",
        source: "来自工作会议，也可用于确认医生的问题或建议。",
      },
    ],
  },
  interview: {
    partnerName: "Casey",
    partnerRole: "招聘经理",
    objective: "简洁介绍经历，用一个案例说明能力并提出反问。",
    focusPhrases: [
      ["介绍背景", "I have experience in...", "概括与岗位相关的经验领域。"],
      ["说明成果", "The result was...", "把行动连接到可观察或可量化的结果。"],
      ["主动反问", "Could you tell me more about...?", "用开放问题深入了解岗位或团队。"],
    ],
    opening: {
      content: "Thanks for joining us. Could you start by telling me about yourself?",
      translation: "感谢你参加面试。可以先介绍一下自己吗？",
    },
    recallItems: [
      {
        phrase: "From my perspective...",
        source: "来自工作会议，可用于清晰说明判断与思考过程。",
      },
      {
        phrase: "Could you tell me more about...?",
        source: "用开放式问题了解岗位和团队。",
      },
    ],
  },
  grocery: {
    partnerName: "Jamie",
    partnerRole: "超市店员",
    objective: "找到目标商品，确认价格并选择合适替代品。",
    focusPhrases: [
      ["寻找商品", "Which aisle is ... in?", "询问某件商品位于哪一条货架通道。"],
      ["确认价格", "Is this on sale?", "确认商品当前是否参与促销。"],
      ["询问替代", "Do you have a substitute for...?", "在缺货时询问可替代的商品。"],
    ],
    opening: {
      content: "Hi there. Is there anything I can help you find today?",
      translation: "你好。今天有什么商品需要我帮你找吗？",
    },
    recallItems: [
      {
        phrase: "Do you have...?",
        source: "来自商店购物，可直接迁移到超市库存询问。",
      },
      {
        phrase: "Could I get...?",
        source: "来自餐饮场景，也适用于柜台商品请求。",
      },
    ],
  },
  renting: {
    partnerName: "Avery",
    partnerRole: "房产经纪",
    objective: "了解租金构成、房屋设施和合同关键条件。",
    focusPhrases: [
      ["询问费用", "Are utilities included?", "确认水电等费用是否包含在租金中。"],
      ["了解条件", "How long is the lease?", "询问租约期限。"],
      ["确认入住", "When is it available?", "确认房屋最早可入住的时间。"],
    ],
    opening: {
      content: "Welcome. Would you like to look around first or discuss the lease details?",
      translation: "欢迎。你想先看看房子，还是先了解租约细节？",
    },
    recallItems: [
      {
        phrase: "Is ... included?",
        source: "来自酒店入住，可迁移到租金和费用确认。",
      },
      {
        phrase: "Would it be possible to...?",
        source: "适合协商入住日期或房屋条件。",
      },
    ],
  },
  taxi: {
    partnerName: "Chris",
    partnerRole: "出租车司机",
    objective: "说明目的地，确认路线并顺利完成付款。",
    focusPhrases: [
      ["说明目的地", "Could you take me to...?", "礼貌告知司机目的地。"],
      ["确认路线", "How long will it take?", "询问预计行程时长。"],
      ["指定下车", "You can drop me off here.", "告诉司机可以在当前位置停车。"],
    ],
    opening: {
      content: "Hello! Where would you like to go?",
      translation: "你好！你想去哪里？",
    },
    recallItems: [
      {
        phrase: "Could you take me to...?",
        source: "沿用礼貌请求结构说明目的地。",
      },
      {
        phrase: "How long will it take?",
        source: "可用于交通、维修和其他服务场景确认时长。",
      },
    ],
  },
  train: {
    partnerName: "Robin",
    partnerRole: "车站工作人员",
    objective: "购买正确车票，找到站台并确认换乘安排。",
    focusPhrases: [
      ["购买车票", "I'd like a ticket to...", "说明目的地并开始购票。"],
      ["询问站台", "Which platform does it leave from?", "确认列车出发站台。"],
      ["确认换乘", "Do I need to transfer?", "询问途中是否需要换乘。"],
    ],
    opening: {
      content: "Good morning. Where are you traveling to today?",
      translation: "早上好。你今天要去哪里？",
    },
    recallItems: [
      {
        phrase: "I'd like to...",
        source: "来自机场值机，可用于说明需要办理的事项。",
      },
      {
        phrase: "Where is...?",
        source: "复用机场问路表达寻找站台或出口。",
      },
    ],
  },
  pharmacy: {
    partnerName: "Dana",
    partnerRole: "药剂师",
    objective: "描述症状，了解药物用法并确认安全注意事项。",
    focusPhrases: [
      ["描述不适", "I've had ... since...", "同时说明症状和开始时间。"],
      ["询问用法", "How often should I take it?", "确认药物的服用频次。"],
      ["确认风险", "Are there any side effects?", "询问可能出现的不良反应。"],
    ],
    opening: {
      content: "Hi. What can I help you with today?",
      translation: "你好。今天需要什么帮助？",
    },
    recallItems: [
      {
        phrase: "I've been feeling...",
        source: "来自就医沟通，可帮助药剂师快速了解症状。",
      },
      {
        phrase: "Could you clarify...?",
        source: "用于确认剂量、频次或服用限制。",
      },
    ],
  },
  networking: {
    partnerName: "Taylor",
    partnerRole: "行业活动嘉宾",
    objective: "自然自我介绍，了解对方工作并建立后续联系。",
    focusPhrases: [
      ["自我介绍", "I work in...", "简洁说明自己所在的行业或职能。"],
      ["了解对方", "What brings you here?", "自然询问对方参加活动的原因。"],
      ["保持联系", "I'd love to keep in touch.", "表达希望后续保持联系。"],
    ],
    opening: {
      content: "Hi, I don't think we've met. What brings you to the event?",
      translation: "你好，我们好像还没见过。是什么让你来参加这次活动？",
    },
    recallItems: [
      {
        phrase: "How have you been?",
        source: "来自日常寒暄，可用于与熟悉的行业联系人重新开场。",
      },
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，可用于明确后续联系主题。",
      },
    ],
  },
  banking: {
    partnerName: "Quinn",
    partnerRole: "银行客户经理",
    objective: "说明办理事项，核对所需材料并确认处理时间。",
    focusPhrases: [
      ["说明业务", "I'd like to...", "清楚说明希望办理的业务。"],
      ["核对材料", "What documents do I need?", "确认办理业务所需的文件。"],
      ["确认进度", "How long does it usually take?", "询问通常需要多久才能处理完成。"],
    ],
    opening: {
      content: "Good afternoon. What can I help you with today?",
      translation: "下午好。今天需要办理什么业务？",
    },
    recallItems: [
      {
        phrase: "I'd like to...",
        source: "适用于清楚说明开户、转账等办理意图。",
      },
      {
        phrase: "Could you clarify...?",
        source: "用于核对手续、费用或账户规则。",
      },
    ],
  },
  bakery: {
    partnerName: "Ella",
    partnerRole: "面包店店员",
    objective: "询问当日面包的口味与配料，选择数量并说明包装需求。",
    focusPhrases: [
      ["询问口味", "What does this one taste like?", "询问某款食物的主要风味。"],
      ["确认配料", "Does this contain...?", "确认是否含有某种具体配料。"],
      ["说明数量", "Could I have two of these?", "礼貌说明想购买的数量。"],
    ],
    opening: {
      content:
        "Good morning! Everything on this tray was baked this morning. What can I get you?",
      translation: "早上好！这个托盘里的面包都是今天早上现烤的。你想要些什么？",
    },
    recallItems: [
      {
        phrase: "Could I have...?",
        source: "来自咖啡店点单，可用于自然说明商品与数量。",
      },
      {
        phrase: "Does this contain...?",
        source: "与餐厅的过敏信息确认相通，适合询问具体配料。",
      },
    ],
  },
  customs: {
    partnerName: "Officer Reed",
    partnerRole: "入境官员",
    objective: "清楚说明来访目的、停留时间、住宿地点和申报物品。",
    focusPhrases: [
      ["说明目的", "I'm here for...", "简洁说明旅行或来访目的。"],
      ["说明时长", "I'll be staying for...", "说明计划停留的时间长度。"],
      ["申报物品", "I have ... to declare.", "主动说明需要申报的物品。"],
    ],
    opening: {
      content: "Good afternoon. What is the purpose of your visit?",
      translation: "下午好。你这次来访的目的是什么？",
    },
    recallItems: [
      {
        phrase: "I'll be staying for...",
        source: "复用酒店与行程表达，准确说明计划停留时间。",
      },
      {
        phrase: "Could you clarify...?",
        source: "没有听清问题时，可礼貌请求对方进一步说明。",
      },
    ],
  },
  directions: {
    partnerName: "Noah",
    partnerRole: "当地路人",
    objective: "问清目的地位置，复述关键路线并确认预计步行时间。",
    focusPhrases: [
      ["礼貌问路", "Could you tell me how to get to...?", "礼貌询问前往某处的路线。"],
      ["复述确认", "So I turn left at...?", "复述关键转向，确认自己理解无误。"],
      ["询问距离", "Is it within walking distance?", "确认目的地是否适合步行到达。"],
    ],
    opening: {
      content: "Hi, you look a little lost. Are you trying to find somewhere nearby?",
      translation: "你好，你看起来有点迷路。是在找附近的某个地方吗？",
    },
    recallItems: [
      {
        phrase: "Where can I find...?",
        source: "来自商店与机场问路，可迁移到开放街区。",
      },
      {
        phrase: "How long will it take?",
        source: "来自打车场景，可用于确认步行所需时间。",
      },
    ],
  },
  "home-repair": {
    partnerName: "Pat",
    partnerRole: "房东",
    objective: "准确描述家中故障及影响，并协商可接受的上门维修时间。",
    focusPhrases: [
      ["描述故障", "There seems to be a problem with...", "客观指出某项设施可能出现故障。"],
      ["说明影响", "It has been affecting...", "补充故障对日常生活造成的影响。"],
      ["协调时间", "Would ... work for you?", "询问某个时间安排是否合适。"],
    ],
    opening: {
      content: "Hi, I saw your message. What seems to be the problem in the apartment?",
      translation: "你好，我看到你的消息了。公寓里出了什么问题？",
    },
    recallItems: [
      {
        phrase: "It started... ago.",
        source: "来自就医沟通，也适合说明故障开始的时间。",
      },
      {
        phrase: "Would it be possible to...?",
        source: "来自酒店场景，可用于礼貌协调维修安排。",
      },
    ],
  },
  "customer-support": {
    partnerName: "Harper",
    partnerRole: "客户支持专员",
    objective: "有条理地说明订单问题，提出退款诉求并确认处理节点。",
    focusPhrases: [
      ["说明问题", "There is an issue with my order.", "先概括订单存在问题，再补充细节。"],
      ["提出诉求", "I'd like to request a refund.", "清楚而克制地提出退款请求。"],
      ["追踪进度", "When should I expect the refund?", "确认退款预计到账时间。"],
    ],
    opening: {
      content:
        "Thanks for contacting support. Could you tell me what happened with your order?",
      translation: "感谢联系客服。可以告诉我你的订单出了什么问题吗？",
    },
    recallItems: [
      {
        phrase: "I'd like to...",
        source: "来自银行办事，可用于清楚陈述希望办理的事项。",
      },
      {
        phrase: "Could you clarify...?",
        source: "适合核对退款条件、原路退回方式或处理时长。",
      },
    ],
  },
  "emergency-help": {
    partnerName: "Dispatcher",
    partnerRole: "急救调度员",
    objective: "用短句快速报告位置、现场情况和人员状态，并听从安全指示。",
    focusPhrases: [
      ["报告位置", "I'm at...", "优先提供可定位的地址或地标。"],
      ["描述情况", "Someone has...", "用简短句子报告人员发生的状况。"],
      ["确认行动", "What should I do now?", "询问等待救援期间应采取的行动。"],
    ],
    opening: {
      content: "Emergency services. Tell me your exact location and what has happened.",
      translation: "这里是紧急救援。请告诉我你的准确位置以及发生了什么。",
    },
    recallItems: [
      {
        phrase: "I'm at...",
        source: "在紧急场景中先给出可定位的地址或地标。",
      },
      {
        phrase: "It started... ago.",
        source: "来自就医沟通，可帮助调度员判断事件发生时间。",
      },
    ],
  },
  "class-discussion": {
    partnerName: "Professor Kim",
    partnerRole: "课程教师",
    objective: "回应一个课堂观点，给出依据，并礼貌表达补充或不同意见。",
    focusPhrases: [
      ["承接观点", "I'd like to build on that point.", "先承接前一个观点，再补充自己的内容。"],
      ["补充依据", "One example is...", "用具体例子支持抽象判断。"],
      ["礼貌反驳", "I see it differently because...", "表达不同意见并立即给出原因。"],
    ],
    opening: {
      content: "We've heard one perspective. Would you like to add to it or challenge it?",
      translation: "我们已经听到一种观点。你想补充它，还是提出不同看法？",
    },
    recallItems: [
      {
        phrase: "From my perspective...",
        source: "来自工作会议，可用于清晰标记个人立场。",
      },
      {
        phrase: "Could you clarify...?",
        source: "在回应前先确认同学观点，能减少无效争论。",
      },
    ],
  },
  "one-on-one": {
    partnerName: "Morgan",
    partnerRole: "直属经理",
    objective: "简洁同步工作进展，说明当前阻碍，并提出具体的支持请求。",
    focusPhrases: [
      ["同步进展", "I've made progress on...", "概括已经取得进展的工作。"],
      ["说明阻碍", "I'm currently blocked by...", "明确当前阻碍及其来源。"],
      ["请求支持", "It would help if...", "提出具体、可执行的支持需求。"],
    ],
    opening: {
      content:
        "Let's use this time to check in. What is going well, and where do you need support?",
      translation: "我们用这段时间同步一下。哪些进展顺利？你在哪些方面需要支持？",
    },
    recallItems: [
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，可用于明确需要后续推进的事项。",
      },
      {
        phrase: "The result was...",
        source: "来自求职面试，可帮助你用结果说明已完成的工作。",
      },
    ],
  },
  negotiation: {
    partnerName: "Blake",
    partnerRole: "合作方谈判代表",
    objective: "明确优先级和底线，通过有条件让步推动双方形成可执行的共识。",
    focusPhrases: [
      ["限定立场", "Our main concern is...", "聚焦最重要的顾虑，避免扩大分歧。"],
      ["交换条件", "We could consider that provided that...", "提出带有明确前提的让步。"],
      ["寻找共识", "There may be some common ground on...", "指出双方可能达成一致的部分。"],
    ],
    opening: {
      content:
        "Before we discuss pricing, I would like to understand which terms are most important to your team.",
      translation: "在讨论价格之前，我想先了解哪些条款对你们团队最重要。",
    },
    recallItems: [
      {
        phrase: "From my perspective...",
        source: "来自工作会议，用于清楚标记立场而不把观点绝对化。",
      },
      {
        phrase: "Would it be possible to...?",
        source: "来自酒店协商，可迁移为更克制的条件试探。",
      },
    ],
  },
  "panel-debate": {
    partnerName: "Dr. Carter",
    partnerRole: "圆桌主持人",
    objective: "提炼复杂观点，承认合理部分，并针对关键前提提出有依据的反驳。",
    focusPhrases: [
      ["承认分歧", "I take your point, but...", "先承认对方观点中的合理部分，再提出异议。"],
      ["限定判断", "That holds true only if...", "指出结论成立所依赖的条件。"],
      ["回到前提", "The underlying assumption is...", "把讨论带回支撑观点的核心假设。"],
    ],
    opening: {
      content:
        "The panel has raised two competing explanations. How would you evaluate the assumptions behind them?",
      translation: "圆桌讨论提出了两种相互竞争的解释。你会如何评估它们背后的假设？",
    },
    recallItems: [
      {
        phrase: "I see it differently because...",
        source: "来自课堂讨论，可升级为有依据且不打断对方的反驳。",
      },
      {
        phrase: "One example is...",
        source: "用具体证据支撑抽象立场，避免只陈述结论。",
      },
    ],
  },
  "crisis-briefing": {
    partnerName: "Rowan",
    partnerRole: "应急响应负责人",
    objective: "区分已知事实与暂时判断，说明风险范围并提出下一步协调动作。",
    focusPhrases: [
      ["同步事实", "What we have confirmed so far is...", "只陈述当前已经核实的信息。"],
      ["限定判断", "It is too early to conclude that...", "提醒团队暂时没有足够证据下结论。"],
      ["协调行动", "Our immediate priority should be...", "明确当前最优先的行动。"],
    ],
    opening: {
      content:
        "We need a concise update for the response team. What has been confirmed, and what remains uncertain?",
      translation: "我们需要给响应团队一份简明更新。目前确认了什么，还有哪些信息不确定？",
    },
    recallItems: [
      {
        phrase: "I'm currently blocked by...",
        source: "来自一对一沟通，可用于明确当前信息或资源阻碍。",
      },
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，可用于分配后续核实动作。",
      },
    ],
  },
  "food-delivery": {
    partnerName: "Leo",
    partnerRole: "外卖平台客服",
    objective: "报出订单号与问题，追踪延迟订单并商定退款或补偿方式。",
    focusPhrases: [
      ["报出单号", "My order number is...", "先报订单号定位问题，客服处理更快。"],
      [
        "说明等待",
        "It has been over ... minutes since I ordered.",
        "用已等待的时长客观说明延迟程度。",
      ],
      [
        "提出补偿",
        "Could you offer a refund or a discount code?",
        "礼貌给出退单或补偿的可选项。",
      ],
    ],
    opening: {
      content:
        "Hi, thanks for reaching out. Could you share your order number and what went wrong?",
      translation: "你好，感谢反馈。能告诉我订单号和遇到的问题吗？",
    },
    recallItems: [
      {
        phrase: "Could you check on...?",
        source: "来自餐厅用餐，适合请客服核实订单状态。",
      },
      {
        phrase: "I would appreciate it if...",
        source: "来自酒店入住，用于礼貌提出补偿期望。",
      },
    ],
  },
  "dinner-party": {
    partnerName: "Grace",
    partnerRole: "聚餐主人",
    objective: "接受邀请并说明饮食禁忌，席间自然寒暄，饭后礼貌致谢或回邀。",
    focusPhrases: [
      ["接受邀请", "I'd love to come.", "热情接受邀请，比一句 Yes 更有温度。"],
      [
        "说明忌口",
        "I don't eat... / I'm allergic to...",
        "提前说明忌口或过敏，方便主人安排菜品。",
      ],
      ["致谢回邀", "Next time, dinner is on me.", "主动提出下次回请，把关系延续下去。"],
    ],
    opening: {
      content:
        "I'm so glad you can make it! Is there anything you don't eat, or any allergies I should know about?",
      translation: "很高兴你能来！有什么忌口或过敏需要我注意的吗？",
    },
    recallItems: [
      {
        phrase: "Could I bring anything?",
        source: "来自职场社交，做客前先问要带什么更周到。",
      },
      {
        phrase: "Everything was delicious, especially...",
        source: "来自餐厅用餐，用具体细节夸赞菜品。",
      },
    ],
  },
  "roommate-rules": {
    partnerName: "Sam",
    partnerRole: "室友",
    objective: "协商作息、卫生与访客规则，把抱怨变成双方都接受的约定。",
    focusPhrases: [
      ["提出困扰", "It bothers me when...", "直接说出被打扰的具体行为，对事不对人。"],
      ["提出方案", "How about we...?", "用提议句式把抱怨转成可执行的约定。"],
      ["复述共识", "So we agreed that...", "离开对话前复述共识，避免之后各说各话。"],
    ],
    opening: {
      content:
        "Hey, do you have a minute? I wanted to talk about how we're splitting the chores.",
      translation: "嘿，有空吗？想跟你聊聊家务怎么分工。",
    },
    recallItems: [
      {
        phrase: "Would you mind...ing?",
        source: "来自租房看房，礼貌请求对方配合。",
      },
      {
        phrase: "It has been affecting...",
        source: "来自联系房东报修，说明问题对生活的实际影响。",
      },
    ],
  },
  "car-rental": {
    partnerName: "Dana",
    partnerRole: "租车门店职员",
    objective: "确认车型、保险与取还车规则，拿到清楚的价格构成再签字。",
    focusPhrases: [
      ["询问车型", "What do you have available?", "先问可选车型再决定，不被动接受推销。"],
      ["确认保险", "Does that include insurance?", "确认报价是否含保险以及免赔额多少。"],
      ["确认还车", "Where and when do I need to return it?", "问清还车地点、油量与时间要求。"],
    ],
    opening: {
      content: "Welcome! What dates do you need the car for, and how long will you keep it?",
      translation: "欢迎！您需要哪几天用车，大概租多久？",
    },
    recallItems: [
      {
        phrase: "Could you break down the total?",
        source: "来自银行办事，请对方拆解费用构成。",
      },
      {
        phrase: "Is there anything extra I should know about?",
        source: "来自酒店入住，防止隐藏收费。",
      },
    ],
  },
  "flight-delay": {
    partnerName: "Ivy",
    partnerRole: "机场地勤",
    objective: "核实延误原因与时长，争取改签或餐食住宿安排。",
    focusPhrases: [
      [
        "核实情况",
        "Do you know what's causing the delay?",
        "先弄清延误原因和预计时长再决定策略。",
      ],
      [
        "请求改签",
        "Are there any other flights to...?",
        "主动问可选航班，把话题引向解决方案。",
      ],
      [
        "争取安置",
        "Will the airline cover meals or a hotel?",
        "确认延误期间的餐食住宿责任方。",
      ],
    ],
    opening: {
      content:
        "I'm sorry, but flight 208 is delayed. Would you like to wait or look at other options?",
      translation: "抱歉，208 航班延误了。您想等候还是看看其他方案？",
    },
    recallItems: [
      {
        phrase: "What are my options?",
        source: "来自联系客服退款，把列方案的主动权交给对方。",
      },
      {
        phrase: "I would appreciate it if...",
        source: "来自酒店入住，礼貌提出诉求。",
      },
    ],
  },
  "salary-negotiation": {
    partnerName: "Victor",
    partnerRole: "招聘经理",
    objective: "基于市场行情与自身贡献提出薪资期望，并谈妥整体待遇。",
    focusPhrases: [
      [
        "给出区间",
        "Based on my research, I'm looking for...",
        "用调研过的区间开价，有依据不冒进。",
      ],
      ["强调价值", "In my current role, I...", "先摆出贡献再谈数字，谈判更有分量。"],
      ["谈整体待遇", "Could we also discuss...?", "把奖金、假期、远程安排纳入整体方案。"],
    ],
    opening: {
      content: "Thanks for coming in. What are your salary expectations for this role?",
      translation: "感谢过来。你对这个职位的薪资期望是多少？",
    },
    recallItems: [
      {
        phrase: "Could you walk me through...?",
        source: "来自求职面试，请对方说明定薪依据。",
      },
      {
        phrase: "Let's find a middle ground.",
        source: "来自商务谈判，用于推进双方各让一步。",
      },
    ],
  },
  "status-update": {
    partnerName: "Nora",
    partnerRole: "项目经理",
    objective: "按进度、风险、下一步三段式汇报，并明确需要什么支持。",
    focusPhrases: [
      ["汇报进度", "We're on track for...", "先给结论：按计划还是延迟，再讲细节。"],
      ["提示风险", "The main risk is...", "主动暴露风险并附上应对建议，更显可靠。"],
      ["请求支持", "I could use your help with...", "明确说出需要对方提供的具体支持。"],
    ],
    opening: {
      content: "Let's start with your update. Where does the project stand this week?",
      translation: "先听你的进展。这周项目到哪一步了？",
    },
    recallItems: [
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，用于确定后续跟进事项。",
      },
      {
        phrase: "I'm currently blocked by...",
        source: "来自一对一工作沟通，说明当前阻碍。",
      },
    ],
  },
  "dentist-visit": {
    partnerName: "Kevin",
    partnerRole: "牙医",
    objective: "描述牙痛的位置、时长与诱因，理解治疗方案并确认费用。",
    focusPhrases: [
      ["描述疼痛", "It hurts when I...", "用触发条件描述疼痛，比“很痛”更有诊断价值。"],
      ["询问方案", "What are my treatment options?", "了解所有可选方案和利弊再做决定。"],
      ["确认费用", "How much will that cost, and is it covered?", "治疗方式与费用一次问清。"],
    ],
    opening: {
      content: "What brings you in today? How long has it been bothering you?",
      translation: "今天哪里不舒服？这个问题持续多久了？",
    },
    recallItems: [
      {
        phrase: "It started... ago.",
        source: "来自就医沟通，说明症状开始的时间。",
      },
      {
        phrase: "Could you explain that in simpler terms?",
        source: "来自课堂讨论，请医生用通俗语言解释方案。",
      },
    ],
  },
  "phone-plan": {
    partnerName: "Chloe",
    partnerRole: "营业厅店员",
    objective: "按真实用量比较套餐与合约条款，换到合适方案并确认违约金。",
    focusPhrases: [
      ["说明用量", "I mostly use data for...", "按真实用量描述，方便对方推荐合适套餐。"],
      ["比较套餐", "What's the difference between...?", "让店员把差异说清楚再做比较。"],
      [
        "确认合约",
        "Is there a contract or cancellation fee?",
        "换套餐前先确认合约期与违约金。",
      ],
    ],
    opening: {
      content: "Hi there! Are you looking to switch plans or get a new line today?",
      translation: "您好！今天是想换套餐还是新办号码？",
    },
    recallItems: [
      {
        phrase: "Could you break down the total?",
        source: "来自银行办事，请对方拆解月费构成。",
      },
      {
        phrase: "Is there anything extra I should know about?",
        source: "来自酒店入住，防止隐藏条款。",
      },
    ],
  },
  "office-hours": {
    partnerName: "Dr. Patel",
    partnerRole: "课程教授",
    objective: "带着具体问题请教论文思路，确认修改方向与截止时间。",
    focusPhrases: [
      ["说明来意", "I came to ask about...", "开门见山说明要讨论的具体问题。"],
      [
        "请教思路",
        "Could you point me in the right direction?",
        "不求答案只求方向，教授更愿意展开讲。",
      ],
      ["确认要求", "When is the deadline for...?", "离开前确认修改要求与时间节点。"],
    ],
    opening: {
      content: "Come on in! What would you like to go over today?",
      translation: "进来吧！今天想讨论什么？",
    },
    recallItems: [
      {
        phrase: "Could you clarify...?",
        source: "来自课堂讨论，请教授讲清模糊的要求。",
      },
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，约定下次跟进方式。",
      },
    ],
  },
  "fitting-room": {
    partnerName: "Ruth",
    partnerRole: "服装店员",
    objective: "自然地更换尺码并描述穿着是否合身。",
    focusPhrases: [
      ["换尺码", "Do you have this in a smaller size?", "请求把某件换成更小（或更大）的尺码。"],
      [
        "描述合身度",
        "It's a bit tight around the shoulders.",
        "具体说出哪里不合身，方便店员判断。",
      ],
      ["试穿确认", "May I try this on in the back?", "请求使用试衣间试穿。"],
    ],
    opening: {
      content: "Can I help you find a size, or would you like to head to the fitting room?",
      translation: "需要我帮您找尺码，还是直接去试衣间？",
    },
    recallItems: [
      {
        phrase: "Do you have a different color?",
        source: "来自商店购物，询问其他颜色或款式。",
      },
      {
        phrase: "Could I get a refund or an exchange?",
        source: "来自联系客服退款，提出退换选项。",
      },
    ],
  },
  "street-food": {
    partnerName: "Wu",
    partnerRole: "小吃摊主",
    objective: "问清招牌口味与辣度，选择方便携带的吃法。",
    focusPhrases: [
      ["问招牌", "What's your specialty here?", "询问摊位最拿手的是什么。"],
      [
        "确认辣度",
        "How spicy is that on a scale of one to five?",
        "用 1–5 的辣度尺度请对方量化辣味。",
      ],
      ["打包携带", "Could I get that to go?", "要求打包带走，便于边走边吃。"],
    ],
    opening: {
      content: "Hi! What would you like to try today? Our dumplings are the best-seller.",
      translation: "您好！今天想尝尝什么？我们的饺子最畅销。",
    },
    recallItems: [
      {
        phrase: "Could I get... without...?",
        source: "来自餐厅用餐，调整配料或去掉某样。",
      },
      {
        phrase: "Is there anything I should not miss?",
        source: "来自咖啡店点单，请对方推荐特色。",
      },
    ],
  },
  "farmers-market": {
    partnerName: "Otis",
    partnerRole: "市集摊主",
    objective: "问清产地与新鲜度，选好数量并确认单价。",
    focusPhrases: [
      ["问产地", "Are these locally grown?", "询问是否本地出产，判断新鲜度。"],
      [
        "按量购买",
        "I'll take two pounds of the ripe ones, please.",
        "说明要的数量并挑选成熟度。",
      ],
      ["确认价格", "How much is that per pound?", "按重量确认单价。"],
    ],
    opening: {
      content:
        "Morning! Everything out here is picked this week — want me to show you the ripe ones?",
      translation: "早上好！这里的东西都是本周摘的——要我带你看熟透的吗？",
    },
    recallItems: [
      {
        phrase: "Could you break down the total?",
        source: "来自银行办事，请对方拆解费用构成。",
      },
      {
        phrase: "Do you have something smaller?",
        source: "来自面包店选购，请换成更小的包装。",
      },
    ],
  },
  "moving-day": {
    partnerName: "Gus",
    partnerRole: "搬家工人",
    objective: "说明物品特征、楼层路线和摆放位置。",
    focusPhrases: [
      [
        "说明易碎",
        "This one is fragile — please handle it with care.",
        "提示某件物品易碎需要小心。",
      ],
      [
        "指引路线",
        "The elevator is on the left; it's a flight of stairs to the third floor.",
        "告知搬运路线与楼层。",
      ],
      ["指定位置", "Could you place it in the bedroom by the window?", "指定家具的摆放位置。"],
    ],
    opening: {
      content: "We're all set. Which boxes are we taking first, and where do they go?",
      translation: "我们准备好了。先搬哪箱，放哪儿？",
    },
    recallItems: [
      {
        phrase: "Would it be possible to...?",
        source: "来自酒店入住，礼貌提出请求。",
      },
      {
        phrase: "There seems to be a problem with...",
        source: "来自联系房东报修，指出物品或设施状况。",
      },
    ],
  },
  "neighbor-noise": {
    partnerName: "Milo",
    partnerRole: "楼上邻居",
    objective: "友善说明噪音影响并约定安静的时段。",
    focusPhrases: [
      [
        "说明影响",
        "The music is a little loud after ten at night.",
        "具体说明什么时间什么声音造成了困扰。",
      ],
      ["礼貌请求", "Could you keep it down on weekdays?", "请对方在工作日放轻音量。"],
      [
        "协商时段",
        "Would nine o'clock work as our quiet hour?",
        "提议一个双方都能接受的安静时段。",
      ],
    ],
    opening: {
      content: "Hey, sorry to bother you. Is now a bad time to chat about the noise upstairs?",
      translation: "嗨，抱歉打扰。现在聊楼上噪音的问题合适吗？",
    },
    recallItems: [
      {
        phrase: "Would you mind...ing?",
        source: "来自租房看房，礼貌请求对方配合。",
      },
      {
        phrase: "How about we...?",
        source: "来自会议沟通，把抱怨变成可执行的约定。",
      },
    ],
  },
  "lost-luggage": {
    partnerName: "Priya",
    partnerRole: "行李查询处员工",
    objective: "描述行李特征、登记信息并拿到追踪号。",
    focusPhrases: [
      ["描述行李", "It's a black rolling case with a red strap.", "用颜色和特征描述行李外观。"],
      ["登记信息", "Here's my bag tag and flight number.", "提供行李标签与航班号以便登记。"],
      [
        "追踪进度",
        "What's the tracking number, and how long will it take?",
        "索取追踪号并了解处理时长。",
      ],
    ],
    opening: {
      content:
        "I'm so sorry about that. Let's get it sorted — can you describe the bag for me?",
      translation: "真的很抱歉。我们来处理一下——能描述一下行李的样子吗？",
    },
    recallItems: [
      {
        phrase: "Could you check on...?",
        source: "来自联系客服退款，请对方核实处理状态。",
      },
      {
        phrase: "What are my options?",
        source: "来自客服投诉，请对方列出可行方案。",
      },
    ],
  },
  "missed-flight": {
    partnerName: "Theo",
    partnerRole: "航空公司地勤",
    objective: "说明误机原因、询问替代航班并协调住宿。",
    focusPhrases: [
      [
        "说明原因",
        "I missed my connection because the previous flight was delayed.",
        "客观说明误机的原因。",
      ],
      ["问替代", "What's the next available flight to...?", "询问下一班可用的替代航班。"],
      ["协调住宿", "Will you arrange an overnight stay for me?", "询问是否代为安排过夜住宿。"],
    ],
    opening: {
      content:
        "I'm sorry about that. Let's see what I can do — what's your destination, and when did you need to be there?",
      translation: "很抱歉。我看看能做什么——您的目的地是哪里，最晚什么时候要到？",
    },
    recallItems: [
      {
        phrase: "What are my options?",
        source: "来自客服投诉，把列方案的主动权交给对方。",
      },
      {
        phrase: "I would appreciate it if...",
        source: "来自酒店入住，礼貌提出诉求。",
      },
    ],
  },
  "project-kickoff": {
    partnerName: "Dana",
    partnerRole: "项目负责人",
    objective: "对齐目标、明确角色分工与首个里程碑。",
    focusPhrases: [
      ["对齐目标", "So the main goal this quarter is...", "复述项目目标确认理解一致。"],
      ["明确分工", "Who owns the design and who owns the build?", "明确每个模块的责任人。"],
      ["定里程碑", "When is the first milestone due?", "确认首个里程碑的时间点。"],
    ],
    opening: {
      content:
        "Thanks for joining. Let's align on scope and owners before we start. What do you think the top priority is?",
      translation: "谢谢参加。开工前我们先对齐范围和负责人。你觉得首要目标是什么？",
    },
    recallItems: [
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，确定后续跟进事项。",
      },
      {
        phrase: "I'm currently blocked by...",
        source: "来自一对一工作沟通，说明当前阻碍。",
      },
    ],
  },
  "performance-review": {
    partnerName: "Victor",
    partnerRole: "直属经理",
    objective: "总结自己的贡献、回应反馈并设定成长目标。",
    focusPhrases: [
      ["总结贡献", "This year I led... and it improved...", "用具体成果说明自己的贡献。"],
      [
        "回应反馈",
        "I'd like to work on... based on your feedback.",
        "接受反馈并表明改进方向。",
      ],
      [
        "设定目标",
        "What should I focus on to reach the next level?",
        "询问晋升所需的能力重点。",
      ],
    ],
    opening: {
      content: "Let's talk about your year. Start with the wins you're proudest of.",
      translation: "我们来聊聊你这一年。先说你最有成就感的成果。",
    },
    recallItems: [
      {
        phrase: "In my current role, I...",
        source: "来自薪资谈判，摆出贡献再谈期望。",
      },
      {
        phrase: "Let's find a middle ground.",
        source: "来自商务谈判，推进双方各让一步。",
      },
    ],
  },
  "conflict-resolution": {
    partnerName: "Nadia",
    partnerRole: "合作同事",
    objective: "描述分歧、倾听对方需求并达成可执行方案。",
    focusPhrases: [
      ["描述分歧", "I see this differently because...", "客观陈述自己的立场与理由。"],
      ["澄清需求", "What outcome are you hoping for here?", "把分歧落到双方真正的需求上。"],
      ["达成方案", "What if we... and you...?", "提出一个双方各让一步的具体方案。"],
    ],
    opening: {
      content:
        "I want to work this out properly. Can you walk me through what's not working for you?",
      translation: "我想把这事好好解决。能说说对你来说哪里不顺吗？",
    },
    recallItems: [
      {
        phrase: "Let's find a middle ground.",
        source: "来自商务谈判，推进各让一步。",
      },
      {
        phrase: "Could you clarify...?",
        source: "来自课堂讨论，请对方把模糊处讲清。",
      },
    ],
  },
  "party-introduction": {
    partnerName: "Grace",
    partnerRole: "派对主人",
    objective: "自然地加入谈话、做自我介绍并记住对方信息。",
    focusPhrases: [
      ["加入谈话", "Mind if I join you?", "礼貌请求加入正在进行的对话。"],
      [
        "自我介绍",
        "I'm Sam, a friend of the host. Nice to meet you.",
        "报出姓名并说明与主人的关系。",
      ],
      ["了解对方", "How do you know the host?", "通过共同关系自然地打开话题。"],
    ],
    opening: {
      content: "Oh, hi! I'm Grace, I threw this party. Come on in — do you know anyone here?",
      translation: "哦，嗨！我是格蕾丝，这派对是我办的。进来吧——你认识这里的人吗？",
    },
    recallItems: [
      {
        phrase: "Could I bring anything?",
        source: "来自职场社交，做客前先问要带什么。",
      },
      {
        phrase: "Nice to meet you.",
        source: "来自职场社交，初次见面的标准问候。",
      },
    ],
  },
  "hosting-guests": {
    partnerName: "Iris",
    partnerRole: "到访客人",
    objective: "迎接客人、提供选择并照顾对方需要。",
    focusPhrases: [
      ["迎接", "Make yourself at home.", "请客人放松、像在自己家一样。"],
      ["提供选择", "Would you like some water or something stronger?", "主动提供饮品选择。"],
      ["照顾需求", "Can I help you with anything?", "询问客人是否需要帮忙。"],
    ],
    opening: {
      content: "You made it! Come in, kick off your shoes — make yourself at home.",
      translation: "你来了！进来吧，把鞋换了——随便坐，别拘束。",
    },
    recallItems: [
      {
        phrase: "Would you like...?",
        source: "来自商店购物，向对方提供选择。",
      },
      {
        phrase: "Help yourself to...",
        source: "来自咖啡店点单，请对方自取或添点。",
      },
    ],
  },
  "appointment-booking": {
    partnerName: "Fay",
    partnerRole: "诊所前台",
    objective: "说明就诊需求、协调时间并核对保险信息。",
    focusPhrases: [
      ["说明需求", "I'd like to see a doctor about...", "说明要看什么症状或问题。"],
      ["协调时间", "Do you have any slots this week?", "询问可用的预约时段。"],
      [
        "核对保险",
        "Do you accept my insurance, and is there a copay?",
        "确认是否接受保险及自付额度。",
      ],
    ],
    opening: {
      content:
        "Hi, how can I help? Do you have a preferred doctor, or are you open to whoever is available?",
      translation: "您好，需要什么帮助？您有指定医生，还是谁有空都可以？",
    },
    recallItems: [
      {
        phrase: "Could you check on...?",
        source: "来自餐厅用餐，请对方核实可用时间。",
      },
      {
        phrase: "How much will that cost, and is it covered?",
        source: "来自看牙，确认费用与保险。",
      },
    ],
  },
  "internet-support": {
    partnerName: "Leo",
    partnerRole: "网络客服",
    objective: "描述连接问题、配合排查并预约上门支持。",
    focusPhrases: [
      ["描述问题", "The Wi-Fi keeps dropping every few hours.", "具体说明故障现象与频率。"],
      ["配合排查", "I can reboot the router if you want me to.", "配合远程排查步骤。"],
      ["预约上门", "Can you schedule a technician for tomorrow?", "预约技术人员上门时间。"],
    ],
    opening: {
      content:
        "Thanks for calling. Walk me through what you're seeing — when did it start, and is the light on the router solid or blinking?",
      translation: "感谢来电。说说您看到的情况——什么时候开始的，路由器灯是常亮还是闪？",
    },
    recallItems: [
      {
        phrase: "There seems to be a problem with...",
        source: "来自联系房东报修，客观描述设施故障。",
      },
      {
        phrase: "What are my options?",
        source: "来自客服投诉，请对方列出可行处理方案。",
      },
    ],
  },
  "exam-preparation": {
    partnerName: "Mia",
    partnerRole: "学习伙伴",
    objective: "确认复习重点、讨论方法并安排模拟练习。",
    focusPhrases: [
      ["确认重点", "Which topics do we still need to cover?", "对齐还需要复习的内容。"],
      [
        "讨论方法",
        "Should we do more practice tests or review the notes first?",
        "对比两种复习方法并征求意见。",
      ],
      ["安排模拟", "Could we schedule a mock test this weekend?", "约定一次模拟测试的时间。"],
    ],
    opening: {
      content: "How far are we? Let's map out what's left before the exam.",
      translation: "我们到哪了？来理一下考试前还剩哪些内容。",
    },
    recallItems: [
      {
        phrase: "Let's follow up on...",
        source: "来自工作会议，约定后续跟进。",
      },
      {
        phrase: "When is the deadline for...?",
        source: "来自教授答疑，确认时间节点。",
      },
    ],
  },
}

export type ConversationScene = AvailableSceneItem & ConversationSceneDetails

const categoryDetails: Record<
  SceneItem["category"],
  Pick<ConversationSceneDetails, "partnerName" | "partnerRole" | "opening">
> = {
  clothing: {
    partnerName: "Jamie",
    partnerRole: "门店顾问",
    opening: {
      content: "Hi! What are you looking for today?",
      translation: "你好！今天想找什么？",
    },
  },
  dining: {
    partnerName: "Mia",
    partnerRole: "餐饮服务人员",
    opening: {
      content: "Welcome! How can I help you today?",
      translation: "欢迎！今天需要什么帮助？",
    },
  },
  housing: {
    partnerName: "Morgan",
    partnerRole: "居住服务顾问",
    opening: {
      content: "Hello. What would you like to sort out today?",
      translation: "你好。今天想处理什么事情？",
    },
  },
  transport: {
    partnerName: "Taylor",
    partnerRole: "出行服务人员",
    opening: {
      content: "Good afternoon. Where are you trying to get to?",
      translation: "下午好。你准备去哪里？",
    },
  },
  work: {
    partnerName: "Jordan",
    partnerRole: "项目协作伙伴",
    opening: {
      content: "Let's get started. What should we focus on first?",
      translation: "我们开始吧。首先应该关注什么？",
    },
  },
  social: {
    partnerName: "Alex",
    partnerRole: "交流对象",
    opening: {
      content: "Hi, it is good to meet you. How is your day going?",
      translation: "你好，很高兴认识你。今天过得怎么样？",
    },
  },
  health: {
    partnerName: "Dr. Lee",
    partnerRole: "健康服务人员",
    opening: {
      content: "Hello. What can I help you with today?",
      translation: "你好。今天需要什么帮助？",
    },
  },
  services: {
    partnerName: "Quinn",
    partnerRole: "服务窗口人员",
    opening: {
      content: "Good morning. What can I do for you today?",
      translation: "早上好。今天需要办理什么？",
    },
  },
  learning: {
    partnerName: "Professor Kim",
    partnerRole: "学习伙伴",
    opening: {
      content: "Let's look at your goal. What would you like to clarify first?",
      translation: "我们先看你的目标。你想先澄清什么？",
    },
  },
  emergency: {
    partnerName: "Dispatcher",
    partnerRole: "应急支持人员",
    opening: {
      content: "I can help. Please tell me where you are and what happened.",
      translation: "我可以帮助你。请告诉我你在哪里以及发生了什么。",
    },
  },
}

function createGeneratedSceneDetails(scene: SceneItem): ConversationSceneDetails {
  const category = categoryDetails[scene.category]
  const firstTag = scene.tags[0] ?? "说明需求"
  const secondTag = scene.tags[1] ?? "确认信息"
  const thirdTag = scene.tags[2] ?? "推进沟通"

  return {
    ...category,
    objective: `在“${scene.title}”中完成${scene.tags.join("、")}。`,
    focusPhrases: [
      ["说明需求", "I'd like to...", `用于开始${firstTag}，清楚说明自己的目标。`],
      ["请求协助", "Could you help me with...?", `用于围绕${secondTag}礼貌请求帮助。`],
      ["确认结果", "Just to confirm...", `用于在${thirdTag}前复述关键信息。`],
    ],
    recallItems: [
      {
        phrase: "I'd like to...",
        source: `可迁移到“${scene.title}”，用于清楚说明办理意图。`,
      },
      {
        phrase: "Could you clarify...?",
        source: `遇到不确定信息时，用于完成${secondTag}。`,
      },
    ],
  }
}

function createConversationScene(scene: AvailableSceneItem): ConversationScene {
  return {
    ...scene,
    ...(conversationSceneDetails[scene.id] ?? createGeneratedSceneDetails(scene)),
  }
}

export function getConversationScene(sceneId?: string): ConversationScene {
  const selectedScene = sceneItems.find(
    (scene): scene is AvailableSceneItem => scene.id === sceneId && scene.status !== "locked",
  )
  const scene = selectedScene ?? sceneItems[0]

  return createConversationScene(scene)
}

export function getAvailableConversationScenes(
  category?: string | string[],
  level?: string | string[],
): ConversationScene[] {
  const categories = Array.isArray(category) ? category : category ? [category] : []
  const levels = Array.isArray(level) ? level : level ? [level] : []

  return sceneItems
    .filter(
      (scene): scene is AvailableSceneItem =>
        scene.status !== "locked" &&
        (categories.length === 0 ||
          categories.includes("all") ||
          categories.includes(scene.category)) &&
        (levels.length === 0 || levels.includes("all") || levels.includes(scene.level)),
    )
    .map(createConversationScene)
}
