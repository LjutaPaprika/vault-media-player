const fs = require('fs')
const path = require('path')
const dir = 'E:\\media\\movies'
const missing = []
for (const f of fs.readdirSync(dir)) {
  const sub = path.join(dir, f)
  if (!fs.statSync(sub).isDirectory()) continue
  const json = path.join(sub, 'movie.json')
  if (!fs.existsSync(json)) { missing.push(f + ' (no movie.json)'); continue }
  try {
    const m = JSON.parse(fs.readFileSync(json, 'utf-8'))
    if (!Array.isArray(m.genre) || m.genre.length === 0) missing.push(f + ' (empty genre)')
  } catch { missing.push(f + ' (bad JSON)') }
}
if (missing.length === 0) console.log('All movies have genres assigned.')
else { console.log('Missing/empty (' + missing.length + '):'); missing.forEach((m) => console.log('  ' + m)) }
