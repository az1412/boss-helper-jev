export function exportJson(data: object, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${name}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
export async function importJson<T = any>(): Promise<T> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  return new Promise((resolve, reject) => {
    input.addEventListener('cancel', () => reject(new Error('已取消导入')), { once: true })
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0]
        if (!file || !file.name.toLowerCase().endsWith('.json')) {
          reject(new Error('请选择 JSON 文件'))
          return
        }
        try {
          const data = JSON.parse(await file.text(), (key, value) => {
            if (['__proto__', 'prototype', 'constructor'].includes(key))
              throw new Error('invalid key')
            return value
          })
          if (!data || typeof data !== 'object') throw new Error('invalid root')
          resolve(data)
        } catch {
          reject(new Error('导入失败：文件不是有效的配置 JSON'))
        }
      },
      { once: true },
    )
    input.click()
  })
}
