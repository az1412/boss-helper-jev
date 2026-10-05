import { beforeEach, expect, mock, test } from 'bun:test'
Object.assign(globalThis, { useToast: () => ({ add() {} }) })
const values = new Map<string, any>()
mock.module('@/message', () => ({
  counter: {
    storageGet: async (key: string, fallback: unknown) =>
      structuredClone(values.get(key) ?? fallback),
    storageSet: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value))
    },
  },
}))
const { TaskRegistry } = await import('../src/composables/useApplying/handles')
const { sameCompanyKey, sameHrKey } = await import('../src/entrypoints/boss/requests')
const { useStatistics, todayKey, statisticsKey } = await import('../src/composables/useStatistics')
beforeEach(() => values.clear())
const tasks = new TaskRegistry<any, any>()
function ctx() {
  return {
    helper: {
      uid: 'test-user',
      conf: {
        formData: {
          sameCompanyFilter: { value: true, expire: 0 },
          sameHrFilter: { value: true, expire: 0 },
        },
      },
      statistics: { todayData: { value: { repeat: 0 } } },
    },
  } as any
}
const data = (key: string, company: string, hr: string) =>
  ({ jobData: { key, brand: { id: company }, boss: { id: hr } } }) as any
test('同公司不同岗位被拦截，其他公司仍可投；保留旧岗位记录', async () => {
  values.set(sameCompanyKey, { 'test-user': { old: 1 } })
  const context = ctx()
  const handler: any = await tasks.SameCompanyFilter().task(context)
  await handler.onDelivery(context, data('a', 'company-a', 'hr-a'))
  expect((await handler.fn(context, data('b', 'company-a', 'hr-b'))).isSkip).toBe(true)
  expect(await handler.fn(context, data('c', 'company-b', 'hr-a'))).toBeUndefined()
  expect((await handler.fn(context, data('old', 'company-old', 'hr-old'))).isSkip).toBe(true)
  expect(values.get(sameCompanyKey)['test-user'].old).toBe(1)
})
test('同 HR 不同岗位被拦截，不把公司或姓名当作 HR 标识', async () => {
  const context = ctx()
  const handler: any = await tasks.SameHrFilter().task(context)
  await handler.onDelivery(context, data('a', 'company-a', 'hr-a'))
  expect((await handler.fn(context, data('b', 'company-b', 'hr-a'))).isSkip).toBe(true)
  expect(await handler.fn(context, data('c', 'company-a', 'hr-b'))).toBeUndefined()
  expect(Object.keys(values.get(sameHrKey)['test-user'])).toContain('hr:hr-a')
})
test('缺失公司与 HR 标识时不把无关岗位互相去重', async () => {
  for (const task of [tasks.SameCompanyFilter(), tasks.SameHrFilter()]) {
    const context = ctx()
    const handler: any = await task.task(context)
    await handler.onDelivery(context, data('a', '', ''))
    expect(await handler.fn(context, data('b', '', ''))).toBeUndefined()
    expect((await handler.fn(context, data('a', '', ''))).isSkip).toBe(true)
  }
})

test('未运行标签页不能覆盖成功计数，接手前重新读取', async () => {
  const active = useStatistics()
  const inactive = useStatistics()
  await active.updateStatistics()
  await inactive.updateStatistics()
  active.beginRecording()
  active.todayData.value.success = 1
  await active.flush()
  await inactive.flush()
  await inactive.endRecording()
  expect(values.get(todayKey).success).toBe(1)
  await active.endRecording()
  await inactive.updateStatistics()
  inactive.beginRecording()
  inactive.todayData.value.success++
  await inactive.endRecording()
  expect(values.get(todayKey).success).toBe(2)
})

test('下一次开始时归档旧日记录，重读不会重复归档', async () => {
  const stats = useStatistics()
  const old = {
    ...JSON.parse(JSON.stringify(stats.todayData.value)),
    date: '2000-01-01',
    success: 37,
  }
  values.set(todayKey, old)
  await stats.updateStatistics()
  expect(stats.todayData.value.success).toBe(0)
  stats.beginRecording()
  await stats.endRecording()
  await stats.updateStatistics()
  expect(values.get(statisticsKey)).toEqual([old])
  expect(stats.statisticsData.value).toHaveLength(1)
})
