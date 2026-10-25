# zero-notice

将 Agent harness 的事件推送到 Bark。当前实现了 Codex 的只读通知 hook：

- `Stop`：一轮任务结束时通知。
- `PermissionRequest`：等待工具权限确认时通知。

Hook 后台执行，不返回批准、拒绝或继续运行的控制指令，也不会把命令内容或最终回答发送到 Bark。

## 配置

在项目根目录创建 `.env`：

```bash
ZERO_NOTICE_BARK_KEY=your-device-key
ZERO_NOTICE_BARK_BASE_URL=https://api.day.app
```

`.env` 已加入 `.gitignore`，建议执行 `chmod 600 .env`。需要 Node.js 22.19 或更高版本，无第三方依赖。

## 安装 Codex hook

安装命令会向 `~/.codex/hooks.json` 的 `Stop` 和 `PermissionRequest` 各添加一个独立 handler，不覆盖已有 handler；写入前自动备份：

```bash
node scripts/install-codex.mjs
```

当前 hook 使用本仓库的绝对路径，移动仓库后需重新安装。Codex 可能要求审查并信任新 hook；重启 Codex 后检查其 hooks/trust 界面。

发送一条真实 Bark 测试通知：

```bash
npm run test:push
```

## 验证

```bash
npm test
```

测试使用本地模拟 Bark 服务，不会发送真实通知。

Hook 不在 stdout 输出内容，失败也不会阻断 Codex。错误记录在：

```text
~/.local/state/zero-notice/error.log
```

成功事件的去重状态保存在：

```text
~/.local/state/zero-notice/sent-events.json
```

Bark 成功受理后、状态写入前如果进程异常退出，重试仍可能产生重复通知；不承诺端到端恰好一次送达。

## Codex App 本地线程

安装器使用当前 Node 可执行文件和 hook 脚本的绝对路径，并进行 shell 引号转义，不依赖 Codex App 的 PATH。两个 handler 均为 `async: true`、`timeout: 15`；重复安装不会追加 handler，初版直接执行脚本的命令会原位升级。其他 handler 与 `config.toml`（包括已有 `notify`）保持原样。首次安装也支持不存在的 `hooks.json`。移动项目或更新 Node 安装路径后需要重新安装。

仅配置本机 `~/.codex/hooks.json`，不配置云端线程。安装或更新后，在 Codex `/hooks` 审查并手动信任这两个 handler；安装器不会写入信任状态，也不使用信任绕过参数。官方说明：[Hooks](https://learn.chatgpt.com/docs/hooks)。

`.env` 以模块位置解析，与当前目录无关，权限应保持 `600`。通知内容只取项目目录名、固定状态及工具名，不取回答、命令、代码、工具参数或凭据。通知入口成功或失败均不向 stdout/stderr 写入内容，失败以通用消息记录到本地日志并退出 `0`，不返回批准、拒绝或继续操作的控制指令。

去重对同一事件的并发发送加锁，成功后才记录哈希。权限请求优先使用调用/请求 ID；没有 ID 时，对工具名和规范化输入计算本地哈希。不同工具或输入不会互相去重；同一轮中完全相同且没有唯一 ID 的请求无法与重放区分，会合并。缓存不保存原始输入。停止事件按会话和轮次区分。

测试覆盖本地模拟 Bark、并发重复事件、多次权限请求、失败重试、空 stdout/stderr、受限 PATH、异地工作目录、安装备份及幂等合并。`npm test` 不发真实推送；仅 `npm run test:push` 发真实测试通知。
