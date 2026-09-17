<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { CONFIRM_TITLE } from '@/constants/nav'
import {
  THRESHOLD_MIN,
  THRESHOLD_MAX,
  THRESHOLD_KEYS,
  buildLowerBoundMessage,
  allowsBelowLowerBound,
  lowerBoundAlertType,
} from '@/constants/threshold'

// 页面 / 卡片标题取自 route.meta.title（唯一来源在 src/constants/nav.js），
// Global Constraints 第 2 条禁止同一句文案在多个文件里重复。
const route = useRoute()
const title = computed(() => route.meta.title || '')
const loading = ref(false)
const saving = ref(false)
const error = ref('')

/**
 * 初始值刻意留 `null` 而不是 0 —— `onMounted(load)` 在**首次渲染之后**才跑，
 * 若初始值是 0，第一帧会把 face=0 / finger=0 判成「低于下限」（0 < 60、0 < 40），
 * 于是加载完成前先闪出两条红色提示条再消失，像是一次假告警。
 * `null` 表示「尚未拿到值」，此时不产生任何提示。
 */
const form = ref({ face: null, finger: null })
const origin = ref({ face: null, finger: null })

/**
 * 低于协议生效下限的提示。
 * 需求 1.2：澄清前不得按任一种语义写死；澄清后由 ACTIVE_SEMANTICS 决定。
 */
const lowerBoundHints = computed(() =>
  THRESHOLD_KEYS
    .filter((k) => form.value[k.key] !== null && form.value[k.key] < k.protocolLowerBound)
    .map((k) => ({
      key: k.key,
      text: buildLowerBoundMessage(k.label, form.value[k.key], k.protocolLowerBound),
    }))
)

/** 校验：1–100 的整数（需求 1.2）；拒绝语义下另加下限校验 */
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
    // 不接住这个异常，加载失败的三重后果都不可见：界面没有任何提示、
    // 控制台留下一条未处理的 rejection、而 form 停在初始值上 ——
    // 用户看到的是一张空白表单，而不是「读取失败」。
    // 与 Task 6 的 store.refresh() 保持同一形态：catch 住，落到 error，由视图呈现。
    error.value = e.message || '读取阈值配置失败'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!validate()) return

  // 需求 1.2：阈值修改应经二次确认
  try {
    await ElMessageBox.confirm(
      `确认将人脸阈值由 ${origin.value.face} 改为 ${form.value.face}，指纹阈值由 ${origin.value.finger} 改为 ${form.value.finger}？`,
      CONFIRM_TITLE,
      { type: 'warning' }
    )
  } catch {
    // 用户点「取消」时 ElMessageBox.confirm 会 **reject 一个 'cancel'**。
    // 不接住它，本函数作为 @click 处理器被 Vue 的异步错误通道调用，
    // 于是**每次取消都在控制台留下一条报错**（由 Vue 的 `errorHandler` 打印；
    // ⚠ **不是**「unhandled rejection」——实测 0 次，且已用阳性对照证明监听器抓得到，
    // 见 `check-task8.js` 的 4.2 / 4.3）。
    // 功能没坏，但「取消」是常规操作，不该产生错误 —— 直接 return 即可。
    // ⚠ 这个 `return` 是**功能性的**，不是洁癖：删掉它，执行会继续落到下面的
    //   saving.value = true 与 api.updateThresholds()，**点「取消」会真的把阈值保存下去**。
    //   （`saving` 由 `finally` 复位，所以并不会出现「按钮一直转圈」。）
    return
  }

  saving.value = true
  try {
    const result = await api.updateThresholds({ ...form.value })
    form.value = { ...result }
    origin.value = { ...result }
    // 需求 1.2：界面应提示变更的生效延迟
    ElMessage.success('阈值已保存。变更将在各实例下次轮询后生效，最长约 1 分钟。')
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
        <span>{{ title }}</span>
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

      <el-form label-width="200px" style="max-width: 560px">
        <el-form-item v-for="k in THRESHOLD_KEYS" :key="k.key" :label="k.label">
          <el-input-number
            v-model="form[k.key]"
            :min="THRESHOLD_MIN"
            :max="THRESHOLD_MAX"
            :step="1"
            step-strictly
          />
          <span class="bound">协议生效下限：{{ k.protocolLowerBound }}</span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
          <el-button @click="load">重置</el-button>
        </el-form-item>
      </el-form>

      <p class="note">
        本页仅配置 ABIS 的默认阈值。调用方在接口请求中显式传入阈值时，以调用方传入值为准。
        1:1 核验的判定阈值归 SIGATT 业务系统，不在本页范围。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.bound { margin-left: 12px; color: #909399; font-size: 12px; }
.note { margin: 8px 0 0; color: #909399; font-size: 12px; line-height: 1.7; }
</style>
