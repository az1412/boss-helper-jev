import { afterAll, afterEach, describe, expect, test } from 'bun:test'

import { reactive, ref } from 'vue'

// 只替代浏览器边界。测试加载并执行真实工作流和真实任务工厂。
const storage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}
Object.assign(globalThis, {
  useToast: () => ({ add() {} }),
  window: { addEventListener() {}, removeEventListener() {} },
  localStorage: storage(),
  sessionStorage: storage(),
})
const { useDeliveryWorkflow } = await import('../src/composables/useApplying')
const { defineTaskHandler } = await import('../src/composables/useApplying/type')
const { DeliveryUncertainError, LimitError, RateLimitError } =
  await import('../src/composables/useApplying/deliverError')
const { loadNextPage } = await import('../src/entrypoints/boss/pagination')
const { waitForDelay } = await import('../src/composables/useApplying/wait')

const job = (key: string) => ({ key, jobName: `测试岗位${key}`, brand: { name: '离线测试' } })
function fixture(keys = ['a', 'b']) {
  const data = new Map(keys.map((key) => [key, { key }]))
  const helper: any = {
    jobList: ref(keys.map(job)),
    jobResultMaps: reactive(new Map()),
    jobMaps: new Map(),
    currentJob: ref(null),
    statistics: {
      todayData: ref({ total: 0, success: 0, repeat: 0, activityFilter: 0, tasks: {} }),
    },
    conf: {
      formData: {
        deliveryLimit: { value: 100 },
        runDeliveryLimit: 50,
        delayDeliveryStarts: 0,
        delayDeliveryInterval: 0,
        delayDeliveryPageNext: 0,
        jev: { enable: false },
        profile: {},
      },
      beginRun() {},
      endRun() {},
    },
    loadMoreJob: async () => false,
    notification: async () => {},
  }
  return { helper, data }
}
const sendTask = (send: () => unknown = () => {}) =>
  defineTaskHandler(
    '发送',
    () => async () => {
      await send()
      return { status: 'success' as const }
    },
    { confirmsDelivery: true },
  )()
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('本轮与每日额度', () => {
  test('默认一轮只发送50，达标后不翻页', async () => {
    const { helper, data } = fixture(Array.from({ length: 55 }, (_, i) => String(i)))
    delete helper.conf.formData.runDeliveryLimit
    helper.conf.formData.deliveryLimit.value = 150
    let sends = 0,
      pages = 0
    helper.loadMoreJob = async () => {
      pages++
      return false
    }
    const flow = await useDeliveryWorkflow([sendTask(() => sends++)], helper)
    await flow.executeAll(data)
    expect(sends).toBe(50)
    expect(flow.runDelivered.value).toBe(50)
    expect(pages).toBe(0)
    expect(flow.endReason.value).toContain('本轮')
  }, 10000)

  test('每日150为硬上限，旧设置155时今日147只能再发3', async () => {
    const { helper, data } = fixture(['a', 'b', 'c', 'd'])
    helper.conf.formData.deliveryLimit.value = 155
    helper.statistics.todayData.value.success = 147
    const flow = await useDeliveryWorkflow([sendTask()], helper)
    await flow.executeAll(data)
    expect(flow.runDelivered.value).toBe(3)
    expect(helper.statistics.todayData.value.success).toBe(150)
    expect(flow.endReason.value).toContain('今日')
  })

  test('更低的每日设置生效；筛掉的岗位不占本轮成功数', async () => {
    const { helper, data } = fixture(['skip', 'a', 'b', 'c'])
    helper.conf.formData.deliveryLimit.value = 10
    helper.statistics.todayData.value.success = 8
    const filter = defineTaskHandler('本地过滤', () => async (_, data) => {
      if (data.jobData.key === 'skip') return { isSkip: true, status: 'warn' as const }
    })()
    const flow = await useDeliveryWorkflow([filter, sendTask()], helper)
    await flow.executeAll(data)
    expect(flow.runDelivered.value).toBe(2)
    expect(helper.statistics.todayData.value.success).toBe(10)
  })

  test('暂停继续保留runId和目标，剩余额度不会重置', async () => {
    const { helper, data } = fixture(['a', 'b', 'c'])
    helper.conf.formData.runDeliveryLimit = 2
    const gate = deferred()
    let entered = false
    const send = sendTask(async () => {
      entered = true
      await gate.promise
    })
    const flow = await useDeliveryWorkflow([send], helper)
    const running = flow.executeAll(data)
    await until(() => entered)
    const id = flow.runId.value
    flow.stop()
    gate.resolve()
    await running
    expect(flow.runDelivered.value).toBe(1)
    helper.conf.formData.runDeliveryLimit = 50
    await flow.executeAll(data)
    expect(flow.runId.value).toBe(id)
    expect(flow.runDelivered.value).toBe(2)
    expect(flow.runLimit.value).toBe(2)
    expect(helper.statistics.todayData.value.success).toBe(2)
  })

  test('异步before期间额度耗尽，实际发送前再检查且不标失败', async () => {
    const { helper, data } = fixture(['a'])
    const gate = deferred()
    let sends = 0,
      entered = false
    const send = sendTask(() => sends++)
    send.before.push(async () => {
      entered = true
      await gate.promise
    })
    const flow = await useDeliveryWorkflow([send], helper)
    const running = flow.executeAll(data)
    await until(() => entered)
    helper.statistics.todayData.value.success = 100
    gate.resolve()
    await running
    expect(sends).toBe(0)
    expect(helper.jobResultMaps.get('a').status).toBe('wait')
    expect(flow.endReason.value).toContain('今日')
  })

  test('非法额度不能绕过限制', async () => {
    for (const field of ['runDeliveryLimit', 'deliveryLimit']) {
      for (const value of [NaN, 0, -1, 1.5, Infinity]) {
        const { helper, data } = fixture(['a'])
        if (field === 'deliveryLimit') helper.conf.formData.deliveryLimit.value = value
        else helper.conf.formData.runDeliveryLimit = value
        let sends = 0
        const flow = await useDeliveryWorkflow([sendTask(() => sends++)], helper)
        await flow.executeAll(data)
        expect(sends).toBe(0)
        expect(flow.status.value).toBe('error')
      }
    }
  })
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 5))
async function until(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('测试等待状态超时')
    await tick()
  }
}

