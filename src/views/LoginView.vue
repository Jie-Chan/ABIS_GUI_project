<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { APP_NAME } from '@/constants/nav'
import BrandMark from '@/components/BrandMark.vue'
import LoginBackdrop from '@/components/LoginBackdrop.vue'

const title = APP_NAME

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const form = ref({ username: '', password: '' })
const loading = ref(false)
const feedback = ref('')

async function handleSubmit() {
  if (loading.value) return
  feedback.value = ''
  if (!form.value.username.trim() || !form.value.password) {
    feedback.value = '请输入用户名与密码'
    return
  }
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)
  } catch (e) {
    // 登录失败事件须记入审计 —— 由 ABIS 侧落库（需求 2.1）
    feedback.value = e.message || '登录失败'
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
    <LoginBackdrop />
    <section class="login-content" aria-labelledby="login-heading">
      <h1 id="login-heading" class="brand" :aria-label="title"><BrandMark /><strong>ABIS</strong><span>{{ title.replace(/^ABIS\s*/, '') }}</span></h1>

      <el-form :model="form" label-position="top" novalidate @submit.prevent="handleSubmit">
        <el-form-item label="用户名" for="login-username">
          <el-input id="login-username" v-model="form.username" name="username" autocomplete="username" aria-required="true" :aria-describedby="feedback ? 'login-feedback' : undefined" @input="feedback = ''" />
        </el-form-item>
        <el-form-item label="密码" for="login-password">
          <el-input id="login-password" v-model="form.password" name="password" type="password" show-password autocomplete="current-password" aria-required="true" :aria-describedby="feedback ? 'login-feedback' : undefined" @input="feedback = ''" />
        </el-form-item>
        <p id="login-feedback" class="login-feedback" role="alert" aria-live="polite">{{ feedback }}</p>
        <el-button class="login-button" type="primary" native-type="submit" :loading="loading">登录</el-button>
      </el-form>

    </section>
  </main>
</template>

<style scoped>
@font-face { font-family: 'ABIS Login Wordmark'; src: url('/fonts/login/abis-wordmark-black.woff2') format('woff2'); font-style: normal; font-weight: 900; font-display: swap; unicode-range: U+0041-0042, U+0049, U+0053; }
.login-page { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: 48px 24px; background: #f1f5fb; }
.login-content { position: relative; width: 400px; max-width: 100%; }
.brand { display: flex; align-items: center; justify-content: center; gap: 0; width: 87%; margin: 0 auto 44px; color: #102746; line-height: 1; white-space: nowrap; }
.brand :deep(.brand-mark) { width: 36px; height: 36px; gap: 3px; }
.brand strong { margin: 0 13px 0 18px; font-family: 'ABIS Login Wordmark', 'Noto Sans CJK SC', sans-serif; font-size: 45px; font-weight: 900; letter-spacing: 1.25px; }
.brand > span:last-child { font-size: 34px; font-weight: 600; }
.login-content :deep(.el-form-item) { margin-bottom: 24px; }
.login-content :deep(.el-form-item:last-of-type) { margin-bottom: 0; }
.login-content :deep(.el-form-item__label) { height: auto; margin-bottom: 8px; padding: 0; color: #29394f; font-size: 16px; line-height: 20px; }
.login-content :deep(.el-input__wrapper) { min-height: 48px; padding: 0 13px; background: #ffffffec; box-shadow: 0 0 0 1px #c9d5e8 inset, 0 1px 2px #10274603; }
.login-content :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #9ab9f1 inset; }
.login-content :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px #3268e8 inset, 0 0 0 3px #3268e812; }
.login-feedback { min-height: 22px; margin: 0 0 8px; color: var(--el-color-danger); font-size: 13px; line-height: 22px; overflow-wrap: anywhere; }
.login-button { width: 100%; height: 48px; font-size: 17px; font-weight: 600; --el-color-primary: #2463f8; --el-button-hover-bg-color: #4077ff; --el-button-hover-border-color: #4077ff; background: radial-gradient(ellipse at 50% 0, #ffffff08, #ffffff00 72%), linear-gradient(105deg, #2161f7 0%, #2364f9 52%, #2462f7 100%); box-shadow: inset 0 1px 0 #ffffff1f, 0 4px 12px #2463ff0d; }
.login-button:hover { background: radial-gradient(ellipse at 50% 0, #ffffff14, #ffffff00 72%), linear-gradient(105deg, #3671ff, #4079ff 52%, #3772ff); }
.login-button:active { background: linear-gradient(105deg, #1e57eb, #245ff0 52%, #2059ec); }
@media (max-width: 600px) {
  .brand { width: max-content; max-width: 100%; justify-content: center; gap: 0; margin-bottom: 36px; }
  .brand strong { margin-inline: 11px; font-size: clamp(30px, 9.75vw, 38px); letter-spacing: .75px; }
  .brand :deep(.brand-mark) { width: clamp(28px, 8.2vw, 32px); height: clamp(28px, 8.2vw, 32px); gap: 3px; }
  .brand > span:last-child { font-size: clamp(21px, 6.15vw, 24px); }
}
</style>
