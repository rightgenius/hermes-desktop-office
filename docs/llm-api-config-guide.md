# 各大模型厂商 API 端点速查表

> 整理时间：2026 年 5 月 | 端点信息经官方文档验证

---

## 一、OpenAI 兼容格式（`/v1/chat/completions`）

### 国外厂商

| 厂商 | 版本 | base_url | 环境变量 | 可用模型 | 说明 |
|------|------|---------|---------|---------|------|
| **OpenAI** | 官方 | `https://api.openai.com/v1` | `OPENAI_API_KEY` | `gpt-5.5`, `gpt-5.4-thinking`, `gpt-5.4-pro`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `o3`, `o3-mini`, `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` | — |
| **DeepSeek** | 按量 | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | `deepseek-v4-pro`, `deepseek-v4-flash` | V4 已支持 1M 上下文；旧名 `deepseek-chat` / `deepseek-reasoner` 将于 2026-07-24 废弃 |
| **xAI Grok** | 官方 | `https://api.x.ai/v1` | `XAI_API_KEY` | `grok-4.3`, `grok-3`, `grok-2` | — |
| **Google Gemini** | OpenAI 兼容 | `https://generativelanguage.googleapis.com/v1beta/openai` | `GOOGLE_API_KEY` | `gemini-3.1-pro`, `gemini-3.0-pro`, `gemini-3.0-flash`, `gemini-2.5-pro`, `gemini-2.5-flash` | — |
| **NovitaAI** | 按量 | `https://api.novita.ai/v3/openai` | `NOVITA_API_KEY` | `联系我们获取` | — |
| **HuggingFace** | 官方 | `https://router.huggingface.co/v1` | `HF_TOKEN` | 聚合 HuggingFace 推理端模型 | — |
| **OpenRouter** | 官方 | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `google/gemini-3.5-flash`, `anthropic/claude-opus-4.7-fast`, `openai/gpt-5.5-pro`, `deepseek/deepseek-v4-pro`, `qwen/qwen3.6-plus`, `xiaomi/mimo-v2.5-pro` 等 100+ 模型 | Anthropic 模型在模型 ID 前加 `anthropic/` 前缀，如 `anthropic/claude-sonnet-4.6` |
| **LM Studio** | 本地 | `http://localhost:1234/v1` | `LM_API_KEY`（可选） | 本地部署的模型 | — |
| **Ollama** | 本地 | `http://localhost:11434/v1` | — | `llama`, `qwen`, `mistral` 等本地模型 | — |
| **Ollama Cloud** | 云端 | `https://ollama.com/v1` | — | Ollama Cloud 托管模型 | — |
| **AI Gateway** | 官方 | `https://ai-gateway.vercel.sh/v1` | `AI_GATEWAY_API_KEY` | — | — |

### 国内厂商

