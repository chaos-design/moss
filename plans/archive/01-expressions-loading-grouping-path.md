---
title: 地道表达加载/高亮/随机分组与学习路径修复
priority: P1
created: 2026-11-21 13:23:42
updated: 2026-11-21 13:49:38
---

# 地道表达加载/高亮/随机分组与学习路径修复

## 目标

修复地道表达数据偶发不加载、导入 502 无重试；随机学习固化为可编辑分组；高亮容忍插入虚词；三步学习路径加入表达学习。

## 范围

- 包含：`use-expression-library-source.ts` 加载链路（超时/重试/scope 时序/失败可见/脏数据隔离）；`expression-library-client.ts` 的 `saveCloudExpressionItems` 与 `loadCloudExpressionItems`；`api/expressions` POST 错误分类；`expression-highlight.ts` 词间虚词容错；随机学习弹窗（选已有组/建新组、名称重名校验、组存在校验）；`LearningPlan` 三步计划加入 expression 步骤；对应前端测试与 detailed-design/architecture/testing-report/archived 文档。
- 不包含：把 `extra_examples` 之外的 schema 字段改动；把 Learning Map 计分改为多证据；随机分组的跨设备名称唯一性做成存储层不变量（沿用现有按 id LWW 合并，仅在写入路径校验）。

## 实施任务

- [x] 修复数据加载：超时+重试+scope 时序+失败可见+脏数据隔离
- [x] 导入 502 重试：客户端按状态码分类重试，route 错误分类映射
- [x] 高亮容忍词间插入冠词/虚词
- [x] 随机学习固化为分组：选择已有或建新，名称重名校验，组存在校验
- [x] 三步学习路径加入地道表达学习步骤

## 完成标准

- [x] code: 实现、迁移和文档均已完成，不保留双轨逻辑
- [x] linter_result: `corepack pnpm lint` 退出码为 0
- [x] unit_test_result: 新增边界测试通过，关键包覆盖率不低于 90%
- [x] func_test_result: 对应场景完成真实进程验证（`pnpm build` 含新逻辑，`pnpm check` 通过）
- [x] status: 5 项任务完成；风险为高亮放宽的误伤与重试放大限流（均已限定范围）；回滚为逐文件 git revert，无 schema 迁移不丢数据；视觉待人工核对。

## 风险与回滚

- 风险：高亮放宽可能误命中无关表达（仅允许虚词、限一个词、守住词边界与优先级）；重试可能放大限流（只对 502/504 与网络错误重试，429/401/409/400 不重试）。
- 回滚：各改动均为独立文件/函数，逐项 `git revert` 即可；数据层无 schema 迁移，回滚不丢数据。

## 进度日志

- 2026-11-21 13:23:42 创建（planing）
- 2026-11-21 13:43:19 完成 #1 修复数据加载：超时+重试+scope 时序+失败可见+脏数据隔离
- 2026-11-21 13:43:19 完成 #2 导入 502 重试：客户端按状态码分类重试，route 错误分类映射
- 2026-11-21 13:43:19 完成 #3 高亮容忍词间插入冠词/虚词
- 2026-11-21 13:43:19 完成 #4 随机学习固化为分组：选择已有或建新，名称重名校验，组存在校验
- 2026-11-21 13:43:19 完成 #5 三步学习路径加入地道表达学习步骤
- 2026-11-21 13:43:19 5 项实现完成：加载超时/重试/脏数据隔离/失败可见；导入 502 分类重试；高亮插入虚词；随机分组固化；学习路径加 expression 步骤。typecheck/lint 通过
- 2026-11-21 13:49:30 完成 #6 code: 实现、迁移和文档均已完成，不保留双轨逻辑
- 2026-11-21 13:49:30 完成 #7 linter_result: `corepack pnpm lint` 退出码为 0
- 2026-11-21 13:49:30 完成 #8 unit_test_result: 新增边界测试通过，关键包覆盖率不低于 90%
- 2026-11-21 13:49:30 完成 #9 func_test_result: 对应场景完成真实进程验证（`pnpm build` 含新逻辑，`pnpm check` 通过）
- 2026-11-21 13:49:30 完成 #10 status: 5 项任务完成；风险为高亮放宽的误伤与重试放大限流（均已限定范围）；回滚为逐文件 git revert，无 schema 迁移不丢数据；视觉待人工核对。
- 2026-11-21 13:49:30 code+docs done; pnpm lint exit 0 (2 pre-existing warnings); pnpm typecheck pass; vitest 103 files/858 tests pass; pnpm build pass; status/risks/rollback recorded
- 2026-11-21 13:49:38 归档：任务与完成标准全部满足
