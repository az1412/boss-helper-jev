import { mock } from 'bun:test'
/**
 * Offline scheduler comparison; runs the pinned upstream workflow, not a rewrite.
 * Model/website responses and time are controlled. No network or account access.
 * Usage: bun scripts/benchmark-workflow.ts
 */
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { setImmediate as realImmediate, setTimeout as realTimeout } from 'node:timers'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { computed, reactive, ref } from 'vue'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = '09df246399bd4edd4a1e35793bfe028e23578330'
const sourcePath = 'src/composables/useApplying/index.ts'
let original: string
try {
  original = execFileSync('git', ['show', `${baseline}:${sourcePath}`], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  original = await readFile(resolve(root, 'tests/support/upstream-workflow-09df246.txt'), 'utf8')
}
assert.equal(createHash('sha256').update(original).digest('hex'), 'd5cf2703859a96f60658a5f3dee9c481f258e138a5335bb329cf93fda16f0aa4', 'Pinned upstream snapshot has changed')
const baselineFile = resolve(root, 'local/benchmark-upstream-09df246.ts')
await mkdir(dirname(baselineFile), { recursive: true })
// Only relocate runtime relative imports. The workflow body stays unchanged.
const relocated = original
  .replaceAll("from './handles'", "from '@/composables/useApplying/handles'")
  .replaceAll("from './type'", "from '@/composables/useApplying/type'")
assert.notEqual(original, relocated)
await writeFile(baselineFile, relocated)

const fixture = JSON.parse(
  await readFile(resolve(root, 'tests/support/workflow-benchmark-fixture.json'), 'utf8'),
) as {
  batches: string[]
  observedSeconds: number
  observedOverlapSpanSeconds: number
}
type Outcome = 'b' | 'j' | 's'
type Latency = { detail: number; model: number; send: number; greeting: number }
let responseOutcomes = new Map<string, Outcome>()
let latency: Latency = { detail: 0, model: 0, send: 0, greeting: 0 }
let modelCalls = 0
const logger: any = { withContext: () => logger, info() {}, debug() {}, warn() {}, error() {} }
const storage = { getItem: () => null, setItem() {}, removeItem() {} }
Object.assign(globalThis, {
  computed,
  logger,
  jsonClone: (value: unknown) => JSON.parse(JSON.stringify(value)),
  alert: (message: string) => {
    throw new Error(message)
  },
  useToast: () => ({ add() {} }),
  window: { addEventListener() {}, removeEventListener() {} },
  localStorage: storage,
  sessionStorage: storage,
  fetch: () => {
    throw new Error('Benchmark forbids network')
  },
})
mock.module('@/utils/logger', () => ({ logger }))
// CPU cost is excluded from this scheduler benchmark. Keep SHA-256 results exact,
// but complete hashing in a microtask so a worker-pool callback cannot race virtual timers.
Object.defineProperty(crypto.subtle, 'digest', {
  configurable: true,
  value: async (algorithm: string, data: ArrayBuffer | ArrayBufferView) => {
    assert.equal(algorithm, 'SHA-256')
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data)
    return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer
  },
})
mock.module('@/composables/useModel/typesafe', () => ({
  async jevSystemOne(request: { state: string }) {
    modelCalls++
    await sleep(latency.model)
    const id = request.state.match(/bench-\d+/)?.[0]
    assert.ok(id && responseOutcomes.has(id), 'Unknown synthetic model input')
    return { answers: { fit: { type: 'score', score: responseOutcomes.get(id) === 's' ? 4 : 1 } } }
  },
}))
const { useDeliveryWorkflow: upstreamWorkflow } = await import(pathToFileURL(baselineFile).href)
const { useDeliveryWorkflow: currentWorkflow } = await import('../src/composables/useApplying')
const { TaskRegistry } = await import('../src/composables/useApplying/handles')
const { defineTaskHandler } = await import('../src/composables/useApplying/type')

function sleep(ms: number) {
  return new Promise<void>((done) => setTimeout(done, ms))
}

