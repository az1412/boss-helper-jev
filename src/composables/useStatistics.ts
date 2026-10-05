import { ref } from 'vue'

import { counter } from '@/message'
import type { Statistics } from '@/types/formData'
import { getCurDay } from '@/utils'
import { jsonClone } from '@/utils/deepmerge'
export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'
export const useStatistics = () => {
  const empty = (): Statistics => ({
    date: getCurDay(),
    success: 0,
    total: 0,
    repeat: 0,
    activityFilter: 0,
    tasks: {},
  })
  const todayData = ref<Statistics>(empty())
  const statisticsData = ref<Statistics[]>([])
  let recording = false
  async function updateStatistics() {
    if (recording) return
    const previous = await counter.storageGet(todayKey, empty())
    statisticsData.value = await counter.storageGet<Statistics[]>(statisticsKey, [])
    if (previous.date === getCurDay()) todayData.value = previous
    else {
      todayData.value = empty()
      if (!statisticsData.value.some((item) => item.date === previous.date))
        statisticsData.value.unshift(previous)
    }
  }
  async function flush() {
    if (!recording) return
    await counter.storageSet(todayKey, jsonClone(todayData.value))
    if (statisticsData.value.length)
      await counter.storageSet(statisticsKey, jsonClone(statisticsData.value))
  }
  return {
    todayData,
    statisticsData,
    updateStatistics,
    flush,
    beginRecording() {
      recording = true
    },
    async endRecording() {
      try {
        await flush()
      } finally {
        recording = false
      }
    },
  }
}