// 测试不得意外访问真实网络。
const realFetch = globalThis.fetch
globalThis.fetch = (() => {
  throw new Error('离线测试禁止联网')
}) as typeof fetch
afterEach(() => {
  globalThis.fetch = (() => {
    throw new Error('离线测试禁止联网')
  }) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

describe('工作流真实控制流', () => {
  test('空列表正常完成而非异常', async () => {
    const { helper, data } = fixture([])
    const flow = await useDeliveryWorkflow([sendTask()], helper)
    await flow.executeAll(data)
    expect(flow.status.value).toBe('done')
    expect(flow.endReason.value).toContain('没有岗位')
    expect(helper.statistics.todayData.value.success).toBe(0)
  })
  test('达到今日额度时一条也不额外发送', async () => {
    const { helper, data } = fixture()
    helper.statistics.todayData.value.success = 100
    let sends = 0
    const flow = await useDeliveryWorkflow([sendTask(() => sends++)], helper)
    await flow.executeAll(data)
    expect(sends).toBe(0)
    expect(flow.status.value).toBe('done')
  })
  test('发送确认后追加步骤失败仍只记一次成功，再运行不重复发送', async () => {
    const { helper, data } = fixture(['a'])
    let sends = 0
    const extra = defineTaskHandler('追加', () => async () => {
      throw new Error('模拟追加失败')
    })()
    const flow = await useDeliveryWorkflow([sendTask(() => sends++), extra], helper)
    await flow.executeAll(data)
    expect(helper.jobResultMaps.get('a').status).toBe('success')
    expect(helper.jobResultMaps.get('a').reason).toContain('模拟追加失败')
    await flow.executeAll(data)
    expect(sends).toBe(1)
    expect(helper.statistics.todayData.value.success).toBe(1)
  })
  test('发送任务的after失败也不能抹去已确认成功', async () => {
    const { helper, data } = fixture(['a'])
    const task = sendTask()
    task.after.push(async () => {
      throw new Error('after失败')
    })
    const flow = await useDeliveryWorkflow([task], helper)
    await flow.executeAll(data)
    expect(helper.statistics.todayData.value.success).toBe(1)
    expect(helper.jobResultMaps.get('a').deliveryConfirmed).toBe(true)
  })
  test('暂停收尾期间双击开始不重入；发送前暂停不造成功', async () => {
    const { helper, data } = fixture(['a'])
    const gate = deferred()
    let sends = 0
    const before = defineTaskHandler('读取', () => async () => {
      await gate.promise
    })()
    const flow = await useDeliveryWorkflow([before, sendTask(() => sends++)], helper)
    const running = flow.executeAll(data)
    await tick()
    flow.stop()
    await flow.executeAll(data)
    expect(flow.busy.value).toBe(true)
    expect(flow.status.value).toBe('stopping')
    gate.resolve()
    await running
    expect(sends).toBe(0)
    expect(flow.status.value).toBe('stop')
    expect(helper.jobResultMaps.get('a').status).toBe('wait')
    await flow.executeAll(data)
    expect(sends).toBe(1)
  })
  test('暂停时已发出的请求确认成功，记账一次且不做后续步骤', async () => {
    const { helper, data } = fixture(['a'])
    const gate = deferred()
    let extras = 0,
      entered = false
    const flow = await useDeliveryWorkflow(
      [
        sendTask(() => {
          entered = true
          return gate.promise
        }),
        defineTaskHandler('追加', () => async () => {
          extras++
        })(),
      ],
      helper,
    )
    const running = flow.executeAll(data)
    await until(() => entered)
    flow.stop()
    gate.resolve()
    await running
    expect(helper.statistics.todayData.value.success).toBe(1)
    expect(extras).toBe(0)
    expect(flow.status.value).toBe('stop')
  })
  test('配置构建失败阻止发送，并保留错误原因', async () => {
    const { helper, data } = fixture()
    let sends = 0
    const broken = defineTaskHandler('配置', () => {
      throw new Error('配置缺失')
    })()
    const flow = await useDeliveryWorkflow([broken, sendTask(() => sends++)], helper)
    await flow.executeAll(data)
    expect(flow.status.value).toBe('error')
    expect(flow.errorMessage.value).toContain('配置缺失')
    expect(sends).toBe(0)
  })
  test('限额/发送结果未知立即停，不发送下一条；重评保留待核实记录', async () => {
    for (const error of [new LimitError('限额'), new DeliveryUncertainError()]) {
      const { helper, data } = fixture()
      let sends = 0
      const flow = await useDeliveryWorkflow(
        [
          sendTask(() => {
            sends++
            throw error
          }),
        ],
        helper,
      )
      await flow.executeAll(data)
      expect(sends).toBe(1)
      expect(flow.status.value).toBe('error')
      if (error instanceof DeliveryUncertainError) {
        flow.reset()
        expect(helper.jobResultMaps.get('a').deliveryUncertain).toBe(true)
      }
    }
  })
  test('返回同一批/历史ID停止；正常筛选零成功不阻止新批次', async () => {
    const { helper, data } = fixture(['a'])
    let loads = 0,
      sends = 0
    const filter = defineTaskHandler(
      '筛选',
      () => async (_, d) =>
        d.jobData.key !== 'd'
          ? { isSkip: true, status: 'warn' as const, reason: '正常筛选' }
          : undefined,
    )()
    helper.loadMoreJob = async () => {
      const next = ['b', 'c', 'd', 'a'][loads++]
      if (!next) return false
      helper.jobList.value = [job(next)]
      data.set(next, { key: next })
      return true
    }
    const flow = await useDeliveryWorkflow([filter, sendTask(() => sends++)], helper)
    await flow.executeAll(data)
    expect(sends).toBe(1)
    expect(loads).toBe(4)
    expect(flow.summary.value.skipped).toBe(3)
    expect(flow.status.value).toBe('done')
  })
  test('onEnd动态返回钩子只跑一次，重复rebuild不积累after', async () => {
    const { helper, data } = fixture(['a'])
    let ends = 0,
      afters = 0
    const task = defineTaskHandler('步骤', () => ({
      fn: async () => {},
      after: [
        async () => {
          afters++
        },
      ],
      onEnd: async () => {
        ends++
      },
    }))()
    const flow = await useDeliveryWorkflow([task, sendTask()], helper)
    await flow.executeAll(data)
    flow.reset()
    helper.jobResultMaps.clear()
    await flow.executeAll(data)
    expect(ends).toBe(2)
    expect(afters).toBe(2)
  })
  test('频繁操作进入退避而不是立即发送下一条，暂停可中断等待', async () => {
    const { helper, data } = fixture()
    let sends = 0
    const flow = await useDeliveryWorkflow(
      [
        sendTask(() => {
          sends++
          throw new RateLimitError('频繁')
        }),
      ],
      helper,
    )
    const running = flow.executeAll(data)
    await until(() => flow.phase.value.includes('退避'))
    expect(flow.phase.value).toContain('退避')
    expect(flow.waitUntil.value).toBeGreaterThan(Date.now() + 50000)
    flow.stop()
    await running
    expect(sends).toBe(1)
    expect(flow.status.value).toBe('stop')
  })
})

describe('分页与等待边界', () => {
  test('最后响应有新岗位且hasMore=false，仍返回可处理', async () => {
    let page = { ids: ['a'], revision: 0, hasMore: true }
    expect(
      await loadNextPage({
        read: () => page,
        request: () => {
          page = { ids: ['b'], revision: 1, hasMore: false }
        },
        delay: Promise.resolve(),
        timeoutMs: 500,
      }),
    ).toBe(true)
  })
  test('已无更多岗位不发起翻页', async () => {
    let calls = 0
    expect(
      await loadNextPage({
        read: () => ({ ids: ['a'], revision: 1, hasMore: false }),
        request: () => calls++,
        delay: Promise.resolve(),
      }),
    ).toBe(false)
    expect(calls).toBe(0)
  })
  test('没有观察到响应时超时是异常，不声称到底', async () => {
    await expect(
      loadNextPage({
        read: () => ({ ids: ['a'], revision: 1, hasMore: true }),
        request: () => {},
        delay: Promise.resolve(),
        timeoutMs: 10,
      }),
    ).rejects.toThrow('加载超时')
  })
  test('本地等待可立即取消', async () => {
    const controller = new AbortController()
    const wait = waitForDelay(60000, controller.signal)
    controller.abort()
    await wait
  })
})

describe('发送边界：只用本地响应，不连接站点', () => {
  test('网络响应丢失不自动重发', async () => {
    Object.assign(window, { Cookie: { get: () => 'FAKE_TEST_TOKEN' } })
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      throw new Error('本地模拟断线')
    }) as typeof fetch
    const { sendPublishReq } = await import('../src/entrypoints/boss/requests')
    await expect(
      sendPublishReq({ securityId: 'FAKE_ID', encryptJobId: 'FAKE_JOB' }),
    ).rejects.toBeInstanceOf(DeliveryUncertainError)
    expect(calls).toBe(1)
  })
  test('限额/频繁反馈不在请求层连续重试', async () => {
    Object.assign(window, { Cookie: { get: () => 'FAKE_TEST_TOKEN' } })
    const { sendPublishReq } = await import('../src/entrypoints/boss/requests')
    for (const content of ['您今天已与150位BOSS沟通', '操作过于频繁']) {
      let calls = 0
      globalThis.fetch = (async () => {
        calls++
        return Response.json({ code: 1, message: content })
      }) as typeof fetch
      await expect(
        sendPublishReq({ securityId: 'FAKE_ID', encryptJobId: 'FAKE_JOB' }),
      ).rejects.toThrow(content)
      expect(calls).toBe(1)
    }
  })
  test('连续第二次频繁停止，退避时间不少于60秒', async () => {
    const original = globalThis.setTimeout
    const delays: number[] = []
    globalThis.setTimeout = ((fn: any, ms?: number, ...args: any[]) => {
      if ((ms ?? 0) >= 50000) delays.push(ms!)
      return original(fn, (ms ?? 0) >= 50000 ? 0 : ms, ...args)
    }) as typeof setTimeout
    try {
      const { helper, data } = fixture(['a', 'b', 'c'])
      let sends = 0
      const flow = await useDeliveryWorkflow(
        [
          sendTask(() => {
            sends++
            throw new RateLimitError('频繁')
          }),
        ],
        helper,
      )
      await flow.executeAll(data)
      expect(sends).toBe(2)
      expect(delays).toHaveLength(1)
      expect(delays[0]).toBeGreaterThanOrEqual(59900)
      expect(flow.status.value).toBe('error')
      expect(flow.endReason.value).toContain('连续两次')
    } finally {
      globalThis.setTimeout = original
    }
  })
})

