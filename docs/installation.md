# 安装与更新

当前版本为 **0.5.2.3**。推荐使用最新稳定版 Chrome；当前交付验证以 Chrome 为准。

## 使用安装包

1. 普通用户只下载 [Chrome 安装版](https://github.com/az1412/jev-job-helper/releases/download/v0.5.2.3/00-Jev-Job-Helper-0.5.2.3-Chrome-Install.zip)，文件名为 `00-Jev-Job-Helper-0.5.2.3-Chrome-Install.zip`。这是已编译的扩展，包含中文离线安装指南，无需安装开发工具。
2. 将 ZIP 解压到一个固定目录，确认其中直接包含 `manifest.json`。
3. 打开 `chrome://extensions`，启用右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选中包含 `manifest.json` 的目录。
5. 刷新已经打开的 BOSS 直聘标签页，再按 [首次使用指南](getting-started.md) 配置。

完整解压后可双击 `先打开我-安装指南.html` 查看图解步骤。旧的 `-chrome.zip` 是不含新手指南的同版扩展，仅作备用；源码和文档附件供开发或查阅，普通用户无需下载。扩展首次需要在 Chrome 中手动加载一次，安装后保留原解压文件夹。

不要把 ZIP 文件直接拖入作为解压目录。GitHub 自动生成的 **Source code** 是源码，需要构建；它不是扩展安装包。

## 从源码构建

需要 [Git](https://git-scm.com/downloads) 和 [Bun](https://bun.sh/docs/installation)。已验证的 Bun 版本为 **1.3.12**；请优先使用该版本复现。

使用 Git 时，从本仓库的 **Code** 按钮复制克隆地址，克隆后进入项目根目录，执行：

```sh
bun install --frozen-lockfile
bun run build:chrome
```

然后按上面的 Chrome 加载步骤选择 `.output/chrome-mv3`。

本发布快照及文件名以 `-source.zip` 结尾的完整源码包，均包含 `packages/devlog-ui/src` 和 `packages/devlog-ui/LICENSE`。日志组件以普通源码目录随附，无需初始化 Git 子模块。

依赖安装会自动应用并校验 [日志子模块补丁](devlog-patch.md)。不要把日志组件替换成任意最新版本；遇到「内容未识别」时先保留本地修改并检查差异，不要直接覆盖。

请将源码包解压到独立项目目录。放进另一个仓库已忽略的子目录，可能使 Tailwind 的源码扫描异常缓慢。

## 更新已有安装

1. 结束当前运行，记录仍需处理的岗位。刷新页面会清除本轮续跑状态。
2. 保留原安装目录：使用新包替换该目录中的文件，或在原源码目录重新构建。
3. 在 `chrome://extensions` 中点击该扩展的「重新加载」。
4. 刷新 BOSS 标签页，核对版本、求职意向和已保存配置。

不要为了普通更新卸载扩展或清空浏览器存储。更换加载目录可能改变开发版扩展 ID，使原配置看起来像丢失。扩展存储和 BOSS 页面日志的区别见 [隐私说明](../PRIVACY.md)。

## 校验下载文件

Release 若附带 `SHA256SUMS` 清单，可核对下载文件的 SHA-256。

Windows PowerShell：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "下载的安装包.zip"
```

macOS：`shasum -a 256 下载的安装包.zip`。Linux：`sha256sum 下载的安装包.zip`。输出应与清单中对应文件名的值相同。

## 其他浏览器

| 浏览器 | 构建命令 | 当前说明 |
| --- | --- | --- |
| Chrome | `bun run build:chrome` | 当前实际验证目标 |
| Edge | `bun run build:edge` | 有构建入口，本次未完成安装验收 |
| Firefox | `bun run build:firefox` | 有构建入口；永久安装通常还需要签名，本次未完成安装验收 |

本项目没有将上游作者发布的商店版本作为 Jev 版本的下载入口。
