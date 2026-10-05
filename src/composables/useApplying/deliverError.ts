export class BossHelperError extends Error {
  state: 'warning' | 'danger'
  error_type: 'boss-helper'

  constructor(message: string, state: 'warning' | 'danger' = 'warning', options?: ErrorOptions) {
    super(message, options)
    this.state = state
    this.error_type = 'boss-helper'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class WorkflowPausedError extends Error {
  constructor() {
    super('已暂停，尚未提交的追加消息不再发送')
    this.name = 'WorkflowPausedError'
  }
}

export class DeliveryUncertainError extends BossHelperError {
  constructor(
    message = '发送结果暂时无法确认，请先在 BOSS 聊天记录中核实；本轮已停止，不会自动重发',
  ) {
    super(message, 'danger')
    this.name = '发送结果待核实'
  }
}

export class BossVerificationError extends BossHelperError {
  constructor(message: string) {
    super(message, 'danger')
    this.name = '需要人工验证'
  }
}

export class UnknownError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '未知错误'
  }
}

export class PublishError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '投递出错'
  }
}

export class GreetError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '打招呼出错'
  }
}

export class LimitError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '达到限制'
  }
}

export class RateLimitError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '操作频繁'
  }
}
