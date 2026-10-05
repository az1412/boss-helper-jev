import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf, useConf } from '@/composables/conf'
import { WorkflowPausedError } from '@/composables/useApplying/deliverError'
import type { WorkflowData } from '@/composables/useApplying/type'
import { createLazyObject, isInitialized } from '@/composables/useApplying/type'
import type { JobData } from '@/composables/useHelper'
import { HelperContext } from '@/composables/useHelper'
import type { AlertItem, ConfigAccordionItem } from '@/composables/useHelper/type'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { run } from '@/index'
import { counter, initCounter } from '@/message'
import type { FormDataInput } from '@/types/formData'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

import { GeekChatClientManager } from './chat'
import type { BoosJobData } from './delivery'
import { bossWorkflow } from './delivery'
import { loadNextPage } from './pagination'
import { uploadImage } from './requests'
import type { BossZpDetailData, BossZpJobItemData } from './types'

function removeAd() {
  // 新职位发布时通知我
  void elmGetter.rm('.job-list-wrapper .subscribe-weixin-wrapper')
  // 侧栏
  void elmGetter.rm('.job-side-wrapper')
  // 侧边悬浮框
  void elmGetter.rm('.side-bar-box')
  // 搜索栏登录框
  void elmGetter.rm('.go-login-btn')
  // 底部页脚
  // elmGetter.rm("#footer-wrapper");

  // 新版: 微信扫码
  void elmGetter.rm('.c-subscribe-weixin')
  // 新版: 求职工具
  void elmGetter.rm('.c-job-tools.job-tools')
  // 新版: 热门职位
  void elmGetter.rm('.c-hot-link.hot-link')
  // 新版: 面包屑
  void elmGetter.rm('.c-breadcrumb')
  // 新版: 职位详情页的引导(想要什么工作)
  void elmGetter.rm('.job-detail-container .job-detail-guide-cont')
}

const initChange = useHookVueFn('#wrap .page-job-wrapper', 'pageChangeAction')
const initSearch = useHookVueFn('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', [
  'searchJobAction',
  'onSearch',
])

function formatActiveTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const day = 24 * 60 * 60 * 1000

  if (diff < day) return '今日活跃'
  if (diff < 2 * day) return '昨日活跃'
  if (diff < 7 * day) return '本周活跃'
  if (diff < 30 * day) return '本月活跃'
  return '较久未活跃'
}

function convertBossZpJobItemToJobData(item: BossZpJobItemData): JobData {
  const key = `boss::${item.encryptJobId}`

  return {
    key,
    link: `https://www.zhipin.com/job_detail/${item.encryptJobId}.html`,
    jobName: item.jobName,
    positionName: item.jobName,
    jobDescription: '',

    // 经验和学历要求 - 从 jobLabels 中解析或直接使用
    experienceName: item.jobExperience || item.jobLabels?.[0] || '经验不限',
    degreeName: item.jobDegree || '学历不限',
    salary: item.salaryDesc,

    // 地址相关
    address: [item.cityName, item.areaDistrict, item.businessDistrict].filter(Boolean).join('-'),
    addressCoords: item.gps ? [item.gps.longitude, item.gps.latitude] : undefined,

    // 技能标签
    showSkills: item.skills || [],
    jobLabels: item.jobLabels || [],
    skills: item.skills || [],

    // 活跃时间 - 从 lastModifyTime 获取
    activeTime: item.lastModifyTime,
    activeTimeStr: item.lastModifyTime ? formatActiveTime(item.lastModifyTime) : undefined,

    // 福利
    welfareList: item.welfareList,

    // 招聘者信息
    boss: {
      id: item.encryptBossId,
      link: `https://www.zhipin.com/boss_detail/${item.encryptBossId}.html`,
      name: item.bossName,
      title: item.bossTitle,
      avatar: item.bossAvatar,
      certificated: item.bossCert > 0,
      isHeadhunter: item.goldHunter === 1,
      isFriend: false,
      isOnline: item.bossOnline ?? false,
    },

    // 公司品牌信息
    brand: {
      id: item.encryptBrandId,
      link: `https://www.zhipin.com/gongsi/${item.encryptBrandId}.html`,
      name: item.brandName,
      logo: item.brandLogo,
      scale: item.brandScaleName,
      industry: item.brandIndustry,
      stageName: item.brandStageName,
      introduce: '',
      labels: [],
    },

    // 状态信息
    // status: {
    //   status: item.contact ? 'warn' : 'pending',
    //   msg: item.contact ? '已沟通' : '未开始',
    // },
  }
}

