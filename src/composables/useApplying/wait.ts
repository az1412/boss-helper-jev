// 只等待本地计时，不取消已发出的站点请求。
export function waitForDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, Math.max(0, ms))
    signal?.addEventListener('abort', finish, { once: true })
  })
}
