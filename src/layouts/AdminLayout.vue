<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABEL } from '@/constants/roles'
import { NAV_ITEMS, APP_NAME } from '@/constants/nav'
import BrandMark from '@/components/BrandMark.vue'
import UiIcon from '@/components/UiIcon.vue'
import DataSourceBadge from '@/components/DataSourceBadge.vue'
import { PAGE_DESCRIPTIONS, isMockPreview, dataSourceNote } from '@/constants/presentation'

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
  <el-container class="abis-shell console-layout">
    <el-aside width="224px" class="aside">
      <div class="brand" :aria-label="title">
        <BrandMark /><strong>ABIS</strong><span>{{ title.replace(/^ABIS\s*/, '') }}</span>
      </div>
      <div class="nav-caption">工作空间</div>
      <el-menu :default-active="route.name" router aria-label="控制台导航">
        <el-menu-item v-for="item in navItems" :key="item.name" :index="item.name">
          <UiIcon :name="item.name" /><span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <span>{{ title }}</span>
        <small><i />{{ isMockPreview ? 'Mock 演示环境' : 'HTTP 接口模式' }}</small>
      </div>
    </el-aside>

    <el-container class="workspace">
      <el-header class="header">
        <div class="breadcrumb"><span>控制台</span><b>/</b><strong>{{ currentTitle }}</strong></div>
        <div class="user">
          <DataSourceBadge />
          <span class="avatar" aria-hidden="true">{{ roleLabel.slice(0, 1) }}</span>
          <span class="user-name" :title="`${displayName}（${roleLabel}）`">{{ displayName }}<small>{{ roleLabel }}</small></span>
          <el-button link @click="handleLogout">{{ logoutLabel }}</el-button>
        </div>
      </el-header>

      <el-main class="workspace-main">
        <div class="page-intro">
          <h1>{{ currentTitle }}</h1>
          <p>{{ PAGE_DESCRIPTIONS[route.name] }}</p>
        </div>
        <el-alert class="source-note" :title="dataSourceNote" :type="isMockPreview ? 'warning' : 'info'" show-icon :closable="false" />
        <router-view />
        <footer class="workspace-footer">ABIS 管理控制台 <span>·</span> {{ isMockPreview ? 'Mock 界面预览' : 'HTTP 接口模式' }}</footer>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.console-layout { min-height: 100vh; align-items: flex-start; }
.aside { position: sticky; top: 0; display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: var(--abis-navy); color: #bcc9dc; }
.brand { height: 84px; display: flex; flex-shrink: 0; align-items: center; gap: 11px; padding: 0 22px; white-space: nowrap; }
.brand strong { color: #fff; font-size: 24px; letter-spacing: .5px; }
.brand > span:last-child { font-size: 12px; }
.nav-caption { padding: 16px 24px 10px; color: #8d9eb7; font-size: 11px; letter-spacing: 1px; }
.aside :deep(.el-menu) { background: transparent; border: none; padding: 0 12px; --el-menu-text-color: #c0cce0; --el-menu-active-color: #fff; --el-menu-hover-bg-color: #213650; }
.aside :deep(.el-menu-item) { position: relative; height: 50px; padding: 0 16px !important; margin-bottom: 7px; gap: 15px; border-radius: 6px; font-size: 13px; }
.aside :deep(.el-menu-item.is-active) { background: #2a4264; font-weight: 600; }
.aside :deep(.el-menu-item.is-active)::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; background: #5990ff; border-radius: 2px; }
.sidebar-footer { margin-top: auto; padding: 28px 24px; font-size: 12px; line-height: 1.8; }
.sidebar-footer small { display: flex; align-items: center; gap: 7px; color: #97a8bf; font-size: 11px; }
.sidebar-footer i { width: 6px; height: 6px; border-radius: 50%; background: #97a8bf; }
.workspace { min-width: 0; flex: 1; flex-direction: column; }
.header { position: sticky; top: 0; z-index: 20; height: 68px; display: flex; gap: 20px; align-items: center; justify-content: space-between; padding: 0 28px; background: #fff; border-bottom: 1px solid var(--abis-border); }
.breadcrumb { display: flex; align-items: center; gap: 12px; font-size: 12px; white-space: nowrap; }
.breadcrumb > span { color: #7c8ba1; }
.breadcrumb b { color: #c3ccd9; font-weight: 400; }
.breadcrumb strong { font-weight: 500; }
.user { display: flex; align-items: center; gap: 14px; font-size: 12px; }
.avatar { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: #3268e8; background: #edf2ff; font-weight: 600; margin-left: 8px; }
.user-name { display: flex; flex-direction: column; gap: 2px; }
.user-name small { font-size: 10px; color: #8190a5; }
.user :deep(.el-button) { padding-left: 14px; border-left: 1px solid var(--abis-border); border-radius: 0; font-size: 12px; }
.workspace-main { min-width: 0; padding: 28px; overflow: visible; }
.page-intro { margin-bottom: 18px; }
.page-intro h1 { margin: 0 0 8px; font-size: 26px; font-weight: 650; letter-spacing: -.5px; line-height: 1.4; }
.page-intro p { margin: 0; color: #718096; font-size: 13px; }
.source-note { margin-bottom: 20px; border: 1px solid #f5e2bf; background: #fff8ec; }
.source-note :deep(.el-alert__title) { font-size: 12px; }
.source-note.el-alert--info { border-color: #dae4f6; background: #f0f5ff; }
.workspace-footer { padding-top: 24px; color: #8b98ab; font-size: 11px; text-align: right; }
.workspace-footer span { margin: 0 7px; }
@media (min-width: 1700px) { .workspace-main { padding: 32px 40px; } }
@media (max-width: 1100px) {
  .aside { width: 200px; }
  .brand { padding: 0 18px; gap: 8px; }
  .brand strong { font-size: 21px; }
  .brand > span:last-child { font-size: 11px; }
  .header { padding: 0 20px; }
  .workspace-main { padding: 24px 20px; }
  .breadcrumb > span, .breadcrumb b { display: none; }
}
@media (max-width: 767px) {
  .console-layout { flex-direction: column; }
  .aside { position: static; width: 100%; height: auto; overflow: visible; }
  .brand { height: 60px; }
  .nav-caption, .sidebar-footer { display: none; }
  .aside :deep(.el-menu) { display: flex; padding: 0 8px 8px; overflow-x: auto; }
  .aside :deep(.el-menu-item) { height: 40px; margin: 0; padding: 0 12px !important; gap: 7px; flex-shrink: 0; font-size: 12px; }
  .aside :deep(.ui-icon) { width: 17px; }
  .workspace { width: 100%; }
  .header { height: auto; min-height: 62px; padding: 10px 16px; gap: 12px; flex-wrap: wrap; }
  .breadcrumb { font-size: 11px; }
  .user { gap: 10px; margin-left: auto; }
  .user-name, .avatar { display: none; }
  .user :deep(.source-badge) { padding: 3px 7px; font-size: 10px; }
  .workspace-main { padding: 22px 16px; }
  .page-intro h1 { font-size: 23px; }
  .page-intro p { font-size: 12px; }
}
</style>
