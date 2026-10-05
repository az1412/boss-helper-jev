import type { Toast } from '@nuxt/ui/runtime/composables/useToast.js'
import { extendRef } from '@vueuse/core'
import type { Reactive } from 'vue'
import { ref } from 'vue'
import type { Ref } from 'vue'

import { useConf } from '@/composables/conf'
import type { DeliveryWorkflow } from '@/composables/useApplying'
import type { BossHelperError } from '@/composables/useApplying/deliverError'
import type { TaskResult, WorkflowData } from '@/composables/useApplying/type'
import { useModel } from '@/composables/useModel'
import { ChatModel } from '@/composables/useModel'
import type { JevJudgment } from '@/composables/useModel/jevFilter'
import type { FormDataInput } from '@/types/formData'

import type { NetConf } from './netConf'
import { initNetConf } from './netConf'
import type { Log, JobData, LogData, ConfigAccordionItem, AlertItem } from './type'

export abstract class HelperContext<C extends HelperContext<C, T, S>, T, S> {
  netConf: Ref<NetConf | null>
  netConfTimer: NodeJS.Timeout | null = null
  conf: ReturnType<typeof useConf>
  models: ReturnType<typeof useModel>
  statistics: ReturnType<typeof useStatistics>

  chatModel: ChatModel
  workflow: DeliveryWorkflow<C, T, S> | null = null
  workflowRunning = computed(() => this.workflow?.busy.value ?? false)
  jobResultMaps: Reactive<Map<string, TaskResult>>
  jobJudgments = reactive(new Map<string, JevJudgment>())

  abstract jobList: Ref<JobData[]>
  abstract jobMaps: Map<string, WorkflowData<T, S>>

  currentJob: Ref<string | null>
  _logs: Ref<Log[]>
  logs: {
    add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => void
    info: (title: string, message: string) => void
    clear: () => void
    value: Log[]
  }
  pendingMessages: Ref<string | undefined>
  constructor() {
    this.pendingMessages = ref()
    this.conf = useConf(true)
    this.models = useModel()
    this.statistics = useStatistics()
    this.currentJob = ref(null)
    this._logs = ref([])
    this.logs = extendRef(this._logs, {
      add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => {
        const state = !err ? 'success' : err.state
        const message = msg ?? (err ? err.message : undefined)
        this._logs.value.push({
          job,
          title: job.jobName,
          state,
          state_name: err?.name ?? '投递成功',
          message,
          data: logdata,
        })
      },
      info: (title: string, message: string) => {
        this._logs.value.push({
          title,
          state: 'info',
          state_name: '消息',
          message,
          data: undefined,
        })
      },
      clear: () => {
        this._logs.value = []
      },
    })

    this.chatModel = new ChatModel(this)

    this.jobResultMaps = reactive(new Map())
    this.netConf = ref(null)
  }

  abstract loadMoreJob(delay: Promise<any>, signal?: AbortSignal): Promise<boolean>
  abstract onMount(): Promise<void>
  abstract getConfigItems(): ComputedRef<[AlertItem[], (ConfigAccordionItem | false)[]]>

  abstract start(): Promise<void>
  abstract sendMessage(data: WorkflowData<T, S>, msg: FormDataInput['value']): Promise<void>
  abstract get uid(): string
  abstract get userInfo(): {
    id: string
    name: string
    avatar: string
  }
  abstract get key(): string
  abstract get label(): string

  initNetConf() {
    if (this.netConfTimer) {
      clearInterval(this.netConfTimer)
      this.netConfTimer = null
    }
    // 本版只使用本地空配置，不轮询上游；重新初始化也会替换遗留的展示内容。
    return initNetConf().then((data) => {
      this.netConf.value = data
    })
  }

  stop() {
    this.workflow?.stop()
  }
  reset() {
    this.workflow?.reset()
  }
  async notification(
    msg: string,
    opt?: {
      notification?: typeof notification extends (
        message: string,
        options?: infer O,
      ) => Promise<any>
        ? O
        : never
      toast: Partial<Toast>
    },
  ) {
    const toast = useToast()
    if (this.conf.formData.notification.value && document.visibilityState !== 'visible') {
      await notification(msg, opt?.notification)
    }
    toast.add({
      ...opt?.toast,
      title: msg,
    })
  }

  async onJobCardClick(_key: string, _automatic = false) {
    throw new Error('Method not implemented.')
  }
}
