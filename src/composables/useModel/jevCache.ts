/** 明确列出判定输入，不接受配置对象，凭据不能进入缓存指纹。 */
export interface JevCacheInput {
  state: string
  questions: unknown
  model?: string
  strictness: string
}

interface CacheMeta {
  fingerprint: string
  runFingerprint?: string
}

interface Pending {
  meta: CacheMeta
  promise: Promise<unknown>
}

const pending = new WeakMap<object, Pending>()

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function jevInputFingerprint(input: JevCacheInput) {
  return fingerprint([input.state, input.questions, input.model || 'jev-latest', input.strictness])
}

/**
 * runSource 只用于工作流明确标识的同轮预判复用。
 * 真正调用模型时的输入指纹始终保留，不把补完详情后的 state 冒充为已判断。
 */
export async function cachedJevJudgment<T>(
  state: Record<string, any>,
  input: JevCacheInput,
  compute: () => Promise<T>,
  runSource?: string,
): Promise<T> {
  const meta: CacheMeta = {
    fingerprint: await jevInputFingerprint(input),
    runFingerprint: runSource === undefined ? undefined : await fingerprint(runSource),
  }
  const matches = (cached?: CacheMeta) =>
    cached &&
    (cached.fingerprint === meta.fingerprint ||
      (meta.runFingerprint !== undefined && cached.runFingerprint === meta.runFingerprint))
  if (state.__jev && matches(state.__jevCache)) {
    if (state.__jevCache.fingerprint === meta.fingerprint) {
      state.__jevCache = meta
    }
    return state.__jev as T
  }
  const inflight = pending.get(state)
  if (inflight && matches(inflight.meta)) {
    if (inflight.meta.fingerprint === meta.fingerprint)
      inflight.meta.runFingerprint = meta.runFingerprint
    return inflight.promise as Promise<T>
  }

  const entry: Pending = { meta, promise: Promise.resolve() }
  // microtask 保证即使 compute 同步失败，finally 执行前也已登记本次请求。
  entry.promise = Promise.resolve()
    .then(compute)
    .then((judgment) => {
      if (pending.get(state) === entry) {
        state.__jev = judgment
        state.__jevCache = meta
      }
      return judgment
    })
    .finally(() => {
      if (pending.get(state) === entry) pending.delete(state)
    })
  pending.set(state, entry)
  return entry.promise as Promise<T>
}
