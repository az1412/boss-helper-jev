import type { ContextLogger } from 'devlog-ui'
import { shallowRef, ref, computed } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

import type { HelperContext } from '../useHelper'
import {
  BossVerificationError,
  DeliveryUncertainError,
  LimitError,
  RateLimitError,
  WorkflowPausedError,
} from './deliverError'
import { DependencyMissingError } from './handles'
import { isFinalResult, summarizeResults, unseenJobs } from './progress'
import type {
  Handler,
  JobStatus,
  Task,
  TaskContext,
  TaskPipeline,
  TaskResult,
  TaskStatus,
  WorkflowData,
} from './type'
import { jobStatusList } from './type'
import { waitForDelay } from './wait'

// 全局缓存管理器实例
let cacheManager: PipelineCacheManager | null = null

class DeliveryQuotaReached extends Error {}

function quotaValue(value: unknown, fallback: number, label: string): number {
  const n = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`${label}必须是正整数`)
  return Math.min(150, n)
}

/**
 * 创建缓存实例
 */
export function getCacheManager(): PipelineCacheManager {
  if (!cacheManager) {
    cacheManager = new PipelineCacheManager()
  }
  return cacheManager
}

/**
 * 缓存Pipeline处理结果
 */
export async function cachePipelineResult(
  key: string,
  jobName: string,
  brandName: string,
  status: JobStatus,
  message: string,
  processorType?: ProcessorType,
): Promise<void> {
  const cacheManager = getCacheManager()
  await cacheManager.setCacheResult(key, jobName, brandName, status, message, processorType)
}

/**
 * 检查职位是否有有效缓存
 */
export function checkJobCache(key: string): PipelineCacheItem | null {
  const cacheManager = getCacheManager()

  if (cacheManager.isValidCache(key)) {
    const cached = cacheManager.getCachedResult(key)
    return cached
  }
  return null
}

export type DeliveryWorkflow<C extends HelperContext<C, T, S>, T, S> = Awaited<
  ReturnType<typeof useDeliveryWorkflow<C, T, S>>
>

function meginResults(res: void | TaskResult | Array<TaskResult | void>): TaskResult | void {
  if (!res) return
  if (Array.isArray(res)) {
    if (res.length === 0) return
    return res.reduce((acc: TaskResult, r) => {
      if (!r) return acc
      let mergedStatus = acc.status
      if (r.status) {
        const accStatusIndex = jobStatusList.indexOf(acc.status as any) ?? -1
        const rStatusIndex = jobStatusList.indexOf(r.status)
        if (rStatusIndex > accStatusIndex) {
          mergedStatus = r.status
        }
      }
      return {
        id: acc.id || r.id,
        isSkip: acc.isSkip || r.isSkip,
        reason: [acc.reason, r.reason].filter(Boolean).join('\n') || undefined,
        status: mergedStatus,
        msg: [acc.msg, r.msg].filter(Boolean).join('\n') || undefined,
        isCache: acc.isCache || r.isCache,
      }
    }, res[0] ?? {})
  }
  return res
}

