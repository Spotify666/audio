/**
 * Bundles the whole app into one self-contained HTML file: every script,
 * stylesheet and icon inlined, no local asset requests. Open it straight from
 * disk, or hand the single file to someone who will not run a build.
 *
 *   node scripts/build-singlefile.mjs [out.html]
 *
 * The webfonts are still fetched from Google; without a network the page falls
 * back to system faces and works exactly the same.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] || join(ROOT, 'dist-single', 'waveprint.html')

execSync('npx vite build --outDir dist-single/raw', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, SINGLEFILE: '1' },
})

const raw = join(ROOT, 'dist-single', 'raw')
const assets = join(raw, 'assets')
const files = readdirSync(assets)
const js = files.filter((f) => f.endsWith('.js'))
if (js.length !== 1) throw new Error(`expected one js chunk, got ${js.length}: ${js.join(', ')}`)
const css = files.filter((f) => f.endsWith('.css'))

const script = readFileSync(join(assets, js[0]), 'utf8')
const styles = css.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n')
const html = readFileSync(join(raw, 'index.html'), 'utf8')
const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Waveprint'
const description = html.match(/<meta name="description"[^>]*>/)?.[0] ?? ''
const fonts = (html.match(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g) ?? []).join('\n')
const icon = readFileSync(join(ROOT, 'public', 'favicon.svg'), 'utf8').trim()

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
${description}
<meta name="theme-color" content="#141B2E">
<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${styles}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
${script}
</script>
</body>
</html>
`,
)
console.log(`${OUT} — ${(readFileSync(OUT).length / 1024).toFixed(0)} KB`)
