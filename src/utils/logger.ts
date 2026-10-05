import { logger, LogPersistence } from 'devlog-ui'

import { resolveLogLevel } from './logView'

// 日志存在页面来源的 localStorage，同源脚本可以读取。凭据在核心 logger 入库前
// 脱敏，但岗位、筛选理由等仍可能含个人求职信息，导出时也要提醒用户。
let savedLevel: string | null = null
try {
  if (typeof localStorage !== 'undefined') {
    savedLevel = localStorage.getItem('__BH_LOG_LEVEL__')
  }
} catch {
  // 存储被浏览器禁用时，仍能使用默认 info 的内存日志。
}

// 必须先配置容量再恢复历史，避免 importLogs 先按包的默认容量裁掉旧记录。
logger.configure({
  maxLogs: 2000,
  minLevel: resolveLogLevel(savedLevel),
  enabled: true,
  shortcutAction: 'toggle',
  showToggleButton: true,
  spanCollapsed: true,
})

LogPersistence.enable({
  storage: 'local',
  maxPersisted: 2000,
  debounceMs: 100,
})
const recovered = LogPersistence.rehydrate()

if (LogPersistence.hadCrash() && recovered > 0) {
  // 异常关闭的原因无法由标记确定，不把恢复成功伪装成投递成功或猜测为风控。
  logger
    .withContext({ event: 'run' })
    .warn(`上次会话可能未正常结束，已恢复 ${recovered} 条历史日志。关闭原因无法确认。`)
}

export { logger }
