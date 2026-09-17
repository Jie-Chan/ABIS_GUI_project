/**
 * 路由与角色守卫
 *
 * ⚠ 守卫仅用于前端体验（隐藏无权限入口），**不构成安全边界**。
 *   需求附录 A.2 要求权限在 ABIS 侧强制校验。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { NAV_ITEMS } from '@/constants/nav'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/monitor',
    children: NAV_ITEMS.map(({ name, label, permission, component }) => ({
      path: name,
      name,
      component,
      meta: { title: label, permission },
    })),
  },
  { path: '/:pathMatch(.*)*', redirect: '/monitor' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    return true
  }

  if (!auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 无权限时退回监控页（所有角色都有该权限）
  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'monitor' }
  }

  return true
})

export default router
