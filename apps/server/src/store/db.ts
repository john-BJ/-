import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { env, ensureDirs } from '../env'
import type { ConfirmedSolution, GradeResult, LocateResult, RecognizeResult, TaskState } from '../types'

/* --------------------------------- 记录类型 -------------------------------- */

export interface UserRec {
  user_id: string
  email: string
  display_name: string
  password_hash: string
  password_salt: string
  created_at: string
}

export interface ImageRec {
  image_id: string
  owner_id: string
  file: string
  uri: string
  width: number
  height: number
  bytes: number
  sha256: string
  phash: string | null
  mime: string
  sample_id: string | null
  is_exam_question: boolean
  created_at: string
}

export interface RecognitionRec extends RecognizeResult {
  image_id: string
  owner_id: string
  sample_id: string | null
  created_at: string
}

export interface GradingRec {
  task_id: string
  confirm_id: string
  owner_id: string
  result: GradeResult
  derivation: { text: string; latex: string | null }[]
  created_at: string
}

export interface NoteRec {
  grade_task_id: string
  owner_id: string
  note: string
  updated_at: string
}

export interface LocateRec {
  confirm_id: string
  owner_id: string
  result: LocateResult
  created_at: string
}

export interface RecordSummary {
  task_id: string
  created_at: string
  overall: string
  primary_label: string | null
  first_error_step: number | null
  question_id: string | null
  method: string
  stem_snippet: string
  source_type: string
}

/* --------------------------------- 数据库 --------------------------------- */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  image_id         TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL,
  file             TEXT NOT NULL,
  uri              TEXT NOT NULL,
  width            INTEGER NOT NULL DEFAULT 0,
  height           INTEGER NOT NULL DEFAULT 0,
  bytes            INTEGER NOT NULL DEFAULT 0,
  sha256           TEXT NOT NULL,
  phash            TEXT,
  mime             TEXT NOT NULL,
  sample_id        TEXT,
  is_exam_question INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_sha ON images(owner_id, sha256);

