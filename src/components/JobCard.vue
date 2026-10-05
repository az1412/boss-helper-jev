<script setup lang="ts">
import { computed, ref } from 'vue'

import type { JobStatus } from '@/composables/useApplying/type'
import type { JobData } from '@/composables/useHelper'
import { useHelper } from '@/composables/useHelper'
import { getJobReason, getJobViewStatus, jobViewLabels } from '@/utils/jobView'

const helper = useHelper()
const props = defineProps<{ job: JobData; hover?: boolean }>()
const jobResult = computed(() => helper.jobResultMaps.get(props.job.key))
const category = computed(() => getJobViewStatus(jobResult.value))
const isCurrent = computed(() => helper.currentJob.value === props.job.key)
const reason = computed(() => getJobReason(jobResult.value))
const judgment = computed(() => helper.jobJudgments?.get(props.job.key))
const stateMaps: Record<JobStatus, string> = {
  pending: '#CECECE',
  wait: '#CECECE',
  error: '#e74c3c',
  warn: '#f39c12',
  success: '#2ecc71',
  running: '#98F5F9',
  request: '#3498db',
  ai: '#9b59b6',
}
const status = computed(() =>
  category.value === 'success' ? 'success' : (jobResult.value?.status ?? 'pending'),
)
const showDescription = ref(false)
const descriptionLoading = ref(false)
const descriptionError = ref('')
const showReason = ref(false)
const copying = ref(false)
const copyFeedback = ref('')

async function loadDescription() {
  if (descriptionLoading.value) return
  showDescription.value = true
  descriptionLoading.value = true
  descriptionError.value = ''
  try {
    if (!props.job.jobDescription) await helper.onJobCardClick(props.job.key)
    if (!props.job.jobDescription)
      descriptionError.value = '未读取到岗位详情，可重试或打开原岗位查看。'
  } catch (error) {
    descriptionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    descriptionLoading.value = false
  }
}

function onContentClick(event: MouseEvent) {
  const content = event.currentTarget as HTMLElement
  const root = content.getRootNode() as { getSelection?: () => Selection | null }
  const selection = root.getSelection?.() ?? window.getSelection()
  if (selection && !selection.isCollapsed) return
  if (showDescription.value) showDescription.value = false
  else void loadDescription()
}

async function copyReason() {
  if (copying.value || !reason.value) return
  copying.value = true
  copyFeedback.value = ''
  try {
      await navigator.clipboard.writeText([reason.value, judgment.value?.reason].filter(Boolean).join('\n'))
    copyFeedback.value = '原因已复制'
  } catch {
    copyFeedback.value = '复制失败，请选择原因文字后手动复制。'
  } finally {
    copying.value = false
  }
}

function getActiveTimeType(job: JobData): 'success' | 'warning' | 'error' {
  if (!job.activeTime) return 'error'
  const diffDays = (Date.now() - job.activeTime) / (1000 * 60 * 60 * 24)
  if (diffDays <= 2) return 'success'
  if (diffDays <= 7) return 'warning'
  return 'error'
}
</script>

