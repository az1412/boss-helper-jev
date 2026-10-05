import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { cachedJevJudgment, jevInputFingerprint } from '../src/composables/useModel/jevCache'

let calls = 0
let requests: any[] = []
let response: (request: any) => Promise<any> = async () => ({
  answers: { fit: { type: 'score', score: 4 } },
})
// 仅替换付费网络边界；下面调用真实 buildJobState / buildJevQuestions / judgeJev / 缓存。
mock.module('@/composables/useModel/typesafe', () => ({
  jevSystemOne: async (request: any) => {
    calls++
    requests.push(request)
    return response(request)
  },
}))
const { getOrComputeJevJudgment, buildJevQuestions, judgeJev } =
  await import('../src/composables/useModel/jevFilter')

beforeEach(() => {
  calls = 0
  requests = []
  response = async () => ({ answers: { fit: { type: 'score', score: 4 } } })
})

const job = () =>
  ({
    key: 'test-job',
    jobName: '测试岗位',
    salary: '10-15K',
    degreeName: '本科',
    experienceName: '1年',
    brand: { name: '测试公司', industry: '制造业', scale: '100人' },
    address: '测试城市-测试区',
    jobDescription: '',
    welfareList: ['双休'],
    skills: ['CAD'],
    jobLabels: [],
  }) as any

test('评分展示保留低于门槛的实际小数，判定不变', () => {
  const result = judgeJev(
    { model: 'test', answers: { fit: { type: 'score', score: 2.49999 } } },
    'normal',
  )
  expect(result.pass).toBe(false)
  expect(result.reason).toContain('2.49999/5')
  expect(result.threshold).toBe(2.5)
})
test('判定解释保存条件文本与概率，不伪造岗位原文', async () => {
  response = async () => ({ answers: { fit: { type: 'score', score: 3.8 }, want_0: { type: 'noul', noul: 0.8 }, avoid_0: { type: 'noul', noul: 0.1 } } })
  const result = await getOrComputeJevJudgment({}, job(), options())
  expect(result.conditions).toEqual([{ label: '双休', kind: 'want', value: 0.8, hit: true }, { label: '长期加班', kind: 'avoid', value: 0.1, hit: false }])
})
const options = () => ({
  apiKey: 'TEST_ONLY_SECRET_KEY',
  model: 'jev-latest',
  targetJob: '研发岗位',
  resume: '测试介绍',
  want: '双休',
  avoid: '长期加班',
  strictness: 'normal' as const,
})

// 保留实际 Jev 任务、详情阶段、调度与缓存；只替换模型和发送网络边界。
async function workflowFixture(keys: string[], mode: 'fast' | 'sorted' = 'fast', limit = 2) {
  const { reactive, ref } = await import('vue')
  Object.assign(globalThis, { useToast: () => ({ add() {} }) })
  if (typeof window === 'undefined')
    Object.assign(globalThis, {
      window: { addEventListener() {}, removeEventListener() {} },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    })
  const { useDeliveryWorkflow } = await import('../src/composables/useApplying')
  const { defineTaskHandler } = await import('../src/composables/useApplying/type')
  const { TaskRegistry } = await import('../src/composables/useApplying/handles')
  const helper: any = {
    jobList: ref(keys.map((key) => ({ ...job(), key, jobName: `岗位-${key}` }))),
    jobMaps: new Map(),
    jobResultMaps: reactive(new Map()),
    currentJob: ref(null),
    statistics: { todayData: ref({ success: 0, total: 0, tasks: {} }) },
    conf: {
      formData: {
        jev: { enable: true, apiKey: 'OFFLINE_TEST', mode },
        profile: { targetJob: '', resume: '', want: '', avoid: '', strictness: 'normal' },
        runDeliveryLimit: limit,
        deliveryLimit: { value: 150 },
        delayDeliveryStarts: 0,
        delayDeliveryInterval: 0,
        delayDeliveryPageNext: 0,
      },
      beginRun() {},
      endRun() {},
    },
    notification: async () => {},
    loadMoreJob: async () => false,
  }
  const data = new Map(keys.map((key) => [key, { key }]))
  const sent: string[] = []
  const boundary = { send: async (_key: string) => {} }
  const details = defineTaskHandler('岗位详情获取', () => async (_, data) => {
    data.jobData.jobDescription = `完整职责-${data.jobData.key}`
  })()
  const send = defineTaskHandler(
    '发送',
    () => async (_, data) => {
      await boundary.send(data.jobData.key)
      sent.push(data.jobData.key)
      return { status: 'success' as const }
    },
    { confirmsDelivery: true },
  )()
  const tasks = [
    details,
    new TaskRegistry<any, any>().aiFiltering({ deps: ['岗位详情获取'] }),
    send,
  ]
  const flow = await useDeliveryWorkflow(tasks, helper)
  return { helper, data, flow, sent, boundary, tasks, defineTaskHandler, useDeliveryWorkflow }
}
function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function eventually(check: () => boolean) {
  const until = Date.now() + 2000
  while (!check()) {
    if (Date.now() > until) throw new Error('等待工作流超时')
    await new Promise((r) => setTimeout(r, 5))
  }
}
const scoreResponse = (score: number) => ({ answers: { fit: { type: 'score', score } } })

