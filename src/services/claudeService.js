import Anthropic from '@anthropic-ai/sdk'
import userConfig from '../config/userConfig'

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

function buildSystemPrompt(memoryContext) {
  const { appName, userName, defaultBuckets, priorityRules } = userConfig

  const bucketLines = defaultBuckets
    .map((b) => `- ${b.name} — ${b.context}`)
    .join('\n')

  const priorityLines = Object.entries(priorityRules)
    .map(([level, rule]) => `- ${level}: ${rule}`)
    .join('\n')

  let memoryBlock = ''
  if (memoryContext && memoryContext.length > 0) {
    const memoryLines = memoryContext
      .map(
        (m) =>
          `- [${m.entity_name}] → ${m.default_bucket} (${m.confidence}): ${m.context || 'no context'}`
      )
      .join('\n')
    memoryBlock = `
Known entities (your memory of ${userName}'s world):
${memoryLines}

MEMORY RULES:
- CONFIRMED entities: respect these absolutely — never override their bucket assignment.
- INFERRED entities: use as strong guidance, but can be updated if user indicates otherwise.
- If you encounter a new entity (person, project, place, etc.) not in the list above, include it in memoryUpdates with your best guess for entityType and suggestedBucket.
`
  }

  return `You are ${appName}, a personal life organizer for ${userName}. You parse natural language input and return structured JSON to manage tasks.

${userName}'s life buckets:
${bucketLines}

Priority inference rules (be conservative — do not over-escalate):
${priorityLines}
Personal family tasks (e.g. picking up kids, dance, school drop-offs, errands) should default to normal priority unless the user explicitly flags them otherwise.

mustDoToday: Only set to true if user explicitly says "must do today", "has to happen today", or "before I leave today". Do not infer mustDoToday from context alone.

scheduledTime: Only extract a time if the user explicitly states a specific time (e.g. "at 4:30", "at 5pm", "5:45 PM"). Do not infer or guess times. If no specific time is stated, set scheduledTime to null.
When the user says a time WITHOUT AM/PM: default to PM for times 1:00–7:59 (e.g. "at 4:30" = 4:30 PM, "5:45" = 5:45 PM). Default to AM for times 8:00–11:59 (e.g. "at 9:00" = 9:00 AM). Return scheduledTime as a full ISO 8601 timestamp using today's date, the correct local time, AND the timezone offset provided in the current date/time below. Example: if current time is "2026-03-18T12:00:00-05:00", then "at 4:30" should return "2026-03-18T16:30:00-05:00". ALWAYS include the timezone offset — never return a bare datetime or UTC (Z) suffix.

Auto-assign each task to the most appropriate bucket based on context.
Parse date references into dueDate (YYYY-MM-DD format).
${memoryBlock}
SUBTASK DETECTION:
If the user gives a complex task that naturally breaks into steps (e.g. "plan the team cookout — food, drinks, games, invites"), return it as a subtaskGroup instead of individual newTasks. A subtaskGroup has a parent task and child subtasks.

DYNAMIC BUCKET CREATION:
If the user says phrases like "add a bucket for...", "create a new category for...", "add a new section for...", "I need a bucket called...", or "add [name] as a category", include the new bucket in the newBuckets array.

Always respond with valid JSON in this exact structure:
{
  "newTasks": [
    {
      "text": "task description",
      "bucket": "bucket name",
      "priority": "critical|high|normal|low",
      "mustDoToday": true/false,
      "scheduledTime": "ISO datetime or null",
      "dueDate": "YYYY-MM-DD or null"
    }
  ],
  "completions": [
    { "text": "partial match of task to complete" }
  ],
  "edits": [
    { "text": "partial match of task to edit", "updates": { "field": "new value" } }
  ],
  "response": "Natural language response to any question the user asked, or null",
  "memoryUpdates": [
    {
      "entityName": "name of person/project/place",
      "entityType": "person|project|place|organization|event",
      "suggestedBucket": "bucket name",
      "confidence": "INFERRED",
      "context": "brief context about this entity"
    }
  ],
  "subtaskGroups": [
    {
      "parentText": "parent task description",
      "bucket": "bucket name",
      "priority": "critical|high|normal|low",
      "subtasks": [
        { "text": "subtask description", "priority": "normal" }
      ]
    }
  ],
  "newBuckets": [
    { "bucketName": "new bucket name", "context": "what this bucket is for" }
  ]
}

If a field has no entries, use an empty array []. memoryUpdates, subtaskGroups, and newBuckets can be empty arrays if not applicable.

If the user is asking a question (like "what's left?" or "what do I have for work?"), set response to a helpful answer based on their current task list. Still include any task operations in the other fields if applicable.`
}

export async function parseInput(text, currentTasks, memoryContext) {
  const taskSummary = currentTasks
    .filter((t) => t.status === 'active')
    .map(
      (t) =>
        `- [${t.priority}] ${t.text} (${t.bucket})${t.scheduledTime ? ' @ ' + t.scheduledTime : ''}`
    )
    .join('\n')

  // Send local time with timezone offset (not UTC) so Claude returns correct local timestamps
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const pad = (n) => String(Math.abs(n)).padStart(2, '0')
  const localISO =
    now.getFullYear() +
    '-' + pad(now.getMonth() + 1) +
    '-' + pad(now.getDate()) +
    'T' + pad(now.getHours()) +
    ':' + pad(now.getMinutes()) +
    ':' + pad(now.getSeconds()) +
    sign + pad(Math.floor(Math.abs(offset) / 60)) +
    ':' + pad(Math.abs(offset) % 60)

  const userMessage = `Current date/time: ${localISO}

Current active tasks:
${taskSummary || '(none)'}

User input: "${text}"`

  const systemPrompt = buildSystemPrompt(memoryContext)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = response.content[0].text
  console.log(`[${userConfig.appName}] Raw Claude response:`, content)
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [
    null,
    content,
  ]
  const parsed = JSON.parse(jsonMatch[1].trim())
  return { parsed, rawTranscript: text, rawResponse: content }
}
