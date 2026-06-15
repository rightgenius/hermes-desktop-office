// cron-policy.js
// 黑名单驱动的 cron 自动授权策略。
//
// 设计目标：后台定时任务不应弹模态框，因此走「默认全开 + 黑名单兜底」模式。
// 黑名单由两层构成：
//   1. 内置 denylist：覆盖常见横向扩散 / 凭证窃取 / 持久化 / 容器逃逸模式
//   2. 用户自定义 denylist：通过 ~/.hermes/config.yaml 或 GUI 配置追加
//
// 命中规则：
//   - "block"：直接拒绝执行（deny），不进入 hermes-agent 的工具调用
//   - "warn"：放行但写入审计日志（用于侦察类命令，单次无害但后台反复跑可疑）
//
// 匹配范围：仅作用于 cron session 的 dangerous_command 审批回调；GUI 聊天不受影响。
// 注意：rm -rf /、mkfs、shutdown、sudo -S 这类硬阻断由 hermes-agent 的 HARDLINE_PATTERNS
// 独立处理，永远生效——这里只补充「hermes-agent 不挡但后台场景下可疑」的命令模式。
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');

// --------------------------------------------------------------------------
// 内置黑名单规则
// 每条规则：{ id, category, action: 'block'|'warn', pattern, description }
//   pattern 是正则字符串（IGNORECASE | DOTALL）
//   action:
//     - 'block' = 命中即拒绝（emits denylist_blocked 审计事件）
//     - 'warn'  = 放行但写入审计（emits denylist_warned 审计事件）
// --------------------------------------------------------------------------
const BUILTIN_DENYLIST = [
  // ===== 网络外联（典型 C2 / 数据外泄通道）=====
  {
    id: 'net.reverse_ssh',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`\bssh\s+(?:-[^\s]+\s+)*-[LRD]\b`,
    description: 'SSH 反向 / 本地 / 动态端口转发（持久化通道）',
  },
  {
    id: 'net.ssh_proxycommand',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`\bssh\s+(?:-[^\s]+\s+)*-o\s+(?:[^\s]+\s+)*ProxyCommand\b`,
    description: 'SSH 跳板代理',
  },
  {
    id: 'net.nc_exec',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`\b(?:nc|ncat|netcat)\b[^\n]*-[a-zA-Z]*e\b[^\n]*(?:/bin/(?:sh|bash|ash|zsh)|(?:sh|bash|ash|zsh))`,
    description: 'netcat 反弹 shell（-e 执行 shell）',
  },
  {
    id: 'net.bash_dev_tcp',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`/dev/tcp/[^\s]+`,
    description: 'bash /dev/tcp 反向连接（反弹 shell 经典手法）',
  },
  {
    id: 'net.python_reverse_shell',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`python[23]?\s+-c\s+[^\n]*(?:socket|subprocess)[^\n]*(?:connect|/bin/(?:sh|bash))`,
    description: 'Python 一行反弹 shell',
  },
  {
    id: 'net.curl_pipe_bash',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`\bcurl\b[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba)?sh\b`,
    description: 'curl 远程脚本直接管道给 bash 执行',
  },
  {
    id: 'net.wget_pipe_shell',
    category: 'network_egress',
    action: 'block',
    pattern: String.raw`\bwget\b[^\n|;&]*-O\s*-\s*[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba)?sh\b`,
    description: 'wget 远程脚本管道执行',
  },

  // ===== 凭证 / Secret 读取 =====
  {
    id: 'cred.read_aws_creds',
    category: 'credential_access',
action: 'block',
    pattern: /\b(?:cat|less|more|head|tail|strings|xxd|od|base64|file|stat)\b[^\n]*(?:[~`]|\$\{?HOME\}?)\/\.aws\/(?:credentials|config)/.source,
    description: '读取 AWS 凭证文件',
  },
  {
    id: 'cred.read_ssh_keys',
    category: 'credential_access',
    action: 'block',
    pattern: /\b(?:cat|less|more|head|tail|strings|xxd|od|base64|file|stat)\b[^\n]*(?:id_rsa|id_ed25519|id_ecdsa|id_dsa|\.ssh\/[^\/\s]+(?:\.pub)?)/.source,
    description: '读取 SSH 私钥',
  },
  {
    id: 'cred.read_kube_config',
    category: 'credential_access',
    action: 'block',
    pattern: /\b(?:cat|less|more|head|tail|strings|xxd|od|base64)\b[^\n]*(?:[~`]|\$\{?HOME\}?)\/\.kube\/config/.source,
    description: '读取 Kubernetes 配置',
  },
  {
    id: 'cred.dump_env_secrets',
    category: 'credential_access',
    action: 'block',
    pattern: String.raw`\b(?:printenv|env)\b[^\n]*\b(?:KEY|TOKEN|SECRET|PASSWORD|API_)\w*\b`,
    description: '导出含密钥的环境变量',
  },

  // ===== 持久化驻留（装后门）=====
  {
    id: 'persist.write_crontab',
    category: 'persistence',
    action: 'block',
    pattern: String.raw`\bcrontab\s+(?:-[^\s]+\s+)*(?:-l|-e|-r)\b`,
    description: '列出 / 编辑 / 删除 crontab（抢调度）',
  },
  {
    id: 'persist.systemctl_enable',
    category: 'persistence',
    action: 'block',
    pattern: String.raw`\bsystemctl\s+(?:-[^\s]+\s+)*(?:enable|daemon-reload|preset)\b`,
    description: '启用 systemd 持久化服务',
  },
  {
    id: 'persist.launchctl_load',
    category: 'persistence',
    action: 'block',
    pattern: String.raw`\blaunchctl\s+(?:load|unload)\b`,
    description: 'macOS launchd 持久化',
  },
  {
    id: 'persist.shell_rc_tamper',
    category: 'persistence',
    action: 'block',
    pattern: />>\s*(?:~?\/?(?:\.?(?:bashrc|zshrc|profile|bash_profile|bash_login|tcshrc|cshrc))|\/etc\/(?:profile|bash\.bashrc|zshenv|fish\.fish))\b/.source,
    description: '追加写入 shell 启动文件',
  },

  // ===== 容器逃逸 / 提权 =====
  {
    id: 'escape.nsenter',
    category: 'privilege_escalation',
    action: 'block',
    pattern: String.raw`\bnsenter\b[^\n]*--(?:target|pid)\s+1\b`,
    description: 'nsenter 进入 PID 1 namespace（容器逃逸典型手法）',
  },
  {
    id: 'escape.unshare_user',
    category: 'privilege_escalation',
    action: 'block',
    pattern: String.raw`\bunshare\s+(?:-[^\s]+\s+)*--(?:user|map-root-user)\b`,
    description: 'unshare 创建用户 namespace（容器逃逸）',
  },
  {
    id: 'escape.chroot_root',
    category: 'privilege_escalation',
    action: 'block',
    pattern: String.raw`\bchroot\s+/\b`,
    description: 'chroot 到根目录（隔离破坏）',
  },

  // ===== 系统完整性破坏 =====
  {
    id: 'integrity.chmod_777_root',
    category: 'system_integrity',
    action: 'block',
    pattern: String.raw`\bchmod\s+(?:-[^\s]+\s+)*[0-7]*[1357][0-7]{2,3}\s+/\s`,
    description: '给根目录加全局权限位（破坏安全位）',
  },
  {
    id: 'integrity.chown_system',
    category: 'system_integrity',
    action: 'block',
    pattern: String.raw`\bchown\s+(?:-[^\s]+\s+)*-R\s+[^\s]+\s+/(?:etc|usr|var|boot|sbin|bin)\b`,
    description: '递归改系统目录属主',
  },
  {
    id: 'integrity.firewall_flush',
    category: 'system_integrity',
    action: 'block',
    pattern: String.raw`\b(?:iptables|nft|ufw)\s+[^\n]*\b(?:flush|reset|F)\b`,
    description: '清空防火墙规则',
  },

  // ===== 侦察类（warn 而非 block，单次无害但 cron 后台反复跑可疑）=====
  {
    id: 'recon.user_enum',
    category: 'reconnaissance',
    action: 'warn',
    pattern: String.raw`(?<![a-zA-Z0-9_])(?:whoami|id(?:\s+(?:-[a-zA-Z]+\s+)*(?:\$?USER|\$\{?USER\}?|\b[a-zA-Z]+\b))?|hostname|uname(?:\s+-a)?|ifconfig|ip\s+(?:addr|route|link)\b)(?![a-zA-Z0-9_])`,
    description: '主机指纹侦察（后台反复跑可能是 beacon）',
  },
];

