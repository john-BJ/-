import crypto from 'node:crypto'

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

export function uuid(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** 保持插入顺序去重 */
export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
