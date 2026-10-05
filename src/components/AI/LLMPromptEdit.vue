<script lang="ts" setup>
import type { SelectMenuItem, TableColumn } from '@nuxt/ui'
import UBadge from '@nuxt/ui/components/Badge.vue'
import UButton from '@nuxt/ui/components/Button.vue'
import UPopover from '@nuxt/ui/components/Popover.vue'
import { h, onUnmounted, reactive, ref, watch } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { formInfoData, defaultFormData, useConf } from '@/composables/conf'
import { parseFiltering } from '@/composables/useApplying/utils'
import { useHelper } from '@/composables/useHelper'
import type { JobData } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import { ChatModel } from '@/composables/useModel/chatModel'
import {
  buildFilteringPrompt,
  buildGreetingPrompt,
  defaultSimpleFiltering,
  defaultSimpleGreeting,
  scoreToStrictness,
  strictnessOptions,
  strictnessToScore,
} from '@/composables/useModel/simplePrompt'
import type { Strictness } from '@/composables/useModel/simplePrompt'
import type { Prompt } from '@/types/formData'
import { logger } from '@/utils/logger'

const props = defineProps<{
  data: 'aiGreeting' | 'aiFiltering' | 'aiReply'
}>()
const toast = useToast()
const helper = useHelper()
const conf = useConf()
const model = useModel()
const testModel = new ChatModel(helper)
let testController: AbortController | undefined
onUnmounted(() => { testController?.abort(); testJobStop.value = true })
const show = defineModel<boolean>({ required: true })
const currentModel = ref(conf.formData[props.data].model)
const currentModelData = computed(() =>
  model.modelData.value.find((v) => v.key === currentModel.value),
)
const modelItems = computed(
  () =>
    model.modelData.value.map((v) => ({
      value: v.key,
      label: v.name,
      avatar: { src: v.data?.avatar ?? '', loading: 'lazy' },
    })) as SelectMenuItem[],
)

const score = ref(props.data === 'aiFiltering' ? (conf.formData[props.data].score ?? 10) : 10)

const role = ['system', 'user', 'assistant']

const message = ref<Prompt>(jsonClone(conf.formData[props.data].prompt))

// 简单模式 / 高级模式。普通用户用简单模式填大白话，保存时生成 prompt。
// aiReply 暂未实现，只走高级；有存过的简单配置、或还是默认 prompt 的新用户 → 简单；
// 已经手改过 prompt 的老用户 → 高级，不覆盖他们的成果。
const savedSimple = conf.formData[props.data].simple
const mode = ref<'simple' | 'advanced'>(
  props.data === 'aiReply'
    ? 'advanced'
    : savedSimple
      ? 'simple'
      : JSON.stringify(message.value) === JSON.stringify(defaultFormData[props.data].prompt)
        ? 'simple'
        : 'advanced',
)

const want = ref(savedSimple?.want ?? defaultSimpleFiltering.want)
const avoid = ref(savedSimple?.avoid ?? defaultSimpleFiltering.avoid)
const strictness = ref<Strictness>(
  savedSimple?.strictness ??
    (props.data === 'aiFiltering' ? scoreToStrictness(conf.formData.aiFiltering.score) : 'normal'),
)
// 招呼语的"自我介绍"优先用统一的求职意向（简历），避免让用户填两遍
const profile = ref(
  savedSimple?.profile ?? conf.formData.profile?.resume ?? defaultSimpleGreeting.profile,
)

// 无论哪种模式，都产出引擎要的 prompt
function buildCurrentPrompt(): Prompt {
  if (mode.value === 'simple') {
    if (props.data === 'aiFiltering') return buildFilteringPrompt(want.value, avoid.value)
    if (props.data === 'aiGreeting') return buildGreetingPrompt(profile.value)
  }
  return message.value
}

function inputExample() {
  message.value = jsonClone(defaultFormData[props.data].prompt)
}

function removeMessage(item: Prompt[number]) {
  message.value = message.value.filter((v) => v !== item)
}

function addMessage() {
  message.value.push({ role: 'user', content: '' })
}

const testDialog = ref(false)
watch(testDialog, value => { if (!value) { testController?.abort(); testJobStop.value = true } })

interface TestData {
  key: string
  job: JobData
  checked: boolean | string | number
  loading: boolean
}
interface TestContent {
  time: string
  reasoning_content?: string | null
  content?: string
}

