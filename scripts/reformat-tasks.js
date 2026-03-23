/**
 * reformat-tasks.js
 * Rewrites all active/rolled task texts to subject-first format via Claude.
 *
 * Usage:
 *   node --env-file=.env scripts/reformat-tasks.js
 *
 * Falls back to reading .env manually if --env-file is unavailable.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// ── Load .env manually (compatible with all Node versions) ──────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = join(__dirname, '..', '.env')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && !process.env[key]) process.env[key] = val
  }
} catch (_) {
  // .env not found — rely on environment variables already set
}

// ── Validate env ────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ANTHROPIC_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const claude = new Anthropic({ apiKey: ANTHROPIC_KEY })

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 500

async function reformatTaskText(text) {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 128,
    messages: [
      {
        role: 'user',
        content: `Reformat this task to subject-first format: [Subject]: [concise action]. Subject is the primary person, entity, or thing. Action is 3-6 words max, no filler words (no "For", "Do a", "Make sure to", "Please"). Return ONLY the reformatted text, nothing else. If already in correct format, return unchanged.\n\nTask: ${text}`,
      },
    ],
  })
  return response.content[0].text.trim()
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log('Fetching active/rolled tasks...')

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, text, status')
    .in('status', ['active', 'rolled'])
    .is('parent_task_id', null) // top-level tasks only

  if (error) {
    console.error('Failed to fetch tasks:', error)
    process.exit(1)
  }

  console.log(`Found ${tasks.length} tasks to process.\n`)

  let reformattedCount = 0
  let unchangedCount = 0
  let errorCount = 0

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (task) => {
        try {
          const reformatted = await reformatTaskText(task.text)
          if (reformatted === task.text) {
            console.log(`UNCHANGED: ${task.text}`)
            unchangedCount++
          } else {
            console.log(`Original:    ${task.text}`)
            console.log(`Reformatted: ${reformatted}\n`)
            const { error: updateError } = await supabase
              .from('tasks')
              .update({ text: reformatted })
              .eq('id', task.id)
            if (updateError) {
              console.error(`  ✗ Failed to update task ${task.id}:`, updateError.message)
              errorCount++
            } else {
              reformattedCount++
            }
          }
        } catch (err) {
          console.error(`  ✗ Error processing task "${task.text}":`, err.message)
          errorCount++
        }
      })
    )

    if (i + BATCH_SIZE < tasks.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  console.log('\n─────────────────────────────────')
  console.log(`Migration complete:`)
  console.log(`  ${reformattedCount} tasks reformatted`)
  console.log(`  ${unchangedCount} tasks unchanged`)
  if (errorCount > 0) console.log(`  ${errorCount} errors`)
}

main()
