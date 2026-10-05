# 第三方来源与许可

Boss Helper Jev 是基于开源项目的二次开发版本。下列来源与版权应随源码和相应分发产物保留。

## 主项目

- 上游：[Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)。
- 根目录 [LICENSE](LICENSE) 保留 MIT 全文及 `Copyright (c) 2024 Ocyss(git@ocyss.icu)`。
- 本版本由 Jev 二次开发分支及后续修改形成。本发布快照不包含开发仓库的 Git 历史，来源与许可在本文保留。
- 基准快照 [upstream-workflow-09df246.txt](tests/support/upstream-workflow-09df246.txt) 原样取自上游提交 [`09df246399bd4edd4a1e35793bfe028e23578330`](https://github.com/Ocyss/boss-helper/blob/09df246399bd4edd4a1e35793bfe028e23578330/src/composables/useApplying/index.ts)，适用同一 MIT 许可，仅用于复现调度对照。
- 快照 SHA-256：`d5cf2703859a96f60658a5f3dee9c481f258e138a5335bb329cf93fda16f0aa4`。

## 日志组件 devlog-ui

| 项目 | 来源 |
| --- | --- |
| 组件来源仓库 | [Ocyss/devlog-ui](https://github.com/Ocyss/devlog-ui) |
| 原始项目（依据 package.json） | [Oko-Tester/devlog-ui](https://github.com/Oko-Tester/devlog-ui) |
| 固定基线 | `2754bee64a7fc263b287926123acefc39d77107e`，版本 1.1.0 |
| 版权 | `Copyright (c) 2026 Alexander Remer` |
| 许可 | MIT，完整文本保留于 `packages/devlog-ui/LICENSE` |

本版修改包括日志脱敏、恢复 / 导出防御处理、精确选择导出及日志等级校验。补丁保存在 `scripts/patches/0001-devlog-ui-jev.patch`，基线、应用方法和校验说明见 [日志子模块补丁](docs/devlog-patch.md)。本发布快照将组件作为普通源码目录随附，固定基线与补丁仍保留；Chrome 包包含 `licenses/devlog-ui-LICENSE.txt`。

## 其他依赖与内嵌代码

Vue、WXT、Nuxt UI、Tailwind CSS、PDF.js、AI SDK 等依赖的具体版本锁定在 `bun.lock`，许可随各依赖分发。内嵌文件 `src/entrypoints/boss/chat/geek-chat-core.2.0.4.umd.min.js` 保留现有第三方许可注释，不作为本版原创。构建生成的第三方 license 文件应随扩展保留。

根项目的 MIT 许可不替代第三方许可，也不授予 BOSS 平台名称、标识或服务的使用权。本项目不是平台官方产品。
