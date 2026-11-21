---
title: 学习交互深度打磨与视觉验证
priority: P1
created: 2026-11-21 18:20:00
updated: 2026-11-21 21:03:31
---

# 学习交互深度打磨与视觉验证

## 目标

继续处理「深度交互」板块遗留：评分后即时反馈、键盘流矩阵补全、跨设备同名分组无损提示，并尽可能自动化验证 390px 横向溢出。

## 范围

- 包含：`ExpressionStudyWorkspace` 评分后 toast 反馈与听写重听快捷键；学习面板同名分组提示；`@/lib/memory` 暴露同名检测；组件测试；docs 同步。
- 不包含：merge 层按名称去重（有损，保持按 id）；改动记忆算法与数据契约。

## 实施任务

- [x] 评分后 toast 即时反馈（写入长期记忆+下次到期）
- [x] 键盘流矩阵补全：听写重听、评分后焦点复位
- [x] 跨设备同名分组无损 UI 提示（不丢数据）
- [x] 用 headless Chrome 自动化验证 390px 无横向溢出（环境有 Chrome 无自动化库，能跑则跑，不能则如实记录）
- [x] 补测试 + 文档 + 归档 + push

## 完成标准

- [x] code: 实现、迁移和文档均已完成，不保留双轨逻辑
- [x] linter_result: `corepack pnpm lint` 退出码为 0
- [x] unit_test_result: 新增边界测试通过
- [x] func_test_result: `pnpm build` + `pnpm check` 通过
- [x] status: 5 项任务完成；同名分组只读提示不自动合并保数据；toast/键盘/引导均可回滚；视觉验证已用 headless Chrome + CDP 在 390/1280px 真实执行（无横向溢出、390px 引导折叠/展开正常）；未覆盖仅真实麦克风与 live provider。

## 风险与回滚

- 风险：toast 在 jsdom 需 mock sonner 否则测试噪音；同名提示只在展示层不自动合并，保持数据完整。
- 回滚：改动集中在 features/lib/tests/docs，逐文件 git revert 即可，无 schema 迁移。

## 进度日志

- 2026-11-21 18:20:00 创建（planing）
- 2026-11-21 20:46:02 完成 #1 评分后 toast 即时反馈（写入长期记忆+下次到期）
- 2026-11-21 20:46:02 完成 #2 键盘流矩阵补全：听写重听、评分后焦点复位
- 2026-11-21 20:46:02 评分后 toast 即时反馈(写入长期记忆+到期)；听写结果空格重听+键盘闭环，含反馈断言
- 2026-11-21 20:50:04 完成 #3 跨设备同名分组无损 UI 提示（不丢数据）
- 2026-11-21 20:50:04 跨设备同名分组用 findDuplicateGroupNames 在面板做只读提示，不自动合并以保数据；含9条state用例
- 2026-11-21 20:57:56 完成 #4 用 headless Chrome 自动化验证 390px 无横向溢出（环境有 Chrome 无自动化库，能跑则跑，不能则如实记录）
- 2026-11-21 20:57:56 用 headless Chrome + CDP 验证：expressions/study/ebbinghaus/review 在 390px 与 1280px 均 scrollWidth==clientWidth 无横向溢出；390px 引导默认折叠、点击可展开（before=false after=true）；初始因旧端口 404 已重启修正
- 2026-11-21 21:03:31 完成 #5 补测试 + 文档 + 归档 + push
- 2026-11-21 21:03:31 docs 同步；vitest 104 文件/867 用例通过；pnpm lint/typecheck/build 通过；headless CDP 视觉验证 390/1280 无溢出
- 2026-11-21 21:03:31 完成 #6 code: 实现、迁移和文档均已完成，不保留双轨逻辑
- 2026-11-21 21:03:31 完成 #7 linter_result: `corepack pnpm lint` 退出码为 0
- 2026-11-21 21:03:31 完成 #8 unit_test_result: 新增边界测试通过
- 2026-11-21 21:03:31 完成 #9 func_test_result: `pnpm build` + `pnpm check` 通过
- 2026-11-21 21:03:31 完成 #10 status: 5 项任务完成；同名分组只读提示不自动合并保数据；toast/键盘/引导均可回滚；视觉验证已用 headless Chrome + CDP 在 390/1280px 真实执行（无横向溢出、390px 引导折叠/展开正常）；未覆盖仅真实麦克风与 live provider。
- 2026-11-21 21:03:31 code+docs done; lint/typecheck pass; vitest 104/867 pass; build pass; status recorded
- 2026-11-21 21:03:31 归档：任务与完成标准全部满足
