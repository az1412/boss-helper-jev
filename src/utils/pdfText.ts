/**
 * 从 PDF 文件提取纯文本，用于把简历预填成可编辑文字。
 *
 * 跑在主世界（zhipin 页面来源）。pdfjs 6 **必须**有 worker：没配 `workerSrc` 时它会退到
 * 「假 worker」，而假 worker 也是从 `workerSrc` 动态 import 同一个文件 —— 所以空串一样
 * 起不来，任何 PDF 都会失败。之前的版本就是这么把「Worker 没配」报成了「扫描件/加密」。
 *
 * worker 文件由 wxt.config.ts 在构建时拷进输出目录并登记为 web_accessible_resources，
 * 这里通过隔离世界的桥（counter.getResourceUrl）拿到它的扩展 URL。
 *
 * 失败按原因分开给人话提示：组件加载失败 / 加密 / 文件损坏 / 无文字层，不再一锅端。
 */
import type * as Pdfjs from 'pdfjs-dist'

import { counter } from '@/message'

const WORKER_FILE = '/pdf.worker.min.mjs'

type PdfjsModule = typeof Pdfjs

let pdfjsPromise: Promise<PdfjsModule> | null = null

async function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = await counter.getResourceUrl(WORKER_FILE)
    return pdfjs
  })().catch((err: unknown) => {
    pdfjsPromise = null // 下次点击再试，不把一次失败钉死
    throw err
  })
  return pdfjsPromise
}

export async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()

  let pdfjs: PdfjsModule
  try {
    pdfjs = await loadPdfjs()
  } catch {
    throw new Error('PDF 解析组件加载失败，请重新加载扩展后再试，或手动粘贴简历文字')
  }

  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
    useWorkerFetch: false,
    useSystemFonts: false,
  })

  try {
    let doc: Awaited<typeof task.promise>
    try {
      doc = await task.promise
    } catch (err) {
      throw new Error(describeOpenError(pdfjs, err))
    }

    const parts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const line = content.items
        .map((it) => ('str' in it && typeof it.str === 'string' ? it.str : ''))
        .join(' ')
      if (line.trim()) parts.push(line)
    }

    const text = parts
      .join('\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!text) {
      throw new Error('这份 PDF 里没有文字层（多半是扫描件或整页图片），请手动粘贴简历文字')
    }
    return text
  } finally {
    // pdfjs 6 的销毁入口在 loadingTask 上，不在 document 上
    await task.destroy().catch(() => {})
  }
}

function describeOpenError(pdfjs: PdfjsModule, err: unknown): string {
  if (err instanceof pdfjs.PasswordException) {
    return '这份 PDF 有密码保护，请先去掉密码再上传，或手动粘贴简历文字'
  }
  if (err instanceof pdfjs.InvalidPDFException) {
    return '这份文件不是有效的 PDF（可能损坏或改过后缀），请换一份或手动粘贴简历文字'
  }
  const detail = err instanceof Error ? err.message : String(err)
  if (/worker/i.test(detail)) {
    // 到这一步说明 worker 文件没打进扩展或没登记为可访问资源，是构建问题，不是用户文件问题
    return `PDF 解析组件没有就绪（${detail}），请重新加载扩展；或手动粘贴简历文字`
  }
  return `PDF 打不开：${detail}。请手动粘贴简历文字`
}
