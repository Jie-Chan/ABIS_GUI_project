<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { APP_NAME } from '@/constants/nav'
import BrandMark from '@/components/BrandMark.vue'
import UiIcon from '@/components/UiIcon.vue'
import LoginBackdrop from '@/components/LoginBackdrop.vue'

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
    <LoginBackdrop />
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
.login-page { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; padding: 88px 24px 104px; background: radial-gradient(ellipse at 0 5%, #d9eaff 0, transparent 36%), radial-gradient(ellipse at 100% 100%, #dceaff 0, transparent 40%), #f5f8fd; }
.login-content { position: relative; width: 400px; max-width: 100%; margin-top: -24px; }
.brand { display: flex; align-items: center; justify-content: center; gap: 12px; color: var(--abis-navy); white-space: nowrap; }
.brand :deep(.brand-mark) { width: 38px; height: 38px; gap: 4px; }
.brand strong { font-size: 40px; letter-spacing: .5px; }
.brand > span:last-child { font-size: 20px; font-weight: 600; }
.login-content h1 { margin: 32px 0 8px; text-align: center; font-size: 28px; line-height: 1.4; font-weight: 650; }
.subtitle { margin: 0 0 30px; text-align: center; color: #718096; font-size: 14px; }
.login-content :deep(.el-form-item) { margin-bottom: 22px; }
.login-content :deep(.el-form-item__label) { color: #29394f; font-size: 14px; }
.login-content :deep(.el-input__wrapper) { min-height: 46px; padding: 0 13px; background: #ffffffeb; box-shadow: 0 0 0 1px #cfddf4 inset; }
.login-content :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #9ab9f1 inset; }
.login-content :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px #3268e8 inset, 0 0 0 3px #3268e812; }
.login-content :deep(.el-input__prefix) { margin-right: 6px; color: #7d8da7; }
.login-button { width: 100%; height: 46px; margin-top: 2px; font-size: 15px; box-shadow: 0 7px 18px #3268e81c; }
.login-footer { position: absolute; bottom: 24px; right: 30px; color: #8d9aaf; font-size: 11px; }
.login-footer > span { margin: 0 6px; }
@media (max-width: 600px) {
  .login-page { padding: 96px 24px 80px; }
  .login-content { margin: 0; }
  .brand { gap: 9px; }
  .brand strong { font-size: 28px; }
  .brand :deep(.brand-mark) { width: 30px; height: 30px; }
  .brand > span:last-child { font-size: 15px; }
  .login-content h1 { margin-top: 28px; font-size: 28px; }
  .login-footer { right: 0; left: 0; bottom: 20px; text-align: center; }
}
</style>
