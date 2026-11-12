<script setup>
import { computed, ref, watch } from 'vue'
import { FINGER_POSITIONS, fingerLabel } from '@/constants/applicant'
import { formatLogTime } from '@/utils/log'
import EnrollmentImage from '@/components/EnrollmentImage.vue'
const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ detail: { type: Object, default: null }, loading: Boolean, error: { type: String, default: '' } })
defineEmits(['retry', 'closed', 'record-log'])
const selected = ref({})
const imageRecord = ref(null)
const imageVisible = ref(false)
const faceRecords = computed(() => props.detail?.records.filter(record => record.feature === 'face') || [])
const fingerRecords = computed(() => props.detail?.records.filter(record => record.feature === 'finger') || [])
const unmarked = computed(() => fingerRecords.value.filter(record => !FINGER_POSITIONS.some(position => position.key === record.fingerPosition)))
const fingerSlots = computed(() => FINGER_POSITIONS.map(position => ({ ...position, records: fingerRecords.value.filter(record => record.fingerPosition === position.key) })))
watch([visible, () => props.detail], () => { selected.value = {}; imageVisible.value = false; imageRecord.value = null })
function chosen(slot) { return slot.records.find(record => record.recordId === selected.value[slot.key]) || slot.records[0] }
function openImage(record) { imageRecord.value = record; imageVisible.value = true }
</script>
<template>
  <el-drawer v-model="visible" title="申请人详情" size="min(900px, 100vw)" class="applicant-drawer" @close="$emit('closed')">
    <div v-loading="loading" class="applicant-detail" :aria-busy="loading">
      <div v-if="error" class="detail-failure"><el-alert :title="error" type="error" :closable="false" /><el-button @click="$emit('retry')">重新读取</el-button></div>
      <template v-else-if="detail">
        <div class="detail-identity"><p>申请人 ID</p><h2 class="applicant-id">{{ detail.userId }}</h2></div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="首次入库时间">{{ detail.enrolledAt }}</el-descriptions-item>
          <el-descriptions-item label="最近更新时间">{{ detail.updatedAt }}</el-descriptions-item>
        </el-descriptions>
        <section class="biometric-group" data-modality="face">
          <h2>人脸 <span>{{ faceRecords.length }} 条</span></h2>
          <div v-if="faceRecords.length" class="face-records">
            <article v-for="record in faceRecords" :key="record.recordId" class="image-record" :data-record-id="record.recordId">
              <EnrollmentImage :record="record" @open="openImage" /><p class="record-id">{{ record.recordId }}</p><p>{{ formatLogTime(record.updatedAt) }}</p>
            </article>
          </div><p v-else class="not-enrolled">未入库</p>
        </section>
        <section class="biometric-group" data-modality="finger">
          <h2>指纹 <span>{{ fingerRecords.length }} 条</span></h2>
          <p v-if="!fingerRecords.length" class="not-enrolled">未入库</p>
          <template v-else>
            <div v-for="hand in ['左手', '右手']" :key="hand" class="hand-group"><h3>{{ hand }}</h3>
              <div class="finger-grid">
                <article v-for="slot in fingerSlots.filter(item => item.hand === hand)" :key="slot.key" class="finger-slot" :data-finger="slot.key">
                  <h4>{{ slot.label }} <span>{{ slot.records.length }} 条</span></h4>
                  <template v-if="slot.records.length">
                    <el-select v-if="slot.records.length > 1" :model-value="chosen(slot).recordId" :aria-label="`${slot.label}入库记录`" @change="id => selected[slot.key] = id">
                      <el-option v-for="(record, index) in slot.records" :key="record.recordId" :label="`第 ${index + 1} 条：${record.recordId}`" :value="record.recordId" />
                    </el-select>
                    <EnrollmentImage :record="chosen(slot)" @open="openImage" />
                    <p class="record-id">{{ chosen(slot).recordId }}</p><p>{{ formatLogTime(chosen(slot).updatedAt) }}</p>
                  </template><p v-else class="not-enrolled">未入库</p>
                </article>
              </div>
            </div>
            <div v-if="unmarked.length" class="unmarked-group"><h3>指位未标注</h3><div class="finger-grid"><article v-for="record in unmarked" :key="record.recordId" class="image-record"><EnrollmentImage :record="record" @open="openImage" /><p class="record-id">{{ record.recordId }}</p><p>{{ formatLogTime(record.updatedAt) }}</p></article></div></div>
          </template>
        </section>
        <p class="mock-note">图像为本地 Mock 样例，与每条入库记录一一绑定。</p>
      </template>
      <el-skeleton v-else-if="loading" :rows="5" animated />
    </div>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-drawer>
  <el-dialog v-model="imageVisible" title="入库图像详情" width="620px" append-to-body>
    <template v-if="imageRecord">
      <EnrollmentImage :record="imageRecord" large />
      <el-descriptions :column="1" border class="image-metadata">
        <el-descriptions-item label="申请人 ID">{{ imageRecord.userId }}</el-descriptions-item>
        <el-descriptions-item label="记录 ID">{{ imageRecord.recordId }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatLogTime(imageRecord.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="imageRecord.feature === 'finger'" label="指位">{{ fingerLabel(imageRecord.fingerPosition) }}</el-descriptions-item>
      </el-descriptions>
    </template>
    <template #footer><el-button @click="imageVisible = false">关闭图像</el-button><el-button v-if="imageRecord?.requestId" type="primary" @click="$emit('record-log', imageRecord)">查看本次入库日志</el-button></template>
  </el-dialog>
</template>
<style scoped>
.applicant-detail { min-height: 240px; }
.detail-identity { margin-bottom: 22px; }.detail-identity p { margin: 0 0 6px; color: var(--abis-muted); font-size: 12px; }.detail-identity h2 { margin: 0; font-size: 24px; }
.applicant-id,.record-id { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap: anywhere; }
.biometric-group { margin-top: 28px; }.biometric-group h2 { margin: 0 0 16px; font-size: 18px; }.biometric-group h2 span,h4 span { color: var(--abis-muted); font-size: 12px; font-weight: 400; margin-left: 8px; }
.face-records { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,190px)); gap: 16px; }
.image-record,.finger-slot { min-width: 0; padding: 10px; border: 1px solid var(--abis-border); border-radius: 8px; background: #fff; }
p { overflow-wrap: anywhere; }.image-record p,.finger-slot p { margin: 8px 0 0; color: var(--abis-muted); font-size: 11px; line-height: 1.7; }
.hand-group h3,.unmarked-group h3 { margin: 20px 0 12px; font-size: 14px; }
.finger-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 10px; }
.finger-slot h4 { margin: 0 0 12px; font-size: 12px; }.finger-slot h4 span { display: block; margin: 5px 0 0; }
.finger-slot :deep(.el-select) { width: 100%; margin-bottom: 10px; }
.not-enrolled { padding: 16px; border: 1px dashed var(--abis-border); border-radius: 6px; color: var(--abis-muted); font-size: 13px; }
.mock-note { margin-top: 24px; color: var(--abis-muted); font-size: 12px; }
.detail-failure { display: grid; gap: 16px; justify-items: start; }.image-metadata { margin-top: 18px; }
@media(max-width:700px){.finger-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.face-records { grid-template-columns: repeat(2,minmax(0,1fr)); }}
</style>