// --------------------------------------------------------------------------
// 黑名单匹配器
// --------------------------------------------------------------------------
class CronPolicy {
  constructor(options = {}) {
    // 配置对象：{ get(): config } —— 由外部注入（一般是 ConfigStore 实例）
    this._configProvider = options.configProvider || null;
    this._extraRulesStatic = options.extraRules || [];
    this._compiledCache = null;
    this._compiledExtraCache = null;
    this._lastCompiledAt = 0;
    this.reloadIntervalMs = options.reloadIntervalMs || 5000;
  }

  _compile(rules) {
    const out = [];
    for (const rule of rules) {
      if (!rule || typeof rule.pattern !== 'string') continue;
      try {
        out.push({
          ...rule,
          _re: new RegExp(rule.pattern, 'is'),
        });
      } catch (err) {
        // Invalid regex from user config — skip and log.
        console.warn(`[cron-policy] Invalid rule pattern (${rule.id}): ${err.message}`);
      }
    }
    return out;
  }

  _builtinRules() {
    if (!this._compiledCache ||
        (Date.now() - this._lastCompiledAt) > this.reloadIntervalMs) {
      this._compiledCache = this._compile(BUILTIN_DENYLIST);
      this._lastCompiledAt = Date.now();
    }
    return this._compiledCache;
  }

