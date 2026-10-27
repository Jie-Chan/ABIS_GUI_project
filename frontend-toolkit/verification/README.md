# ABIS 浏览器回归检查

这是与工程依赖隔离的 Node.js Playwright 检查包。原 webapp-testing 技能使用 Python，本目录使用 Node.js Playwright。`npm test` 顺序运行界面回归检查和个人账户专项检查。

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

界面回归还检查菜单相对页面居中、导航字号、1250/1000px 换行边界及控件重叠，确认桌面二次确认宽度为 420px、手机端保留左右边距，并验证取消账户操作及阈值变更不会提交。

执行结果保存在 qa-output：页面截图、report.json，失败时另有 failure.txt。默认输出和依赖目录已被忽略，不随 Git 提交。服务器上需要重新执行，既有本机通过记录不能替代服务器验证。

`review-profile.mjs` 覆盖新版登录背景及居中、账户菜单键盘操作、个人信息只读展示、密码必填和一致性校验、原密码错误、关闭后清空、重复提交、改密后重新登录及运维员权限。该脚本会在独立浏览器会话中修改 Mock 密码，结束后不影响其他预览会话；结果默认保存在 `qa-output/profile/`。只重跑该专项可使用 `node review-profile.mjs`。

Playwright 固定为本次使用的 1.64.1，package-lock.json 已提供；脚本不依赖原机器的 /tmp、Windows 字体路径或 PowerShell。