export class BossHelperCtx extends HelperContext<BossHelperCtx, BoosJobData, {}> {
  private static instance: HTMLElement | null = null
  label = 'Boss直聘'
  key = 'boss'

  geek!: GeekChatClientManager

  _page = ref({ page: 1, pageSize: 15 })
  _pageHasMore = ref(true)
  _listRevision = 0
  _pagePending: Promise<unknown> | null = null
  _jobDetail = ref<BossZpDetailData>()
  _pageChange = (_v: number) => {
    throw new Error('pageChange is undefined')
  }
  _clickJobCardAction = (_: BossZpJobItemData) => {}
  _jobList: Ref<BossZpJobItemData[]>
  _jobDataMap: Map<string, BoosJobData>

  rootVue: any = null
  jobMaps: Map<string, WorkflowData<BoosJobData, {}>>
  jobList: Ref<JobData[]>

  constructor() {
    const jobList = ref<JobData[]>([])
    const _jobList = ref<BossZpJobItemData[]>([])
    const _jobListMap = new Map<string, BoosJobData>()

    super()

    this.jobList = jobList
    this._jobList = _jobList
    this._jobDataMap = _jobListMap

    this.jobMaps = reactive(new Map())
  }

  get uid() {
    // return window?.Cookie.get('bst') // token ?
    if (!window._PAGE.encryptUserId) {
      useToast().add({
        color: 'error',
        title: '未获取到用户ID，可能会出现奇怪bug, 请尝试刷新页面或反馈',
      })
    }
    return window._PAGE.encryptUserId
  }

  get userInfo() {
    return {
      id: window._PAGE.encryptUserId,
      name: window._PAGE.showName ?? window._PAGE.name,
      avatar: window._PAGE.largeAvatar ?? window._PAGE.tinyAvatar ?? '',
    }
  }

  static async new() {
    const ctx = new BossHelperCtx()
    ctx.rootVue = await getRootVue()
    ctx.workflow = await bossWorkflow(ctx)
    return ctx
  }

  async loadMoreJob(delay: Promise<any>, signal?: AbortSignal): Promise<boolean> {
    if (this._pagePending) throw new Error('上一次列表请求尚未结束，请稍后重试或刷新页面')
    const hasNew = await loadNextPage({
      read: () => ({
        ids: this._jobList.value.map((job) => job.encryptJobId),
        revision: this._listRevision,
        hasMore: this._pageHasMore.value,
      }),
      request: () => {
        const request = Promise.resolve(this._pageChange(this._page.value.page + 1))
        this._pagePending = request
        const finish = () => {
          if (this._pagePending === request) this._pagePending = null
        }
        void request.then(finish, finish)
        return request
      },
      delay,
      signal,
      timeoutMs: Math.max(15000, this.conf.formData.delayDeliveryPageNext * 1000 + 15000),
    })
    if (hasNew) this._syncJobList(this._jobList.value)
    return hasNew
  }

  async start() {
    if (this.models.editing.value || this.models.saving.value || this.models.testing.value)
      throw new Error('请先保存或关闭模型配置窗口')
    if (this._pagePending) throw new Error('上一次列表请求尚未结束，请稍后重试或刷新页面')
    if (!this.workflow) {
      this.workflow = await bossWorkflow(this)
    }
    if (!navigator.locks) throw new Error('当前浏览器不支持运行互斥，请使用新版 Chrome')
    await navigator.locks.request('boss-helper:delivery', { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('另一个 BOSS 标签页正在运行，请先在那里暂停并等待收尾')
      await this.statistics.updateStatistics()
      await this.models.initModel(true)
      if (this.models.editing.value || this.models.saving.value || this.models.testing.value) throw new Error('请先结束模型编辑与测试')
      this.statistics.beginRecording()
      try {
        await this.workflow!.executeAll(this._jobDataMap)
      } finally {
        await this.statistics.endRecording()
      }
    })
  }

