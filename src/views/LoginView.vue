<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { APP_NAME } from '@/constants/nav'
import BrandMark from '@/components/BrandMark.vue'
import UiIcon from '@/components/UiIcon.vue'
import DataSourceBadge from '@/components/DataSourceBadge.vue'
import { isMockPreview } from '@/constants/presentation'

const title = APP_NAME
const subtitle = '请使用控制台账户登录'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const form = ref({ username: '', password: '' })
const loading = ref(false)

async function handleSubmit() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入用户名与密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)
  } catch (e) {
    // 登录失败事件须记入审计 —— 由 ABIS 侧落库（需求 2.1）
    ElMessage.error(e.message || '登录失败')
    return
  } finally {
    loading.value = false
  }

  // 跳转必须留在 try 之外：导航失败和登录失败是两回事。
  // 把它放进 try 里，任何导航异常都会被上面的 catch 报成「登录失败」——
  // 而用户其实**已经登录成功**了，提示与事实相反。
  const raw = route.query.redirect
  // `?redirect=a&redirect=b` 会被解析成**数组**。数组不是合法路由位置：
  // vue-router 会把它解析回当前位置（仍是 /login），且**不抛错**（只返回 NavigationFailure），
  // 于是用户在「登录成功」之后继续停在登录页，且没有任何提示。
  // 只取第一项，且必须确认是字符串。
  const redirect = Array.isArray(raw) ? raw[0] : raw
  router.push(typeof redirect === 'string' && redirect ? redirect : { name: 'monitor' })
}
</script>

<template>
  <main class="login-page">
    <section class="login-brand-panel" :aria-label="title">
      <div class="brand"><BrandMark /><strong>ABIS</strong><span>{{ title.replace(/^ABIS\s*/, '') }}</span></div>
      <div class="brand-content">
        <h1>生物识别系统<br />{{ title.replace(/^ABIS\s*/, '') }}</h1>
        <p>服务监控 <span>·</span> 阈值配置 <span>·</span> 日志审计</p>
        <div class="architecture" aria-hidden="true">
          <svg viewBox="0 0 500 340" fill="none" class="architecture-lines">
            <path d="M250 70V176M95 176H405M250 176V235Q250 252 230 252H150V285M250 235Q250 252 270 252H350V285" stroke="#4772a5" stroke-width="1.5" />
            <circle cx="250" cy="114" r="3" fill="#4d99fb" /><circle cx="172" cy="176" r="3" fill="#4d99fb" /><circle cx="328" cy="176" r="3" fill="#4d99fb" />
          </svg>
          <div class="diagram-node central">ABIS</div>
          <div class="diagram-node gateway"><UiIcon name="server" :size="28" /><span>Gateway</span></div>
          <div class="diagram-node system"><UiIcon name="threshold" :size="28" /><span>System</span></div>
          <div class="diagram-node face"><UiIcon name="face" :size="28" /><span>Face</span></div>
          <div class="diagram-node finger"><UiIcon name="fingerprint" :size="28" /><span>Fingerprint</span></div>
          <div class="diagram-node database"><UiIcon name="database" :size="28" /><span>PostgreSQL</span></div>
        </div>
      </div>
      <span class="brand-footer">ABIS 生物识别系统</span>
    </section>
    <section class="login-form-panel" aria-labelledby="login-heading">
      <div class="login-card">
        <DataSourceBadge />
        <h2 id="login-heading">欢迎登录</h2>
        <p class="subtitle">{{ subtitle }}</p>

        <el-form :model="form" label-position="top" @submit.prevent="handleSubmit">
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="请输入用户名" autocomplete="username">
              <template #prefix><UiIcon name="accounts" :size="19" /></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" autocomplete="current-password" @keyup.enter="handleSubmit">
              <template #prefix><UiIcon name="lock" :size="19" /></template>
            </el-input>
          </el-form-item>
          <el-button class="login-button" type="primary" :loading="loading" @click="handleSubmit">登录</el-button>
        </el-form>

        <div v-if="isMockPreview" class="demo-section">
          <div class="demo-accounts">
            <h3>演示账户</h3>
            <div><span>管理员</span><code>admin / admin123</code></div>
            <div><span>运维员</span><code>ops.zhang / ops123</code></div>
          </div>
          <p class="hint">当前使用模拟数据，非真实服务环境。</p>
        </div>
        <p v-else class="hint http-hint">当前使用 HTTP 接口，请使用真实控制台账户登录。</p>
      </div>
      <span class="preview-footer">{{ isMockPreview ? 'Mock 界面预览' : 'HTTP 接口模式' }} <span>·</span> ABIS 管理控制台</span>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: 46% 54%; }
