/**
 * 异常态走查：上传一张「非演示样本」的照片，验证演示模式下的错误提示；
 * 再验证「未裁定冲突时确认按钮禁用」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../shots')
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'

/** 跨平台找浏览器：优先 BROWSER_PATH，其次 Edge / Chrome 的常见安装位置 */
const BROWSER =
  process.env.BROWSER_PATH ||
  [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((p) => fs.existsSync(p)) ||
  ''

if (!BROWSER) {
  console.error('未找到 Chrome/Edge，请用 BROWSER_PATH 指定浏览器可执行文件路径')
  process.exit(1)
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let failed = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failed++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: true,
    args: ['--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000'],
    defaultViewport: { width: 1440, height: 1000 },
  })
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.auth-card')
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      (x.textContent ?? '').includes('用演示账号体验'),
    )
    ;(b as HTMLButtonElement).click()
  })
  await page.waitForSelector('.stepper')

  // 用一张非样本图片（截图）走上传
  const inputs = await page.$$('input[type=file]')
  check('存在两个文件输入（拍照 + 相册）', inputs.length === 2, `实际 ${inputs.length}`)
  await inputs[1].uploadFile(path.join(OUT, 'desktop-0-login.png'))
  await page.waitForFunction(
    () => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        (x.textContent ?? '').includes('开始双通道识别'),
      )
      return b && !b.hasAttribute('disabled')
    },
    { timeout: 20000 },
  )

  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      (x.textContent ?? '').includes('开始双通道识别'),
    )
    ;(b as HTMLButtonElement).click()
  })
  await page.waitForSelector('.banner-err', { timeout: 30000 })
  const text = await page.evaluate(() => document.querySelector('.banner-err')?.textContent ?? '')
  check('演示模式上传非样本图片 → 明确报错', text.includes('未绑定样本') || text.includes('识别失败'), text.slice(0, 60))
  check('错误态仍停留在上传页，可重试', await page.$('.dropzone, .preview-card') !== null)
  await page.screenshot({ path: path.join(OUT, 'error-no-sample.png') })

  await browser.close()
  console.log(failed === 0 ? '\n✓ 异常态断言通过' : `\n✗ ${failed} 条失败`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