  _userExtraRules() {
    // 用户自定义 denylist 来自两个来源：
    //  1. 启动时传入的静态 extraRules
    //  2. config-store 的 cronExtraDenylist 字段（GUI 配置面板可改）
    let extras = this._extraRulesStatic || [];
    if (this._configProvider) {
      try {
        const cfg = this._configProvider.get();
        if (Array.isArray(cfg?.cronExtraDenylist)) {
          extras = extras.concat(
            cfg.cronExtraDenylist
              .filter((e) => e && typeof e.pattern === 'string')
              .map((e, idx) => ({
                id: `user.config.${idx}`,
                category: 'user_defined',
                action: e.action === 'warn' ? 'warn' : 'block',
                pattern: e.pattern,
                description: e.description || '用户自定义规则',
              }))
          );
        }
      } catch (err) {
        // Config store unavailable — fall back to static extras.
      }
    }
    return this._compile(extras);
  }

  _allRules() {
    // 内置规则 + 用户追加规则按顺序拼接
    return this._builtinRules().concat(this._userExtraRules());
  }

  /**
   * 评估一条命令，返回首个命中规则；未命中返回 null。
   * @param {string} command
   * @returns {{ rule: object, match: RegExpMatchArray } | null}
   */
  evaluate(command) {
    if (!command || typeof command !== 'string') return null;
    for (const rule of this._allRules()) {
      const match = rule._re.exec(command);
      if (match) return { rule, match };
    }
    return null;
  }

  /**
   * 返回命中 block 规则的结果；未命中返回 null
   */
  shouldBlock(command) {
    const hit = this.evaluate(command);
    return hit && hit.rule.action === 'block' ? hit : null;
  }

  /**
   * 返回命中 warn 规则的结果；未命中返回 null
   */
  shouldWarn(command) {
    const hit = this.evaluate(command);
    return hit && hit.rule.action === 'warn' ? hit : null;
  }

  /**
   * 列出所有内置规则（用于 GUI 展示 / 测试）
   */
  listBuiltinRules() {
    return BUILTIN_DENYLIST.map(({ pattern, ...meta }) => meta);
  }
}

// --------------------------------------------------------------------------
// 从 ~/.hermes/config.yaml 加载用户自定义 denylist 规则（hermes-agent 配置）
// 格式：
//   cron:
//     denylist:
//       - pattern: '...\K...'
//         action: block
//         description: '自定义规则说明'
// --------------------------------------------------------------------------
function loadUserDenylistFromConfig(hermesHome = path.join(os.homedir(), '.hermes')) {
  const configPath = path.join(hermesHome, 'config.yaml');
  if (!fs.existsSync(configPath)) return [];
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const doc = YAML.parse(content);
    const list = doc?.cron?.denylist;
    if (!Array.isArray(list)) return [];
    return list
      .filter((entry) => entry && typeof entry.pattern === 'string')
      .map((entry, idx) => ({
        id: `user.${idx}`,
        category: 'user_defined',
        action: entry.action === 'warn' ? 'warn' : 'block',
        pattern: entry.pattern,
        description: entry.description || '用户自定义规则',
      }));
  } catch (err) {
    console.warn('[cron-policy] Failed to load user denylist:', err.message);
    return [];
  }
}

// --------------------------------------------------------------------------
// 验证 denylist 规则（GUI 配置面板 / 单元测试用）
// 返回 { ok: true, rule } 或 { ok: false, error }
// --------------------------------------------------------------------------
function validateDenylistRule(entry) {
  if (!entry || typeof entry !== 'object') {
    return { ok: false, error: '规则必须是对象' };
  }
  if (typeof entry.pattern !== 'string' || !entry.pattern) {
    return { ok: false, error: 'pattern 必须是非空字符串' };
  }
  try {
    new RegExp(entry.pattern, 'i');
  } catch (err) {
    return { ok: false, error: `正则无效: ${err.message}` };
  }
  if (entry.action && entry.action !== 'block' && entry.action !== 'warn') {
    return { ok: false, error: "action 必须是 'block' 或 'warn'" };
  }
  return { ok: true };
}

module.exports = {
  CronPolicy,
  BUILTIN_DENYLIST,
  loadUserDenylistFromConfig,
  validateDenylistRule,
};