describe('Jev 两种模式的真实工作流', () => {
  test('默认快速模式：判断下一条时已在发送当前条，最后一个名额不多判', async () => {
    const f = await workflowFixture(['a', 'b', 'c'])
    delete f.helper.conf.formData.jev.mode
    f.helper.conf.formData.jev.rank = true // 旧配置不强迫新版本继续排序
    const judgingB = gate(),
      sendingA = gate()
    let bStarted = false,
      aStarted = false,
      active = 0,
      peak = 0
    response = async (req) => {
      expect(req.state).toContain('完整职责-')
      if (req.state.includes('岗位-b')) {
        bStarted = true
        await judgingB.promise
      }
      return scoreResponse(4)
    }
    f.boundary.send = async (key) => {
      active++
      peak = Math.max(peak, active)
      if (key === 'a') {
        aStarted = true
        await sendingA.promise
      }
      active--
    }
    const running = f.flow.executeAll(f.data)
    await eventually(() => aStarted && bStarted)
    expect(f.sent).toEqual([])
    sendingA.resolve()
    await eventually(() => f.sent.length === 1)
    expect(f.sent).toEqual(['a'])
    expect(f.flow.busy.value).toBe(true)
    judgingB.resolve()
    await running
    expect(f.sent).toEqual(['a', 'b'])
    expect(calls).toBe(2)
    expect(peak).toBe(1)
    expect(f.flow.runMode.value).toBe('fast')
    expect(f.helper.statistics.todayData.value.total).toBe(2)
  })

  test('排序模式等当前整批完成，按分数降序只投目标数', async () => {
    const f = await workflowFixture(['a', 'b', 'c'], 'sorted')
    const last = gate()
    let cStarted = false
    response = async (req) => {
      expect(req.state).toContain('完整职责-')
      if (req.state.includes('岗位-c')) {
        cStarted = true
        await last.promise
      }
      return scoreResponse(req.state.includes('岗位-b') ? 5 : req.state.includes('岗位-c') ? 4 : 3)
    }
    const running = f.flow.executeAll(f.data)
    await eventually(() => cStarted)
    expect(f.sent).toEqual([])
    last.resolve()
    await running
    expect(f.sent).toEqual(['b', 'c'])
    expect(calls).toBe(3)
    expect(f.flow.runDelivered.value).toBe(2)
    expect(f.helper.statistics.todayData.value.total).toBe(3)
  })

  test('两种模式都不投判定未通过的岗位，失败判定不占名额', async () => {
    for (const mode of ['fast', 'sorted'] as const) {
      const f = await workflowFixture(['skip', 'a', 'b'], mode)
      response = async (req) => scoreResponse(req.state.includes('岗位-skip') ? 1 : 4)
      await f.flow.executeAll(f.data)
      expect(f.sent).toEqual(['a', 'b'])
      expect(f.flow.runDelivered.value).toBe(2)
      expect(f.helper.jobResultMaps.get('skip').status).toBe('warn')
    }
  })

  test('暂停要等待预判收尾，再继续复用判定和本轮计数', async () => {
    const f = await workflowFixture(['a', 'b', 'c'])
    const last = gate()
    let bStarted = false,
      unlocked = false
    f.helper.conf.endRun = () => {
      unlocked = true
    }
    response = async (req) => {
      if (req.state.includes('岗位-b')) {
        bStarted = true
        await last.promise
      }
      return scoreResponse(4)
    }
    const running = f.flow.executeAll(f.data)
    await eventually(() => bStarted && f.sent.length === 1)
    const id = f.flow.runId.value
    f.flow.stop()
    await f.flow.executeAll(f.data)
    expect(unlocked).toBe(false)
    expect(f.flow.busy.value).toBe(true)
    last.resolve()
    await running
    expect(f.flow.status.value).toBe('stop')
    expect(unlocked).toBe(true)
    await f.flow.executeAll(f.data)
    expect(f.flow.runId.value).toBe(id)
    expect(f.sent).toEqual(['a', 'b'])
    expect(calls).toBe(2)
    expect(f.helper.statistics.todayData.value.total).toBe(2)
  })

  test('预判API失败停止新工作，等待当前发送确认并保留成功', async () => {
    const f = await workflowFixture(['a', 'b', 'c'])
    const failed = gate(),
      sending = gate()
    let aStarted = false,
      bStarted = false,
      unlocked = false
    f.helper.conf.endRun = () => {
      unlocked = true
    }
    response = async (req) => {
      if (req.state.includes('岗位-b')) {
        bStarted = true
        await failed.promise
        throw new Error('模拟Jev额度耗尽')
      }
      return scoreResponse(4)
    }
    f.boundary.send = async () => {
      aStarted = true
      await sending.promise
    }
    const running = f.flow.executeAll(f.data)
    await eventually(() => aStarted && bStarted)
    failed.resolve()
    await eventually(() => f.flow.status.value === 'error')
    expect(unlocked).toBe(false)
    sending.resolve()
    await running
    expect(f.sent).toEqual(['a'])
    expect(f.helper.jobResultMaps.get('a').deliveryConfirmed).toBe(true)
    expect(f.flow.runDelivered.value).toBe(1)
    expect(f.flow.endReason.value).toContain('额度耗尽')
    expect(calls).toBe(2)
    const id = f.flow.runId.value
    expect(f.flow.resumable.value).toBe(true)
    response = async () => scoreResponse(4)
    f.helper.conf.formData.jev.apiKey = 'SECOND_TEST_KEY'
    f.helper.conf.formData.runDeliveryLimit = 50
    await f.flow.executeAll(f.data)
    expect(f.flow.runId.value).toBe(id)
    expect(f.flow.runLimit.value).toBe(2)
    expect(f.flow.runDelivered.value).toBe(2)
    expect(f.sent).toEqual(['a', 'b'])
    expect(calls).toBe(3)
    expect(f.flow.resumable.value).toBe(false)
  })

  test('排序逐批进行，当前批次不够名额才读取下一批', async () => {
    const f = await workflowFixture(['a', 'b'], 'sorted', 3)
    let pages = 0
    response = async (req) => scoreResponse(req.state.includes('岗位-b') ? 4 : 3)
    f.helper.loadMoreJob = async () => {
      pages++
      expect(f.sent).toEqual(['b', 'a'])
      f.helper.jobList.value = [{ ...job(), key: 'c', jobName: '岗位-c' }]
      f.data.set('c', { key: 'c' })
      return true
    }
    await f.flow.executeAll(f.data)
    expect(f.sent).toEqual(['b', 'a', 'c'])
    expect(pages).toBe(1)
    expect(calls).toBe(3)
  })

  test('提前判过的去重过滤器在真正发送前重新检查', async () => {
    for (const mode of ['fast', 'sorted'] as const) {
      const f = await workflowFixture(['a', 'b'], mode)
      let contacted = false
      const duplicate = f.defineTaskHandler('发送记录过滤', () => ({
        fn: async () => (contacted ? { isSkip: true, status: 'warn' as const } : undefined),
        onDelivery: async () => {
          contacted = true
        },
      }))()
      const flow = await f.useDeliveryWorkflow([duplicate, ...f.tasks], f.helper)
      await flow.executeAll(f.data)
      expect(f.sent).toEqual(['a'])
      expect(flow.runDelivered.value).toBe(1)
    }
  })
})