export async function useDeliveryWorkflow<C extends HelperContext<C, T, S>, T, S>(
  items: Array<Task<C, T, S> | TaskPipeline<C, T, S> | (() => Task<C, T, S>)>,
  helper: C,
) {
  const status = ref<'pending' | 'running' | 'stopping' | 'stop' | 'done' | 'error'>('pending')
  const busy = ref(false)
  const phase = ref('等待开始')
  const endReason = ref('')
  const waitUntil = ref(0)
  const runId = ref('')
  const runDelivered = ref(0)
  const runLimit = ref(50)
  const runMode = ref<'fast' | 'sorted'>('fast')
  const resumable = ref(false)
  const preparing = ref('')
  const runKeys = ref(new Set<string>())
  const summary = computed(() => summarizeResults(runKeys.value, helper.jobResultMaps))
  let stopRequested = false
  let waitController = new AbortController()
  let consecutiveBackoffs = 0
  let backoffUntil = 0
  let previousCriteria = ''
  let runSequence = 0
  const shouldStop = () => stopRequested || status.value === 'error'
  const current = ref(0)
  const total = computed(() => helper.jobList.value.length)
  const errorMessage = ref<string | null>(null)
  const pipeline = shallowRef<Task<C, T, S>[]>([])
  const nodes = shallowRef<
    Array<{
      id: string
      label: string
      status: TaskStatus
      deps: string[]
      error?: any
    }>
  >([])
  const stateMaps = ref(new Map<string, any>())
  const resolvedHandlers = new Map<string, Handler<C, T, S>>()

  const remaining = () =>
    Math.min(
      runLimit.value - runDelivered.value,
      quotaValue(helper.conf.formData.deliveryLimit?.value, 120, '每日上限') -
        helper.statistics.todayData.value.success,
    )
  const quotaReached = () => {
    if (runDelivered.value >= runLimit.value) {
      endReason.value = `已达到本轮投递上限（${runDelivered.value}/${runLimit.value}）`
      return true
    }
    if (remaining() <= 0) {
      endReason.value = '已达到今日投递上限（每日设置与150次上限共同生效）'
      return true
    }
    return false
  }

  const rebuild = async () => {
    pipeline.value = []
    resolvedHandlers.clear()
    const _ctx: TaskContext<C, T, S> = {
      helper,
      now: new Date(),
      index: 0,
      log: logger.withContext({ id: 'workflow-rebuild' }),
    }
    const taskMap = new Map<string, Task<C, T, S>>()
    const _resolvedHandlers = new Map<string, any>()
    const errors = new Map<string, any>()

    const rawTasks = items
      .flatMap((item) =>
        typeof item === 'function' ? [item()] : Array.isArray(item) ? item : [item],
      )
      .map((task) => ({ ...task, before: [...task.before], after: [...task.after] }))
    const requiredIds = new Set<string>()
    for (const task of rawTasks) {
      try {
        taskMap.set(task.id, task)
        const result = await task.task(_ctx)
        if (!result) continue

        requiredIds.add(task.id)
        task.deps.forEach((d) => requiredIds.add(d))

        if (typeof result === 'function') {
          _resolvedHandlers.set(task.id, result)
        } else {
          _resolvedHandlers.set(task.id, result.fn)
          if (result.before) task.before.push(...result.before)
          if (result.after) task.after.push(...result.after)
          if (result.onEnd) task.onEnd = result.onEnd
          if (result.onDelivery) task.onDelivery = result.onDelivery
        }
      } catch (e) {
        errors.set(`${task.id}::${task.label}`, e)
        _resolvedHandlers.set(task.id, async () => {
          throw e
        })
      }
    }

    const _pipeline: Task<C, T, S>[] = []
    const visited = new Set<string>()
    const stack = new Set<string>()
    const sort = (id: string) => {
      if (stack.has(id)) throw new Error(`Cycle: ${id}`)
      if (visited.has(id)) return
      const t = taskMap.get(id)
      if (!t || !requiredIds.has(id)) return
      stack.add(id)
      t.deps.forEach(sort)
      stack.delete(id)
      visited.add(id)
      _pipeline.push(t)
    }
    Array.from(requiredIds).forEach(sort)

    pipeline.value = _pipeline
    resolvedHandlers.clear()
    _resolvedHandlers.forEach((v, k) => resolvedHandlers.set(k, v))

    nodes.value = rawTasks.map((t) => {
      const isLastDefinition = taskMap.get(t.id)?.task === t.task
      const isResolved = _resolvedHandlers.has(t.id)
      const error = errors.get(`${t.id}::${t.label}`)
      let nStatus: TaskStatus = 'disabled'
      if (!isLastDefinition) nStatus = 'shadowed'
      else if (error) nStatus = 'failed'
      else if (isResolved) nStatus = 'active'
      else if (requiredIds.has(t.id)) nStatus = 'dependency_only'

      return {
        id: t.id,
        label: t.label || t.id,
        status: nStatus,
        deps: t.deps,
        error,
      }
    })
    const errMsg = nodes.value
      .map((i) => {
        if (i.error) {
          return `${i.label}: ${i.error instanceof Error ? i.error.message : JSON.stringify(i.error)}`
        }
      })
      .filter(Boolean)
      .join('\n')
    if (errMsg) {
      logger.error('工作流构建错误, 请检查配置:', errMsg)
      errorMessage.value = errMsg
      throw new Error(errMsg)
    } else {
      logger.debug('Pipeline rebuilt', jsonClone(pipeline.value))
    }
  }

  const executeTask = async (
    task: Task<C, T, S>,
    data: WorkflowData<T, S>,
    index: number,
    log: ContextLogger,
    onDeliveryConfirmed: () => Promise<void>,
    taskShouldStop = shouldStop,
  ) => {
    let res: TaskResult | void
    const handler = resolvedHandlers.get(task.id)
    if (!handler || taskShouldStop()) return
    const ctx = {
      helper,
      now: new Date(),
      index,
      log: log.withContext({ task_id: task.id }),
      shouldStop: taskShouldStop,
    }
    for (const fn of [...task.before, handler, ...task.after]) {
      if (taskShouldStop()) break
      if (fn === handler && task.confirmsDelivery && quotaReached())
        throw new DeliveryQuotaReached()
      let next: TaskResult | void
      try {
        next = meginResults(await fn(ctx, data))
      } catch (e) {
        if (!(e instanceof DependencyMissingError)) throw e
        const dep = resolvedHandlers.get(e.taskId)
        if (!dep || taskShouldStop()) throw e
        const depResult = meginResults(await dep(ctx, data))
        if (depResult?.isSkip) return depResult
        if (taskShouldStop()) break
        if (fn === handler && task.confirmsDelivery && quotaReached())
          throw new DeliveryQuotaReached()
        next = meginResults(await fn(ctx, data))
      }
      if (fn === handler && task.confirmsDelivery && next?.status === 'success')
        await onDeliveryConfirmed()
      res = meginResults([res, next])
      if (res?.isSkip || taskShouldStop()) break
    }
    return res
  }

  async function wait(seconds: number, message: string) {
    phase.value = message
    waitUntil.value = Date.now() + Math.max(0, seconds) * 1000
    await waitForDelay(seconds * 1000, waitController.signal)
    waitUntil.value = 0
  }

  const execute = async (
    data: WorkflowData<T, S>,
    index = 0,
    stage: 'all' | 'prepare' | 'send' = 'all',
  ): Promise<'rate-limit' | 'ready' | void> => {
    if (shouldStop() || isFinalResult(helper.jobResultMaps.get(data.jobData.key))) return
    const key = data.jobData.key
    const log = logger.withContext({
      id: 'workflow-execute',
      runId: runId.value,
      job_key: key,
      job_name: data.jobData.jobName,
    })
    let sent = false
    const boundary = pipeline.value.findIndex((t) => t.confirmsDelivery)
    const preparation = boundary < 0 ? pipeline.value : pipeline.value.slice(0, boundary)
    // 预判时的去重记录可能被前一条发送更新，发送前重新检查这些本地过滤器。
    const tasks =
      stage === 'prepare'
        ? preparation
        : stage === 'send'
          ? [...preparation.filter((t) => t.onDelivery), ...pipeline.value.slice(boundary)]
          : pipeline.value
    const taskShouldStop = () => shouldStop() || (stage === 'prepare' && remaining() <= 0)
    for (const t of tasks) {
      if (taskShouldStop()) break
      const taskPhase = t.stateMsg || t.label || t.id
      if (stage === 'prepare') preparing.value = `${taskPhase}：${data.jobData.jobName}`
      else phase.value = `${taskPhase}：${data.jobData.jobName}`
      helper.jobResultMaps.set(
        key,
        sent
          ? {
              status: 'success',
              deliveryConfirmed: true,
              msg: '默认招呼已发送',
              reason: `正在${taskPhase}`,
            }
          : { status: t.state || 'running', msg: taskPhase },
      )
      try {
        const res = await executeTask(
          t,
          data,
          index,
          log,
          async () => {
            if (sent) return
            sent = true
            data.state.deliveryConfirmed = true
            runDelivered.value++
            helper.statistics.todayData.value.success++
            consecutiveBackoffs = 0
            backoffUntil = 0
            helper.jobResultMaps.set(key, {
              status: 'success',
              deliveryConfirmed: true,
              msg: '投递成功',
            })
            log
              .withContext({ event: 'success' })
              .info(`投递成功: ${data.jobData.jobName}`, data.jobData.brand?.name)
            const failures: string[] = []
            try {
              await helper.statistics.flush?.()
            } catch {
              failures.push('成功计数')
            }
            for (const observer of pipeline.value) {
              try {
                await observer.onDelivery?.(
                  { helper, now: new Date(), index, log, shouldStop },
                  data,
                )
              } catch (error) {
                failures.push(observer.label ?? observer.id)
                log.error('发送记录保存失败', observer.id, error)
              }
            }
            if (failures.length) {
              status.value = 'error'
              errorMessage.value = `默认招呼已发送，${failures.join('、')}记录保存失败；本轮已停止`
              endReason.value = errorMessage.value
              throw new Error(errorMessage.value)
            }
          },
          taskShouldStop,
        )
        if (res?.status) {
          helper.statistics.todayData.value.tasks[t.id] ??= {}
          const counts = helper.statistics.todayData.value.tasks[t.id]!
          counts[res.status] = (counts[res.status] ?? 0) + 1
        }
        if (res?.isSkip) {
          helper.jobResultMaps.set(
            key,
            sent
              ? {
                  status: 'success',
                  deliveryConfirmed: true,
                  msg: '默认招呼已发送',
                  reason: res.reason,
                }
              : { ...res, id: t.id, status: res.status ?? 'warn', msg: res.msg ?? t.label ?? t.id },
          )
          log
            .withContext({ event: sent ? 'message' : 'skipped' })
            .info(sent ? '后续步骤已跳过' : `投递过滤: ${data.jobData.jobName}`, res.reason)
          return
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        if (e instanceof DeliveryQuotaReached) {
          helper.jobResultMaps.set(key, { status: 'wait', msg: '额度已满，尚未发送' })
          return
        }
        if (e instanceof WorkflowPausedError) {
          helper.jobResultMaps.set(
            key,
            sent
              ? { status: 'success', deliveryConfirmed: true, msg: '默认招呼已发送', reason }
              : { status: 'wait', msg: '已暂停，尚未发送' },
          )
          log.withContext({ event: 'run' }).info(reason)
          return
        }
        helper.jobResultMaps.set(
          key,
          sent
            ? {
                status: 'success',
                deliveryConfirmed: true,
                msg: '默认招呼已发送，后续步骤失败',
                reason,
              }
            : {
                status: 'error',
                msg:
                  e instanceof DeliveryUncertainError ? '发送结果待核实' : `${t.label ?? t.id}失败`,
                reason,
                id: t.id,
                deliveryUncertain: e instanceof DeliveryUncertainError,
              },
        )
        log
          .withContext({ event: 'error' })
          .error(sent ? '默认招呼已发送，后续步骤失败' : `${t.label ?? t.id}失败`, reason)
        if (
          e instanceof LimitError ||
          e instanceof BossVerificationError ||
          e instanceof DeliveryUncertainError ||
          t.id === 'AI筛选' ||
          t.label === 'AI招呼语'
        ) {
          if (t.id === 'AI筛选' || t.label === 'AI招呼语') resumable.value = true
          status.value = 'error'
          errorMessage.value = reason
          endReason.value = reason
        } else if (e instanceof RateLimitError) {
          return 'rate-limit'
        }
        return
      }
    }
    if (sent) {
      helper.jobResultMaps.set(key, { status: 'success', deliveryConfirmed: true, msg: '投递成功' })
    } else if (taskShouldStop()) {
      helper.jobResultMaps.set(key, { status: 'wait', msg: '已暂停，尚未发送' })
    } else if (stage === 'prepare' && boundary >= 0) {
      const score = data.state.__jev?.score
      helper.jobResultMaps.set(key, {
        status: 'wait',
        msg: Number.isFinite(score) ? `契合度 ${score}/5，等待投递` : '筛选通过，等待投递',
      })
      return 'ready'
    } else {
      helper.jobResultMaps.set(key, {
        status: 'error',
        msg: '未执行投递',
        reason: '工作流没有返回发送成功确认',
      })
    }
  }

  const executeAll = async (rawDataMap: Map<string, T>) => {
    if (busy.value) return
    const continuing = status.value === 'stop' || resumable.value
    busy.value = true
    stopRequested = false
    waitController = new AbortController()
    status.value = 'running'
    phase.value = '准备运行'
    endReason.value = ''
    errorMessage.value = null
    if (!continuing) {
      current.value = 0
      runDelivered.value = 0
      runKeys.value = new Set()
      runId.value = `run-${Date.now()}-${++runSequence}`
    }
    const log = logger.withContext({ runId: runId.value, event: 'run' })
    const seen = new Set<string>()
    const counted = new Set(runKeys.value)
    let configLocked = false
    type Prepared = { data: WorkflowData<T, S>; index: number; outcome: 'ready' | 'rate-limit' }
    let pendingPreparation: Promise<Prepared | null> | undefined
    const handleBackoff = async () => {
      consecutiveBackoffs++
      backoffUntil = Date.now() + Math.max(60, helper.conf.formData.delayDeliveryPageNext) * 1000
      if (consecutiveBackoffs >= 2) throw new Error('连续两次操作频繁，本轮已停止；请稍后再试')
      log.warn('操作频繁，进入退避等待，不立即重试')
      await wait((backoffUntil - Date.now()) / 1000, '频繁操作退避中')
    }
    try {
      await helper.conf.beginRun()
      configLocked = true
      const { profile, jev } = helper.conf.formData
      if (!continuing) {
        runLimit.value = quotaValue(helper.conf.formData.runDeliveryLimit, 50, '本轮上限')
        runMode.value = jev?.mode === 'sorted' ? 'sorted' : 'fast'
      }
      quotaValue(helper.conf.formData.deliveryLimit?.value, 120, '每日上限')
      const criteria = JSON.stringify([profile, jev?.enable, jev?.model])
      if (previousCriteria && criteria !== previousCriteria) {
        for (const [key, result] of helper.jobResultMaps) {
          if (result.status === 'success' || result.deliveryConfirmed || result.deliveryUncertain)
            continue
          stateMaps.value.delete(key)
          helper.jobJudgments?.delete(key)
          helper.jobResultMaps.set(key, { status: 'wait', msg: '求职意向已更新，等待重新评估' })
        }
      }
      previousCriteria = criteria
      await rebuild()
      log.info('开始本轮投递')
      if (backoffUntil > Date.now())
        await wait((backoffUntil - Date.now()) / 1000, '频繁操作退避中')
      while (!shouldStop()) {
        if (quotaReached()) break
        const batch = unseenJobs(helper.jobList.value, seen)
        if (!batch.length) {
          endReason.value = helper.jobList.value.length
            ? '没有新增岗位，本轮已结束'
            : '当前页面没有岗位'
          break
        }
        const order = batch
          .map((job) => {
            seen.add(job.key)
            return job
          })
          .filter((job) => !isFinalResult(helper.jobResultMaps.get(job.key)))
        current.value = helper.jobList.value.filter((job) =>
          isFinalResult(helper.jobResultMaps.get(job.key)),
        ).length
        for (const job of order) {
          helper.jobResultMaps.set(job.key, { status: 'wait', msg: '等待处理' })
        }
        if (order.length) await wait(helper.conf.formData.delayDeliveryStarts, '准备处理当前批次')
        if (shouldStop() || quotaReached()) break
        const jobDataFor = (jobData: (typeof order)[number]) => {
          current.value++
          const rawData = rawDataMap.get(jobData.key)
          if (!rawData) throw new Error('岗位数据已变化，请刷新列表后重新开始')
          runKeys.value.add(jobData.key)
          if (!counted.has(jobData.key)) {
            counted.add(jobData.key)
            helper.statistics.todayData.value.total++
          }
          const data = { jobData, rawData, state: stateMaps.value.get(jobData.key) || {} }
          data.state.__jevRunId = runId.value
          stateMaps.value.set(jobData.key, data.state)
          helper.jobMaps.set(jobData.key, data)
          return data
        }
        const send = async (data: WorkflowData<T, S>, index: number, stage: 'all' | 'send') => {
          if (shouldStop() || quotaReached()) return
          helper.currentJob.value = data.jobData.key
          const outcome = await execute(data, index, stage)
          if (outcome === 'rate-limit') await handleBackoff()
          if (!shouldStop() && !quotaReached())
            await wait(helper.conf.formData.delayDeliveryInterval, '按设置等待下一次投递')
        }
        if (jev?.enable && pipeline.value.some((t) => t.confirmsDelivery)) {
          let cursor = 0
          const prepareNext = async (): Promise<Prepared | null> => {
            try {
              while (cursor < order.length && !shouldStop() && remaining() > 0) {
                const job = order[cursor++]!
                if (isFinalResult(helper.jobResultMaps.get(job.key))) continue
                const data = jobDataFor(job)
                const index = current.value - 1
                const outcome = await execute(data, index, 'prepare')
                if (outcome) return { data, index, outcome }
              }
              return null
            } catch (e) {
              status.value = 'error'
              errorMessage.value = e instanceof Error ? e.message : String(e)
              endReason.value = errorMessage.value
              return null
            } finally {
              preparing.value = ''
            }
          }
          if (runMode.value === 'sorted') {
            phase.value = '判定当前批次，完成后排序投递'
            const ready: Prepared[] = []
            let next: Prepared | null
            while (!shouldStop() && (next = await prepareNext())) {
              if (next.outcome === 'rate-limit') await handleBackoff()
              else ready.push(next)
            }
            ready.sort(
              (a, b) => (b.data.state.__jev?.score ?? -1) - (a.data.state.__jev?.score ?? -1),
            )
            for (const item of ready) {
              if (shouldStop() || quotaReached()) break
              await send(item.data, item.index, 'send')
            }
          } else {
            phase.value = '快速模式：判断通过后逐条投递'
            let next = await prepareNext()
            while (next && !shouldStop() && !quotaReached()) {
              if (next.outcome === 'rate-limit') {
                await handleBackoff()
              } else {
                // 仅提前准备一条；只剩一个名额时不再消耗下一条的判断额度。
                if (remaining() > 1) pendingPreparation = prepareNext()
                await send(next.data, next.index, 'send')
              }
              if (shouldStop() || quotaReached()) break
              next = pendingPreparation ? await pendingPreparation : await prepareNext()
              pendingPreparation = undefined
            }
            await pendingPreparation
            pendingPreparation = undefined
          }
        } else {
          for (const jobData of order) {
            if (shouldStop() || quotaReached()) break
            if (isFinalResult(helper.jobResultMaps.get(jobData.key))) continue
            const data = jobDataFor(jobData)
            await send(data, current.value - 1, 'all')
          }
        }
        if (shouldStop() || quotaReached()) break
        phase.value = '等待加载下一批岗位'
        log.info('当前批次处理完成，检查后续岗位')
        const hasMore = await helper.loadMoreJob(
          wait(helper.conf.formData.delayDeliveryPageNext, '等待下一批岗位'),
          waitController.signal,
        )
        waitUntil.value = 0
        if (shouldStop()) break
        if (!hasMore) {
          endReason.value = '当前批次已处理完，未发现新增岗位'
          break
        }
      }
      if (status.value !== 'error') {
        status.value = stopRequested ? 'stop' : 'done'
        resumable.value = false
        if (stopRequested) endReason.value = '已暂停；继续时跳过已发送和已筛选的岗位'
      }
    } catch (e) {
      status.value = 'error'
      errorMessage.value = e instanceof Error ? e.message : String(e)
      endReason.value = errorMessage.value
      log.error('本轮已停止', errorMessage.value)
    } finally {
      // 不能在后台判定尚未结束时解锁设置或允许另一轮开始。
      await pendingPreparation
      preparing.value = ''
      phase.value = '正在保存本轮结果'
      waitController.abort()
      waitUntil.value = 0
      for (const t of pipeline.value) {
        try {
          await t.onEnd?.({ now: new Date(), helper, index: 0, log })
        } catch (e) {
          log.error('结果保存失败', t.id, e)
          errorMessage.value = '部分运行记录保存失败，请先检查日志，不要重复投递'
          endReason.value = errorMessage.value
          status.value = 'error'
          resumable.value = false
        }
      }
      for (const key of runKeys.value) {
        const result = helper.jobResultMaps.get(key)
        if (result && ['running', 'request', 'ai'].includes(result.status ?? '')) {
          helper.jobResultMaps.set(key, { status: 'wait', msg: '尚未发送' })
        }
      }
      if (configLocked) helper.conf.endRun()
      phase.value =
        status.value === 'stop' ? '已暂停' : status.value === 'error' ? '运行异常' : '已完成'
      busy.value = false
      log.info(endReason.value || phase.value, summary.value)
      void helper
        .notification(endReason.value || phase.value)
        .catch((e) => log.error('通知未送达', e))
    }
  }

  const stop = () => {
    if (!busy.value || status.value !== 'running') return
    stopRequested = true
    status.value = 'stopping'
    phase.value = '暂停中，等待当前操作收尾'
    waitController.abort()
  }
  const reset = () => {
    if (busy.value) return
    status.value = 'pending'
    resumable.value = false
    errorMessage.value = null
    endReason.value = ''
    phase.value = '等待重新评估'
    runDelivered.value = 0
    runId.value = ''
    runKeys.value = new Set()
    current.value = 0
    helper.jobList.value.forEach((job) => {
      const result = helper.jobResultMaps.get(job.key)
      if (result?.deliveryConfirmed || result?.deliveryUncertain || result?.status === 'success')
        return
      stateMaps.value.delete(job.key)
      helper.jobJudgments?.delete(job.key)
      helper.jobResultMaps.set(job.key, { status: 'wait', msg: '等待重新评估' })
    })
  }

  return {
    items,
    status,
    busy,
    phase,
    endReason,
    waitUntil,
    runId,
    runDelivered,
    runLimit,
    runMode,
    resumable,
    preparing,
    summary,
    current,
    total,
    errorMessage,
    pipeline,
    nodes,
    ctx: helper,
    stateMaps,
    rebuild,
    execute,
    executeAll,
    stop,
    reset,
  }
}
