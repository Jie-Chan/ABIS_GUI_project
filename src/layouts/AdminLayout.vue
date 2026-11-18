<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABEL } from '@/constants/roles'
import { NAV_ITEMS, APP_NAME } from '@/constants/nav'
import BrandMark from '@/components/BrandMark.vue'
import UiIcon from '@/components/UiIcon.vue'
import ProfileDialog from '@/components/ProfileDialog.vue'
import { buildConfirmationMessage } from '@/utils/confirmation'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const title = APP_NAME
const logoutLabel = '退出登录'
const profileVisible = ref(false)

function handleAccountCommand(command) {
  if (command === 'profile') profileVisible.value = true
  else if (command === 'logout') handleLogout()
}

const navItems = computed(() => NAV_ITEMS.filter((item) => auth.hasPermission(item.permission)))
const monitorPages = new Set(['monitor', 'host-resources'])
const monitorNavItems = computed(() => navItems.value.filter(item => monitorPages.has(item.name)))
const isMonitorPage = computed(() => monitorPages.has(route.name))
const settingsPages = new Set(['threshold', 'accounts'])
const primaryNavItems = computed(() => navItems.value.filter((item) => !settingsPages.has(item.name) && !monitorPages.has(item.name)))
const settingsNavItems = computed(() => navItems.value.filter((item) => settingsPages.has(item.name)))
const isSettingsPage = computed(() => settingsPages.has(route.name))
const isRecordsPage = computed(() => ['applicants', 'logs', 'audits', 'accounts'].includes(route.name))

const currentTitle = computed(() => route.meta.title || '')
const roleLabel = computed(() => ROLE_LABEL[auth.role] || '角色未识别')
const displayName = computed(() => auth.account?.displayName || auth.account?.username || '')

const headerRef = ref(null)
const messageOffset = ref(88)
const headerHeight = ref(72)
let headerObserver
onMounted(() => {
  const header = headerRef.value.$el
  const updateOffset = () => { headerHeight.value = Math.ceil(header.getBoundingClientRect().height); messageOffset.value = headerHeight.value + 16 }
  updateOffset()
  headerObserver = new ResizeObserver(updateOffset)
  headerObserver.observe(header)
})
onUnmounted(() => headerObserver?.disconnect())

async function handleLogout() {
  try {
    await ElMessageBox.confirm(buildConfirmationMessage('确认退出登录？'), '提示', { type: 'warning' })
  } catch {
    return
  }
  try { await auth.logout() }
  catch (e) { ElMessage.warning(`本地已退出，服务端注销未确认：${e.message}`) }
  finally { router.push({ name: 'login' }) }
}
</script>

