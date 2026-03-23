# MarlonOS Changelog

All notable changes to MarlonOS, ordered chronologically. Each entry follows the format:

**[Date] — [Name] — [What was built] — [Files changed]**

---

## 2026-03-18

### Initial Commit — React PWA Scaffold + Core Task System
First commit. Vite + React 19 PWA with Supabase integration. Core task parsing via Claude, basic voice input via Whisper, dark theme UI, mobile-first 480px layout.

**Files:** `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/App.css`, `src/index.css`, `src/lib/supabase.js`, `src/lib/schema.sql`, `src/services/claudeService.js`, `src/services/taskService.js`, `src/services/whisperService.js`, `src/hooks/useVoiceRecorder.js`

---

## 2026-03-19

### Vite Downgrade Fix
Downgraded Vite from v6 to v5 for PWA plugin compatibility.

**Files:** `package.json`, `package-lock.json`

---

### Transcript Logging
Added `transcripts` table and service to log every voice input with its parsed Claude output and linked task IDs. Enables future training and correction tracking.

**Files:** `src/lib/transcripts_schema.sql`, `src/services/transcriptService.js`

---

### Universal Architecture Refactor
Externalized all personal configuration into `userConfig.js`. Removed hardcoded bucket names and personal references from business logic. Made the app architecture-portable.

**Files:** `src/config/userConfig.js`, `src/lib/buckets.js`, `src/services/claudeService.js`

---

### UX Fixes — Mic Permission, Tap-to-Record, Mobile Layout
Added `useMicPermission` hook for silent mic permission check on load. Fixed tap-to-record flow. Improved mobile layout spacing for bottom nav and input bar.

**Files:** `src/hooks/useMicPermission.js`, `src/App.jsx`, `src/App.css`

---

### Memory Spine + Subtask System + Dynamic Buckets
Major feature batch. Added entity memory table with CONFIRMED/INFERRED confidence tiers. Built parent/subtask hierarchy with auto-complete parent when all children done. Voice-driven bucket creation and deletion with confirmation flow.

**Files:** `src/lib/memory_schema.sql`, `src/services/memoryService.js`, `src/hooks/useMemory.js`, `src/services/taskService.js`, `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/config/userConfig.js`, `src/App.jsx`, `src/App.css`

---

### Fix — Vite 5 Redeploy
Force redeploy with Vite 5 for Vercel compatibility.

**Files:** `package.json`

---

### Fix — Subtask Grouping and Parent Task Display
Fixed subtask detection in Claude prompt, parent task rendering with chevron expand/collapse, subtask progress counter display.

**Files:** `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/App.jsx`, `src/App.css`

---

### Batch 1 — Navigation, Three-Layer View, Due Date Chips, Bucket Colors, Delete Buckets
Full navigation system with voice and touch. Three-layer task view (Overdue/Today/Upcoming) with collapsible sections. Color-coded bucket chips. Due date chips with relative labels. Voice-driven bucket deletion with confirmation. Bottom tab navigation (Tasks/Lists).

**Files:** `src/lib/batch1_schema.sql`, `src/utils/time.js`, `src/utils/sort.js`, `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/config/userConfig.js`, `src/App.jsx`, `src/App.css`

---

## 2026-03-20

### Cold-Start Audit Fix
Full system audit and fix pass. Fixed timezone injection into Claude prompt (Chicago-only date context). Fixed append-to-parent matching. Corrected date resolution for "next Monday", "this weekend", etc. Fixed task sort order.

**Files:** `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/utils/time.js`, `src/utils/sort.js`, `src/lib/batch1_schema.sql`

---

### Batch 2 — Voice Correction, Vocabulary, Ambiguity Indicator, Voice Navigation, Mic Permission
Voice correction protocol (redo, cancel, amend, reschedule, change priority/bucket). Personal vocabulary system with voice-driven additions. Confidence/ambiguity dot indicator on low-confidence tasks. Extended navigation intents (filter by bucket, search, show overdue/upcoming). Mic permission indicator in top bar.

**Files:** `src/lib/batch2_schema.sql`, `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/config/userConfig.js`, `src/App.jsx`, `src/App.css`

---

### Fix — Batch 2 Black Screen Crash
Fixed crash on load caused by batch 2 changes (missing state initialization or import issue).

**Files:** `src/App.jsx`, `src/hooks/useTasks.js`

---

### Batch 3 — Lists System, Voice Search Modal, Smart Templates
Full lists system with permanent/session types. List service with complete CRUD, core item detection, and auto-promotion of frequently used items. `useLists` hook with optimistic UI. Claude `listIntent` recognition for 8 actions (create, add, check, remove, view, done, archive, recall). `ListsView` page with sorted cards, progress bars, type badges (gold star for permanent, clock for session). `SearchModal` bottom sheet (92% height) for list detail view and task search results. Swipe-to-delete, long-press-to-mark-core, check-all, inline item add. Voice commands work globally across tabs. Smart template pre-population from core items.

