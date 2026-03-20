# MarlonOS Architecture

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | React 19 | Modern hooks, fast rendering, PWA-ready |
| **Build** | Vite 5 + vite-plugin-pwa | Instant HMR, PWA manifest/service worker generation |
| **NLP** | Claude Sonnet 4.5 (Anthropic SDK) | Best-in-class natural language parsing for structured JSON extraction |
| **Voice** | OpenAI Whisper (whisper-1) | Industry-standard speech-to-text, handles accents and domain vocabulary |
| **Database** | Supabase (PostgreSQL) | Real-time, hosted Postgres with instant API, row-level security |
| **Routing** | react-router-dom v7 | Installed but currently unused — tab-based navigation handled by state |
| **Deployment** | Vercel | Auto-deploy from GitHub, zero-config for Vite |
| **Design** | Custom CSS (no framework) | Dark theme, mobile-first, 480px max-width, gold accent (#c9a84c) |

## Data Flow

```
Voice Input
    |
    v
[MediaRecorder] --> audioBlob
    |
    v
[Whisper API] --> raw transcript text
    |
    v
[Claude Sonnet 4.5] + system prompt (date context, memory, buckets, vocabulary)
    |
    v
Structured JSON response
    |
    v
[useTasks hook] processes each field:
    - newTasks --> taskService.addTask() --> Supabase tasks table
    - subtaskGroups --> taskService.addParentTask() + addSubtask()
    - completions --> taskService.completeTask() / completeSubtask()
    - edits --> taskService.updateTask()
    - memoryUpdates --> memoryService.upsertEntity()
    - voiceCorrection --> taskService.updateTask() / deleteTask()
    - navigationIntent --> setActiveNav() / setActiveBucket() / setSearchTerm()
    - listIntent --> listService.createList() / addItem() / checkItem() / etc.
    - newBuckets --> userConfig.addCustomBucket()
    - deleteBucket --> userConfig.removeCustomBucket()
    - vocabularyUpdate --> userConfig.addVocabularyTerm()
    |
    v
[React UI] re-renders with updated state
```

## What Claude Handles vs What JavaScript Handles

| Responsibility | Owner | Why |
|---------------|-------|-----|
| Parse natural language into structured intents | **Claude** | Language is ambiguous; AI excels here |
| Extract task text, bucket, priority from speech | **Claude** | Requires context understanding |
| Detect correction intent ("redo that", "cancel") | **Claude** | Natural language pattern matching |
| Detect list intents (create, add, check, view) | **Claude** | Requires understanding user intent |
| Recognize entities (people, projects, places) | **Claude** | Named entity recognition |
| Suggest bucket assignment for new entities | **Claude** | Requires world knowledge |
| Detect subtask grouping ("for X, do A, B, C") | **Claude** | Semantic relationship detection |
| Calculate dates ("next Tuesday", "by Friday") | **JavaScript** | Pre-computed in `getChicagoDateContext()` — injected into prompt |
| Sort tasks by priority/time/completion | **JavaScript** | `utils/sort.js` — deterministic |
| Group tasks into Overdue/Today/Upcoming | **JavaScript** | `utils/time.js` — date math |
| Filter by bucket, search term | **JavaScript** | Array filtering in `useMemo` |
| Timezone handling | **JavaScript** | All dates computed in America/Chicago |
| Optimistic UI updates | **JavaScript** | State updates before API confirms |
| Memory confidence tier enforcement | **JavaScript** | Never downgrade CONFIRMED to INFERRED |
| Core item auto-promotion (lists) | **JavaScript** | `promoteCoreItems()` counts occurrences |
| Bucket color assignment | **JavaScript** | `userConfig.getBucketColor()` |

## Database Schema

### `tasks`
Primary table. Stores all tasks including subtasks (linked via `parent_task_id`).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| text | text | Task description |
| bucket | text | Life bucket name |
| priority | enum | critical, high, normal, low |
| mustDoToday | boolean | Explicit "must do today" flag |
| scheduledTime | timestamptz | Optional specific time |
| dueDate | date | YYYY-MM-DD, defaults to today |
| status | enum | active, completed, rolled |
| confidence | text | high, medium, low (ambiguity indicator) |
| completedAt | timestamptz | When completed |
| createdAt | timestamptz | When created |
| archivedAt | timestamptz | Soft delete timestamp |
| parent_task_id | uuid (FK) | Links subtask to parent |
| is_parent | boolean | True for parent tasks |
| subtask_order | integer | Sort order within parent |

### `transcripts`
Every voice/text input is logged with its parsed Claude output.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| raw_transcript | text | Original user input |
| parsed_output | jsonb | Full Claude JSON response |
| task_ids | uuid[] | Tasks created from this input |
| was_corrected | boolean | Marked if user corrected |
| correction_notes | text | What was corrected |
| created_at | timestamptz | Timestamp |

### `memory`
Entity knowledge graph — the memory spine.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| entity_name | text | Person, project, place name (unique) |
| entity_type | text | person, project, place, organization, event |
| default_bucket | text | Assigned bucket |
| context | text | Brief description |
| confidence | text | CONFIRMED or INFERRED |
| correction_count | integer | How many times corrected |
| last_referenced | timestamptz | Recency tracking |
| created_at | timestamptz | First seen |

### `lists`
Reusable checklists with permanent/session typing.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| name | text | List name (unique) |
| type | text | permanent or session |
| context | text | Optional description (e.g., "Dallas trip") |
| is_archived | boolean | Archived flag |
| created_at | timestamptz | Timestamp |
| archived_at | timestamptz | When archived |

### `list_items`
Individual items within a list.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| list_id | uuid (FK) | Parent list, cascades on delete |
| text | text | Item description |
| is_core | boolean | Part of the "Always" template |
| is_checked | boolean | Checked off |
| item_order | integer | Sort order |
| created_at | timestamptz | Timestamp |
| checked_at | timestamptz | When checked |

## Service Layer

| Service | File | Responsibility |
|---------|------|---------------|
| **claudeService** | `services/claudeService.js` | Builds system prompt with date context, memory, vocabulary, buckets. Sends to Claude, parses JSON response. Single export: `parseInput()`. |
| **taskService** | `services/taskService.js` | Full CRUD for tasks table. Handles parent/subtask creation, completion (with auto-complete parent), rollover. |
| **listService** | `services/listService.js` | Full CRUD for lists and list_items. Core item detection, archival, template pre-population, auto-promotion of frequently used items. All functions fail silently. |
| **memoryService** | `services/memoryService.js` | Entity CRUD with confidence tier enforcement. Never downgrades CONFIRMED to INFERRED. Tracks last_referenced for recency. |
| **transcriptService** | `services/transcriptService.js` | Logs every input/output pair. Links task IDs post-creation. Marks corrections. |
| **whisperService** | `services/whisperService.js` | Sends audio blob to OpenAI Whisper API, returns transcript text. Handles webm/mp4 format detection. |

## Hook Layer

| Hook | File | Manages |
|------|------|---------|
| **useTasks** | `hooks/useTasks.js` | Central orchestrator. Loads tasks, processes Claude's full JSON response (15+ intent types), manages search modal state, voice corrections, navigation, bucket management, list intent routing. |
| **useLists** | `hooks/useLists.js` | Loads all lists with items, sorts permanent-first. Optimistic UI for check/uncheck/delete. Exposes create, check, archive, delete, toggle core. |
| **useMemory** | `hooks/useMemory.js` | Loads memory entities, exposes confirm/refresh. |
| **useVoiceRecorder** | `hooks/useVoiceRecorder.js` | MediaRecorder wrapper. Start/stop recording, produces audioBlob. Handles mime type negotiation (webm > mp4 > default). |
| **useMicPermission** | `hooks/useMicPermission.js` | Checks/requests mic permission on mount. Persists grant in localStorage. Exposes permission state for UI indicators. |

## Config System

`src/config/userConfig.js` is the single source of personal configuration:

- **appName / userName**: Injected into Claude's system prompt
- **defaultBuckets**: 4 base + any custom (persisted in localStorage)
- **priorityRules**: Conservative rules injected into prompt — Claude follows these
- **timeZone**: `America/Chicago` — all date computation uses this
- **personalVocabulary**: Base vocabulary (IDI, AOR, CE, 7v7, names) + custom terms added by voice. Injected into prompt so Claude and Whisper corrections work together.
- **Bucket colors**: Fixed for defaults, auto-assigned from rotation for custom
- **Dynamic bucket management**: Add/remove buckets at runtime by voice

## Memory Spine Architecture

The memory spine is an entity knowledge graph that compounds over time:

1. **Entity Discovery**: Claude encounters a new name (person, project, place) in voice input. It includes the entity in `memoryUpdates` with an INFERRED confidence level and best-guess bucket.

2. **Storage**: `memoryService.upsertEntity()` writes to the `memory` table. If the entity exists and is CONFIRMED, it only updates `last_referenced`.

3. **Prompt Injection**: On every voice input, all memory entities are loaded and injected into Claude's system prompt. Claude sees the full entity graph and uses it for bucket assignment.

4. **Self-Correction**: When a user corrects a bucket assignment ("that belongs in Work/Advisory"), the entity gets promoted to CONFIRMED with `correction_count` incremented. Future inputs for that entity will always respect the confirmed bucket.

5. **Recency Tracking**: `last_referenced` updates every time an entity's name appears in voice input, keeping the memory spine current.

## Deployment

- **Repository**: GitHub (`marlonshkaidy-debug/marlonos`)
- **Hosting**: Vercel (auto-deploys from `main` branch)
- **Database**: Supabase (hosted PostgreSQL)
- **Environment Variables** (Vercel + local `.env`):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_ANTHROPIC_API_KEY`
  - `VITE_OPENAI_API_KEY`
- **Build**: `vite build` produces static assets in `dist/`
- **PWA**: Service worker auto-generated by vite-plugin-pwa, precaches all assets

## Build Prompt Standard

Every Claude Code build session for MarlonOS must:

1. **Begin** with a full cold-start system read of all files before touching anything
2. **End** with updating `docs/CHANGELOG.md` with what was built, files changed, and the date