describe('复核补充回归', () => {
  test('可解析但缺少结果的响应也标待核实', async () => {
    Object.assign(window, { Cookie: { get: () => 'FAKE_TEST_TOKEN' } })
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return Response.json({})
    }) as typeof fetch
    const { sendPublishReq } = await import('../src/entrypoints/boss/requests')
    await expect(
      sendPublishReq({ securityId: 'FAKE_ID', encryptJobId: 'FAKE_JOB' }),
    ).rejects.toBeInstanceOf(DeliveryUncertainError)
    expect(calls).toBe(1)
  })
  test('提醒确认期间暂停，不再发起后续默认招呼请求', async () => {
    Object.assign(window, { Cookie: { url: '', get: () => 'FAKE_TEST_TOKEN' } })
    let calls = 0,
      stopped = false
    globalThis.fetch = (async () => {
      calls++
      if (calls === 1)
        return Response.json({
          code: 1,
          zpData: {
            bizData: { chatRemindDialog: { content: '您今天已与120位BOSS沟通', ba: 'FAKE' } },
          },
        })
      stopped = true
      return Response.json({ code: 0 })
    }) as typeof fetch
    const { sendPublishReq } = await import('../src/entrypoints/boss/requests')
    await expect(
      sendPublishReq(
        { securityId: 'FAKE_ID', encryptJobId: 'FAKE_JOB' },
        undefined,
        3,
        {},
        () => stopped,
      ),
    ).rejects.toThrow('已暂停')
    expect(calls).toBe(2)
  })
  test('一个成功观察器失败不能截断其他去重记账', async () => {
    const { helper, data } = fixture(['a'])
    const records: string[] = []
    const first = defineTaskHandler('记录一', () => ({
      fn: async () => {},
      onDelivery: async () => {
        records.push('one')
        throw new Error('模拟存储故障')
      },
    }))()
    const second = defineTaskHandler('记录二', () => ({
      fn: async () => {},
      onDelivery: async () => {
        records.push('two')
      },
    }))()
    const flow = await useDeliveryWorkflow([first, second, sendTask()], helper)
    await flow.executeAll(data)
    expect(records).toEqual(['one', 'two'])
    expect(helper.jobResultMaps.get('a').deliveryConfirmed).toBe(true)
    expect(flow.status.value).toBe('error')
  })
  test('暂停等待尚未返回的分页，必须收尾后才返回', async () => {
    let page = { ids: ['a'], revision: 0, hasMore: true }
    const gate = deferred(),
      controller = new AbortController()
    let finished = false
    const loading = loadNextPage({
      read: () => page,
      request: () => gate.promise,
      delay: Promise.resolve(),
      signal: controller.signal,
      timeoutMs: 500,
    }).then((value) => {
      finished = true
      return value
    })
    controller.abort()
    await tick()
    expect(finished).toBe(false)
    page = { ids: ['a', 'b'], revision: 1, hasMore: true }
    gate.resolve()
    expect(await loading).toBe(false)
  })
  test('临时清空不能当到底；原地增加ID能完成等待', async () => {
    const page = { ids: ['a'], revision: 0, hasMore: true }
    const loading = loadNextPage({
      read: () => page,
      request: () => {
        page.ids = []
        page.revision++
        setTimeout(() => {
          page.ids.push('b')
        }, 150)
      },
      delay: Promise.resolve(),
      timeoutMs: 600,
    })
    expect(await loading).toBe(true)
  })
})
