import pino from 'pino'

/**
 * 日志脱敏（§10.1）：密钥、Authorization、base64 图片内容一律不得落日志。
 * 这里用 redact 抹掉敏感路径，业务日志只记录 role/model/耗时/尺寸等元数据。
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      'api_key',
      'apiKey',
      '*.api_key',
      '*.apiKey',
      'key',
      '*.key',
      'password',
      '*.password',
      'image_base64',
      '*.image_base64',
    ],
    censor: '[REDACTED]',
  },
  transport: undefined,
})