| 厂商 | 版本 | base_url | 环境变量 | 可用模型 | 说明 |
|------|------|---------|---------|---------|------|
| **阿里 DashScope** | 按量·华北2 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` | `qwen3.6-plus`, `qwen3.6-flash`, `qwen3.6-35b-a3b`, `qwen3.6-max-preview`, `qwen-max`, `qwq-32b` 等 | 国内 |
| **阿里 DashScope** | 按量·新加坡 | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` | 同上 | 国际 |
| **阿里 DashScope** | 按量·美国 | `https://dashscope-us.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` | 同上 | 美国 |
| **阿里 DashScope** | Coding Plan | `https://coding.dashscope.aliyuncs.com/v1` | `DASHSCOPE_API_KEY` | Coding Plan 专属模型 | 编码专用，独立端点 |
| **阿里 DashScope** | Token Plan | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` | Token Plan 专属模型 | 订阅专属 Key |
| **智谱 Z.A.I** | 通用 API | `https://open.bigmodel.cn/api/paas/v4` | `GLM_API_KEY` / `ZAI_API_KEY` | `glm-5`, `glm-5-turbo`, `glm-4.7`, `glm-4.5`, `glm-4-plus` 等 | 按量计费 |
| **智谱 Z.A.I** | Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4` | `GLM_API_KEY` | `glm-5.1`, `glm-5-turbo`, `glm-5`, `glm-4.7` 等 | Coding Plan 订阅专属端点 |
| **Kimi / Moonshot** | 按量·国内 | `https://api.moonshot.cn/v1` | `KIMI_CN_API_KEY` | `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`, `kimi-k2.5`, `kimi-k2` 等 | 国内 |
| **Kimi / Moonshot** | 按量·国际 | `https://api.moonshot.ai/v1` | `KIMI_API_KEY` | 同上 | 国际 |
| **Kimi / Moonshot** | Code 订阅 | `https://api.kimi.com/coding/v1` | `KIMI_API_KEY` | `kimi-k2.5`, `kimi-k2-turbo-preview`, `kimi-k2-thinking-turbo` 等 | Key 前缀 `sk-kimi-*` |
| **MiniMax** | 按量·国际 | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` | `MiniMax-M2.7`, `MiniMax-M2.5` | — |
| **MiniMax** | Token Plan·国际 | `https://api.minimax.io/v1` | `MINIMAX_API_KEY` | `MiniMax-M2.7`, `MiniMax-M2.7-highspeed` | Key 格式 `sk-cp-` 开头，同 OpenAI 端点 |
| **MiniMax** | 按量·国内 | `https://api.minimaxi.com/v1` | `MINIMAX_CN_API_KEY` | `MiniMax-M2.7`, `MiniMax-M2.5` | — |
| **StepFun** | 按量 | `https://api.stepfun.com/v1` | `STEPFUN_API_KEY` | `step-3.5-flash`, `step-3-flash` 等 | — |
| **StepFun** | Step Plan | `https://api.stepfun.com/step_plan/v1` | `STEPFUN_API_KEY` | `step-3.5-flash`, `step-3.5-plus`, `step-3.5-pro`, `step-3.5-max` 等 | 订阅专属端点 |
| **小米 MiMo** | 按量 | `https://api.xiaomimimo.com/v1` | `XIAOMI_API_KEY` | `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-flash` | — |
| **小米 MiMo** | Token Plan | `https://token-plan-cn.xiaomimimo.com/v1` | `XIAOMI_API_KEY` | `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-pro`, `mimo-v2-omni` | Key 前缀 `tp-*`，独立端点 |

---

## 二、Anthropic 兼容格式（`/v1/messages`）

### 国外厂商

| 厂商 | 版本 | base_url | 环境变量 | 可用模型 | 说明 |
|------|------|---------|---------|---------|------|
| **Anthropic** | 官方 | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | `claude-opus-4.7`, `claude-sonnet-4.6`, `claude-haiku-4.5` | 2026-04-16 发布 Opus 4.7，支持 1M 上下文 |
| **DeepSeek** | 按量 | `https://api.deepseek.com/anthropic` | `DEEPSEEK_API_KEY` | `deepseek-v4-pro`, `deepseek-v4-flash` | 同一 Key，支持 Thinking 模式 |
| **NovitaAI** | 按量 | `https://api.novita.ai/v3/anthropic` | `NOVITA_API_KEY` | `联系我们获取` | — |
| **OpenRouter** | 官方 | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | Anthropic 模型填 `anthropic/claude-opus-4.7` 等 | Anthropic 模型走此路径 |

### 国内厂商（Anthropic 路径）

| 厂商 | 版本 | base_url | 环境变量 | 可用模型 | 说明 |
|------|------|---------|---------|---------|------|
| **阿里 DashScope** | 按量·华北2 | `https://dashscope.aliyuncs.com/apps/anthropic` | `DASHSCOPE_API_KEY` | `qwen3.6-plus`, `qwen3.6-flash` 等 | 国内 |
| **阿里 DashScope** | 按量·新加坡 | `https://dashscope-intl.aliyuncs.com/apps/anthropic` | `DASHSCOPE_API_KEY` | 同上 | 国际 |
| **阿里 DashScope** | 按量·美国 | `https://dashscope-us.aliyuncs.com/apps/anthropic` | `DASHSCOPE_API_KEY` | 同上 | 美国 |
| **阿里 DashScope** | Coding Plan | `https://coding.dashscope.aliyuncs.com/apps/anthropic` | `DASHSCOPE_API_KEY` | Coding Plan 专属模型 | 编码专用 |
| **阿里 DashScope** | Token Plan | `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic` | `DASHSCOPE_API_KEY` | Token Plan 专属模型 | 订阅专属 Key |
| **智谱 Z.A.I** | Coding Plan | `https://open.bigmodel.cn/api/anthropic` | `GLM_API_KEY` / `ZAI_API_KEY` | `glm-5.1`, `glm-5-turbo`, `glm-5`, `glm-4.7` | Claude Code / OpenClaw 等工具专用，需订阅 Coding Plan |
| **Kimi / Moonshot** | Code 订阅 | `https://api.kimi.com/coding/` | `KIMI_API_KEY` | `kimi-k2.5`, `kimi-k2-turbo-preview`, `kimi-k2-thinking-turbo` | Key 前缀 `sk-kimi-*` |
| **MiniMax** | 按量·国际 | `https://api.minimax.io/anthropic` | `MINIMAX_API_KEY` | `MiniMax-M2.7`, `MiniMax-M2.5` | — |
| **MiniMax** | 按量·国内 | `https://api.minimaxi.com/anthropic` | `MINIMAX_CN_API_KEY` | `MiniMax-M2.7`, `MiniMax-M2.5` | — |
| **MiniMax** | Token Plan | `https://api.minimax.io/anthropic` | `MINIMAX_API_KEY` | `MiniMax-M2.7`, `MiniMax-M2.7-highspeed` | Key 格式 `sk-cp-` 开头，OAuth 订阅走此路径 |
| **StepFun** | Step Plan | `https://api.stepfun.com/step_plan` | `STEPFUN_API_KEY` | `step-3.5-flash`, `step-3.5-plus`, `step-3.5-pro`, `step-3.5-max` | 注意不带 `/v1` 后缀，Claude Code 自动拼接 |
| **小米 MiMo** | 按量 | `https://api.xiaomimimo.com/v1` | `XIAOMI_API_KEY` | `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-flash` | 协议兼容 |
| **小米 MiMo** | Token Plan | `https://token-plan-cn.xiaomimimo.com/v1` | `XIAOMI_API_KEY` | `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-pro`, `mimo-v2-omni` | Key 前缀 `tp-*` |

