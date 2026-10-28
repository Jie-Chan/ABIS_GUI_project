<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { buildConfirmationMessage } from '@/utils/confirmation'
import { CONFIRM_TITLE } from '@/constants/nav'
import {
  THRESHOLD_MIN,
  THRESHOLD_MAX,
  THRESHOLD_KEYS,
  buildLowerBoundMessage,
  allowsBelowLowerBound,
  lowerBoundAlertType,
} from '@/constants/threshold'

const route = useRoute()
const title = computed(() => route.meta.title || '')
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const form = ref({ face: null, finger: null })
const origin = ref({ face: null, finger: null })

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
  error.value = ''
  try {
    const result = await api.getThresholds()
    form.value = { ...result }
    origin.value = { ...result }
  } catch (e) {
    error.value = e.message || '读取阈值配置失败'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!validate()) return

  try {
    await ElMessageBox.confirm(
      buildConfirmationMessage('确认保存阈值配置？', [
        `人脸阈值：${origin.value.face} → ${form.value.face}`,
        `指纹阈值：${origin.value.finger} → ${form.value.finger}`,
      ]),
      CONFIRM_TITLE,
      { type: 'warning' }
    )
  } catch {
    return
  }

  saving.value = true
  try {
    const result = await api.updateThresholds({ ...form.value })
    form.value = { ...result }
    origin.value = { ...result }
    ElMessage.success('阈值已保存')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <el-card v-loading="loading">
      <template #header>
        <div class="record-heading"><span>{{ title }}</span><el-tag type="info" size="small">1:N 去重</el-tag></div>
      </template>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-alert
        v-for="hint in lowerBoundHints"
        :key="hint.key"
        :title="hint.text"
        :type="lowerBoundAlertType()"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form label-position="top" class="threshold-form">
        <el-form-item v-for="k in THRESHOLD_KEYS" :key="k.key" :label="k.label" class="threshold-field">
          <el-input-number
            v-model="form[k.key]"
            :min="THRESHOLD_MIN"
            :max="THRESHOLD_MAX"
            :step="1"
            step-strictly
          />
          <span class="bound">协议生效下限：{{ k.protocolLowerBound }}</span>
        </el-form-item>

        <el-form-item class="threshold-actions">
          <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
          <el-button @click="load">重置</el-button>
        </el-form-item>
      </el-form>

      <p class="note">
        配置默认 1:N 去重阈值；调用方传入阈值时以请求为准。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.threshold-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; max-width: 860px; }
.threshold-field { padding: 22px; margin: 0; background: #f7f9fc; border: 1px solid var(--abis-border); border-radius: 8px; }
.threshold-field :deep(.el-form-item__label) { margin-bottom: 18px; color: #3f526e; font-size: 13px; }
.threshold-field :deep(.el-form-item__content) { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.threshold-field :deep(.el-input-number) { width: 180px; max-width: 100%; }
.threshold-field :deep(.el-input__inner) { font-size: 20px; font-weight: 600; }
.threshold-field :deep(.el-input__wrapper) { height: 44px; }
.bound { color: #718096; font-size: 11px; }
.threshold-actions { grid-column: 1 / -1; margin-bottom: 0; }
.note { margin: 24px 0 0; color: #718096; font-size: 12px; line-height: 1.8; }
@media (max-width: 900px) { .threshold-form { grid-template-columns: 1fr; } }
</style>
