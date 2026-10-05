<script lang="ts" setup>
import { useNow } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import ProfileCard from '@/components/Profile/ProfileCard.vue'
import RunControls from '@/components/RunControls.vue'
import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { localDateKey, statisticsForDays } from '@/utils/jobView'

const helper = useHelper()
const conf = useConf()
const { todayData, statisticsData } = helper.statistics
const statisticCycle = ref(1)
const loading = ref(true)
const loadError = ref('')
const clock = useNow({ interval: 60000 })
const statisticCycleData = [
  { label: '近三日投递', date: 3 },
  { label: '近七日投递', date: 7 },
  { label: '近三十日投递', date: 30 },
  { label: '历史投递', date: null },
]
const rows = computed(() =>
  statisticsForDays(
    statisticsData.value,
    todayData.value,
    statisticCycleData[statisticCycle.value]?.date ?? null,
    clock.value,
  ),
)
const sent = computed(() => rows.value.reduce((sum, row) => sum + row.success, 0))
const todayIsCurrent = computed(() => todayData.value.date === localDateKey(clock.value))
const readableToday = computed(() => !loading.value && !loadError.value && todayIsCurrent.value)
// 今日的处理数与成功数都是实时计数，可以算出未投递占比；(处理-成功) 含跳过/重复/失败。
// 历史记录不含完整的处理数，无法据此推算，那时才显示“未记录”。
const filterRatio = computed(() => {
  if (!readableToday.value || !todayData.value.total) return null
  return Math.round(
    ((todayData.value.total - todayData.value.success) / todayData.value.total) * 100,
  )
})

async function refresh() {
  loading.value = true
  loadError.value = ''
  try {
    await helper.statistics.updateStatistics()
  } catch {
    loadError.value = '统计记录暂时无法读取，请重试。'
  } finally {
    loading.value = false
  }
}
onMounted(refresh)
</script>

<template>
  <div class="flex gap-2 flex-col">
    <ProfileCard />
    <Alert
      id="config-statistics"
      description="统计仅含本工具记录，不代表平台全部投递；每日上限请按自身情况设置，平台最高 150。"
      color="warning"
      show-icon
    />
    <div v-if="loadError" class="flex items-center gap-2 text-xs text-error" role="alert">
      {{ loadError }}
      <UButton size="xs" variant="ghost" :loading="loading" @click="refresh">重试读取</UButton>
    </div>
    <div
      v-if="conf.configLevel.intermediate"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      <div
        class="rounded-xl border border-default bg-elevated/40 px-3.5 py-3"
        data-help="今日实际保存的处理次数；旧记录可能不包含列表预判"
      >
        <div class="text-xs text-muted">今日处理记录</div>
        <div class="mt-1 text-2xl font-semibold tracking-tight">
          {{ readableToday ? todayData.total : '—' }}
          <span class="text-sm font-normal text-dimmed">份</span>
        </div>
      </div>
      <div
        class="rounded-xl border border-default bg-elevated/40 px-3.5 py-3"
        title="今日未投递占处理数的比例（含跳过、重复、失败），仅按今日实时计数；历史记录不含完整处理数，显示未记录"
        data-help="今日未投递占处理数的比例（含跳过、重复、失败）；历史记录不含完整处理数时显示未记录"
      >
        <div class="text-xs text-muted">未投递比例</div>
        <div class="mt-1 text-2xl font-semibold tracking-tight">
          <template v-if="filterRatio !== null"
            >{{ filterRatio }} <span class="text-sm font-normal text-dimmed">%</span></template
          >
          <template v-else>— <span class="text-sm font-normal text-dimmed">未记录</span></template>
        </div>
      </div>
      <div
        class="rounded-xl border border-default bg-elevated/40 px-3.5 py-3"
        data-help="今日已记录的重复岗位次数，不混作筛选失败"
      >
        <div class="text-xs text-muted">重复记录</div>
        <div class="mt-1 text-2xl font-semibold tracking-tight">
          {{ readableToday ? todayData.repeat : '—' }}
          <span class="text-sm font-normal text-dimmed">份</span>
        </div>
      </div>
      <div
        class="rounded-xl border border-default bg-elevated/40 px-3.5 py-3"
        data-help="今日因 HR 不活跃而跳过的已记录次数，不代表活跃比例"
      >
        <div class="text-xs text-muted">不活跃跳过</div>
        <div class="mt-1 text-2xl font-semibold tracking-tight">
          {{ readableToday ? todayData.activityFilter : '—' }}
          <span class="text-sm font-normal text-dimmed">份</span>
        </div>
      </div>
      <div
        class="rounded-xl border border-default bg-elevated/40 px-3.5 py-3"
        data-help="按实际日期统计，包含今天；没有记录的日期不补造数据"
      >
        <UDropdownMenu
          :items="
            statisticCycleData.map((item, index) => ({
              label: item.label,
              onSelect: () => (statisticCycle = index),
            }))
          "
        >
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1 text-xs text-muted"
            aria-label="选择统计周期"
          >
            {{ statisticCycleData[statisticCycle]?.label }}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 1024 1024">
              <path
                fill="currentColor"
                d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
              />
            </svg>
          </button>
        </UDropdownMenu>
        <div class="mt-1 text-2xl font-semibold tracking-tight text-help-brand">
          {{ loading || loadError || !rows.length ? '—' : sent }}
          <span class="text-sm font-normal text-dimmed">份</span>
        </div>
      </div>
    </div>
    <RunControls />
  </div>
</template>