**Files created:** `src/lib/batch3_schema.sql`, `src/services/listService.js`, `src/hooks/useLists.js`, `src/pages/ListsView.jsx`, `src/components/SearchModal.jsx`
**Files modified:** `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/App.jsx`, `src/App.css`

---

### Docs — System Documentation
Added VISION.md, ARCHITECTURE.md, and CHANGELOG.md as living project documents.

**Files created:** `docs/VISION.md`, `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`

---

## 2026-03-21

### Batch 4 — Modal Mic, Empty Search Results, List Templates, Universal Modal Queries

Four interconnected features that upgrade the SearchModal from a passive display to an active voice-first interface:

**1. Mic Button Inside Search Modal**
Added voice recording capability directly inside the SearchModal. Mic button appears in the list-add-form (alongside text input and + button) for list views, and in the footer for task views. Same tap-to-start/tap-to-stop behavior as the main app. Voice status ("Recording... tap to send" / "Transcribing...") displays above the modal content. Voice commands processed through the global `addFromText` pipeline. Close commands ("done", "never mind", "close", "go back") dismiss the modal.

**2. Empty & Partial Search Results**
When a voice query returns zero results, the SearchModal opens with an intelligent no-results screen instead of showing blank. Shows the search query in the header ("No results for: [term]"), a helpful message, "Did you mean:" suggestions from the memory spine (partial match on entity_name), and a voice prompt to create a task or dismiss. Applies to both task and list searches.

**3. Smart List Seeding — Static Templates**
Created `listTemplates.js` with four template categories (packing, sports, camping, cleaning). When a new empty list opens in the modal and its name matches a template trigger word, a seeding banner appears with pre-checked suggested items. Users can remove items via X buttons, then tap "Confirm Items" or say "looks good" to save them as `is_core = true` items. After confirmation, shows "What else do you want to add?" prompt. Grocery lists intentionally have no template. First-time seeding only — never re-seeds lists that already have items.

