<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api, { apiMode } from '@/api'
import { ROLE, ROLE_LABEL } from '@/constants/roles'
import { CONFIRM_TITLE } from '@/constants/nav'

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)
const query = ref({ page: 1, pageSize: 10, keyword: '' })

const dialogVisible = ref(false)
const dialogMode = ref('create')
const form = ref({ id: null, username: '', displayName: '', role: ROLE.OPERATOR })

const roleOptions = [
  { value: ROLE.ADMIN, label: ROLE_LABEL[ROLE.ADMIN] },
  { value: ROLE.OPERATOR, label: ROLE_LABEL[ROLE.OPERATOR] },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await api.listAccounts(query.value)
    rows.value = result.items
    total.value = result.total
  } catch (e) {
    // 同 Task 6 / Task 7：不接住异常，则「列表加载失败」既无提示、
    // 又会把错误交给 Vue 的 errorHandler 打印（⚠ **不是**「未处理 rejection」：
    // onMounted 里的 async 抛错由 Vue 接住后转交 errorHandler，实测 1 命中 / 0 未处理 rejection），
    // 且表格停在旧数据上 —— 用户会把「读不到」误读成「没有账户」。
    error.value = e.message || '读取账户列表失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  form.value = { id: null, username: '', displayName: '', role: ROLE.OPERATOR }
  dialogVisible.value = true
}

function openEdit(row) {
  dialogMode.value = 'edit'
  form.value = { ...row }
  dialogVisible.value = true
}

async function handleSubmit() {
  if (!form.value.username || !form.value.displayName) {
    ElMessage.warning('请填写用户名与姓名')
    return
  }
  if (apiMode === 'hybrid' && !await confirmAction(dialogMode.value === 'create' || form.value.dataSource === 'real-local' ? '此操作将写入真实后端账户，确认继续？' : '此操作仅修改演示账户，确认继续？')) return
  saving.value = true
  try {
    if (dialogMode.value === 'create') {
      const created = await api.createAccount({ ...form.value })
      ElMessage.success(apiMode === 'hybrid' && created.remoteId == null ? '后端已确认创建，但未返回账户 ID；暂不能编辑该记录' : '账户已创建')
    } else {
      await api.updateAccount(form.value.id, {
        displayName: form.value.displayName,
        role: form.value.role,
      })
      ElMessage.success('账户已更新')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    saving.value = false
  }
}

/**
 * 二次确认。返回 true = 用户确认，false = 用户取消。
 *
 * 必须包 try/catch：用户点「取消」时 `ElMessageBox.confirm` 会 **reject 一个 'cancel'**。
 * 不接住它，调用方作为 `@click` 处理器被 Vue 的异步错误通道调用，于是
 * **每一次取消都在控制台留下一条报错**（由 Vue 的 `errorHandler` 打印；
 * ⚠ **不是**「unhandled rejection」——实测 0 次，且已用阳性对照证明监听器抓得到，
 * 见 `check-task8.js` 的 4.2 / 4.3）。
 * 取消是常规操作，不该报错。本页有三处确认，共用这一个函数，不把那三行抄三遍。
 */
async function confirmAction(message, options = {}) {
  try {
    await ElMessageBox.confirm(message, CONFIRM_TITLE, { type: 'warning', ...options })
    return true
  } catch {
    return false
  }
}

/** 禁用 / 启用。需求 1.1：禁用后不可登录，历史操作记录保留。 */
async function toggleEnabled(row) {
  const next = !row.enabled
  const ok = await confirmAction(
    sourcePrefix(row) + (next
      ? `确认启用账户「${row.username}」？`
      : `确认禁用账户「${row.username}」？禁用后该账户不可登录，其历史操作记录保留。`)
  )
  if (!ok) return
  try {
    await api.updateAccount(row.id, { enabled: next })
    ElMessage.success(next ? '账户已启用' : '账户已禁用')
    load()
  } catch (e) {
    // 这里 catch 的职责**只有一个**：把 ABIS 的拒绝原因呈现出来，
    // 而不是让它变成一个静默失败的按钮。
    // 前端**不构成安全边界** —— 授权由 ABIS 侧强制校验（需求分析「管理 API 角色权限校验」）。
    // ⚠ 需求 1.1 **没有**规定「不允许停用自己 / 停用最后一个管理员」这类边界，mock 也不拦。
    //   本行原写作「需求 1.1 的边界：不允许把自己停用/删除，也不允许停用最后一个管理员」，
    //   那是**凭空多出来的要求**，会让维护者以为存在一道实际不存在的防线。
    //   ABIS 是否拒绝这两种情形？需求文档对此沉默 ⇒ 列为待澄清项（见 Task 11 待澄清清单）。
    ElMessage.error(e.message || '操作失败')
  }
}

async function handleDelete(row) {
  const ok = await confirmAction(
    sourcePrefix(row) + `确认删除账户「${row.username}」？`,
    { confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' }
  )
  if (!ok) return
  try {
    await api.deleteAccount(row.id)
    ElMessage.success('账户已删除')
    load()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function handleResetPassword(row) {
  const ok = await confirmAction(
    sourcePrefix(row) + `确认重置账户「${row.username}」的密码？`
  )
  if (!ok) return
  try {
    await api.resetPassword(row.id, {})
    ElMessage.success('密码已重置')
  } catch (e) {
    ElMessage.error(e.message || '重置失败')
  }
}

const sourcePrefix = row => apiMode !== 'hybrid' ? '' : row.dataSource === 'mock' ? '【仅演示】' : '【真实后端】'
const cannotOperate = row => apiMode === 'hybrid' && row.dataSource === 'real-local' && row.remoteId == null
onMounted(load)
</script>

<template>
  <div>
    <el-card>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <div class="toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索用户名或姓名"
          clearable
          style="width: 240px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button type="primary" @click="load">查询</el-button>
        <span class="spacer" />
        <el-button type="primary" @click="openCreate">新建账户</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" border style="width: 100%">
        <el-table-column v-if="apiMode === 'hybrid'" label="数据来源" width="185">
          <template #default="{ row }"><el-tag :type="row.dataSource === 'mock' ? 'info' : 'warning'">{{ row.dataSource === 'mock' ? 'Mock 演示' : row.remoteId == null ? '真实创建 · 缺少 ID' : '真实创建 · 本地记录' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="username" label="用户名" min-width="140" />
        <el-table-column prop="displayName" label="姓名" min-width="120" />
        <el-table-column label="角色" width="110">
          <template #default="{ row }">{{ ROLE_LABEL[row.role] }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column prop="lastLoginAt" label="最近登录" width="170" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="cannotOperate(row)" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" :disabled="cannotOperate(row)" @click="toggleEnabled(row)">
              {{ row.enabled ? '禁用' : '启用' }}
            </el-button>
            <el-button link type="primary" :disabled="cannotOperate(row)" @click="handleResetPassword(row)">重置密码</el-button>
            <el-button link type="danger" :disabled="cannotOperate(row)" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 12px; justify-content: flex-end"
        @current-change="load"
        @size-change="load"
      />

      <p class="note">
        控制台账户与 SIGATT 业务账户无关。所有账户操作均记入审计，审计记录只读。
      </p>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新建账户' : '编辑账户'" width="460px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :disabled="dialogMode === 'edit'" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="o in roleOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.spacer { flex: 1; }
.note { margin: 12px 0 0; color: #909399; font-size: 12px; }
</style>
