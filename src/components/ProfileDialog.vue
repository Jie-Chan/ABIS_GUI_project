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
const activeTab = ref('details')
const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const busy = computed(() => saving.value || confirming.value)
const loadError = ref('')
const submitError = ref('')
const formRef = ref(null)
const passwordRequirement = '新密码至少 7 位'
const newPasswordError = ref('')
const emptyPassword = () => ({ oldPassword: '', newPassword: '', confirmPassword: '' })
const password = ref(emptyPassword())
const rules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 7, message: passwordRequirement, trigger: ['blur', 'change'] },
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
  newPasswordError.value = ''
}

function handlePasswordValidation(prop, valid, message) {
  if (prop === 'newPassword') newPasswordError.value = valid ? '' : message || ''
}

watch(visible, async open => {
  clearPassword()
  if (open) activeTab.value = 'details'
  await nextTick()
  formRef.value?.clearValidate()
  if (!open) return
  loadError.value = ''
  loading.value = true
  try { await auth.refreshAccount() }
  catch (error) { loadError.value = error.message || '读取个人信息失败，请稍后重试' }
  finally { loading.value = false }
})
watch(activeTab, async () => {
  clearPassword()
  await nextTick()
  formRef.value?.clearValidate()
})
onBeforeUnmount(clearPassword)

async function savePassword() {
  if (activeTab.value !== 'password' || busy.value || loading.value || !auth.isLoggedIn || account.value.identityPending) return
  submitError.value = ''
  confirming.value = true
  try {
    if (!await formRef.value?.validate().catch(() => false)) return
    await ElMessageBox.confirm(buildConfirmationMessage('确认修改本人密码？', ['修改成功后需要重新登录。']), '二次确认', { type: 'warning' })
  } catch { return }
  finally { confirming.value = false }
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
  <el-dialog v-model="visible" class="personal-info-dialog" title="个人信息" width="560px" align-center :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" class="profile-error" />
    <el-tabs v-model="activeTab" class="profile-tabs">
    <el-tab-pane label="基本资料" name="details" :disabled="busy">
    <div v-loading="loading" class="profile-content">
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
    </el-tab-pane>
    <el-tab-pane label="修改密码" name="password">
    <section class="password-section" aria-label="修改密码">

      <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" class="profile-error" />
      <el-form ref="formRef" :model="password" :rules="rules" label-position="top" :disabled="busy || loading || account.identityPending" @validate="handlePasswordValidation" @submit.prevent="savePassword">
        <el-form-item label="原密码" prop="oldPassword"><el-input v-model="password.oldPassword" type="password" show-password placeholder="请输入原密码" autocomplete="current-password" /></el-form-item>
        <el-form-item label="新密码" prop="newPassword" :show-message="false">
          <el-input v-model="password.newPassword" type="password" show-password placeholder="请输入新密码" autocomplete="new-password" aria-describedby="new-password-requirement" />
          <p id="new-password-requirement" class="password-requirement" :class="{ 'is-error': newPasswordError }" :role="newPasswordError ? 'alert' : undefined">{{ newPasswordError || passwordRequirement }}</p>
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword"><el-input v-model="password.confirmPassword" type="password" show-password placeholder="请再次输入新密码" autocomplete="new-password" @keyup.enter="savePassword" /></el-form-item>
      </el-form>
      <p class="password-note">修改成功后请重新登录。</p>
    </section>
    </el-tab-pane>
    </el-tabs>
    <template #footer><el-button :disabled="busy" @click="visible = false">关闭</el-button><el-button v-if="activeTab === 'password'" type="primary" :loading="saving" :disabled="loading || account.identityPending" @click="savePassword">保存新密码</el-button></template>
  </el-dialog>
</template>

<style scoped>
:global(.personal-info-dialog) { display: flex; flex-direction: column; max-height: 88dvh; }
:global(.personal-info-dialog .el-dialog__body) { min-height: 0; overflow-y: auto; }
:global(.personal-info-dialog .el-dialog__header), :global(.personal-info-dialog .el-dialog__footer) { flex-shrink: 0; }
.profile-details :deep(.el-descriptions__label) { display: inline-block; width: 90px; color: #65748c; }
.profile-details :deep(.el-descriptions__content) { overflow-wrap: anywhere; white-space: pre-wrap; }
.profile-error { margin-bottom: 16px; }
.password-section { padding-top: 4px; }
.password-section h3 { margin: 0 0 18px; font-size: 15px; }
.password-section :deep(.el-form-item) { margin-bottom: 20px; }
.password-section :deep(.el-form-item__label) { font-size: 13px; }
.password-section :deep(.el-input__wrapper) { min-height: 40px; }
.password-note { margin: 0; color: #718096; font-size: 12px; line-height: 1.7; }
.password-requirement { margin: 5px 0 0; color: #718096; font-size: 12px; line-height: 1.7; }
.password-requirement.is-error { color: var(--el-color-danger); }
</style>
