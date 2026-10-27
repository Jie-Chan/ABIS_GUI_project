<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABEL } from '@/constants/roles'
import { isMockPreview } from '@/constants/presentation'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const auth = useAuthStore()
const router = useRouter()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const account = computed(() => auth.account || {})
const roleLabel = computed(() => ROLE_LABEL[account.value.role] || account.value.role || '—')
const formRef = ref()
const saving = ref(false)
const error = ref('')
const emptyForm = () => ({ oldPassword: '', newPassword: '', confirmPassword: '' })
const form = ref(emptyForm())

const rules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: (_rule, value, callback) => callback(value === form.value.newPassword ? undefined : new Error('两次输入的新密码不一致')), trigger: 'blur' },
  ],
}

function resetForm() {
  form.value = emptyForm()
  error.value = ''
  formRef.value?.clearValidate()
}

watch(() => props.modelValue, async open => {
  if (open) {
    resetForm()
    await nextTick()
    formRef.value?.clearValidate()
  }
})

async function handleSave() {
  if (saving.value) return
  error.value = ''
  saving.value = true
  try { await formRef.value.validate() } catch { saving.value = false; return }
  try {
    // 确认密码只参与界面校验，不发送到接口；身份由适配器的当前会话确定。
    await api.changePassword({ oldPassword: form.value.oldPassword, newPassword: form.value.newPassword })
  } catch (e) {
    error.value = e.message || '密码修改失败，请重试'
    saving.value = false
    return
  }

  resetForm()
  visible.value = false
  ElMessage.success('密码已修改，请使用新密码重新登录')
  // 修改成功与注销是两个阶段；注销失败不能把已完成的修改报告成失败。
  try { await auth.logout() }
  catch { ElMessage.warning('密码已修改，本地已退出，服务端注销状态待确认') }
  finally {
    saving.value = false
    router.replace({ name: 'login' })
  }
}
</script>

<template>
  <el-dialog v-model="visible" class="profile-dialog" title="个人信息" width="560px" align-center destroy-on-close
    :close-on-click-modal="!saving" :close-on-press-escape="!saving" :show-close="!saving" @closed="resetForm">
    <div class="profile-summary">
      <span class="profile-avatar" aria-hidden="true">{{ roleLabel.slice(0, 1) }}</span>
      <div><strong>{{ account.username || '—' }}</strong><el-tag size="small">{{ roleLabel }}</el-tag></div>
    </div>
    <dl class="profile-details">
      <div><dt>账户 ID</dt><dd>{{ account.id ?? '—' }}</dd></div>
      <div><dt>用户名</dt><dd>{{ account.username || '—' }}</dd></div>
      <div><dt>角色</dt><dd>{{ roleLabel }}</dd></div>
    </dl>

    <section class="password-section" aria-labelledby="password-heading">
      <h2 id="password-heading">修改密码</h2>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="password-error" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="saving" @submit.prevent="handleSave">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="form.oldPassword" type="password" show-password autocomplete="current-password" placeholder="请输入原密码" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" placeholder="请输入新密码" />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" placeholder="请再次输入新密码" @keyup.enter="handleSave" />
        </el-form-item>
      </el-form>
      <p class="password-note">验证原密码后修改本人密码，修改成功后请重新登录。</p>
      <p v-if="isMockPreview" class="mock-password-note">Mock 修改仅在本次预览中有效，刷新页面后恢复演示密码。</p>
    </section>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存新密码</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.profile-summary { display: flex; align-items: center; gap: 16px; margin: 0 0 22px; }
.profile-avatar { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; flex-shrink: 0; border-radius: 50%; color: #3268e8; background: #edf2ff; font-size: 22px; font-weight: 600; }
.profile-summary strong { display: block; max-width: 390px; margin-bottom: 7px; overflow-wrap: anywhere; font-size: 17px; }
.profile-details { display: grid; gap: 14px; margin: 0; }
.profile-details > div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; }
.profile-details dt { color: #718096; }
.profile-details dd { margin: 0; overflow-wrap: anywhere; }
.password-section { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--abis-border); }
.password-section h2 { margin: 0 0 18px; font-size: 15px; }
.password-section :deep(.el-form-item) { margin-bottom: 20px; }
.password-section :deep(.el-form-item__label) { font-size: 13px; }
.password-section :deep(.el-input__wrapper) { min-height: 40px; }
.password-error { margin-bottom: 16px; }
.password-note, .mock-password-note { margin: 8px 0 0; color: #718096; font-size: 12px; line-height: 1.7; }
.mock-password-note { color: #9b691f; }
@media (max-width: 600px) {
  .profile-summary strong { max-width: 170px; }
  .profile-details > div { grid-template-columns: 76px minmax(0, 1fr); }
}
</style>
