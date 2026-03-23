import { useState, useEffect, useCallback, useRef } from 'react'
import * as taskService from '../services/taskService'
import * as memoryService from '../services/memoryService'
import * as listService from '../services/listService'
import { parseInput, getChicagoDateContext } from '../services/claudeService'
import { logTranscript, linkTaskIds } from '../services/transcriptService'
import { sortTasks } from '../utils/sort'
import userConfig from '../config/userConfig'

export function useTasks(showToast) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [bucketVersion, setBucketVersion] = useState(0)
  const [pendingDeleteBucket, setPendingDeleteBucket] = useState(null)
  const [navigationTarget, setNavigationTarget] = useState(null)
  const [navigationIntent, setNavigationIntent] = useState(null)
  const [searchTerm, setSearchTerm] = useState(null)
  const [reRecordRequested, setReRecordRequested] = useState(false)
  const [searchModal, setSearchModal] = useState({ isOpen: false, title: '', type: 'tasks', data: [], listId: null, query: null })
  const lastAddedTaskIds = useRef([])
  // Ref to allow list refresh callback from outside
  const listsRefreshRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const data = await taskService.getTasks()
      setTasks(sortTasks(data))
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addFromText = useCallback(
    async (text) => {
      // Load current memory context silently
      let memoryContext = []
      try {
        memoryContext = await memoryService.getMemory()
      } catch (err) {
        // Memory fails silently — never blocks main flow
      }

      const { parsed: result, rawTranscript, rawResponse } = await parseInput(
        text,
        tasks,
        memoryContext
      )

      // === DIAGNOSTIC LOGS (temporary) ===
      console.log('[DIAG] Full parsed Claude response:', JSON.stringify(result, null, 2))
      console.log('[DIAG] listIntent:', JSON.stringify(result.listIntent))
      console.log('[DIAG] newTasks count:', result.newTasks?.length ?? 0)
      console.log('[DIAG] subtaskGroups present?', Array.isArray(result.subtaskGroups), '| count:', result.subtaskGroups?.length ?? 0)
      console.log('[DIAG] newBuckets present?', Array.isArray(result.newBuckets), '| count:', result.newBuckets?.length ?? 0)
      console.log('[DIAG] memoryUpdates present?', Array.isArray(result.memoryUpdates), '| count:', result.memoryUpdates?.length ?? 0)
      // === END DIAGNOSTIC LOGS ===

      // Fire-and-forget: log transcript in background
      const transcriptPromise = logTranscript(rawTranscript, result)

      const createdTaskIds = []

      // === VOICE CORRECTION PROTOCOL ===
      if (result.voiceCorrection) {
        const vc = result.voiceCorrection
        console.log('[VoiceCorrection] type:', vc.type, '| value:', vc.value)

        if (vc.type === 'redo') {
          lastAddedTaskIds.current = []
          setReRecordRequested(true)
          await refresh()
          return result.response || 'Go ahead, re-record your input.'
        }

        if (vc.type === 'cancel') {
          if (lastAddedTaskIds.current.length > 0) {
            for (const id of lastAddedTaskIds.current) {
              try {
                await taskService.deleteTask(id)
              } catch (err) {
                console.error('[VoiceCorrection] Failed to delete task:', id, err)
              }
            }
            lastAddedTaskIds.current = []
          }
          await refresh()
          if (showToast) showToast('Cancelled', 'info')
          return result.response || 'Done — cancelled the last tasks.'
        }

        if (['amend', 'priority', 'bucket', 'reschedule'].includes(vc.type)) {
          const lastId = lastAddedTaskIds.current[lastAddedTaskIds.current.length - 1]
          if (lastId) {
            const updates = {}
            if (vc.type === 'amend') updates.text = vc.value
            if (vc.type === 'priority') updates.priority = vc.value
            if (vc.type === 'bucket') {
              updates.bucket = vc.value
              // Trigger memory spine update for bucket correction
              const lastTask = tasks.find((t) => t.id === lastId)
              if (lastTask) {
                // Extract entity from task text for memory confirmation
                memoryService.confirmEntity(lastTask.text, vc.value).catch(() => {})
              }
            }
            if (vc.type === 'reschedule') updates.dueDate = vc.value
            try {
              await taskService.updateTask(lastId, updates)
            } catch (err) {
              console.error('[VoiceCorrection] Failed to update task:', lastId, err)
              if (showToast) showToast('Something went wrong', 'error')
            }
          }
          await refresh()
          if (showToast) showToast('Updated', 'success')
          return result.response || 'Updated.'
        }
      }

      // === VOCABULARY UPDATE ===
      if (result.vocabularyUpdate) {
        const { term, definition } = result.vocabularyUpdate
        if (term && definition) {
          userConfig.addVocabularyTerm(term, definition)
          console.log('[Vocabulary] Added:', term, '→', definition)
        }
      }

      // Process newBuckets: add dynamic buckets at runtime
      if (result.newBuckets?.length) {
        for (const nb of result.newBuckets) {
          userConfig.addCustomBucket(nb.bucketName, nb.context)
        }
        // Signal bucket tabs to re-render
        setBucketVersion((v) => v + 1)
      }

      // Process memoryUpdates silently in background
      if (result.memoryUpdates?.length) {
        for (const mu of result.memoryUpdates) {
          memoryService
            .upsertEntity(
              mu.entityName,
              mu.entityType,
              mu.suggestedBucket,
              mu.context,
              mu.confidence || 'INFERRED'
            )
            .catch(() => {})
        }
      }

      // Process subtaskGroups: create parent + children
      if (result.subtaskGroups?.length) {
        console.log('[DIAG] Processing subtaskGroups:', result.subtaskGroups.length, 'groups')
        for (const group of result.subtaskGroups) {
          try {
            console.log('[DIAG] Creating parent task:', group.parentText, '| bucket:', group.bucket)
            const parent = await taskService.addParentTask({
              text: group.parentText,
              bucket: group.bucket,
              priority: group.priority || 'normal',
            })
            console.log('[DIAG] Parent task created with id:', parent.id, '| is_parent:', parent.is_parent)
            createdTaskIds.push(parent.id)

            if (group.subtasks?.length) {
              for (let i = 0; i < group.subtasks.length; i++) {
                const sub = group.subtasks[i]
                console.log('[DIAG] Creating subtask', i, ':', sub.text, '| parent_id:', parent.id)
                const saved = await taskService.addSubtask(
                  {
                    text: sub.text,
                    bucket: group.bucket,
                    priority: sub.priority || 'normal',
                  },
                  parent.id,
                  i
                )
                console.log('[DIAG] Subtask created with id:', saved.id, '| parent_task_id:', saved.parent_task_id)
                createdTaskIds.push(saved.id)
              }
            }
          } catch (err) {
            console.error('Failed to create subtask group:', err)
          }
        }
      } else {
        console.log('[DIAG] No subtaskGroups to process (length:', result.subtaskGroups?.length, ')')
      }

      // Process appendToParent: add subtasks to existing parent
      if (result.appendToParent) {
        const { parentIdentifier, newSubtasks } = result.appendToParent
        if (parentIdentifier && newSubtasks?.length) {
          const parentMatch = tasks.find(
            (t) =>
              t.is_parent &&
              t.status === 'active' &&
              t.text.toLowerCase().includes(parentIdentifier.toLowerCase())
          )
          if (parentMatch) {
            const existingSubs = tasks.filter(
              (t) => t.parent_task_id === parentMatch.id
            )
            let order = existingSubs.length
            for (const sub of newSubtasks) {
              const saved = await taskService.addSubtask(
                {
                  text: sub.text,
                  bucket: parentMatch.bucket,
                  priority: sub.priority || 'normal',
                },
                parentMatch.id,
                order++
              )
              createdTaskIds.push(saved.id)
            }
          } else {
            // No matching parent found — create new parent with subtasks
            const newParent = await taskService.addParentTask({
              text: parentIdentifier,
              bucket: 'Home / Personal',
              priority: 'normal',
            })
            createdTaskIds.push(newParent.id)
            let order = 0
            for (const sub of newSubtasks) {
              const saved = await taskService.addSubtask(
                {
                  text: sub.text,
                  bucket: newParent.bucket,
                  priority: sub.priority || 'normal',
                },
                newParent.id,
                order++
              )
              createdTaskIds.push(saved.id)
            }
          }
        }
      }

      // === LIST INTENT PROCESSING (before newTasks — listIntent takes priority) ===
      let listIntentHandled = false
      if (result.listIntent && result.listIntent.action && result.listIntent.listName) {
        listIntentHandled = true
        const li = result.listIntent
        console.log('[ListIntent] action:', li.action, '| listName:', li.listName)

        try {
          if (li.action === 'create') {
            const coreItems = await listService.getCoreItems(li.listName)
            const newList = await listService.createList(
              li.listName,
              li.createType || 'permanent',
              li.context || null
            )
            if (newList && coreItems.length > 0) {
              for (let i = 0; i < coreItems.length; i++) {
                await listService.addItem(newList.id, coreItems[i].text, true, i)
              }
            }
            if (newList && li.items?.length) {
              const offset = coreItems.length
              for (let i = 0; i < li.items.length; i++) {
                await listService.addItem(newList.id, li.items[i], false, offset + i)
              }
            }
            if (listsRefreshRef.current) listsRefreshRef.current()
            // Navigate to Lists tab so the user sees the new list
            setNavigationTarget('lists')
            if (showToast) showToast(`${li.listName} list created`, 'success')
          }

          if (li.action === 'add' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match && li.items?.length) {
              const existingCount = (match.list_items || []).length
              for (let i = 0; i < li.items.length; i++) {
                await listService.addItem(match.id, li.items[i], false, existingCount + i)
              }
              if (listsRefreshRef.current) listsRefreshRef.current()
              if (showToast) showToast(`Added to ${match.name}`, 'success')
            }
          }

          if (li.action === 'check' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match && li.markDone?.length) {
              for (const doneText of li.markDone) {
                const item = (match.list_items || []).find(
                  (i) => i.text.toLowerCase().includes(doneText.toLowerCase()) && !i.is_checked
                )
                if (item) await listService.checkItem(item.id)
              }
              if (listsRefreshRef.current) listsRefreshRef.current()
            }
          }

          if (li.action === 'remove' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match && li.removeItems?.length) {
              for (const removeText of li.removeItems) {
                const item = (match.list_items || []).find(
                  (i) => i.text.toLowerCase().includes(removeText.toLowerCase())
                )
                if (item) await listService.deleteItem(item.id)
              }
              if (listsRefreshRef.current) listsRefreshRef.current()
            }
          }

          if (li.action === 'view' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match) {
              const fullList = await listService.getList(match.id)
              setSearchModal({
                isOpen: true,
                title: fullList.name,
                type: 'list',
                data: fullList.list_items || [],
                listId: fullList.id,
              })
            }
          }

          if (li.action === 'done' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match) {
              await listService.checkAllItems(match.id)
              listService.promoteCoreItems(match.id).catch(() => {})
              if (listsRefreshRef.current) listsRefreshRef.current()
              if (showToast) showToast(`${match.name} completed`, 'success')
            }
          }

          if (li.action === 'archive' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match) {
              await listService.archiveList(match.id)
              if (listsRefreshRef.current) listsRefreshRef.current()
              if (showToast) showToast(`${match.name} archived`, 'success')
            }
          }

          if (li.action === 'delete' && li.listName) {
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase() === li.listName.toLowerCase()
            )
            if (match) {
              await listService.deleteList(match.id)
              if (listsRefreshRef.current) listsRefreshRef.current()
              if (showToast) showToast(`${match.name} deleted`, 'success')
            }
          }

          if (li.action === 'recall' && li.listName) {
            const archived = await listService.getArchivedLists()
            const match = archived.find(
              (l) => l.name.toLowerCase().includes(li.listName.toLowerCase())
            )
            if (match) {
              setSearchModal({
                isOpen: true,
                title: `${match.name} (archived)`,
                type: 'list',
                data: match.list_items || [],
                listId: match.id,
              })
            }
          }
        } catch (err) {
          console.error('[ListIntent] Failed to process list intent:', err)
          if (showToast) showToast('Something went wrong', 'error')
        }
      }

      // Add new tasks (regular, non-subtask) — SKIP if listIntent was handled
      if (result.newTasks?.length && !listIntentHandled) {
        for (const task of result.newTasks) {
          const saved = await taskService.addTask({
            ...task,
            confidence: task.confidence || 'high',
          })
          createdTaskIds.push(saved.id)
        }
      }

      // Process completions
      if (result.completions?.length) {
        for (const completion of result.completions) {
          const match = tasks.find(
            (t) =>
              t.status === 'active' &&
              t.text.toLowerCase().includes(completion.text.toLowerCase())
          )
          if (match) {
            // Use completeSubtask if it has a parent (handles auto-complete of parent)
            if (match.parent_task_id) {
              await taskService.completeSubtask(match.id)
            } else {
              await taskService.completeTask(match.id)
            }
          }
        }
      }

      // Process edits — detect bucket corrections for memory learning
      if (result.edits?.length) {
        for (const edit of result.edits) {
          const match = tasks.find(
            (t) =>
              t.status === 'active' &&
              t.text.toLowerCase().includes(edit.text.toLowerCase())
          )
          if (match) {
            await taskService.updateTask(match.id, edit.updates)

            // Voice correction detection: if bucket changed, confirm entity in memory
            if (edit.updates.bucket && edit.updates.bucket !== match.bucket) {
              // Extract entity from task text for memory confirmation
              memoryService
                .confirmEntity(match.text, edit.updates.bucket)
                .catch(() => {})
            }
          }
        }
      }

      // Process deleteBucket
      if (result.deleteBucket) {
        const { bucketName, confirmed } = result.deleteBucket
        if (userConfig.isDefaultBucket(bucketName)) {
          // Claude should already set response, but just in case
        } else if (!confirmed) {
          // Count active tasks in this bucket
          const activeInBucket = tasks.filter(
            (t) => t.status === 'active' && t.bucket.toLowerCase() === bucketName.toLowerCase()
          ).length
          setPendingDeleteBucket({ bucketName, activeCount: activeInBucket })
        } else {
          // Confirmed deletion — reassign tasks to Home / Personal
          const tasksInBucket = tasks.filter(
            (t) => t.status === 'active' && t.bucket.toLowerCase() === bucketName.toLowerCase()
          )
          for (const t of tasksInBucket) {
            await taskService.updateTask(t.id, { bucket: 'Home / Personal' })
          }
          userConfig.removeCustomBucket(bucketName)
          setBucketVersion((v) => v + 1)
          setPendingDeleteBucket(null)
        }
      }

      // Process navigation (legacy)
      if (result.navigation) {
        setNavigationTarget(result.navigation)
      }

      // Process extended navigationIntent
      if (result.navigationIntent) {
        const ni = result.navigationIntent
        if (ni.action === 'modal') {
          const filter = ni.filter || {}

          if (ni.modalType === 'list' && filter.listName) {
            // Find matching list and open in modal
            const allLists = await listService.getLists()
            const match = allLists.find(
              (l) => l.name.toLowerCase().includes(filter.listName.toLowerCase())
            )
            if (match) {
              const fullList = await listService.getList(match.id)
              setSearchModal({
                isOpen: true,
                title: ni.title || fullList.name,
                type: 'list',
                data: fullList.list_items || [],
                listId: fullList.id,
                query: null,
              })
            } else {
              // No matching list — open empty modal with no-results
              setSearchModal({
                isOpen: true,
                title: ni.title || filter.listName,
                type: 'list',
                data: [],
                listId: null,
                query: filter.listName,
              })
            }
          } else {
            // Task modal — pure JS filtering, zero API calls
            // Use getChicagoDateContext() as the single source of truth for all dates
            const { dates } = getChicagoDateContext()
            const todayMidnight = new Date(dates.today).getTime()

            let filtered = [...tasks]

            if (filter.timeRange === 'completed-today') {
              filtered = filtered.filter(t => {
                if (t.status !== 'completed' || !t.completedAt) return false
                return new Date(t.completedAt).getTime() >= todayMidnight
              })
            } else if (filter.timeRange === 'overdue') {
              filtered = filtered.filter(t =>
                (t.status === 'active' || t.status === 'rolled') &&
                t.dueDate && t.dueDate < dates.today
              )
            } else {
              // Active tasks only for all date-based filters
              if (filter.timeRange === 'today' || filter.timeRange === 'tomorrow') {
                filtered = filtered.filter(t => t.status === 'active')
              } else {
                filtered = filtered.filter(t => t.status === 'active' || t.status === 'rolled')
              }

              if (filter.timeRange === 'today') {
                filtered = filtered.filter(t => t.dueDate === dates.today)
              } else if (filter.timeRange === 'tomorrow') {
                filtered = filtered.filter(t => t.dueDate === dates.tomorrow)
              } else if (filter.timeRange === 'this-week') {
                filtered = filtered.filter(t => t.dueDate >= dates.today && t.dueDate <= dates.endOfThisWeek)
              } else if (filter.timeRange === 'next-week') {
                filtered = filtered.filter(t => t.dueDate >= dates.nextWeekStart && t.dueDate <= dates.nextWeekEnd)
              } else if (filter.timeRange === 'monday') {
                filtered = filtered.filter(t => t.dueDate === dates.monday)
              } else if (filter.timeRange === 'tuesday') {
                filtered = filtered.filter(t => t.dueDate === dates.tuesday)
              } else if (filter.timeRange === 'wednesday') {
                filtered = filtered.filter(t => t.dueDate === dates.wednesday)
              } else if (filter.timeRange === 'thursday') {
                filtered = filtered.filter(t => t.dueDate === dates.thursday)
              } else if (filter.timeRange === 'friday') {
                filtered = filtered.filter(t => t.dueDate === dates.friday)
              } else if (filter.timeRange === 'saturday') {
                filtered = filtered.filter(t => t.dueDate === dates.saturday)
              } else if (filter.timeRange === 'sunday') {
                filtered = filtered.filter(t => t.dueDate === dates.sunday)
              }

              // Time-of-day filtering
              if (filter.timeOfDay && (filter.timeOfDay.start || filter.timeOfDay.end)) {
                const toMinutes = (hhmm) => {
                  const [h, m] = hhmm.split(':').map(Number)
                  return h * 60 + m
                }
                const startMin = filter.timeOfDay.start ? toMinutes(filter.timeOfDay.start) : 0
                const endMin = filter.timeOfDay.end ? toMinutes(filter.timeOfDay.end) : 23 * 60 + 59
                filtered = filtered.filter(t => {
                  if (!t.scheduledTime) return false
                  const taskDate = new Date(t.scheduledTime)
                  const taskMin = taskDate.getHours() * 60 + taskDate.getMinutes()
                  return taskMin >= startMin && taskMin <= endMin
                })
              }
            }

            if (filter.bucket) {
              filtered = filtered.filter(t =>
                t.bucket.toLowerCase() === filter.bucket.toLowerCase()
              )
            }

            if (filter.priority) {
              filtered = filtered.filter(t => t.priority === filter.priority)
            }

            if (filter.searchTerm) {
              const term = filter.searchTerm.toLowerCase()
              filtered = filtered.filter(t => t.text.toLowerCase().includes(term))
            }

            // Exclude subtasks from results
            filtered = filtered.filter(t => !t.parent_task_id)

            setSearchModal({
              isOpen: true,
              title: ni.title || 'Results',
              type: 'tasks',
              data: filtered,
              listId: null,
              query: filter.searchTerm || null,
            })
          }
        } else {
          setNavigationIntent(ni)
        }
      }

      // (listIntent already processed above, before newTasks)

      // Track last added task IDs for voice correction
      if (createdTaskIds.length > 0) {
        lastAddedTaskIds.current = createdTaskIds
      }

      // Update last_referenced for all entities mentioned in memory
      if (memoryContext.length > 0) {
        const inputLower = text.toLowerCase()
        for (const entity of memoryContext) {
          if (inputLower.includes(entity.entity_name.toLowerCase())) {
            memoryService.updateLastReferenced(entity.entity_name).catch(() => {})
          }
        }
      }

      await refresh()

      // Toast for new tasks/subtasks added
      if (createdTaskIds.length > 0 && !listIntentHandled) {
        const msg = result.response || `Added ${createdTaskIds.length} task${createdTaskIds.length !== 1 ? 's' : ''}`
        if (showToast) showToast(msg, 'success')
      }

      // Fire-and-forget: link task IDs to transcript in background
      transcriptPromise.then((transcriptId) => {
        if (transcriptId && createdTaskIds.length) {
          linkTaskIds(transcriptId, createdTaskIds)
        }
      })

      return result.response
    },
    [tasks, refresh]
  )

  const complete = useCallback(
    async (id) => {
      // Check if this is a subtask
      const task = tasks.find((t) => t.id === id)
      if (task?.parent_task_id) {
        await taskService.completeSubtask(id)
      } else {
        await taskService.completeTask(id)
      }
      await refresh()
    },
    [tasks, refresh]
  )

  // --- Navigation & Search helpers ---
  const navigate = useCallback((destination) => {
    setNavigationTarget(destination)
  }, [])

  const filterTo = useCallback((bucket) => {
    setSearchTerm(null)
    setNavigationIntent({ action: 'filter', target: 'tasks', filter: bucket })
  }, [])

  const searchFor = useCallback((term) => {
    setSearchTerm(term)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchTerm(null)
  }, [])

  return {
    tasks,
    loading,
    addFromText,
    complete,
    refresh,
    bucketVersion,
    pendingDeleteBucket,
    setPendingDeleteBucket,
    navigationTarget,
    setNavigationTarget,
    navigationIntent,
    setNavigationIntent,
    searchTerm,
    setSearchTerm,
    reRecordRequested,
    setReRecordRequested,
    searchModal,
    setSearchModal,
    listsRefreshRef,
    navigate,
    filterTo,
    searchFor,
    clearSearch,
    showToast,
  }
}
