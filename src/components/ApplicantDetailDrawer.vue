<script setup>
import { computed, ref, watch } from 'vue'
import { FINGER_POSITIONS, fingerLabel } from '@/constants/applicant'
import { formatLogTime } from '@/utils/log'
import { latestEnrollmentRecord } from '@/utils/applicant'
import EnrollmentImage from '@/components/EnrollmentImage.vue'
const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ detail: { type: Object, default: null }, loading: Boolean, error: { type: String, default: '' } })
defineEmits(['retry', 'closed', 'opened', 'change-log'])
const activeTab = defineModel('activeTab', { type: String, default: 'images' })
const imageRecord = ref(null)
const imageVisible = ref(false)
const faceRecords = computed(() => { const record = latestEnrollmentRecord(props.detail?.records.filter(record => record.feature === 'face')); return record ? [record] : [] })
const fingerRecords = computed(() => props.detail?.records.filter(record => record.feature === 'finger') || [])
const fingerCount = computed(() => new Set(fingerRecords.value.filter(record => FINGER_POSITIONS.some(position => position.key === record.fingerPosition)).map(record => record.fingerPosition)).size)
const unmarked = computed(() => fingerRecords.value.filter(record => !FINGER_POSITIONS.some(position => position.key === record.fingerPosition)))
const fingerSlots = computed(() => FINGER_POSITIONS.map(position => ({ ...position, records: fingerRecords.value.filter(record => record.fingerPosition === position.key) })))
watch([visible, () => props.detail], () => { imageVisible.value = false; imageRecord.value = null })
function chosen(slot) { return latestEnrollmentRecord(slot.records) }
function openImage(record) { imageRecord.value = record; imageVisible.value = true }
</script>
<template>
  <el-drawer v-model="visible" title="申请人详情" size="min(1100px, 100vw)" class="applicant-drawer detail-drawer" @close="$emit('closed')" @opened="$emit('opened')">
    <div v-loading="loading" class="applicant-detail" :aria-busy="loading">
      <div v-if="error" class="detail-failure"><el-alert :title="error" type="error" :closable="false" /><el-button @click="$emit('retry')">重新读取</el-button></div>
      <template v-else-if="detail">
        <el-descriptions :column="3" border class="applicant-summary">
          <el-descriptions-item label="申请人 ID"><span class="applicant-id">{{ detail.userId }}</span></el-descriptions-item>
          <el-descriptions-item label="首次注册">{{ detail.enrolledAt }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ detail.updatedAt || '—' }}</el-descriptions-item>
        </el-descriptions>
        <el-tabs v-model="activeTab" class="applicant-detail-tabs">
          <el-tab-pane label="当前入库图像" name="images">
        <div class="current-images">
        <section class="biometric-group" data-modality="face">
          <h2>人脸</h2>
          <div v-if="faceRecords.length" class="face-records">
            <article v-for="record in faceRecords" :key="record.userId" class="image-record">
              <EnrollmentImage :record="record" @open="openImage" />
            </article>
          </div><p v-else class="not-enrolled">未入库</p>
        </section>
        <section class="biometric-group" data-modality="finger">
          <h2>指纹 <span>{{ fingerCount }} 指</span></h2>
          <p v-if="!fingerRecords.length" class="not-enrolled">未入库</p>
            <div v-for="hand in ['左手', '右手'].filter(hand => fingerSlots.some(slot => slot.hand === hand && slot.records.length))" :key="hand" class="hand-group"><h3>{{ hand }}</h3>
              <div class="finger-grid">
                <article v-for="slot in fingerSlots.filter(item => item.hand === hand && item.records.length)" :key="slot.key" class="finger-slot" :data-finger="slot.key">
                  <h4>{{ slot.label }}</h4>
                  <template v-if="slot.records.length">
                    <EnrollmentImage :record="chosen(slot)" @open="openImage" />
                  </template><p v-else class="not-enrolled">未入库</p>
                </article>
              </div>
            </div>
            <div v-if="unmarked.length" class="unmarked-group"><h3>指位未标注</h3><div class="finger-grid"><article v-for="(record, index) in unmarked" :key="`${record.imageUrl}-${index}`" class="image-record"><EnrollmentImage :record="record" @open="openImage" /></article></div></div>
        </section>
        </div>
          </el-tab-pane>
          <el-tab-pane label="入库变更记录" name="changes">
            <p class="mock-note">仅显示已生效的入库变更；失败请求可在日志查询中按申请人 ID 查看。</p>
            <el-table :data="detail.changes || []" class="enrollment-changes" empty-text="暂无已记录的入库变更" border>
              <el-table-column label="操作类型" min-width="125"><template #default="{ row }">{{ row.feature === 'face' ? '人脸' : '指纹' }}{{ row.operation }}</template></el-table-column>
              <el-table-column label="模态" width="70"><template #default="{ row }">{{ row.feature === 'face' ? '人脸' : '指纹' }}</template></el-table-column>
              <el-table-column label="生效时间" min-width="200"><template #default="{ row }">{{ formatLogTime(row.effectiveAt) }}</template></el-table-column>
              <el-table-column label="指位数" width="80"><template #default="{ row }">{{ row.fingerCount ?? '—' }}</template></el-table-column>
              <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="$emit('change-log', row)">查看日志</el-button></template></el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
      <el-skeleton v-else-if="loading" :rows="5" animated />
    </div>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-drawer>
  <el-dialog v-model="imageVisible" title="入库图像详情" width="620px" class="enrollment-preview" align-center append-to-body>
    <template v-if="imageRecord">
      <EnrollmentImage :record="imageRecord" large />
      <el-descriptions :column="1" border class="image-metadata">
        <el-descriptions-item label="申请人 ID">{{ imageRecord.userId }}</el-descriptions-item>
        <el-descriptions-item label="质量分">{{ Number.isFinite(imageRecord.qualityScore) ? imageRecord.qualityScore : '—' }}</el-descriptions-item>
        <el-descriptions-item label="图像更新时间">{{ formatLogTime(imageRecord.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="imageRecord.feature === 'finger'" label="指位">{{ fingerLabel(imageRecord.fingerPosition) }}</el-descriptions-item>
      </el-descriptions>
    </template>
    <template #footer><el-button @click="imageVisible = false">关闭图像</el-button></template>
  </el-dialog>
</template>
<style scoped>
.applicant-detail { min-height: 240px; }
.applicant-detail-tabs { margin-top: 16px; }
.applicant-summary :deep(.el-descriptions__label) { white-space: nowrap; }
.current-images { display: grid; grid-template-columns: 190px minmax(0,1fr); gap: 20px; }
.applicant-id { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap: anywhere; }
.biometric-group { min-width: 0; margin-top: 12px; }
.biometric-group h2 { margin: 0 0 12px; font-size: 16px; }
.biometric-group h2 span,h4 span { color: var(--abis-muted); font-size: 12px; font-weight: 400; margin-left: 6px; }
.face-records { display: grid; gap: 12px; }
.image-record,.finger-slot { min-width: 0; padding: 8px; border: 1px solid var(--abis-border); border-radius: 8px; background: #fff; }
p { overflow-wrap: anywhere; }
.hand-group h3,.unmarked-group h3 { margin: 12px 0 8px; font-size: 13px; }
.finger-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px; }
.finger-slot h4 { margin: 0 0 8px; font-size: 12px; }
.finger-slot :deep(.enrollment-image) { height: 110px; }
.face-records :deep(.enrollment-image) { height: 250px; }
.not-enrolled { padding: 12px; border: 1px dashed var(--abis-border); border-radius: 6px; color: var(--abis-muted); font-size: 13px; }
.mock-note { margin-top: 16px; color: var(--abis-muted); font-size: 12px; }
.detail-failure { display: grid; gap: 16px; justify-items: start; }
.image-metadata { margin-top: 18px; flex-shrink: 0; }
:global(.enrollment-preview) { display: flex; flex-direction: column; max-height: calc(100dvh - 32px); margin-block: 16px; }
:global(.enrollment-preview .el-dialog__header), :global(.enrollment-preview .el-dialog__footer) { flex-shrink: 0; }
:global(.enrollment-preview .el-dialog__body) { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
:global(.enrollment-preview .large) { height: min(42dvh, 360px); min-height: 120px; flex-shrink: 1; }
@media(max-width:1000px) {
  .applicant-summary :deep(tr) { display: grid; grid-template-columns: 135px minmax(0,1fr); }
  .applicant-summary :deep(.el-descriptions__cell) { min-width: 0; }
  .current-images { grid-template-columns: 160px minmax(0,1fr); gap: 16px; }
  .finger-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
}
@media(max-width:700px) {
  .current-images { grid-template-columns: minmax(0,1fr); }
  .finger-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .face-records { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .face-records :deep(.enrollment-image) { height: 200px; }
}
</style>
