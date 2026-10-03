# 长期记忆评估

> 状态：评估工具与数据协议已实现；真实数据实验等待隔离环境。

## 目标

评估分成两个阶段，不能混用结论：

1. 离线排序模拟：在同一批完整候选及人工相关性标注上比较相似度阈值、返回数量和时间
   衰减半衰期。
2. 真实 HNSW 运行：在同一份去标识化查询集上分别构建候选索引，记录实际召回结果和延迟，
   再比较 `m`、`ef_construction` 与 `ef_search`。

离线模拟不能证明 HNSW 参数优劣。合成样例只能验证工具行为，也不能作为生产参数依据。

## 运行

仓库包含不含真实用户数据的固定样例：

```bash
pnpm memory:evaluate -- \
  --dataset docs/examples/memory-evaluation.sample.json \
  --at 2026-08-29T08:00:00.000Z
```

生成 JSON 供发布系统读取：

```bash
pnpm memory:evaluate -- \
  --dataset /secure/path/production-sanitized.json \
  --format json \
  --output .tmp-memory-evaluation.json
```

可通过 `--thresholds 0.2,0.3,0.4`、`--limits 3,5,8` 和
`--half-lives none,30,90` 覆盖默认参数网格。`--at` 固定评估时间，确保时间衰减结果可重复。

`pnpm memory:test` 验证数据校验、排序、指标和参数网格；它已包含在 `pnpm test` 和
`pnpm check` 中。

## 数据协议

数据集版本固定为 `1`：

```json
{
  "version": 1,
  "name": "sanitized production evaluation",
  "kind": "production-sanitized",
  "queries": [
    {
      "id": "query-id",
      "sceneId": "restaurant",
      "input": "How can I ask for water politely?",
      "expectedRelevantIds": ["memory-a"],
      "expectedTransferIds": ["memory-a"],
      "candidates": [
        {
          "id": "memory-a",
          "sceneId": "coffee",
          "targetSceneIds": ["restaurant"],
          "similarity": 0.78,
          "strength": 42,
          "updatedAt": "2026-08-20T08:00:00.000Z"
        }
      ]
    }
  ],
  "observedRuns": [
    {
      "id": "hnsw-m16-efc64-efs40",
      "configuration": {
        "hnswM": 16,
        "hnswEfConstruction": 64,
        "hnswEfSearch": 40,
        "minSimilarity": 0.2,
        "matchCount": 5,
        "decayHalfLifeDays": null
      },
      "results": [
        {
          "queryId": "query-id",
          "retrievedIds": ["memory-a"],
          "promptedIds": ["memory-a"],
          "successfulTransferIds": ["memory-a"],
          "latencyMs": 18
        }
      ]
    }
  ]
}
```

数据校验会拒绝重复 ID、未知候选引用、无效分数和日期，以及未经过提示却被标记为成功迁移
的记录。

## 标注规则

- `expectedRelevantIds`：两名标注者独立判断能否帮助当前输入；分歧由第三人裁决。
- `expectedTransferIds`：相关记忆中，来源场景不同且能在当前场景自然复用的表达。
- `promptedIds`：产品实际向学习者展示或由模型明确触发找回的记忆，不等同于后台召回结果。
- `successfulTransferIds`：学习者在提示后的当前会话中正确使用对应表达；必须属于
  `promptedIds`。
- `input`、候选内容和 ID 在进入仓库或共享报告前必须去标识化；真实评估集存放在受控位置，
  不提交原始对话。

每个查询至少包含一个相关项。评估集需要覆盖同场景找回、跨场景迁移、近义干扰、无关高分
候选、陈旧记忆和弱记忆。

## 指标

| 指标 | 定义 |
| --- | --- |
| Precision | 每个查询中召回的相关项比例，再做宏平均 |
| Recall | 每个查询中已找回的标注相关项比例，再做宏平均 |
| MRR | 第一个相关项排名倒数的宏平均 |
| Transfer opportunity recall | 标注迁移项被召回的比例 |
| Transfer success rate | 正确迁移数 / 实际提示的有效迁移项数 |
| Error prompt rate | 提示但不属于标注相关项的比例 |
| p50 / p95 | 真实运行的端到端检索延迟 |

无迁移标注或未触发提示的查询不进入对应指标分母，报告显示 `n/a`，不会按零分处理。

## HNSW 实验

真实参数实验必须固定数据库快照、embedding 模型、查询集和 PostgreSQL/pgvector 版本。
每组参数先重建索引并预热，再随机执行查询，记录至少三轮结果。报告至少包含：

- 数据规模、向量维度、机器规格、索引大小和构建耗时。
- `m`、`ef_construction`、`ef_search`、相似度阈值和返回数量。
- 相对精确扫描的 Recall、MRR、p50 和 p95。
- 迁移成功率及错误提示率。

只有真实去标识化数据同时满足发布门槛时才修改生产 SQL。门槛必须由产品和数据负责人基于
首个基线报告确定，不能从合成样例推导。
