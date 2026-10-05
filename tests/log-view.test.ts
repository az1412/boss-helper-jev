import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { logger } from '../packages/devlog-ui/src/core/logger'
import { LogPersistence } from '../packages/devlog-ui/src/core/persistence'
import { REDACTED, redactLogValue, redactText } from '../packages/devlog-ui/src/core/redaction'
import type { LogEvent } from '../packages/devlog-ui/src/core/types'
import {
  classifyLog,
  copyLogReason,
  exportBusinessLogs,
  filterBusinessLogs,
  latestLogRunId,
  paginateLogs,
  resolveLogLevel,
  toBusinessLog,
} from '../src/utils/logView'

// These deliberately fictional strings never touch real browser storage or credentials.
const secret = 'FAKE_CREDENTIAL_FOR_TEST_ONLY'
function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    id: `fixture-${Math.random()}`,
    timestamp: 1,
    level: 'info',
    message: '运行开始',
    data: [],
    source: { file: 'fixture.ts', line: 1 },
    sessionId: 'fixture-session',
    ...overrides,
  }
}

beforeEach(() => {
  // This singleton only exists in the isolated Bun process and contains synthetic fixtures.
  logger.clear()
  logger.clearGlobalContext()
  logger.configure({ minLevel: 'info', enabled: true, maxLogs: 2000 })
})

describe('log redaction', () => {
  test('redacts nested key variants without mutating caller objects or job identifiers', () => {
    const input = {
      token: secret,
      nested: [
        {
          apiKey: secret,
          Authorization: `Bearer ${secret}`,
          'X-API-Key': secret,
          api_key: secret,
          Cookie: secret,
          password: secret,
          securityId: secret,
          private_key: secret,
          clientSecret: secret,
          access_token: secret,
          key: secret,
          bst: secret,
        },
      ],
      job_key: 'job-1',
      jobName: '测试岗位',
    }
    const clone = redactLogValue(input) as typeof input
    expect(JSON.stringify(clone)).not.toContain(secret)
    expect(clone.token).toBe(REDACTED)
    expect(clone.job_key).toBe('job-1')
    expect(input.nested[0]?.apiKey).toBe(secret)
  })

  test('covers URLs, encoded query keys, userinfo, Bearer, cookies and JSON fragments', () => {
    const samples = [
      `https://example.invalid/path?token=${secret}&page=2#securityId=${secret}`,
      `https://${secret}:${secret}@example.invalid/path?api%4Bey=${secret}`,
      `request failed: Bearer ${secret}`,
      `Authorization: Bearer%20${secret}`,
      `Cookie: arbitrary=${secret}; another=${secret}`,
      `{"apiKey":"${secret}","nested":{"securityId":"${secret}"}}`,
      `failed: password='${secret}'`,
      `api_key=${secret}&page=2`,
      `failed: {"token":{"value":"${secret}"}}`,
      `{"cookie":"${secret}","page":2}`,
      String.raw`failed: {\"apiKey\":\"${secret}\"}`,
      `failed: {"auth":["${secret}"]}`,
    ]
    for (const sample of samples) {
      const redacted = redactText(sample)
      expect(redacted).not.toContain(secret)
      expect(redactText(redacted)).toBe(redacted)
    }
  })

  test('message, error stack/cause, context and subscribers receive only redacted copies', () => {
    const received: LogEvent[] = []
    const unsubscribe = logger.subscribe((log) => received.push(log))
    const error = new Error(`GET https://example.invalid/?securityId=${secret}`)
    error.stack = `Error: Bearer ${secret}\n at fixture (https://example.invalid/?apiKey=${secret})`
    ;(error as Error & { cause: unknown }).cause = { token: secret }
    logger.setGlobalContext({ authorization: secret })
    logger
      .withContext({ runId: 'run-1', token: secret })
      .info(`failure token=${secret}`, { nested: error })
    unsubscribe()
    const log = logger.getLogs()[0]!
    expect(JSON.stringify(log)).not.toContain(secret)
    expect(JSON.stringify(received)).not.toContain(secret)
    expect(JSON.stringify(logger.getGlobalContext())).not.toContain(secret)
    expect(log.context?.runId).toBe('run-1')
    expect(error.message).toContain(secret)
  })

  test('keeps circular-reference protection and never calls secret-bearing getters', () => {
    const circular: Record<string, unknown> = { token: secret }
    circular.self = circular
    Object.defineProperty(circular, 'password', {
      enumerable: true,
      get() {
        throw new Error('must not read')
      },
    })
    const clone = redactLogValue(circular) as Record<string, unknown>
    expect(clone.self).toBe('[Circular Reference]')
    expect(clone.password).toBe(REDACTED)
    expect(() => logger.info('cyclic', circular)).not.toThrow()
    expect(logger.exportLogs()).not.toContain(secret)
  })

  test('handles serialized config, URLSearchParams, Headers, maps, Error cycles and BigInt', () => {
    const error = new Error('synthetic')
    ;(error as Error & { cause: unknown }).cause = error
    logger.info(
      'special cases',
      JSON.stringify({ apiKey: secret }),
      new URLSearchParams({ token: secret }),
      new Headers({ authorization: `Bearer ${secret}` }),
      new Map([['apiKey', secret]]),
      new Set([`Bearer ${secret}`]),
      error,
      1n,
    )
    const json = logger.exportLogs()
    expect(json).not.toContain(secret)
    expect(json).toContain('[Circular Reference]')
    expect(JSON.parse(json)).toHaveLength(1)
  })

  test('span names and contexts, and logged diff values are redacted', () => {
    const span = logger.withContext({ apiKey: secret }).span(`request token=${secret}`)
    span.info('hello')
    span.end()
    logger.diff('config changed', { apiKey: secret }, { apiKey: 'ANOTHER_FAKE_KEY' })
    expect(JSON.stringify(logger.getSpans())).not.toContain(secret)
    expect(logger.exportLogs()).not.toContain(secret)
    expect(logger.exportLogs()).not.toContain('ANOTHER_FAKE_KEY')
  })

  test('recovery preserves historical ids/order and sanitizes without mutating imported history', () => {
    const history = event({
      id: 'old',
      level: 'warn',
      message: '投递成功: 测试岗位',
      data: [{ token: secret }],
      context: { apiKey: secret },
    })
    logger.info('new')
    logger.importLogs([history])
    logger.importLogs([history])
    expect(logger.getLogs()).toHaveLength(2)
    expect(logger.getLogs()[0]?.id).toBe('old')
    expect(logger.getLogs()[0]?.level).toBe('warn')
    expect(JSON.stringify(logger.getLogs())).not.toContain(secret)
    expect(JSON.stringify(history)).toContain(secret)
    expect(logger.exportLogs({ format: 'text' })).not.toContain(secret)
  })

  test('export defensively re-redacts legacy/mutated records and supports exact empty selections', () => {
    logger.info('safe')
    // Emulate an older integration mutating an exposed event after capture.
    logger.getLogs()[0]!.data.push({ apiKey: secret })
    expect(logger.exportLogs()).not.toContain(secret)
    expect(logger.exportLogs({ format: 'text' })).not.toContain(secret)
    expect(JSON.parse(logger.exportLogs({ ids: [] }))).toEqual([])
  })
})

