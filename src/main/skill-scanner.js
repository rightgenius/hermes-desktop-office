const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const fsPromises = fs.promises;

// Path helpers
function getHermesHome() {
  return process.env.HERMES_HOME || path.join(app.getPath('home'), '.hermes');
}

function getAgentsHome() {
  return path.join(app.getPath('home'), '.agents');
}

// Parse YAML frontmatter from SKILL.md
function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { name: '', description: '', category: '' };
  }
  
  const frontmatter = frontmatterMatch[1];
  const result = { name: '', description: '', category: '' };
  
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const catMatch = frontmatter.match(/^category:\s*(.+)$/m);
  
  if (nameMatch) result.name = nameMatch[1].trim();
  if (descMatch) result.description = descMatch[1].trim();
  if (catMatch) result.category = catMatch[1].trim();
  
  return result;
}

async function dirExists(p) {
  try {
    await fsPromises.stat(p);
    return true;
  } catch {
    return false;
  }
}

// Scan a single skill directory
async function scanSkillDir(dirPath, source) {
  const skillMdPath = path.join(dirPath, 'SKILL.md');
  
  try {
    const content = await fsPromises.readFile(skillMdPath, 'utf-8');
    const meta = parseFrontmatter(content);
    
    const stat = await fsPromises.stat(dirPath);
    const hasReferences = await dirExists(path.join(dirPath, 'references'));
    const hasScripts = await dirExists(path.join(dirPath, 'scripts'));
    
    return {
      name: meta.name || path.basename(dirPath),
      description: meta.description || '',
      category: meta.category || path.basename(path.dirname(dirPath)),
      path: dirPath,
      source: source,
      status: 'enabled',
      provenance: null,
      hasReferences: hasReferences,
      hasScripts: hasScripts,
      skillMdPath: skillMdPath,
      skillMdContent: content,
      useCount: 0,
      lastActivity: null,
      curatorState: null,
      created: stat.mtime.toISOString(),
    };
  } catch (err) {
    return null;
  }
}

// Recursively find all SKILL.md files in a directory
async function findSkillMds(baseDir, source) {
  const skills = [];
  
  try {
    const entries = await fsPromises.readdir(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(baseDir, entry.name);
        const skillMdPath = path.join(fullPath, 'SKILL.md');
        
        try {
          await fsPromises.access(skillMdPath);
          const skill = await scanSkillDir(fullPath, source);
          if (skill) skills.push(skill);
        } catch (err) {
          if (err?.code !== 'ENOENT') throw err;
          const subSkills = await findSkillMds(fullPath, source);
          skills.push(...subSkills);
        }
      }
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  
  return skills;
}

// Load .usage.json for agent skill provenance
async function loadUsageJson() {
  const usagePath = path.join(getHermesHome(), 'skills', '.usage.json');
  try {
    const content = await fsPromises.readFile(usagePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// Load Hermes config.yaml for enabled/disabled state
function loadHermesConfig() {
  const configPath = path.join(getHermesHome(), 'config.yaml');
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const enabled = [];
    const disabled = [];
    
    const sections = content.split(/(?=^\w)/m);
    
    for (const section of sections) {
      const enabledMatch = section.match(/enabled:\s*(?:\n((?:\s+-\s+.+\n)*)|(\[[^\]]*\]))/);
      const disabledMatch = section.match(/disabled:\s*(?:\n((?:\s+-\s+.+\n)*)|(\[[^\]]*\]))/);
      
      if (enabledMatch) {
        if (enabledMatch[1]) {
          enabledMatch[1].split('\n').forEach(line => {
            const m = line.match(/\s+-\s+(.+)/);
            if (m) enabled.push(m[1].trim().replace(/['"]/g, ''));
          });
        } else if (enabledMatch[2]) {
          const items = enabledMatch[2].match(/'([^']+)'|"([^"]+)"|([^,\]\[\s]+)/g);
          if (items) items.forEach(item => enabled.push(item.trim().replace(/['"]/g, '')));
        }
      }
      
      if (disabledMatch) {
        if (disabledMatch[1]) {
          disabledMatch[1].split('\n').forEach(line => {
            const m = line.match(/\s+-\s+(.+)/);
            if (m) disabled.push(m[1].trim().replace(/['"]/g, ''));
          });
        } else if (disabledMatch[2]) {
          const items = disabledMatch[2].match(/'([^']+)'|"([^"]+)"|([^,\]\[\s]+)/g);
          if (items) items.forEach(item => disabled.push(item.trim().replace(/['"]/g, '')));
        }
      }
    }
    
    return { enabled, disabled };
  } catch {
    return { enabled: [], disabled: [] };
  }
}

// Apply enabled/disabled status from config
function applyStatus(skills, config) {
  skills.forEach(skill => {
    if (config.disabled.includes(skill.name)) {
      skill.status = 'disabled';
    } else {
      skill.status = 'enabled';
    }
  });
}

// Scan builtin skills
async function scanBuiltinSkills() {
  const skillsDir = path.join(__dirname, 'hermes-agent', 'skills');
  const optionalDir = path.join(__dirname, 'hermes-agent', 'optional-skills');
  
  const skills = [];
  skills.push(...await findSkillMds(skillsDir, 'builtin'));
  skills.push(...await findSkillMds(optionalDir, 'builtin'));
  
  const config = loadHermesConfig();
  applyStatus(skills, config);
  
  return skills;
}

// Scan user skills (excluding agent-generated)
async function scanUserSkills() {
  const hermesSkillsDir = path.join(getHermesHome(), 'skills');
  const agentsSkillsDir = path.join(getAgentsHome(), 'skills');
  
  const usageData = await loadUsageJson();
  const agentNames = new Set(
    Object.keys(usageData).filter(name => usageData[name]?.created_by === 'agent')
  );
  
  const skills = [];
  const allSkills = [];
  
  allSkills.push(...await findSkillMds(hermesSkillsDir, 'user'));
  allSkills.push(...await findSkillMds(agentsSkillsDir, 'user'));
  
  // Filter out agent-generated skills
  allSkills.forEach(skill => {
    if (!agentNames.has(skill.name)) {
      skills.push(skill);
    }
  });
  
  const config = loadHermesConfig();
  applyStatus(skills, config);
  
  return skills;
}

// Identify agent-generated skills
async function scanAgentSkills() {
  const hermesSkillsDir = path.join(getHermesHome(), 'skills');
  const usageData = await loadUsageJson();
  
  const allSkills = await findSkillMds(hermesSkillsDir, 'agent');
  
  return allSkills
    .filter(skill => usageData[skill.name]?.created_by === 'agent')
    .map(skill => ({
      ...skill,
      provenance: 'agent',
      useCount: usageData[skill.name]?.use_count || 0,
      lastActivity: usageData[skill.name]?.last_activity_at || null,
      curatorState: usageData[skill.name]?.state || 'active',
    }));
}

// List files in skill directory
async function listSkillFiles(skillPath) {
  const files = [];
  
  async function walkDir(dir, relativePath = '') {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          files.push({ name: entry.name + '/', path: fullPath, isDirectory: true });
          await walkDir(fullPath, relPath);
        } else {
          const stat = await fsPromises.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            isDirectory: false,
            size: stat.size,
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  await walkDir(skillPath);
  return files;
}

module.exports = {
  scanBuiltinSkills,
  scanUserSkills,
  scanAgentSkills,
  listSkillFiles,
  getHermesHome,
  getAgentsHome,
  loadHermesConfig,
  loadUsageJson,
};
