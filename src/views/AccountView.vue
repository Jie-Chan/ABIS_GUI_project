<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ROLE, ROLE_LABEL, PERMISSION, canResetAccountPassword, canDeleteAccount, canChangeAccountRole, canToggleAccountEnabled } from '@/constants/roles'
import { buildConfirmationMessage } from '@/utils/confirmation'
import { optionalAccountFields } from '@/utils/account'
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
const emptyForm = () => ({ id: null, username: '', displayName: '', role: ROLE.OPERATOR, ...optionalAccountFields() })
const form = ref(emptyForm())
const editTarget = ref(null)
const canEditRole = computed(() => dialogMode.value === 'create' || canChangeAccountRole(auth.role, editTarget.value?.role, auth.account?.id, editTarget.value?.id))
const accountFormRef = ref(null)
const formRules = {
  username: [{ required: true, whitespace: true, message: '请输入用户名', trigger: 'blur' }],
  displayName: [{ required: true, whitespace: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, type: 'enum', enum: [ROLE.ADMIN, ROLE.OPERATOR], message: '请选择角色', trigger: 'change' }],
  email: [{ validator: (_, value, done) => { const text = value?.trim(); done(!text || text === '-' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? undefined : new Error('请输入有效的邮箱地址')) }, trigger: 'blur' }],
}
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
  editTarget.value = null
  form.value = emptyForm()
  dialogVisible.value = true
}

function openEdit(row) {
  if (!canManage.value) return
  dialogMode.value = 'edit'
  editTarget.value = { id: row.id, role: row.role }
  form.value = { ...row, ...optionalAccountFields(row) }
  dialogVisible.value = true
}

async function confirmAction(message, options = {}) {
  try {
    await ElMessageBox.confirm(typeof message === 'string' ? buildConfirmationMessage(message) : message, CONFIRM_TITLE, { type: 'warning', ...options })
    return true
  } catch {
    return false
  }
}

function showCredential(title, username, result) {
  const password = ['initialPassword', 'temporaryPassword', 'newPassword', 'password']
    .map(key => result?.[key]).find(value => typeof value === 'string' && value.length > 0) || ''
  credential.value = { title, username, password }
  credentialVisible.value = true
}

function clearCredential() {
  credential.value = { title: '', username: '', password: '' }
}

const isSelf = row => auth.account?.id != null && String(row.id) === String(auth.account.id)
const canDelete = row => canDeleteAccount(auth.role, row.role, auth.account?.id, row.id)
const canReset = row => canResetAccountPassword(auth.role, row.role, auth.account?.id, row.id)
const canToggle = row => canToggleAccountEnabled(auth.role, row.role, auth.account?.id, row.id, row.enabled)

async function leaveSession() {
  auth.clearSession()
  await router.replace({ name: 'login' })
}

