# Agent + RAG 项目难点复盘

## 难点一：避免 Agent 混淆业务 Tool 与知识库 Tool

项目中同时存在两类能力：

- **业务操作 Tool**：查询、修改和删除用户保存在应用中的订阅记录。
- **RAG Tool**：查询 Spotify、Netflix、Adobe Creative Cloud 等平台的取消、退款和账单政策。

最初，当用户提出下面的问题时：

```text
How do I cancel my Spotify Premium subscription?
```

Agent 可能会把“查询 Spotify 官方取消方法”与“删除本应用中的 Spotify 订阅记录”混淆，进而询问用户是否要删除数据库中的数据。

此外，如果只依靠向量相似度搜索，不同平台中语义相近的政策内容可能相互干扰。例如，查询 Spotify 的退款政策时，可能检索到 Netflix 或 Hulu 的相似内容。

## 原因分析

这个问题由以下因素共同造成：

1. 自然语言中的 `cancel subscription` 同时可能表示取消外部平台服务或删除本应用中的记录。
2. 多个 Tool 的名称和描述如果职责边界不清晰，LLM 可能选择错误的 Tool。
3. 向量检索关注语义相似度，不会自动保证结果属于用户指定的平台。
4. Pinecone metadata filter 是严格匹配，因此 `spotify`、`Spotify Premium` 和 `Spotify` 不能被视为同一个值。
5. 在多轮对话中，用户可能只在上一轮提供问题，下一轮才补充平台名称。

## 解决方案

### 1. 明确 Tool 的职责边界

在 System Prompt 和 Tool description 中明确区分：

- `cancel a subscription with the external service`
- `delete a subscription record from this application`

只有当用户明确要求修改本应用中的数据时，Agent 才可以调用写入型 Tool。询问平台政策时，只允许使用知识库检索 Tool。

### 2. 为知识库添加结构化 metadata

为 Pinecone 中的每个 chunk 保存平台、主题和来源等信息：

```ts
{
  serviceName: "Spotify",
  topic: "refund",
  sourceUrl: "...",
  chunkIndex: 0,
}
```

### 3. 使用 metadata filter 缩小检索范围

先由 LLM 从用户问题中识别平台，再在指定平台的记录中执行向量相似度搜索：

```ts
filter: {
  serviceName: { $eq: serviceName },
}
```

这样可以避免不同订阅平台的政策内容互相污染。

### 4. 使用 Zod 枚举规范服务名称

为了让模型生成的 `serviceName` 与 Pinecone 中保存的 metadata 完全一致，Tool schema 使用枚举限制可选值。模型负责把 `spotify premium`、`CHATGPT plus` 或 `Creative Cloud` 等表达归一化成知识库使用的标准名称。

### 5. 处理缺少平台名称的情况

当用户只问：

```text
Can I get a refund after cancelling?
```

由于缺少 `serviceName`，Agent 不应猜测，而应该追问用户具体指哪个平台。下一轮补充平台后，Agent 可以利用对话记忆恢复完整意图，再使用对应的 metadata filter 检索。

### 6. 约束基于检索结果回答

Prompt 要求模型只使用检索结果中明确支持的信息，并始终区分取消外部服务和删除应用内记录。

## 验证方式

除了检查最终回答，还需要记录 Tool 输入和 Pinecone 命中结果，确认查询某个平台时所有命中记录的 `serviceName` 都正确。只观察最终自然语言回答，不能完全证明筛选逻辑正确。

## 难点二：表单输入状态与 Submit 状态分散

在订阅截图识别流程中，输入框位于 `SubscriptionInfoRender`，Submit 按钮位于 `SubscriptionConfirm`，而最终提交数据 `result` 又由更上层的 `SubscriptionsPanel` 管理。

当前数据流相当于：

```text
SubscriptionsPanel
 ├── result                 ← Submit 读取这里
 ├── SubscriptionInfoRender
 │    ├── serviceName       ← Input 使用内部 state
 │    ├── planName
 │    └── ...
 └── SubscriptionConfirm
      └── submit result
```

这会导致同一份表单数据存在两份状态：

- 输入框显示的是 `SubscriptionInfoRender` 内部的 state；
- Submit 使用的是 `SubscriptionsPanel` 中的 `result`。

这类设计容易产生状态不同步、提交旧数据、清空后校验不准确等问题。真正的问题不是 Submit 按钮是否与 Input 在同一个 component，而是同一份业务状态缺少唯一所有者。

## 表单状态的改进方案

### 方案一：由父组件统一管理表单数据

让 `SubscriptionsPanel.result` 成为唯一数据源，`SubscriptionInfoRender` 只负责展示和修改：

```jsx
function updateField(field, value) {
    setResult((previous) => ({
        ...previous,
        [field]: value
    }));
}
```

输入框直接读取 `result`：

```jsx
<input
    value={result?.serviceName ?? ""}
    onChange={(event) => updateField("serviceName", event.target.value)}
/>
```

这样 Input 和 Submit 读取的是同一份数据，Submit 不需要移动到输入框 component 中。

### 方案二：封装一个完整的 Form component

也可以由 `SubscriptionForm` 统一管理 draft，把 `SubscriptionInfoRender` 和 `SubscriptionConfirm` 放在同一个表单组件下，并通过 `onSubmit(draft)` 通知父组件保存。

对于当前项目，方案一改动更小，也更适合作为直接重构方案。

另外，状态更新应该使用函数式写法：

```jsx
setResult((previous) => ({
    ...previous,
    [field]: value
}));
```

而不是依赖闭包中可能已经过时的 `result`：

```jsx
setResult({ ...result, [field]: value });
```

## 面试总结

> In this project, I encountered two data-flow challenges. First, a multi-tool agent could confuse external subscription cancellation with deleting an internal database record, so I separated tool responsibilities, normalized entities, and combined structured metadata filtering with RAG retrieval. Second, the subscription form duplicated state between the input component and its parent, while the submit component consumed the parent state. I refactored the design around a single source of truth: the parent owns the draft data, input components emit field updates, and the submit component validates and persists that same state.

这个问题让我认识到，项目开始时不必预先设计所有细节，但必须尽早明确关键数据的生命周期、唯一所有者以及跨 component 的传递方向。这样后续增加校验、保存、清空或撤销功能时，数据流才不会越来越难维护。
