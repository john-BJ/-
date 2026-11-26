export class ApiError extends Error {
  status: number
  code: string
  hint?: string

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message)
    this.status = status
    this.code = code
    this.hint = hint
  }
}

export const err = {
  unauthorized: () => new ApiError(401, 'UNAUTHORIZED', '登录状态已失效，请重新登录'),
  notFound: (what: string) => new ApiError(404, 'NOT_FOUND', `${what}不存在`),
  badRequest: (msg: string, code = 'BAD_REQUEST') => new ApiError(400, code, msg),
  confirmRequired: () =>
    new ApiError(
      409,
      'CONFIRM_REQUIRED',
      '缺少学生确认后的 ConfirmedSolution，批改被拒绝',
      '识别结果必须经学生确认才生效（硬口径 §10.2），不存在跳过确认的分支',
    ),
}