// Virtual time preserves full configured 3/5/60-second delays without waiting hours.
// Flush every Promise continuation before advancing to the next pending timer.
class Clock {
  now = 0
  sequence = 0
  timers = new Map<number, { due: number; callback: () => void }>()
  async run(action: () => Promise<void>) {
    const saved = {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      now: Date.now,
    }
    Object.assign(globalThis, {
      setTimeout: (callback: () => void, ms = 0) => {
        const id = ++this.sequence
        this.timers.set(id, { due: this.now + Math.max(0, ms), callback })
        return id
      },
      clearTimeout: (id: number) => this.timers.delete(id),
      // Upstream WXT global; its visual loader is a DOM boundary, not timed here.
      delay: async (seconds: number) => sleep(seconds * 1000),
    })
    Date.now = () => 1_700_000_000_000 + this.now
    let finished = false,
      failure: unknown,
      idle = 0
    try {
      void action().then(
        () => {
          finished = true
        },
        (error) => {
          failure = error
          finished = true
        },
      )
      for (let step = 0; !finished; step++) {
        assert.ok(step < 100_000, 'Virtual clock did not converge')
        await new Promise<void>((done) => realImmediate(done))
        if (finished) break
        const next = [...this.timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
        if (!next) {
          // WebCrypto hashing uses the worker pool; allow its completion without advancing simulated time.
          assert.ok(++idle < 2000, 'Workflow is blocked outside the controlled boundaries')
          await new Promise<void>((done) => realTimeout(done, 1))
          continue
        }
        idle = 0
        this.timers.delete(next[0])
        this.now = next[1].due
        next[1].callback()
      }
      if (failure) throw failure
      return this.now
    } finally {
      globalThis.setTimeout = saved.setTimeout
      globalThis.clearTimeout = saved.clearTimeout
      Date.now = saved.now
      this.timers.clear()
    }
  }
}

async function measure(
  version: 'upstream' | 'fast' | 'sorted',
  batches: string[],
  delays: Latency,
) {
  latency = delays
  modelCalls = 0
  responseOutcomes = new Map()
  let seq = 0,
    page = 0,
    sends = 0,
    activeSends = 0,
    maxActiveSends = 0
  const sendTimes: number[] = []
  assert.ok(batches.every((codes) => /^[bjs]+$/.test(codes)))
  const jobs = batches.map((codes) =>
    codes.split('').map((code) => {
      const key = `bench-${seq++}`
      responseOutcomes.set(key, code as Outcome)
      return {
        key,
        jobName: key,
        jobDescription: '',
        brand: { name: 'Synthetic' },
        skills: [],
        welfareList: [],
        jobLabels: [],
      }
    }),
  )
  const helper: any = {
    jobList: ref(jobs[0]),
    jobMaps: new Map(),
    jobResultMaps: reactive(new Map()),
    currentJob: ref(null),
    statistics: { todayData: ref({ success: 0, total: 0, tasks: {} }) },
    conf: {
      formData: {
        deliveryLimit: { value: 150 },
        runDeliveryLimit: 150,
        delayDeliveryStarts: 3,
        delayDeliveryInterval: 5,
        delayDeliveryPageNext: 60,
        jev: {
          enable: version !== 'upstream',
          mode: version === 'sorted' ? 'sorted' : 'fast',
          apiKey: 'OFFLINE_TEST',
        },
        profile: { targetJob: '', resume: '', want: '', avoid: '', strictness: 'normal' },
        aiFiltering: { enable: true, score: 10 },
        jobContent: { enable: true, include: false, value: ['offline-block'] },
      },
      beginRun() {},
      endRun() {},
    },
    chatModel: {
      createAgent: () => true,
      async chat(_kind: string, data: any) {
        modelCalls++
        await sleep(latency.model)
        const score = responseOutcomes.get(data.jobData.key) === 's' ? 20 : 0
        return {
          text: JSON.stringify({ positive: [{ reason: 'Synthetic', score }], negative: [] }),
        }
      },
    },
    notification: async () => {},
    async loadMoreJob(delay: Promise<void>) {
      // Same pagination boundary for both versions; exhausted list returns immediately.
      if (page + 1 >= jobs.length) return false
      await delay
      helper.jobList.value = jobs[++page]
      return true
    },
  }
  const registry = new TaskRegistry<any, any>()
  const details = defineTaskHandler('岗位详情获取', () => async (_, data) => {
    await sleep(latency.detail)
    data.jobData.jobDescription =
      responseOutcomes.get(data.jobData.key) === 'b' ? 'offline-block' : 'Synthetic full-time role'
  })()
  const send = defineTaskHandler(
    '发送',
    () => async () => {
      maxActiveSends = Math.max(maxActiveSends, ++activeSends)
      sendTimes.push(Date.now())
      await sleep(latency.send)
      activeSends--
      sends++
      return { status: 'success' as const }
    },
    { confirmsDelivery: true },
  )()
  const greeting = defineTaskHandler('追加消息', () => async () => {
    await sleep(latency.greeting)
  })()
  const tasks = [details, registry.jobContent(), registry.aiFiltering(), send, greeting]
  const create = version === 'upstream' ? upstreamWorkflow : currentWorkflow
  const flow = await create(tasks, helper)
  const raw = new Map([...responseOutcomes.keys()].map((key) => [key, { key }]))
  const clock = new Clock()
  const elapsedMs = await clock.run(() => flow.executeAll(raw))
  const codes = batches.join('')
  assert.equal(sends, codes.split('').filter((c) => c === 's').length)
  assert.equal(helper.statistics.todayData.value.success, sends)
  assert.equal(modelCalls, codes.split('').filter((c) => c !== 'b').length)
  assert.equal(helper.jobResultMaps.size, codes.length)
  assert.equal(
    [...helper.jobResultMaps.values()].filter((v: any) => v.status === 'warn').length,
    codes.length - sends,
  )
  assert.ok(maxActiveSends <= 1)
  const intervals = sendTimes.slice(1).map((t, i) => t - sendTimes[i]!)
  assert.ok(intervals.every((ms) => ms >= 5000))
  return {
    version,
    seconds: elapsedMs / 1000,
    sends,
    rejected: codes.length - sends,
    modelCalls,
    maxActiveSends,
    minSendIntervalSeconds: intervals.length ? Math.min(...intervals) / 1000 : null,
  }
}

const scenarios = [
  {
    name: 'trace-fixed-waits-only',
    batches: fixture.batches,
    latency: { detail: 0, model: 0, send: 0, greeting: 0 },
  },
  {
    name: 'trace-controlled-latency',
    batches: fixture.batches,
    latency: { detail: 200, model: 1000, send: 300, greeting: 10000 },
  },
  {
    name: 'all-pass-control',
    batches: ['s'.repeat(100)],
    latency: { detail: 0, model: 0, send: 0, greeting: 0 },
  },
]
assert.equal(
  await new Clock().run(async () => {
    await sleep(1000)
    await sleep(2000)
  }),
  3000,
)
assert.equal(
  await new Clock().run(async () => {
    await Promise.all([sleep(1000), sleep(2000)])
  }),
  2000,
)
const results = []
for (const scenario of scenarios) {
  const measured = []
  for (const version of ['upstream', 'fast', 'sorted'] as const)
    measured.push(await measure(version, scenario.batches, scenario.latency))
  results.push({ scenario: scenario.name, latencyMs: scenario.latency, measured })
}
assert.equal(results[0]!.measured[0]!.seconds - results[0]!.measured[1]!.seconds, 279 * 5)
assert.equal(results[2]!.measured[0]!.seconds, results[2]!.measured[1]!.seconds)
const fixedSavings = 279 * 5
const inferredBaseline = fixture.observedSeconds + fixedSavings
const output = {
  kind: 'offline controlled virtual-clock scheduler benchmark; not live upstream A/B',
  baseline,
  baselineWorkflowSha256: createHash('sha256').update(original).digest('hex'),
  currentWorkflowSha256: createHash('sha256')
    .update(await readFile(resolve(root, sourcePath)))
    .digest('hex'),
  orderCaveat:
    'Anonymous terminal-log order; original list order and API durations are unavailable.',
  results,
  realLogProjection: {
    observedSeconds: fixture.observedSeconds,
    skippedIntervalSavingsSeconds: fixedSavings,
    sameWorkUpstreamEstimateSeconds: inferredBaseline,
    estimatedTimeReductionPercent: (100 * fixedSavings) / inferredBaseline,
    estimatedThroughputRatio: inferredBaseline / fixture.observedSeconds,
    note: 'Assumes identical decisions/API costs and 5-second interval; excludes extra serialization cost and different model speeds.',
  },
}
await writeFile(
  resolve(root, 'local/workflow-benchmark-results.json'),
  JSON.stringify(output, null, 2) + '\n',
)
console.log(JSON.stringify(output, null, 2))
