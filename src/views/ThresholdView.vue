<script setup>
import { h, ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { buildConfirmationMessage } from '@/utils/confirmation'
import {
  THRESHOLD_MIN,
  THRESHOLD_MAX,
  THRESHOLD_KEYS,
  DEFAULT_THRESHOLDS,
  buildLowerBoundMessage,
  allowsBelowLowerBound,
} from '@/constants/threshold'

const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const error = ref('')
const recoveryRequired = ref(false)
const hasLoaded = ref(false)

const form = ref({ face: null, finger: null })
const origin = ref({ face: null, finger: null })

const dirty = computed(() => hasLoaded.value && THRESHOLD_KEYS.some(({ key }) => form.value[key] !== origin.value[key]))
const busy = computed(() => loading.value || saving.value || confirming.value)
const valid = computed(() => THRESHOLD_KEYS.every(({ key, protocolLowerBound }) => Number.isInteger(form.value[key]) && form.value[key] >= protocolLowerBound && form.value[key] <= THRESHOLD_MAX))
const writeBlocked = computed(() => busy.value || recoveryRequired.value || !hasLoaded.value)

// 当前 InputNumber 仅在挂载时设置 aria-disabled，动态恢复可编辑后需同步给辅助技术。
function syncDisabledAttribute(el, { value }) {
  el.querySelector('input')?.setAttribute('aria-disabled', String(value))
}
const vSyncDisabled = { mounted: syncDisabledAttribute, updated: syncDisabledAttribute }

async function confirmDiscard(question) {
  confirming.value = true
  try {
    await ElMessageBox.confirm(buildConfirmationMessage(question, ['尚未保存的修改将被丢弃。']), '未保存的修改', {
      type: 'warning', confirmButtonText: '放弃修改', cancelButtonText: '继续编辑',
    })
    return true
  } catch { return false }
  finally { confirming.value = false }
}

onBeforeRouteLeave(async () => {
  // 注销或认证失效后应正常进入登录页。
  if (!auth.isLoggedIn) return true
  if (busy.value) {
    ElMessage.warning('请等待当前操作完成后再离开')
    return false
  }
  if (recoveryRequired.value) return true
  return !dirty.value || await confirmDiscard('存在未保存的阈值修改，确认离开？')
})

function beforeUnload(event) {
  if (recoveryRequired.value || (!dirty.value && !saving.value)) return
  event.preventDefault()
  event.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

const lowerBoundHints = computed(() =>
  THRESHOLD_KEYS
    .filter((k) => form.value[k.key] !== null && form.value[k.key] < k.protocolLowerBound)
    .map((k) => ({
      key: k.key,
      text: buildLowerBoundMessage(k.label, form.value[k.key], k.protocolLowerBound),
    }))
)

function validate() {
  for (const k of THRESHOLD_KEYS) {
    const v = form.value[k.key]
    if (!Number.isInteger(v) || v < THRESHOLD_MIN || v > THRESHOLD_MAX) {
      ElMessage.error(`${k.label}须为 ${THRESHOLD_MIN}–${THRESHOLD_MAX} 的整数`)
      return false
    }
    if (!allowsBelowLowerBound(v, k.protocolLowerBound)) {
      ElMessage.error(buildLowerBoundMessage(k.label, v, k.protocolLowerBound))
      return false
    }
  }
  return true
}

async function load() {
  loading.value = true
  if (!recoveryRequired.value) error.value = ''
  try {
    const result = await api.getThresholds()
    form.value = { ...result }
    origin.value = { ...result }
    hasLoaded.value = true
    recoveryRequired.value = false
    error.value = ''
  } catch (e) {
    error.value = `读取失败，请刷新页面重试。${e.message || ''}`
  } finally {
    loading.value = false
  }
}

async function saveThresholds(values) {
  if (writeBlocked.value || !dirty.value) return
  const payload = { ...values }
  const changes = THRESHOLD_KEYS.filter(({ key }) => payload[key] !== origin.value[key])

  confirming.value = true
  try {
    await ElMessageBox.confirm(
      h('div', { class: 'confirmation-details' }, changes.map(({ key, label }) =>
        h('p', `${label}：${origin.value[key]} → ${payload[key]}`)
      )),
      '保存阈值修改？',
      { type: 'warning', confirmButtonText: '保存', cancelButtonText: '取消' }
    )
  } catch {
    return
  } finally {
    confirming.value = false
  }

  saving.value = true
  try {
    const result = await api.updateThresholds(payload)
    form.value = { ...result }
    origin.value = { ...result }
    error.value = ''
    ElMessage.success('阈值已保存')
  } catch (e) {
    if (e.code === 'THRESHOLD_READBACK_FAILED') {
      recoveryRequired.value = true
      error.value = '配置已保存，但暂时无法确认当前值，请刷新页面确认。确认前请勿重复提交。'
    } else {
      ElMessage.error(e.message || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

function handleSave() {
  if (!writeBlocked.value && dirty.value && validate()) return saveThresholds(form.value)
}

function handleReset() {
  if (writeBlocked.value) return
  form.value = { ...DEFAULT_THRESHOLDS }
}

onMounted(load)
</script>

<template>
  <div class="threshold-page">
    <el-card v-loading="loading">
      <template #header>
        <h1 class="threshold-title">匹配阈值配置</h1>
      </template>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form label-position="top" class="threshold-form">
        <div class="threshold-fields">
          <el-form-item v-for="k in THRESHOLD_KEYS" :key="k.key" :label="k.label" class="threshold-field">
            <el-input-number
              v-model="form[k.key]"
              v-sync-disabled="writeBlocked"
              :min="THRESHOLD_MIN"
              :max="THRESHOLD_MAX"
              :step="1"
              step-strictly
              :disabled="writeBlocked"
            />
            <span class="bound">协议生效下限：{{ k.protocolLowerBound }}</span>
            <span v-if="lowerBoundHints.find(hint => hint.key === k.key)" class="field-error" role="alert">{{ lowerBoundHints.find(hint => hint.key === k.key).text }}</span>
          </el-form-item>
        </div>

        <p class="threshold-rule">调用方指定阈值时，以请求值为准。</p>

        <el-form-item class="threshold-actions">
          <el-button type="primary" :loading="saving" :disabled="writeBlocked || !dirty || !valid" @click="handleSave">保存修改</el-button>
          <el-button :disabled="writeBlocked" @click="handleReset">填入默认值</el-button>
          <span v-if="recoveryRequired" class="edit-state" role="status">配置待确认</span>
          <span v-else-if="dirty" class="edit-state" role="status">未保存</span>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.threshold-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.threshold-page > :deep(.el-card > .el-card__header) { padding: 14px 20px 0; border-bottom: 0; }
.threshold-page > :deep(.el-card > .el-card__body) { padding: 20px; }
.threshold-form { width: 100%; }
.threshold-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
.threshold-field { padding: 22px; margin: 0; background: #f7f9fc; border: 1px solid var(--abis-border); border-radius: 8px; }
.threshold-field :deep(.el-form-item__label) { margin-bottom: 18px; color: #3f526e; font-size: 13px; }
.threshold-field :deep(.el-form-item__content) { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.threshold-field :deep(.el-input-number) { width: 180px; max-width: 100%; }
.threshold-field :deep(.el-input__inner) { font-size: 20px; font-weight: 600; }
.threshold-field :deep(.el-input__wrapper) { height: 44px; }
.field-error { color: var(--el-color-danger); font-size: 12px; line-height: 1.7; }
.bound { color: #718096; font-size: 11px; }
.edit-state { margin-left: 12px; color: var(--el-color-warning); font-size: 13px; }
.threshold-actions :deep(.el-form-item__content) { gap: 8px 0; }
.threshold-actions { margin-bottom: 0; }
.threshold-rule { margin: 12px 0 16px; color: #718096; font-size: 12px; line-height: 1.8; }
@media (max-width: 900px) { .threshold-fields { grid-template-columns: 1fr; } }
@media (max-width: 767px) {
  .threshold-page > :deep(.el-card > .el-card__header), .threshold-page > :deep(.el-card > .el-card__body) { padding-inline: 16px; }
}
</style>
