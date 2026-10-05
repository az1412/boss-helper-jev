<script lang="ts">
// 技术 UI 是包级单例。保留它的宿主，切换标签页时只重新挂接自己创建的节点，
// 不反复 init/destroy，也不接管其他页面已经初始化的实例。
let technicalHost: HTMLElement | undefined
</script>

<script setup lang="ts">
import { DevLoggerUI } from 'devlog-ui'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { logger } from '../../utils/logger'
import type { BusinessLog, LogCategory, LogScope } from '../../utils/logView'
import {
  copyLogReason,
  exportBusinessLogs,
  filterBusinessLogs,
  latestLogRunId,
  LOG_CATEGORY_LABELS,
  paginateLogs,
  toBusinessLog,
} from '../../utils/logView'

const props = defineProps<{ runId?: string }>()
const rows = shallowRef<BusinessLog[]>([])
const config = shallowRef(logger.getConfig())
const scope = ref<LogScope>('current')
const category = ref<LogCategory | 'all'>('all')
const search = ref('')
const page = ref(1)
const pageSize = ref(50)
const feedback = ref('')
const advanced = ref(false)
const technicalContainer = ref<HTMLElement>()
const expanded = ref(new Set<string>())
const payloads = ref(new Set<string>())
const reasonExpanded = ref(new Set<string>())
const currentRun = computed(() =>
  props.runId === undefined ? latestLogRunId(rows.value) : props.runId || undefined,
)
const filtered = computed(() =>
  filterBusinessLogs(rows.value, {
    scope: scope.value,
    runId: currentRun.value,
    category: category.value,
    search: search.value,
  }).toReversed(),
)
const paged = computed(() => paginateLogs(filtered.value, page.value, pageSize.value))
const categoryItems = [
  { label: '全部分类', value: 'all' },
  ...Object.entries(LOG_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
]
const colors = { success: 'success', skipped: 'warning', error: 'error', run: 'neutral' } as const
const missingInfo = computed(
  () => config.value.minLevel === 'warn' || config.value.minLevel === 'error',
)
const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('zh-CN', { hour12: false })

function refresh() {
  rows.value = logger.getLogs().map(toBusinessLog)
  config.value = logger.getConfig()
}
let unsubscribe: (() => void) | undefined
let active = false
let queued = false
onMounted(() => {
  active = true
  refresh()
  unsubscribe = logger.subscribe(() => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (active) refresh()
    })
  })
})
onUnmounted(() => {
  active = false
  unsubscribe?.()
})
watch([scope, category, search, pageSize, currentRun], () => {
  page.value = 1
})
watch(
  () => paged.value.page,
  (value) => {
    page.value = value
  },
)
watch(
  () => paged.value.items.map((row) => row.id).join(','),
  () => {
    // 翻页后释放详情引用；最多挂载当前页，不积攒不可见的大对象 DOM。
    expanded.value = new Set()
    payloads.value = new Set()
    reasonExpanded.value = new Set()
  },
)

function toggle(set: Set<string>, id: string) {
  if (set.has(id)) set.delete(id)
  else set.add(id)
}
async function copyReason(row: BusinessLog) {
  try {
    await navigator.clipboard.writeText(copyLogReason(row))
    feedback.value = '已复制脱敏后的原因。'
  } catch {
    feedback.value = '复制失败，请展开原因后手动选中复制。'
  }
}
function download(all: boolean) {
  let url: string | undefined
  try {
    const text = exportBusinessLogs(logger, all ? undefined : filtered.value)
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `boss-helper-logs-${all ? 'all' : 'filtered'}-${Date.now()}.json`
    link.click()
    feedback.value = `已导出${all ? rows.value.length : filtered.value.length}条脱敏日志（包含所有匹配页）。`
  } catch {
    feedback.value = '导出失败，请稍后重试。'
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url!), 1000)
  }
}
async function toggleTechnical() {
  advanced.value = !advanced.value
  if (!advanced.value) {
    refresh()
    return
  }
  await nextTick()
  if (!technicalContainer.value) return
  if (DevLoggerUI.isInitialized() && !technicalHost) {
    feedback.value = '技术日志已在其他位置打开；此处不会重建或接管它。'
    advanced.value = false
    return
  }
  if (
    technicalHost?.parentElement?.isConnected &&
    technicalHost.parentElement !== technicalContainer.value
  ) {
    feedback.value = '技术日志已在另一个日志视图打开。'
    advanced.value = false
    return
  }
  technicalHost ??= document.createElement('div')
  technicalContainer.value.appendChild(technicalHost)
  if (!DevLoggerUI.isInitialized()) DevLoggerUI.init({ body: technicalHost })
  if (!DevLoggerUI.isInitialized())
    feedback.value = '技术日志暂时无法打开，业务日志仍可查看和导出。'
}
function clearFilters() {
  category.value = 'all'
  search.value = ''
}

