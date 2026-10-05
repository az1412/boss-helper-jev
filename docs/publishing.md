# GitHub 上传与发布

本目录是 **Boss Helper Jev 0.5.2.2 的脱敏发布快照**。它包含可构建的完整源码、文档和许可；没有旧开发仓库的提交历史、远程地址、旧截图或本地资料。

## 使用这份快照

直接从本目录准备新的源码仓库。不要将旧仓库的 `.git`、旧截图、浏览器导出配置或 `local/` 复制回来，也不要把整个旧开发目录直接上传。

`packages/devlog-ui/` 已按普通源码目录随附，并保留固定上游基线、补丁及许可证；不需要初始化子模块。源码提交应包含此目录，而不是只有一个未交付的本地子模块引用。

本次创建的本地发布目录已初始化空 Git 仓库，没有提交或远程地址。它设置了仅对该目录生效的匿名提交身份：名称 `Boss Helper Jev`，邮箱 `maintainer@example.invalid`。该邮箱使用保留的 `.invalid` 域名，不是实际联系地址，也不会自动关联 GitHub 账号。

若要将贡献关联到你的 GitHub 账号，在首次提交前使用 GitHub 设置中显示的真实 noreply 邮箱。不要改回私人邮箱。ZIP 不包含 `.git` 配置，解压到新目录后需重新配置：

```sh
git init --initial-branch=main
git config --local user.name "Boss Helper Jev"
git config --local user.email "maintainer@example.invalid"
git config --local user.useConfigOnly true
```

以上命令只初始化和配置当前仓库，不提交、不推送，也不改全局 Git 设置。若更换上述身份，提交前再次核对。

## 源码仓库应包含

| 内容 | 用途 |
| --- | --- |
| `README.md`、`docs/`、`CHANGELOG.md` | 介绍、安装、配置、版本说明与验证 |
| `LICENSE`、`THIRD_PARTY_NOTICES.md` | 原版权与第三方来源，必须保留 |
| `PRIVACY.md`、`SECURITY.md` | 数据与安全说明 |
| `CONTRIBUTING.md`、`CLAUDE.md` | 贡献与开发约定 |
| `.github/` | 反馈模板和既有工作流 |
| `src/`、`public/`、`demo/`、`tests/`、`scripts/` | 应用、资源、预览、测试与补丁 |
| `packages/devlog-ui/` | 固定版本日志组件的完整源码与许可 |
| `package.json`、`bun.lock`、构建配置 | 可复现安装 |

`.gitignore` 已排除依赖、构建目录、缓存、本地资料、环境文件、抓包、私钥类文件及本次发现的旧截图文件名。不要使用强制添加绕过这些规则。忽略规则不会自动匿名化任何新加入的文件；新截图与日志仍需检查。

## 提交前核对

```sh
git status --short
git config --local user.name
git config --local user.email
git remote -v
bun install --frozen-lockfile
bun scripts/apply-devlog-patch.mjs --check
bun test ./tests
bun run lint
bun run build:chrome
git diff --check
git diff --cached --check
```

首次导入快照时，全量暂存检查可能提示原有补丁上下文或提示词中的空白，详见 [验证记录](privacy-release-20261003.md)；不要直接删掉补丁的上下文前缀或更改提示词来消除提示。

确认 README 版本与 `package.json` 一致，日志组件已包含，没有密钥、简历、Cookie、原始日志、抓包或个人备份。检查本版 GitHub 仓库所有者；确定地址后再填写 `src/utils/projectInfo.ts` 的 `repositoryUrl` 并重新构建。

## Release 附件

构建产物放到 Releases，不提交 `.output/`。本批次文件见 [脱敏与验证](privacy-release-20261003.md)。

- Chrome ZIP：根目录包含 `manifest.json`、PDF worker、隐私说明和许可。
- 完整源码 ZIP：包括日志组件源码、锁文件、补丁、测试和文档，不含任何 `.git`。
- 文档 ZIP：便于审阅，需放入完整项目使用；不是可安装扩展。
- SHA256SUMS：核对这三个 ZIP 的下载完整性。

Chrome 包可用 `bun run zip:chrome` 构建。GitHub 自动生成的 Source code 仍需安装依赖后构建。只标注实际验收过的浏览器；当前建议作为 Pre-release。实际发布后，再更新 README 和 CHANGELOG 的「未发布」状态，Release 正文可参考 [0.5.2.2 发布说明](release-notes-0.5.2.2.md)。

## 已有工作流

`.github/workflows/main.yml` 沿用原配置：任意标签推送会构建三个浏览器，并上传到名为 `latest` 的预发布；使用最新 Bun、非冻结安装，没有运行本地测试。

本次没有修改或执行该工作流。准备推送标签时，先确认接受该行为；标签并非没有副作用的版本标记。
