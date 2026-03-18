import { useState, useEffect, useCallback } from 'react'
import * as taskService from '../services/taskService'
import { parseInput } from '../services/claudeService'
import { sortTasks } from '../utils/sort'

export function useTasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

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
      const result = await parseInput(text, tasks)

      // Add new tasks
      if (result.newTasks?.length) {
        for (const task of result.newTasks) {
          await taskService.addTask(task)
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
            await taskService.completeTask(match.id)
          }
        }
      }

      // Process edits
      if (result.edits?.length) {
        for (const edit of result.edits) {
          const match = tasks.find(
            (t) =>
              t.status === 'active' &&
              t.text.toLowerCase().includes(edit.text.toLowerCase())
          )
          if (match) {
            await taskService.updateTask(match.id, edit.updates)
          }
        }
      }

      await refresh()
      return result.response
    },
    [tasks, refresh]
  )

  const complete = useCallback(
    async (id) => {
      await taskService.completeTask(id)
      await refresh()
    },
    [refresh]
  )

  return { tasks, loading, addFromText, complete, refresh }
}
