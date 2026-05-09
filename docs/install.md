# Hermes Desktop for Office — 安装指南

## 🟢 场景 A：普通用户安装（零依赖，推荐）

**适用人群**：只需要使用软件，不关心代码

**适用系统**：macOS ARM64 (Apple Silicon) / Windows (待发布)

### 安装步骤

1. 获取安装包：
   - 从 Release 页面下载 `Hermes Desktop for Office-x.x.x-arm64.dmg`
   - 或从已构建电脑复制 `dist/` 目录下的 `.dmg` 文件

2. 双击 `.dmg` 文件

3. 将 `Hermes Desktop for Office.app` 拖入 Applications 文件夹

4. 从 Applications 打开应用

5. 首次启动会自动弹出向导：
   - 输入 Gateway URL 和 API Token
   - 点击"授权飞书"→ 浏览器完成 OAuth
   - 点击"授权钉钉"→ 浏览器完成 OAuth

> **重要**：安装包已内置所有依赖（Electron 运行时、lark-cli、dws-cli），新电脑无需安装 Node.js、Python 或任何其他环境。

---

## 🟡 场景 B：开发者运行源码

**适用人群**：需要修改代码、调试、贡献代码

### 前置要求

| 依赖 | 版本 | 安装命令 |
|------|------|----------|
| Node.js | >= 20 | `brew install node` |
| Git | >= 2.30 | `brew install git` |
| Python 3 | >= 3.9 | `brew install python` (macOS 通常自带) |

### 快速安装

```bash
# 1. 安装基础依赖（如果新电脑没有）
brew install node git python

# 2. 启用网络代理（如果需要访问 GitHub）
export https_proxy=socks5://127.0.0.1:7897

# 3. 克隆仓库
git clone --recurse-submodules https://github.com/rightgenius/hermes-desktop-office.git
cd hermes-desktop-office

# 4. 安装 npm 依赖（国内镜像加速）
npm install --registry=https://registry.npmmirror.com
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

# 5. 放置 CLI 二进制
mkdir -p assets/feishu-cli/darwin-arm64
mkdir -p assets/dws-cli/darwin-arm64
npm install -g @larksuite/cli dingtalk-workspace-cli
cp $(npm prefix -g)/lib/node_modules/@larksuite/cli/bin/lark-cli assets/feishu-cli/darwin-arm64/lark-cli
cp $(find $(npm prefix -g)/lib/node_modules/dingtalk-workspace-cli -name "dws" -type f | head -1) assets/dws-cli/darwin-arm64/dws
chmod +x assets/feishu-cli/darwin-arm64/lark-cli assets/dws-cli/darwin-arm64/dws

# 6. 启动
npx electron .
```

### 构建打包

```bash
# 下载各平台 CLI 二进制（自动）
bash scripts/download-clis.sh --clean

# 打包 macOS .dmg
npx electron-builder --mac

# 打包 Windows .exe
npx electron-builder --win
```

---

## ❓ 常见问题

### Q: 双击 .dmg 安装后打开白屏
1. 检查是否从 Applications 打开（不要在 .dmg 中直接双击）
2. macOS 安全提示：首次打开右键 → "打开" → 确认
3. 如果仍然白屏，打开 Console.app 搜索 "Hermes" 查看日志

### Q: 源码运行报错 "Cannot find module electron"
```bash
npm install
```

### Q: 源码运行报错 "Agent 未安装"
```bash
git submodule update --init --recursive
```

### Q: lark-cli 报错 MODULE_NOT_FOUND
lark-cli 的实际二进制在 npm 包内部，需要复制 `bin/lark-cli` 而不是 npm wrapper 脚本。参考场景 B Step 5。

### Q: dws 找不到
```bash
npm install -g dingtalk-workspace-cli
```

### Q: git clone 超时
启用代理：
```bash
export https_proxy=socks5://127.0.0.1:7897
git clone --recurse-submodules https://github.com/rightgenius/hermes-desktop-office.git
```
