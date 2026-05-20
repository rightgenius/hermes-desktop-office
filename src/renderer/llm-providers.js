// src/renderer/llm-providers.js
// LLM Provider data model — loaded as regular script (no ES modules)

// API 格式常量
const API_FORMAT_OPENAI = 'openai';
const API_FORMAT_ANTHROPIC = 'anthropic';

// API 格式选项
const API_FORMATS = [
  { value: API_FORMAT_OPENAI, label: 'OpenAI 兼容格式' },
  { value: API_FORMAT_ANTHROPIC, label: 'Anthropic 兼容格式' },
];

// Provider 数据模型
const PROVIDERS = [
  // ===== OpenAI 兼容格式 =====
  {
    key: 'openai',
    label: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY',
    envLabel: '需要 OPENAI_API_KEY',
    models: ['gpt-5.5', 'gpt-5.4-thinking', 'gpt-5.4-pro', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3', 'o3-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
  },
  {
    key: 'deepseek_openai',
    label: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    envVar: 'DEEPSEEK_API_KEY',
    envLabel: '需要 DEEPSEEK_API_KEY',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    key: 'gemini',
    label: 'Google Gemini',
    format: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envVar: 'GOOGLE_API_KEY',
    envLabel: '需要 GOOGLE_API_KEY',
    models: ['gemini-3.1-pro', 'gemini-3.0-pro', 'gemini-3.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    key: 'xai',
    label: 'xAI Grok',
    format: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    envVar: 'XAI_API_KEY',
    envLabel: '需要 XAI_API_KEY',
    models: ['grok-4.3', 'grok-3', 'grok-2'],
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    envVar: 'OPENROUTER_API_KEY',
    envLabel: '需要 OPENROUTER_API_KEY',
    models: ['google/gemini-3.5-flash', 'anthropic/claude-opus-4.7-fast', 'openai/gpt-5.5-pro', 'deepseek/deepseek-v4-pro', 'qwen/qwen3.6-plus', 'xiaomi/mimo-v2.5-pro'],
  },
  {
    key: 'huggingface',
    label: 'HuggingFace',
    format: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    envVar: 'HF_TOKEN',
    envLabel: '需要 HF_TOKEN',
    models: [],
  },
  {
    key: 'novita_openai',
    label: 'NovitaAI',
    format: 'openai',
    baseUrl: 'https://api.novita.ai/v3/openai',
    envVar: 'NOVITA_API_KEY',
    envLabel: '需要 NOVITA_API_KEY',
    models: [],
  },
  {
    key: 'ai-gateway',
    label: 'AI Gateway',
    format: 'openai',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    envVar: 'AI_GATEWAY_API_KEY',
    envLabel: '需要 AI_GATEWAY_API_KEY',
    models: [],
  },
  {
    key: 'lm-studio',
    label: 'LM Studio (本地)',
    format: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    envVar: 'LM_API_KEY',
    envLabel: '需要 LM_API_KEY（可选）',
    models: [],
  },
  {
    key: 'ollama-local',
    label: 'Ollama (本地)',
    format: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    envVar: '',
    envLabel: '无需 API Key',
    models: ['llama3', 'qwen2.5', 'mistral'],
  },
  {
    key: 'ollama-cloud',
    label: 'Ollama Cloud',
    format: 'openai',
    baseUrl: 'https://ollama.com/v1',
    envVar: '',
    envLabel: '无需 API Key',
    models: [],
  },
  {
    key: 'dashscope',
    label: '阿里 DashScope',
    format: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envVar: 'DASHSCOPE_API_KEY',
    envLabel: '需要 DASHSCOPE_API_KEY',
    models: ['qwen3.6-plus', 'qwen3.6-flash', 'qwen3.6-35b-a3b', 'qwen3.6-max-preview', 'qwen-max', 'qwq-32b'],
    regions: [
      { key: 'cn-beijing', label: '华北2 按量', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      { key: 'singapore', label: '新加坡 按量', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
      { key: 'us', label: '美国 按量', baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1' },
      { key: 'coding', label: 'Coding Plan', baseUrl: 'https://coding.dashscope.aliyuncs.com/v1' },
      { key: 'token-plan', label: 'Token Plan', baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' },
    ],
  },
  {
    key: 'zhipuai',
    label: '智谱 Z.A.I',
    format: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    envVar: 'GLM_API_KEY',
    envLabel: '需要 GLM_API_KEY 或 ZAI_API_KEY',
    models: ['glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.5', 'glm-4-plus'],
    regions: [
      { key: 'general', label: '通用 API', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
      { key: 'coding', label: 'Coding Plan', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4' },
    ],
  },
  {
    key: 'moonshot',
    label: 'Kimi / Moonshot',
    format: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    envVar: 'KIMI_CN_API_KEY',
    envLabel: '需要 KIMI_CN_API_KEY（国内）或 KIMI_API_KEY（国际）',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2.5', 'kimi-k2'],
    regions: [
      { key: 'cn', label: '国内 按量', baseUrl: 'https://api.moonshot.cn/v1', envVar: 'KIMI_CN_API_KEY' },
      { key: 'intl', label: '国际 按量', baseUrl: 'https://api.moonshot.ai/v1', envVar: 'KIMI_API_KEY' },
      { key: 'code', label: 'Code 订阅', baseUrl: 'https://api.kimi.com/coding/v1', envVar: 'KIMI_API_KEY' },
    ],
  },
  {
    key: 'minimax',
    label: 'MiniMax',
    format: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    envVar: 'MINIMAX_API_KEY',
    envLabel: '需要 MINIMAX_API_KEY（国际）或 MINIMAX_CN_API_KEY（国内）',
    models: ['MiniMax-M2.7', 'MiniMax-M2.5'],
    regions: [
      { key: 'intl', label: '国际 按量', baseUrl: 'https://api.minimax.io/v1', envVar: 'MINIMAX_API_KEY' },
      { key: 'cn', label: '国内 按量', baseUrl: 'https://api.minimaxi.com/v1', envVar: 'MINIMAX_CN_API_KEY' },
      { key: 'token-plan', label: 'Token Plan (国际)', baseUrl: 'https://api.minimax.io/v1', envVar: 'MINIMAX_API_KEY' },
    ],
  },
  {
    key: 'stepfun',
    label: 'StepFun',
    format: 'openai',
    baseUrl: 'https://api.stepfun.com/v1',
    envVar: 'STEPFUN_API_KEY',
    envLabel: '需要 STEPFUN_API_KEY',
    models: ['step-3.5-flash', 'step-3-flash'],
    regions: [
      { key: 'payg', label: '按量', baseUrl: 'https://api.stepfun.com/v1' },
      { key: 'step-plan', label: 'Step Plan', baseUrl: 'https://api.stepfun.com/step_plan/v1' },
    ],
  },
  {
    key: 'xiaomi',
    label: '小米 MiMo',
    format: 'openai',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    envVar: 'XIAOMI_API_KEY',
    envLabel: '需要 XIAOMI_API_KEY',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-flash'],
    regions: [
      { key: 'payg', label: '按量', baseUrl: 'https://api.xiaomimimo.com/v1' },
      { key: 'token-plan', label: 'Token Plan', baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1' },
    ],
  },
  // ===== Anthropic 兼容格式 =====
  {
    key: 'anthropic',
    label: 'Anthropic',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    envVar: 'ANTHROPIC_API_KEY',
    envLabel: '需要 ANTHROPIC_API_KEY',
    models: ['claude-opus-4.7', 'claude-sonnet-4.6', 'claude-haiku-4.5'],
  },
  {
    key: 'deepseek_anthropic',
    label: 'DeepSeek (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.deepseek.com/anthropic',
    envVar: 'DEEPSEEK_API_KEY',
    envLabel: '需要 DEEPSEEK_API_KEY',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    key: 'novita_anthropic',
    label: 'NovitaAI (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.novita.ai/v3/anthropic',
    envVar: 'NOVITA_API_KEY',
    envLabel: '需要 NOVITA_API_KEY',
    models: [],
  },
  {
    key: 'dashscope_anthropic',
    label: '阿里 DashScope (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    envVar: 'DASHSCOPE_API_KEY',
    envLabel: '需要 DASHSCOPE_API_KEY',
    models: ['qwen3.6-plus', 'qwen3.6-flash'],
    regions: [
      { key: 'cn-beijing', label: '华北2 按量', baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic' },
      { key: 'singapore', label: '新加坡 按量', baseUrl: 'https://dashscope-intl.aliyuncs.com/apps/anthropic' },
      { key: 'us', label: '美国 按量', baseUrl: 'https://dashscope-us.aliyuncs.com/apps/anthropic' },
      { key: 'coding', label: 'Coding Plan', baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic' },
      { key: 'token-plan', label: 'Token Plan', baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic' },
    ],
  },
  {
    key: 'zhipuai_anthropic',
    label: '智谱 Z.A.I (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    envVar: 'GLM_API_KEY',
    envLabel: '需要 GLM_API_KEY（Coding Plan 专用）',
    models: ['glm-5.1', 'glm-5-turbo', 'glm-5', 'glm-4.7'],
    regions: [
      { key: 'coding', label: 'Coding Plan', baseUrl: 'https://open.bigmodel.cn/api/anthropic' },
    ],
  },
  {
    key: 'moonshot_anthropic',
    label: 'Kimi / Moonshot (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.kimi.com/coding/',
    envVar: 'KIMI_API_KEY',
    envLabel: '需要 KIMI_API_KEY（Code 订阅专用）',
    models: ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking-turbo'],
    regions: [
      { key: 'code', label: 'Code 订阅', baseUrl: 'https://api.kimi.com/coding/' },
    ],
  },
  {
    key: 'minimax_anthropic',
    label: 'MiniMax (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.minimax.io/anthropic',
    envVar: 'MINIMAX_API_KEY',
    envLabel: '需要 MINIMAX_API_KEY 或 MINIMAX_CN_API_KEY',
    models: ['MiniMax-M2.7', 'MiniMax-M2.5'],
    regions: [
      { key: 'intl', label: '国际 按量', baseUrl: 'https://api.minimax.io/anthropic', envVar: 'MINIMAX_API_KEY' },
      { key: 'cn', label: '国内 按量', baseUrl: 'https://api.minimaxi.com/anthropic', envVar: 'MINIMAX_CN_API_KEY' },
      { key: 'token-plan', label: 'Token Plan', baseUrl: 'https://api.minimax.io/anthropic', envVar: 'MINIMAX_API_KEY' },
    ],
  },
  {
    key: 'stepfun_anthropic',
    label: 'StepFun (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.stepfun.com/step_plan',
    envVar: 'STEPFUN_API_KEY',
    envLabel: '需要 STEPFUN_API_KEY（Step Plan 专用）',
    models: ['step-3.5-flash', 'step-3.5-plus', 'step-3.5-pro', 'step-3.5-max'],
    regions: [
      { key: 'step-plan', label: 'Step Plan', baseUrl: 'https://api.stepfun.com/step_plan' },
    ],
  },
  {
    key: 'xiaomi_anthropic',
    label: '小米 MiMo (Anthropic)',
    format: 'anthropic',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    envVar: 'XIAOMI_API_KEY',
    envLabel: '需要 XIAOMI_API_KEY',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-flash'],
    regions: [
      { key: 'payg', label: '按量', baseUrl: 'https://api.xiaomimimo.com/v1' },
      { key: 'token-plan', label: 'Token Plan', baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1' },
    ],
  },
  // 自定义端点（两种格式都有）
  {
    key: 'custom_openai',
    label: '自定义端点 (OpenAI)',
    format: 'openai',
    baseUrl: '',
    envVar: '',
    envLabel: '',
    models: [],
    isCustom: true,
  },
  {
    key: 'custom_anthropic',
    label: '自定义端点 (Anthropic)',
    format: 'anthropic',
    baseUrl: '',
    envVar: '',
    envLabel: '',
    models: [],
    isCustom: true,
  },
];

// 旧 provider key 到新 key 的映射（用于向后兼容）
const LEGACY_PROVIDER_MAP = {
  'auto': null,
  'anthropic': 'anthropic',
  'openrouter': 'openrouter',
  'nous': null,
  'gemini': 'gemini',
  'openai': 'openai',
  'deepseek': 'deepseek_openai',
  'zhipuai': 'zhipuai',
  'moonshot': 'moonshot',
  'minimax': 'minimax',
  'custom': null,
};

// 工具函数：根据 API 格式获取对应的 provider 列表
function getProvidersByFormat(format) {
  return PROVIDERS.filter(p => p.format === format);
}

// 工具函数：根据 key 查找 provider
function findProviderByKey(key) {
  return PROVIDERS.find(p => p.key === key) || null;
}

// 工具函数：从旧 provider 值推断新 key
function legacyProviderToKey(legacyProvider, baseUrl) {
  const mapped = LEGACY_PROVIDER_MAP[legacyProvider];
  if (mapped) return mapped;

  if (baseUrl) {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    for (const p of PROVIDERS) {
      if (p.baseUrl && p.baseUrl.replace(/\/$/, '') === cleanUrl) {
        return p.key;
      }
      if (p.regions) {
        for (const r of p.regions) {
          if (r.baseUrl && r.baseUrl.replace(/\/$/, '') === cleanUrl) {
            return p.key;
          }
        }
      }
    }
  }
  return null;
}