CREATE TABLE IF NOT EXISTS tasks (
  task_id     TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  status      TEXT NOT NULL,
  stage       TEXT NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  error_json  TEXT,
  usage_json  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recognitions (
  task_id      TEXT PRIMARY KEY,
  image_id     TEXT NOT NULL,
  owner_id     TEXT NOT NULL,
  sample_id    TEXT,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rec_owner ON recognitions(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS confirmations (
  confirm_id   TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  owner_id     TEXT NOT NULL,
  version      INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conf_task ON confirmations(task_id, version);

CREATE TABLE IF NOT EXISTS locates (
  confirm_id   TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gradings (
  task_id          TEXT PRIMARY KEY,
  confirm_id       TEXT NOT NULL,
  owner_id         TEXT NOT NULL,
  overall          TEXT NOT NULL,
  primary_label    TEXT,
  first_error_step INTEGER,
  question_id      TEXT,
  method           TEXT NOT NULL,
  stem_snippet     TEXT NOT NULL,
  source_type      TEXT NOT NULL,
  payload_json     TEXT NOT NULL,
  derivation_json  TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gradings_owner ON gradings(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gradings_label ON gradings(owner_id, primary_label);

CREATE TABLE IF NOT EXISTS notes (
  grade_task_id TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  note          TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
`

function nowIso() {
  return new Date().toISOString()
}

class Repo {
  readonly db: Database.Database

  constructor() {
    ensureDirs()
    this.db = new Database(path.join(env.dataDir, 'app.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(SCHEMA)
  }

  close() {
    this.db.close()
  }

  /* -------------------------------- 用户 -------------------------------- */

  seedDemoUser(): UserRec {
    const existing = this.findUserByEmail('demo@cuoti.local')
    if (existing) return existing
    return this.createUser({
      email: 'demo@cuoti.local',
      display_name: '演示同学',
      password: 'demo1234',
      user_id: 'u_demo',
    })
  }

  findUserByEmail(email: string): UserRec | undefined {
    return this.db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email) as UserRec | undefined
  }

  findUserById(id: string): UserRec | undefined {
    return this.db.prepare('SELECT * FROM users WHERE user_id = ?').get(id) as UserRec | undefined
  }

  createUser(input: {
    email: string
    display_name: string
    password: string
    user_id?: string
  }): UserRec {
    const salt = crypto.randomBytes(16).toString('hex')
    const rec: UserRec = {
      user_id: input.user_id ?? `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      email: input.email.trim(),
      display_name: input.display_name.trim() || input.email.split('@')[0],
      password_hash: hashPassword(input.password, salt),
      password_salt: salt,
      created_at: nowIso(),
    }
    this.db
      .prepare(
        'INSERT INTO users (user_id,email,display_name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(rec.user_id, rec.email, rec.display_name, rec.password_hash, rec.password_salt, rec.created_at)
    return rec
  }

  countUsers(): number {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c
  }

  /* -------------------------------- 图片 -------------------------------- */

  insertImage(rec: ImageRec) {
    this.db
      .prepare(
        `INSERT INTO images (image_id,owner_id,file,uri,width,height,bytes,sha256,phash,mime,sample_id,is_exam_question,created_at)
         VALUES (@image_id,@owner_id,@file,@uri,@width,@height,@bytes,@sha256,@phash,@mime,@sample_id,@is_exam_question,@created_at)`,
      )
      .run({ ...rec, is_exam_question: rec.is_exam_question ? 1 : 0 })
  }

  private mapImage(row: any): ImageRec | undefined {
    if (!row) return undefined
    return { ...row, is_exam_question: Boolean(row.is_exam_question) } as ImageRec
  }

  getImage(image_id: string): ImageRec | undefined {
    return this.mapImage(this.db.prepare('SELECT * FROM images WHERE image_id = ?').get(image_id))
  }

  getImageOwned(image_id: string, owner_id: string): ImageRec | undefined {
    return this.mapImage(
      this.db.prepare('SELECT * FROM images WHERE image_id = ? AND owner_id = ?').get(image_id, owner_id),
    )
  }

  /** 去重：同 owner、同样本归属下，sha256 相同或感知哈希汉明距离 ≤ 阈值 */
  findDuplicate(owner_id: string, sha256: string, phash: string | null, sample_id: string | null): ImageRec | undefined {
    const sampleKey = sample_id ?? ''
    const exact = this.db
      .prepare(
        `SELECT * FROM images WHERE owner_id = ? AND sha256 = ? AND IFNULL(sample_id,'') = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(owner_id, sha256, sampleKey)
    if (exact) return this.mapImage(exact)

    if (!phash) return undefined
    const rows = this.db
      .prepare(
        `SELECT * FROM images WHERE owner_id = ? AND phash IS NOT NULL AND IFNULL(sample_id,'') = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .all(owner_id, sampleKey) as any[]
    for (const row of rows) {
      if (phashDistance(row.phash, phash) <= 5) return this.mapImage(row)
    }
    return undefined
  }

  setImageExamFlag(image_id: string, owner_id: string, flag: boolean) {
    this.db
      .prepare('UPDATE images SET is_exam_question = ? WHERE image_id = ? AND owner_id = ?')
      .run(flag ? 1 : 0, image_id, owner_id)
  }

  /* -------------------------------- 任务 -------------------------------- */

  upsertTask(t: TaskState) {
    this.db
      .prepare(
        `INSERT INTO tasks (task_id,kind,owner_id,status,stage,progress,error_json,usage_json,created_at,updated_at)
         VALUES (@task_id,@kind,@owner_id,@status,@stage,@progress,@error_json,@usage_json,@created_at,@updated_at)
         ON CONFLICT(task_id) DO UPDATE SET
           status=excluded.status, stage=excluded.stage, progress=excluded.progress,
           error_json=excluded.error_json, usage_json=excluded.usage_json, updated_at=excluded.updated_at`,
      )
      .run({
        task_id: t.task_id,
        kind: t.kind,
        owner_id: t.owner_id,
        status: t.status,
        stage: t.stage,
        progress: t.progress,
        error_json: t.error ? JSON.stringify(t.error) : null,
        usage_json: JSON.stringify(t.usage),
        created_at: t.created_at,
        updated_at: t.updated_at,
      })
  }

  getTask(task_id: string): TaskState | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as any
    if (!row) return undefined
    return {
      task_id: row.task_id,
      kind: row.kind,
      owner_id: row.owner_id,
      status: row.status,
      stage: row.stage,
      progress: row.progress,
      error: row.error_json ? JSON.parse(row.error_json) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      usage: JSON.parse(row.usage_json),
    }
  }

  /* ------------------------------- 识别结果 ------------------------------- */

  insertRecognition(rec: RecognitionRec) {
    const { owner_id, image_id, sample_id, created_at, ...payload } = rec
    this.db
      .prepare(
        'INSERT OR REPLACE INTO recognitions (task_id,image_id,owner_id,sample_id,payload_json,created_at) VALUES (?,?,?,?,?,?)',
      )
      .run(rec.task_id, image_id, owner_id, sample_id, JSON.stringify(payload), created_at)
  }

  getRecognition(task_id: string): RecognitionRec | undefined {
    const row = this.db.prepare('SELECT * FROM recognitions WHERE task_id = ?').get(task_id) as any
    if (!row) return undefined
    return {
      ...JSON.parse(row.payload_json),
      image_id: row.image_id,
      owner_id: row.owner_id,
      sample_id: row.sample_id,
      created_at: row.created_at,
    }
  }

  /* ------------------------------ ConfirmedSolution ------------------------------ */

  insertConfirmation(sol: ConfirmedSolution) {
    this.db
      .prepare(
        'INSERT INTO confirmations (confirm_id,task_id,owner_id,version,payload_json,confirmed_at) VALUES (?,?,?,?,?,?)',
      )
      .run(sol.confirm_id, sol.task_id, sol.confirmed_by, sol.version, JSON.stringify(sol), sol.confirmed_at)
  }

  getConfirmation(confirm_id: string): ConfirmedSolution | undefined {
    const row = this.db.prepare('SELECT payload_json FROM confirmations WHERE confirm_id = ?').get(confirm_id) as any
    return row ? (JSON.parse(row.payload_json) as ConfirmedSolution) : undefined
  }

  listConfirmationsByTask(task_id: string): ConfirmedSolution[] {
    const rows = this.db
      .prepare('SELECT payload_json FROM confirmations WHERE task_id = ? ORDER BY version ASC')
      .all(task_id) as any[]
    return rows.map((r) => JSON.parse(r.payload_json) as ConfirmedSolution)
  }

  /* --------------------------------- 定位 --------------------------------- */

  insertLocate(rec: LocateRec) {
    this.db
      .prepare('INSERT OR REPLACE INTO locates (confirm_id,owner_id,payload_json,created_at) VALUES (?,?,?,?)')
      .run(rec.confirm_id, rec.owner_id, JSON.stringify(rec.result), rec.created_at)
  }

  getLocate(confirm_id: string): LocateResult | undefined {
    const row = this.db.prepare('SELECT payload_json FROM locates WHERE confirm_id = ?').get(confirm_id) as any
    return row ? (JSON.parse(row.payload_json) as LocateResult) : undefined
  }

  /* --------------------------------- 批改 --------------------------------- */

  insertGrading(rec: GradingRec, stemSnippet: string) {
    const r = rec.result
    this.db
      .prepare(
        `INSERT OR REPLACE INTO gradings
         (task_id,confirm_id,owner_id,overall,primary_label,first_error_step,question_id,method,stem_snippet,source_type,payload_json,derivation_json,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        rec.task_id,
        rec.confirm_id,
        rec.owner_id,
        r.overall,
        r.error_localization.primary_label,
        r.error_localization.first_error_step,
        r.provenance.question_id,
        r.method,
        stemSnippet,
        r.provenance.source_type,
        JSON.stringify(r),
        JSON.stringify(rec.derivation),
        rec.created_at,
      )
  }

  getGrading(task_id: string): GradingRec | undefined {
    const row = this.db.prepare('SELECT * FROM gradings WHERE task_id = ?').get(task_id) as any
    if (!row) return undefined
    return {
      task_id: row.task_id,
      confirm_id: row.confirm_id,
      owner_id: row.owner_id,
      result: JSON.parse(row.payload_json) as GradeResult,
      derivation: JSON.parse(row.derivation_json),
      created_at: row.created_at,
    }
  }

  listGradings(owner_id: string, opts: { labels?: string[]; overall?: string; limit?: number } = {}): RecordSummary[] {
    const where: string[] = ['owner_id = ?']
    const params: any[] = [owner_id]
    if (opts.labels?.length) {
      where.push(`primary_label IN (${opts.labels.map(() => '?').join(',')})`)
      params.push(...opts.labels)
    }
    if (opts.overall) {
      where.push('overall = ?')
      params.push(opts.overall)
    }
    const limit = Math.min(100, opts.limit ?? 50)
    const rows = this.db
      .prepare(
        `SELECT task_id,created_at,overall,primary_label,first_error_step,question_id,method,stem_snippet,source_type
         FROM gradings WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`,
      )
      .all(...params) as RecordSummary[]
    return rows
  }

  labelCounts(owner_id: string): { label: string; count: number }[] {
    return this.db
      .prepare(
        `SELECT primary_label AS label, COUNT(*) AS count FROM gradings
         WHERE owner_id = ? AND primary_label IS NOT NULL GROUP BY primary_label ORDER BY count DESC`,
      )
      .all(owner_id) as { label: string; count: number }[]
  }

  overallCounts(owner_id: string): { overall: string; count: number }[] {
    return this.db
      .prepare('SELECT overall, COUNT(*) AS count FROM gradings WHERE owner_id = ? GROUP BY overall')
      .all(owner_id) as { overall: string; count: number }[]
  }

  /* --------------------------------- 备注 --------------------------------- */

  getNote(grade_task_id: string): NoteRec | undefined {
    return this.db.prepare('SELECT * FROM notes WHERE grade_task_id = ?').get(grade_task_id) as NoteRec | undefined
  }

  upsertNote(grade_task_id: string, owner_id: string, note: string) {
    this.db
      .prepare(
        `INSERT INTO notes (grade_task_id,owner_id,note,updated_at) VALUES (?,?,?,?)
         ON CONFLICT(grade_task_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
      )
      .run(grade_task_id, owner_id, note, nowIso())
  }
}

/* --------------------------------- 工具函数 -------------------------------- */

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString('hex')
}

function phashDistance(a: string, b: string): number {
  try {
    const x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
    return x.toString(2).replace(/0/g, '').length
  } catch {
    return 64
  }
}

export const repo = new Repo()
export { nowIso, phashDistance }
