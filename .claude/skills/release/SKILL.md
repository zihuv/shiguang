---
name: release
description: Run ONLY when the user explicitly commands publishing a release version (发布版本 / 发版 / 打 tag 发布 / publish a release). Reads the last git tag, proposes the next version, and drives the existing pipeline via `npm run release` or `scripts/republish-draft-release.sh`. Never runs autonomously.
---

# Release（发布版本）

把「发布新版本」的流程固化下来：读取上次发布的 tag、提议下一个版本、走现有发布脚本和 GitHub 流水线，把桌面端安装包 + 浏览器扩展发出去。

## 硬门禁（最高优先级）

本 Skill **只在用户明确要求发布版本时执行**。判定标准：用户消息同时包含「发布动作」和「版本意图」，例如：

- 「发布 0.6.4」
- 「发个版本」「出新版本」
- 「打 tag 发布」「出 release」
- 「重发 0.6.3 的草稿」

**不是明确发版指令的情况，立即停止，只做回应，不读 tag、不跑任何命令**：

- 只是讨论发布流程、询问现状（「现在版本是多少」「这个流程怎么走的」）
- 只是提到版本号（「0.6.3 修了个 bug」）
- 只是说「应该发版了」这类倾向性建议，没有明确命令

在任何对话里，即使版本落后、changelog 有大量更新，**没有用户明确的发版指令就绝不自行发布**。

### 执行前必须确认

所有不可逆步骤（修改版本号 / commit / 打 tag / push）之前，必须向用户展示计划并获得明确同意：

- 目标版本号
- 本次要发布的变更摘要（从 CHANGELOG 读取）
- 将执行哪条命令、会触发什么

用户说「确认」「发」之后再动手。任何人机确认环之前不做任何改动。

## 流程

### 1. 读取上次 tag 与前置校验

按顺序执行并全部通过，任一不满足就停下，给出修复指引：

```bash
git describe --tags --abbrev=0          # 上次发布的 tag（当前应为 0.6.3）
```

- `package.json` 的 `version` 与上次 tag 一致（确认当前是「未发布」状态）
- `git status --short` 工作区干净
- `gh auth status` 已认证（发版需要 gh）
- 当前分支有 upstream（`git rev-parse --abbrev-ref --symbolic-full-name @{u}` 能返回）
- `docs/CHANGELOG.md` 的 `## [Unreleased]` 有实质内容（release 脚本会强制要求，空则失败）

### 2. 提议版本号

- 默认提议上次 tag 的 patch+1（`0.6.3 → 0.6.4`），向用户确认；用户可临时指定其他版本。
- 分支判定：若请求版本 == 上次 tag 且存在草稿 release（`gh release view <version>` 显示 draft）→ 走「重发草稿」路径。
- 警告：4 段版本号（如 `0.6.3.1`）不匹配 `release.yml` 的 `*.*.*` tag 触发模式，push 不会自动跑流水线。遇到时提示用户改用 workflow_dispatch 或建议改用 3 段 patch 版本。

### 3. 新版本路径

展示发布计划（版本号、Unreleased 变更摘要、将执行 `npm run release -- <version>`），用户确认后：

```bash
npm run release -- <version>
```

该脚本内部完成：bump `package.json` / `package-lock.json` → 把 CHANGELOG 的 Unreleased 移到 `[<version>] - <日期>` → 提交（commit 消息就是版本号）→ 打 tag → `git push --follow-tags`。push tag 触发 `release.yml` 流水线。

脚本报错时按错误信息修正（工作区不干净 / changelog 无内容 / 版本冲突 / 无 upstream），**不绕过脚本手动改版本号或强推**。

### 4. 重发草稿路径

构建失败需要把草稿 tag 指到新 commit 重跑时：

```bash
scripts/republish-draft-release.sh <version> [--ref <commit>] [--delete-assets]
```

- `--ref`：目标 commit/ref，默认 HEAD。
- `--delete-assets`：重跑前删除已有草稿产物（构建中途失败留下半成品时用）。
- 脚本自带保护：**已正式发布的版本拒绝操作**，绝不触碰线上 release。

### 5. 汇报（不阻塞）

推送后**立即汇报**，不等流水线跑完（三平台构建要几分钟）：

- 流水线 run：`gh run list --workflow release.yml --limit 1`
- 草稿 Release：`gh release view <version>`

说明流水线会自动构建 macOS DMG / Linux AppImage+deb / Windows exe 和浏览器扩展 zip，然后转正式发布。给用户自行跟踪的命令：

```bash
gh run watch            # 跟随当前 run
gh run list --workflow release.yml
```

如果用户反馈流水线构建失败，引导走「重发草稿」路径，不要手动改 release。

## 红线

- 没有用户的明确发版指令，**绝不进入流程**。
- 绝不 force-push / 删 tag / 修改已正式发布的 release。
- 不可逆步骤前必须有用户确认。
- 复用 `scripts/release.cjs`、`scripts/republish-draft-release.sh` 完成机械步骤，不在本 Skill 里重写 bump/changelog/tag 逻辑。