async function handleSubmit() {
  if (!canManage.value) return
  if (!form.value.username.trim() || !form.value.displayName.trim() || ![ROLE.ADMIN, ROLE.OPERATOR].includes(form.value.role)) {
    accountFormRef.value?.validate().catch(() => {})
    ElMessage.warning('请填写用户名、姓名并选择角色')
    return
  }
  if (!await accountFormRef.value?.validate().catch(() => false)) return
  // Check the original target, not the editable form role. Locked roles are
  // omitted entirely so saving other details cannot overwrite a server role.
  const target = editTarget.value
  const mode = dialogMode.value
  if (mode === 'edit' && (!target || String(form.value.id) !== String(target.id))) {
    ElMessage.warning('账户信息已变化，请关闭后重新编辑')
    return
  }
  if (mode === 'edit' && !canEditRole.value && form.value.role !== target.role) {
    ElMessage.warning('不能修改本人或管理员账户的角色')
    return
  }
  const values = { ...form.value }
  const payload = { displayName: values.displayName.trim(), ...optionalAccountFields(values) }
  if (canEditRole.value) payload.role = values.role
  if (!await confirmAction('确认保存账户信息？')) return
  saving.value = true
  try {
    if (mode === 'create') {
      const username = values.username.trim()
      const result = await api.createAccount({ username, ...payload })
      dialogVisible.value = false
      ElMessage.success('账户已创建')
      showCredential('账户创建结果', username, result)
    } else {
      await api.updateAccount(target.id, payload)
      dialogVisible.value = false
      ElMessage.success('账户已更新')
      if (isSelf(target)) {
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
  if (!canToggle(row)) return
  const next = !row.enabled
  if (!await confirmAction(buildConfirmationMessage(`确认${next ? '启用' : '禁用'}账户「${row.username}」？`, [next ? '启用后允许该账户登录。' : '禁用后该账户不可登录。']))) return
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
  if (!canDelete(row)) return
  if (!await confirmAction(buildConfirmationMessage(`确认删除账户「${row.username}」？`, ['删除后该账户将无法登录。']), { confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' })) return
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
  if (!await confirmAction(buildConfirmationMessage(`确认重置账户「${row.username}」的密码？`, ['操作结果将在密码结果弹窗中显示。']))) return
  saving.value = true
  try {
    const result = await api.resetPassword(row.id)
    ElMessage.success('密码已重置')
    showCredential('密码重置结果', row.username, result)
    if (isSelf(row)) { auth.clearSession(); return }
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
  <div class="account-page">
    <el-card>
      <template #header>
        <div class="record-heading"><span>控制台账户</span><span class="record-count">共 {{ total }} 个账户</span></div>
      </template>
      <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom: 12px" />
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="搜索用户名或姓名" clearable style="width: 240px" @keyup.enter="search" @clear="search" />
        <el-button type="primary" :loading="loading" @click="search">查询</el-button>
        <span class="spacer" />
        <el-button v-if="canManage" type="primary" :disabled="saving" @click="openCreate">新建账户</el-button>
      </div>
      <el-table :data="rows" row-key="id" v-loading="loading" border style="width: 100%">
        <el-table-column prop="id" label="账户 ID" min-width="90" />
        <el-table-column prop="username" label="用户名" min-width="140" />
        <el-table-column label="角色" width="110">
          <template #default="{ row }">{{ ROLE_LABEL[row.role] || row.role || '未知' }}</template>
        </el-table-column>
        <el-table-column label="启用状态" width="100">
          <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="165">
          <template #default="{ row }">{{ row.createAt || row.createdAt || '—' }}</template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="165">
          <template #default="{ row }">{{ row.updateAt || row.updatedAt || '—' }}</template>
        </el-table-column>
        <el-table-column label="最近登录时间" min-width="165">
          <template #default="{ row }">{{ row.lastLoginAt || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" :width="canManage ? 280 : 130" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canManage" link type="primary" :disabled="saving || loading" @click="openEdit(row)">编辑</el-button>
            <el-button v-if="canManage" link type="primary" :class="{ 'account-status-locked': !canToggle(row) }" :disabled="saving || loading || !canToggle(row)" @click="toggleEnabled(row)">{{ row.enabled ? '禁用' : '启用' }}</el-button>
            <el-button v-if="canReset(row)" link type="primary" :disabled="saving || loading" @click="handleResetPassword(row)">重置密码</el-button>
            <el-button v-if="canDelete(row)" link type="danger" :disabled="saving || loading" @click="handleDelete(row)">删除</el-button>
            <span v-if="!canManage && !canReset(row)" class="read-only">仅可查看</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" style="margin-top: 12px; justify-content: flex-end" @current-change="load" @size-change="search" />
      <p class="note">账户操作记录可在审计查询中查看。</p>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新建账户' : '编辑账户'" width="460px" :close-on-click-modal="!saving" :show-close="!saving" :close-on-press-escape="!saving" @closed="form = emptyForm()">
      <el-form ref="accountFormRef" :model="form" :rules="formRules" label-width="90px" :disabled="saving">
        <el-form-item label="用户名" prop="username"><el-input v-model="form.username" :disabled="dialogMode === 'edit'" /></el-form-item>
        <el-form-item label="姓名" prop="displayName"><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" :disabled="!canEditRole" style="width: 100%"><el-option v-for="o in roleOptions" :key="o.value" :label="o.label" :value="o.value" /></el-select>
          <span v-if="dialogMode === 'edit' && !canEditRole" class="role-hint">本人及管理员账户的角色不可修改。</span>
        </el-form-item>
        <el-form-item label="电话" prop="phone"><el-input v-model="form.phone" type="tel" placeholder="-" /></el-form-item>
        <el-form-item label="邮箱" prop="email"><el-input v-model="form.email" placeholder="-" /></el-form-item>
        <el-form-item label="备注" prop="remark"><el-input v-model="form.remark" type="textarea" :rows="3" placeholder="-" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="handleSubmit">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="credentialVisible" :title="credential.title" width="480px" :close-on-click-modal="false" @close="closeCredential">
      <p>账户：{{ credential.username }}</p>
      <template v-if="credential.password">
        <p>请妥善保管并交付密码，关闭后将不再显示。</p>
        <el-input :model-value="credential.password" type="password" show-password readonly autocomplete="off" aria-label="账户密码" />
      </template>
      <el-alert v-else title="操作成功，服务未返回密码。请联系系统管理员获取账户密码。" type="warning" :closable="false" />
      <template #footer><el-button type="primary" @click="credentialVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
.spacer { flex: 1; }
.note { margin: 18px 0 0; color: #718096; font-size: 12px; line-height: 1.8; }
.role-hint { color: #718096; font-size: 12px; line-height: 1.8; margin-top: 4px; }
.account-page .el-button.account-status-locked.is-disabled { color: var(--el-text-color-placeholder); }
@media (max-width: 767px) {
  .account-page :deep(.el-table-fixed-column--right) { position: static !important; }
  .account-page :deep(.el-table-fixed-column--right::before) { display: none; }
}
</style>
