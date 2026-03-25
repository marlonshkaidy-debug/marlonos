import { supabase } from '../lib/supabase'

export async function getTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .is('archivedAt', null)
    .order('createdAt', { ascending: false })

  if (error) throw error
  return data
}

export async function addTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      text: task.text,
      bucket: task.bucket,
      priority: task.priority || 'normal',
      mustDoToday: task.mustDoToday || false,
      scheduledTime: task.scheduledTime || null,
      dueDate: task.dueDate || new Date().toISOString().split('T')[0],
      status: 'active',
      confidence: task.confidence || 'high',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addParentTask(parentTask) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      text: parentTask.text,
      bucket: parentTask.bucket,
      priority: parentTask.priority || 'normal',
      mustDoToday: parentTask.mustDoToday || false,
      scheduledTime: parentTask.scheduledTime || null,
      dueDate: parentTask.dueDate || new Date().toISOString().split('T')[0],
      status: 'active',
      is_parent: true,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addSubtask(subtask, parentTaskId, order) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      text: subtask.text,
      bucket: subtask.bucket,
      priority: subtask.priority || 'normal',
      mustDoToday: false,
      scheduledTime: null,
      dueDate: subtask.dueDate || new Date().toISOString().split('T')[0],
      status: 'active',
      parent_task_id: parentTaskId,
      subtask_order: order,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getSubtasks(parentTaskId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('parent_task_id', parentTaskId)
    .order('subtask_order', { ascending: true })

  if (error) throw error
  return data
}

export async function completeSubtask(id) {
  // Complete the subtask
  const completed = await updateTask(id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  })

  // Check if all siblings are complete
  if (completed.parent_task_id) {
    const siblings = await getSubtasks(completed.parent_task_id)
    const allDone = siblings.every((s) => s.status === 'completed')
    if (allDone) {
      await updateTask(completed.parent_task_id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      })
    }
  }

  return completed
}

export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function completeTask(id) {
  return updateTask(id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  })
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function convertToParent(id) {
  return updateTask(id, { is_parent: true })
}

export async function rolloverTasks() {
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // Step 1: fetch tasks that need rolling so we can increment each roll_count
  const { data: toRoll, error: fetchError } = await supabase
    .from('tasks')
    .select('id, roll_count')
    .eq('status', 'active')
    .eq('dueDate', today)
    .lt('createdAt', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())

  if (fetchError) throw fetchError
  if (!toRoll || toRoll.length === 0) return []

  const results = []
  for (const task of toRoll) {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        status: 'rolled',
        dueDate: tomorrow,
        mustDoToday: false,
        roll_count: (task.roll_count || 0) + 1,
      })
      .eq('id', task.id)
      .select()
      .single()

    if (!error && data) results.push(data)
  }
  return results
}

// --- Bulk operations (batched to avoid overwhelming Supabase) ---

export async function bulkReschedule(taskIds, newDueDate) {
  for (let i = 0; i < taskIds.length; i += 10) {
    const batch = taskIds.slice(i, i + 10)
    const { error } = await supabase
      .from('tasks')
      .update({ dueDate: newDueDate, status: 'active', mustDoToday: false })
      .in('id', batch)
    if (error) throw error
  }
}

export async function bulkComplete(taskIds) {
  for (let i = 0; i < taskIds.length; i += 10) {
    const batch = taskIds.slice(i, i + 10)
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'completed', completedAt: new Date().toISOString() })
      .in('id', batch)
    if (error) throw error
  }
}

export async function bulkUpdatePriority(taskIds, priority) {
  for (let i = 0; i < taskIds.length; i += 10) {
    const batch = taskIds.slice(i, i + 10)
    const { error } = await supabase
      .from('tasks')
      .update({ priority })
      .in('id', batch)
    if (error) throw error
  }
}

export async function bulkArchive(taskIds) {
  for (let i = 0; i < taskIds.length; i += 10) {
    const batch = taskIds.slice(i, i + 10)
    const { error } = await supabase
      .from('tasks')
      .update({ archivedAt: new Date().toISOString() })
      .in('id', batch)
    if (error) throw error
  }
}
