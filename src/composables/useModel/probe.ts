import { APICallError } from 'ai'

import { generateModelText, ModelResponseError } from './generate'
import type { OpenaiLLMConf } from './openai'

export function explainProbeError(err: unknown): string {
  // SDK 的流式 error 事件可能是普通对象，并不一定是 APICallError。
  // 只映射状态码、已知类型；禁止回显 message、请求或响应正文。
  const chain: Record<string, unknown>[] = []
  let current = err
  while (
    current &&
    typeof current === 'object' &&
    chain.length < 5 &&
    !chain.includes(current as Record<string, unknown>)
  ) {
    const item = current as Record<string, unknown>
    chain.push(item)
    current = item.cause
  }
  for (const item of chain) {
    if (item instanceof ModelResponseError) return item.message
    const code = [item.statusCode, item.status, item.code].find((v) => typeof v === 'number')
    const category = [item.code, item.type, item.status].find(
      (v) =>
        typeof v === 'string' &&
        [
          'insufficient_quota',
          'rate_limit_exceeded',
          'RESOURCE_EXHAUSTED',
          'UNAUTHENTICATED',
          'PERMISSION_DENIED',
          'INVALID_ARGUMENT',
        ].includes(v),
    )
    if (
      code === 401 ||
      code === 403 ||
      category === 'UNAUTHENTICATED' ||
      category === 'PERMISSION_DENIED'
    )
      return `鉴权失败${code ? ` (${code})` : ''}：请核对密钥及模型权限`
    if (
      code === 402 ||
      code === 429 ||
      category === 'insufficient_quota' ||
      category === 'rate_limit_exceeded' ||
      category === 'RESOURCE_EXHAUSTED'
    )
      return `请求受限${code ? ` (${code})` : ''}：请检查供应商额度或稍后重试`
    if (code === 404) return '404：请核对接口地址、接口类型和模型名称'
    if (code === 400 || category === 'INVALID_ARGUMENT')
      return '400：供应商拒绝参数，请核对模型及高级配置'
    if (typeof code === 'number' && code >= 500 && code <= 599)
      return `供应商服务异常 (${code})，请稍后重试`
  }
  if (chain.some((item) => ['AbortError', 'TimeoutError'].includes(String(item.name))))
    return '请求超时或已取消'
  if (
    chain.some(
      (item) =>
        item.name === 'AI_TypeValidationError' || item.name === 'AI_InvalidResponseDataError',
    )
  )
    return '模型返回结构与所选接口不兼容；请核对 Chat Completions / Responses，流式开启时可关闭后手动测试'
  if (chain.some((item) => item.name === 'AI_JSONParseError'))
    return '模型接口返回了无法解析的数据；请检查接口地址及中转站返回格式'
  if (chain.some((item) => item.name === 'AI_NoOutputGeneratedError'))
    return '模型未完成正文输出；流式响应可能中断，请检查服务端请求记录或关闭流式后手动测试'
  if (chain.some((item) => item instanceof TypeError))
    return '网络请求失败，请检查地址，或启用后台请求后重试'
  const apiError = chain.find((item) => APICallError.isInstance(item))
  if (apiError)
    return `模型请求失败${typeof apiError.statusCode === 'number' ? ` (${apiError.statusCode})` : ''}`
  if (chain.some((item) => typeof item.message === 'string' && !item.name))
    return '模型服务返回错误，但没有可识别的状态码；请检查供应商或中转站的请求记录'
  // 不把供应商原始错误、响应体或请求头展示/写入日志，可能包含凭据。
  return '请求未完成，请检查模型配置与返回格式'
}
export async function probeModel(conf: OpenaiLLMConf, opts: { signal?: AbortSignal } = {}) {
  await generateModelText(conf, [{ role: 'user', content: '只回复：连接成功' }], opts)
  return '已通过当前接口和参数完成一次请求。筛选格式请在提示词测试中验证。'
}
