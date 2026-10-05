import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = resolve(root, 'packages/devlog-ui')
const patchDir = resolve(root, 'scripts/patches')
const manifest = JSON.parse(readFileSync(resolve(patchDir, 'devlog-ui.json'), 'utf8'))
const checkOnly = process.argv.includes('--check')

function git(args) {
  const result = spawnSync('git', ['-C', target, ...args], {
    encoding: 'utf8',
    // 源码包可能放在另一个 Git 仓库里面；不得把父仓库当作日志仓库。
    env: { ...process.env, GIT_CEILING_DIRECTORIES: resolve(target, '..') },
  })
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || 'Git command failed')
  }
  return result.stdout.trim()
}

function hashFile(path) {
  if (!existsSync(path)) return null
  return createHash('sha256')
    .update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex')
}

try {
  if (!existsSync(resolve(target, 'src/core/logger.ts'))) {
    throw new Error(
      '缺少日志子模块。请先执行 git submodule update --init --recursive，或使用包含 packages/devlog-ui 的完整源码包。',
    )
  }
  // 完整源码包可以没有 .git；文件哈希仍严格锁定补丁的输入与输出。
  if (existsSync(resolve(target, '.git')) && git(['rev-parse', 'HEAD']) !== manifest.baseCommit) {
    throw new Error(`日志子模块基线不匹配，需要 ${manifest.baseCommit}。不会覆盖现有修改。`)
  }
  const states = Object.entries(manifest.files).map(([path, hashes]) => {
    const actual = hashFile(resolve(target, path))
    return { path, base: actual === hashes.base, patched: actual === hashes.patched }
  })
  if (states.every((state) => state.patched)) {
    console.log('devlog-ui: 补丁已应用，内容校验通过。')
  } else {
    if (!states.every((state) => state.base)) {
      throw new Error(
        '日志文件包含未识别或部分应用的修改；请先保留并检查本地差异。不会自动重置文件。',
      )
    }
    if (checkOnly) throw new Error('日志补丁尚未应用，请执行 bun run patch:devlog。')
    const patch = resolve(patchDir, manifest.patch)
    git(['apply', '--check', '--whitespace=error', patch])
    git(['apply', '--whitespace=error', patch])
    for (const [path, hashes] of Object.entries(manifest.files)) {
      if (hashFile(resolve(target, path)) !== hashes.patched) {
        throw new Error(`补丁应用后的文件校验失败：${path}`)
      }
    }
    console.log('devlog-ui: 补丁应用成功，内容校验通过。')
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
