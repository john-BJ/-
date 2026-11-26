/**
 * UI 走查（puppeteer-core + 本机 Edge）
 * 覆盖：登录 → 批改台全流程 → 我的错题 → 设置/模型连接 → 知识脉络；两档视口测横向溢出
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer, { type Page } from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../shots')
fs.mkdirSync(OUT, { recursive: true })

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'

const logs: string[] = []
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function clickText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((t) => {
    const btns = Array.from(document.querySelectorAll('button'))
    const el = btns.find((b) => (b.textContent ?? '').replace(/\s+/g, '').includes(t))
    if (!el) return false
    ;(el as HTMLButtonElement).click()
    return true
  }, text)
}

async function measure(page: Page, label: string) {
  const m = await page.evaluate(() => {
    const de = document.documentElement
    const inner = window.innerWidth
    const offenders: { tag: string; cls: string; right: number }[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.right > inner + 2) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: String((el as HTMLElement).className ?? '').slice(0, 40),
          right: Math.round(r.right),
        })
      }
    }
    return {
      inner,
      scrollWidth: de.scrollWidth,
      overflow: de.scrollWidth > inner + 1,
      offenders: offenders.slice(0, 5),
    }
  })
  if (m.overflow) {
    console.log(`✗ [${label}] 横向溢出 ${m.scrollWidth - m.inner}px ${JSON.stringify(m.offenders)}`)
    logs.push(`[${label}] 横向溢出`)
  } else {
    console.log(`✓ [${label}] 无横向滚动 (${m.inner}px)`)
  }
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
}

async function run(width: number, height: number, tag: string) {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`],
    defaultViewport: { width, height, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 },
  })
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('response', (r) => {
    if (r.status() === 404) errors.push(`404 ${r.url()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
  })

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForSelector('.auth-card', { timeout: 15000 })
  await measure(page, `${tag} login`)
  await shot(page, `${tag}-0-login`)

  const okLogin = await clickText(page, '用演示账号体验')
  if (!okLogin) throw new Error('未找到演示登录按钮')
  await page.waitForSelector('.stepper', { timeout: 20000 })

  await measure(page, `${tag} upload`)
  await shot(page, `${tag}-1-upload`)

  await page.waitForSelector('.sample-card')
  await page.evaluate(() => (document.querySelector('.sample-card') as HTMLButtonElement).click())
  await page.waitForFunction(
    () => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        (x.textContent ?? '').includes('开始双通道识别'),
      )
      return b && !b.hasAttribute('disabled')
    },
    { timeout: 20000 },
  )
  await shot(page, `${tag}-2-ready`)

  await clickText(page, '开始双通道识别')
  await page.waitForSelector('.progress-wrap', { timeout: 10000 })
  await shot(page, `${tag}-3-recognizing`)

  await page.waitForSelector('.step-card', { timeout: 40000 })
  await wait(400)
  await page.evaluate(() => window.scrollTo(0, 0))
  await wait(250)
  await measure(page, `${tag} confirm`)
  await shot(page, `${tag}-4-confirm`)
  await page.evaluate(() =>
    (document.querySelector('.step-card') as HTMLElement)?.scrollIntoView({ block: 'start' }),
  )
  await wait(400)
  await shot(page, `${tag}-4b-confirm-steps`)

  await page.evaluate(() => {
    document.querySelectorAll('.conflict-box:not(.resolved)').forEach((box) => {
      const btns = box.querySelectorAll('button.candidate')
      if (btns[1]) (btns[1] as HTMLButtonElement).click()
    })
  })
  await wait(300)

  const okConfirm = await clickText(page, '确认无误，进入批改')
  if (!okConfirm) throw new Error('未找到确认按钮')
  await page.waitForSelector('.error-card', { timeout: 40000 })
  await wait(400)
  await page.evaluate(() => window.scrollTo(0, 0))
  await wait(250)
  await measure(page, `${tag} grade`)
  await shot(page, `${tag}-5-grade`)
  await page.evaluate(() =>
    (document.querySelector('.error-card') as HTMLElement)?.scrollIntoView({ block: 'start' }),
  )
  await wait(400)
  await shot(page, `${tag}-5b-grade-error`)

  await clickText(page, '解锁完整解析')
  await page.waitForSelector('.derivation', { timeout: 10000 })
  await page.evaluate(() =>
    (document.querySelector('.derivation') as HTMLElement)?.scrollIntoView({ block: 'center' }),
  )
  await wait(400)
  await shot(page, `${tag}-6-derivation`)

  await clickText(page, '我的错题')
  await page.waitForSelector('.record-card', { timeout: 15000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await wait(300)
  await measure(page, `${tag} records`)
  await shot(page, `${tag}-7-records`)

  await page.evaluate(() => (document.querySelector('.record-card') as HTMLButtonElement).click())
  await page.waitForSelector('.modal-card', { timeout: 10000 })
  await wait(500)
  await shot(page, `${tag}-8-record-detail`)
  await page.keyboard.press('Escape')
  await wait(300)

  await page.evaluate(() => (document.querySelector('.user-chip') as HTMLButtonElement).click())
  await page.waitForSelector('.modal-card', { timeout: 10000 })
  await clickText(page, '测试连接')
  await wait(1500)
  await shot(page, `${tag}-9-settings`)
  await page.keyboard.press('Escape')
  await wait(200)

  await clickText(page, '知识脉络')
  await page.waitForSelector('.line-block', { timeout: 15000 })
  await wait(300)
  await measure(page, `${tag} bank`)
  await shot(page, `${tag}-10-bank`)

  if (errors.length) {
    console.log(`  ⚠ 前端报错 ${errors.length} 条：`)
    errors.slice(0, 6).forEach((e) => console.log(`    ${e}`))
    logs.push(`[${tag}] ${errors.join(' | ')}`)
  } else {
    console.log(`  ✓ [${tag}] 无 console/page 报错`)
  }

  await browser.close()
}

async function main() {
  await run(1440, 1000, 'desktop')
  await run(375, 812, 'mobile')
  console.log('\n截图目录：', OUT)
  if (logs.length) {
    console.log('\n问题汇总：')
    logs.forEach((l) => console.log(' -', l))
    process.exit(2)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
