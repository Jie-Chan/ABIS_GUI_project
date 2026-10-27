# ABIS 浏览器回归检查

这是与工程依赖隔离的 Node.js Playwright 检查包。原 webapp-testing 技能使用 Python，本目录则保留本项目实际用过的 46 项检查。

先在工程根目录启动 Mock，保持服务运行：

```bash
npm run dev:mock -- --host 127.0.0.1
```

另开终端，进入本目录：

```bash
cd frontend-toolkit/verification
npm ci
npx playwright install chromium
npm test
```

若 Chromium 提示缺少 Linux 系统依赖，可由有相应权限的人员执行 `npx playwright install --with-deps chromium`。中文截图需要服务器安装中文字体，例如 Noto Sans CJK；字体不随目录携带。

可覆盖地址和输出目录：

```bash
ABIS_PREVIEW_URL=http://127.0.0.1:5186 ABIS_QA_OUTPUT_DIR=./qa-output npm test
```

脚本首先检查开发服务源码中的 Mock 配置，随后验证登录、导航、权限、账户字段、主要操作和窄屏布局。账户创建/编辑/删除等操作仅用于当前 Mock 会话；不用于真实接口或生产构建。

执行结果保存在 qa-output：页面截图、report.json，失败时另有 failure.txt。默认输出和依赖目录已被忽略，不随 Git 提交。服务器上需要重新执行，既有本机通过记录不能替代服务器验证。

Playwright 固定为本次使用的 1.64.1，package-lock.json 已提供；脚本不依赖原机器的 /tmp、Windows 字体路径或 PowerShell。
