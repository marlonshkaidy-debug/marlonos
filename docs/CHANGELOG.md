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
