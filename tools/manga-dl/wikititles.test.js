// Run with: node --test   (from tools/manga-dl)
// Fixtures are made-up titles in the markup layouts Wikipedia chapter lists use.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWikipediaChapters, isJunkTitle } from './wikititles.js'

const table = (inner) => `<table class="wikitable"><tbody>${inner}</tbody></table>`
const entries = (map) => Object.fromEntries([...map].map(([k, v]) => [k, v]))

test('numbered lists that start at a volume\'s first chapter (<ol start>)', () => {
  const html = table(`
    <tr><td colspan="5"><ol start="1"><li>"Opening Move" (序, Jo)</li><li>"Second Step"</li></ol></td></tr>
    <tr><td colspan="5"><ol start="3"><li>"Third Door" (扉)</li><li value="7">"Seventh Bell"</li></ol></td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(html)), { 1: 'Opening Move', 2: 'Second Step', 3: 'Third Door', 7: 'Seventh Bell' })
})

test('bulleted items numbered in their text (N. "Title")', () => {
  const html = table(`<tr><td colspan="5"><ul><li>1. "Paper Lantern" (提灯)</li><li>2. "Rain Tax"</li><li>10.5. "Side Story"</li></ul></td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(html)), { 1: 'Paper Lantern', 2: 'Rain Tax', 10.5: 'Side Story' })
})

test('labelled entries anywhere in a table (Chapter N: / Days N:)', () => {
  const html = table(`
    <tr><td colspan="5"><ul><li>Chapter 1: "Quiet Start"</li></ul></td></tr>
    <tr><td colspan="5">Days 100: "Hundredth Morning" (朝) Days 101: "After That"</td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(html)), { 1: 'Quiet Start', 100: 'Hundredth Morning', 101: 'After That' })
})

test('the older wide-cell layouts still work: numbered, then sequential', () => {
  const numbered = table(`<tr><td colspan="4">1. "Salt Road" (塩) 2. "Iron Bridge"[3]</td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(numbered)), { 1: 'Salt Road', 2: 'Iron Bridge' })
  const sequential = table(`<tr><td colspan="4">"North Wind" (北風) "South Wind"</td></tr><tr><td colspan="4">"East Wind"</td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(sequential)), { 1: 'North Wind', 2: 'South Wind', 3: 'East Wind' })
})

test('curly quotes and footnote markers are handled', () => {
  const html = table(`<tr><td colspan="5"><ol start="5"><li>“Moon Gate”[12] (月門)</li></ol></td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(html)), { 5: 'Moon Gate' })
})

test('loose quoted words are not read as a numbered sequence when a real list exists', () => {
  // A series article: one real list plus a cast table that quotes a word in a wide cell
  const html = table(`<tr><td colspan="5"><ol start="1"><li>"Real One"</li><li>"Real Two"</li></ol></td></tr>`) +
    table(`<tr><td colspan="4">Known for the catchphrase "nonsense"</td></tr>`)
  assert.deepEqual(entries(parseWikipediaChapters(html)), { 1: 'Real One', 2: 'Real Two' })
})

test('tables that are not wikitables are ignored', () => {
  assert.equal(parseWikipediaChapters('<table><tr><td colspan="5"><ol><li>"Navbox"</li></ol></td></tr></table>').size, 0)
})

test('junk titles: bare part/volume labels and numbers', () => {
  for (const t of ['Part1', 'Part 2', 'Vol. 3', 'Chapter 12', 'ch 4', '17', ' ', 'x']) assert.equal(isJunkTitle(t), true, t)
  for (const t of ['Part of the Plan', 'Volume Control', 'The 12th Night', 'Ok']) assert.equal(isJunkTitle(t), false, t)
})
