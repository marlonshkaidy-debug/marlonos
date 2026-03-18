const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 }

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    // Completed tasks always last
    const aCompleted = a.status === 'completed'
    const bCompleted = b.status === 'completed'
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1

    // Critical + mustDoToday first
    const aCritMust = a.priority === 'critical' && a.mustDoToday
    const bCritMust = b.priority === 'critical' && b.mustDoToday
    if (aCritMust !== bCritMust) return aCritMust ? -1 : 1

    // Then by priority level
    const aPri = PRIORITY_ORDER[a.priority] ?? 2
    const bPri = PRIORITY_ORDER[b.priority] ?? 2
    if (aPri !== bPri) return aPri - bPri

    // Within same priority: scheduledTime ascending (nulls last)
    const aTime = a.scheduledTime ? new Date(a.scheduledTime).getTime() : null
    const bTime = b.scheduledTime ? new Date(b.scheduledTime).getTime() : null
    if (aTime !== null && bTime !== null) return aTime - bTime
    if (aTime !== null) return -1
    if (bTime !== null) return 1

    // Then by createdAt ascending
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
}
