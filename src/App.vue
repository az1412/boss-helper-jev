<script lang="ts" setup>
import type { TabsItem } from '@nuxt/ui'
import { useNow, useRafFn } from '@vueuse/core'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'

import JobCards from '@/components/JobCards.vue'
import Version from '@/components/Menu/Version.vue'
import About from '@/components/Tabs/About.vue'
import Ai from '@/components/Tabs/AI.vue'
import Config from '@/components/Tabs/Config.vue'
import Filter from '@/components/Tabs/Filter.vue'
import Logs from '@/components/Tabs/Logs.vue'
import Statistics from '@/components/Tabs/Statistics.vue'
import { useConf, appearanceConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'
import { localDateKey } from '@/utils/jobView'
import { getProjectLinks, projectInfo } from '@/utils/projectInfo'

import { useHelper, VITE_VERSION } from './composables/useHelper'

const model = useModel()
const projectLinks = getProjectLinks()

const helper = useHelper()
const conf = useConf()
const { todayData } = helper.statistics
const clock = useNow({ interval: 60000 })
const todayIsCurrent = computed(() => todayData.value.date === localDateKey(clock.value))
const savedLimit = computed(() => {
  if (conf.isLoading.value) return '—'
  void conf.isSaving.value
  void conf.isDirty.value
  return conf.getSavedSnapshot().deliveryLimit.value
})

const items = computed<TabsItem[]>(() => {
  const configs = [
    { slot: 'statistics', label: '统计' },
    { slot: 'filter', label: '筛选' },
    { slot: 'config', label: '配置' },
    { slot: 'ai', label: 'AI' },
    { slot: 'logs', label: '日志' },
    { slot: 'about', label: '关于' },
  ] satisfies (TabsItem | boolean | null | undefined | '')[]

  return configs.filter((item) => !!item) as TabsItem[]
})

// const externalFilter = ref<HTMLElement>()
const container = ref<HTMLElement>()
const isFeatureEnabled = ref(false)
const helpContent = ref('鼠标移到对应元素查看提示')
const anchor = ref({ x: 0, y: 0 })
const isHovering = ref(false)
const helpVisible = computed(() => isFeatureEnabled.value && isHovering.value)
let lastElement: HTMLElement | null = null
let lastRect = { left: 0, top: 0, width: 0, height: 0 }
let root: ShadowRoot | Document = document
const boxStyles = shallowRef({
  display: 'none',
  width: '0px',
  height: '0px',
  transform: 'translate(0, 0)',
})

watch(helpVisible, (visible) => {
  if (visible) {
    resume()
  } else {
    pause()
    lastElement = null
    boxStyles.value = { ...boxStyles.value, display: 'none' }
  }
})

const reference = computed(() => ({
  getBoundingClientRect: () =>
    ({
      width: 0,
      height: 0,
      left: anchor.value.x,
      right: anchor.value.x,
      top: anchor.value.y,
      bottom: anchor.value.y,
    }) as DOMRect,
}))

const updateOverlay = () => {
  const target = root.elementFromPoint(anchor.value.x, anchor.value.y) as HTMLElement | null
  const el = target?.closest('[data-help]') as HTMLElement | null
  const help = el?.dataset.help || ''
  if (!el || help === 'no-help') {
    if (boxStyles.value.display !== 'none') {
      boxStyles.value = { ...boxStyles.value, display: 'none' }
      lastElement = null
    }
    return
  }

  const rect = el.getBoundingClientRect()
  const hasMoved =
    Math.abs(rect.left - lastRect.left) > 0.5 ||
    Math.abs(rect.top - lastRect.top) > 0.5 ||
    rect.width !== lastRect.width

  if (el === lastElement && !hasMoved) return

  lastElement = el
  lastRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  helpContent.value = help

  boxStyles.value = {
    display: 'block',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate(${rect.left}px, ${rect.top}px)`,
  }
}

const { pause, resume } = useRafFn(updateOverlay, { immediate: false })

onMounted(() => {
  root = (container.value?.getRootNode() as ShadowRoot) ?? document
  void conf.confInit()
  void model.initModel().catch(() => {})
})

function tagOpen(url: string) {
  window.open(url)
}

const overlay = useOverlay()

function openStore() {
  overlay
    .create(Version, {
      destroyOnClose: true,
    })
    .open()
}

function onPointerMove(ev: PointerEvent) {
  if (!helpVisible.value) {
    return
  }
  anchor.value.x = ev.clientX
  anchor.value.y = ev.clientY
}
</script>

<template>
  <div
    class="shadow-wrapper helper-app w-284 max-w-284 min-w-284 m-10 mx-auto mb-24"
    :style="{
      marginRight:
        appearanceConf.leftChat && appearanceConf.contentOffset != 25
          ? `${appearanceConf.contentOffset}%`
          : undefined,
      marginLeft:
        !appearanceConf.leftChat && appearanceConf.contentOffset != 25
          ? `${appearanceConf.contentOffset}%`
          : undefined,
    }"
    ref="container"
  >
    <UApp :portal="container" :toaster="{ position: 'top-right', ui: { viewport: 'z-100000' } }">
      <div class="overlay-box" :style="boxStyles" />
      <UTooltip
        :open="helpVisible"
        :reference="reference"
        :content="{
          side: 'top',
          sideOffset: 20,
          updatePositionStrategy: 'always',
        }"
        :text="helpContent"
        :ui="{
          content:
            'z-1000 flex items-center gap-1 bg-default text-highlighte shadow-xl rounded-md ring-1 ring-default h-auto px-3 py-2 text-[17px] leading-snug select-none pointer-events-auto backdrop-blur-none opacity-100 wrap-break-word',
          text: 'whitespace-normal',
        }"
      />
      <div
        @pointermove.passive="onPointerMove"
        @mouseenter="isHovering = true"
        @mouseleave="isHovering = false"
      >
        <div class="premium-panel flex flex-col px-5 pt-4 pb-6">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <span class="text-xl font-semibold tracking-tight">
                {{ !appearanceConf.hideHeader ? projectInfo.name : projectInfo.shortName }}
              </span>
              <UChip :show="false">
                <UButton
                  color="primary"
                  variant="subtle"
                  class="rounded-full"
                  @click="openStore"
                  size="xs"
                >
                  v{{ VITE_VERSION }}
                </UButton>
              </UChip>
            </div>
            <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span
                v-if="todayIsCurrent && (todayData.total > 0 || todayData.success > 0)"
                class="inline-flex items-center gap-1 rounded-full bg-elevated px-3 py-1 text-xs"
              >
                今日投递 <b class="text-help-brand">{{ todayData.success }}</b
                >/{{ savedLimit }}
              </span>
              <span
                v-if="helper.workflow && helper.workflow.total.value > 0"
                class="inline-flex items-center gap-1 text-xs rounded-full bg-elevated px-3 py-1"
              >
                本页处理 <b>{{ helper.workflow.current.value }}</b
                >/{{ helper.workflow.total.value }}
              </span>
            </div>
          </div>

          <UTabs
            data-help="no-help"
            :items="items"
            variant="link"
            :ui="{
              root: 'min-w-0',
              list: 'items-center max-sm:flex-wrap',
              trigger: 'shrink-0',
              content: 'min-w-0',
            }"
            :unmount-on-hide="false"
          >
            <template #statistics>
              <Statistics />
            </template>
            <template #filter>
              <Filter />
            </template>
            <template #config><Config /></template>
            <template #ai><Ai /></template>
            <template #logs><Logs :run-id="helper.workflow?.runId.value" /></template>
            <template #about><About /></template>
            <template #list-trailing>
              <UButton
                v-if="projectLinks.issues"
                class="ml-2"
                size="xs"
                color="info"
                @click.stop="tagOpen(projectLinks.issues)"
                >反馈</UButton
              >
              <UCheckbox
                class="ml-2"
                size="md"
                color="neutral"
                v-model="isFeatureEnabled"
                label="帮助"
              />
            </template>
          </UTabs>
        </div>
      </div>
      <JobCards />
    </UApp>
  </div>
</template>
