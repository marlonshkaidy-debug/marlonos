import Anthropic from '@anthropic-ai/sdk'
import userConfig from '../config/userConfig'

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

function getChicagoDateContext() {
  const now = new Date()
  const tz = userConfig.timeZone
  const pad = (n) => String(n).padStart(2, '0')

  const chicagoYMD = now.toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = chicagoYMD.split('-').map(Number)
  const chicagoToday = new Date(y, m - 1, d)
  const dow = chicagoToday.getDay()

  const fmtYMD = (dt) =>
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  const dayLabel = (dt) =>
    dt.toLocaleDateString('en-US', { weekday: 'long' })
  const dateLabel = (dt) =>
    dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  const dayName = dayLabel(chicagoToday)
  const monthName = chicagoToday.toLocaleDateString('en-US', { month: 'long' })
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const tomorrow = new Date(chicagoToday)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Next occurrence of a weekday (same day = next week)
  const nextDow = (target) => {
    let diff = (target - dow + 7) % 7
    if (diff === 0) diff = 7
    const dt = new Date(chicagoToday)
    dt.setDate(dt.getDate() + diff)
    return dt
  }

  // This weekend = next Saturday, or today if already Sat/Sun
  let thisWeekend
  if (dow === 6) thisWeekend = new Date(chicagoToday)
  else if (dow === 0) thisWeekend = new Date(chicagoToday)
  else {
    thisWeekend = new Date(chicagoToday)
    thisWeekend.setDate(thisWeekend.getDate() + (6 - dow))
  }

  const nextMon = nextDow(1)
  const nextFri = nextDow(5)
  const nextSun = nextDow(0)

  // Compute Chicago ISO with timezone offset
  const isoParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const iGet = (type) => isoParts.find((p) => p.type === type)?.value
  let isoH = iGet('hour')
  if (isoH === '24') isoH = '00'
  const isoStr = `${iGet('year')}-${iGet('month')}-${iGet('day')}T${isoH}:${iGet('minute')}:${iGet('second')}`
  const chicagoMs = Date.UTC(
    +iGet('year'), +iGet('month') - 1, +iGet('day'),
    +isoH, +iGet('minute'), +iGet('second')
  )
  const offsetMin = Math.round((chicagoMs - now.getTime()) / 60000)
  const offSign = offsetMin >= 0 ? '+' : '-'
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60))
  const offM = pad(Math.abs(offsetMin) % 60)
  const offset = `${offSign}${offH}:${offM}`

  return {
    headerLine: `CURRENT DATETIME: ${dayName}, ${monthName} ${d}, ${y} at ${timeStr} CST. Tomorrow is ${dayLabel(tomorrow)}. This week ends on Sunday ${dateLabel(nextSun)}. This Friday is ${dateLabel(nextFri)}.`,
    dateResolution: `DATE RESOLUTION — use ONLY these pre-computed dates, never calculate your own:
- Today: ${fmtYMD(chicagoToday)} (${dayName})
- Tomorrow: ${fmtYMD(tomorrow)} (${dayLabel(tomorrow)})
- This weekend: ${fmtYMD(thisWeekend)} (${dayLabel(thisWeekend)})
- Monday / next Monday: ${fmtYMD(nextMon)}
- Friday / by Friday / end of week: ${fmtYMD(nextFri)}
- Next week: starts ${fmtYMD(nextMon)}
- "in X days": add X to today's date ${fmtYMD(chicagoToday)}
- For any named day (e.g. "Tuesday", "Saturday"): use the NEXT occurrence after today
- dueDate must always be YYYY-MM-DD format
- scheduledTime must always include the timezone offset ${offset}`,
    iso: `${isoStr}${offset}`,
    offset,
  }
}