<template>
  <article
    class="job-card"
    :class="{ 'job-card-hover': hover, 'job-card-current': isCurrent }"
    :style="{
      '--state-color': stateMaps[status],
      '--state-show': jobResult && status !== 'pending' ? 'flex' : 'none',
    }"
    :data-job-key="job.key"
    :aria-label="`${job.jobName}，${jobViewLabels[category]}`"
    :aria-current="isCurrent ? 'step' : undefined"
  >
    <div class="card-tag">{{ job.brand.industry }},{{ job.degreeName }},{{ job.brand.scale }}</div>
    <a
      v-if="job.link"
      :href="job.link"
      target="_blank"
      rel="noopener noreferrer"
      class="card-title"
    >
      {{ job.jobName }}
    </a>
    <span v-else class="card-title">{{ job.jobName }}</span>
    <h3 class="card-salary">{{ job.salary }}</h3>
    <button v-if="judgment" class="text-left text-xs text-muted" @click="showReason = true">Jev {{ judgment.score }}/5 · {{ judgment.pass ? '通过筛选' : '未通过' }} · 查看判定</button>

    <div
      v-show="showDescription"
      class="card-content min-h-0 !overflow-y-auto"
      data-card-scroll
      tabindex="0"
      aria-label="岗位详情，按 Escape 返回岗位标签"
      :aria-busy="descriptionLoading"
      :title="job.jobDescription"
      @click="onContentClick"
      @keydown.esc.stop="showDescription = false"
    >
      <template v-if="descriptionLoading">
        <p role="status">加载中...</p>
        <USkeleton class="h-4 w-full shrink-0" />
        <USkeleton class="h-4 w-4/5 shrink-0" />
      </template>
      <template v-else-if="descriptionError">
        <p role="alert" class="wrap-anywhere">{{ descriptionError }}</p>
        <UButton
          class="mt-2 self-start"
          size="xs"
          color="neutral"
          variant="outline"
          @click.stop="loadDescription"
          >重试读取</UButton
        >
      </template>
      <p v-else class="whitespace-pre-wrap wrap-anywhere">{{ job.jobDescription }}</p>
      <UButton
        class="mt-2 shrink-0 self-start"
        size="xs"
        color="neutral"
        variant="ghost"
        @click.stop="showDescription = false"
        >返回岗位标签</UButton
      >
    </div>
    <div
      v-show="!showDescription"
      class="card-content min-h-0 !overflow-y-auto"
      data-card-scroll
      role="button"
      tabindex="0"
      :aria-label="`查看${job.jobName}的岗位详情`"
      :aria-expanded="showDescription"
      @click="onContentClick"
      @keydown.enter.self.prevent="loadDescription"
      @keydown.space.self.prevent="loadDescription"
    >
      <div>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="tag in job.skills"
            :key="tag"
            size="sm"
            variant="subtle"
            color="warning"
            class="whitespace-normal wrap-anywhere"
          >
            {{ tag }}
          </UBadge>
          <UBadge
            v-for="tag in job.jobLabels"
            :key="tag"
            size="sm"
            variant="subtle"
            color="success"
            class="whitespace-normal wrap-anywhere"
          >
            {{ tag }}
          </UBadge>
        </div>
      </div>
      <div v-if="job.welfareList?.length" class="card-footer wrap-anywhere">
        {{ job.welfareList.join(',') }}
      </div>
    </div>

    <div v-if="job.activeTime || job.activeTimeStr" class="active-time-tag">
      <UBadge
        :color="getActiveTimeType(job)"
        variant="subtle"
        class="whitespace-normal wrap-anywhere"
      >
        活跃时间：{{
          job.activeTime
            ? `${new Date(job.activeTime).toLocaleString('zh')}${job.activeTimeStr ? ` (${job.activeTimeStr})` : ''}`
            : job.activeTimeStr
        }}
      </UBadge>
    </div>

    <div class="author-row">
      <img
        v-if="job.brand.logo"
        alt=""
        class="avatar"
        height="80"
        :src="job.brand.logo"
        width="80"
        loading="lazy"
      />
      <span
        v-else
        class="avatar inline-flex items-center justify-center bg-elevated text-muted"
        aria-hidden="true"
        ><UIcon name="i-lucide-building-2"
      /></span>
      <div class="min-w-0">
        <span class="company-name">{{ job.brand.name }}</span>
        <h4 class="wrap-anywhere">{{ job.address }}</h4>
      </div>
    </div>
    <button
      v-if="jobResult"
      type="button"
      class="card-status flex-row gap-2 justify-center items-center max-w-full cursor-pointer"
      :title="reason || jobViewLabels[category]"
      :aria-label="`${jobViewLabels[category]}，查看完整原因`"
      @click="showReason = true"
    >
      <UIcon v-if="status === 'running'" name="i-line-md-loading-twotone-loop" class="shrink-0" />
      <UIcon v-else-if="status === 'request'" name="i-svg-spinners-wifi-fade" class="shrink-0" />
      <UIcon v-else-if="status === 'ai'" name="i-line-md-hazard-lights-loop" class="shrink-0" />
      <span class="truncate">{{ jobViewLabels[category] }}{{ reason ? ` · ${reason}` : '' }}</span>
    </button>
    <UModal v-model:open="showReason" title="完整处理原因" :description="job.jobName">
      <template #body>
        <p class="text-sm font-medium">{{ jobViewLabels[category] }}</p>
        <div v-if="judgment" class="mt-3 rounded-xl border border-default p-3 text-sm">
          <p>{{ judgment.reason }}</p>
          <p v-for="(item, index) in judgment.conditions" :key="index" class="mt-1">{{ item.kind === 'want' ? '想要' : '避免' }}：{{ item.label }} · {{ item.hit ? '命中' : '未命中' }}（{{ Math.round(item.value * 100) }}%）</p>
          <p class="mt-2 text-xs text-muted">以上是模型判定，接口未提供逐条岗位原文依据；“未命中”不能区分未提及和明确不符合。</p>
        </div>
        <p
          class="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap wrap-anywhere text-sm select-text"
          data-card-scroll
          tabindex="0"
        >
          {{ reason || '暂无详细原因。' }}
        </p>
        <p v-if="copyFeedback" role="status" class="mt-2 text-xs text-muted">{{ copyFeedback }}</p>
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-copy"
          :loading="copying"
          :disabled="copying || !reason"
          @click="copyReason"
          >复制原因</UButton
        >
      </template>
    </UModal>
  </article>
</template>
