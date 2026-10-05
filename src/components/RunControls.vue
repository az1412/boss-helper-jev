<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import { localDateKey } from '@/utils/jobView'

const helper = useHelper()
const conf = useConf()
const models = useModel()
const initiating = ref(false)
const actionError = ref('')
const chooseSettings = ref(false)
const confirmReset = ref(false)
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => clearInterval(clock))

const workflow = computed(() => helper.workflow)
const status = computed(() => workflow.value?.status.value ?? 'pending')
const busy = computed(() => Boolean(workflow.value?.busy.value || conf.runLocked.value))
const locked = computed(
  () =>
    busy.value ||
    initiating.value ||
    conf.isSaving.value ||
    conf.isLoading.value ||
    models.editing.value ||
    models.testing.value > 0 ||
    models.saving.value,
)
const countdown = computed(() =>
  Math.max(0, Math.ceil(((workflow.value?.waitUntil.value ?? 0) - now.value) / 1000)),
)
const phase = computed(() => {
  if (conf.isLoading.value) return '正在加载设置'
  if (initiating.value && !busy.value) return conf.isSaving.value ? '正在保存设置' : '正在准备运行'
  if (busy.value && (status.value === 'done' || status.value === 'error'))
    return '正在保存结果，请稍候'
  return workflow.value?.phase.value || '等待开始'
})
const displayedError = computed(
  () => actionError.value || workflow.value?.errorMessage.value || conf.saveError.value,
)
const today = computed(() => helper.statistics.todayData.value)
const todayIsCurrent = computed(() => today.value.date === localDateKey(new Date(now.value)))
const savedLimit = computed(() => {
  if (conf.isLoading.value) return null
  // 额度只取保存稿，不让尚未保存的输入改变进度条。
  void conf.isSaving.value
  void conf.isDirty.value
  return Math.min(150, Number(conf.getSavedSnapshot().deliveryLimit.value))
})
const roundTarget = computed(() =>
  workflow.value?.runId.value ? workflow.value.runLimit.value : conf.formData.runDeliveryLimit,
)
const roundMode = computed(() =>
  (workflow.value?.runId.value ? workflow.value.runMode.value : conf.formData.jev.mode) === 'sorted'
    ? '排序模式'
    : '快速模式',
)
const progress = computed(() => {
  return Math.min(
    100,
    ((workflow.value?.runDelivered.value ?? 0) / (roundTarget.value || 50)) * 100,
  )
})
const dailyRemaining = computed(() =>
  Math.max(0, (savedLimit.value ?? 0) - (todayIsCurrent.value ? today.value.success : 0)),
)
const continuing = computed(() => status.value === 'stop' || workflow.value?.resumable.value)
const canReset = computed(() =>
  [...helper.jobResultMaps.values()].some(
    (result) =>
      result.status !== 'success' && !result.deliveryConfirmed && !result.deliveryUncertain,
  ),
)

function requestStart() {
  if (locked.value) return
  actionError.value = ''
  if (conf.isDirty.value) chooseSettings.value = true
  else void start(false)
}

async function start(save: boolean) {
  if (locked.value) return
  initiating.value = true
  actionError.value = ''
  try {
    if (save) await conf.confSaving()
    chooseSettings.value = false
    // 快照与执行锁仍由真实工作流持有，界面只负责操作入口。
    await helper.start()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    initiating.value = false
  }
}

async function pause() {
  actionError.value = ''
  try {
    await helper.stop()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  }
}

async function reset() {
  if (locked.value) return
  initiating.value = true
  actionError.value = ''
  try {
    await helper.reset()
    confirmReset.value = false
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    initiating.value = false
  }
}
</script>

