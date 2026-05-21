// Test script for test-api-connection handler
// Run: node test-api-connection.js

const https = require('https');
const http = require('http');

function buildTestRequest(baseUrl, apiKey, model, apiFormat) {
  const cleanApiKey = (apiKey || '').trim();
  const format = apiFormat || 'openai';
  let requestUrl, headers, payload;

  if (format === 'anthropic') {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const urlObj = new URL(cleanBase);
    const messagesPath = urlObj.pathname && urlObj.pathname !== '/'
      ? cleanBase + '/messages'
      : cleanBase + '/v1/messages';
    requestUrl = new URL(messagesPath);
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': cleanApiKey,
      'anthropic-version': '2023-06-01',
    };
    payload = JSON.stringify({
      model: model || 'claude-sonnet-4.6',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 10,
    });
  } else {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const completionsPath = cleanBase.includes('/chat/completions') ? cleanBase : cleanBase + '/chat/completions';
    requestUrl = new URL(completionsPath);
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cleanApiKey}`,
    };
    payload = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 10,
    });
  }

  return { requestUrl, headers, payload, format };
}

// Test cases
const testCases = [
  {
    name: 'OpenAI - standard',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test123',
    model: 'gpt-4o-mini',
    apiFormat: 'openai',
    expectedPath: '/v1/chat/completions',
    expectedAuth: 'Bearer sk-test123',
  },
  {
    name: 'OpenAI - base URL without /v1',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test123',
    model: 'gpt-4o-mini',
    apiFormat: 'openai',
    expectedPath: '/chat/completions',
    expectedAuth: 'Bearer sk-test123',
  },
  {
    name: 'DashScope - OpenAI compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-dashscope123',
    model: 'qwen3.6-plus',
    apiFormat: 'openai',
    expectedPath: '/compatible-mode/v1/chat/completions',
    expectedAuth: 'Bearer sk-dashscope123',
  },
  {
    name: 'Anthropic - standard',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test123',
    model: 'claude-sonnet-4.6',
    apiFormat: 'anthropic',
    expectedPath: '/v1/messages',
    expectedAuth: 'x-api-key: sk-ant-test123',
  },
  {
    name: 'Anthropic - base URL with /v1',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: 'sk-ant-test123',
    model: 'claude-sonnet-4.6',
    apiFormat: 'anthropic',
    expectedPath: '/v1/messages',
    expectedAuth: 'x-api-key: sk-ant-test123',
  },
  {
    name: 'DashScope - Anthropic format',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    apiKey: 'sk-dashscope123',
    model: 'qwen3.6-plus',
    apiFormat: 'anthropic',
    expectedPath: '/apps/anthropic/messages',
    expectedAuth: 'x-api-key: sk-dashscope123',
  },
  {
    name: 'DeepSeek - OpenAI format',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-deepseek123',
    model: 'deepseek-v4-pro',
    apiFormat: 'openai',
    expectedPath: '/v1/chat/completions',
    expectedAuth: 'Bearer sk-deepseek123',
  },
  {
    name: 'DeepSeek - Anthropic format',
    baseUrl: 'https://api.deepseek.com/anthropic',
    apiKey: 'sk-deepseek123',
    model: 'deepseek-v4-pro',
    apiFormat: 'anthropic',
    expectedPath: '/anthropic/messages',
    expectedAuth: 'x-api-key: sk-deepseek123',
  },
  {
    name: 'Ollama local - HTTP',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'llama3',
    apiFormat: 'openai',
    expectedPath: '/v1/chat/completions',
    expectedAuth: 'Bearer ',
  },
  {
    name: 'Kimi Code - OpenAI format',
    baseUrl: 'https://api.kimi.com/coding/v1',
    apiKey: 'sk-kimi-test123',
    model: 'kimi-k2.5',
    apiFormat: 'openai',
    expectedPath: '/coding/v1/chat/completions',
    expectedAuth: 'Bearer sk-kimi-test123',
  },
];

console.log('Running test-api-connection URL construction tests...\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const { requestUrl, headers, payload } = buildTestRequest(tc.baseUrl, tc.apiKey, tc.model, tc.apiFormat);

  // Check URL path
  const pathOk = requestUrl.pathname === tc.expectedPath;
  
  // Check auth header
  let authOk = false;
  if (tc.apiFormat === 'anthropic') {
    authOk = headers['x-api-key'] === tc.apiKey.trim();
  } else {
    authOk = headers['Authorization'] === tc.expectedAuth;
  }

  // Check payload model
  const payloadData = JSON.parse(payload);
  const modelOk = payloadData.model === (tc.model || (tc.apiFormat === 'anthropic' ? 'claude-sonnet-4.6' : 'gpt-4o-mini'));

  // Check protocol
  const protocolOk = (tc.baseUrl.startsWith('http://') && requestUrl.protocol === 'http:') ||
                     (tc.baseUrl.startsWith('https://') && requestUrl.protocol === 'https:');

  if (pathOk && authOk && modelOk && protocolOk) {
    console.log(`✅ ${tc.name}`);
    passed++;
  } else {
    console.log(`❌ ${tc.name}`);
    if (!pathOk) console.log(`   Path: expected "${tc.expectedPath}", got "${requestUrl.pathname}"`);
    if (!authOk) console.log(`   Auth: expected "${tc.expectedAuth}", got "${tc.apiFormat === 'anthropic' ? headers['x-api-key'] : headers['Authorization']}"`);
    if (!modelOk) console.log(`   Model: expected "${tc.model || (tc.apiFormat === 'anthropic' ? 'claude-sonnet-4.6' : 'gpt-4o-mini')}", got "${payloadData.model}"`);
    if (!protocolOk) console.log(`   Protocol: expected "${tc.baseUrl.startsWith('http://') ? 'http' : 'https'}", got "${requestUrl.protocol}"`);
    failed++;
  }
}

console.log(`\n${passed}/${testCases.length} tests passed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll URL construction tests passed! ✅');
}
