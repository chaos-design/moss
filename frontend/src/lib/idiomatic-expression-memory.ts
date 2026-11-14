import type { IdiomaticExpressionExample } from "@/lib/idiomatic-expressions"

/**
 * 精讲词条的记忆增强内容。
 *
 * 每条包含三部分： usage 说明句法位置与语域，memoryTip 给一个可复述的画面或对比，
 * examples 提供主例句之外的迁移例句。内容按 phrase 关联，与词条身份（场景 + 表达）解耦，
 * 因此不会改变已有学习记忆的 id，也不会影响导入词条。
 */
export type IdiomaticExpressionMemory = {
  usage: string
  memoryTip: string
  examples: readonly IdiomaticExpressionExample[]
}

export const idiomaticExpressionMemory: Record<string, IdiomaticExpressionMemory> = {
  "keep tabs on": {
    usage: "后接人或事物，常用 keep tabs on + 名词；口语和商务场景都自然，语气中性。",
    memoryTip: "把 tab 想成档案上的标签：记录一直在更新，监控就不会断。",
    examples: [
      {
        text: "The manager keeps tabs on how each project is progressing.",
        translation: "经理持续关注每个项目的进展。",
      },
      {
        text: "Social media makes it easy to keep tabs on old friends.",
        translation: "社交媒体让关注老朋友的近况变得很容易。",
      },
    ],
  },
  "call it a day": {
    usage: "用于结束当天的工作或活动，常说 let's call it a day；不用于刚开始就取消的计划。",
    memoryTip: "把已完成的工作“结账”成完整的一天，收工的动作就有了终点。",
    examples: [
      {
        text: "We have been at it for ten hours, so let's call it a day.",
        translation: "我们已经干了十个小时，今天就到这里吧。",
      },
      {
        text: "The rain is getting heavier, so the crew called it a day.",
        translation: "雨越下越大，工人们就收工了。",
      },
    ],
  },
  "hang in there": {
    usage: "独立成句或放在鼓励的话前，用于短期困难；正式文件里少见，口语和消息里常用。",
    memoryTip: "想象自己抓住栏杆不松手：hang 是抓住，in there 是留在难关里。",
    examples: [
      {
        text: "Hang in there; the results should be out by Friday.",
        translation: "坚持住，结果周五前应该会出来。",
      },
      {
        text: "She told me to hang in there after the second rejection.",
        translation: "第二次被拒后，她让我别放弃。",
      },
    ],
  },
  "get the hang of": {
    usage:
      "后接名词或动名词，常用 get the hang of it / doing something；强调从不会到上手的过程。",
    memoryTip: "hang 在这里是“门道”：摸到门道，动作就顺了。",
    examples: [
      {
        text: "Once you get the hang of the controls, the game is easy.",
        translation: "一旦摸清了操作，这个游戏就很简单。",
      },
      {
        text: "It took her a month to get the hang of the new system.",
        translation: "她花了一个月才熟悉新系统。",
      },
    ],
  },
  "break the ice": {
    usage: "常与 help、try to、a joke 搭配；宾语通常是沉默、紧张或初次见面的局面。",
    memoryTip: "冰面挡住船，破开第一道口子，后面的交流才流得动。",
    examples: [
      {
        text: "He told a light joke to break the ice at the meeting.",
        translation: "他讲了个轻松的笑话，打破会上的拘谨。",
      },
      {
        text: "A quick game can help break the ice with new classmates.",
        translation: "一个小游戏能帮助和新同学打破陌生感。",
      },
    ],
  },
  "take a rain check": {
    usage: "委婉拒绝当下的邀请并保留改期意愿，常说 take a rain check on something。",
    memoryTip: "雨票是改期入场券：今天进不了场，票还在手里。",
    examples: [
      {
        text: "I'm swamped tonight, but can I take a rain check on dinner?",
        translation: "我今晚忙不过来，晚饭能改天吗？",
      },
      {
        text: "She took a rain check on the concert and went next week.",
        translation: "她把音乐会改到了下周。",
      },
    ],
  },
  "hit the road": {
    usage: "表示出发或上路，常与 early、now 搭配；口语里也可表示“走人”。",
    memoryTip: "hit 是拍一下路面就动身，画面是车门关上、轮胎起步。",
    examples: [
      {
        text: "We should hit the road before the traffic builds up.",
        translation: "我们该在堵车之前出发。",
      },
      {
        text: "After a quick coffee, they hit the road again.",
        translation: "匆匆喝了杯咖啡，他们又上路了。",
      },
    ],
  },
  "sleep on it": {
    usage: "独立使用或 sleep on a decision / an offer；指把决定留到第二天再定。",
    memoryTip: "把问题放到枕头上：一夜之后，情绪退了，判断才清楚。",
    examples: [
      {
        text: "It's a big offer, so sleep on it and call me tomorrow.",
        translation: "这个提议不小，你先考虑一晚，明天打给我。",
      },
      {
        text: "She slept on it and chose the smaller project.",
        translation: "她把这件事留到第二天，最后选了较小的项目。",
      },
    ],
  },
  "go with the flow": {
    usage: "表示顺其自然、不强行掌控，常单独使用或 go with the flow of something。",
    memoryTip: "水流往哪走，人就往哪走；不逆流，反而省力。",
    examples: [
      {
        text: "The plan changed twice, so we just went with the flow.",
        translation: "计划改了两次，我们就顺其自然了。",
      },
      {
        text: "On holiday I like to go with the flow and decide each morning.",
        translation: "度假时我喜欢随性而行，每天早上再决定。",
      },
    ],
  },
  "out of the blue": {
    usage: "作状语，常与 appear、call、happen 搭配；强调毫无预兆。",
    memoryTip: "晴天里突然落下一道蓝色闪电：没有云，也没有预警。",
    examples: [
      {
        text: "An old colleague called me out of the blue yesterday.",
        translation: "昨天一位老同事突然给我打电话。",
      },
      {
        text: "The offer came out of the blue, but I accepted it.",
        translation: "这个邀请来得很突然，但我接受了。",
      },
    ],
  },
  "on the fence": {
    usage: "表示尚未决定，常与 sit、stay、be 搭配，后接 about something。",
    memoryTip: "坐在篱笆上，两边都不落脚；选边之前，人一直悬着。",
    examples: [
      {
        text: "I'm still on the fence about changing jobs.",
        translation: "我还在犹豫要不要换工作。",
      },
      {
        text: "Don't stay on the fence; the deadline is Friday.",
        translation: "别一直犹豫了，截止日期是周五。",
      },
    ],
  },
  "under the weather": {
    usage: "委婉表示身体不适，常说 feel / be a bit under the weather；不用于严重疾病。",
    memoryTip: "天气压在头顶，人就提不起劲：不是大病，只是状态差。",
    examples: [
      {
        text: "I'm a bit under the weather, so I'll work from home.",
        translation: "我有点不舒服，今天在家办公。",
      },
      {
        text: "She felt under the weather after the long flight.",
        translation: "长途飞行后她感觉不太舒服。",
      },
    ],
  },
  "spill the beans": {
    usage: "及物用法，宾语常是 secret、news、plan；多指无意或过早泄露。",
    memoryTip: "一袋豆子撒在地上，捡不回去：秘密一旦说出口就收不回。",
    examples: [
      {
        text: "Don't spill the beans about the surprise party.",
        translation: "别把惊喜派对的事说漏了。",
      },
      {
        text: "He spilled the beans during the interview.",
        translation: "他在面试中说漏了嘴。",
      },
    ],
  },
  "cut corners": {
    usage: "贬义，指为省时间或省钱而降低标准；常与 try to、be tempted to 搭配。",
    memoryTip: "走路抄近道会绕过转角：省了路，也绕过了该做的检查。",
    examples: [
      {
        text: "The builder cut corners and the roof started leaking.",
        translation: "施工方偷工减料，屋顶开始漏水。",
      },
      {
        text: "We can't cut corners on safety training.",
        translation: "安全培训上我们不能省步骤。",
      },
    ],
  },
  "no big deal": {
    usage: "口语中安慰或淡化某事，常说 It's no big deal；也可反问表示不以为意。",
    memoryTip: "deal 是交易：这件事不值得当成一笔大买卖。",
    examples: [
      {
        text: "Sorry I'm late. — No big deal, we just started.",
        translation: "抱歉我迟到了。——没事，我们刚开始。",
      },
      {
        text: "It's no big deal if we finish tomorrow.",
        translation: "明天完成也没什么大不了的。",
      },
    ],
  },
  "play it by ear": {
    usage: "表示不预先计划、见机行事；常与 will、have to 搭配。",
    memoryTip: "不看乐谱，听音即兴：计划留白，靠现场判断。",
    examples: [
      {
        text: "We don't have a fixed schedule, so we'll play it by ear.",
        translation: "我们没有固定日程，到时候看情况定。",
      },
      {
        text: "The weather is uncertain, so let's play it by ear.",
        translation: "天气不确定，我们随机应变吧。",
      },
    ],
  },
  "on the same page": {
    usage: "表示理解一致，常与 be、get、make sure 搭配，后接 about / on something。",
    memoryTip: "两个人盯着同一页书，看到的段落才一样。",
    examples: [
      {
        text: "Let's make sure we're on the same page about the deadline.",
        translation: "我们确认一下对截止时间的理解一致。",
      },
      {
        text: "The team got on the same page after the kickoff.",
        translation: "启动会后团队达成了共识。",
      },
    ],
  },
  "circle back": {
    usage: "商务口语，表示稍后再讨论，常说 circle back on / to something；日常闲聊少用。",
    memoryTip: "绕一圈再回到原点：话题先放下，之后转回来。",
    examples: [
      {
        text: "Let's circle back on pricing after we hear from legal.",
        translation: "等法务回复后我们再回到定价问题。",
      },
      {
        text: "I'll circle back to you once I have the numbers.",
        translation: "我拿到数据后再回来找你。",
      },
    ],
  },
  "touch base": {
    usage: "表示简短联系、同步近况，常说 touch base with someone；比 meet 更轻。",
    memoryTip: "base 是棒球垒：轻轻碰一下垒，确认人还在场上。",
    examples: [
      {
        text: "I'll touch base with the client on Monday.",
        translation: "我周一和客户简单联系一下。",
      },
      {
        text: "Let's touch base before the launch to check progress.",
        translation: "上线前我们碰一下，确认进度。",
      },
    ],
  },
  "keep someone in the loop": {
    usage: "及物，宾语是人；常用 keep me in the loop，表示持续抄送信息。",
    memoryTip: "loop 是信息回路：把人留在圈里，消息才不会断在他那里。",
    examples: [
      {
        text: "Please keep me in the loop about any design changes.",
        translation: "设计有任何变动请持续告诉我。",
      },
      {
        text: "She kept everyone in the loop during the outage.",
        translation: "故障期间她让所有人都了解进展。",
      },
    ],
  },
  "move the needle": {
    usage: "商务语境，表示带来可见的改变，常与 hardly、really 搭配。",
    memoryTip: "指针不动就是没效果：只有推到刻度变化，才算真正有影响。",
    examples: [
      {
        text: "The new campaign barely moved the needle on sales.",
        translation: "新活动对销售几乎没有带来变化。",
      },
      {
        text: "We need a feature that will really move the needle.",
        translation: "我们需要一个真正能带来改变的功能。",
      },
    ],
  },
  "raise the bar": {
    usage: "表示提高标准，常说 raise the bar for something；反义是 lower the bar。",
    memoryTip: "横杆越高，越过的人越少：标准一抬，水平就被迫提升。",
    examples: [
      {
        text: "The new hire raised the bar for code review.",
        translation: "新同事提高了代码评审的标准。",
      },
      {
        text: "This product raises the bar for small teams.",
        translation: "这款产品抬高了小团队可达到的水准。",
      },
    ],
  },
  "back to square one": {
    usage: "表示回到起点重来，常与 go、be back to 搭配。",
    memoryTip: "棋盘回到第一格：之前的步数清零，但经验还在。",
    examples: [
      {
        text: "The client rejected the design, so we're back to square one.",
        translation: "客户否掉了设计，我们又回到起点。",
      },
      {
        text: "One missing file sent the whole plan back to square one.",
        translation: "一个文件缺失让整个计划从头再来。",
      },
    ],
  },
  "learn the ropes": {
    usage: "表示熟悉某项工作的基本流程，常说 learn the ropes of something。",
    memoryTip: "船上的绳索各有用途：摸清每根绳，才算真正上手。",
    examples: [
      {
        text: "It took him a week to learn the ropes of the front desk.",
        translation: "他花了一周熟悉前台的流程。",
      },
      {
        text: "She is still learning the ropes, so give her time.",
        translation: "她还在熟悉工作，给她一点时间。",
      },
    ],
  },
  "up to speed": {
    usage: "常说 bring someone up to speed / get up to speed on something，表示掌握最新情况。",
    memoryTip: "速度表追上当前档位：信息补齐，人才跟得上节奏。",
    examples: [
      {
        text: "Can you bring me up to speed on the project?",
        translation: "你能把项目的最新情况告诉我吗？",
      },
      {
        text: "It took a day to get up to speed on the new tools.",
        translation: "花了一天熟悉新工具。",
      },
    ],
  },
  "in the pipeline": {
    usage: "表示已在筹备或开发中，常与 be、have something 搭配；商务语境。",
    memoryTip: "管道里的东西还没到出口，但已经在路上。",
    examples: [
      {
        text: "We have two features in the pipeline for next quarter.",
        translation: "下季度我们有两个功能在开发中。",
      },
      {
        text: "A new hiring plan is in the pipeline.",
        translation: "新的招聘计划正在筹备。",
      },
    ],
  },
  "get the ball rolling": {
    usage: "表示启动某事，常说 get the ball rolling on something；强调第一步。",
    memoryTip: "球一旦滚动，惯性会接管；最难的是第一脚。",
    examples: [
      {
        text: "Let's get the ball rolling on the redesign this week.",
        translation: "这周我们启动改版吧。",
      },
      {
        text: "Her email got the ball rolling on the partnership.",
        translation: "她的邮件启动了这次合作。",
      },
    ],
  },
  "take it offline": {
    usage: "会议用语，表示会后私下继续讨论，常说 let's take this offline。",
    memoryTip: "把话题从会议桌上拿下来，放到会后的走廊里谈。",
    examples: [
      {
        text: "We should take it offline after the meeting.",
        translation: "这个细节我们会后单独谈。",
      },
      {
        text: "Let's take it offline and bring a proposal next week.",
        translation: "我们私下讨论，下周带方案来。",
      },
    ],
  },
  bandwidth: {
    usage: "口语里指可投入的时间与精力，常说 have the bandwidth to do something。",
    memoryTip: "带宽有限：任务像数据流，占满了就传不动新的。",
    examples: [
      {
        text: "I don't have the bandwidth to take on another project.",
        translation: "我没有精力再接一个项目了。",
      },
      {
        text: "Do you have bandwidth for a quick review this week?",
        translation: "你这周有空帮忙快速评审一下吗？",
      },
    ],
  },
  bottleneck: {
    usage: "指流程中最容易卡住的环节，常与 be、become、remove 搭配。",
    memoryTip: "瓶口最窄，水流再大也只能慢慢过：卡点决定整体速度。",
    examples: [
      {
        text: "Code review is the bottleneck in our release process.",
        translation: "代码评审是我们发布流程的瓶颈。",
      },
      {
        text: "Hiring one more tester would remove the bottleneck.",
        translation: "再招一名测试就能消除这个瓶颈。",
      },
    ],
  },
  "low-hanging fruit": {
    usage: "指容易实现、见效快的目标，常与 pick、go after 搭配。",
    memoryTip: "伸手就能摘到的果子先摘：省力，又能快速填篮子。",
    examples: [
      {
        text: "Let's start with the low-hanging fruit and fix the labels.",
        translation: "我们先从容易的入手，把标签改好。",
      },
      {
        text: "There is plenty of low-hanging fruit in onboarding.",
        translation: "新手引导里有很多容易改进的地方。",
      },
    ],
  },
  "table this": {
    usage: "美式英语中表示搁置议题，常说 let's table this discussion；英式含义相反，需看语境。",
    memoryTip: "把文件放回桌上待议：不是扔掉，而是先不占当前议程。",
    examples: [
      {
        text: "We're out of time, so let's table this until Thursday.",
        translation: "时间不够了，这个议题周四再议。",
      },
      {
        text: "The board decided to table this until next quarter.",
        translation: "董事会决定把这件事搁置到下季度。",
      },
    ],
  },
  "by the book": {
    usage: "作方式状语，表示严格照规章办事，常与 do something 搭配。",
    memoryTip: "手里拿着手册，一步一页：不凭感觉，只按条文。",
    examples: [
      {
        text: "The audit was done strictly by the book.",
        translation: "这次审计严格按规章进行。",
      },
      {
        text: "He does everything by the book, even small expenses.",
        translation: "他事事按规矩来，连小额报销也不例外。",
      },
    ],
  },
  "ballpark figure": {
    usage: "指粗略估算的数字，常说 give me a ballpark figure；商务语境。",
    memoryTip: "球场的范围很大：只要落在场内，具体落点可以先不追究。",
    examples: [
      {
        text: "Can you give me a ballpark figure for the migration?",
        translation: "你能给我一个迁移的大概数字吗？",
      },
      {
        text: "A ballpark figure is enough for the first draft.",
        translation: "初稿有个大概数字就够了。",
      },
    ],
  },
  "deep dive": {
    usage: "指深入分析，常说 do a deep dive into something；可作名词也可作动词短语。",
    memoryTip: "浅水看表面，深潜才见结构：一头扎进去，细节才浮出来。",
    examples: [
      {
        text: "We need a deep dive into the churn data.",
        translation: "我们需要深入分析流失数据。",
      },
      {
        text: "She did a deep dive on the two failed releases.",
        translation: "她深入复盘了两次失败的发布。",
      },
    ],
  },
  "quick win": {
    usage: "指投入小、见效快的成果，常与 score、get、a few 搭配。",
    memoryTip: "先拿下一局小胜，士气起来，后面的硬仗才有人跟。",
    examples: [
      {
        text: "Fixing the login copy is a quick win for the team.",
        translation: "改好登录页文案是团队一个见效很快的成果。",
      },
      {
        text: "We scored a few quick wins in the first sprint.",
        translation: "第一个迭代我们拿到了几个快速成果。",
      },
    ],
  },
  "once in a blue moon": {
    usage: "作频率状语，常与 happen、go、see 搭配；语气夸张，表示极少发生。",
    memoryTip: "蓝月本来就罕见：把“很少”想成一轮蓝色的月亮。",
    examples: [
      {
        text: "He only calls once in a blue moon.",
        translation: "他很少打电话来。",
      },
      {
        text: "We eat out once in a blue moon these days.",
        translation: "现在我们很少出去吃饭。",
      },
    ],
  },
  "cost an arm and a leg": {
    usage: "及物，主语是物品或服务；常与 it costs、pay 搭配，语气夸张。",
    memoryTip: "价格高到要拿胳膊和腿去换：贵得让人肉疼。",
    examples: [
      {
        text: "That apartment costs an arm and a leg.",
        translation: "那套公寓贵得离谱。",
      },
      {
        text: "I paid an arm and a leg for the last-minute ticket.",
        translation: "我花了大价钱买那张临时票。",
      },
    ],
  },
  "a piece of cake": {
    usage: "作表语，常说 something is a piece of cake；口语，不用于正式评估。",
    memoryTip: "一块蛋糕几口就吃完：难度低到不需要费劲。",
    examples: [
      {
        text: "The test was a piece of cake after a week of practice.",
        translation: "练了一周后，这次测试小菜一碟。",
      },
      {
        text: "Setting up the account is a piece of cake.",
        translation: "开通账户很简单。",
      },
    ],
  },
  "bite the bullet": {
    usage: "表示咬牙面对不愉快但必须做的事，常与 have to、decide to 搭配。",
    memoryTip: "手术没有麻药时咬住子弹：疼，但必须撑过去。",
    examples: [
      {
        text: "We have to bite the bullet and raise the price.",
        translation: "我们只能咬牙涨价。",
      },
      {
        text: "She bit the bullet and told him the truth.",
        translation: "她硬着头皮把真相告诉了他。",
      },
    ],
  },
  "let the cat out of the bag": {
    usage: "及物，宾语常是 secret、plan；多指无意泄露，也可指故意说破。",
    memoryTip: "猫一旦从袋子里跳出来，就再也塞不回去：秘密同理。",
    examples: [
      {
        text: "He let the cat out of the bag about the merger.",
        translation: "他说漏了合并的事。",
      },
      {
        text: "Don't let the cat out of the bag before the announcement.",
        translation: "公告之前别把消息泄露出去。",
      },
    ],
  },
  "pull someone's leg": {
    usage: "及物，宾语是人；多用于否定或疑问，表示开玩笑而不是欺骗。",
    memoryTip: "拉一下腿让人站不稳：只是逗你一下，不是真的绊倒你。",
    examples: [
      {
        text: "Relax, I'm just pulling your leg.",
        translation: "放松，我只是跟你开玩笑。",
      },
      {
        text: "Are you serious, or are you pulling my leg?",
        translation: "你是认真的，还是在逗我？",
      },
    ],
  },
  "miss the boat": {
    usage: "表示错过机会，常与 will、have missed 搭配；宾语常省略。",
    memoryTip: "船开走了才到码头：机会的窗口一旦关上就追不上。",
    examples: [
      {
        text: "If we wait any longer, we'll miss the boat.",
        translation: "再等下去，我们就要错过机会了。",
      },
      {
        text: "They missed the boat on the early market.",
        translation: "他们错过了早期市场。",
      },
    ],
  },
  "beat around the bush": {
    usage: "表示绕弯子，常说 stop beating around the bush；不直接接宾语。",
    memoryTip: "在灌木丛外敲敲打打，就是不进去：话说了很多，重点没碰。",
    examples: [
      {
        text: "Stop beating around the bush and tell me the price.",
        translation: "别绕弯子了，直接告诉我价格。",
      },
      {
        text: "He beat around the bush for ten minutes before refusing.",
        translation: "他绕了十分钟才说出拒绝。",
      },
    ],
  },
  "get cold feet": {
    usage: "表示临阵退缩，常与 get、have 搭配，后接 about something。",
    memoryTip: "脚一凉，人就往后退：越到上场，越不敢迈步。",
    examples: [
      {
        text: "She got cold feet and cancelled the interview.",
        translation: "她临阵退缩，取消了面试。",
      },
      {
        text: "Don't get cold feet now; we've prepared for months.",
        translation: "别现在打退堂鼓，我们准备了好几个月。",
      },
    ],
  },
  "the last straw": {
    usage: "作表语或同位语，常说 it was the last straw；前面常铺垫一系列问题。",
    memoryTip: "骆驼已经背到极限，最后一根稻草就把它压垮。",
    examples: [
      {
        text: "The third delay was the last straw for the client.",
        translation: "第三次延期让客户彻底失去了耐心。",
      },
      {
        text: "Losing the file was the last straw, so she left.",
        translation: "文件丢失成了最后一击，她辞职了。",
      },
    ],
  },
  "through thick and thin": {
    usage: "作状语，常与 stay、support、stick together 搭配，表示长期不离不弃。",
    memoryTip: "穿过密林和薄雾都不分开：路好走难走，人都在。",
    examples: [
      {
        text: "They stayed together through thick and thin.",
        translation: "他们同甘共苦，一直在一起。",
      },
      {
        text: "She supported the team through thick and thin.",
        translation: "无论顺境逆境，她都支持着团队。",
      },
    ],
  },
  "a blessing in disguise": {
    usage: "作表语，常说 it turned out to be a blessing in disguise。",
    memoryTip: "坏事披着 disguise（伪装）：拆开后，里面可能是礼物。",
    examples: [
      {
        text: "Losing that job was a blessing in disguise.",
        translation: "失去那份工作其实是因祸得福。",
      },
      {
        text: "The delay turned out to be a blessing in disguise.",
        translation: "这次延误后来看反而是好事。",
      },
    ],
  },
  "make ends meet": {
    usage: "表示收支相抵，常与 struggle to、hard to、enough to 搭配。",
    memoryTip: "让收入这一端和支出这一端刚好接上：接不上就出现缺口。",
    examples: [
      {
        text: "They work two jobs to make ends meet.",
        translation: "他们打两份工来维持收支平衡。",
      },
      {
        text: "It is hard to make ends meet on one salary.",
        translation: "靠一份工资很难维持生活。",
      },
    ],
  },
  "get something off your chest": {
    usage: "及物，宾语是心事；常说 get it off your chest，表示说出来才轻松。",
    memoryTip: "心事压在胸口：说出来，重量才从身上卸下来。",
    examples: [
      {
        text: "I need to get this off my chest before I leave.",
        translation: "走之前我得把这件事说出来。",
      },
      {
        text: "Talking to a friend helped him get it off his chest.",
        translation: "和朋友聊聊让他把心事说了出来。",
      },
    ],
  },
  "see eye to eye": {
    usage: "表示意见一致，常与 not、never 搭配，后接 on something。",
    memoryTip: "两个人眼睛对齐，看到的是同一个画面：视角一致，意见才一致。",
    examples: [
      {
        text: "We don't see eye to eye on the budget.",
        translation: "我们在预算上意见不一致。",
      },
      {
        text: "They finally saw eye to eye after the meeting.",
        translation: "会后他们终于达成了一致。",
      },
    ],
  },
  "give someone the benefit of the doubt": {
    usage: "及物，双宾语结构；表示证据不足时先选择相信对方。",
    memoryTip: "疑点还在，但先把“无罪”的信任给对方：等证据再改判。",
    examples: [
      {
        text: "It's his first mistake, so I'll give him the benefit of the doubt.",
        translation: "这是他第一次犯错，我暂且相信他。",
      },
      {
        text: "She gave the vendor the benefit of the doubt and waited a day.",
        translation: "她先选择相信供应商，等了一天。",
      },
    ],
  },
  "read between the lines": {
    usage: "不及物，常与 can、need to 搭配；宾语常省略或为 message。",
    memoryTip: "字面行间还有空白：真正的意思藏在没写出来的部分。",
    examples: [
      {
        text: "Reading between the lines, I think the deal is off.",
        translation: "从字里行间看，我觉得交易黄了。",
      },
      {
        text: "You need to read between the lines of his email.",
        translation: "你得读懂他邮件里的言外之意。",
      },
    ],
  },
  "take something with a grain of salt": {
    usage: "及物，宾语是说法、消息；表示保留怀疑，不全信。",
    memoryTip: "撒一粒盐，味道就没那么冲：信息也先冲淡一点再吞。",
    examples: [
      {
        text: "Take his estimate with a grain of salt.",
        translation: "他的估算你别全信。",
      },
      {
        text: "We took the rumor with a grain of salt.",
        translation: "我们对那个传言持保留态度。",
      },
    ],
  },
  "cross that bridge when you come to it": {
    usage: "独立成句或作谓语，表示以后再说，不提前焦虑。",
    memoryTip: "桥还没到，就先别想怎么过：走到河边再找路。",
    examples: [
      {
        text: "You may need more staff, but you'll cross that bridge when you come to it.",
        translation: "你可能需要更多人，但到时候再想办法。",
      },
      {
        text: "Don't worry about the visa yet; cross that bridge when you come to it.",
        translation: "先别担心签证，到时候再处理。",
      },
    ],
  },
  "in hot water": {
    usage: "作表语，常说 be in hot water with someone；表示因过错惹上麻烦。",
    memoryTip: "水烧开了才叫 hot water：麻烦已经沸腾，躲不开。",
    examples: [
      {
        text: "He is in hot water with his manager over the delay.",
        translation: "因为延期，他被经理盯上了。",
      },
      {
        text: "The team got in hot water for missing the deadline.",
        translation: "团队因错过截止日期陷入麻烦。",
      },
    ],
  },
  "on thin ice": {
    usage: "作表语，常说 be on thin ice；表示处境危险，再犯错就糟。",
    memoryTip: "冰很薄，每一步都可能裂：现在的安全是暂时的。",
    examples: [
      {
        text: "After the last warning, he is on thin ice.",
        translation: "上次警告之后，他的处境很危险。",
      },
      {
        text: "You're on thin ice with that tone.",
        translation: "你用这种语气说话很危险。",
      },
    ],
  },
  "pull yourself together": {
    usage: "反身用法，常说 pull yourself together；用于劝人镇定、恢复状态。",
    memoryTip: "情绪散了一地，先把自己重新拼起来：稳住，再处理事情。",
    examples: [
      {
        text: "Pull yourself together; we still have a chance.",
        translation: "振作起来，我们还有机会。",
      },
      {
        text: "She took a breath and pulled herself together.",
        translation: "她吸了口气，让自己镇定下来。",
      },
    ],
  },
  "blow off steam": {
    usage: "不及物，表示发泄情绪，常与 need to、go for a run to 搭配。",
    memoryTip: "锅炉压力太高要放汽：情绪也需要一个出口。",
    examples: [
      {
        text: "He goes for a run to blow off steam after work.",
        translation: "他下班后跑步来发泄压力。",
      },
      {
        text: "We need to blow off steam before the next meeting.",
        translation: "下一场会前我们得先放松一下。",
      },
    ],
  },
  "have a soft spot for": {
    usage: "及物，后接人或物；表示偏爱，语气温和。",
    memoryTip: "心里有一块软的地方：对某个人或事物格外心软。",
    examples: [
      {
        text: "She has a soft spot for old bookshops.",
        translation: "她特别偏爱旧书店。",
      },
      {
        text: "I have a soft spot for that little cafe.",
        translation: "我对那家小咖啡馆情有独钟。",
      },
    ],
  },
  "be in two minds": {
    usage: "英式表达，常说 be in two minds about something；美式常用 of two minds。",
    memoryTip: "一个脑子分成两半，各投一票：所以迟迟定不下来。",
    examples: [
      {
        text: "I'm in two minds about moving to another city.",
        translation: "我对搬去另一个城市犹豫不决。",
      },
      {
        text: "She was in two minds until the last minute.",
        translation: "她一直犹豫到最后一刻。",
      },
    ],
  },
  "not my cup of tea": {
    usage: "作表语，常说 something is not my cup of tea；委婉表达不喜欢。",
    memoryTip: "这杯茶不合口味：不是茶坏了，只是不对我。",
    examples: [
      {
        text: "Horror films are not my cup of tea.",
        translation: "恐怖片不是我的菜。",
      },
      {
        text: "The style is nice, but it's not my cup of tea.",
        translation: "风格不错，但不太合我的口味。",
      },
    ],
  },
  "give it a shot": {
    usage: "及物，it 指尝试的事；常说 give it a shot 或 give something a shot。",
    memoryTip: "shot 是一次投篮：投了才有机会进，不投一定不进。",
    examples: [
      {
        text: "I've never tried rock climbing, but I'll give it a shot.",
        translation: "我没试过攀岩，但我想试一试。",
      },
      {
        text: "Give it a shot before you decide.",
        translation: "决定前先试一试。",
      },
    ],
  },
  "off the top of my head": {
    usage: "作状语，常与 can't remember、guess 搭配；表示未经查证、凭印象。",
    memoryTip: "从头顶直接拿出来的数字：没翻资料，只是印象。",
    examples: [
      {
        text: "Off the top of my head, the trip takes about four hours.",
        translation: "凭印象，这趟路大概四个小时。",
      },
      {
        text: "I can't remember the exact number off the top of my head.",
        translation: "我一时想不起确切的数字。",
      },
    ],
  },
  "at the drop of a hat": {
    usage: "作状语，常与 would、ready to 搭配；表示毫不犹豫。",
    memoryTip: "帽子一落地就行动：信号刚出现，人已经出发。",
    examples: [
      {
        text: "She would help a friend at the drop of a hat.",
        translation: "朋友一开口，她就会立刻帮忙。",
      },
      {
        text: "He is ready to travel at the drop of a hat.",
        translation: "他说走就走，随时能出发。",
      },
    ],
  },
  "take something for granted": {
    usage: "及物，宾语是人或事物；表示把……视为理所当然，常含提醒意味。",
    memoryTip: "默认它一直在，就不再看见它的价值：直到失去才发现。",
    examples: [
      {
        text: "We take clean water for granted until it runs out.",
        translation: "自来水一直都有时我们不觉得珍贵，直到停水。",
      },
      {
        text: "Don't take her help for granted.",
        translation: "别把她的帮助当成理所当然。",
      },
    ],
  },
  "make up your mind": {
    usage: "表示下定决心，常说 make up one's mind to do 或 about something。",
    memoryTip: "把散着的念头收拢成一个决定：mind 定下来，行动才开始。",
    examples: [
      {
        text: "He finally made up his mind to apply.",
        translation: "他终于下定决心去申请。",
      },
      {
        text: "Make up your mind before the tickets sell out.",
        translation: "票卖完之前你得做决定。",
      },
    ],
  },
  "get out of hand": {
    usage: "表示失控，常与 get、let 搭配；主语是局面、情绪或孩子。",
    memoryTip: "手里的缰绳松了，马就跑偏：局面一旦脱手，很难拉回。",
    examples: [
      {
        text: "The party got out of hand after midnight.",
        translation: "午夜后派对失控了。",
      },
      {
        text: "Don't let the argument get out of hand.",
        translation: "别让争论失控。",
      },
    ],
  },
  "touch and go": {
    usage: "作表语，常说 it was touch and go；表示结果难料、险象环生。",
    memoryTip: "船底擦着礁石走：碰上了也可能过去，差一点就出事。",
    examples: [
      {
        text: "It was touch and go, but the patient recovered.",
        translation: "情况一度很危险，但病人康复了。",
      },
      {
        text: "The launch was touch and go until the final check.",
        translation: "直到最后检查前，上线都还悬着。",
      },
    ],
  },
  "in the long run": {
    usage: "作状语，常与 will、pay off 搭配；表示从长远看。",
    memoryTip: "把时间轴拉长：眼前的小账，放到长跑里再算。",
    examples: [
      {
        text: "Investing in training pays off in the long run.",
        translation: "培训投入从长远看是值得的。",
      },
      {
        text: "In the long run, honesty saves time.",
        translation: "长远来看，诚实反而省时间。",
      },
    ],
  },
  "for good": {
    usage: "作状语，常与 leave、change、stay 搭配；强调永久，不接时间段。",
    memoryTip: "for good 不是“为了好”，而是 for good and all：这次真的不回头。",
    examples: [
      {
        text: "She left the city for good last spring.",
        translation: "去年春天她永久离开了这座城市。",
      },
      {
        text: "The old policy is gone for good.",
        translation: "旧政策彻底取消了。",
      },
    ],
  },
  "the other way around": {
    usage: "作表语或状语，常说 it's the other way around；表示顺序或关系颠倒。",
    memoryTip: "把两端对调：以为是 A 影响 B，其实是 B 影响 A。",
    examples: [
      {
        text: "I thought she was the manager, but it's the other way around.",
        translation: "我以为她是经理，其实正好相反。",
      },
      {
        text: "It works the other way around too.",
        translation: "反过来也成立。",
      },
    ],
  },
  "sooner or later": {
    usage: "作状语，常与 will、happen 搭配；表示迟早会发生。",
    memoryTip: "早一点或晚一点，终点都在那里：只是时间问题。",
    examples: [
      {
        text: "Sooner or later, the truth will come out.",
        translation: "真相迟早会浮出水面。",
      },
      {
        text: "You'll have to deal with it sooner or later.",
        translation: "你早晚得处理这件事。",
      },
    ],
  },
  "have a point": {
    usage: "常说 you have a point 或 have a point there；承认对方部分有理。",
    memoryTip: "对方的论点站得住：不必全同意，但这一点有效。",
    examples: [
      {
        text: "You have a point; the deadline is too tight.",
        translation: "你说得有道理，截止时间确实太紧。",
      },
      {
        text: "She has a point about the cost.",
        translation: "她在成本上的看法有道理。",
      },
    ],
  },
  "ring a bell": {
    usage: "常用于否定或疑问，主语是名字、声音、地点；表示听起来有点印象。",
    memoryTip: "铃声一响，记忆被唤醒：不一定想得全，但确实听过。",
    examples: [
      {
        text: "The name rings a bell, but I can't place him.",
        translation: "这名字有点耳熟，但我想不起是谁。",
      },
      {
        text: "Does that address ring a bell?",
        translation: "那个地址你有印象吗？",
      },
    ],
  },
  "get under someone's skin": {
    usage: "及物；可指惹恼，也可指让人着迷，靠语境区分。",
    memoryTip: "钻进皮肤底下：要么让人痒得难受，要么让人忘不掉。",
    examples: [
      {
        text: "His constant tapping really gets under my skin.",
        translation: "他没完没了地敲桌子让我很烦。",
      },
      {
        text: "That song got under my skin after one listen.",
        translation: "那首歌我听一遍就忘不掉。",
      },
    ],
  },
  "think outside the box": {
    usage: "表示跳出常规，常与 need to、encourage、ask someone to 搭配。",
    memoryTip: "盒子是默认框架：先承认它在，再走到盒子外面看。",
    examples: [
      {
        text: "We need to think outside the box to reach new users.",
        translation: "我们得跳出常规思路去触达新用户。",
      },
      {
        text: "The workshop encourages people to think outside the box.",
        translation: "这个工作坊鼓励大家打破常规思考。",
      },
    ],
  },
  "ahead of the curve": {
    usage: "作表语，常说 be ahead of the curve；表示领先于趋势。",
    memoryTip: "曲线还在上升，人已经站在前面：不是跟随，而是提前。",
    examples: [
      {
        text: "The company was ahead of the curve on remote work.",
        translation: "这家公司在远程办公上领先了一步。",
      },
      {
        text: "Staying ahead of the curve means learning continuously.",
        translation: "保持领先意味着持续学习。",
      },
    ],
  },
  "a learning curve": {
    usage: "常说 a steep learning curve；指学习新事物的难度与过程。",
    memoryTip: "曲线越陡，前期越吃力：不是能力差，是坡太陡。",
    examples: [
      {
        text: "The new system has a steep learning curve.",
        translation: "新系统的学习曲线很陡。",
      },
      {
        text: "There is a learning curve, but the results are worth it.",
        translation: "上手需要过程，但结果值得。",
      },
    ],
  },
  "game plan": {
    usage: "指总体策略，常说 come up with、stick to、change a game plan。",
    memoryTip: "比赛前的战术板：先写清每一步，上场才不慌。",
    examples: [
      {
        text: "We need a clear game plan for the launch.",
        translation: "上线需要一个清晰的总体方案。",
      },
      {
        text: "They changed the game plan after the first week.",
        translation: "第一周后他们改了策略。",
      },
    ],
  },
  "rule of thumb": {
    usage: "指经验法则，常说 as a rule of thumb；不保证精确。",
    memoryTip: "用拇指量长度：不精确，但够快、够用。",
    examples: [
      {
        text: "As a rule of thumb, keep the meeting under thirty minutes.",
        translation: "按经验，会议控制在三十分钟以内。",
      },
      {
        text: "A good rule of thumb is to test on real devices.",
        translation: "一个实用的经验法则是用真机测试。",
      },
    ],
  },
  "on someone's radar": {
    usage: "常说 be on / off someone's radar；指是否被关注或列入计划。",
    memoryTip: "雷达屏上的光点：出现就被看见，消失就没人追踪。",
    examples: [
      {
        text: "The issue is on her radar now.",
        translation: "这个问题现在她已经注意到了。",
      },
      {
        text: "The project stayed on his radar after the budget cut.",
        translation: "预算削减后，这个项目他仍然在关注。",
      },
    ],
  },
  "in a nutshell": {
    usage: "作状语，常放句首或句尾，表示概括。",
    memoryTip: "把整段话塞进坚果壳：空间很小，只留核心。",
    examples: [
      {
        text: "In a nutshell, we need more time and less scope.",
        translation: "简而言之，我们需要更多时间、更小范围。",
      },
      {
        text: "That's the plan in a nutshell.",
        translation: "计划概括起来就是这样。",
      },
    ],
  },
  "iron out": {
    usage: "及物，宾语常是 details、problems、differences；表示消除小问题。",
    memoryTip: "用熨斗把褶皱压平：不是重做，而是把不平的地方弄顺。",
    examples: [
      {
        text: "We still need to iron out a few details.",
        translation: "我们还需要解决几个细节问题。",
      },
      {
        text: "The two sides met to iron out their differences.",
        translation: "双方见面消除分歧。",
      },
    ],
  },
  "hammer out": {
    usage: "及物，宾语常是 deal、agreement、details；表示反复讨论后敲定。",
    memoryTip: "一锤一锤把形状敲出来：共识是打出来的，不是现成的。",
    examples: [
      {
        text: "They hammered out an agreement overnight.",
        translation: "他们连夜敲定了一项协议。",
      },
      {
        text: "We need to hammer out the timeline first.",
        translation: "我们得先把时间表定下来。",
      },
    ],
  },
  "get down to brass tacks": {
    usage: "表示进入实质细节，常说 let's get down to brass tacks。",
    memoryTip: "黄铜图钉把布钉在桌面：先谈最具体、最落地的点。",
    examples: [
      {
        text: "Let's get down to brass tacks: who owns each task?",
        translation: "我们说正事：每项任务谁负责？",
      },
      {
        text: "After the introductions, they got down to brass tacks.",
        translation: "介绍之后，他们进入实质讨论。",
      },
    ],
  },
  "put something on the back burner": {
    usage: "及物；表示暂时搁置，常与 for now 搭配。",
    memoryTip: "后灶火小，先保温不沸腾：没放弃，只是不急。",
    examples: [
      {
        text: "We put the redesign on the back burner for now.",
        translation: "我们暂时搁置了改版。",
      },
      {
        text: "The idea is on the back burner until next year.",
        translation: "这个想法要压到明年再说。",
      },
    ],
  },
  "wear many hats": {
    usage: "表示身兼多职，常说 wear many hats in a team。",
    memoryTip: "换一顶帽子就是换一个角色：小团队里一天要换好几次。",
    examples: [
      {
        text: "In a startup, you wear many hats.",
        translation: "在初创公司，你得身兼多职。",
      },
      {
        text: "She wears many hats, from design to support.",
        translation: "她从设计到客服什么都做。",
      },
    ],
  },
  "go the extra mile": {
    usage: "表示多做一步，常与 willing to、for someone 搭配。",
    memoryTip: "别人走到一英里就停，你再多走一英里：差距就在这一步。",
    examples: [
      {
        text: "The team went the extra mile to help the client.",
        translation: "团队额外多做了一步来帮助客户。",
      },
      {
        text: "She is always willing to go the extra mile.",
        translation: "她总是愿意多付出一点。",
      },
    ],
  },
  "pull the plug": {
    usage: "及物或不及物，常说 pull the plug on something；表示终止项目或服务。",
    memoryTip: "拔掉电源：机器不是慢慢停，而是瞬间断电。",
    examples: [
      {
        text: "They pulled the plug on the project after six months.",
        translation: "六个月后他们终止了项目。",
      },
      {
        text: "They pulled the plug on the old service last week.",
        translation: "他们上周关停了旧服务。",
      },
    ],
  },
  "give the green light": {
    usage: "及物，常说 give something the green light 或 give the green light to something。",
    memoryTip: "绿灯亮起才放行：之前所有准备都只是等待。",
    examples: [
      {
        text: "The board gave the green light to the new hire.",
        translation: "董事会批准了这个招聘。",
      },
      {
        text: "We are waiting for legal to give the green light.",
        translation: "我们在等法务放行。",
      },
    ],
  },
  "red tape": {
    usage: "不可数，常与 cut、too much、reduce 搭配；指繁琐的行政手续。",
    memoryTip: "红带子把文件捆了一圈又一圈：每道手续都多一道结。",
    examples: [
      {
        text: "Too much red tape slowed down the permit.",
        translation: "繁琐的手续拖慢了许可证办理。",
      },
      {
        text: "They cut red tape for small businesses.",
        translation: "他们为小企业简化了手续。",
      },
    ],
  },
  "across the board": {
    usage: "作状语或后置定语，表示全面、一律。",
    memoryTip: "棋盘横着划一条线，所有格子都受影响：没有例外。",
    examples: [
      {
        text: "Prices went up across the board.",
        translation: "价格全面上涨。",
      },
      {
        text: "The change applies across the board.",
        translation: "这项改动全面适用。",
      },
    ],
  },
  "the bottom line": {
    usage: "常作主语或表语，表示最终结论或净利润。",
    memoryTip: "账本最下面一行：上面怎么算，最后只看这一行。",
    examples: [
      {
        text: "The bottom line is that we need more users.",
        translation: "归根结底，我们需要更多用户。",
      },
      {
        text: "The bottom line improved after the price change.",
        translation: "调价后净利润有所改善。",
      },
    ],
  },
  "someone's hands are tied": {
    usage: "常说 my hands are tied；表示受规则限制，无能为力。",
    memoryTip: "手被绑住：不是不想帮，是动不了。",
    examples: [
      {
        text: "I'd like to help, but my hands are tied.",
        translation: "我想帮忙，但受规定限制没法做。",
      },
      {
        text: "The manager's hands are tied by the budget.",
        translation: "经理受预算限制，做不了主。",
      },
    ],
  },
  "keep someone posted": {
    usage: "及物，常说 keep me posted on something；表示持续通报进展。",
    memoryTip: "把公告贴在显眼处：有新消息就更新一次。",
    examples: [
      {
        text: "Keep me posted on the delivery date.",
        translation: "有交货日期就告诉我。",
      },
      {
        text: "She kept us posted throughout the move.",
        translation: "搬家期间她一直向我们通报进展。",
      },
    ],
  },
  "bring something to the table": {
    usage: "及物，宾语常是 skills、experience、value；表示能贡献什么。",
    memoryTip: "把东西摆上桌：谈判或合作时，先看彼此带了什么。",
    examples: [
      {
        text: "She brings years of experience to the table.",
        translation: "她带来了多年的经验。",
      },
      {
        text: "What does this partner bring to the table?",
        translation: "这个合作方能贡献什么？",
      },
    ],
  },
  "weigh in": {
    usage: "不及物，常说 weigh in on something；表示加入讨论并发表意见。",
    memoryTip: "上秤称重：把自己的观点放上去，让大家看看分量。",
    examples: [
      {
        text: "The designer weighed in on the new layout.",
        translation: "设计师对新布局发表了意见。",
      },
      {
        text: "Feel free to weigh in at any point.",
        translation: "随时可以发表你的看法。",
      },
    ],
  },
  "run something by someone": {
    usage: "双宾语，常说 run it by me；表示先征求对方意见。",
    memoryTip: "先跑一遍给对方看：不是正式提交，而是先试水。",
    examples: [
      {
        text: "Can I run this idea by you before the meeting?",
        translation: "开会前我能先跟你说说这个想法吗？",
      },
      {
        text: "Run the plan by legal first.",
        translation: "先把方案给法务看一下。",
      },
    ],
  },
  "take ownership of": {
    usage: "及物，宾语是任务、问题；表示主动负责到底。",
    memoryTip: "把名字写在任务卡上：出问题先找签名的人。",
    examples: [
      {
        text: "She took ownership of the migration and drove it to completion.",
        translation: "她接手了迁移，并推动到完成。",
      },
      {
        text: "Take ownership of the mistake instead of blaming the tool.",
        translation: "为错误负责，而不是怪工具。",
      },
    ],
  },
  "cut to the chase": {
    usage: "表示直奔重点，常说 let's cut to the chase。",
    memoryTip: "剪掉追逐戏，直接到高潮：观众要的是结果。",
    examples: [
      {
        text: "Let's cut to the chase: what's the price?",
        translation: "直说吧，价格是多少？",
      },
      {
        text: "He cut to the chase and asked for a refund.",
        translation: "他开门见山要求退款。",
      },
    ],
  },
  "hit the nail on the head": {
    usage: "常说 you hit the nail on the head；表示说得正中要害。",
    memoryTip: "一锤正中钉帽：不偏不倚，正好说到点上。",
    examples: [
      {
        text: "You hit the nail on the head with that comment.",
        translation: "你这句话说得正中要害。",
      },
      {
        text: "Her analysis hit the nail on the head.",
        translation: "她的分析一针见血。",
      },
    ],
  },
  "in the same boat": {
    usage: "作表语，常说 be in the same boat；表示处境相同。",
    memoryTip: "同一条船：风浪来了，谁也躲不开，只能一起划。",
    examples: [
      {
        text: "We're all in the same boat with this deadline.",
        translation: "这个截止日期前，我们处境一样。",
      },
      {
        text: "Other teams are in the same boat.",
        translation: "其他团队也一样。",
      },
    ],
  },
  "keep your chin up": {
    usage: "用于鼓励，常说 keep your chin up；表示别灰心。",
    memoryTip: "下巴抬起来，视线才向前：低头只会看见脚下。",
    examples: [
      {
        text: "Keep your chin up; the next round is still open.",
        translation: "别灰心，下一轮还有机会。",
      },
      {
        text: "She kept her chin up after the rejection.",
        translation: "被拒后她依然没有消沉。",
      },
    ],
  },
  "make a long story short": {
    usage: "作插入语，常说 to make a long story short；表示长话短说。",
    memoryTip: "把长故事剪短：只留开头和结果，中间全省。",
    examples: [
      {
        text: "To make a long story short, we missed the train.",
        translation: "长话短说，我们错过了火车。",
      },
      {
        text: "He made a long story short and got to the point.",
        translation: "他长话短说，直接进入重点。",
      },
    ],
  },
  "on the spot": {
    usage: "作状语，常与 decide、hire、pay 搭配；表示当场、立即。",
    memoryTip: "脚还站在原地，决定已经做出：没有回去再想的时间。",
    examples: [
      {
        text: "The manager hired him on the spot.",
        translation: "经理当场录用了他。",
      },
      {
        text: "She had to answer on the spot.",
        translation: "她不得不当场回答。",
      },
    ],
  },
  "the elephant in the room": {
    usage: "指人人都看见却避而不谈的问题，常与 address、ignore 搭配。",
    memoryTip: "房间里站着一头大象，所有人却假装没看见：沉默本身就是问题。",
    examples: [
      {
        text: "Let's address the elephant in the room: the budget.",
        translation: "我们谈谈那个谁都不提的问题：预算。",
      },
      {
        text: "The delay was the elephant in the room.",
        translation: "延误是大家心照不宣却避而不谈的问题。",
      },
    ],
  },
  "cover your bases": {
    usage: "表示把各方面都考虑到，常说 cover your bases by doing something。",
    memoryTip: "棒球每个垒都要有人守：漏掉一个，对方就能跑分。",
    examples: [
      {
        text: "Cover your bases by saving a local copy.",
        translation: "留一份本地副本，把各种情况都考虑到。",
      },
      {
        text: "She covered her bases and asked for written approval.",
        translation: "她做了万全准备，要了书面批准。",
      },
    ],
  },
  "see the big picture": {
    usage: "表示看整体而非局部，常与 help、step back to 搭配。",
    memoryTip: "退后几步才看得见整幅画：贴得太近，只看到色块。",
    examples: [
      {
        text: "Step back and see the big picture before optimizing.",
        translation: "优化之前先退一步看整体。",
      },
      {
        text: "The report helps leaders see the big picture.",
        translation: "这份报告帮助管理者看清全局。",
      },
    ],
  },
  "take a toll": {
    usage: "常说 take a toll on someone or something；表示造成累积性损害。",
    memoryTip: "过路费一点点收走：单次不显眼，长期就把人耗空。",
    examples: [
      {
        text: "Night shifts take a toll on your health.",
        translation: "夜班对健康有累积性的损害。",
      },
      {
        text: "The constant changes took a toll on the team.",
        translation: "不断变动让团队疲惫不堪。",
      },
    ],
  },
  "under the radar": {
    usage: "作表语或状语，常说 fly under the radar；表示不引人注意。",
    memoryTip: "雷达扫不到的低空：不是不存在，只是没被看见。",
    examples: [
      {
        text: "The update shipped under the radar.",
        translation: "这次更新悄悄上线了。",
      },
      {
        text: "He prefers to stay under the radar at work.",
        translation: "他在工作中宁愿低调。",
      },
    ],
  },
  "walk on eggshells": {
    usage: "表示小心翼翼，常说 walk on eggshells around someone。",
    memoryTip: "脚下全是蛋壳：每一步都得轻，怕一句话就踩碎。",
    examples: [
      {
        text: "We walk on eggshells around him after a bad review.",
        translation: "评审不顺之后，我们跟他说话都小心翼翼。",
      },
      {
        text: "You don't have to walk on eggshells with me.",
        translation: "跟我说话不用这么小心。",
      },
    ],
  },
  "look forward to": {
    usage: "to 是介词，后接名词或动名词；常与 really、look forward to hearing from you 搭配。",
    memoryTip: "身体朝前，心已经先到了：期待的事还没发生，人已经望着它。",
    examples: [
      {
        text: "I look forward to hearing from you.",
        translation: "期待你的回复。",
      },
      {
        text: "We're looking forward to the trip.",
        translation: "我们很期待这次旅行。",
      },
    ],
  },
  "put up with": {
    usage: "及物，宾语是人或不便；表示忍受，常与 have to、can't 搭配。",
    memoryTip: "把不快先放上去、撑住：不是接受，只是暂时扛着。",
    examples: [
      {
        text: "I can't put up with the noise any longer.",
        translation: "我再也受不了这噪音了。",
      },
      {
        text: "She put up with the delays for months.",
        translation: "她忍受了几个月的延误。",
      },
    ],
  },
  "sort out": {
    usage: "及物，宾语常是问题、纠纷、细节；表示理清或解决。",
    memoryTip: "把混在一起的东西分堆：先分类，再处理。",
    examples: [
      {
        text: "We need to sort out the payment issue first.",
        translation: "我们得先解决付款问题。",
      },
      {
        text: "They sorted out the misunderstanding quickly.",
        translation: "他们很快澄清了误会。",
      },
    ],
  },
  "figure out": {
    usage: "及物，宾语常是原因、方法、答案；表示弄明白或想出办法。",
    memoryTip: "把散乱的线索拼成图：拼上了，就叫 figure out。",
    examples: [
      {
        text: "I can't figure out why the build failed.",
        translation: "我搞不懂构建为什么失败。",
      },
      {
        text: "We figured out a cheaper way to ship.",
        translation: "我们想出了更便宜的运输方式。",
      },
    ],
  },
  "point out": {
    usage: "及物，常说 point out that 或 point something out；表示指出。",
    memoryTip: "用手指过去：让所有人的视线落到同一个点上。",
    examples: [
      {
        text: "She pointed out a mistake in the report.",
        translation: "她指出了报告里的一个错误。",
      },
      {
        text: "He pointed out that the deadline had moved.",
        translation: "他指出截止日期已经改了。",
      },
    ],
  },
  "carry out": {
    usage: "及物，宾语常是 plan、task、test、research；表示执行。",
    memoryTip: "把计划从纸上搬到现场：carry 是一路扛到完成。",
    examples: [
      {
        text: "The team carried out the migration over the weekend.",
        translation: "团队在周末执行了迁移。",
      },
      {
        text: "We need to carry out more tests first.",
        translation: "我们得先做更多测试。",
      },
    ],
  },
  "bring up": {
    usage: "及物，宾语常是话题、问题；也可表示抚养孩子。",
    memoryTip: "把话题从下面拿到桌面上：不藏着，摆出来谈。",
    examples: [
      {
        text: "She brought up the pricing issue again.",
        translation: "她又提起了定价问题。",
      },
      {
        text: "Don't bring up that topic during the meeting.",
        translation: "开会时别提那个话题。",
      },
    ],
  },
  "look into": {
    usage: "及物，宾语常是问题、投诉、原因；表示调查。",
    memoryTip: "把头探进箱子里看：不猜，进去查。",
    examples: [
      {
        text: "We'll look into the delay and get back to you.",
        translation: "我们会调查延误原因再回复你。",
      },
      {
        text: "She is looking into the complaint.",
        translation: "她正在调查这起投诉。",
      },
    ],
  },
  "turn down": {
    usage: "及物，宾语常是 offer、request、applicant；表示拒绝，也可表示调低音量。",
    memoryTip: "把递过来的东西往下按：不接，就是拒绝。",
    examples: [
      {
        text: "He turned down the offer politely.",
        translation: "他礼貌地拒绝了这个提议。",
      },
      {
        text: "Please turn down the music.",
        translation: "请把音乐调小。",
      },
    ],
  },
  "put off": {
    usage: "及物，常说 put off doing something；表示推迟，也可表示让人反感。",
    memoryTip: "把事情往后推：今天不做，明天再说。",
    examples: [
      {
        text: "Don't put off the decision until Friday.",
        translation: "别把决定拖到周五。",
      },
      {
        text: "The launch was put off until Monday.",
        translation: "发布推迟到了周一。",
      },
    ],
  },
  "make sense": {
    usage: "不及物，常说 it makes sense、make sense of something；表示讲得通或理解。",
    memoryTip: "拼图对上了：逻辑能接起来，就叫 make sense。",
    examples: [
      {
        text: "It makes sense to test the small change first.",
        translation: "先测试小改动是合理的。",
      },
      {
        text: "I can't make sense of these numbers.",
        translation: "我看不懂这些数字。",
      },
    ],
  },
  "make a difference": {
    usage: "不及物，常说 make a difference to someone or something；表示带来改变。",
    memoryTip: "在结果上留下一个可见的差：没有它，数字就不一样。",
    examples: [
      {
        text: "A short reply can make a difference to a worried client.",
        translation: "一句简短回复就能让焦虑的客户安心。",
      },
      {
        text: "Small habits make a big difference over time.",
        translation: "小习惯长期会带来大变化。",
      },
    ],
  },
  "take turns": {
    usage: "常说 take turns doing something 或 take turns at something；表示轮流。",
    memoryTip: "轮子转一圈换一个人：顺序清楚，谁都不抢。",
    examples: [
      {
        text: "We take turns leading the stand-up.",
        translation: "我们轮流主持站会。",
      },
      {
        text: "The kids took turns opening the presents.",
        translation: "孩子们轮流拆礼物。",
      },
    ],
  },
  "pay attention to": {
    usage: "及物，to 是介词，后接名词或动名词；常与 need to、should 搭配。",
    memoryTip: "把注意力付出去：像付款一样，给了才有回应。",
    examples: [
      {
        text: "Pay attention to the details in the contract.",
        translation: "注意合同里的细节。",
      },
      {
        text: "He didn't pay attention to the warning.",
        translation: "他没注意那个警告。",
      },
    ],
  },
  "in charge of": {
    usage: "作表语或后置定语，后接名词或动名词；表示负责。",
    memoryTip: "把责任交到手里：这一块由你说了算。",
    examples: [
      {
        text: "She is in charge of the onboarding process.",
        translation: "她负责入职流程。",
      },
      {
        text: "Who is in charge of the release?",
        translation: "这次发布谁负责？",
      },
    ],
  },
  "on purpose": {
    usage: "作状语，常与 do、say 搭配；表示故意，反义是 by accident。",
    memoryTip: "有一个明确的目的：不是碰巧，是有意为之。",
    examples: [
      {
        text: "I didn't break it on purpose.",
        translation: "我不是故意弄坏的。",
      },
      {
        text: "She said it on purpose to test his reaction.",
        translation: "她故意这么说来试探他的反应。",
      },
    ],
  },
  "in advance": {
    usage: "作状语，常与 book、pay、tell 搭配；表示提前。",
    memoryTip: "走在时间前面：事情还没到，准备已经完成。",
    examples: [
      {
        text: "Please book the room in advance.",
        translation: "请提前预订房间。",
      },
      {
        text: "You need to pay in advance for the course.",
        translation: "这门课需要提前付款。",
      },
    ],
  },
  "keep track of": {
    usage: "及物，宾语常是时间、费用、进度；表示持续记录、掌握。",
    memoryTip: "沿着轨道一路标记：不记，就会丢。",
    examples: [
      {
        text: "Keep track of how much time you spend on email.",
        translation: "记录一下你在邮件上花了多少时间。",
      },
      {
        text: "The app keeps track of your expenses.",
        translation: "这个应用会记录你的开支。",
      },
    ],
  },
  "take responsibility for": {
    usage: "及物，后接名词或动名词；表示对某事负责。",
    memoryTip: "把责任接过来，而不是推出去：先认领，才有解决。",
    examples: [
      {
        text: "He took responsibility for the missed deadline.",
        translation: "他为错过截止日期承担责任。",
      },
      {
        text: "Someone has to take responsibility for the decision.",
        translation: "这个决定得有人负责。",
      },
    ],
  },
  "a sense of humor": {
    usage: "常说 have a good sense of humor；指幽默感，可数名词短语。",
    memoryTip: "一种看事情的弹性：同样的局面，能笑出来。",
    examples: [
      {
        text: "She has a dry sense of humor.",
        translation: "她有一种冷幽默。",
      },
      {
        text: "A sense of humor helps in stressful jobs.",
        translation: "幽默感在高压工作中有帮助。",
      },
    ],
  },
  "as long as": {
    usage: "引导条件状语从句，意为“只要”；从句用一般现在时表将来。",
    memoryTip: "条件像一根长度线：只要在范围内，结果就成立。",
    examples: [
      {
        text: "As long as you save your work, the crash won't matter.",
        translation: "只要你保存了工作，崩溃也没关系。",
      },
      {
        text: "We can finish today as long as nobody adds scope.",
        translation: "只要没人加需求，我们今天就能完成。",
      },
    ],
  },
  "even though": {
    usage: "引导让步状语从句，表示“尽管”；比 even if 更强调已知事实。",
    memoryTip: "事实已经摆在那，仍然要转折：even 把对比推得更强。",
    examples: [
      {
        text: "Even though it was late, she finished the report.",
        translation: "尽管很晚了，她还是完成了报告。",
      },
      {
        text: "He came, even though he was ill.",
        translation: "尽管生病，他还是来了。",
      },
    ],
  },
  "instead of": {
    usage: "介词短语，后接名词或动名词；表示代替，而不是。",
    memoryTip: "把 A 拿开，换成 B：位置只有一个，选了 B 就没有 A。",
    examples: [
      {
        text: "Let's meet online instead of in the office.",
        translation: "我们在线上见，不去办公室了。",
      },
      {
        text: "She walked instead of taking the bus.",
        translation: "她走路去，没坐公交。",
      },
    ],
  },
  "be supposed to": {
    usage: "后接动词原形，表示按计划、规定或预期应该做某事。",
    memoryTip: "有一个外部约定放在你身上：不是你想要的，是“本该”。",
    examples: [
      {
        text: "You are supposed to submit the form by Friday.",
        translation: "你应该在周五前提交表格。",
      },
      {
        text: "It was supposed to rain, but it didn't.",
        translation: "本来预计会下雨，但没下。",
      },
    ],
  },
  "had better": {
    usage: "后接动词原形，表示强烈建议或警告；否定是 had better not。",
    memoryTip: "比 should 更硬：不是建议，是“最好这样，否则有后果”。",
    examples: [
      {
        text: "You had better check the address before sending.",
        translation: "发送前你最好核对地址。",
      },
      {
        text: "We had better not tell him yet.",
        translation: "我们最好先别告诉他。",
      },
    ],
  },
  "would rather": {
    usage: "后接动词原形，表示宁愿；比较用 would rather A than B。",
    memoryTip: "心里有一杆秤：两个选项，砝码明显偏向一边。",
    examples: [
      {
        text: "I would rather stay home tonight.",
        translation: "我今晚宁愿待在家里。",
      },
      {
        text: "She would rather walk than wait for the bus.",
        translation: "她宁愿走路也不等公交。",
      },
    ],
  },
  "no wonder": {
    usage: "常放句首，后接从句，表示“难怪”；前面通常已给出原因。",
    memoryTip: "没有可惊讶的：原因已经摆明，结果自然不奇怪。",
    examples: [
      {
        text: "No wonder the page is slow; the image is huge.",
        translation: "难怪页面这么慢，图片太大了。",
      },
      {
        text: "No wonder she was tired after the flight.",
        translation: "飞行之后她那么累，一点也不奇怪。",
      },
    ],
  },
  "it depends": {
    usage: "独立回答或后接 on something，表示视情况而定。",
    memoryTip: "答案挂在条件上：条件没给全，就不能先下结论。",
    examples: [
      {
        text: "It depends on how much time we have.",
        translation: "这要看我们有多少时间。",
      },
      {
        text: "Will you come? — It depends.",
        translation: "你会来吗？——看情况。",
      },
    ],
  },
}
