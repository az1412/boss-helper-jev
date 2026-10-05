# 日志组件基线与补丁

本发布快照将 `packages/devlog-ui/` 作为普通源码目录随附，包含完整源码、原许可和已应用的 Jev 补丁，不携带子模块 Git 历史。无需执行 `git submodule update`。

## 固定来源

- 来源：[Ocyss/devlog-ui](https://github.com/Ocyss/devlog-ui)。原始项目与许可见 [第三方说明](../THIRD_PARTY_NOTICES.md)。
- 固定基线：`2754bee64a7fc263b287926123acefc39d77107e`。
- 补丁：`scripts/patches/0001-devlog-ui-jev.patch`。
- 内容清单：`scripts/patches/devlog-ui.json`，记录补丁前后的 SHA-256，计算前统一为 LF 换行。

补丁修改 `src/core/logger.ts`、`src/channel/broadcast.ts`，新增 `src/core/redaction.ts`。WXT 和离线预览均直接引用组件源码。

## 安装与校验

`bun install --frozen-lockfile` 的 postinstall 自动执行 `bun run patch:devlog`。发布快照已应用补丁，安装时只核对内容。禁用安装脚本时，在测试或构建前手动执行：

```sh
bun run patch:devlog
bun scripts/apply-devlog-patch.mjs --check
bun test ./tests/log-view.test.ts
bun run build:chrome
```

`--check` 不修改文件。已应用状态可以重复校验；部分应用、未知修改或基线不匹配会报错，不会自动 reset、checkout 或覆盖用户文件。没有 Git 元数据时，仍按相同文件哈希核验。

## 修改范围

- 捕获、上下文、span、diff、历史恢复与导出进行凭据脱敏，不修改调用者数据。
- `getLogs()` 返回脱敏快照；`exportLogs({ ids })` 支持精确选择，空数组导出零条。
- 日志等级只接受既有四种值，保持其他公开 API 兼容。
- 浏览器日志通道不在 Node 构建时连接，避免构建完成后占用进程。

凭据脱敏不等于个人自由文本完全匿名，详见 [PRIVACY.md](../PRIVACY.md)。保留组件 MIT 许可全文；本地补丁适用根项目 MIT 许可。

如需升级组件，单独审查上游差异、重新生成补丁与哈希并重跑验证，不直接修改哈希绕过检查。
