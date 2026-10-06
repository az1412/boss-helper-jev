import { describe, expect, test } from 'bun:test'

import { initNetConf } from '../src/composables/useHelper/netConf'
import { getProjectLinks, projectInfo } from '../src/utils/projectInfo'

describe('本版来源与远程入口', () => {
  test('仓库未配置时不借用上游反馈与发布地址', () => {
    expect(getProjectLinks('')).toEqual({ repository: null, issues: null, releases: null })
    expect(projectInfo.remoteUpdates).toBe(false)
    expect(projectInfo.upstreamUrl).toBe('https://github.com/Ocyss/boss-helper')
  })

  test('有效仓库才生成对应反馈与发布链接', () => {
    expect(getProjectLinks()).toEqual({
      repository: 'https://github.com/az1412/jev-job-helper',
      issues: 'https://github.com/az1412/jev-job-helper/issues',
      releases: 'https://github.com/az1412/jev-job-helper/releases',
    })
    expect(getProjectLinks(' https://github.com/example/jev-helper/ ')).toEqual({
      repository: 'https://github.com/example/jev-helper',
      issues: 'https://github.com/example/jev-helper/issues',
      releases: 'https://github.com/example/jev-helper/releases',
    })
    for (const value of [
      'javascript:alert(1)',
      'https://github.com',
      'https://github.com.evil.test/a/b',
    ]) {
      expect(getProjectLinks(value).repository).toBeNull()
    }
  })

  test('空远程配置不联网，不复用被修改的公告列表', async () => {
    const originalFetch = globalThis.fetch
    let requests = 0
    globalThis.fetch = (() => {
      requests++
      throw new Error('测试禁止网络请求')
    }) as typeof fetch
    try {
      const first = await initNetConf()
      first.feedback = 'https://example.invalid'
      first.notification.push({ key: 'old', type: 'notification', data: { title: '旧公告' } })
      expect(await initNetConf()).toEqual({
        version: '',
        notification: [],
        feedback: '',
        store: {},
      })
      expect(requests).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
