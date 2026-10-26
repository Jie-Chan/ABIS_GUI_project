<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { APP_NAME } from '@/constants/nav'
import { apiMode } from '@/api'

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
  <div class="login-page">
    <el-card class="login-card">
      <h2 class="title">{{ title }}</h2>
      <p class="subtitle">{{ subtitle }}</p>

      <el-form :model="form" label-position="top" @submit.prevent="handleSubmit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" @keyup.enter="handleSubmit" />
        </el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="handleSubmit">
          登录
        </el-button>
      </el-form>

      <p v-if="apiMode === 'mock'" class="hint">演示账户：admin / admin123（管理员）；ops.zhang / ops123（运维员）</p>
      <p v-else class="hint">混合接入预览：请使用后端真实账户登录。缺少接口的功能会标明演示数据；刷新后需重新登录。</p>
    </el-card>
  </div>
</template>

<style scoped>
.login-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: #f5f7fa; }
.login-card { width: 380px; }
.title { margin: 0 0 4px; font-size: 20px; }
.subtitle { margin: 0 0 20px; color: #909399; font-size: 13px; }
.hint { margin: 16px 0 0; color: #909399; font-size: 12px; line-height: 1.6; }
</style>
