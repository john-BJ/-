import type {
  ConfirmedSolution,
  ConfirmedStep,
  EditLog,
  GradeResult,
  LocateResult,
  Meta,
  Question,
  RecognizeResult,
  SubjectGraph,
  TaskState,
} from './types'

export class ApiError extends Error {
  code: string
  hint?: string
  status: number

  constructor(status: number, code: string, message: string, hint?: string) {
    super(message)
    this.status = status
    this.code = code
    this.hint = hint
  }
}

export interface PublicUser {
  user_id: string
  email: string
  display_name: string
}

const ACCESS_KEY = 'cuoti.access'
const REFRESH_KEY = 'cuoti.refresh'

let accessToken = localStorage.getItem(ACCESS_KEY) ?? ''
let refreshToken = localStorage.getItem(REFRESH_KEY) ?? ''

function storeTokens(access: string, refresh?: string) {
  accessToken = access
  localStorage.setItem(ACCESS_KEY, access)
  if (refresh) {
    refreshToken = refresh
    localStorage.setItem(REFRESH_KEY, refresh)
  }
}

export function logout() {
  accessToken = ''
  refreshToken = ''
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

function authBody(data: { access_token: string; refresh_token: string; user: PublicUser }): PublicUser {
  storeTokens(data.access_token, data.refresh_token)
  return data.user
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'HTTP_ERROR'
  let message = `请求失败（${res.status}）`
  let hint: string | undefined
  try {
    const data = await res.json()
    if (data?.error) {
      code = data.error.code ?? code
      message = data.error.message ?? message
      hint = data.error.hint ?? undefined
    }
  } catch {
    /* 非 JSON 响应 */
  }
  return new ApiError(res.status, code, message, hint)
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    storeTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    return false
  }
}

export async function loginWithPassword(email: string, password: string): Promise<PublicUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await parseError(res)
  return authBody(await res.json())
}

export async function registerAccount(
  email: string,
  password: string,
  display_name: string,
): Promise<PublicUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, display_name }),
  })
  if (!res.ok) throw await parseError(res)
  return authBody(await res.json())
}

export async function loginDemo(): Promise<PublicUser> {
  return loginWithPassword('demo@cuoti.local', 'demo1234')
}

/**
 * 恢复会话：有 token 就验一次，过期则尝试 refresh；失败返回 null（交给登录页处理）。
 * 注意：不再「静默自动登录演示账号」——多用户下每个账号的数据必须分开。
 */
export async function restoreSession(): Promise<PublicUser | null> {
  if (!accessToken) return null
  const me = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${accessToken}` } })
  if (me.ok) {
    const data = await me.json()
    return data.user as PublicUser
  }
  if (await tryRefresh()) {
    const retry = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${accessToken}` } })
    if (retry.ok) return ((await retry.json()).user ?? null) as PublicUser | null
  }
  logout()
  return null
}

