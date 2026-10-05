import { describe, expect, test } from 'bun:test'

import { defaultFormData } from '../src/composables/conf/info'
import { ChatModel } from '../src/composables/useModel/chatModel'
import { generateModelText } from '../src/composables/useModel/generate'
import { createModelSettings, validateModels } from '../src/composables/useModel/modelSettings'
import { normalizeModelConfig } from '../src/composables/useModel/openai'
import { explainProbeError } from '../src/composables/useModel/probe'
import { shareModels, shareSettings } from '../src/utils/shareConfig'
const config = () => ({
  mode: 'openai' as const,
  avatar: '',
  base_url: 'https://model.invalid/v1/chat/completions/',
  api_key: ' FAKE_TEST_ONLY ',
  model: 'test-model',
  other: {},
  advanced: { stream: false },
})
const models = () => [{ key: 'test', name: '测试模型', data: config() }]
const reply = () =>
  new Response(
    JSON.stringify({
      id: 'test',
      object: 'chat.completion',
      created: 1,
      model: 'test-model',
      choices: [
        { index: 0, message: { role: 'assistant', content: '连接成功' }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )

describe('模型配置与真实 SDK 边界', () => {
  test('Gemini 名称的兼容接口可读取正常流式正文', async () => {
    const chunks = [
      {
        choices: [{ index: 0, delta: { role: 'assistant', content: '您好' }, finish_reason: null }],
      },
      { choices: [{ index: 0, delta: { content: '，希望沟通。' }, finish_reason: 'stop' }] },
    ]
    const fetcher = (async () =>
      new Response(
        chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )) as typeof fetch
    const result = await generateModelText(
      { ...config(), model: 'gemini-test', advanced: { stream: true } },
      [{ role: 'user', content: '离线测试' }],
      { fetch: fetcher },
    )
    expect(result.text).toBe('您好，希望沟通。')
  })
  test('HTTP 200 内的流式供应商错误保留错误类别，不回显原始内容、不重试', async () => {
    let calls = 0
    const fetcher = (async () => {
      calls++
      return new Response(
        'data: ' +
          JSON.stringify({
            error: { message: 'PRIVATE_PROVIDER_RESPONSE', code: 429, type: 'upstream_error' },
          }) +
          '\n\ndata: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }) as typeof fetch
    const error = await generateModelText(
      { ...config(), advanced: { stream: true } },
      [{ role: 'user', content: '离线测试' }],
      { fetch: fetcher },
    ).catch((e) => e)
    expect(explainProbeError(error)).toContain('429')
    expect(explainProbeError(error)).not.toContain('PRIVATE_')
    expect(calls).toBe(1)
  })
  test('返回结构不兼容及空正文有明确提示，响应中的个人内容不泄漏', async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'PRIVATE_RESPONSE' }] } }] }),
        { headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch
    const invalid = await generateModelText(config(), [{ role: 'user', content: '测试' }], {
      fetch: fetcher,
    }).catch((e) => e)
    expect(explainProbeError(invalid)).toContain('不兼容')
    expect(explainProbeError(invalid)).not.toContain('PRIVATE_')
    const emptyFetcher = (async () => {
      const json = await reply().json()
      json.choices[0].message.content = ''
      return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    const empty = await generateModelText(config(), [{ role: 'user', content: '测试' }], {
      fetch: emptyFetcher,
    }).catch((e) => e)
    expect(explainProbeError(empty)).toContain('未返回可发送的正文')
    expect(explainProbeError(new Error('PRIVATE_SECRET'))).not.toContain('PRIVATE_SECRET')
  })
  test('独立草稿取消不污染保存值；失败不提交；初始化不覆盖', async () => {
    let fail = true,
      reads = 0
    const store = createModelSettings({
      get: async () => {
        reads++
        return models()
      },
      set: async () => {
        if (fail) throw new Error('FAKE_SECRET')
      },
    })
    await Promise.all([store.initModel(), store.initModel()])
    expect(reads).toBe(1)
    const draft = store.snapshot()
    draft[0]!.data!.api_key = 'DIFFERENT_FAKE_KEY'
    expect(store.modelData.value[0]?.data?.api_key).toBe(' FAKE_TEST_ONLY ')
    await expect(store.saveModel(draft)).rejects.toThrow('草稿已保留')
    expect(store.error.value).not.toContain('FAKE_SECRET')
    expect(store.snapshot()[0]?.data?.api_key).toBe(' FAKE_TEST_ONLY ')
    fail = false
    await store.saveModel(draft)
    draft[0]!.data!.api_key = 'NOT_SAVED'
    await store.initModel()
    expect(store.snapshot()[0]?.data?.api_key).toBe('DIFFERENT_FAKE_KEY')
  })
  test('校验地址、凭据、JSON、高级参数和重复标识', () => {
    expect(normalizeModelConfig(config()).base_url).toBe('https://model.invalid/v1')
    expect(normalizeModelConfig(config()).api_key).toBe('FAKE_TEST_ONLY')
    for (const base_url of [
      'javascript:alert(1)',
      'https://u:secret@model.invalid',
      'https://model.invalid?key=secret',
    ])
      expect(() => normalizeModelConfig({ ...config(), base_url })).toThrow()
    expect(() =>
      normalizeModelConfig({ ...config(), advanced: { extra_headers: '{broken' } }),
    ).toThrow('JSON')
    expect(() => normalizeModelConfig({ ...config(), advanced: { temperature: 3 } })).toThrow()
    expect(() => validateModels([...models(), ...models()])).toThrow('重复')
    expect(() => normalizeModelConfig({ ...config(), api_key: '' })).toThrow('API Key')
  })
  test('实际非流式调用保留归一化地址、额外请求头、采样与 JSON 开关', async () => {
    let request: any
    const fetcher = (async (url: any, init: any) => {
      request = { url, headers: new Headers(init.headers), body: JSON.parse(init.body) }
      return reply()
    }) as typeof fetch
    const input = {
      ...config(),
      advanced: {
        stream: false,
        json: false,
        temperature: 0.25,
        top_p: 0.8,
        extra_headers: '{"x-test":"fake"}',
        extra_body: '{"custom_option":true,"model":"wrong","messages":[]}',
      },
    }
    const result = await generateModelText(input, [{ role: 'user', content: '离线测试' }], {
      json: true,
      fetch: fetcher,
    })
    expect(result.text).toBe('连接成功')
    expect(request.url).toBe('https://model.invalid/v1/chat/completions')
    expect(request.headers.get('x-test')).toBe('fake')
    expect(request.body.model).toBe('test-model')
    expect(request.body.messages[0].content).toBe('离线测试')
    expect(request.body.temperature).toBe(0.25)
    expect(request.body.top_p).toBe(0.8)
    expect(request.body.custom_option).toBe(true)
    expect(request.body.response_format).toBeUndefined()
  })
  test('Responses 开关实际使用 responses endpoint', async () => {
    let target = ''
    const fetcher = (async (url: any) => {
      target = String(url)
      return new Response(
        JSON.stringify({
          id: 'resp_test',
          object: 'response',
          created_at: 1,
          status: 'completed',
          model: 'test-model',
          output: [
            {
              type: 'message',
              id: 'msg_test',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: '连接成功', annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch
    expect(
      (
        await generateModelText(
          { ...config(), responses: true },
          [{ role: 'user', content: '测试' }],
          { fetch: fetcher },
        )
      ).text,
    ).toBe('连接成功')
    expect(target).toBe('https://model.invalid/v1/responses')
  })
  test('流式返回错误不能当成功，额度错误只请求一次', async () => {
    let calls = 0
    const fetcher = (async () => {
      calls++
      return new Response(
        JSON.stringify({
          error: { message: 'test quota', type: 'insufficient_quota', code: 'insufficient_quota' },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch
    await expect(
      generateModelText(
        { ...config(), advanced: { stream: true } },
        [{ role: 'user', content: '测试' }],
        { fetch: fetcher },
      ),
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })
  test('清除失效模型引用，不缓存旧 provider', async () => {
    const helper: any = { models: { modelData: { value: models() } } }
    const model = new ChatModel(helper)
    const prompt = {
      model: 'test',
      enable: true,
      prompt: [{ role: 'user' as const, content: '测试' }],
    }
    expect(model.createAgent(prompt, 'greetings')).toBe(true)
    helper.models.modelData.value = []
    expect(model.createAgent(prompt, 'greetings')).toBe(false)
    await expect(model.chat('greetings', {} as any)).rejects.toThrow('选择')
  })
  test('分享配置白名单排除个人内容和密钥；模型分享保留空密钥供编辑', () => {
    const data = structuredClone(defaultFormData)
    data.profile.resume = 'PRIVATE_RESUME'
    data.jev.apiKey = 'PRIVATE_KEY'
    data.aiGreeting.prompt = [{ role: 'user', content: 'PRIVATE_PROMPT' }]
    data.customGreeting.value = 'PRIVATE_MESSAGE'
    expect(JSON.stringify(shareSettings(data))).not.toContain('PRIVATE_')
    expect(data.jev.apiKey).toBe('PRIVATE_KEY')
    const model = models()
    model[0]!.data.advanced = {
      ...model[0]!.data.advanced,
      extra_headers: { Authorization: 'PRIVATE_HEADER' },
    } as any
    const shared = shareModels(model)
    expect(JSON.stringify(shared)).not.toContain('PRIVATE_')
    expect(JSON.stringify(shared)).not.toContain('FAKE_TEST_ONLY')
    expect(validateModels(shared, true)[0]?.data?.api_key).toBe('')
    expect(() => validateModels(shared)).toThrow('API Key')
  })
})
