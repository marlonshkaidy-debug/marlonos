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
    })
    .select()
    .single()

  if (error) throw error
  return data
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

export async function rolloverTasks() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'rolled',
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      mustDoToday: false,
    })
    .eq('status', 'active')
    .eq('dueDate', today)
    .lt('createdAt', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
    .select()

  if (error) throw error
  return data
}
