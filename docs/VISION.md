# MarlonOS Vision

## What Is MarlonOS

MarlonOS is a **voice-first personal operating system**. It is not a to-do app. It is a system that understands your life — who you know, what you're working on, when things are due, and how you think about your day — and lets you operate it entirely with your voice.

You speak. It listens. It structures. It remembers. Over time, it compounds its understanding of your world and gets better at anticipating what you need.

## The Two Primary Modes

### Tasks
Your daily operational surface. Tasks are organized into life buckets (Work/Advisory, Coaching, Home/Personal, Ventures — plus any you create by voice). They flow through a three-layer view: Overdue, Today, Upcoming. Parent tasks hold subtasks. Everything is sortable, filterable, and searchable by voice.

### Lists
Reusable, template-learning checklists. Grocery lists, packing lists, game day gear — anything that recurs. Lists come in two types:
- **Permanent**: recurring lists that learn their "always" items over time (e.g., your grocery staples)
- **Session**: one-time lists tied to an event (e.g., "packing list for the Dallas trip")

Lists self-assemble their core templates from usage. The system watches what you always add and promotes those items automatically.

## The North Star

**100% voice operated. Touch is a fallback.**

Every feature is designed voice-first, then given a touch equivalent for situations where voice isn't practical. The input bar at the bottom is always there, but the mic button is the primary interaction method. You should be able to manage your entire day — create tasks, complete them, build lists, check off items, navigate between views, correct mistakes — without ever typing.

## Core Architectural Principles

### AI Handles Language, JavaScript Handles Logic
Claude (Sonnet 4.5) is the NLP layer. It parses natural language into structured JSON — task extraction, intent detection, entity recognition, list operations. But it never calculates dates, sorts tasks, filters views, or decides rendering. All deterministic logic is pure JavaScript. The AI/JS boundary is strict and intentional.

### Memory Spine Compounds Over Time
The memory table is an entity knowledge graph. It tracks people, projects, places, and organizations that appear in your voice input. Each entity has a confidence tier:
- **CONFIRMED**: you explicitly corrected or validated this entity's bucket assignment — the system will never override it
- **INFERRED**: the system's best guess based on context — strong guidance but updatable
- **MENTIONED**: (future) entities referenced but not yet assigned to a bucket

When the system assigns a task to the wrong bucket and you correct it, that correction propagates back to the memory spine. The entity gets promoted to CONFIRMED and the system never makes that mistake again. This is the self-correction loop — every correction makes the system smarter.

### Nothing Is Ever Deleted, Only Archived
Tasks complete but stay in the database. Lists get archived, not destroyed. Transcripts are logged permanently. This creates a full history that can be recalled, queried, and learned from. "What was on my last grocery list?" is a valid voice command because the data is always there.

### Universal Architecture
The app is built for Marlon today, but the architecture is not hardcoded to him. All personal data lives in `userConfig.js` — name, buckets, vocabulary, timezone, priority rules. Swap that file and you have a different person's operating system. No personal references in business logic.

### Every Feature is Voice-First, Touch-Second
Features are not designed as UI components that "also support voice." They are designed as voice interactions that "also have a touch fallback." The search modal, list management, navigation between tabs, task corrections — all of these were designed around voice commands first, then given tap targets for convenience.

## Why It's Different

Every other task app starts with a form: type a title, pick a category, set a date, choose a priority. MarlonOS starts with a sentence. "For Jason Armstrong, I need to send the contract, schedule the onboarding, and set up his email." That's one voice input. The system extracts three subtasks under a parent, assigns them to the right bucket based on entity memory, sets the due date from context, and logs the transcript for future learning.

The difference is compounding intelligence. Todoist doesn't know that Jason Armstrong is a Work/Advisory client. MarlonOS does, because it learned it from the first time you mentioned him, confirmed it when you corrected a misassignment, and now applies that knowledge to every future interaction automatically.

This is not a better to-do app. It's a personal operating system that happens to manage tasks and lists as its first two capabilities.