<template>
  <el-config-provider :message="{ offset: messageOffset }">
  <el-container class="abis-shell console-layout" :style="{ '--abis-nav-height': `${headerHeight}px` }">
    <el-header ref="headerRef" class="header">
      <div class="brand" :aria-label="title">
        <BrandMark /><strong>ABIS</strong><span>{{ title.replace(/^ABIS\s*/, '') }}</span>
      </div>
      <nav class="primary-navigation" aria-label="控制台导航">
        <el-dropdown v-if="monitorNavItems.length" trigger="click" popper-class="settings-menu monitor-menu" @command="name => router.push({ name })">
          <button class="settings-trigger monitor-trigger" :class="{ 'is-active': isMonitorPage }" type="button"><UiIcon name="monitor" /><span>监控</span><UiIcon class="settings-chevron" name="arrow" :size="12" /></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item v-for="item in monitorNavItems" :key="item.name" :command="item.name" :class="{ 'is-active': route.name === item.name }">{{ item.label }}</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
        <el-menu :default-active="route.name" mode="horizontal" :ellipsis="false" menu-trigger="click" router>
          <el-menu-item v-for="item in primaryNavItems" :key="item.name" :index="item.name" :route="{ name: item.name }">
            <UiIcon :name="item.name" /><span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>
        <el-dropdown v-if="settingsNavItems.length" trigger="click" popper-class="settings-menu" @command="(name) => router.push({ name })">
          <button class="settings-trigger settings-nav-trigger" :class="{ 'is-active': isSettingsPage }" type="button">
            <UiIcon name="settings" /><span class="settings-label">设置</span><span class="more-label">更多</span><span v-if="isSettingsPage" class="nav-section-current">· {{ currentTitle }}</span><UiIcon class="settings-chevron" name="arrow" :size="12" />
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
        <el-dropdown trigger="click" popper-class="account-menu" @command="handleAccountCommand">
          <button class="account-trigger" type="button" aria-label="账户菜单" :title="`${displayName}（${roleLabel}）`">
            <span class="avatar" aria-hidden="true">{{ roleLabel.slice(0, 1) }}</span>
            <span class="user-name" :title="`${displayName}（${roleLabel}）`">{{ displayName }}<span class="user-role"> · {{ roleLabel }}</span></span>
            <UiIcon class="account-chevron" name="arrow" :size="12" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="profile"><UiIcon name="accounts" :size="18" />个人信息</el-dropdown-item>
              <el-dropdown-item command="logout" divided><UiIcon name="logout" :size="18" />{{ logoutLabel }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <el-main class="workspace-main" :class="{ 'records-workspace': isRecordsPage }">
      <div v-if="!['logs', 'applicants', 'monitor', 'host-resources', 'audits', 'accounts', 'threshold', 'recapture-acceptance'].includes(route.name)" class="page-intro">
        <span class="page-icon"><UiIcon :name="route.name" :size="25" /></span>
        <div>
          <h1>{{ currentTitle }}</h1>
        </div>
      </div>
      <el-alert v-if="auth.account?.identityPending" title="当前账户角色未识别，仅允许查看数据。" type="info" :closable="false" style="margin-bottom: 12px" />
      <router-view />
    </el-main>
  </el-container>
  <ProfileDialog v-model="profileVisible" />
  </el-config-provider>
</template>

<style scoped>
.console-layout { min-height: 100vh; flex-direction: column; }
.header { position: sticky; top: 0; z-index: 100; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 32px; height: 72px; padding: 0 40px; background: var(--abis-navy); color: #d8e2ef; box-shadow: 0 1px 0 #ffffff14, 0 3px 12px #102c4914; }
.brand { display: flex; flex-shrink: 0; align-items: center; gap: 11px; white-space: nowrap; }
.brand strong { color: #fff; font-size: 25px; letter-spacing: .5px; }
.brand > span:last-child { font-size: 12px; }
.primary-navigation { display: flex; align-items: stretch; justify-self: center; min-width: 0; }
.primary-navigation :deep(.el-menu) { height: 72px; border: 0; background: transparent; --el-menu-text-color: #c2cfe2; --el-menu-active-color: #fff; --el-menu-hover-text-color: #fff; --el-menu-hover-bg-color: #223854; --el-menu-bg-color: transparent; --el-menu-horizontal-height: 72px; }
.primary-navigation :deep(.el-menu-item), .settings-trigger { gap: 9px; padding: 0 20px; font-size: 15px; border-bottom: 3px solid transparent; }
.primary-navigation :deep(.el-menu-item.is-active), .settings-trigger.is-active { border-bottom-color: #4b87ff; background: transparent; font-weight: 600; color: #fff; }
.settings-trigger { display: flex; align-items: center; height: 72px; border-top: 0; border-left: 0; border-right: 0; background: transparent; color: #c2cfe2; white-space: nowrap; }
.settings-trigger:hover { background: #223854; color: #fff; }
.settings-chevron { transform: rotate(90deg); }
.more-label,.nav-section-current { display: none; }
.user { display: flex; align-items: center; justify-self: end; gap: 12px; min-width: 0; max-width: 100%; font-size: 12px; white-space: nowrap; }
.user :deep(.el-dropdown) { min-width: 0; }
.account-trigger { display: flex; align-items: center; gap: 10px; min-height: 42px; max-width: min(300px, 100%); padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: #d8e2ef; font-size: 12px; }
.account-trigger:hover, .account-trigger[aria-expanded="true"] { background: #263c58; }
.account-chevron { transform: rotate(90deg); }
.avatar { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; color: #3268e8; background: #edf2ff; font-weight: 600; }
.user-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-role { color: #acbdd4; }
.workspace-main { --abis-workspace-top: 32px; width: 100%; min-width: 0; padding: 32px 48px 48px; overflow: visible; }
.page-intro { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.page-intro > div { min-width: 0; }
.page-icon { display: grid; place-items: center; width: 50px; height: 50px; flex-shrink: 0; border: 1px solid #d5e2f4; border-radius: 12px; background: #e9f0fb; color: var(--el-color-primary); }
.page-intro h1 { margin: 0 0 5px; font-size: 25px; font-weight: 650; letter-spacing: -.5px; line-height: 1.4; }
.page-intro p { margin: 0; color: var(--abis-muted); font-size: 13px; line-height: 1.7; }
@media (max-width: 1400px) {
  .header { gap: 20px; padding: 0 24px; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding-left: 14px; padding-right: 14px; }
  .primary-navigation :deep(.ui-icon) { display: none; }
  .primary-navigation :deep(.settings-chevron) { display: inline-block; }
  .user { gap: 10px; }
  .user-role { display: none; }
  .workspace-main { --abis-workspace-top: 28px; padding: 28px; }
}
@media (max-width: 1200px) {
  .header { display: flex; height: auto; min-height: 72px; flex-wrap: wrap; gap: 0 20px; padding: 16px 24px 0; }
  .user { margin-left: auto; }
  .primary-navigation { order: 3; flex-basis: 100%; justify-content: safe center; margin-top: 12px; min-height: 52px; align-items: center; overflow-x: auto; overflow-y: hidden; }
  .primary-navigation :deep(.el-menu) { flex-shrink: 0; height: 48px; overflow: visible; --el-menu-horizontal-height: 48px; }
  .primary-navigation :deep(.el-dropdown) { flex-shrink: 0; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding: 0 18px; }
  .settings-trigger { height: 48px; }
  .primary-navigation :deep(.ui-icon) { display: inline-block; width: 17px; }
}
@media (max-width: 600px) {
  .header { padding: 16px 16px 0; gap: 0 10px; }
  .brand { gap: 8px; }
  .brand strong { font-size: 22px; }
  .brand > span:last-child, .user-name { display: none; }
  .brand :deep(.brand-mark) { width: 24px; height: 24px; }
  .user { gap: 8px; }
  .account-trigger { gap: 7px; padding: 4px; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding-left: 12px; padding-right: 12px; gap: 6px; font-size: 14px; }
  .primary-navigation :deep(.ui-icon) { display: none; }
  .primary-navigation :deep(.settings-chevron) { display: inline-block; width: 12px; }
  .workspace-main { --abis-workspace-top: 22px; padding: 22px 16px; }
  .page-intro h1 { font-size: 23px; }
  .page-intro p { font-size: 12px; }
  .page-intro { gap: 12px; margin-bottom: 20px; }
  .page-icon { width: 42px; height: 42px; border-radius: 10px; }
}
@media (max-width: 767px) {
  .primary-navigation { justify-content: flex-start; flex-wrap: wrap; overflow: visible; }
  .primary-navigation :deep(.el-menu-item), .settings-trigger { padding-inline: 8px; gap: 6px; font-size: 14px; }
  .primary-navigation :deep(.ui-icon) { display: none; }
  .primary-navigation :deep(.settings-chevron) { display: inline-block; width: 12px; }
  .settings-label { display: none; }
  .more-label,.nav-section-current { display: inline; }
  .nav-section-current { font-size: 12px; }
}
.workspace-main.records-workspace { --abis-workspace-top: 12px; padding-top: var(--abis-workspace-top); }
@media (max-width: 767px) {
  .workspace-main.records-workspace { --abis-workspace-top: 8px; }
}
.user :deep(.source-badge) { flex-shrink: 0; }
</style>