export async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json')

  const res = await fetch(`/api${path}`, { ...init, headers })

  if (res.status === 401 && !retried) {
    if (await tryRefresh()) return request<T>(path, init, true)
    logout()
    throw new ApiError(401, 'UNAUTHENTICATED', '登录状态已失效，请重新登录')
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/* ------------------------------- 具体接口 ------------------------------- */

export const api = {
  meta: () => request<Meta>('/meta'),

  async upload(
    file: Blob,
    filename: string,
    opts: { sampleId?: string | null; phash: string; isExam: boolean },
    onProgress?: (pct: number) => void,
  ): Promise<any> {
    const send = (): Promise<any> =>
      new Promise((resolve, reject) => {
        const form = new FormData()
        // 注意顺序：字段先于文件，服务端在解析文件时才能拿到这些字段
        if (opts.sampleId) form.append('sample_id', opts.sampleId)
        form.append('phash', opts.phash)
        form.append('is_exam_question', String(opts.isExam))
        form.append('file', file, filename)

        const xhr = new XMLHttpRequest()
        const url = opts.sampleId ? `/api/uploads?sample_id=${encodeURIComponent(opts.sampleId)}` : '/api/uploads'
        xhr.open('POST', url)
        if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch {
              reject(new ApiError(500, 'BAD_JSON', '上传响应解析失败'))
            }
          } else {
            let code = 'UPLOAD_FAILED'
            let message = `上传失败（${xhr.status}）`
            try {
              const data = JSON.parse(xhr.responseText)
              code = data?.error?.code ?? code
              message = data?.error?.message ?? message
            } catch {
              /* ignore */
            }
            reject(new ApiError(xhr.status, code, message))
          }
        }
        xhr.onerror = () => reject(new ApiError(0, 'NETWORK', '网络异常，上传中断'))
        xhr.send(form)
      })

    try {
      return await send()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (await tryRefresh()) return send()
        logout()
        throw new ApiError(401, 'UNAUTHENTICATED', '登录状态已失效，请重新登录')
      }
      throw e
    }
  },

  recognize: (image_id: string, is_exam_question: boolean) =>
    request<{ task_id: string }>('/recognize', {
      method: 'POST',
      body: JSON.stringify({ image_id, is_exam_question }),
    }),

  task: (task_id: string) => request<TaskState>(`/tasks/${task_id}`),

  recognition: (task_id: string) => request<RecognizeResult>(`/recognitions/${task_id}`),

  confirm: (payload: {
    task_id: string
    steps: ConfirmedStep[]
    student_note: string
    edits: EditLog[]
    resolved_conflicts: number[]
  }) =>
    request<ConfirmedSolution>('/solutions/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  locate: (confirm_id: string) =>
    request<LocateResult>('/locate', { method: 'POST', body: JSON.stringify({ confirm_id }) }),

  grade: (confirm_id: string) =>
    request<{ task_id: string }>('/grade', { method: 'POST', body: JSON.stringify({ confirm_id }) }),

  grading: (task_id: string) => request<GradeResult>(`/gradings/${task_id}`),

  derivation: (task_id: string) =>
    request<{ derivation: { text: string; latex: string | null }[]; note: string }>(
      `/gradings/${task_id}/derivation`,
    ),

  saveNote: (task_id: string, note: string) =>
    request<{ ok: boolean }>(`/gradings/${task_id}/note`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    }),

  graph: (subject: 'math' | 'physics') => request<SubjectGraph>(`/bank/graph?subject=${subject}`),

  questions: () => request<{ total: number; items: Question[] }>('/bank/questions'),

  records: (params: { labels?: string[]; overall?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.labels?.length) qs.set('labels', params.labels.join(','))
    if (params.overall) qs.set('overall', params.overall)
    return request<RecordsResponse>(`/records${qs.toString() ? `?${qs.toString()}` : ''}`)
  },

  record: (task_id: string) => request<GradeResult & { created_at: string }>(`/records/${task_id}`),

  modelsHealth: () => request<ModelsHealth>('/models/health'),
}

export interface RecordItem {
  task_id: string
  created_at: string
  overall: 'correct' | 'partial' | 'wrong' | 'unjudged'
  primary_label: string | null
  first_error_step: number | null
  question_id: string | null
  method: string
  stem_snippet: string
  source_type: string
}

export interface RecordsResponse {
  items: RecordItem[]
  total: number
  label_stats: { label: string; count: number }[]
  overall_stats: { overall: string; count: number }[]
  filters: { labels: string[]; overall: string | null; limit: number }
}

export interface ModelsHealth {
  mode: 'mock' | 'live'
  live_ready: boolean
  checked_at: string
  providers: {
    role: string
    label: string
    model: string
    configured: boolean
    status: 'ok' | 'unconfigured' | 'failed' | 'mock'
    latency_ms?: number
    error?: string
  }[]
}

/** 轮询任务直到结束，返回最终 task（失败时也返回，由调用方读 error） */
export async function pollTask(
  task_id: string,
  onTick: (t: TaskState) => void,
  intervalMs = 550,
): Promise<TaskState> {
  const started = Date.now()
  for (;;) {
    const t = await api.task(task_id)
    onTick(t)
    if (t.status === 'succeeded' || t.status === 'failed') return t
    if (Date.now() - started > 180_000) {
      throw new ApiError(504, 'POLL_TIMEOUT', '处理超时，请稍后重试', '任务仍在服务端执行，可刷新页面查看')
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export function imageUrl(image_uri: string): string {
  const sep = image_uri.includes('?') ? '&' : '?'
  return `${image_uri}${sep}token=${encodeURIComponent(accessToken)}`
}