function buildSystemPrompt(memoryContext, dateContext) {
  const { appName, userName, defaultBuckets, priorityRules } = userConfig

  const bucketLines = defaultBuckets
    .map((b) => `- ${b.name} — ${b.context}`)
    .join('\n')

  const priorityLines = Object.entries(priorityRules)
    .map(([level, rule]) => `- ${level}: ${rule}`)
    .join('\n')

  // Inject personal vocabulary
  const vocab = userConfig.personalVocabulary
  const vocabLines = Object.entries(vocab)
    .map(([term, def]) => `- ${term}: ${def}`)
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

  return `${dateContext.headerLine}

${dateContext.dateResolution}

You are ${appName}, a personal life organizer for ${userName}. You parse natural language input and return structured JSON to manage tasks.

PERSONAL VOCABULARY & KNOWN PEOPLE:
${vocabLines}
Use this vocabulary to correctly interpret abbreviations, names, and domain-specific terms in ${userName}'s speech. When Whisper transcription may have mangled a term, match it to the closest vocabulary entry.

${userName}'s life buckets:
${bucketLines}

Priority inference rules (be conservative — do not over-escalate):
${priorityLines}
Personal family tasks (e.g. picking up kids, dance, school drop-offs, errands) should default to normal priority unless the user explicitly flags them otherwise.

mustDoToday: Only set to true if user explicitly says "must do today", "has to happen today", or "before I leave today". Do not infer mustDoToday from context alone.

scheduledTime: Only extract a time if the user explicitly states a specific time (e.g. "at 4:30", "at 5pm", "5:45 PM"). Do not infer or guess times. If no specific time is stated, set scheduledTime to null.
When the user says a time WITHOUT AM/PM: default to PM for times 1:00–7:59 (e.g. "at 4:30" = 4:30 PM, "5:45" = 5:45 PM). Default to AM for times 8:00–11:59 (e.g. "at 9:00" = 9:00 AM). Return scheduledTime as a full ISO 8601 timestamp using the task's due date, the correct local time, AND the timezone offset ${dateContext.offset}. ALWAYS include the timezone offset — never return a bare datetime or UTC (Z) suffix.

CONFIDENCE / AMBIGUITY:
For each task in newTasks and each subtaskGroup, include a "confidence" field: "high", "medium", or "low".
- "high" (default): you are confident about the bucket assignment and priority.
- "medium": the bucket or priority is a reasonable guess but could be wrong.
- "low": you are genuinely uncertain — the input is ambiguous.
Only use medium/low when genuinely uncertain. Most tasks should be "high".

Auto-assign each task to the most appropriate bucket based on context.
Parse date references into dueDate (YYYY-MM-DD format). Use ONLY the pre-computed dates from DATE RESOLUTION above — never guess or calculate dates yourself.
${memoryBlock}
VOICE CORRECTION PROTOCOL:
Detect correction intents in user input. If the user is correcting a previous action rather than creating a new task, set voiceCorrection instead of newTasks.
Correction triggers:
- "that's wrong, redo it" / "redo that" → type: "redo" (wipe last input, re-prompt)
- "never mind that last one" / "cancel that" / "ignore that" → type: "cancel" (delete most recently added tasks)
- "actually [correction]" → type: "amend", value: the corrected text/field
- "change that to [value]" → type: "amend", value: the new value
- "make that [priority] priority" → type: "priority", value: the priority level
- "that belongs in [bucket]" → type: "bucket", value: the bucket name
- "move that to [date]" → type: "reschedule", value: "YYYY-MM-DD"

VOCABULARY MANAGEMENT:
If the user says "add to my vocabulary: [term] means [definition]" or similar, set vocabularyUpdate with the term and definition.

SUBTASK DETECTION — CRITICAL RULES:
Use subtaskGroups (NOT newTasks) whenever the user provides multiple related items that belong under one umbrella. This includes:
1. Explicit grouping: "for [person/project], I need to do X, Y, Z" — the person/project becomes the parent, X/Y/Z become subtasks.
2. Multi-step tasks: "plan the team cookout — food, drinks, games, invites" — the plan is the parent, items are subtasks.
3. Lists tied to a context: "things for the trip: pack bags, book hotel, get snacks" — the trip is the parent, items are subtasks.

EXAMPLES:
- Input: "for Jason Armstrong I need to send the contract, schedule the onboarding call, and set up his email"
  → subtaskGroups: [{ parentText: "Jason Armstrong tasks", subtasks: [{text: "Send the contract"}, {text: "Schedule the onboarding call"}, {text: "Set up his email"}] }]
  → newTasks: []

- Input: "for the Henderson project, review blueprints, order materials, and call the inspector"
  → subtaskGroups: [{ parentText: "Henderson project", subtasks: [{text: "Review blueprints"}, {text: "Order materials"}, {text: "Call the inspector"}] }]
  → newTasks: []

- Input: "pick up groceries and call mom"
  → These are UNRELATED tasks, so they go in newTasks as individual items, NOT subtaskGroups.

RULE: If tasks share a common subject/person/project/context, they MUST go into subtaskGroups. Only use newTasks for standalone, unrelated tasks. When in doubt, prefer subtaskGroups over flat newTasks.

APPEND TO EXISTING PARENT TASK:
If the user says "add to [name]'s tasks", "add another task for [name]", "add to the [task name]", "also for [name]...", or similar phrases indicating they want to add subtasks to an EXISTING parent task (one already in their current task list), use appendToParent instead of subtaskGroups.
- Set parentIdentifier to a string that partially matches the existing parent task's text (case-insensitive).
- Set newSubtasks to the array of new subtasks to add under that parent.
- Do NOT create a new parent via subtaskGroups when the user clearly wants to add to an existing one.

DYNAMIC BUCKET CREATION:
If the user says phrases like "add a bucket for...", "create a new category for...", "add a new section for...", "I need a bucket called...", or "add [name] as a category", include the new bucket in the newBuckets array.

DELETE BUCKET:
If the user says "delete the [bucket name] bucket", "remove the [bucket name] bucket", or similar, include a deleteBucket object.
- Set "bucketName" to the bucket name they want to delete.
- Set "confirmed" to false initially. If the user says "confirm" in the context of a pending bucket deletion, set "confirmed" to true.
- Default buckets (Work / Advisory, Coaching, Home / Personal, Ventures) CANNOT be deleted. If the user tries, set response to "That's a default bucket and cannot be deleted" and leave deleteBucket as null.

NAVIGATION & SEARCH:
Detect navigation, filtering, and search intents. Set navigationIntent when the user wants to navigate, filter, or search.
- "go to lists" / "show me my lists" / "open lists" → action: "navigate", target: "lists"
- "go to tasks" / "show me my tasks" / "back to tasks" → action: "navigate", target: "tasks"
- "show me my [bucket] list" / "show me [bucket] tasks" → action: "filter", target: "tasks", filter: "[bucket name]"
- "show me everything" / "show all" → action: "filter", target: "tasks", filter: "all"
- "show me overdue" → action: "filter", target: "tasks", filter: "overdue"
- "show me upcoming" → action: "filter", target: "tasks", filter: "upcoming"
- "find [term]" / "search for [term]" / "show me [person] tasks" → action: "search", filter: "[term]"
Also still set the legacy "navigation" field for basic "tasks"/"lists" navigation for backward compatibility.

LIST MANAGEMENT — HIGHEST PRIORITY INTENT:
The word "list" in user input is the PRIMARY trigger for listIntent. If the user's input contains the word "list" and they are talking about a list object (grocery list, packing list, shopping list, gear list, etc.), you MUST set listIntent and MUST leave newTasks as an empty array []. listIntent and newTasks are MUTUALLY EXCLUSIVE when the input is about lists.

CRITICAL RULES:
- "Create a [name] list" / "new [name] list" / "start a [name] list" → ALWAYS listIntent CREATE, NEVER newTasks
- "Add [items] to my [name] list" → ALWAYS listIntent ADD, NEVER newTasks
- "Show me my [name] list" / "pull up [name] list" / "what's on my [name] list" → ALWAYS listIntent VIEW, NEVER newTasks
- "[name] list done" / "done with [name] list" / "mark [name] list done" / "finished the [name] list" / "finished [name] list" → ALWAYS listIntent DONE, NEVER newTasks
- Any phrase ending in "list" that refers to a checklist/shopping list/packing list → ALWAYS listIntent, NEVER newTasks
- Only use newTasks when the user is creating actual tasks/to-dos, NOT lists

Detect list-related intents and set listIntent when the user wants to interact with lists. listIntent works globally regardless of which tab is active.
Actions:
- CREATE: "create a [permanent/session] list called X" / "start a packing list for X" / "new grocery list" / "make a grocery list"
  → action: "create", listName: "X", createType: "permanent"|"session", context: "optional context"
- ADD: "add [items] to my [list name] list" / "add [item] to [list name]" / "put [items] on the [list name] list"
  → action: "add", listName: "list name", items: ["item1", "item2"]
- CHECK: "got the [items]" / "[items] done" / "check off [item] from [list name]"
  → action: "check", listName: "list name", markDone: ["item1", "item2"]
- REMOVE: "remove [item] from [list name]" / "take [item] off [list name]"
  → action: "remove", listName: "list name", removeItems: ["item1"]
- VIEW: "show me my [list name] list" / "pull up [list name]" / "what's on my [list name]"
  → action: "view", listName: "list name"
- DONE: "[list name] done" / "done with [list name]" / "mark [list name] done" / "mark [list name] complete" / "finished the [list name]" / "finished [list name] list" / "[list name] list done"
  → action: "done", listName: "list name" (checks all items)
- ARCHIVE: "archive [list name]" / "I'm done with [list name]" → action: "archive", listName: "list name"
- RECALL: "show me my last [list name]" / "what was on my last grocery list" → action: "recall", listName: "list name"

Permanent vs Session detection:
- Permanent: "grocery list", "football gear", "always pack", any recurring list name
- Session: "packing list for X", "list for X trip", "shopping list for X event" — anything tied to a specific occasion

Always respond with valid JSON in this exact structure:
{
  "newTasks": [
    {
      "text": "task description",
      "bucket": "bucket name",
      "priority": "critical|high|normal|low",
      "confidence": "high|medium|low",
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
      "confidence": "high|medium|low",
      "subtasks": [
        { "text": "subtask description", "priority": "normal" }
      ]
    }
  ],
  "newBuckets": [
    { "bucketName": "new bucket name", "context": "what this bucket is for" }
  ],
  "deleteBucket": null,
  "appendToParent": null,
  "navigation": null,
  "navigationIntent": null,
  "listIntent": null,
  "voiceCorrection": null,
  "vocabularyUpdate": null
}

deleteBucket, when present, should be: { "bucketName": "bucket name", "confirmed": true/false }
appendToParent, when present, should be: { "parentIdentifier": "partial match of existing parent task text", "newSubtasks": [{ "text": "subtask description", "priority": "normal" }] }
navigation, when present, should be: "tasks" or "lists"
navigationIntent, when present, should be: { "action": "navigate|filter|search", "target": "tasks|lists", "filter": "bucket name or search term or null" }
listIntent, when present, should be: { "action": "create|add|check|remove|view|done|archive|recall", "listName": "name of the list", "items": ["items to add"], "markDone": ["items to check"], "removeItems": ["items to remove"], "createType": "permanent|session", "context": "optional context for session lists" }
voiceCorrection, when present, should be: { "type": "redo|cancel|amend|priority|bucket|reschedule", "targetDescription": "description of what is being corrected", "action": "what to do", "value": "the new value if applicable" }
vocabularyUpdate, when present, should be: { "term": "the term", "definition": "the definition" }

If a field has no entries, use an empty array []. memoryUpdates, subtaskGroups, and newBuckets can be empty arrays if not applicable. deleteBucket, appendToParent, navigation, navigationIntent, listIntent, voiceCorrection, and vocabularyUpdate default to null.

If the user is asking a question (like "what's left?" or "what do I have for work?"), set response to a helpful answer based on their current task list. Still include any task operations in the other fields if applicable.`
}

export async function parseInput(text, currentTasks, memoryContext) {
  const taskSummary = currentTasks
    .filter((t) => t.status === 'active')
    .map(
      (t) =>
        `- [${t.priority}]${t.is_parent ? ' [PARENT]' : ''} ${t.text} (${t.bucket})${t.scheduledTime ? ' @ ' + t.scheduledTime : ''}`
    )
    .join('\n')

  const dateContext = getChicagoDateContext()

  const userMessage = `Current date/time: ${dateContext.iso}

Current active tasks:
${taskSummary || '(none)'}

User input: "${text}"`

  const systemPrompt = buildSystemPrompt(memoryContext, dateContext)

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