  async sendMessage(data: WorkflowData<BoosJobData, {}>, msgs: FormDataInput['value']) {
    logger.debug('发送消息', { jobKey: data.jobData.key, msg: msgs })

    const stanza = {
      uid: Number(data.rawData.boss.data.bossId),
      friendSource: data.rawData.detail.bossInfo.bossSource ?? 0,
      encryptUid: data.rawData.jobitem.encryptBossId,
      encryptGid: '',
      clientMid: Date.now(),
    }
    if (typeof msgs === 'string') {
      msgs = [{ type: 'text', content: msgs }]
    }
    for (const msg of msgs) {
      var m
      // Each chat message needs its own client id; reusing one makes later messages look duplicated.
      stanza.clientMid = Date.now()
      if (msg.type === 'image') {
        const response = await counter.getImage(msg.image)
        if (!response.success) {
          throw new Error('图片未上传或已过期')
        }
        const u8Array = new Uint8Array(response.buffer)
        const file = new File([u8Array.buffer], response.name, { type: response.type })
        const img = await uploadImage(data.rawData.boss.data.securityId, file)

        m = this.geek.msgBuilder.createImageMessage(stanza, {
          content: {
            iid: 0,
            ...img,
          },
        })
      } else if (msg.type === 'text') {
        this.pendingMessages.value = msg.content
        await delay(this.conf.formData.delayMessageSending)
        m = this.geek.msgBuilder.createTextMessage(stanza, {
          text: this.pendingMessages.value,
        })
        this.pendingMessages.value = undefined
      } else {
        throw new Error('不支持的消息类型:' + msg['type'])
      }
      if (this.workflow?.status.value === 'stopping') {
        this.pendingMessages.value = undefined
        throw new WorkflowPausedError()
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('追加消息提交超时，结果待核实；不会自动重发')),
          30000,
        )
        try {
          this.geek.client.publish(
            'chat',
            this.geek.msgBuilder.encode(m),
            {
              qos: 1,
              retain: true,
            },
            (error) => {
              clearTimeout(timeout)
              if (error) reject(error)
              else resolve()
            },
          )
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
        }
      })
    }
  }

  async onMount(path?: string) {
    if (!path) {
      path = this.rootVue.$route.path
    }

    try {
      if (await elmGetter.get('boss-helper-job', 3000)) {
        return
      }
    } catch {}

    if (BossHelperCtx.instance) {
      BossHelperCtx.instance.remove()
      BossHelperCtx.instance = null
    }
    // TODO: 移除menu, 可能导致nuxtui实例冲突
    // if (!document.querySelector('boss-helper-menu')) {
    //   const menuElement = document.createElement('boss-helper-menu')
    //   document.body.appendChild(menuElement)
    // }
    const elm = await elmGetter.get(
      '.job-search-wrapper,.job-recommend-main,.page-jobs .page-jobs-main',
    )

    const appElement = document.createElement('boss-helper-job')
    BossHelperCtx.instance = appElement
    elm.insertBefore(appElement, elm.firstChild)
    removeAd()

    await this._initPage()
    await this._initPageChange()
    await this._initJobDetail()
    await this._initClickJobCardAction()
    await this._initJobList()

    await this.initNetConf()
    const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')
    this.geek = new GeekChatClientManager()

    watch(
      appearanceConf.value,
      (v) => {
        if (!contentElm) return
        contentElm.style.marginRight =
          v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'auto'
        contentElm.style.marginLeft =
          !v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'auto'
      },
      { immediate: true },
    )
    await this.geek.connect()
  }
  getConfigItems() {
    const conf = useConf()
    return computed<[AlertItem[], (ConfigAccordionItem | false)[]]>(() => {
      return [
        [
          {
            type: 'alert',
            id: 'config-alert-1',
            showIcon: true,
            title: '首次配置前请先进入帮助模式查看说明',
            color: 'success',
            description:
              '所有配置项均提供说明，获取岗位滚动至约 150 条会自动停止，刷新页面或修改求职期望后可重新获取；如遇 Bug 或帮助内容不清晰，欢迎反馈并提出改进建议。',
          },
        ],
        [
          {
            label: '筛选配置',
            value: 'filter',
            items: [
              {
                type: 'alert',
                id: 'filter-config-alert-enable',
                title: '复选框打钩才会启用，别忘记打钩启用哦。保存也别忘了',
                description: '排除和包含可点击切换，混合模式适用性过低难以配置不会考虑开发',
                color: 'success',
                showIcon: true,
              },
              {
                type: 'div',
                class: 'grid grid-cols-2 gap-2 mt-2 w-full',

                items: [
                  {
                    type: 'select',
                    key: 'company',
                  },
                  {
                    type: 'select',
                    key: 'jobTitle',
                  },
                  {
                    type: 'select',
                    key: 'jobContent',
                  },
                  {
                    type: 'select',
                    key: 'hrPosition',
                  },
                  conf.configLevel.intermediate && {
                    type: 'select',
                    key: 'jobAddress',
                  },
                  {
                    type: 'div',
                  },
                ],
              },
              {
                type: 'div',
                class: 'flex gap-2 mt-3',
                items: [
                  conf.configLevel.intermediate && {
                    type: 'salaryRange',
                    key: 'salaryRange',
                  },
                  conf.configLevel.intermediate && {
                    type: 'companySizeRange',
                    key: 'companySizeRange',
                  },
                ],
              },
              {
                type: 'div',
                class: 'col-span-full flex flex-wrap gap-2 mt-3',
                items: [
                  conf.configLevel.intermediate && {
                    type: 'checkbox',
                    key: 'activityFilter',
                  },
                  {
                    type: 'checkbox',
                    key: 'goldHunterFilter',
                  },
                  {
                    type: 'checkbox',
                    key: 'friendStatus',
                  },
                  {
                    type: 'checkbox',
                    key: 'bossGoldMedalHr',
                  },
                  conf.configLevel.intermediate && {
                    type: 'checkbox-expire',
                    key: 'sameCompanyFilter',
                  },
                  conf.configLevel.intermediate && {
                    type: 'checkbox-expire',
                    key: 'sameHrFilter',
                  },
                ],
              },
            ],
          },
          conf.configLevel.intermediate && {
            label: '招呼语配置',
            value: 'greetings',
            items: [
              {
                type: 'alert',
                id: 'config-alert-2',
                showIcon: true,
                color: 'success',
                description: '使用自定义招呼语前 推荐禁用boss直聘自带招呼语',
                actions: [
                  {
                    label: '前往',
                    color: 'neutral',
                    variant: 'subtle',
                    onClick: () => {
                      window.open(
                        'https://www.zhipin.com/web/geek/notify-set?type=greetSet',
                        '_blank',
                      )
                    },
                  },
                ],
              },
              { type: 'customGreeting', key: 'customGreeting' },
            ],
          },
          {
            label: '外观配置',
            value: 'appearance',
            items: [{ type: 'appearance', key: 'appearance' }],
          },
          conf.configLevel.advanced && {
            label: '地址配置',
            value: 'address',
            items: [{ type: 'address', key: 'address' }],
          },
          conf.configLevel.intermediate && {
            label: '延迟配置',
            value: 'delay',
            items: [
              {
                type: 'div',
                class: 'grid grid-cols-2 gap-3',
                items: [
                  {
                    type: 'inputNumber',
                    key: 'delayDeliveryStarts',
                    fieldProps: {
                      label: '投递开始',
                      'data-help': '点击投递按钮会等待一段时间,默认值10s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'delayDeliveryInterval',
                    fieldProps: {
                      label: '投递间隔',
                      'data-help': '每个投递的间隔,太快易风控,默认值2s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'delayDeliveryPageNext',
                    fieldProps: {
                      label: '投递翻页',
                      'data-help': '投递完下一页之后等待的间隔,太快易风控,默认值60s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                    },
                  },
                  {
                    type: 'inputNumber',
                    key: 'delayMessageSending',
                    fieldProps: {
                      label: '消息发送',
                      'data-help': '在发送消息前允许等待一定的时间让用户来修改或手动发送,默认值2s',
                    },
                    inputNumberProps: {
                      min: 1,
                      max: 99999,
                      disable: true,
                    },
                  },
                ],
              },
            ],
          },
        ],
      ]
    })
  }
  private detailQueue: Promise<void> = Promise.resolve()
  override async onJobCardClick(key: string, automatic = false) {
    if (!automatic && this.workflow?.busy.value)
      throw new Error('自动读取岗位中，请暂停并等待收尾后再读取新详情')
    const result = this.detailQueue.then(() => this.readJobDetail(key))
    this.detailQueue = result.then(
      () => {},
      () => {},
    )
    return result
  }
  private async readJobDetail(key: string) {
    // const detail = await requestDetail({
    //   securityId: job.rawData.jobitem.securityId,
    //   lid: job.rawData.jobitem.encryptJobId,
    // }).then((r) => r.zpData)
    const job = this.jobMaps.get(key)
    if (!job) {
      throw new Error('未找到job数据')
    }
    if (isInitialized(job.rawData.detail)) {
      return
    }
    this._clickJobCardAction(job.rawData.jobitem)
    const detail = await new Promise<BossZpDetailData>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout)
        clearInterval(interval)
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('岗位详情读取超时，请稍后重试'))
      }, 1000 * 60)
      const interval = setInterval(() => {
        if (this._jobDetail.value && this._jobDetail.value.lid === job.rawData.jobitem.lid) {
          cleanup()
          resolve(this._jobDetail.value)
        }
      }, 100)
    })

    job.rawData.detail = detail
    const targetJob = job.jobData
    targetJob.activeTime = detail.brandComInfo.activeTime
    targetJob.activeTimeStr = detail.bossInfo.activeTimeDesc
    targetJob.jobDescription = detail.jobInfo.postDescription
    targetJob.city = detail.jobInfo.locationName
    targetJob.address = detail.jobInfo.address
    targetJob.addressCoords = [detail.jobInfo.longitude, detail.jobInfo.latitude]

    targetJob.boss = {
      ...targetJob.boss,
      isOnline: detail.bossInfo.bossOnline,
      isCertificated: detail.bossInfo.certificated,
    }

    targetJob.brand = {
      ...targetJob.brand,
      labels: detail.brandComInfo.labels,
      introduce: detail.brandComInfo.introduce,
      stageName: detail.brandComInfo.stageName,
    }
    this.jobMaps.set(key, job)
  }
  _syncJobList(items: BossZpJobItemData[]) {
    this._listRevision++
    this.jobList.value = items.map((item) => {
      const job = convertBossZpJobItemToJobData(item)
      const previous = this._jobDataMap.get(job.key)
      this._jobDataMap.set(
        job.key,
        previous
          ? { ...previous, jobitem: item }
          : {
              jobitem: item,
              detail: createLazyObject('岗位详情获取'),
              boss: createLazyObject('Boss信息获取'),
            },
      )
      this.jobMaps.set(job.key, {
        jobData: job,
        rawData: this._jobDataMap.get(job.key)!,
        state: this.jobMaps.get(job.key)?.state ?? {},
      })
      return job
    })
  }

  async _initJobList() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'jobList',
      this._jobList,
      (items) => this._syncJobList(items),
    )()
  }

  async _initPage() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'pageVo',
      this._page,
    )()
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'hasMore',
      this._pageHasMore,
    )()
  }

  async _initJobDetail() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'jobDetail',
      this._jobDetail,
    )()
  }

  async _initPageChange() {
    let pc =
      location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')
        ? await initSearch()
        : await initChange()
    if (!pc) {
      throw new Error('pageChange is undefined')
    }
    this._pageChange = pc
  }

  async _initClickJobCardAction() {
    this._clickJobCardAction = await useHookVueFn(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'clickJobCardAction',
    )()
  }
}