.login-brand-panel { min-width: 0; display: flex; flex-direction: column; background: var(--abis-navy); color: #fff; padding: 40px 44px 28px; }
.brand { display: flex; align-items: center; gap: 14px; }
.brand strong { font-size: 29px; letter-spacing: .5px; }
.brand > span:last-child { font-size: 15px; color: #d4deed; }
.brand-content { width: 100%; max-width: 500px; margin: auto; padding: 48px 0 28px; }
.brand-content h1 { margin: 0; font-size: clamp(30px, 3.2vw, 49px); line-height: 1.45; letter-spacing: 1px; font-weight: 650; }
.brand-content > p { margin: 20px 0 28px; font-size: 16px; color: #a5bad6; }
.brand-content > p span { margin: 0 8px; color: #607b9d; }
.architecture { position: relative; width: 100%; aspect-ratio: 500 / 340; max-height: 340px; }
.architecture-lines { width: 100%; height: 100%; }
.diagram-node { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 90px; height: 82px; transform: translate(-50%, -50%); border: 1px solid #6890c0; border-radius: 12px; color: #a6c7f2; background: var(--abis-navy); font-size: 11px; }
.central { left: 50%; top: 51.76%; width: 100px; height: 90px; color: #fff; border-color: #4d99fb; font-size: 24px; font-weight: 650; }
.gateway { left: 50%; top: 16%; }
.system { left: 13%; top: 51.76%; }
.face { left: 87%; top: 51.76%; }
.finger { left: 30%; top: 85%; }
.database { left: 70%; top: 85%; }
.brand-footer { color: #8fa5c0; font-size: 11px; margin-top: 20px; }
.login-form-panel { min-width: 0; display: flex; position: relative; align-items: center; justify-content: center; padding: 60px 40px; }
.login-card { width: 440px; max-width: 100%; padding: 34px; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; box-shadow: 0 8px 36px rgb(36 59 93 / 4%); }
.login-card h2 { margin: 24px 0 8px; font-size: 30px; line-height: 1.4; font-weight: 650; }
.subtitle { margin: 0 0 28px; color: #718096; font-size: 13px; }
.login-card :deep(.el-form-item) { margin-bottom: 22px; }
.login-card :deep(.el-form-item__label) { color: #29394f; font-size: 13px; }
.login-card :deep(.el-input__wrapper) { min-height: 44px; padding: 0 12px; }
.login-card :deep(.el-input__prefix) { margin-right: 5px; color: #7d8da7; }
.login-button { width: 100%; height: 44px; margin-top: 2px; }
.demo-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--abis-border); }
.demo-accounts { padding: 14px 16px; background: #f0f5ff; border: 1px solid #dce7fb; border-radius: 6px; font-size: 12px; }
.demo-accounts h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.demo-accounts > div { display: flex; align-items: center; gap: 18px; padding: 7px 0; }
.demo-accounts > div + div { border-top: 1px solid #dfe8f8; }
.demo-accounts code { font-family: inherit; color: #435d83; font-size: 12px; }
.hint { margin: 10px 0 0; color: #9b691f; font-size: 11px; line-height: 1.8; }
.http-hint { color: #718096; }
.preview-footer { position: absolute; bottom: 24px; right: 30px; color: #8d9aaf; font-size: 11px; }
.preview-footer > span { margin: 0 6px; }
@media (max-width: 1100px) {
  .login-brand-panel { padding: 30px 28px; }
  .diagram-node { width: 75px; height: 72px; font-size: 10px; }
  .central { width: 84px; height: 78px; font-size: 22px; }
  .brand-content > p { font-size: 13px; }
}
@media (max-width: 767px) {
  .login-page { grid-template-columns: 1fr; }
  .login-brand-panel { padding: 22px 24px; }
  .brand strong { font-size: 24px; }
  .brand-content, .brand-footer { display: none; }
  .login-form-panel { padding: 32px 16px 64px; }
  .login-card { padding: 26px; }
  .login-card h2 { font-size: 27px; }
  .preview-footer { right: 0; left: 0; bottom: 20px; text-align: center; }
}
</style>