describe('Jev 实际输入缓存', () => {
  test('相同输入只判一次，state.__jev 保持既有结果 API', async () => {
    const state: Record<string, any> = {}
    const first = await getOrComputeJevJudgment(state, job(), options())
    const second = await getOrComputeJevJudgment(state, job(), options())
    expect(first).toBe(second)
    expect(state.__jev).toBe(first)
    expect(calls).toBe(1)
    expect(state.__jevCache.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  test('凭据既不进入指纹也不进入状态，换 Key 不额外计费', async () => {
    const state: Record<string, any> = { __jevRunId: 'one' }
    await getOrComputeJevJudgment(state, job(), options())
    const fingerprint = state.__jevCache.fingerprint
    await getOrComputeJevJudgment(state, job(), { ...options(), apiKey: 'ANOTHER_TEST_SECRET' })
    expect(calls).toBe(1)
    expect(state.__jevCache.fingerprint).toBe(fingerprint)
    expect(JSON.stringify(state)).not.toContain('TEST_ONLY_SECRET_KEY')
    expect(JSON.stringify(state)).not.toContain('ANOTHER_TEST_SECRET')
    expect(JSON.stringify(state)).not.toContain('测试介绍')
  })

  test('完整实际 state 改变后重新判，不把旧 __jev 当无限期缓存', async () => {
    const state = {}
    const current = job()
    await getOrComputeJevJudgment(state, current, options())
    current.jobDescription = '新增职责'
    await getOrComputeJevJudgment(state, current, options())
    current.salary = '20-25K'
    await getOrComputeJevJudgment(state, current, options())
    expect(calls).toBe(3)
    expect(requests[1].state).toContain('新增职责')
  })

  test('求职意向、问题、模型、严格度任意改变均重新判断', async () => {
    const state = {}
    let opts: any = options()
    await getOrComputeJevJudgment(state, job(), opts)
    for (const change of [
      { targetJob: '另一个方向' },
      { resume: '新介绍' },
      { want: '五险' },
      { avoid: '出差' },
      { model: 'test-other-model' },
      { strictness: 'strict' },
    ]) {
      opts = { ...opts, ...change }
      await getOrComputeJevJudgment(state, job(), opts)
    }
    expect(calls).toBe(7)
  })

  test('按实际送入 state 的截断文本指纹，未送入模型的简历尾部变化不会再收费', async () => {
    const state = {}
    const resume = 'a'.repeat(1200)
    await getOrComputeJevJudgment(state, job(), { ...options(), resume: resume + 'A' })
    await getOrComputeJevJudgment(state, job(), { ...options(), resume: resume + 'B' })
    expect(calls).toBe(1)
  })

  test('默认模型与显式 jev-latest 是同一实际输入', async () => {
    const state = {}
    await getOrComputeJevJudgment(state, job(), { ...options(), model: undefined })
    await getOrComputeJevJudgment(state, job(), options())
    expect(calls).toBe(1)
  })

  test('没有指纹的旧缓存不可复用', async () => {
    const state = { __jev: { pass: false, score: 0, reason: 'old' } }
    const result = await getOrComputeJevJudgment(state, job(), options())
    expect(result.pass).toBe(true)
    expect(calls).toBe(1)
  })

  test('清理缓存后重新评估，不在外部另藏一份已完成缓存', async () => {
    const state: Record<string, any> = {}
    await getOrComputeJevJudgment(state, job(), options())
    delete state.__jev
    delete state.__jevCache
    await getOrComputeJevJudgment(state, job(), options())
    expect(calls).toBe(2)
  })

  test('失败不缓存，下次可重试', async () => {
    const state: Record<string, any> = {}
    response = async () => {
      throw new Error('OFFLINE_TEST_FAILURE')
    }
    await expect(getOrComputeJevJudgment(state, job(), options())).rejects.toThrow(
      'OFFLINE_TEST_FAILURE',
    )
    expect(state.__jev).toBeUndefined()
    response = async () => ({ answers: { fit: { type: 'score', score: 4 } } })
    await getOrComputeJevJudgment(state, job(), options())
    expect(calls).toBe(2)
  })

  test('并行读取相同输入共用一次进行中的请求', async () => {
    let finish!: (value: any) => void
    response = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const state = {}
    const first = getOrComputeJevJudgment(state, job(), options())
    const second = getOrComputeJevJudgment(state, job(), options())
    for (let i = 0; i < 100 && !finish; i++) await Bun.sleep(1)
    expect(finish).toBeFunction()
    expect(calls).toBe(1)
    finish({ answers: { fit: { type: 'score', score: 4 } } })
    expect(await first).toEqual(await second)
    expect(calls).toBe(1)
  })

  test('实际 problems/questions 变更直接导致指纹改变，多余 apiKey 字段被忽略', async () => {
    const input = {
      state: 'test',
      questions: { fit: 'one' },
      strictness: 'normal',
      apiKey: 'TEST_SECRET',
    }
    const first = await jevInputFingerprint(input)
    expect(await jevInputFingerprint({ ...input, questions: { fit: 'two' } })).not.toBe(first)
    expect(await jevInputFingerprint({ ...input, apiKey: 'OTHER_SECRET' } as typeof input)).toBe(
      first,
    )
  })
})

describe('预判与执行同轮复用', () => {
  test('同轮补充 JD 与详细地址沿用预判，实际输入指纹不伪造', async () => {
    const state: Record<string, any> = { __jevRunId: 'run-1' }
    const current = job()
    const first = await getOrComputeJevJudgment(state, current, options())
    const fingerprint = state.__jevCache.fingerprint
    current.jobDescription = '详情补全'
    current.address = '具体路牌100号'
    const execute = await getOrComputeJevJudgment(state, current, options())
    expect(execute).toBe(first)
    expect(calls).toBe(1)
    expect(state.__jevCache.fingerprint).toBe(fingerprint)
    state.__jevRunId = 'run-2'
    await getOrComputeJevJudgment(state, current, options())
    expect(calls).toBe(2)
    expect(state.__jevCache.fingerprint).not.toBe(fingerprint)
  })

  test('跨轮相同实际输入可命中，并登记当前轮以便执行继续复用', async () => {
    const state: Record<string, any> = { __jevRunId: 'run-1' }
    const current = job()
    await getOrComputeJevJudgment(state, current, options())
    state.__jevRunId = 'run-2'
    await getOrComputeJevJudgment(state, current, options())
    current.jobDescription = '本轮补详情'
    await getOrComputeJevJudgment(state, current, options())
    expect(calls).toBe(1)
  })

  test('同轮列表基础字段或筛选条件改变，不能借同轮复用逃过失效', async () => {
    const state: Record<string, any> = { __jevRunId: 'run-1' }
    const current = job()
    await getOrComputeJevJudgment(state, current, options())
    current.jobName = '完全不同岗位'
    await getOrComputeJevJudgment(state, current, options())
    await getOrComputeJevJudgment(state, current, { ...options(), strictness: 'strict' })
    await getOrComputeJevJudgment(state, current, { ...options(), model: 'other-model' })
    expect(calls).toBe(4)
  })

  test('较早的异步判定不能覆盖已完成的新输入结果', async () => {
    const state: Record<string, any> = {}
    let finishOld!: (value: string) => void
    const old = cachedJevJudgment(
      state,
      { state: 'old', questions: {}, strictness: 'normal' },
      () =>
        new Promise<string>((resolve) => {
          finishOld = resolve
        }),
    )
    for (let i = 0; i < 100 && !finishOld; i++) await Bun.sleep(1)
    await cachedJevJudgment(
      state,
      { state: 'new', questions: {}, strictness: 'normal' },
      async () => 'new',
    )
    finishOld('old')
    await old
    expect(state.__jev).toBe('new')
  })
})

test('原判断阈值与问题文案路径没有改变', () => {
  const questions = buildJevQuestions('双休、五险', '长期加班')
  expect(Object.keys(questions)).toEqual(['want_0', 'want_1', 'avoid_0', 'fit'])
  expect(
    judgeJev({ model: 'test', answers: { fit: { type: 'score', score: 2.5 } } }, 'normal').pass,
  ).toBe(true)
  expect(
    judgeJev({ model: 'test', answers: { fit: { type: 'score', score: 2.49 } } }, 'normal').pass,
  ).toBe(false)
  expect(
    judgeJev(
      {
        model: 'test',
        answers: { fit: { type: 'score', score: 4 }, avoid_0: { type: 'noul', noul: 0.7 } },
      },
      'normal',
    ).pass,
  ).toBe(false)
})
