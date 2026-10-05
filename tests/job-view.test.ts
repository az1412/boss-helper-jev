import { describe, expect, test } from 'bun:test'

import type { JobData } from '../src/composables/useHelper/type'
import type { Statistics } from '../src/types/formData'
import {
  filterJobView,
  getJobReason,
  getJobViewStatus,
  horizontalWheelDelta,
  localDateKey,
  statisticsForDays,
} from '../src/utils/jobView'
import type { JobViewResult } from '../src/utils/jobView'

function job(key: string, jobName = key, company = '示例公司'): JobData {
  return {
    key,
    jobName,
    positionName: jobName,
    jobDescription: '',
    experienceName: '',
    degreeName: '',
    salary: '',
    showSkills: [],
    jobLabels: [],
    skills: [],
    boss: { name: '', title: '', avatar: '', certificated: false },
    brand: { name: company, logo: '', scale: '', industry: '', introduce: '', labels: [] },
  }
}
function day(date: string, success: number): Statistics {
  return { date, success, total: success, repeat: 0, activityFilter: 0, tasks: {} }
}

describe('岗位分类不依赖任务 id', () => {
  test('没有 id 的成功、预判跳过和异常分别归类', () => {
    expect(getJobViewStatus({ status: 'success' })).toBe('success')
    expect(getJobViewStatus({ status: 'warn', reason: '不符合要求' })).toBe('skipped')
    expect(getJobViewStatus({ status: 'error' })).toBe('error')
  })
  test('发送已确认，即使后续任务异常也保留成功', () => {
    expect(getJobViewStatus({ status: 'error', deliveryConfirmed: true })).toBe('success')
    expect(getJobViewStatus({ status: 'ai', deliveryConfirmed: true })).toBe('success')
    expect(getJobViewStatus({ deliveryConfirmed: true })).toBe('success')
  })
  test('执行、请求、AI 均归入处理中', () => {
    for (const status of ['running', 'request', 'ai'] as const) {
      expect(getJobViewStatus({ status })).toBe('running')
    }
  })
  test('未开始和等待归待处理，未知的任务 id 不改变状态', () => {
    expect(getJobViewStatus()).toBe('pending')
    expect(getJobViewStatus({ status: 'pending', id: 'filter' })).toBe('pending')
    expect(getJobViewStatus({ status: 'wait' })).toBe('pending')
  })
  test('同时保留状态消息和判定原因，并去掉重复文本', () => {
    expect(getJobReason({ msg: '默认招呼已发送', reason: '追加消息失败' })).toBe(
      '默认招呼已发送\n追加消息失败',
    )
    expect(getJobReason({ msg: ' 相同原因 ', reason: '相同原因' })).toBe('相同原因')
    expect(getJobReason()).toBe('')
  })
})

describe('视图筛选独立于真实执行队列', () => {
  test('保留原顺序、按岗位去重；不修改数组或结果', () => {
    const first = job('a')
    const jobs = Object.freeze([first, job('b'), job('a'), job('c')])
    const results = new Map<string, JobViewResult>([
      ['a', { status: 'success' }],
      ['b', { status: 'warn' }],
    ])
    const before = JSON.stringify([...results])
    expect(filterJobView(jobs, results).map((item) => item.key)).toEqual(['a', 'b', 'c'])
    expect(filterJobView(jobs, results)[0]).toBe(first)
    expect(filterJobView(jobs, results, 'skipped').map((item) => item.key)).toEqual(['b'])
    expect(filterJobView(jobs, results, 'pending').map((item) => item.key)).toEqual(['c'])
    expect(jobs.length).toBe(4)
    expect(JSON.stringify([...results])).toBe(before)
  })
  test('岗位名和公司关键词均可查找，忽略首尾空白与大小写', () => {
    const jobs = [job('a', 'Vue 工程师', '甲公司'), job('b', '机械工程师', 'Beta 招聘')]
    expect(filterJobView(jobs, new Map(), 'all', ' vue ').map((item) => item.key)).toEqual(['a'])
    expect(filterJobView(jobs, new Map(), 'all', 'BETA').map((item) => item.key)).toEqual(['b'])
  })
  test('状态与关键词取交集；清除筛选后完整队列仍在', () => {
    const jobs = [job('a', '研发'), job('b', '研发')]
    const results = new Map<string, JobViewResult>([
      ['a', { status: 'success' }],
      ['b', { status: 'error' }],
    ])
    expect(filterJobView(jobs, results, 'success', '研发').map((item) => item.key)).toEqual(['a'])
    expect(filterJobView(jobs, results, 'pending', '研发')).toEqual([])
    expect(filterJobView(jobs, results)).toHaveLength(2)
  })
  test('后续步骤失败但发送确认的岗位仍在已发送视图', () => {
    const jobs = [job('a')]
    const results = new Map<string, JobViewResult>([
      ['a', { status: 'error', deliveryConfirmed: true }],
    ])
    expect(filterJobView(jobs, results, 'success')).toHaveLength(1)
    expect(filterJobView(jobs, results, 'error')).toHaveLength(0)
  })
})