// function shouldCaptureChatSocket(url: string | URL | undefined) {
//   return url != null && url.toString().includes('chatws')
// }

// function hookChatSocket() {
//   const NativeWebSocket = window.WebSocket
//   const HOOK_SYMBOL = Symbol('__IS_HOOKED__')

//   if (!(NativeWebSocket as any)[HOOK_SYMBOL]) {
//     window.WebSocket = new Proxy(NativeWebSocket, {
//       construct(target, args, newTarget) {
//         const socket = Reflect.construct(target, args, newTarget)

//         const [url] = args as [string | URL | undefined, string | string[] | undefined]

//         if (!shouldCaptureChatSocket(url)) {
//           return socket
//         }
//         BossHelperCtx.setSocket(socket)
//         socket.addEventListener('open', () => {
//           BossHelperCtx.setSocket(socket)
//         })
//         socket.addEventListener('close', () => {
//           BossHelperCtx.setSocket(null)
//         })

//         return socket
//       },
//     }) as typeof WebSocket

//     Object.defineProperty(window.WebSocket, HOOK_SYMBOL, {
//       value: true,
//       enumerable: false,
//       writable: false,
//       configurable: false,
//     })
//   }
// }

export default defineUnlistedScript(async () => {
  // hookChatSocket()

  initCounter()
  const bossHelpCtx = await BossHelperCtx.new()

  bossHelpCtx.rootVue.$router.afterHooks.push(
    (to: {
      name: string
      meta: {
        notLogin: boolean
        wrapClassName: string
        scrollBehavior: string
        hideFooter: boolean
        headerV2: boolean
      }
      path: string
      hash: string
      query: {
        ka: string
      }
      params: {}
      fullPath: string
    }) => {
      // hookChatSocket()
      void bossHelpCtx.onMount(to.path)
    },
  )

  await run(bossHelpCtx)
})
