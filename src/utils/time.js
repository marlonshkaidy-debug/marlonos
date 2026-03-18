export function isToday(date) {
  const d = new Date(date)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function isTomorrow(date) {
  const d = new Date(date)
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
