#!/usr/bin/env node
// Snapshots `git log` into public/data/meta/changelog.json at dev/build time,
// so the Changelog page is "hooked up" to the repo without a runtime API call
// (and its rate limits). Run via the predev/prebuild npm hooks. Not committed
// — see .gitignore — since it would go stale the instant another commit lands.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const appDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(appDir)
const outDir = join(appDir, 'public/data/meta')
const outFile = join(outDir, 'changelog.json')

const MAX_COMMITS = 200
const RECORD_SEP = '\x1e'
const FIELD_SEP = '\x1f'

function readCommits() {
  let raw
  try {
    raw = execFileSync(
      'git',
      [
        'log',
        '--no-merges',
        `--max-count=${MAX_COMMITS}`,
        `--pretty=format:%H${FIELD_SEP}%aI${FIELD_SEP}%s${RECORD_SEP}`,
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    )
  } catch (err) {
    console.warn('[generate-changelog] git log failed, writing empty changelog:', err.message)
    return []
  }

  return raw
    .split(RECORD_SEP)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, date, message] = line.split(FIELD_SEP)
      return { sha: sha.slice(0, 7), date, message }
    })
}

const commits = readCommits()
if (commits.length <= 1) {
  console.warn(
    '[generate-changelog] only found', commits.length,
    'commit(s) — likely a shallow checkout (need `fetch-depth: 0` in CI).',
  )
}

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, JSON.stringify({ commits }))
console.log(`[generate-changelog] wrote ${commits.length} commits to ${outFile}`)
