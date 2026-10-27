<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { apiMode } from '@/api'
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
 * 运维员可进入账户列表，写操作在账户页按职责区分。
 */
const navItems = computed(() => NAV_ITEMS.filter((item) => auth.hasPermission(item.permission)))

const currentTitle = computed(() => route.meta.title || '')
const roleLabel = computed(() => ROLE_LABEL[auth.role] || '角色待后端提供')
const sourceNote = computed(() => ({
  monitor: '监控数据来自真实接口。',
  threshold: '阈值读取与保存均为真实操作。',
  accounts: '账户列表及账户操作均连接真实服务。当前支持用户名、姓名搜索；初始密码和重置密码的交付方式仍需后端确认。',
  logs: '列表来自真实接口；导出 CSV 仍为独立 mock 样本，不是当前真实列表。筛选参数已发送，实际支持情况待联调。',
  audits: '列表来自真实接口；导出 CSV 仍为独立 mock 样本，不是当前真实列表。筛选参数已发送，实际支持情况待联调。',
}[route.name] || ''))
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
  try { await auth.logout() }
  catch (e) { ElMessage.warning(`本地已退出，服务端注销未确认：${e.message}`) }
  finally { router.push({ name: 'login' }) }
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
        <el-alert v-if="apiMode === 'hybrid'" title="混合接入预览" :description="sourceNote" type="warning" :closable="false" style="margin-bottom: 12px" />
        <el-alert v-if="apiMode === 'hybrid' && auth.account?.identityPending" title="后端未返回可识别角色，当前仅开放读取预览。" type="info" :closable="false" style="margin-bottom: 12px" />
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
