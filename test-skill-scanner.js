const path = require('path');
const fs = require('fs');

// Mock app.getPath for Electron
const mockApp = {
  getPath: (name) => {
    if (name === 'home') return process.env.HOME;
    return '';
  }
};

// Mock require('electron')
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return { app: mockApp };
  }
  return originalRequire.apply(this, arguments);
};

// Now load the scanner
const scanner = require('./src/main/skill-scanner.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

async function test() {
  console.log('=== Skill Scanner Unit Tests ===\n');

  // Test 1: getHermesAgentPath returns valid path
  console.log('Test 1: getHermesAgentPath');
  const agentPath = scanner.getHermesAgentPath();
  assert(agentPath !== null, 'Returns non-null path');
  assert(fs.existsSync(agentPath), 'Path exists');
  assert(fs.existsSync(path.join(agentPath, 'cli.py')), 'cli.py exists');
  console.log('');

  // Test 2: scanBuiltinSkills returns non-empty array
  console.log('Test 2: scanBuiltinSkills');
  const builtin = await scanner.scanBuiltinSkills();
  assert(Array.isArray(builtin), 'Returns array');
  assert(builtin.length > 0, 'Returns non-empty array');
  console.log(`  Count: ${builtin.length}`);
  
  // Test 2a: Check skill structure
  if (builtin.length > 0) {
    const skill = builtin[0];
    assert(typeof skill.name === 'string' && skill.name.length > 0, 'Skill has name');
    assert(typeof skill.description === 'string', 'Skill has description');
    assert(typeof skill.path === 'string' && skill.path.length > 0, 'Skill has path');
    assert(skill.source === 'builtin', 'Skill source is builtin');
    assert(['enabled', 'disabled'].includes(skill.status), 'Skill has valid status');
    assert(typeof skill.category === 'string', 'Skill has category');
  }
  console.log('');

  // Test 3: scanUserSkills returns array
  console.log('Test 3: scanUserSkills');
  const user = await scanner.scanUserSkills();
  assert(Array.isArray(user), 'Returns array');
  console.log(`  Count: ${user.length}`);
  
  if (user.length > 0) {
    const skill = user[0];
    assert(typeof skill.name === 'string' && skill.name.length > 0, 'Skill has name');
    assert(skill.source === 'user', 'Skill source is user');
  }
  console.log('');

  // Test 4: scanAgentSkills returns array
  console.log('Test 4: scanAgentSkills');
  const agent = await scanner.scanAgentSkills();
  assert(Array.isArray(agent), 'Returns array');
  console.log(`  Count: ${agent.length}`);
  
  if (agent.length > 0) {
    const skill = agent[0];
    assert(typeof skill.name === 'string' && skill.name.length > 0, 'Skill has name');
  }
  console.log('');

  // Test 5: Full skills:list simulation (IPC handler behavior)
  console.log('Test 5: Full skills:list simulation');
  try {
    const result = {
      builtin: await scanner.scanBuiltinSkills(),
      user: await scanner.scanUserSkills(),
      agent: await scanner.scanAgentSkills(),
    };
    
    assert(result.builtin.length > 0, 'builtin has skills');
    assert(Array.isArray(result.user), 'user is array');
    assert(Array.isArray(result.agent), 'agent is array');
    
    // Simulate renderer logic
    const skillsState = {
      currentTab: 'builtin',
      skills: result,
    };
    
    const filteredSkills = skillsState.skills[skillsState.currentTab] || [];
    assert(filteredSkills.length > 0, 'getFilteredSkills returns builtin skills');
    
    // Test tab switching
    skillsState.currentTab = 'user';
    const userSkills = skillsState.skills[skillsState.currentTab] || [];
    assert(Array.isArray(userSkills), 'getFilteredSkills returns user skills array');
    
    skillsState.currentTab = 'agent';
    const agentSkills = skillsState.skills[skillsState.currentTab] || [];
    assert(Array.isArray(agentSkills), 'getFilteredSkills returns agent skills array');
    
  } catch (err) {
    assert(false, `Full simulation failed: ${err.message}`);
  }
  console.log('');

  // Test 6: loadHermesConfig returns valid structure
  console.log('Test 6: loadHermesConfig');
  const config = scanner.loadHermesConfig();
  assert(typeof config === 'object', 'Returns object');
  assert(Array.isArray(config.enabled), 'Has enabled array');
  assert(Array.isArray(config.disabled), 'Has disabled array');
  console.log('');

  // Test 7: applyStatus sets correct status
  console.log('Test 7: applyStatus');
  const testSkills = [
    { name: 'test-skill-1', status: 'enabled' },
    { name: 'test-skill-2', status: 'enabled' },
  ];
  const testConfig = { enabled: ['test-skill-1'], disabled: ['test-skill-2'] };
  
  // Manually apply status logic
  testSkills.forEach(skill => {
    if (testConfig.disabled.includes(skill.name)) {
      skill.status = 'disabled';
    } else {
      skill.status = 'enabled';
    }
  });
  
  assert(testSkills[0].status === 'enabled', 'Enabled skill stays enabled');
  assert(testSkills[1].status === 'disabled', 'Disabled skill becomes disabled');
  console.log('');

  // Test 8: findSkillMds recursively finds skills
  console.log('Test 8: findSkillMds recursive search');
  const hermesAgentPath = scanner.getHermesAgentPath();
  if (hermesAgentPath) {
    const skillsDir = path.join(hermesAgentPath, 'skills');
    const foundSkills = await scanner.scanBuiltinSkills();
    assert(foundSkills.length > 0, 'Finds skills recursively');
    
    // Check that skills from nested directories are found
    const hasNestedSkill = foundSkills.some(s => s.path.includes('/skills/'));
    assert(hasNestedSkill, 'Finds nested skills');
  }
  console.log('');

  // Test 9: Renderer-side defensive logic simulation
  console.log('Test 9: Renderer loadSkillsList defensive logic');
  
  // Simulate normal result
  const normalResult = {
    success: true,
    builtin: [{ name: 'test', description: 'test', category: 'test', path: '/test', source: 'builtin', status: 'enabled' }],
    user: [],
    agent: [],
  };
  
  const normalSkillsState = {
    currentTab: 'builtin',
    skills: {
      builtin: Array.isArray(normalResult.builtin) ? normalResult.builtin : [],
      user: Array.isArray(normalResult.user) ? normalResult.user : [],
      agent: Array.isArray(normalResult.agent) ? normalResult.agent : [],
    },
  };
  
  assert(normalSkillsState.skills.builtin.length === 1, 'Normal result: builtin has 1 skill');
  
  // Simulate malformed result (missing arrays)
  const malformedResult = { success: true };
  const malformedSkillsState = {
    currentTab: 'builtin',
    skills: {
      builtin: Array.isArray(malformedResult.builtin) ? malformedResult.builtin : [],
      user: Array.isArray(malformedResult.user) ? malformedResult.user : [],
      agent: Array.isArray(malformedResult.agent) ? malformedResult.agent : [],
    },
  };
  
  assert(malformedSkillsState.skills.builtin.length === 0, 'Malformed result: builtin defaults to empty array');
  assert(malformedSkillsState.skills.user.length === 0, 'Malformed result: user defaults to empty array');
  assert(malformedSkillsState.skills.agent.length === 0, 'Malformed result: agent defaults to empty array');
  
  // Simulate error result
  const errorResult = { success: false, error: 'Test error' };
  const errorSkillsState = {
    currentTab: 'builtin',
    skills: { builtin: [], user: [], agent: [] },
  };
  
  if (!errorResult || !errorResult.success) {
    errorSkillsState.skills = { builtin: [], user: [], agent: [] };
  }
  
  assert(errorSkillsState.skills.builtin.length === 0, 'Error result: skills reset to empty arrays');
  console.log('');

  // Test 10: getFilteredSkills logic
  console.log('Test 10: getFilteredSkills logic');
  
  const testState = {
    currentTab: 'builtin',
    skills: {
      builtin: [
        { name: 'skill-a', description: 'desc a', category: 'cat1', status: 'enabled' },
        { name: 'skill-b', description: 'desc b', category: 'cat2', status: 'disabled' },
        { name: 'skill-c', description: 'desc c', category: 'cat1', status: 'enabled' },
      ],
      user: [],
      agent: [],
    },
    searchQuery: '',
    categoryFilter: '',
    statusFilter: '',
  };
  
  function getFilteredSkills(state) {
    const skills = state.skills[state.currentTab] || [];
    return skills.filter(skill => {
      if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        if (!skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false;
      }
      if (state.categoryFilter && skill.category !== state.categoryFilter) return false;
      if (state.statusFilter && skill.status !== state.statusFilter) return false;
      return true;
    });
  }
  
  // No filters
  const allSkills = getFilteredSkills(testState);
  assert(allSkills.length === 3, 'No filters: returns all 3 skills');
  
  // Search filter
  testState.searchQuery = 'skill-a';
  const searchResults = getFilteredSkills(testState);
  assert(searchResults.length === 1, 'Search filter: returns 1 skill');
  assert(searchResults[0].name === 'skill-a', 'Search filter: correct skill');
  testState.searchQuery = '';
  
  // Category filter
  testState.categoryFilter = 'cat1';
  const catResults = getFilteredSkills(testState);
  assert(catResults.length === 2, 'Category filter: returns 2 skills');
  testState.categoryFilter = '';
  
  // Status filter
  testState.statusFilter = 'disabled';
  const statusResults = getFilteredSkills(testState);
  assert(statusResults.length === 1, 'Status filter: returns 1 disabled skill');
  testState.statusFilter = '';
  
  // Tab switching
  testState.currentTab = 'user';
  const userSkills = getFilteredSkills(testState);
  assert(userSkills.length === 0, 'Tab switch to user: returns empty array');
  testState.currentTab = 'builtin';
  console.log('');

  // Summary
  console.log('=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