const testData = reactive<Array<TestData>>([])
const testExpanded = ref<Record<string, boolean>>({})
const testDataContent = reactive<Record<string, TestContent[]>>({})

const testTableColumns: TableColumn<TestData>[] = [
  {
    id: 'expand',
    header: '',
    cell: ({ row }) =>
      h(UButton, {
        color: 'neutral',
        variant: 'ghost',
        icon: 'i-lucide-chevron-down',
        square: true,
        size: 'xs',
        'aria-label': 'Expand',
        ui: {
          leadingIcon: [
            'transition-transform',
            row.getIsExpanded() ? 'duration-200 rotate-180' : '',
          ],
        },
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          row.toggleExpanded()
        },
      }),
  },
  {
    id: 'jobName',
    header: '岗位名',
    accessorFn: (row) => row.job.jobName,
    cell: ({ row }) =>
      h(
        UPopover,
        {
          mode: 'hover',
          portal: testModelRef.value?.parentElement ?? false,
        },
        {
          default: () =>
            h('div', { class: 'flex items-center gap-1' }, [
              row.original.loading
                ? h(UBadge, {
                    trailingIcon: 'i-line-md-loading-twotone-loop',
                    variant: 'soft',
                    color: 'neutral',
                  })
                : null,
              h('span', row.original.job.jobName),
            ]),
          content: () => h(JobCard, { job: row.original.job, hover: false, style: 'width: 300px' }),
        },
      ),
  },
  {
    id: 'jobDescription',
    header: '内容',
    accessorFn: (row) => row.job.jobDescription,
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'truncate',
          title: row.original.job.jobDescription,
        },
        row.original.job.jobDescription,
      ),
  },
]

const testJobLoading = ref(false)
const testJobStop = ref(true)

async function addTestJob(n: number) {
  if (conf.runLocked.value || testJobLoading.value) return
  testJobLoading.value = true
  try {
    let count = 0
    for (let item of helper.jobList.value) {
      if (testData.some((v) => v.job.key === item.key)) {
        continue
      }
      await helper.onJobCardClick(item.key) // 触发加载更多数据
      const data = helper.jobMaps.get(item.key)
      if (data) {
        item = data.jobData
      }
      testData.push({ key: item.key, job: item, checked: false, loading: false })
      testDataContent[item.key] = []
      count++
      if (count >= n) {
        break
      }
    }
  } finally {
    testJobLoading.value = false
  }
}

async function testJob() {
  if (conf.runLocked.value) return
  if (!testJobStop.value) {
    testJobStop.value = true
    testController?.abort()
    return
  }
  if (testJobLoading.value) return
  const md = model.modelData.value.find((v) => currentModel.value === v.key)
  if (!currentModel.value || !md) {
    toast.add({
      title: '请在上级弹窗右上角选择模型',
      color: 'warning',
    })
    return
  }
  testJobLoading.value = true
  testJobStop.value = false
  model.testing.value++
  testController = new AbortController()
  try {
    if (
      !testModel.createAgent(
        {
          prompt: buildCurrentPrompt(),
          model: currentModel.value,
          enable: true,
        },
        props.data === 'aiFiltering' ? 'filtering' : 'greetings',
        {
          json: props.data === 'aiFiltering',
        },
      )
    ) {
      throw new Error('AI模型未配置, 初始化失败')
    }
    const handle = async (item: TestData) => {
      if (testJobStop.value) {
        return
      }

      try {
        const content = await testModel
          .chat(
            props.data === 'aiFiltering' ? 'filtering' : 'greetings',
            {
              jobData: item.job,
              rawData: null,
              state: {},
            },
            {
              disableMessages: true,
              signal: testController?.signal,
            },
          )
          .then((r) => [r.text, r.reasoningText])
        if (props.data === 'aiFiltering' && content[0]) {
          const { message } = parseFiltering(content[0])
          content[0] = message ?? content[0]
        }
        testDataContent[item.key]?.push({
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          reasoning_content: content[1],
          content: content[0],
        })
      } catch (err) {
        const errMsg = errorHandle(err)
        logger.error('TestJobError', err)
        toast.add({
          title: errMsg,
          color: 'error',
        })
      } finally {
        item.loading = false
      }
    }

    for (let i = 0; i < testData.length; i += 4) {
      const batch = testData.slice(i, i + 4)
      await Promise.all(batch.map(handle))
    }
  } catch (err: any) {
    logger.error('TestJobError', err)
    toast.add({
      title: err.message,
      color: 'error',
    })
  } finally {
    testJobLoading.value = false
    testJobStop.value = true
    model.testing.value--
    testController = undefined
  }
}