---

## 三、环境变量速查（~/.hermes/.env）

```bash
# 海外
OPENAI_API_KEY=sk-proj-xxx
OPENROUTER_API_KEY=sk-or-v1-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
DEEPSEEK_API_KEY=sk-xxx
GOOGLE_API_KEY=AIzaSyxxx
XAI_API_KEY=xai-xxx
HF_TOKEN=hf_xxx
MINIMAX_API_KEY=xxx
MINIMAX_CN_API_KEY=xxx
NOVITA_API_KEY=xxx

# 国内
DASHSCOPE_API_KEY=sk-xxx          # 阿里 DashScope
GLM_API_KEY=xxx.xxx               # 智谱 Z.A.I/GLM（也支持 ZAI_API_KEY）
KIMI_API_KEY=sk-xxx               # Kimi Code 订阅（sk-kimi-* 前缀）
KIMI_CN_API_KEY=sk-xxx           # Kimi 国内按量
STEPFUN_API_KEY=xxx              # 阶跃星辰
XIAOMI_API_KEY=xxx               # 小米 MiMo（按量）；Token Plan Key 格式为 tp-*

# 其他
AI_GATEWAY_API_KEY=xxx           # Vercel AI Gateway
```

---

## 附：模型快速对照

| 模型 | 推荐端点 | 模型 ID |
|------|---------|---------|
| GPT-5.5（最新旗舰） | OpenAI `/v1` | `gpt-5.5` |
| Claude Opus 4.7（最新旗舰） | Anthropic `/v1` 或 OpenRouter | `claude-opus-4.7` |
| Claude Sonnet 4.6（均衡首选） | Anthropic `/v1` 或 OpenRouter | `claude-sonnet-4.6` |
| DeepSeek V4-Pro（高性价比旗舰） | DeepSeek `/v1` 或 `/anthropic` | `deepseek-v4-pro` |
| DeepSeek V4-Flash（高性价比轻量） | DeepSeek `/v1` 或 `/anthropic` | `deepseek-v4-flash` |
| Gemini 3.1 Pro（Google 旗舰） | OpenAI 兼容 `/v1beta/openai` | `gemini-3.1-pro` |
| Qwen 3.6 Plus（通义旗舰） | 阿里 DashScope `/compatible-mode/v1` | `qwen3.6-plus` |
| GLM-5.1（智谱最新旗舰） | 智谱 Coding Plan `/anthropic` 或 `/coding/paas/v4` | `glm-5.1` |
| Kimi K2.5（Kimi Code 旗舰） | Kimi Code 订阅 `/coding/v1` 或 `/coding/` | `kimi-k2.5` |
| MiniMax-M2.7（MiniMax 旗舰） | MiniMax `/v1` 或 `/anthropic` | `MiniMax-M2.7` |
| Step 3.5 Flash（StepFun 旗舰） | StepFun Step Plan `/step_plan/v1` 或 `/step_plan` | `step-3.5-flash` |
| MiMo-V2.5-Pro（小米最新旗舰） | 小米按量 `/v1` 或 Token Plan `/v1` | `mimo-v2.5-pro` |