<template>
  <div aria-label="运行控制">
    <p v-if="models.testing.value" class="mb-2 text-xs text-warning">模型测试尚未结束，请等待收尾后开始投递。</p>
    <div class="mb-3 flex flex-wrap items-end gap-3">
      <UFormField label="本轮上限" class="min-w-48">
        <UInputNumber
          v-model="conf.formData.runDeliveryLimit"
          aria-label="本轮投递上限"
          :min="1"
          :max="150"
          :step="1"
          :disabled="locked || continuing"
        />
      </UFormField>
      <UFormField v-if="conf.formData.jev.enable" label="投递模式">
        <USelect
          v-model="conf.formData.jev.mode"
          aria-label="投递模式"
          :items="[
            { label: '快速模式（默认）', value: 'fast' },
            { label: '排序模式', value: 'sorted' },
          ]"
          :disabled="locked || continuing"
        />
      </UFormField>
    </div>
    <p class="mb-2 text-xs text-muted">
      本轮已发送 {{ workflow?.runDelivered.value ?? 0 }}/{{ roundTarget }} · 本工具今日已发送
      {{ todayIsCurrent ? today.success : '尚未更新' }}/{{ savedLimit ?? '加载中' }}
      <span v-if="conf.formData.jev.enable"> · {{ roundMode }}</span>
    </p>
    <p class="mb-2 text-xs text-muted">
      本轮还可发送
      {{
        Math.min(Math.max(0, roundTarget - (workflow?.runDelivered.value ?? 0)), dailyRemaining)
      }}
      个。仅确认成功计数；手机或手动招呼可能未同步，平台实际限额优先。
    </p>
    <p v-if="continuing" class="mb-2 text-xs text-warning">
      继续沿用本轮目标与成功计数。服务额度不足时，请先补充额度或修正配置，再继续；已发送岗位不会补发。
    </p>
    <div class="flex flex-row gap-2 items-center justify-center">
      <UFieldGroup>
        <UButton
          color="primary"
          data-testid="run-start"
          data-help="使用已保存的设置开始；有未保存修改时会先提示"
          :disabled="locked"
          :loading="busy || initiating"
          @click="requestStart"
          >{{ continuing ? '继续本轮' : '开始' }}</UButton
        >
        <UButton
          v-if="!busy && canReset"
          color="warning"
          data-testid="run-reset"
          data-help="重新评估未发送岗位，保留已发送和发送结果待核实记录"
          :disabled="locked"
          @click="confirmReset = true"
          >重置筛选</UButton
        >
        <UButton
          v-if="busy"
          color="warning"
          data-testid="run-pause"
          :disabled="status !== 'running'"
          @click="pause"
          >{{
            status === 'running' ? '暂停' : status === 'stopping' ? '暂停中' : '收尾中'
          }}</UButton
        >
      </UFieldGroup>
      <UProgress
        class="flex-1 min-w-0"
        :model-value="progress"
        :aria-label="`本轮已发送 ${workflow?.runDelivered.value ?? 0}，本轮目标 ${roundTarget}`"
        data-help="本轮确认发送成功数 / 本轮目标"
      />
    </div>
    <p v-if="displayedError" class="mt-2 text-xs text-error wrap-anywhere" role="alert">
      {{ displayedError }}
    </p>
    <p
      v-else-if="busy || initiating || status !== 'pending'"
      class="mt-2 text-xs text-muted wrap-anywhere"
      role="status"
      aria-live="polite"
    >
      {{ phase }}<span v-if="countdown > 0"> · 剩余 {{ countdown }} 秒</span>
      <span v-if="!busy && workflow?.endReason.value"> · {{ workflow.endReason.value }}</span>
    </p>
    <p v-if="busy && workflow?.preparing.value" class="mt-2 text-xs text-muted" role="status">
      {{ workflow.preparing.value }}
    </p>

    <UModal
      v-model:open="chooseSettings"
      title="使用哪份设置开始？"
      description="当前有未保存的修改。本轮运行只读取一份已保存的设置快照。"
      :dismissible="!initiating"
    >
      <template #body>
        <p class="text-sm text-muted">
          “使用已保存设置”不会丢弃编辑中的草稿，也不会把草稿用于本轮运行。
        </p>
        <UAlert
          v-if="displayedError"
          class="mt-3"
          color="error"
          title="保存或启动失败"
          :description="displayedError"
        />
      </template>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton
            :loading="initiating && conf.isSaving.value"
            :disabled="locked"
            @click="start(true)"
            >保存并开始</UButton
          >
          <UButton color="neutral" variant="outline" :disabled="locked" @click="start(false)"
            >使用已保存设置</UButton
          >
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="initiating"
            @click="chooseSettings = false"
            >返回修改</UButton
          >
        </div>
      </template>
    </UModal>
    <UModal
      v-model:open="confirmReset"
      title="重新评估未发送岗位？"
      description="清除可重新评估岗位的判定和缓存；已发送、发送结果待核实的岗位及去重记录都会保留。"
      :dismissible="!initiating"
    >
      <template #body>
        <p class="text-sm">
          启用 AI 筛选时，再次开始会产生额外的 AI
          调用，可能消耗余额。此操作不会立即发送，完成后请再点“开始”。
        </p>
        <UAlert
          v-if="actionError"
          class="mt-3"
          color="error"
          title="重新评估未完成"
          :description="actionError"
        />
      </template>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton color="warning" :disabled="locked" @click="reset">确认重新评估</UButton>
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="initiating"
            @click="confirmReset = false"
            >取消</UButton
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