**4. Universal Modal Query Rule**
Updated Claude system prompt with an absolute MODAL RULE: all queries (show me, find, search for, pull up, what do I have, what's left, etc.) now return `navigationIntent` with `action: "modal"` instead of `action: "filter"`. Modal intents carry structured filters: `bucket`, `timeRange`, `priority`, `searchTerm`, `listName`. All filtering is pure JavaScript — zero additional API calls. Supported time ranges: today, tomorrow, this-week, overdue, completed-today. Filters combine (e.g., bucket + timeRange). Subtasks excluded from results. The main task list never changes in-place from a voice query — the modal is always the answer.

**Files created:** `src/config/listTemplates.js`
**Files modified:** `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/components/SearchModal.jsx`, `src/App.jsx`, `src/App.css`, `docs/CHANGELOG.md`

---

## 2026-03-23

### Fix Batch — Date Lookup, Day Filtering, Modal List Voice, Delete List, Toast System, Subject-First Format

Six targeted fixes across the NLP layer, voice pipeline, and UI:

**1. Complete Date Lookup Table (Fix 1)**
Expanded `getChicagoDateContext()` in `claudeService.js` to pre-compute ALL date values: today, yesterday, tomorrow, all 7 weekdays (strictly next occurrence), thisWeekFriday (inclusive), endOfThisWeek (inclusive), nextWeekStart, nextWeekEnd. Now exported so it can be imported by `useTasks.js`. Injected as a full named lookup table into Claude's system prompt — Claude looks up dates from the table, never calculates independently. All voiceCorrection reschedule values flow through the same table.

**2. Day-Specific Modal Filtering (Fix 2)**
Updated modal filter logic in `useTasks.js` to use `getChicagoDateContext().dates` as the single source of truth. Added `timeRange` values: 'monday' through 'sunday' (each maps to that specific date), 'next-week', and refined 'today'/'tomorrow' to active-only status. Added `timeOfDay` sub-filter: parses `{ start: "HH:MM", end: "HH:MM" }` from navigationIntent and filters tasks by scheduledTime. Claude prompt updated to detect time-of-day queries.

**3. Mic Inside Modal Routes to List Context (Fix 3)**
When the SearchModal is open in list mode and the mic is used, voice now routes to `onVoiceListCommand` instead of the global `onVoiceCommand`. Added `parseListCommand()` export to `claudeService.js` — focused system prompt that always returns listIntent for add/check/remove/done. Added `handleListVoiceCommand()` in `App.jsx` that calls `parseListCommand`, processes the listIntent, and updates modal state optimistically. Added `onVoiceListCommand` and `showToast` props to SearchModal.

**4. Delete List by Voice (Fix 4)**
Added 'delete' as a valid listIntent action in Claude prompt. Added handler in `useTasks.js` listIntent section that calls `listService.deleteList()` (confirmed real DELETE, not soft-delete) and refreshes lists. Toast shown on deletion.

**5. Toast Confirmation System (Fix 5)**
Added `toast` state and `showToast(message, type)` to `App.jsx`. Toast renders as a fixed pill at top of screen (below header) with smooth fade-in animation, auto-clears after 2.5 seconds, never requires dismissal, never blocks interaction. Three types: success (gold text + checkmark), error (red + X), info (white). Wired to: task creation, voice corrections, all listIntent actions, list voice commands. `showToast` passed to `useTasks` hook as a parameter.

**6. Subject-First Task Format (Fix 6)**
Added TASK FORMAT RULE to Claude's system prompt: every task must be formatted as [Subject]: [concise action]. Subject = primary person/entity/thing. Action = 3-6 words, no filler. Examples provided for common input patterns. Applied to all tasks in newTasks and subtaskGroups.

**Files modified:** `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/components/SearchModal.jsx`, `src/App.jsx`, `src/App.css`, `docs/CHANGELOG.md`

---

## 2026-03-23

### Fix Batch — Append-to-Task Gate, Memory Fallback, Modal Mic, Delete List, Reformat Tasks, Priority Calibration

Seven targeted fixes across the task append pipeline, NLP layer, voice pipeline, list UI, and migration tooling:

**1. Remove is_parent Gate from appendToParent (Fix 1)**
The `appendToParent` matching in `useTasks.js` gated on `t.is_parent === true`, silently rejecting flat tasks that the user intended to extend. Removed the gate entirely. Now matches ALL active tasks. Added second match condition for subject-first format: if `parentIdentifier` is "Carrie & Teresa Kalhoff" and the task is "Carrie & Teresa Kalhoff: complete right bridge", the subject extracted before the colon matches. If matched task is not yet a parent, calls new `taskService.convertToParent(id)` to promote it before adding subtasks.

**2. Add Bucket to appendToParent Schema (Fix 2)**
Updated `appendToParent` schema in Claude prompt and JSON spec to include `bucket`. Claude now always suggests a bucket based on memory context when appending. In `useTasks.js` fallback path, bucket resolution order: Claude's suggestion → `memoryService.lookupEntity()` exact match → word-by-word memory scan → `Work / Advisory` default.

**3. Memory Spine Always Consulted in Fallback (Fix 3)**
When no matching parent is found, the fallback path now always runs a two-pass memory lookup before defaulting to `Work / Advisory`. Pass 1: exact entity match. Pass 2: word-by-word scan of full memory for any token longer than 2 characters. Toast shows "Created new task group for [name]".

**4. Modal Mic Identical to Main App (Fix 4)**
`handleMicToggle` in `SearchModal.jsx` now immediately sets `voiceStatus` to `'transcribing'` on tap-to-stop, matching the main app's button disable behavior. Also resets `pendingTranscription.current` to false on new recording start, preventing stuck state from prior sessions.

**5. Delete List Voice and Touch (Fix 5)**
Voice: added explicit DELETE examples to Claude prompt. Improved matching in `useTasks.js` to use three-pass fuzzy: exact match → includes → reverse includes. Toast on success and failure.
Touch: `ListsView.jsx` now accepts `onDeleteList` prop. Each list card gets a trash icon (top-right, stopPropagation). Tapping trash shows inline confirmation: "Delete [name]? Cannot be undone." with red Delete and Cancel buttons. Converted card element from `<button>` to `<div>` to allow nested button controls. Wired in `App.jsx` with toast.

**6. Reformat Existing Tasks to Subject-First Format (Fix 6)**
Created `scripts/reformat-tasks.js`. Fetches all `active`/`rolled` top-level tasks, sends each to Claude with reformatting instruction, updates Supabase in batches of 5 with 500ms delays. Logs original → reformatted for each changed task. Migration completed: 13 tasks reformatted, 7 already in correct format.

**7. Priority Calibration (Fix 7)**
Updated `userConfig.js` `priorityRules`: CRITICAL now requires explicit language only ("must do today", "critical", "urgent", "drop everything", "before I leave today", "cannot wait") — removed "high priority" and "ASAP" from CRITICAL. HIGH now captures "important", "high priority", "need to get this done today", "ASAP". NORMAL is the explicit default for all action words without urgency. Added explicit rule to Claude system prompt: "NEVER infer urgency from the type of task or importance of the client. ONLY explicit user language determines priority above NORMAL."

**Files modified:** `src/services/claudeService.js`, `src/hooks/useTasks.js`, `src/services/taskService.js`, `src/config/userConfig.js`, `src/components/SearchModal.jsx`, `src/pages/ListsView.jsx`, `src/App.jsx`, `src/App.css`
**Files created:** `scripts/reformat-tasks.js`
