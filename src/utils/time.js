export function isToday(date) {
  const d = parseDateOnly(date)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function isTomorrow(date) {
  const d = parseDateOnly(date)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return (
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
  )
}

export function formatTime(datetime) {
  if (!datetime) return null
  return new Date(datetime).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function minutesUntil(datetime) {
  if (!datetime) return null
  return Math.round((new Date(datetime).getTime() - Date.now()) / 60000)
}

/**
 * Parse a date string as a local date (avoids timezone shifting).
 * Handles "YYYY-MM-DD" by treating it as local, not UTC.
 */
export function parseDateOnly(date) {
  if (!date) return new Date(NaN)
  if (date instanceof Date) return date
  // "YYYY-MM-DD" strings get parsed as UTC by Date constructor — force local
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(date)
}

/**
 * Returns the number of days a task is overdue (positive = overdue).
 */
export function getDaysOverdue(dueDate) {
  if (!dueDate) return 0
  const due = parseDateOnly(dueDate)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const diffMs = todayStart.getTime() - dueStart.getTime()
  return Math.floor(diffMs / 86400000)
}

/**
 * Returns a label for the due date chip on task cards.
 */
export function getDueDateLabel(dueDate) {
  if (!dueDate) return null
  const days = getDaysOverdue(dueDate)
  if (days > 0) return { text: days === 1 ? '1 day overdue' : `${days} days overdue`, color: '#DC2626' }
  if (days === 0) return { text: 'Today', color: '#c9a84c' }
  if (days === -1) return { text: 'Tomorrow', color: '#9CA3AF' }
  // Within 7 days
  if (days > -7) {
    const d = parseDateOnly(dueDate)
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
    return { text: dayName, color: '#6B7280' }
  }
  // Further out
  const d = parseDateOnly(dueDate)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { text: label, color: '#6B7280' }
}

/**
 * Categorize a task into OVERDUE / TODAY / UPCOMING for the three-layer view.
 */
export function getDateSection(dueDate, status) {
  if (!dueDate) return 'TODAY' // no date → show in today
  const days = getDaysOverdue(dueDate)
  if (days > 0 && (status === 'active' || status === 'rolled')) return 'OVERDUE'
  if (days === 0) return 'TODAY'
  if (days < 0) return 'UPCOMING'
  return 'TODAY'
}

/**
 * Returns a sub-group label for upcoming tasks (TOMORROW, day name, NEXT WEEK).
 */
export function getUpcomingGroup(dueDate) {
  if (!dueDate) return 'TOMORROW'
  const days = getDaysOverdue(dueDate) // negative for future
  const absDays = Math.abs(days)
  if (absDays === 1) return 'TOMORROW'
  if (absDays < 7) {
    const d = parseDateOnly(dueDate)
    return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()
  }
  return 'NEXT WEEK'
}
