<script lang="ts" setup>
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ComponentPublicInstance } from 'vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { useHelper } from '@/composables/useHelper'
import { filterJobView, getJobViewStatus, horizontalWheelDelta } from '@/utils/jobView'
import type { JobViewResult } from '@/utils/jobView'

const helper = useHelper()
const cards = ref<HTMLDivElement>()
const cardElements = new Map<string, HTMLElement>()
const following = ref(true)
const filterItemsChecked = ref<Record<string, boolean>>({})
const canGoLeft = ref(false)
const canGoRight = ref(false)
const allJobs = computed(() => filterJobView(helper.jobList.value, helper.jobResultMaps))

function filterKey(result?: JobViewResult) {
  const status = getJobViewStatus(result)
  // 先看最终状态：已确认发送、失败和预判跳过都可能没有任务节点 id。
  if (status === 'success' || status === 'error') return status
  if (result?.id) return `task:${result.id}`
  if (status === 'skipped' || status === 'running') return status
  return 'not_started'
}

const filterItems = computed<(DropdownMenuItem & { value: string })[]>(() => {
  const tasks = (helper.workflow?.pipeline.value ?? []).map((item) => ({
    type: 'checkbox' as const,
    label: item.label ?? item.id,
    value: `task:${item.id}`,
  }))
  // 保留已有结果里、但不在当前流程中的节点，避免这些岗位无法单独筛选。
  for (const job of allJobs.value) {
    const result = helper.jobResultMaps.get(job.key)
    const key = filterKey(result)
    if (result?.id && key.startsWith('task:') && !tasks.some((item) => item.value === key)) {
      tasks.push({ type: 'checkbox', label: result.id, value: key })
    }
  }
  return (
    [
      { type: 'checkbox', value: 'success', label: '投递成功', color: 'success' },
      ...tasks,
      { type: 'checkbox', value: 'error', label: '投递错误', color: 'error' },
      { type: 'checkbox', value: 'skipped', label: '预判跳过', color: 'warning' },
      { type: 'checkbox', value: 'running', label: '处理中（无任务节点）' },
      { type: 'checkbox', value: 'not_started', label: '未开始' },
    ] satisfies (DropdownMenuItem & { value: string })[]
  ).map((item) => ({
    ...item,
    checked: filterItemsChecked.value[item.value] ?? true,
    onUpdateChecked(checked: boolean) {
      filterItemsChecked.value[item.value] = checked
    },
    onSelect(event: Event) {
      event.preventDefault()
    },
  }))
})
const jobList = computed(() =>
  allJobs.value.filter(
    (job) => filterItemsChecked.value[filterKey(helper.jobResultMaps.get(job.key))] ?? true,
  ),
)
const currentHidden = computed(() =>
  Boolean(
    helper.currentJob.value && !jobList.value.some((job) => job.key === helper.currentJob.value),
  ),
)
let resizeObserver: ResizeObserver | undefined
let frame = 0

function updateEdges() {
  const el = cards.value
  canGoLeft.value = Boolean(el && el.scrollLeft > 1)
  canGoRight.value = Boolean(el && el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
}

function interruptFollow() {
  following.value = false
}

function filterSelectAll() {
  filterItems.value.forEach((item) => (filterItemsChecked.value[item.value] = true))
}

function filterToggle() {
  filterItems.value.forEach(
    (item) =>
      (filterItemsChecked.value[item.value] = !(filterItemsChecked.value[item.value] ?? true)),
  )
}

function onWheel(event: WheelEvent) {
  const el = cards.value
  if (!el || event.ctrlKey) return
  interruptFollow()
  const inner = (event.target as Element).closest<HTMLElement>('[data-card-scroll]')
  const delta = horizontalWheelDelta({
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey,
    innerVertical: Boolean(inner && inner.scrollHeight > inner.clientHeight + 1),
    scrollLeft: el.scrollLeft,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  })
  if (!delta) return
  event.preventDefault()
  el.scrollBy({ left: delta, behavior: 'instant' })
  updateEdges()
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(updateEdges)
}

function move(direction: number) {
  interruptFollow()
  const el = cards.value
  if (!el) return
  el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'instant' })
  updateEdges()
}

