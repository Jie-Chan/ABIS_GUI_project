<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api, { apiMode } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ROLE, ROLE_LABEL, PERMISSION, canResetAccountPassword } from '@/constants/roles'
import { CONFIRM_TITLE } from '@/constants/nav'

const auth = useAuthStore()
const router = useRouter()
const canManage = computed(() => auth.hasPermission(PERMISSION.ACCOUNT_MANAGE))
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)
const query = ref({ page: 1, pageSize: 10, keyword: '' })
let requestSequence = 0

const dialogVisible = ref(false)
const dialogMode = ref('create')
const emptyForm = () => ({ id: null, username: '', displayName: '', role: ROLE.OPERATOR })
const form = ref(emptyForm())
const roleOptions = [ROLE.ADMIN, ROLE.OPERATOR].map(value => ({ value, label: ROLE_LABEL[value] }))
const credentialVisible = ref(false)
const credential = ref({ title: '', username: '', password: '' })

async function load() {
  const requestId = ++requestSequence
  loading.value = true
  error.value = ''
  try {
    const result = await api.listAccounts({ ...query.value })
    if (requestId !== requestSequence) return
    rows.value = result.items
    total.value = result.total
  } catch (e) {
    if (requestId !== requestSequence) return
    rows.value = []
    total.value = 0
    error.value = e.message || '读取账户列表失败'
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

function search() {
  query.value.page = 1
  load()
}

async function reloadAfterWrite() {
  await load()
  if (!error.value && !rows.value.length && total.value > 0 && query.value.page > 1) {
    query.value.page = Math.ceil(total.value / query.value.pageSize)
    await load()
  }
}

function openCreate() {
  if (!canManage.value) return
  dialogMode.value = 'create'
  form.value = emptyForm()
  dialogVisible.value = true
}

function openEdit(row) {
  if (!canManage.value) return
  dialogMode.value = 'edit'
  form.value = { ...row }
  dialogVisible.value = true
}

async function confirmAction(message, options = {}) {
  try {
    await ElMessageBox.confirm(message, CONFIRM_TITLE, { type: 'warning', ...options })
    return true
  } catch {
    return false
  }
}

function showCredential(title, username, result) {
  if (apiMode !== 'hybrid') return
  const password = ['initialPassword', 'temporaryPassword', 'newPassword', 'password']
    .map(key => result?.[key]).find(value => typeof value === 'string' && value.length > 0) || ''
  credential.value = { title, username, password }
  credentialVisible.value = true
}

function clearCredential() {
  credential.value = { title: '', username: '', password: '' }
}

const isSelf = row => auth.account?.id != null && String(row.id) === String(auth.account.id)
const canReset = row => canResetAccountPassword(auth.role, row.role)

async function leaveSession() {
  auth.clearSession()
  await router.replace({ name: 'login' })
}

async function handleSubmit() {
  if (!canManage.value) return
  if (!form.value.username.trim() || !form.value.displayName.trim() || ![ROLE.ADMIN, ROLE.OPERATOR].includes(form.value.role)) {
    ElMessage.warning('请填写用户名、姓名并选择角色')
    return
  }
  if (apiMode === 'hybrid' && !await confirmAction('此操作将保存到真实账户，确认继续？')) return
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      const username = form.value.username.trim()
      const result = await api.createAccount({ username, displayName: form.value.displayName.trim(), role: form.value.role })
      dialogVisible.value = false
      ElMessage.success('账户已创建')
      showCredential('账户创建结果', username, result)
    } else {
      await api.updateAccount(form.value.id, { displayName: form.value.displayName.trim(), role: form.value.role })
      dialogVisible.value = false
      ElMessage.success('账户已更新')
      if (isSelf(form.value) && apiMode === 'hybrid') {
        try { await auth.refreshAccount() }
        catch { await leaveSession(); return }
      }
    }
    await reloadAfterWrite()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row) {
  if (!canManage.value) return
  const next = !row.enabled
  if (!await confirmAction(`确认${next ? '启用' : '禁用'}账户「${row.username}」？`)) return
  saving.value = true
  try {
    await api.updateAccount(row.id, { enabled: next })
    ElMessage.success(next ? '账户已启用' : '账户已禁用')
    if (!next && isSelf(row)) { await leaveSession(); return }
    await reloadAfterWrite()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  if (!canManage.value) return
  if (!await confirmAction(`确认删除账户「${row.username}」？`, { confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' })) return
  saving.value = true
  try {
    await api.deleteAccount(row.id)
    ElMessage.success('账户已删除')
    if (isSelf(row)) { await leaveSession(); return }
    await reloadAfterWrite()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    saving.value = false
  }
}

async function handleResetPassword(row) {
  if (!canReset(row)) return
  const note = apiMode === 'hybrid' ? '新密码由后端处理，当前不支持指定新密码。' : ''
  if (!await confirmAction(`确认重置账户「${row.username}」的密码？${note}`)) return
  saving.value = true
  try {
    const result = await api.resetPassword(row.id)
    ElMessage.success('后端已确认密码重置')
    showCredential('密码重置结果', row.username, result)
    if (isSelf(row) && apiMode === 'hybrid') { auth.clearSession(); return }
    await reloadAfterWrite()
  } catch (e) {
    ElMessage.error(e.message || '重置失败')
  } finally {
    saving.value = false
  }
}

async function closeCredential() {
  clearCredential()
  if (!auth.isLoggedIn) await router.replace({ name: 'login' })
}

onMounted(load)
</script>

<template>
  <div>
    <el-card>
      <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom: 12px" />
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="搜索用户名或姓名" clearable style="width: 240px" @keyup.enter="search" @clear="search" />
        <el-button type="primary" :loading="loading" @click="search">查询</el-button>
        <el-tag v-if="apiMode === 'hybrid'" type="success">真实账户</el-tag>
        <span class="spacer" />
        <el-button v-if="canManage" type="primary" :disabled="saving" @click="openCreate">新建账户</el-button>
      </div>
      <el-table :data="rows" row-key="id" v-loading="loading" border style="width: 100%">
        <el-table-column prop="username" label="用户名" min-width="140" />
        <el-table-column prop="displayName" label="姓名" min-width="120" />
        <el-table-column label="角色" width="110">
          <template #default="{ row }">{{ ROLE_LABEL[row.role] || row.role || '未知' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ row.createdAt || '—' }}</template>
        </el-table-column>
        <el-table-column label="最近登录" width="170">
          <template #default="{ row }">{{ row.lastLoginAt || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="canManage ? 280 : 130" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canManage" link type="primary" :disabled="saving || loading" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canManage" link type="primary" :disabled="saving || loading" @click="toggleEnabled(row)">{{ row.enabled ? '禁用' : '启用' }}</el-button>
            <el-button v-if="canReset(row)" link type="primary" :disabled="saving || loading" @click="handleResetPassword(row)">重置密码</el-button>
            <el-button v-if="canManage" link type="danger" :disabled="saving || loading" @click="handleDelete(row)">删除</el-button>
            <span v-if="!canManage && !canReset(row)" class="note">仅可查看</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" style="margin-top: 12px; justify-content: flex-end" @current-change="load" @size-change="search" />
      <p class="note">控制台账户与 SIGATT 业务账户独立。操作结果以后端响应为准，可在审计查询中核对操作记录。</p>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新建账户' : '编辑账户'" width="460px" :close-on-click-modal="!saving" :show-close="!saving" :close-on-press-escape="!saving" @closed="form = emptyForm()">
      <el-alert v-if="apiMode === 'hybrid' && dialogMode === 'create'" title="初始密码由后端处理，当前接口未明确密码规则和交付方式。" type="info" :closable="false" style="margin-bottom: 16px" />
      <el-form :model="form" label-width="90px" :disabled="saving">
        <el-form-item label="用户名"><el-input v-model="form.username" :disabled="dialogMode === 'edit'" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="form.role" style="width: 100%"><el-option v-for="o in roleOptions" :key="o.value" :label="o.label" :value="o.value" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="handleSubmit">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="credentialVisible" :title="credential.title" width="480px" :close-on-click-modal="false" @close="closeCredential">
      <p>账户：{{ credential.username }}</p>
      <template v-if="credential.password">
        <p>后端已返回密码，请妥善交付。关闭后将不再显示。</p>
        <el-input :model-value="credential.password" type="password" show-password readonly autocomplete="off" aria-label="后端返回的密码" />
      </template>
      <el-alert v-else title="后端已确认操作成功，但未返回密码。请向后端确认密码规则及交付方式后再登录该账户。" type="warning" :closable="false" />
      <template #footer><el-button type="primary" @click="credentialVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.spacer { flex: 1; }
.note { margin: 12px 0 0; color: #909399; font-size: 12px; }
</style>