// localStorage 里可能残留旧版技术面板写入的 __BH_LOG_LEVEL__=warn，
// 会把 info 级的成功/跳过日志在核心层直接丢弃。业务界面必须能改回来。
const level = ref<LogCategory | string>(config.value.minLevel)
const levelItems = [
  { label: 'info（推荐，记录成功/跳过/运行消息）', value: 'info' },
  { label: 'debug（最详细，含原始数据）', value: 'debug' },
  { label: 'warn（只记警告和错误）', value: 'warn' },
  { label: 'error（只记错误）', value: 'error' },
]

function changeLevel(value: string) {
  if (value !== 'debug' && value !== 'info' && value !== 'warn' && value !== 'error') return
  try {
    localStorage.setItem('__BH_LOG_LEVEL__', value)
  } catch {
    // 存储被禁用时仍能改本次会话的等级，只是下次加载不保留。
  }
  logger.configure({ minLevel: value })
  config.value = logger.getConfig()
  level.value = value
  feedback.value =
    value === 'info' || value === 'debug'
      ? '已切换记录等级；之后的新日志会记录成功和跳过，此前未采集的无法补回。'
      : '已切换记录等级；warn/error 会省略成功、跳过和普通运行消息。'
}
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" aria-label="业务日志">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-highlighted">运行记录</h2>
        <p class="mt-1 text-sm text-muted">按实际事件查看结果；日志条数不等于发送岗位数。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!filtered.length"
          @click="download(false)"
          >导出当前筛选</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!rows.length"
          @click="download(true)"
          >导出全部</UButton
        >
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-expanded="advanced"
          @click="toggleTechnical"
        >
          {{ advanced ? '收起技术日志' : '高级技术日志' }}
        </UButton>
      </div>
    </header>

    <p class="text-xs text-muted">
      当前记录等级 {{ config.minLevel }} · 最多保留
      {{ config.maxLogs }} 条（含历史）。导出已脱敏，但仍可能含个人求职信息，请谨慎分享。
    </p>
    <UAlert
      v-if="missingInfo"
      color="warning"
      variant="subtle"
      title="当前等级会省略成功、跳过和普通运行消息"
      description="已尊重你设置的日志等级；调回 info 只能记录后续信息，不能补回此前未采集的日志。"
    />
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">记录等级</span>
      <USelect
        :model-value="config.minLevel"
        :items="levelItems"
        size="sm"
        class="w-64"
        aria-label="日志记录等级"
        @update:model-value="changeLevel"
      />
      <span v-if="missingInfo" class="text-xs text-warning">
        建议改回 info，否则成功和跳过不会记录。
      </span>
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="记录范围">
        <USelect
          v-model="scope"
          :items="[
            { label: '本轮', value: 'current' },
            { label: '全部（含历史）', value: 'all' },
          ]"
          class="w-40"
        />
      </UFormField>
      <UFormField label="业务分类">
        <USelect v-model="category" :items="categoryItems" class="w-36" />
      </UFormField>
      <UFormField label="搜索" class="min-w-48 flex-1">
        <UInput v-model="search" placeholder="岗位、原因或运行编号" class="w-full" />
      </UFormField>
      <UButton
        color="neutral"
        variant="ghost"
        :disabled="category === 'all' && !search"
        @click="clearFilters"
        >清除筛选</UButton
      >
    </div>
    <p class="text-xs text-muted" aria-live="polite">
      匹配 {{ filtered.length }} / 共 {{ rows.length }} 条 · 最新记录在前<span
        v-if="scope === 'current' && currentRun"
      >
        · 本轮编号 {{ currentRun }}</span
      >
    </p>
    <p v-if="feedback" role="status" class="text-sm text-toned">{{ feedback }}</p>

    <div
      v-if="!rows.length"
      class="rounded-lg border border-dashed border-default px-4 py-10 text-center text-sm text-muted"
    >
      暂无日志。开始运行后，可在这里查看阶段、结果与原因。
    </div>
    <div
      v-else-if="!filtered.length"
      class="rounded-lg border border-dashed border-default px-4 py-10 text-center text-sm text-muted"
    >
      <template v-if="scope === 'current' && !currentRun"
        >尚无本轮编号；旧版历史未标记运行编号，请切到“全部（含历史）”查看。</template
      >
      <template v-else>当前筛选下没有记录。可更换分类、清除搜索或查看全部历史。</template>
    </div>
    <ol v-else class="divide-y divide-default rounded-lg border border-default">
      <li v-for="row in paged.items" :key="row.id" class="min-w-0 px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="colors[row.category]" variant="subtle" size="sm">{{
            LOG_CATEGORY_LABELS[row.category]
          }}</UBadge>
          <span
            v-if="row.jobName"
            class="min-w-0 break-words text-sm font-medium text-highlighted"
            >{{ row.jobName }}</span
          >
          <time class="ml-auto text-xs tabular-nums text-muted">{{
            formatTime(row.timestamp)
          }}</time>
        </div>
        <p
          class="mt-2 break-words text-sm text-default"
          :class="reasonExpanded.has(row.id) ? 'whitespace-pre-wrap' : 'line-clamp-2'"
        >
          {{ row.message }}
        </p>
        <p
          v-if="row.reason !== row.message"
          class="mt-1 break-words text-sm text-toned"
          :class="reasonExpanded.has(row.id) ? 'whitespace-pre-wrap' : 'line-clamp-2'"
        >
          {{ row.reason }}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UButton
            v-if="row.reason.length + row.message.length > 120"
            color="neutral"
            variant="link"
            size="xs"
            :aria-expanded="reasonExpanded.has(row.id)"
            @click="toggle(reasonExpanded, row.id)"
            >{{ reasonExpanded.has(row.id) ? '收起原因' : '展开原因' }}</UButton
          >
          <UButton color="neutral" variant="link" size="xs" @click="copyReason(row)"
            >复制原因</UButton
          >
          <UButton
            color="neutral"
            variant="link"
            size="xs"
            :aria-expanded="expanded.has(row.id)"
            @click="toggle(expanded, row.id)"
            >{{ expanded.has(row.id) ? '收起详情' : '技术详情' }}</UButton
          >
        </div>
        <div
          v-if="expanded.has(row.id)"
          class="mt-2 min-w-0 rounded bg-elevated p-3 text-xs text-muted"
        >
          <p class="break-all">
            等级 {{ row.log.level }} · {{ row.log.source?.file }}:{{ row.log.source?.line }} ·
            {{ row.runId ? `运行 ${row.runId}` : '旧记录 / 未标记运行编号' }}
          </p>
          <p v-if="row.jobKey" class="mt-1 break-all">岗位编号 {{ row.jobKey }}</p>
          <UButton
            color="neutral"
            variant="link"
            size="xs"
            class="mt-2"
            :aria-expanded="payloads.has(row.id)"
            @click="toggle(payloads, row.id)"
            >{{
              payloads.has(row.id) ? '收起原始数据' : '查看原始数据（已脱敏，可能含个人信息）'
            }}</UButton
          >
          <pre
            v-if="payloads.has(row.id)"
            class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all"
            >{{ JSON.stringify({ context: row.log.context, data: row.log.data }, null, 2) }}</pre>
        </div>
      </li>
    </ol>

    <footer v-if="filtered.length" class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-muted">
        第 {{ paged.page }} / {{ paged.totalPages }} 页 · 本页 {{ paged.items.length }} 条
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          v-model="pageSize"
          aria-label="每页条数"
          :items="[
            { label: '每页 50 条', value: 50 },
            { label: '每页 100 条', value: 100 },
            { label: '每页 200 条', value: 200 },
          ]"
          class="w-36"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="paged.page <= 1"
          @click="page = paged.page - 1"
          >上一页</UButton
        >
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="paged.page >= paged.totalPages"
          @click="page = paged.page + 1"
          >下一页</UButton
        >
      </div>
    </footer>
    <div v-show="advanced" class="min-w-0 overflow-auto rounded-lg border border-default">
      <p class="border-b border-default p-3 text-xs text-muted">
        技术视图用于排查问题，可能显示更多上下文。更改记录等级后，关闭此面板可刷新等级提示。
      </p>
      <div ref="technicalContainer"></div>
    </div>
  </section>
</template>
