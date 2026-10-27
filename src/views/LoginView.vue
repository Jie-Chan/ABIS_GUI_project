<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { APP_NAME } from '@/constants/nav'
import BrandMark from '@/components/BrandMark.vue'
import UiIcon from '@/components/UiIcon.vue'

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
    ElMessage.error(e.message || '登录失败')
    return
  } finally {
    loading.value = false
  }

  const raw = route.query.redirect
  const redirect = Array.isArray(raw) ? raw[0] : raw
  router.push(typeof redirect === 'string' && redirect ? redirect : { name: 'monitor' })
}
</script>

<template>
  <el-config-provider :message="{ offset: 24 }">
  <main class="login-page">
    <div class="architecture" aria-hidden="true">
      <svg viewBox="0 0 500 340" fill="none" class="architecture-lines">
        <path d="M250 60V176M65 176H435M250 176V240Q250 260 230 260H150V310M250 240Q250 260 270 260H350V310M65 176H0M150 310 120 340" stroke="currentColor" stroke-width="1.4" />
        <circle cx="250" cy="112" r="4" fill="currentColor" /><circle cx="158" cy="176" r="4" fill="currentColor" /><circle cx="340" cy="176" r="4" fill="currentColor" />
      </svg>
      <div class="diagram-node central">ABIS</div>
      <div class="diagram-node gateway"><UiIcon name="database" :size="26" /></div>
      <div class="diagram-node system"><UiIcon name="server" :size="26" /></div>
      <div class="diagram-node face"><UiIcon name="face" :size="26" /></div>
      <div class="diagram-node finger"><UiIcon name="fingerprint" :size="26" /></div>
    </div>
    <section class="login-content" aria-labelledby="login-heading">
      <div class="brand" :aria-label="title"><BrandMark /><strong>ABIS</strong><span>{{ title.replace(/^ABIS\s*/, '') }}</span></div>
      <h1 id="login-heading">欢迎登录</h1>
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

    </section>
    <footer class="login-footer">{{ title }}</footer>
  </main>
  </el-config-provider>
</template>

<style scoped>
.login-page { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: 88px 24px 104px; background: #f4f6fa; }
.login-content { position: relative; width: 400px; max-width: 100%; margin-top: -24px; }
.brand { display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--abis-navy); white-space: nowrap; }
.brand :deep(.brand-mark) { width: 32px; height: 32px; gap: 4px; }
.brand strong { font-size: 31px; letter-spacing: .5px; }
.brand > span:last-child { font-size: 17px; }
.login-content h1 { margin: 32px 0 8px; text-align: center; font-size: 32px; line-height: 1.4; font-weight: 650; }
.subtitle { margin: 0 0 30px; text-align: center; color: #718096; font-size: 14px; }
.login-content :deep(.el-form-item) { margin-bottom: 22px; }
.login-content :deep(.el-form-item__label) { color: #29394f; font-size: 14px; }
.login-content :deep(.el-input__wrapper) { min-height: 46px; padding: 0 13px; background: #fff; }
.login-content :deep(.el-input__prefix) { margin-right: 6px; color: #7d8da7; }
.login-button { width: 100%; height: 46px; margin-top: 2px; font-size: 15px; }
.architecture { position: absolute; z-index: -1; left: -50px; bottom: 0; width: min(32vw, 460px); aspect-ratio: 500 / 340; color: #bfd2f2; opacity: .55; pointer-events: none; overflow: hidden; }
.architecture-lines { width: 100%; height: 100%; }
.diagram-node { position: absolute; display: flex; align-items: center; justify-content: center; width: 66px; height: 62px; transform: translate(-50%, -50%); border: 1px solid currentColor; border-radius: 10px; background: #f4f6fa; }
.central { left: 50%; top: 51.76%; width: 78px; height: 72px; font-size: 19px; font-weight: 650; }
.gateway { left: 50%; top: 15%; }
.system { left: 13%; top: 51.76%; }
.face { left: 87%; top: 51.76%; }
.finger { left: 30%; top: 91%; }
.login-footer { position: absolute; bottom: 24px; right: 30px; color: #8d9aaf; font-size: 11px; }
.login-footer > span { margin: 0 6px; }
@media (max-width: 1000px) { .architecture { width: 240px; opacity: .3; } }
@media (max-width: 600px) {
  .login-page { padding: 96px 24px 80px; }
  .login-content { margin: 0; }
  .architecture { display: none; }
  .brand { gap: 9px; }
  .brand strong { font-size: 28px; }
  .brand > span:last-child { font-size: 15px; }
  .login-content h1 { margin-top: 28px; font-size: 28px; }
  .login-footer { right: 0; left: 0; bottom: 20px; text-align: center; }
}
</style>
