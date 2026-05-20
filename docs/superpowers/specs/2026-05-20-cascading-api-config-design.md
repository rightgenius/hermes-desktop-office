# 级联式 LLM API 配置设计

> 日期：2026-05-20

## 概述

改进设置页面的 AI 模型配置区域和新用户引导向导，通过级联下拉选择减少用户配置负担，同时保留完全自定义能力。

## 设置页改造

### 当前问题
- 服务商下拉框扁平列出，缺少 API 格式维度
- 不同区域/套餐（如 DashScope 华北2 vs Coding Plan）无法区分
- 模型输入为纯文本框，用户不知道可用模型 ID
- 自定义端点隐藏过深

### 新结构

#### 1. API 格式选择（下拉框）
- `OpenAI 兼容格式`（默认）— 对应 `/v1/chat/completions`
- `Anthropic 兼容格式` — 对应 `/v1/messages`

#### 2. 服务商选择（下拉框，根据格式动态过滤）
OpenAI 格式下：
- OpenAI, DeepSeek, Google Gemini, xAI Grok, OpenRouter, 阿里 DashScope, 智谱 Z.A.I, Kimi/Moonshot, MiniMax, StepFun, 小米 MiMo, HuggingFace, NovitaAI, AI Gateway, LM Studio, Ollama (本地), Ollama Cloud, **自定义端点**

Anthropic 格式下：
- Anthropic, DeepSeek, OpenRouter, 阿里 DashScope, 智谱 Z.A.I, Kimi/Moonshot, MiniMax, StepFun, 小米 MiMo, NovitaAI, **自定义端点**

#### 3. 区域/套餐选择（条件显示）
仅当服务商有多个端点变体时显示：
- DashScope：华北2按量、新加坡按量、美国按量、Coding Plan、Token Plan
- Kimi：国内按量、国际按量、Code 订阅
- MiniMax：国际按量、国内按量、Token Plan
- 智谱：通用 API、Coding Plan
- StepFun：按量、Step Plan
- 小米：按量、Token Plan

#### 4. API Key 输入（始终显示）
- hint 文字自动更新，显示对应环境变量名
- 保留显示/隐藏切换按钮

#### 5. 模型选择（combobox：下拉 + 手动输入）
- 根据服务商预填常用模型列表
- 支持手动输入任意模型 ID
- 留空表示自动选择

#### 6. 端点 URL（始终可见，自动填充但可编辑）
- 选择预设服务商时自动填充对应 base_url
- 用户可随时修改，实现"半自定义"
- 选择"自定义端点"时 placeholder 提示手动输入

### 配置保存
新增 `apiFormat` 和 `providerRegion` 字段到 config.json，向后兼容现有 `provider` 和 `baseUrl`。

## 新用户引导改造

### 当前问题
- Wizard 使用旧的 gateway/token 输入方式
- 授权步骤无法跳过，强制用户完成
- 缺少 API 连接验证步骤

### 新步骤（5 步）

#### Step 1: 选择 AI 服务商
- 使用与设置页相同的级联选择器
- 引导文案更友好，解释每个选项

#### Step 2: 验证 API 连接（新增）
- 自动使用已填写的 API Key 和端点测试连接
- 显示成功/失败状态和详细信息
- 允许跳过（用户可能稍后配置）

#### Step 3: 授权飞书
- 保持现有授权逻辑
- **增加"跳过"按钮**

#### Step 4: 授权钉钉
- 保持现有授权逻辑
- **增加"跳过"按钮**

#### Step 5: 完成
- 保持现有逻辑

## 数据模型

```javascript
const LLM_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY',
    envLabel: '需要 OPENAI_API_KEY',
    models: ['gpt-5.5', 'gpt-5.4-thinking', 'gpt-5.4-pro', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
  },
  deepseek_openai: {
    label: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    envVar: 'DEEPSEEK_API_KEY',
    envLabel: '需要 DEEPSEEK_API_KEY',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  // ... 所有 provider 定义
};
```

## 修改文件清单

1. `src/renderer/index.html` — 更新设置页 AI 配置区域 HTML 结构
2. `src/renderer/app.js` — 添加级联选择逻辑、provider 数据模型、更新 wizard
3. `src/main/config-store.js` — 新增 `apiFormat`、`providerRegion` 字段默认值
4. `src/main/ipc-handlers.js` — 确保新字段正确保存/读取

## 向后兼容
- 现有 config.json 中的 `provider` 字段继续有效
- 加载时自动映射到新的级联选择器状态
- 保存时同时写入新旧字段
