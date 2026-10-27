<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
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
 * 先按原权限矩阵过滤，再做展示分组；不新增路由或权限点。
 */
const navItems = computed(() => NAV_ITEMS.filter((item) => auth.hasPermission(item.permission)))
const settingsPages = new Set(['threshold', 'accounts'])
const primaryNavItems = computed(() => navItems.value.filter((item) => !settingsPages.has(item.name)))
const settingsNavItems = computed(() => navItems.value.filter((item) => settingsPages.has(item.name)))
const isSettingsPage = computed(() => settingsPages.has(route.name))

const currentTitle = computed(() => route.meta.title || '')
const roleLabel = computed(() => ROLE_LABEL[auth.role] || auth.role)
const displayName = computed(() => auth.account?.username || auth.account?.displayName || '')

// 提示消息跟随实际导航高度，避免在窄屏换行后遮住菜单。
const headerRef = ref(null)
const messageOffset = ref(88)
let headerObserver
onMounted(() => {
  const header = headerRef.value.$el
  const updateOffset = () => { messageOffset.value = Math.ceil(header.getBoundingClientRect().height) + 16 }
  updateOffset()
  headerObserver = new ResizeObserver(updateOffset)
  headerObserver.observe(header)
})
onUnmounted(() => headerObserver?.disconnect())

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
  <el-config-provider :message="{ offset: messageOffset }">
  <el-container class="abis-shell console-layout">
    <el-header ref="headerRef" class="header">
      <div class="brand" :aria-label="title">
        <BrandMark /><strong>ABIS</strong><span>{{ title.replace(/^ABIS\s*/, '') }}</span>
      </div>
      <nav class="primary-navigation" aria-label="控制台导航">
        <el-menu :default-active="route.name" mode="horizontal" :ellipsis="false" menu-trigger="click" router>
          <el-menu-item v-for="item in primaryNavItems" :key="item.name" :index="item.name" :route="{ name: item.name }">
            <UiIcon :name="item.name" /><span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
        <el-dropdown v-if="settingsNavItems.length" trigger="click" popper-class="settings-menu" @command="(name) => router.push({ name })">
          <button class="settings-trigger" :class="{ 'is-active': isSettingsPage }" type="button">
            <UiIcon name="settings" /><span>设置</span><UiIcon class="settings-chevron" name="arrow" :size="12" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="item in settingsNavItems" :key="item.name" :command="item.name" :class="{ 'is-active': route.name === item.name }">
                <UiIcon :name="item.name" /><span>{{ item.label }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>
      <div class="user">
        <DataSourceBadge />
        <span class="avatar" aria-hidden="true">{{ roleLabel.slice(0, 1) }}</span>
        <span class="user-name" :title="`${displayName}（${roleLabel}）`">{{ displayName }}<span class="user-role"> · {{ roleLabel }}</span></span>
        <el-button link @click="handleLogout">{{ logoutLabel }}</el-button>
      </div>
    </el-header>

    <el-main class="workspace-main">
      <div v-if="isSettingsPage" class="breadcrumb" aria-label="当前位置"><span>设置</span><b>/</b><strong>{{ currentTitle }}</strong></div>
      <div class="page-intro">
        <h1>{{ currentTitle }}</h1>
        <p>{{ PAGE_DESCRIPTIONS[route.name] }}</p>
      </div>
      <el-alert class="source-note" :title="dataSourceNote" :type="isMockPreview ? 'warning' : 'info'" show-icon :closable="false" />
      <router-view />
      <footer class="workspace-footer">{{ title }} <span>·</span> {{ isMockPreview ? 'Mock 界面预览' : 'HTTP 接口模式' }}</footer>
    </el-main>
  </el-container>
  </el-config-provider>
</template>

<style scoped>
.console-layout { min-height: 100vh; flex-direction: column; }
.header { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 32px; height: 72px; padding: 0 40px; background: var(--abis-navy); color: #d8e2ef; }
.brand { display: flex; flex-shrink: 0; align-items: center; gap: 11px; white-space: nowrap; }
.brand strong { color: #fff; font-size: 25px; letter-spacing: .5px; }
.brand > span:last-child { font-size: 12px; }
.primary-navigation { display: flex; align-items: stretch; min-width: 0; }
.primary-navigation :deep(.el-menu) { height: 72px; border: 0; background: transparent; --el-menu-text-color: #c2cfe2; --el-menu-active-color: #fff; --el-menu-hover-text-color: #fff; --el-menu-hover-bg-color: #223854; --el-menu-bg-color: transparent; --el-menu-horizontal-height: 72px; }
.primary-navigation :deep(.el-menu-item), .settings-trigger { gap: 9px; padding: 0 20px; font-size: 13px; border-bottom: 3px solid transparent; }
.primary-navigation :deep(.el-menu-item.is-active), .settings-trigger.is-active { border-bottom-color: #4b87ff; background: transparent; font-weight: 600; color: #fff; }
.settings-trigger { display: flex; align-items: center; height: 72px; border-top: 0; border-left: 0; border-right: 0; background: transparent; color: #c2cfe2; white-space: nowrap; }
.settings-trigger:hover { background: #223854; color: #fff; }
.settings-chevron { transform: rotate(90deg); }
.user { display: flex; flex-shrink: 0; align-items: center; gap: 12px; margin-left: auto; font-size: 12px; white-space: nowrap; }
.avatar { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; color: #3268e8; background: #edf2ff; font-weight: 600; margin-left: 4px; }
.user-role { color: #acbdd4; }
.user :deep(.el-button) { padding-left: 14px; border-left: 1px solid #40516a; border-radius: 0; color: #d8e2ef; font-size: 12px; }
.user :deep(.el-button:hover) { color: #fff; }
.workspace-main { width: 100%; min-width: 0; padding: 28px 48px; overflow: visible; }
.breadcrumb { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; font-size: 12px; }
.breadcrumb > span { color: #7c8ba1; }
.breadcrumb b { color: #b6c1d0; font-weight: 400; }
.breadcrumb strong { font-weight: 500; }
.page-intro { margin-bottom: 18px; }
.page-intro h1 { margin: 0 0 8px; font-size: 26px; font-weight: 650; letter-spacing: -.5px; line-height: 1.4; }
.page-intro p { margin: 0; color: #718096; font-size: 13px; }
.source-note { margin-bottom: 20px; border: 1px solid #f5e2bf; background: #fff8ec; }
.source-note :deep(.el-alert__title) { font-size: 12px; }
.source-note.el-alert--info { border-color: #dae4f6; background: #f0f5ff; }
.workspace-footer { padding-top: 24px; color: #8b98ab; font-size: 11px; text-align: right; }
.workspace-footer span { margin: 0 7px; }
@media (max-width: 1250px) {
  .header { gap: 20px; padding: 0 24px; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding-left: 14px; padding-right: 14px; }
  .primary-navigation :deep(.ui-icon) { display: none; }
  .primary-navigation :deep(.settings-chevron) { display: inline-block; }
  .user { gap: 10px; }
  .user-role { display: none; }
  .workspace-main { padding: 28px; }
}
@media (max-width: 1000px) {
  .header { height: auto; min-height: 72px; flex-wrap: wrap; gap: 0 20px; padding: 16px 24px 0; }
  .primary-navigation { order: 3; flex-basis: 100%; margin-top: 12px; overflow-x: auto; }
  .primary-navigation :deep(.el-menu) { flex-shrink: 0; height: 48px; --el-menu-horizontal-height: 48px; }
  .primary-navigation :deep(.el-dropdown) { flex-shrink: 0; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding: 0 18px; }
  .settings-trigger { height: 48px; }
  .primary-navigation :deep(.ui-icon) { display: inline-block; width: 17px; }
}
@media (max-width: 600px) {
  .header { padding: 16px 16px 0; gap: 0 10px; }
  .brand { gap: 8px; }
  .brand strong { font-size: 22px; }
  .brand > span:last-child, .avatar, .user-name { display: none; }
  .brand :deep(.brand-mark) { width: 24px; height: 24px; }
  .user { gap: 8px; }
  .user :deep(.source-badge) { padding: 3px 7px; font-size: 10px; }
  .user :deep(.el-button) { padding-left: 8px; font-size: 11px; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding-left: 12px; padding-right: 12px; gap: 6px; font-size: 12px; }
  .primary-navigation :deep(.ui-icon) { display: none; }
  .primary-navigation :deep(.settings-chevron) { display: inline-block; width: 12px; }
  .workspace-main { padding: 22px 16px; }
  .page-intro h1 { font-size: 23px; }
  .page-intro p { font-size: 12px; }
}
</style>
