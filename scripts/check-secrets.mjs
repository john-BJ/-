/**
 * 构建产物密钥扫描：交付前自检「前端产物里扫不到任何模型密钥」。
 * 用法：npm run build && npm run check:secrets
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.resolve(here, '../apps/web/dist')

const PATTERNS = [
  { name: 'sk- 风格密钥', re: /sk-[A-Za-z0-9_-]{16,}/g },
  { name: '32 位以上连续十六进制（疑似密钥）', re: /\b[a-f0-9]{32,}\b/gi },
  { name: 'Bearer 硬编码', re: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
  { name: 'SILICONFLOW / ZHIPU 变量名', re: /SILICONFLOW_KEY|ZHIPU_KEY/g },
  { name: 'api.siliconflow.cn', re: /api\.siliconflow\.cn/g },
  { name: 'open.bigmodel.cn', re: /open\.bigmodel\.cn/g },
]

if (!fs.existsSync(dist)) {
  console.error(`✗ 未找到构建产物：${dist}\n  请先执行 npm run build`)
  process.exit(1)
}

function walk(dir) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const files = walk(dist)
let hits = 0

for (const file of files) {
  if (!/\.(js|mjs|css|html|json|map)$/.test(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  for (const { name, re } of PATTERNS) {
    const m = text.match(re)
    if (m) {
      hits++
      console.error(`✗ ${path.relative(dist, file)} 命中「${name}」×${m.length}：${m[0].slice(0, 24)}…`)
    }
  }
}

if (hits === 0) {
  console.log(`✓ 已扫描 ${files.length} 个产物文件，未发现模型密钥或上游域名`)
  process.exit(0)
}
console.error(`\n✗ 共 ${hits} 处命中，禁止交付`)
process.exit(1)
