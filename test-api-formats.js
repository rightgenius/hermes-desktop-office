// Test script to verify API connection behavior
// This simulates different request formats to find what works

const https = require('https');

// Test configuration - replace with your actual values
const TEST_CONFIG = {
  baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
  apiKey: 'sk-sp-424b3f6518564b19b961fca94d837774', // Replace with your actual key
};

// Different request formats to test
const TEST_CASES = [
  {
    name: 'Basic OpenAI format (current)',
    buildRequest: (config) => {
      const url = new URL(config.baseUrl + '/chat/completions');
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: 'qwen3.6-plus',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      };
    },
  },
  {
    name: 'With User-Agent: hermes-agent',
    buildRequest: (config) => {
      const url = new URL(config.baseUrl + '/chat/completions');
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'User-Agent': 'hermes-agent/1.0',
        },
        body: JSON.stringify({
          model: 'qwen3.6-plus',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      };
    },
  },
  {
    name: 'With coding model',
    buildRequest: (config) => {
      const url = new URL(config.baseUrl + '/chat/completions');
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'User-Agent': 'hermes-agent/1.0',
        },
        body: JSON.stringify({
          model: 'qwen-coder-plus',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      };
    },
  },
  {
    name: 'With custom headers for coding agent',
    buildRequest: (config) => {
      const url = new URL(config.baseUrl + '/chat/completions');
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'User-Agent': 'hermes-agent/1.0',
          'X-Agent-Type': 'coding',
        },
        body: JSON.stringify({
          model: 'qwen3.6-plus',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      };
    },
  },
  {
    name: 'Using /v1/chat/completions path explicitly',
    buildRequest: (config) => {
      const cleanBase = config.baseUrl.replace(/\/$/, '');
      const url = new URL(cleanBase + '/chat/completions');
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'User-Agent': 'hermes-agent/1.0',
        },
        body: JSON.stringify({
          model: 'qwen3.6-plus',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      };
    },
  },
];

async function runTest(testCase, config) {
  return new Promise((resolve) => {
    const { url, headers, body } = testCase.buildRequest(config);
    
    console.log(`\n=== Testing: ${testCase.name} ===`);
    console.log(`URL: ${url.href}`);
    console.log(`Headers:`, JSON.stringify(headers, null, 2));
    console.log(`Body:`, body);
    
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode} ${res.statusMessage}`);
        console.log(`Response:`, responseBody.substring(0, 500));
        resolve({
          success: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode,
          body: responseBody,
        });
      });
    });
    
    req.on('error', (err) => {
      console.log(`Error: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.log('Timeout');
      resolve({ success: false, error: 'Timeout' });
    });
    
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Testing API connection formats...\n');
  
  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase, TEST_CONFIG);
    if (result.success) {
      console.log(`\n✅ SUCCESS: ${testCase.name} works!`);
      break;
    }
    // Wait a bit between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch(console.error);
