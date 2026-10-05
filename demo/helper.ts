import { computed, reactive, ref } from 'vue'

import { useConf } from '../src/composables/conf'
import { useDeliveryWorkflow } from '../src/composables/useApplying'
import { TaskRegistry } from '../src/composables/useApplying/handles'
import { defineTaskHandler } from '../src/composables/useApplying/type'
import { useStatistics } from '../src/composables/useStatistics'
import { logger } from '../src/utils/logger'

export const scenario = ref('normal')
const logo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="#e2e8f0"/><text x="20" y="26" text-anchor="middle" font-size="18" fill="#334155">测</text></svg>',
  )
const titles = [
  '机械结构研发工程师',
  '演示待筛选 · 销售助理',
  '工业数据分析工程师',
  '制造工艺工程师（长标题溢出与换行测试）',
  '演示待筛选 · 行政专员',
  '质量改进工程师',
]
export function sampleJobs() {
  return titles.map((jobName, i) => ({
    key: `demo-${i}`,
    jobName,
    link: '#offline-job',
    salary: `${8 + i}–${12 + i}K`,
    city: '青岛',
    address: '青岛市 · 离线演示园区',
    degreeName: '本科',
    experienceName: '经验不限',
    brand: {
      name: ['海川装备', '星河贸易', '致远智造'][i % 3],
      industry: '机械制造',
      scale: '100–499人',
      logo,
    },
    boss: { name: '招聘负责人', title: '研发部' },
    skills: ['机械设计', '团队协作', '数据分析'],
    jobLabels: ['双休', '五险一金'],
    welfareList: ['培训机会', '带薪年假'],
  }))
}
export async function createDemoHelper() {
  const conf = useConf(true)
  await conf.confInit()
  const raw = new Map<string, unknown>()
  const helper: any = {
    conf,
    jobList: ref(sampleJobs()),
    jobResultMaps: reactive(new Map()),
    jobJudgments: reactive(new Map()),
    jobMaps: new Map(),
    currentJob: ref(null),
    statistics: useStatistics(),
    netConf: ref({}),
    chatModel: { jobs: ref([]), states: new Map(), messages: new Map() },
    pendingMessages: ref(),
    getConfigItems: () =>
      computed(() => [
        [],
        [
          {
            label: '岗位筛选条件',
            value: 'filter',
            items: [
              { type: 'select', key: 'jobTitle' },
              { type: 'select', key: 'company' },
              { type: 'checkbox', key: 'activityFilter' },
            ],
          },
        ],
      ]),
    loadMoreJob: async (delay: Promise<void>) => {
      await delay
      return false
    },
    notification: async (message: string) => {
      logger.withContext({ event: 'run' }).info(`离线演示：${message}`)
    },
    onJobCardClick: async (key: string) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const job = helper.jobList.value.find((item: any) => item.key === key)
      if (job)
        job.jobDescription =
          '这是本地样例详情，不读取真实岗位。\n岗位职责：参与设计评审、数据分析与方案验证。\n任职要求：清晰沟通，独立跟进问题。\n'.repeat(
            6,
          )
    },
  }
  function loadJobs(empty = false) {
    helper.jobList.value = empty ? [] : sampleJobs()
    raw.clear()
    for (const job of helper.jobList.value) {
      raw.set(job.key, { key: job.key })
      helper.jobMaps.set(job.key, { jobData: job, rawData: { key: job.key }, state: {} })
    }
  }
  loadJobs()
  const send = defineTaskHandler(
    '模拟默认招呼',
    () => async (_, data) => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      if (scenario.value === 'send-error' && data.jobData.key === 'demo-0')
        throw new Error('离线模拟：默认招呼被拒绝')
      return { status: 'success' as const }
    },
    { confirmsDelivery: true, stateMsg: '模拟发送（不联网）' },
  )()
  const extra = defineTaskHandler('模拟追加步骤', () => async () => {
    if (scenario.value === 'extra-error')
      throw new Error('离线模拟：追加消息失败，默认招呼仍保留成功')
  })()
  const details = defineTaskHandler('岗位详情获取', () => async (_, data) => {
    await helper.onJobCardClick(data.jobData.key)
  })()
  const tasks = new TaskRegistry<any, any>()
  helper.workflow = await useDeliveryWorkflow(
    [details, tasks.aiFiltering({ deps: ['岗位详情获取'] }), send, extra],
    helper,
  )
  helper.workflowRunning = computed(() => helper.workflow.busy.value)
  helper.start = () => helper.workflow.executeAll(raw)
  helper.stop = () => helper.workflow.stop()
  helper.reset = () => helper.workflow.reset()
  helper.loadDemo = (empty = false) => {
    if (helper.workflow.busy.value) return
    helper.jobResultMaps.clear()
    helper.workflow.stateMaps.value.clear()
    helper.statistics.todayData.value.success = 0
    helper.statistics.todayData.value.total = 0
    loadJobs(empty)
    helper.reset()
  }
  return helper
}