async function savePrompt() {
  if (!currentModel.value || !currentModelData.value) {
    toast.add({
      title: '请在右上角选择模型',
      color: 'warning',
    })
    return
  }
  conf.formData[props.data].model = currentModel.value
  conf.formData[props.data].prompt = buildCurrentPrompt()

  if (mode.value === 'simple') {
    if (props.data === 'aiFiltering') {
      conf.formData[props.data].simple = {
        want: want.value,
        avoid: avoid.value,
        strictness: strictness.value,
      }
      conf.formData[props.data].score = strictnessToScore(strictness.value)
    } else if (props.data === 'aiGreeting') {
      conf.formData[props.data].simple = { profile: profile.value }
    }
  } else {
    // 高级模式：清掉简单标记，下次直接进高级，不覆盖用户手写的 prompt
    conf.formData[props.data].simple = undefined
    if (props.data === 'aiFiltering') {
      conf.formData[props.data].score = score.value
    }
  }
  try {
    await conf.confSaving()
    show.value = false
  } catch {
    /* 保存失败保留草稿和弹窗 */
  }
}

const promptModelRef = useTemplateRef('promptModel')
const testModelRef = useTemplateRef('testModel')
</script>

<template>
  <UModal
    v-model:open="show"
    :title="formInfoData[data].label"
    :ui="{ content: 'sm:max-w-[70%]', body: 'flex flex-col gap-4' }"
    :dismissible="false"
  >
    <template #body>
      <!-- 简单 / 高级 切换 + 模型选择（两种模式共用） -->
      <div class="flex w-full items-center justify-between gap-2" ref="promptModel">
        <UFieldGroup v-if="data !== 'aiReply'">
          <UButton
            :color="mode === 'simple' ? 'primary' : 'neutral'"
            :variant="mode === 'simple' ? 'solid' : 'soft'"
            @click="mode = 'simple'"
          >
            简单
          </UButton>
          <UButton
            :color="mode === 'advanced' ? 'primary' : 'neutral'"
            :variant="mode === 'advanced' ? 'solid' : 'soft'"
            @click="mode = 'advanced'"
          >
            高级
          </UButton>
        </UFieldGroup>
        <div v-else></div>
        <USelectMenu
          v-model="currentModel"
          :items="modelItems"
          value-key="value"
          label-key="label"
          placeholder="选择模型"
          :portal="promptModelRef?.parentElement ?? false"
          :avatar="{
            src: currentModelData?.data?.avatar,
            loading: 'lazy',
          }"
        >
        </USelectMenu>
      </div>

      <!-- 简单模式 · 过滤：只填想要 / 不想要 + 严格程度 -->
      <template v-if="mode === 'simple' && data === 'aiFiltering'">
        <UFormField label="筛选严格程度" help="投得多还是投得准">
          <USelect
            v-model="strictness"
            :items="strictnessOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            :portal="promptModelRef?.parentElement ?? false"
          />
        </UFormField>
        <UFormField label="我想要什么样的工作">
          <UTextarea
            v-model="want"
            autoresize
            :rows="3"
            class="w-full"
            placeholder="例如：双休、五险一金、早九晚六、离家近、技术氛围好"
          />
        </UFormField>
        <UFormField label="我不想要什么样的工作">
          <UTextarea
            v-model="avoid"
            autoresize
            :rows="3"
            class="w-full"
            placeholder="例如：需要上门、纯销售、需要拉客户、加班严重"
          />
        </UFormField>
        <p class="text-xs leading-relaxed text-muted">
          用顿号或换行分隔多个。AI
          会读岗位描述逐条判断：命中「想要」越多、命中「不想要」越少，就越会帮你投。
        </p>
      </template>

      <!-- 简单模式 · 招呼语：只填自我介绍 -->
      <template v-else-if="mode === 'simple' && data === 'aiGreeting'">
        <UFormField label="你的情况和求职诉求">
          <UTextarea
            v-model="profile"
            autoresize
            :rows="5"
            class="w-full"
            placeholder="用大白话写清你是谁、几年经验、会什么、想找什么样的工作。例如：我叫小王，3 年前端，会 Vue / React，想找双休、技术氛围好的团队。"
          />
        </UFormField>
        <p class="text-xs leading-relaxed text-muted">
          AI 会结合每个岗位，用你这段介绍自动生成发给 HR 的第一句招呼语。
        </p>
      </template>

      <!-- 高级模式 · 直接编辑 prompt（面向懂提示词的人） -->
      <template v-else>
        <div v-if="data === 'aiFiltering'">
          <UFormField label="过滤分数">
            <UInputNumber
              v-model="score"
              :min="-100"
              :max="100"
              size="sm"
              placeholder="请输入分数"
            />
          </UFormField>
        </div>
        <div class="flex gap-2">
          <UButton color="primary" @click="addMessage"> 添加消息 </UButton>
          <UButton color="info" @click="inputExample"> 填入示例值 </UButton>
        </div>
        <div v-pre class="text-sm text-muted">
          使用 {{}} 来渲染变量。
          <ULink
            to="https://github.com/Ocyss/boss-helper/blob/master/src/types/bossData.d.ts"
            target="_blank"
          >
            变量表
          </ULink>
          <br />
          推荐阅读
          <ULink to="https://langgptai.feishu.cn/wiki/RXdbwRyASiShtDky381ciwFEnpe" target="_blank">
            《LangGPT》
          </ULink>
          的提示词文档学习 ( 示例提示词写的并不好,欢迎AI大佬来提pr )
        </div>
        <div class="demo-dynamic space-y-3">
          <div v-for="(item, index) in message" :key="index" class="flex items-start gap-2">
            <div class="flex flex-col gap-3 w-27.5">
              <USelectMenu
                v-model="item.role"
                :items="role"
                :portal="promptModelRef?.parentElement ?? false"
                :content="{ side: 'right' }"
              />
              <UButton
                color="error"
                variant="outline"
                @click.prevent="removeMessage(item)"
                class="w-full"
              >
                删除
              </UButton>
            </div>
            <UTextarea v-model="item.content" autoresize :rows="2" :maxrows="6" class="flex-1" />
          </div>
        </div>
      </template>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        @click="
          () => {
            show = false
          }
        "
      >
        关闭
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        @click="
          () => {
            testDialog = true
          }
        "
      >
        测试
      </UButton>
      <UButton color="primary" @click="savePrompt"> 保存 </UButton>
    </template>
  </UModal>
  <USlideover v-model:open="testDialog" title="Prompt 测试" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <p class="mb-3 text-xs text-muted">
        手动测试会将所选岗位和提示词发送给模型供应商并消耗额度，不向 HR 发送消息。
      </p>
      <div class="flex gap-2 mb-4" ref="testModel">
        <UButton :loading="testJobLoading" @click="addTestJob(1)" color="neutral">
          从页面添加1个岗位
        </UButton>
        <UButton :loading="testJobLoading" @click="addTestJob(4)" color="neutral">
          从页面添加4个岗位
        </UButton>
        <UButton :loading="testJobLoading" @click="addTestJob(10)" color="neutral">
          从页面添加10个岗位
        </UButton>
      </div>
      <div class="overflow-auto">
        <UTable
          v-model:expanded="testExpanded"
          :data="testData"
          :get-row-id="(row: TestData) => row.key"
          :columns="testTableColumns"
          :ui="{ tr: 'data-[expanded=true]:bg-elevated/40' }"
        >
          <template #expanded="{ row }">
            <div class="test-content-wrapper">
              <div class="test-content-list">
                <div
                  v-for="(item, index) in (testDataContent[row.original.key] ?? []).slice(-3)"
                  :key="`${row.original.key}-${item.time}-${index}`"
                  class="test-content-item"
                >
                  <div class="test-content-time">
                    {{ item.time }}
                  </div>

                  <div
                    v-if="item.reasoning_content"
                    class="test-content-reasoning-content"
                    :title="item.reasoning_content"
                  >
                    {{ item.reasoning_content }}
                  </div>
                  <div class="test-content-content" :title="item.content">
                    {{ item.content }}
                  </div>
                </div>
              </div>
            </div>
          </template>
        </UTable>
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" @click="close"> 取消 </UButton>
      <UButton color="primary" @click="testJob">
        {{ testJobStop ? '开始测试' : '停止测试' }}
      </UButton>
    </template>
  </USlideover>
</template>
