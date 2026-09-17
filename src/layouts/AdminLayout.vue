<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABEL } from '@/constants/roles'
import { NAV_ITEMS, APP_NAME } from '@/constants/nav'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const title = APP_NAME
const logoutLabel = '退出登录'

/**
 * 导航项按权限过滤 —— 需求 1.1 权限矩阵，取自 NAV_ITEMS（唯一来源）。
 * 运维员看不到「匹配阈值修改」与「账户管理」。
 */
const navItems = computed(() => NAV_ITEMS.filter((item) => auth.hasPermission(item.permission)))

const currentTitle = computed(() => route.meta.title || '')
const roleLabel = computed(() => ROLE_LABEL[auth.role] || auth.role)
const displayName = computed(() => auth.account?.displayName || auth.account?.username || '')

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', { type: 'warning' })
  } catch {
    // 用户点「取消」时 ElMessageBox.confirm 会 **reject 一个 'cancel'**。
    // 不接住它，本函数作为 @click 处理器被 Vue 的异步错误通道调用，
    // 于是**每次取消都在控制台留下一条报错**（由 Vue 的 `errorHandler` 打印；
    // ⚠ **不是**「unhandled rejection」——实测 0 次，且已用阳性对照证明监听器抓得到，
    // 见 `check-task8.js` 的 4.2 / 4.3）。
    // 功能没坏，但「取消」是常规操作，不该产生错误 —— 直接 return 即可。
    return
  }
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" class="aside">
      <div class="brand">{{ title }}</div>
      <el-menu :default-active="route.name" router>
        <el-menu-item v-for="item in navItems" :key="item.name" :index="item.name">
          {{ item.label }}
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span class="page-title">{{ currentTitle }}</span>
        <span class="user">
          {{ displayName }}（{{ roleLabel }}）
          <el-button link type="primary" @click="handleLogout">{{ logoutLabel }}</el-button>
        </span>
      </el-header>

      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.aside { background: #fff; border-right: 1px solid #e4e7ed; }
.brand { height: 60px; line-height: 60px; text-align: center; font-weight: 600; font-size: 16px; border-bottom: 1px solid #e4e7ed; }
.header { display: flex; align-items: center; justify-content: space-between; background: #fff; border-bottom: 1px solid #e4e7ed; }
.page-title { font-size: 16px; font-weight: 600; }
.user { font-size: 14px; color: #606266; }
</style>
