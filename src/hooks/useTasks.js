import { useState, useEffect, useCallback } from 'react'
import * as taskService from '../services/taskService'
import * as memoryService from '../services/memoryService'
import { parseInput } from '../services/claudeService'
import { logTranscript, linkTaskIds } from '../services/transcriptService'
import { sortTasks } from '../utils/sort'
import userConfig from '../config/userConfig'

export function useTasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [bucketVersion, setBucketVersion] = useState(0)

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

      // Fire-and-forget: log transcript in background
      const transcriptPromise = logTranscript(rawTranscript, result)

      const createdTaskIds = []

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
        for (const group of result.subtaskGroups) {
          try {
            const parent = await taskService.addParentTask({
              text: group.parentText,
              bucket: group.bucket,
              priority: group.priority || 'normal',
            })
            createdTaskIds.push(parent.id)

            if (group.subtasks?.length) {
              for (let i = 0; i < group.subtasks.length; i++) {
                const sub = group.subtasks[i]
                const saved = await taskService.addSubtask(
                  {
                    text: sub.text,
                    bucket: group.bucket,
                    priority: sub.priority || 'normal',
                  },
                  parent.id,
                  i
                )
                createdTaskIds.push(saved.id)
              }
            }
          } catch (err) {
            console.error('Failed to create subtask group:', err)
          }
        }
      }

      // Add new tasks (regular, non-subtask)
      if (result.newTasks?.length) {
        for (const task of result.newTasks) {
          const saved = await taskService.addTask(task)
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

  return { tasks, loading, addFromText, complete, refresh, bucketVersion }
}
