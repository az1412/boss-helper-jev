export interface PageSnapshot {
  ids: string[]
  revision: number
  hasMore: boolean | undefined
}

// 暂停仅取消本地延时；已发起的列表读取仍须收到结果或明确超时才收尾。
export async function loadNextPage(options: {
  read: () => PageSnapshot
  request: () => unknown
  delay: Promise<unknown>
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<boolean> {
  const before = options.read()
  if (before.hasMore === false || options.signal?.aborted) return false
  const oldIds = new Set(before.ids)
  let timer: ReturnType<typeof setTimeout> | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  try {
    const changed = new Promise<void>((resolve) => {
      interval = setInterval(() => {
        const now = options.read()
        const hasNew = now.ids.some((id) => !oldIds.has(id))
        // 清空旧列表不是加载完成；也识别原地 push 而未重新赋值的数组。
        if (
          hasNew ||
          now.hasMore === false ||
          (now.revision !== before.revision && now.ids.length > 0)
        )
          resolve()
      }, 100)
    })
    const boundary = new Promise<void>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('列表加载超时，未确认是否已到底；已停止，请稍后重试')),
        options.timeoutMs ?? 90000,
      )
    })
    await Promise.race([
      Promise.all([Promise.resolve(options.request()), changed, options.delay]),
      boundary,
    ])
    if (options.signal?.aborted) return false
    return options.read().ids.some((id) => !oldIds.has(id))
  } finally {
    clearTimeout(timer)
    clearInterval(interval)
  }
}
