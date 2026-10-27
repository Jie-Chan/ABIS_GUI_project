# ABIS 前端界面优化工具

本目录随工程一起提交 Git，供新服务器继续开展前端界面优化。不包含运行依赖、浏览器安装包、个人登录配置或本机测试输出。

## 目录

```text
frontend-toolkit/
├── skills/                 三个推荐技能，含原许可证和辅助文件
│   ├── frontend-design/
│   ├── theme-factory/
│   └── webapp-testing/
├── reference/              imagegen、skill-installer 的说明与辅助资源
├── verification/           本项目的 46 项浏览器检查脚本及依赖锁文件
├── install-skills.sh        离线复制推荐技能的脚本
└── provenance.json          上游仓库、版本与下载日期
```

## 技能用途

| 工具 | 在 ABIS 中的用途 |
| --- | --- |
| frontend-design | 界面布局、视觉层级、字体和组件细节；继续使用当前 Vue/Element Plus 工程 |
| theme-factory | 配色、字体和主题参考；落实到 theme.css 及 Element Plus 变量 |
| webapp-testing | 基于 Playwright 做交互、截图和日志检查；原技能使用 Python |
| reference/imagegen | 修改代码前生成供审阅的静态示意图；新环境必须另有相应图像工具能力 |
| reference/skill-installer | 安装或更新技能的方法与脚本参考 |

三个推荐技能固定于 Anthropic skills 提交 `dbd4588f9e1033efb41dad4bef2f7947c8993d44`，许可证随各目录保留，来源见 provenance.json。复制技能说明不会自动安装其依赖，也不会自动提供图像生成服务。

## 在新服务器使用

克隆工程并进入根目录后，先安装推荐技能：

```bash
bash frontend-toolkit/install-skills.sh
```

默认复制到用户的 `~/.agents/skills`。可以把目标目录作为第一个参数指定；已有同名技能时脚本退出，不覆盖原版本。`reference/` 不会自动安装或覆盖系统技能。

这一步使用的是包内文件，无需再次从 GitHub 下载。技能目录是否被识别取决于所用客户端；Codex 的本地发现规则参考 [OpenAI Docs](https://learn.chatgpt.com/docs/build-skills)。新会话未显示技能时重启客户端。

项目开发环境使用已验证的 Node.js 22.23.2：

```bash
npm ci
npm run dev:mock -- --host 127.0.0.1
```

Mock 端口固定为 5186。保持开发服务运行，再按 verification/README.md 安装测试依赖与 Chromium，执行检查。

## 使用约束

- 沿用已确认的第二版视觉风格，保留 Vue/Element Plus 技术栈。
- 先出示意图供审阅，再修改对应代码。
- 默认使用 Mock，保留数据来源提示。
- API、store、权限、校验与提交行为的变更需单独确认。
- 本项目回归脚本会检查 Mock 模式；只在 Mock 开发服务运行。

工程进度、待办和服务器启动方式见 [迁移交接文档](../docs/2026-10-27-服务器迁移交接.md)。
