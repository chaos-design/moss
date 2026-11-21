---
title: 学习页随机简化与引导轻量化
priority: P2
created: 2026-11-21 21:48:03
updated: 2026-11-21 22:17:51
---

# 学习页随机简化与引导轻量化

## 目标

随机学习改为一键抽词、闪卡玩法说明从独立区块改为按需提示按钮、学习页布局与系统一致并适度丰富，降低上手认知成本

## 范围

- 包含：`expression-study-panel` 的「随机抽一组」去掉条数/分组目标弹窗，改为直接随机抽词进入学习页；`ExpressionRandomStudyDialog` 与 `expression-random-study-dialog` 的分组固化逻辑收敛（随机学习只负责抽词，不再强制落组）；`ExpressionStudyGuide` 从常驻独立区块改为学习卡内的按需提示按钮（默认收起，点击展开玩法说明）；学习页布局规范对齐系统（容器宽度、留白、卡片节奏与词库页一致）并适度丰富内容；`ExpressionText` 高亮样式对齐参考图（蓝色加粗、无底色）并补守卫用例；相关测试与文档同步。
- 不包含：改动记忆/复习算法契约与 `resolveStudyItems` 抽样口径；改动 `random` scope 的 URL 兼容解析；改动词库列表、推荐分组、管理分组等其它功能；改动闪卡/填空/听写三种玩法本身的行为。

## 实施任务

- [x] 随机学习一键化：面板「随机抽一组」去掉条数/分组目标弹窗，直接走 `scope.kind=random`（默认条数，如 10）抽词进入学习页；`ExpressionRandomStudyDialog` 收敛或删除，`onStartRandom` 简化为仅传 count，不再写分组
- [x] 闪卡/填空/听写玩法说明从常驻独立区块（`ExpressionStudyGuide`）改为学习卡内的按需提示按钮（默认收起，点击展开玩法/评分说明），保留窄屏自动收起行为
- [x] 学习页布局规范对齐系统（容器宽度、留白、卡片节奏与词库页/复习页一致），并适度丰富内容（进度、范围标签、评分分布小结等），降低「还要自己学怎么用」的认知成本
- [x] 高亮效果对齐参考图（蓝色加粗、无底色，统一 `ExpressionText` 与参考一致）并补守卫用例
- [x] 补测试 + 文档 + 归档

## 完成标准

- [x] code: 实现、迁移和文档均已完成，不保留双轨逻辑
- [x] linter_result: `corepack pnpm lint` 退出码为 0
- [x] unit_test_result: 新增边界测试通过，关键包覆盖率不低于 90%
- [x] func_test_result: 对应场景完成真实进程验证
- [x] status: 5 项任务完成；随机=纯抽词不建组（用户已在计划风险中确认可接受），Popover 按需按钮默认收起；高亮样式本就符合参考仅补守卫；视觉已用 headless Chrome CDP 在 390/1280 验证三 scope 无溢出；回滚为逐文件 git revert，无 schema 迁移。

## 风险与回滚

- 风险：随机去掉分组固化后，随机抽出的词不再落库分组（只走 `random` scope 抽词），需确认产品可接受「随机=纯抽词、不建组」；若仍需固化，则保留新建/复用分组但把条数固定、默认即可。`ExpressionRandomStudyDialog` 若被其它入口引用，需同步清理引用点。引导改为按需提示按钮后首次上手可发现性下降，需保留默认文案提示入口。
- 回滚：改动集中在 `features/expressions`、`components/expression-text`、测试与 docs，逐文件 git revert 即可，无 schema 迁移；`random` scope URL 解析保持不变以保证历史链接兼容。

## 进度日志

- 2026-11-21 21:48:03 创建（planing）
- 2026-11-21 22:00:24 完成 #1 随机学习一键化：面板「随机抽一组」去掉条数/分组目标弹窗，直接走 `scope.kind=random`（默认条数，如 10）抽词进入学习页；`ExpressionRandomStudyDialog` 收敛或删除，`onStartRandom` 简化为仅传 count，不再写分组
- 2026-11-21 22:00:24 随机学习一键化：删除 ExpressionRandomStudyDialog 及测试、sampleStudyIdentities 及测试；面板「随机抽10条」直接走 random scope；workspace 移除 startRandom/onStartRandom
- 2026-11-21 22:06:28 完成 #2 闪卡/填空/听写玩法说明从常驻独立区块（`ExpressionStudyGuide`）改为学习卡内的按需提示按钮（默认收起，点击展开玩法/评分说明），保留窄屏自动收起行为
- 2026-11-21 22:06:28 完成 #3 学习页布局规范对齐系统（容器宽度、留白、卡片节奏与词库页/复习页一致），并适度丰富内容（进度、范围标签、评分分布小结等），降低「还要自己学怎么用」的认知成本
- 2026-11-21 22:06:28 完成 #4 高亮效果对齐参考图（蓝色加粗、无底色，统一 `ExpressionText` 与参考一致）并补守卫用例
- 2026-11-21 22:06:28 引导改为卡内按需 Popover 按钮(默认收起)；学习路由加 PageHeading+范围/模式徽章+有界高度对齐系统；高亮样式已符合蓝色加粗无底色，补 ExpressionText 守卫用例
- 2026-11-21 22:17:13 完成 #5 补测试 + 文档 + 归档
- 2026-11-21 22:17:13 docs 同步；vitest 104 文件/867 用例通过；pnpm typecheck/lint/build 通过；headless Chrome CDP 验证 random/filtered/ebbinghaus 三 scope 在 390/1280 无溢出，PageHeading 与玩法说明按钮渲染正常
- 2026-11-21 22:17:51 完成 #6 code: 实现、迁移和文档均已完成，不保留双轨逻辑
- 2026-11-21 22:17:51 完成 #7 linter_result: `corepack pnpm lint` 退出码为 0
- 2026-11-21 22:17:51 完成 #8 unit_test_result: 新增边界测试通过，关键包覆盖率不低于 90%
- 2026-11-21 22:17:51 完成 #9 func_test_result: 对应场景完成真实进程验证
- 2026-11-21 22:17:51 完成 #10 status: 5 项任务完成；随机=纯抽词不建组（用户已在计划风险中确认可接受），Popover 按需按钮默认收起；高亮样式本就符合参考仅补守卫；视觉已用 headless Chrome CDP 在 390/1280 验证三 scope 无溢出；回滚为逐文件 git revert，无 schema 迁移。
- 2026-11-21 22:17:51 code+docs done; pnpm lint exit 0 (2 pre-existing warnings); pnpm typecheck pass; vitest 104 files/867 tests pass; pnpm build pass; CDP visual verified 390/1280; status recorded
- 2026-11-21 22:17:51 归档：任务与完成标准全部满足