function onKeydown(event: KeyboardEvent) {
  if (
    [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      ' ',
    ].includes(event.key)
  )
    interruptFollow()
  if (event.target !== cards.value) return
  if (event.key === 'ArrowLeft' && canGoLeft.value) {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'ArrowRight' && canGoRight.value) {
    event.preventDefault()
    move(1)
  }
}

async function locateCurrent(clearHidden = false) {
  if (clearHidden && currentHidden.value) filterSelectAll()
  await nextTick()
  const key = helper.currentJob.value
  const card = key && cardElements.get(key)
  const el = cards.value
  if (!card || !el) return
  // offsetLeft 不受卡片悬停变换影响；只移动轨道，不滚动整个页面。
  const left = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2
  el.scrollTo({ left: Math.max(0, left), behavior: 'instant' })
  updateEdges()
}

async function toggleFollow() {
  if (following.value) {
    following.value = false
    return
  }
  await locateCurrent(true)
  following.value = true
}

watch(filterItemsChecked, interruptFollow, { deep: true })
watch(
  () => helper.currentJob.value,
  () => {
    if (following.value) void locateCurrent()
  },
  { flush: 'post' },
)
watch(
  jobList,
  async () => {
    await nextTick()
    updateEdges()
    if (following.value) void locateCurrent()
  },
  { flush: 'post' },
)

onMounted(() => {
  resizeObserver = new ResizeObserver(updateEdges)
  if (cards.value) resizeObserver.observe(cards.value)
  updateEdges()
  if (following.value) void locateCurrent()
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="boss-helper-card relative" aria-label="岗位浏览">
    <div
      ref="cards"
      class="card-grid"
      role="region"
      aria-label="横向岗位卡片，可用左右方向键浏览"
      tabindex="0"
      @wheel="onWheel"
      @pointerdown="interruptFollow"
      @focusin="interruptFollow"
      @keydown="onKeydown"
      @scroll.passive="updateEdges"
    >
      <JobCard
        v-for="job in jobList"
        :key="job.key"
        :ref="
          (el) => {
            if (el) cardElements.set(job.key, (el as ComponentPublicInstance).$el)
            else cardElements.delete(job.key)
          }
        "
        :job="job"
        hover
      />
      <div v-if="!allJobs.length" class="p-4 text-sm text-muted" role="status">
        当前页面还没有读取到岗位，请先在职位列表页加载岗位。
      </div>
      <div v-else-if="!jobList.length" class="p-4 text-sm text-muted" role="status">
        <p>当前视图没有匹配的岗位；视图过滤不会暂停投递。</p>
        <UButton class="mt-2" size="sm" color="neutral" variant="outline" @click="filterSelectAll"
          >显示全部岗位</UButton
        >
      </div>
    </div>
    <div class="flex gap-2 absolute bottom-6 left-2">
      <UButton
        size="md"
        :color="following ? 'primary' : 'neutral'"
        variant="outline"
        icon="i-lucide-accessibility"
        :aria-pressed="following"
        :aria-label="following ? '关闭自动跟随' : '开启自动跟随'"
        :title="following ? '自动跟随：已开启' : '自动跟随：已暂停，点击定位当前岗位并继续跟随'"
        @click="toggleFollow"
      />
      <UDropdownMenu :items="filterItems" :content="{ side: 'top' }" :ui="{ content: 'w-48' }">
        <UButton
          size="md"
          color="neutral"
          variant="outline"
          icon="lucide:list-filter"
          title="过滤（只影响显示，不改变投递队列）"
          aria-label="过滤岗位"
        />
        <template #content-top>
          <div class="p-2 flex flex-wrap gap-1">
            <UButton size="sm" variant="outline" @click="filterSelectAll" label="全选" />
            <UButton size="sm" variant="outline" @click="filterToggle" label="反选" />
          </div>
        </template>
      </UDropdownMenu>
    </div>
    <div class="card-grid-overlay" />
  </div>
</template>
