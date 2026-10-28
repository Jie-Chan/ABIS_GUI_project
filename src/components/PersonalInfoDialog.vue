<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABEL } from '@/constants/roles'
import { buildConfirmationMessage } from '@/utils/confirmation'
import { optionalAccountText } from '@/utils/account'

const visible = defineModel({ type: Boolean, default: false })
const auth = useAuthStore()
const router = useRouter()
const account = computed(() => auth.account || {})
const roleLabel = computed(() => ROLE_LABEL[account.value.role] || '角色未识别')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const submitError = ref('')
const formRef = ref(null)
const emptyPassword = () => ({ oldPassword: '', newPassword: '', confirmPassword: '' })
const password = ref(emptyPassword())
const rules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 7, message: '新密码长度必须大于 6 位', trigger: ['blur', 'change'] },
    { validator: (_, value, done) => done(value && value === password.value.oldPassword ? new Error('新密码不能与原密码相同') : undefined), trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: (_, value, done) => done(value && value !== password.value.newPassword ? new Error('两次输入的新密码不一致') : undefined), trigger: 'blur' },
  ],
}

function clearPassword() {
  password.value = emptyPassword()
  submitError.value = ''
}

watch(visible, async open => {
  clearPassword()
  await nextTick()
  formRef.value?.clearValidate()
  if (!open) return
  loadError.value = ''
  loading.value = true
  try { await auth.refreshAccount() }
  catch (error) { loadError.value = error.message || '读取个人信息失败，请稍后重试' }
  finally { loading.value = false }
})
onBeforeUnmount(clearPassword)

async function savePassword() {
  if (saving.value || loading.value || !auth.isLoggedIn || account.value.identityPending) return
  submitError.value = ''
  if (!await formRef.value?.validate().catch(() => false)) return
  try {
    await ElMessageBox.confirm(buildConfirmationMessage('确认修改本人密码？', ['修改成功后需要重新登录。']), '二次确认', { type: 'warning' })
  } catch { return }
  saving.value = true
  try {
    await api.changePassword({ oldPassword: password.value.oldPassword, newPassword: password.value.newPassword })
    auth.clearSession()
    clearPassword()
    visible.value = false
    await router.replace({ name: 'login' })
    ElMessage.success('密码已修改，请重新登录')
  } catch (error) {
    submitError.value = error.message || '修改密码失败，请稍后重试'
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog v-model="visible" class="personal-info-dialog" title="个人信息" width="560px" align-center :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving">
    <div v-loading="loading" class="profile-content">
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" class="profile-error" />
      <div class="profile-summary">
        <span class="profile-avatar" aria-hidden="true">{{ roleLabel.slice(0, 1) }}</span>
        <div><strong>{{ account.username || '-' }}</strong><el-tag size="small" :type="account.role === 'admin' ? 'success' : 'info'">{{ roleLabel }}</el-tag></div>
      </div>
      <el-descriptions :column="1" class="profile-details">
        <el-descriptions-item label="账户 ID">{{ account.id ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ account.username || '-' }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ account.displayName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ roleLabel }}</el-descriptions-item>
        <el-descriptions-item label="电话">{{ optionalAccountText(account.phone) }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ optionalAccountText(account.email) }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ optionalAccountText(account.remark) }}</el-descriptions-item>
      </el-descriptions>
    </div>
    <section class="password-section" aria-labelledby="change-password-heading">
      <h3 id="change-password-heading">修改密码</h3>
      <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" class="profile-error" />
      <el-form ref="formRef" :model="password" :rules="rules" label-position="top" :disabled="saving || loading || account.identityPending" @submit.prevent="savePassword">
        <el-form-item label="原密码" prop="oldPassword"><el-input v-model="password.oldPassword" type="password" show-password placeholder="请输入原密码" autocomplete="current-password" /></el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="password.newPassword" type="password" show-password placeholder="请输入新密码" autocomplete="new-password" aria-describedby="new-password-requirement" />
          <p id="new-password-requirement" class="password-requirement">新密码必须大于 6 位（至少 7 位）。</p>
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword"><el-input v-model="password.confirmPassword" type="password" show-password placeholder="请再次输入新密码" autocomplete="new-password" @keyup.enter="savePassword" /></el-form-item>
      </el-form>
      <p class="password-note">验证原密码后修改本人密码，修改成功后请重新登录。</p>
    </section>
    <template #footer><el-button :disabled="saving" @click="visible = false">关闭</el-button><el-button type="primary" :loading="saving" :disabled="loading || account.identityPending" @click="savePassword">保存新密码</el-button></template>
  </el-dialog>
</template>

<style scoped>
:global(.personal-info-dialog) { display: flex; flex-direction: column; max-height: 88dvh; }
:global(.personal-info-dialog .el-dialog__body) { min-height: 0; overflow-y: auto; }
:global(.personal-info-dialog .el-dialog__header), :global(.personal-info-dialog .el-dialog__footer) { flex-shrink: 0; }
.profile-summary { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
.profile-avatar { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; flex-shrink: 0; border-radius: 50%; background: #eaf0ff; color: #3268e8; font-size: 22px; font-weight: 600; }
.profile-summary strong { display: block; margin-bottom: 8px; font-size: 17px; overflow-wrap: anywhere; }
.profile-details :deep(.el-descriptions__label) { display: inline-block; width: 90px; color: #65748c; }
.profile-details :deep(.el-descriptions__content) { overflow-wrap: anywhere; white-space: pre-wrap; }
.profile-error { margin-bottom: 16px; }
.password-section { padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--abis-border); }
.password-section h3 { margin: 0 0 18px; font-size: 15px; }
.password-section :deep(.el-form-item) { margin-bottom: 20px; }
.password-section :deep(.el-form-item__label) { font-size: 13px; }
.password-section :deep(.el-input__wrapper) { min-height: 40px; }
.password-note { margin: 0; color: #718096; font-size: 12px; line-height: 1.7; }
.password-requirement { margin: 5px 0 0; color: #718096; font-size: 12px; line-height: 1.7; }
</style>