describe('business log view', () => {
  test('defaults to info and validates explicit overrides', () => {
    for (const input of [null, undefined, '', 'verbose', '__proto__', 'INFO'])
      expect(resolveLogLevel(input)).toBe('info')
    for (const input of ['debug', 'info', 'warn', 'error'] as const)
      expect(resolveLogLevel(input)).toBe(input)
    logger.configure({ minLevel: 'wrong' as 'info' })
    expect(logger.getConfig().minLevel).toBe('info')
    logger.debug('not collected')
    logger.withContext({ event: 'success' }).info('投递成功: 测试岗位')
    expect(logger.getLogs()).toHaveLength(1)
  })

  test('event classification takes priority, with compatible historical success/warn', () => {
    expect(classifyLog(event({ level: 'warn', message: '投递成功: 测试岗位' }))).toBe('success')
    expect(classifyLog(event({ level: 'warn', message: '投递过滤: 测试岗位' }))).toBe('skipped')
    expect(classifyLog(event({ level: 'warn', message: '准备运行' }))).toBe('run')
    expect(
      classifyLog(event({ message: '默认招呼已发送，后续步骤失败', context: { event: 'error' } })),
    ).toBe('error')
    expect(classifyLog(event({ message: '默认招呼已发送，后续步骤失败' }))).toBe('error')
    expect(classifyLog(event({ message: '上轮异常结束', context: { event: 'run' } }))).toBe('run')
    expect(classifyLog(event({ context: { event: 'message' } }))).toBe('run')
  })

  test('filters run/category/search without changing source logs and excludes untagged history from 本轮', () => {
    const rows = [
      event({ id: 'history', message: '投递成功: 历史岗位' }),
      event({ id: 'old-run', context: { runId: 'one', event: 'success' } }),
      event({
        id: 'current',
        message: '投递过滤: 测试工程师',
        data: ['地点不符合'],
        context: { runId: 'two', event: 'skipped', job_key: 'job-2', job_name: '测试工程师' },
      }),
      event({ id: 'error', message: '请求失败', context: { runId: 'two', event: 'error' } }),
    ].map(toBusinessLog)
    expect(latestLogRunId(rows)).toBe('two')
    expect(
      filterBusinessLogs(rows, { scope: 'current', runId: 'two', category: 'all' }),
    ).toHaveLength(2)
    const selected = filterBusinessLogs(rows, {
      scope: 'current',
      runId: 'two',
      category: 'skipped',
      search: '地点',
    })
    expect(selected.map((row) => row.id)).toEqual(['current'])
    expect(filterBusinessLogs(rows, { scope: 'current', category: 'all' })).toHaveLength(0)
    expect(filterBusinessLogs(rows, { scope: 'all', category: 'success' })).toHaveLength(2)
    expect(rows).toHaveLength(4)
    expect(copyLogReason(selected[0]!)).toContain('地点不符合')
  })

  test('summarizes reasons without expanding config/resume/request objects or sent text', () => {
    const row = toBusinessLog(
      event({
        message: '配置已加载',
        data: [{ resume: 'PRIVATE_FAKE_RESUME' }, 'PRIVATE_FAKE_TEXT'],
      }),
    )
    expect(row.reason).toBe('配置已加载')
    const sent = toBusinessLog(event({ message: '发送消息', data: ['PRIVATE_FAKE_GREETING'] }))
    expect(sent.reason).toBe('发送消息')
    const reason = toBusinessLog(
      event({ message: '请求失败', level: 'error', data: [new Error(`Bearer ${secret}`)] }),
    )
    expect(copyLogReason(reason)).not.toContain(secret)
    expect(reason.reason).toContain(REDACTED)
  })

  test('clamps rendering to 200 and exports all filtered pages rather than only the rendered page', () => {
    const fixtures = Array.from({ length: 450 }, (_, index) =>
      event({ id: `row-${index}`, context: { event: index % 2 ? 'success' : 'skipped' } }),
    )
    logger.importLogs(fixtures)
    const rows = logger.getLogs().map(toBusinessLog)
    const selected = filterBusinessLogs(rows, { scope: 'all', category: 'success' })
    expect(paginateLogs(rows, 1, 500).items).toHaveLength(200)
    expect(paginateLogs(rows, 99, 200).page).toBe(3)
    expect(paginateLogs(rows, -1, 50).page).toBe(1)
    expect(JSON.parse(exportBusinessLogs(logger, selected))).toHaveLength(225)
    expect(JSON.parse(exportBusinessLogs(logger))).toHaveLength(450)
    expect(JSON.parse(exportBusinessLogs(logger, []))).toHaveLength(0)
  })

  test('keeps the latest 2000 entries after recovery/rotation', () => {
    logger.importLogs(Array.from({ length: 2001 }, (_, index) => event({ id: `history-${index}` })))
    expect(logger.getLogs()).toHaveLength(2000)
    expect(logger.getLogs()[0]?.id).toBe('history-1')
  })
})

describe('real persistence API with fake browser storage', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  afterEach(() => {
    LogPersistence.disable()
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  test('rehydration leaves existing storage intact; subsequent persistence stores redacted old and new logs', async () => {
    const stored = new Map<string, string>()
    const history = JSON.stringify([event({ id: 'persisted-history', data: [{ apiKey: secret }] })])
    stored.set('devlogger_persisted_logs', history)
    stored.set('unrelated-user-record', 'KEEP_THIS_SYNTHETIC_RECORD')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { addEventListener() {}, removeEventListener() {} },
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    })
    LogPersistence.enable({ storage: 'local', maxPersisted: 2000, debounceMs: 1 })
    expect(LogPersistence.rehydrate()).toBe(1)
    expect(stored.get('devlogger_persisted_logs')).toBe(history)
    logger.info(`Bearer ${secret}`, { token: secret })
    await Bun.sleep(20)
    const persisted = stored.get('devlogger_persisted_logs')!
    expect(persisted).not.toContain(secret)
    expect(JSON.parse(persisted)).toHaveLength(2)
    expect(JSON.parse(persisted)[0].id).toBe('persisted-history')
    expect(stored.get('unrelated-user-record')).toBe('KEEP_THIS_SYNTHETIC_RECORD')
  })
})