describe('滚轮交互边界', () => {
  const wheel = {
    deltaX: 0,
    deltaY: 80,
    deltaMode: 0,
    ctrlKey: false,
    innerVertical: false,
    scrollLeft: 200,
    scrollWidth: 1000,
    clientWidth: 400,
  }
  test('有余量时将垂直滚轮转换为横移', () => {
    expect(horizontalWheelDelta(wheel)).toBe(80)
    expect(horizontalWheelDelta({ ...wheel, deltaY: -80 })).toBe(-80)
  })
  test('向左或向右到边界时透传，不吃掉页面滚动', () => {
    expect(horizontalWheelDelta({ ...wheel, scrollLeft: 0, deltaY: -80 })).toBe(0)
    expect(horizontalWheelDelta({ ...wheel, scrollLeft: 600 })).toBe(0)
    expect(horizontalWheelDelta({ ...wheel, scrollWidth: 400, scrollLeft: 0 })).toBe(0)
  })
  test('保留触控板原生横向、缩放及卡片内部纵向滚动', () => {
    expect(horizontalWheelDelta({ ...wheel, deltaX: 0.5 })).toBe(0)
    expect(horizontalWheelDelta({ ...wheel, ctrlKey: true })).toBe(0)
    expect(horizontalWheelDelta({ ...wheel, innerVertical: true })).toBe(0)
  })
  test('兼容按行/按页的滚轮，横移不会越过边界', () => {
    expect(horizontalWheelDelta({ ...wheel, deltaY: 2, deltaMode: 1 })).toBe(32)
    expect(horizontalWheelDelta({ ...wheel, deltaY: 1, deltaMode: 2 })).toBe(400)
    expect(horizontalWheelDelta({ ...wheel, deltaY: 900 })).toBe(400)
    expect(horizontalWheelDelta({ ...wheel, deltaY: -900 })).toBe(-200)
  })
})

describe('按日期而不是记录条数统计', () => {
  const now = new Date(2026, 8, 28, 14, 0)
  test('近7天含今天和6天前，不含更早或未来', () => {
    const rows = statisticsForDays(
      [day('2026-09-27', 2), day('2026-09-22', 3), day('2026-09-21', 99), day('2026-09-29', 99)],
      day('2026-09-28', 1),
      7,
      now,
    )
    expect(rows.map((row) => row.date)).toEqual(['2026-09-28', '2026-09-27', '2026-09-22'])
    expect(rows.reduce((sum, row) => sum + row.success, 0)).toBe(6)
  })
  test('缺失日期不造零，乱序历史按实际日期处理', () => {
    const history = [day('2026-08-01', 5), day('2026-09-23', 6), day('2026-09-27', 7)]
    const original = JSON.stringify(history)
    expect(statisticsForDays(history, day('2026-09-28', 1), 7, now)).toHaveLength(3)
    expect(JSON.stringify(history)).toBe(original)
  })
  test('当前日期快照替代同日历史；重复日期只计一次', () => {
    const rows = statisticsForDays(
      [day('2026-09-28', 999), day('2026-09-27', 2), day('2026-09-27', 5)],
      day('2026-09-28', 1),
      7,
      now,
    )
    expect(rows.map((row) => row.success)).toEqual([1, 2])
  })
  test('过期的当前快照不冒充今天，也不重复计入历史', () => {
    expect(statisticsForDays([], day('2026-09-01', 8), 7, now)).toEqual([])
    expect(statisticsForDays([day('2026-09-01', 8)], day('2026-09-01', 8), null, now)).toHaveLength(
      1,
    )
  })
  test('排除非法日期，历史范围保留有效旧记录', () => {
    const rows = statisticsForDays(
      [day('2026-02-30', 99), day('invalid', 99), day('2026-2-02', 99), day('2020-01-01', 4)],
      day('2026-09-28', 1),
      null,
      now,
    )
    expect(rows.map((row) => row.date)).toEqual(['2026-09-28', '2020-01-01'])
  })
  test('跨月、跨年依本地自然日计算', () => {
    const year = new Date(2026, 0, 3, 23, 59)
    expect(localDateKey(year)).toBe('2026-01-03')
    expect(
      statisticsForDays(
        [day('2025-12-28', 2), day('2025-12-27', 3)],
        day('2026-01-03', 1),
        7,
        year,
      ).map((row) => row.date),
    ).toEqual(['2026-01-03', '2025-12-28'])
  })
})
