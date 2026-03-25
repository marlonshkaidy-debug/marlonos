import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTasks } from './hooks/useTasks'
import { useLists } from './hooks/useLists'
import { useMemory } from './hooks/useMemory'
import { useVoiceRecorder } from './hooks/useVoiceRecorder'
import { useMicPermission } from './hooks/useMicPermission'
import { transcribeAudio } from './services/whisperService'
import { parseListCommand } from './services/claudeService'
import { updateTask, deleteTask } from './services/taskService'
import * as memoryService from './services/memoryService'
import * as listService from './services/listService'
import userConfig from './config/userConfig'
import { formatTime, getDueDateLabel, getDateSection, getUpcomingGroup, getDaysOverdue } from './utils/time'
import { getChicagoDateContext } from './services/claudeService'
import ListsView from './pages/ListsView'
import SearchModal from './components/SearchModal'
import './App.css'

const ALL_FILTER = 'All'
const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 }

function App() {
  // Toast system — defined first so showToast can be passed to useTasks
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // App state ref — injected into Claude's system prompt for contextual awareness
  const appStateRef = useRef(null)

  const {
    tasks, loading, addFromText, complete, refresh: refreshTasks, bucketVersion,
    pendingDeleteBucket, setPendingDeleteBucket,
    navigationTarget, setNavigationTarget,
    navigationIntent, setNavigationIntent,
    searchTerm, setSearchTerm, clearSearch,
    reRecordRequested, setReRecordRequested,
    searchModal, setSearchModal,
    listsRefreshRef,
  } = useTasks(showToast, appStateRef)
  const {
    activeLists,
    loading: listsLoading,
    createList,
    addItemToList,
    checkItem: checkListItem,
    uncheckItem: uncheckListItem,
    checkAllItems,
    deleteList,
    archiveList,
    deleteItem: deleteListItem,
    toggleItemCore,
    refreshLists,
  } = useLists()
  const { memory } = useMemory()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activeBucket, setActiveBucket] = useState(ALL_FILTER)
  const [voiceStatus, setVoiceStatus] = useState(null)
  const [micError, setMicError] = useState(null)
  const [activeNav, setActiveNav] = useState('tasks') // 'tasks' | 'lists'
  const [overdueCollapsed, setOverdueCollapsed] = useState(false)
  const [upcomingCollapsed, setUpcomingCollapsed] = useState(false)
  const [completedCollapsed, setCompletedCollapsed] = useState(true)

  // Task update/delete handlers for nudge banner (rolling tasks)
  const handleNudgeDelete = useCallback(async (taskId) => {
    await deleteTask(taskId)
    await refreshTasks()
    showToast('Task removed', 'success')
  }, [refreshTasks, showToast])

  const handleNudgeSchedule = useCallback(async (taskId, newDueDate) => {
    await updateTask(taskId, { dueDate: newDueDate, status: 'active' })
    await refreshTasks()
    showToast('Scheduled', 'success')
  }, [refreshTasks, showToast])

  const micPermission = useMicPermission()
  const { isRecording, audioBlob, error: recorderError, startRecording, stopRecording } = useVoiceRecorder()
  const addFromTextRef = useRef(addFromText)
  const pendingTranscription = useRef(false)

  // Wire listsRefreshRef so useTasks can trigger list refresh after list intents
  useEffect(() => {
    listsRefreshRef.current = refreshLists
  }, [listsRefreshRef, refreshLists])

  // Handle voice navigation from Claude (legacy)
  useEffect(() => {
    if (navigationTarget) {
      setActiveNav(navigationTarget)
      setNavigationTarget(null)
    }
  }, [navigationTarget, setNavigationTarget])

  // Reactively compute bucket names from userConfig (must be before effects that use it)
  const bucketNames = useMemo(
    () => userConfig.defaultBuckets.map((b) => b.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bucketVersion]
  )

  // Handle extended navigationIntent from Claude
  useEffect(() => {
    if (!navigationIntent) return
    const { action, target, filter } = navigationIntent

    if (action === 'navigate') {
      setActiveNav(target || 'tasks')
    } else if (action === 'filter') {
      setActiveNav('tasks')
      if (filter === 'all') {
        setActiveBucket(ALL_FILTER)
        setSearchTerm(null)
      } else if (filter === 'overdue') {
        setActiveBucket(ALL_FILTER)
        setSearchTerm(null)
        // Expand overdue section
        setOverdueCollapsed(false)
      } else if (filter === 'upcoming') {
        setActiveBucket(ALL_FILTER)
        setSearchTerm(null)
        setUpcomingCollapsed(false)
      } else if (filter) {
        // Match bucket name (case-insensitive)
        const matchedBucket = bucketNames.find(
          (b) => b.toLowerCase() === filter.toLowerCase()
        )
        if (matchedBucket) {
          setActiveBucket(matchedBucket)
        }
        setSearchTerm(null)
      }
    } else if (action === 'search') {
      setActiveNav('tasks')
      setActiveBucket(ALL_FILTER)
      setSearchTerm(filter || null)
    }

    setNavigationIntent(null)
  }, [navigationIntent, setNavigationIntent, bucketNames, setSearchTerm])

  // Handle re-record request from voice correction
  useEffect(() => {
    if (reRecordRequested && !isRecording && !sending) {
      setReRecordRequested(false)
      setVoiceStatus('recording')
      startRecording()
    }
  }, [reRecordRequested, isRecording, sending, setReRecordRequested, startRecording])

  // Build parent->subtask mapping
  const subtaskMap = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (t.parent_task_id) {
        if (!map[t.parent_task_id]) map[t.parent_task_id] = []
        map[t.parent_task_id].push(t)
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.subtask_order || 0) - (b.subtask_order || 0))
    }
    return map
  }, [tasks])

  useEffect(() => {
    addFromTextRef.current = addFromText
  }, [addFromText])

  useEffect(() => {
    if (recorderError) {
      setMicError(recorderError)
      setVoiceStatus(null)
    }
  }, [recorderError])

  // When recording stops and audioBlob is ready, transcribe and submit
  useEffect(() => {
    if (!audioBlob || pendingTranscription.current) return
    pendingTranscription.current = true

    const run = async () => {
      setVoiceStatus('transcribing')
      try {
        const transcript = await transcribeAudio(audioBlob)
        if (!transcript) {
          console.error('Transcription returned empty result')
          return
        }
        setInput(transcript)
        setSending(true)
        try {
          await addFromTextRef.current(transcript)
        } catch (err) {
          console.error('Failed to process voice input:', err)
        } finally {
          setSending(false)
          setInput('')
        }
      } finally {
        setVoiceStatus(null)
        pendingTranscription.current = false
      }
    }
    run()
  }, [audioBlob])

  const handleMicToggle = () => {
    setMicError(null)
    if (isRecording) {
      stopRecording()
    } else {
      setVoiceStatus('recording')
      startRecording()
    }
  }

  const handleListVoiceCommand = useCallback(async (transcript, listId, listName) => {
    try {
      let memoryContext = []
      try {
        memoryContext = await memoryService.getMemory()
      } catch (_) { /* silent */ }

      const result = await parseListCommand(transcript, listId, listName, memoryContext)
      const li = result?.listIntent
      if (!li || !li.action) return

      if (li.action === 'add' && li.items?.length) {
        const fullList = await listService.getList(listId)
        const existingCount = (fullList?.list_items || []).length
        for (let i = 0; i < li.items.length; i++) {
          await listService.addItem(listId, li.items[i], false, existingCount + i)
        }
        const updated = await listService.getList(listId)
        if (updated) {
          setSearchModal((prev) => ({ ...prev, data: updated.list_items || [] }))
        }
        showToast(`Added to ${listName}`, 'success')
      }

      if (li.action === 'check' && li.markDone?.length) {
        const fullList = await listService.getList(listId)
        for (const doneText of li.markDone) {
          const item = (fullList?.list_items || []).find(
            (i) => i.text.toLowerCase().includes(doneText.toLowerCase()) && !i.is_checked
          )
          if (item) {
            await listService.checkItem(item.id)
            setSearchModal((prev) => ({
              ...prev,
              data: prev.data.map((d) =>
                d.id === item.id ? { ...d, is_checked: true, checked_at: new Date().toISOString() } : d
              ),
            }))
          }
        }
        showToast('Checked off', 'success')
      }

      if (li.action === 'remove' && li.removeItems?.length) {
        const fullList = await listService.getList(listId)
        for (const removeText of li.removeItems) {
          const item = (fullList?.list_items || []).find(
            (i) => i.text.toLowerCase().includes(removeText.toLowerCase())
          )
          if (item) {
            await listService.deleteItem(item.id)
            setSearchModal((prev) => ({
              ...prev,
              data: prev.data.filter((d) => d.id !== item.id),
            }))
          }
        }
        showToast('Removed', 'success')
      }

      if (li.action === 'done') {
        await listService.checkAllItems(listId)
        listService.promoteCoreItems(listId).catch(() => {})
        setSearchModal((prev) => ({
          ...prev,
          data: prev.data.map((d) => ({
            ...d,
            is_checked: true,
            checked_at: d.checked_at || new Date().toISOString(),
          })),
        }))
        showToast(`${listName} completed`, 'success')
      }
    } catch (err) {
      console.error('[ListVoiceCommand] Failed:', err)
      showToast('Something went wrong', 'error')
    }
  }, [showToast, setSearchModal])

  // Filter tasks: exclude subtasks from top-level, apply bucket + search
  const filteredTasks = useMemo(() => {
    let topLevel = tasks.filter((t) => !t.parent_task_id)
    if (activeBucket !== ALL_FILTER) {
      topLevel = topLevel.filter((t) => t.bucket === activeBucket)
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      topLevel = topLevel.filter((t) => t.text.toLowerCase().includes(term))
    }
    return topLevel
  }, [tasks, activeBucket, searchTerm])

  // Three-layer grouping
  const { overdueTasks, todayTasks, upcomingGroups, completedTasks } = useMemo(() => {
    const overdue = []
    const today = []
    const upcoming = []
    const completed = []

    for (const task of filteredTasks) {
      if (task.status === 'completed') {
        completed.push(task)
        continue
      }
      const section = getDateSection(task.dueDate, task.status)
      if (section === 'OVERDUE') overdue.push(task)
      else if (section === 'UPCOMING') upcoming.push(task)
      else today.push(task)
    }

    // Sort overdue by how many days overdue (most overdue first)
    overdue.sort((a, b) => getDaysOverdue(b.dueDate) - getDaysOverdue(a.dueDate))

    // Sort today by priority
    today.sort((a, b) => {
      const aPri = PRIORITY_ORDER[a.priority] ?? 2
      const bPri = PRIORITY_ORDER[b.priority] ?? 2
      return aPri - bPri
    })

    // Group upcoming by day
    const groupMap = new Map()
    const groupOrder = []
    for (const task of upcoming) {
      const group = getUpcomingGroup(task.dueDate)
      if (!groupMap.has(group)) {
        groupMap.set(group, [])
        groupOrder.push(group)
      }
      groupMap.get(group).push(task)
    }
    // Sort within each group by priority then scheduledTime
    for (const [, tasks] of groupMap) {
      tasks.sort((a, b) => {
        const aPri = PRIORITY_ORDER[a.priority] ?? 2
        const bPri = PRIORITY_ORDER[b.priority] ?? 2
        if (aPri !== bPri) return aPri - bPri
        const aTime = a.scheduledTime ? new Date(a.scheduledTime).getTime() : Infinity
        const bTime = b.scheduledTime ? new Date(b.scheduledTime).getTime() : Infinity
        return aTime - bTime
      })
    }

    const groups = groupOrder.map((name) => ({ name, tasks: groupMap.get(name) }))

    return { overdueTasks: overdue, todayTasks: today, upcomingGroups: groups, completedTasks: completed }
  }, [filteredTasks])

  // Keep appStateRef current so Claude has live context
  useEffect(() => {
    const { dates } = getChicagoDateContext()
    const todayMidnight = new Date(dates.today).getTime()
    const completedTodayCount = completedTasks.filter(t =>
      t.completedAt && new Date(t.completedAt).getTime() >= todayMidnight
    ).length
    const upcomingCount = upcomingGroups.reduce((sum, g) => sum + g.tasks.length, 0)
    appStateRef.current = {
      overdueCount: overdueTasks.length,
      todayCount: todayTasks.length,
      upcomingCount,
      completedTodayCount,
      activeFilter: activeBucket !== ALL_FILTER ? activeBucket : null,
      currentView: activeNav,
      openModalTitle: searchModal.isOpen ? searchModal.title : null,
    }
  }, [overdueTasks, todayTasks, upcomingGroups, completedTasks, activeBucket, activeNav, searchModal])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')
    try {
      await addFromText(text)
    } catch (err) {
      console.error('Failed to process input:', err)
    } finally {
      setSending(false)
    }
  }

  const handleWhatsLeft = async () => {
    if (sending) return
    setSending(true)
    try {
      await addFromText("What's left on my list?")
    } catch (err) {
      console.error('Failed to query:', err)
    } finally {
      setSending(false)
    }
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-pill toast-${toast.type}`}>
          {toast.type === 'success' && <span className="toast-icon">&#10003;</span>}
          {toast.type === 'error' && <span className="toast-icon">&times;</span>}
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar-row">
          <h1>{userConfig.appName}</h1>
          <div className={`mic-indicator ${micPermission}`} title={`Mic: ${micPermission}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="1" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
        </div>
        <div className="date">{today}</div>
      </div>

      {/* Mic Permission Denied Banner */}
      {micPermission === 'denied' && (
        <div className="mic-denied-banner">
          Microphone access was denied. To use voice input, enable microphone
          permission in your browser settings and reload the page.
        </div>
      )}

      {/* Main Content Area */}
      <div className="main-content">
        {activeNav === 'tasks' ? (
          <>
            {/* Bucket Tabs — Tasks view only */}
            <div className="bucket-tabs">
              {[ALL_FILTER, ...bucketNames].map((bucket) => (
                <button
                  key={bucket}
                  className={`bucket-tab ${activeBucket === bucket ? 'active' : ''}`}
                  onClick={() => setActiveBucket(bucket)}
                >
                  {bucket}
                </button>
              ))}
            </div>

            {/* Search Indicator */}
            {searchTerm && (
              <div className="search-indicator">
                <span>Searching: {searchTerm}</span>
                <button className="search-clear" onClick={clearSearch}>&times;</button>
              </div>
            )}

            {/* Three-Layer Task List */}
            <div className="task-list">
              {loading ? (
                <div className="loading-spinner">Loading tasks...</div>
              ) : filteredTasks.length === 0 ? (
                <div className="task-list-empty">
                  {activeBucket === ALL_FILTER
                    ? 'No tasks yet. Type below to add some.'
                    : `No tasks in ${activeBucket}.`}
                </div>
              ) : (
                <>
                  {/* OVERDUE Section */}
                  {overdueTasks.length > 0 && (
                    <div className="task-section">
                      <button
                        className="section-header section-overdue"
                        onClick={() => setOverdueCollapsed((c) => !c)}
                      >
                        <span className="section-title">OVERDUE ({overdueTasks.length})</span>
                        <span className={`section-chevron ${overdueCollapsed ? '' : 'expanded'}`}>&#9660;</span>
                      </button>
                      <div className={`section-body ${overdueCollapsed ? 'collapsed' : ''}`}>
                        {overdueTasks.map((task) => (
                          <ParentTaskCard
                            key={task.id}
                            task={task}
                            subtasks={subtaskMap[task.id] || []}
                            onComplete={complete}
                            onDelete={handleNudgeDelete}
                            onUpdate={handleNudgeSchedule}
                            isOverdue
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TODAY Section */}
                  {todayTasks.length > 0 && (
                    <div className="task-section">
                      <div className="section-header section-today">
                        <span className="section-title">TODAY</span>
                      </div>
                      <div className="section-body">
                        {todayTasks.map((task) => (
                          <ParentTaskCard
                            key={task.id}
                            task={task}
                            subtasks={subtaskMap[task.id] || []}
                            onComplete={complete}
                            onDelete={handleNudgeDelete}
                            onUpdate={handleNudgeSchedule}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* UPCOMING Section */}
                  {upcomingGroups.length > 0 && (
                    <div className="task-section">
                      <button
                        className="section-header section-upcoming"
                        onClick={() => setUpcomingCollapsed((c) => !c)}
                      >
                        <span className="section-title">UPCOMING</span>
                        <span className={`section-chevron ${upcomingCollapsed ? '' : 'expanded'}`}>&#9660;</span>
                      </button>
                      <div className={`section-body ${upcomingCollapsed ? 'collapsed' : ''}`}>
                        {upcomingGroups.map((group) => (
                          <div key={group.name} className="upcoming-group">
                            <div className="upcoming-group-header">{group.name}</div>
                            {group.tasks.map((task) => (
                              <ParentTaskCard
                                key={task.id}
                                task={task}
                                subtasks={subtaskMap[task.id] || []}
                                onComplete={complete}
                                onDelete={handleNudgeDelete}
                                onUpdate={handleNudgeSchedule}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* COMPLETED Section */}
                  {completedTasks.length > 0 && (
                    <div className="task-section">
                      <button
                        className="section-header section-completed"
                        onClick={() => setCompletedCollapsed((c) => !c)}
                      >
                        <span className="section-title">COMPLETED ({completedTasks.length})</span>
                        <span className={`section-chevron ${completedCollapsed ? '' : 'expanded'}`}>&#9660;</span>
                      </button>
                      <div className={`section-body ${completedCollapsed ? 'collapsed' : ''}`}>
                        {completedTasks.map((task) => (
                          <ParentTaskCard
                            key={task.id}
                            task={task}
                            subtasks={subtaskMap[task.id] || []}
                            onComplete={complete}
                            onDelete={handleNudgeDelete}
                            onUpdate={handleNudgeSchedule}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {sending && (
                <div className="sending-indicator">Processing with Claude...</div>
              )}
            </div>
          </>
        ) : (
          /* Lists view */
          <ListsView
            activeLists={activeLists}
            loading={listsLoading}
            onCreateList={createList}
            onOpenList={(list) => {
              setSearchModal({
                isOpen: true,
                title: list.name,
                type: 'list',
                data: list.list_items || [],
                listId: list.id,
              })
            }}
            onDeleteList={async (listId, listName) => {
              await deleteList(listId)
              showToast(`${listName} deleted`, 'success')
            }}
          />
        )}
      </div>

      {/* Delete Bucket Confirmation Banner */}
      {pendingDeleteBucket && (
        <div className="delete-bucket-banner">
          <span>
            {pendingDeleteBucket.activeCount > 0
              ? `"${pendingDeleteBucket.bucketName}" has ${pendingDeleteBucket.activeCount} active task${pendingDeleteBucket.activeCount !== 1 ? 's' : ''}. Say "confirm" to delete and move tasks to Home / Personal, or "cancel".`
              : `Delete "${pendingDeleteBucket.bucketName}" bucket? Say "confirm" or "cancel".`}
          </span>
          <div className="delete-bucket-actions">
            <button
              onClick={async () => {
                // Reassign tasks and remove bucket
                const tasksInBucket = tasks.filter(
                  (t) => t.status === 'active' && t.bucket.toLowerCase() === pendingDeleteBucket.bucketName.toLowerCase()
                )
                for (const t of tasksInBucket) {
                  await updateTask(t.id, { bucket: 'Home / Personal' })
                }
                userConfig.removeCustomBucket(pendingDeleteBucket.bucketName)
                setPendingDeleteBucket(null)
                window.location.reload()
              }}
            >
              Confirm
            </button>
            <button onClick={() => setPendingDeleteBucket(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Voice Status Banner */}
      {voiceStatus && (
        <div className="voice-status">
          {voiceStatus === 'recording'
            ? 'Recording... tap to send'
            : 'Transcribing...'}
        </div>
      )}

      {/* Mic Error Banner */}
      {micError && (
        <div className="mic-error" onClick={() => setMicError(null)}>
          {micError}
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item ${activeNav === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveNav('tasks')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          <span>Tasks</span>
        </button>
        <button
          className={`bottom-nav-item ${activeNav === 'lists' ? 'active' : ''}`}
          onClick={() => setActiveNav('lists')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>Lists</span>
        </button>
      </nav>

      {/* Search / List Modal */}
      <SearchModal
        modal={searchModal}
        onClose={() => setSearchModal({ isOpen: false, title: '', type: 'tasks', data: [], listId: null, query: null })}
        onVoiceCommand={addFromText}
        onVoiceListCommand={handleListVoiceCommand}
        showToast={showToast}
        memory={memory}
        onCheckItem={(itemId, listId) => {
          checkListItem(itemId, listId)
          setSearchModal((prev) => ({
            ...prev,
            data: prev.data.map((i) =>
              i.id === itemId ? { ...i, is_checked: true, checked_at: new Date().toISOString() } : i
            ),
          }))
        }}
        onUncheckItem={(itemId, listId) => {
          uncheckListItem(itemId, listId)
          setSearchModal((prev) => ({
            ...prev,
            data: prev.data.map((i) =>
              i.id === itemId ? { ...i, is_checked: false, checked_at: null } : i
            ),
          }))
        }}
        onCheckAll={(listId) => {
          checkAllItems(listId)
          setSearchModal((prev) => ({
            ...prev,
            data: prev.data.map((i) => ({
              ...i,
              is_checked: true,
              checked_at: i.checked_at || new Date().toISOString(),
            })),
          }))
        }}
        onDeleteItem={(itemId, listId) => {
          deleteListItem(itemId, listId)
          setSearchModal((prev) => ({
            ...prev,
            data: prev.data.filter((i) => i.id !== itemId),
          }))
        }}
        onToggleCore={(itemId, listId, isCore) => {
          toggleItemCore(itemId, listId, isCore)
          setSearchModal((prev) => ({
            ...prev,
            data: prev.data.map((i) =>
              i.id === itemId ? { ...i, is_core: isCore } : i
            ),
          }))
        }}
        onAddItem={async (listId, text, isCore = false, order) => {
          const newItem = await addItemToList(listId, text, isCore, order)
          if (newItem) {
            setSearchModal((prev) => ({
              ...prev,
              data: [...prev.data, newItem],
            }))
          }
        }}
      />

      {/* Bottom Input Bar */}
      <form className="input-bar" onSubmit={handleSubmit}>
        <button
          type="button"
          className="whats-left-btn"
          onClick={handleWhatsLeft}
          disabled={sending}
        >
          What's left?
        </button>
        <input
          type="text"
          placeholder="Type tasks or ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="button"
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleMicToggle}
          disabled={sending || voiceStatus === 'transcribing' || micPermission === 'denied'}
          aria-label={isRecording ? 'Tap to send recording' : 'Tap to record'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="1" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="8" y1="21" x2="16" y2="21" />
          </svg>
        </button>
        <button type="submit" className="send-btn" disabled={!input.trim() || sending}>
          &uarr;
        </button>
      </form>
    </>
  )
}

function ParentTaskCard({ task, subtasks, onComplete, onDelete, onUpdate, isOverdue = false }) {
  const [expanded, setExpanded] = useState(false)
  const isParent = task.is_parent && subtasks.length > 0
  const hasLowConfidence = task.confidence === 'medium' || task.confidence === 'low'

  if (!isParent) {
    return <TaskCard task={task} onComplete={onComplete} onDelete={onDelete} onUpdate={onUpdate} isOverdue={isOverdue} />
  }

  const completedCount = subtasks.filter((s) => s.status === 'completed').length
  const totalCount = subtasks.length
  const allDone = task.status === 'completed'
  const rollCount = task.roll_count || 0
  const showRollFlag = rollCount >= 3
  const rollFlagColor = rollCount >= 6 ? '#F97316' : '#EAB308'
  const rollTextStyle = rollCount >= 6 ? { color: '#F97316', fontWeight: 600 } : rollCount >= 4 ? { color: '#EAB308' } : {}

  const bucketColor = isOverdue ? '#DC2626' : userConfig.getBucketColor(task.bucket)
  const dueDateLabel = getDueDateLabel(task.dueDate)

  return (
    <div className={`parent-task-wrapper ${allDone ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}>
      <div
        className={`task-card parent-task ${allDone ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}
        onClick={() => setExpanded((e) => !e)}
      >
        <button
          className="task-checkbox"
          onClick={(e) => {
            e.stopPropagation()
            if (!allDone) onComplete(task.id)
          }}
          aria-label={allDone ? 'Completed' : 'Mark complete'}
        >
          <span className="check-icon">&#10003;</span>
        </button>
        <div className="task-content">
          <div className={`task-text ${isOverdue ? 'overdue-text' : ''}`} style={rollTextStyle}>
            {showRollFlag && <span className="roll-flag" style={{ color: rollFlagColor }}>⚑ </span>}
            {task.text}
            {hasLowConfidence && <span className="confidence-dot" title="Low confidence assignment">●</span>}
            <span className="subtask-progress">
              ({completedCount}/{totalCount})
            </span>
          </div>
          <div className="task-meta">
            <span
              className="task-bucket"
              style={{ background: `${bucketColor}20`, color: bucketColor }}
            >
              {task.bucket}
            </span>
            {showRollFlag && (
              <span className="roll-counter" style={{ color: rollFlagColor }}>Rolled {rollCount}x</span>
            )}
            {dueDateLabel && (
              <span className="task-due-chip" style={{ color: dueDateLabel.color }}>
                {dueDateLabel.text}
              </span>
            )}
            {task.priority !== 'normal' && (
              <span className={`task-priority ${task.priority}`}>
                {task.priority}
              </span>
            )}
          </div>
        </div>
        <span className={`chevron ${expanded ? 'expanded' : ''}`}>&#9660;</span>
      </div>
      {expanded && (
        <div className="subtask-list">
          {subtasks.map((sub) => (
            <TaskCard key={sub.id} task={sub} onComplete={onComplete} onDelete={onDelete} onUpdate={onUpdate} isSubtask isOverdue={isOverdue} />
          ))}
        </div>
      )}
    </div>
  )
}

const NUDGE_KEY = (id) => `marlonos_roll_nudge_${id}`

function TaskCard({ task, onComplete, onDelete, onUpdate, isSubtask = false, isOverdue = false }) {
  const isCritical = task.priority === 'critical'
  const isMustDo = task.mustDoToday
  const isCompleted = task.status === 'completed'
  const hasLowConfidence = task.confidence === 'medium' || task.confidence === 'low'
  const rollCount = task.roll_count || 0

  // Roll flag level
  const showRollFlag = rollCount >= 3
  const rollLevel = rollCount >= 6 ? 'orange' : rollCount >= 4 ? 'amber' : rollCount >= 3 ? 'amber-soft' : null
  const rollFlagColor = rollCount >= 6 ? '#F97316' : '#EAB308'
  const rollTextStyle = rollCount >= 6
    ? { color: '#F97316', fontWeight: 600 }
    : rollCount >= 4
      ? { color: '#EAB308' }
      : {}

  // Nudge logic — show at roll_count 4, again at 8, 12, ...
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    const stored = localStorage.getItem(NUDGE_KEY(task.id))
    return stored ? parseInt(stored) : null
  })
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const showNudge = !isSubtask && !isCompleted && rollCount >= 4 &&
    (nudgeDismissed === null || rollCount >= nudgeDismissed + 4)

  const handleKeep = () => {
    localStorage.setItem(NUDGE_KEY(task.id), String(rollCount))
    setNudgeDismissed(rollCount)
  }

  const handleRemove = () => {
    if (onDelete) onDelete(task.id)
  }

  const handleScheduleConfirm = () => {
    if (scheduleDate && onUpdate) {
      onUpdate(task.id, scheduleDate)
      localStorage.setItem(NUDGE_KEY(task.id), String(rollCount))
      setNudgeDismissed(rollCount)
      setScheduling(false)
    }
  }

  const classes = [
    'task-card',
    isCompleted && 'completed',
    isCritical && 'critical',
    isMustDo && 'must-do-today',
    isSubtask && 'subtask',
    isOverdue && 'overdue',
  ]
    .filter(Boolean)
    .join(' ')

  const bucketColor = isOverdue ? '#DC2626' : userConfig.getBucketColor(task.bucket)
  const dueDateLabel = getDueDateLabel(task.dueDate)
  const daysOver = getDaysOverdue(task.dueDate)

  return (
    <>
      <div className={classes}>
        <button
          className="task-checkbox"
          onClick={() => !isCompleted && onComplete(task.id)}
          aria-label={isCompleted ? 'Completed' : 'Mark complete'}
        >
          <span className="check-icon">&#10003;</span>
        </button>
        <div className="task-content">
          <div
            className={`task-text ${isOverdue ? 'overdue-text' : ''}`}
            style={rollTextStyle}
          >
            {showRollFlag && (
              <span className="roll-flag" style={{ color: rollFlagColor }}>⚑ </span>
            )}
            {task.text}
            {hasLowConfidence && <span className="confidence-dot" title="Low confidence assignment">●</span>}
            {isOverdue && daysOver > 0 && (
              <span className="overdue-ago"> ({daysOver === 1 ? '1 day ago' : `${daysOver} days ago`})</span>
            )}
          </div>
          <div className="task-meta">
            {!isSubtask && (
              <span
                className="task-bucket"
                style={{ background: `${bucketColor}20`, color: bucketColor }}
              >
                {task.bucket}
              </span>
            )}
            {showRollFlag && rollCount >= 3 && (
              <span className="roll-counter" style={{ color: rollFlagColor }}>
                Rolled {rollCount}x
              </span>
            )}
            {!isSubtask && dueDateLabel && (
              <span className="task-due-chip" style={{ color: dueDateLabel.color }}>
                {dueDateLabel.text}
              </span>
            )}
            {task.priority !== 'normal' && (
              <span className={`task-priority ${task.priority}`}>
                {task.priority}
              </span>
            )}
            {task.scheduledTime && (
              <span className="task-time">{formatTime(task.scheduledTime)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Roll nudge banner — inline, below the card */}
      {showNudge && (
        <div className="roll-nudge">
          <div className="roll-nudge-message">
            This has rolled {rollCount} days in a row. Schedule it, remove it, or keep it?
          </div>
          {scheduling ? (
            <div className="roll-nudge-schedule">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="roll-nudge-date-input"
              />
              <button className="roll-nudge-btn-gold" onClick={handleScheduleConfirm} disabled={!scheduleDate}>
                Save
              </button>
              <button className="roll-nudge-btn-gray" onClick={() => setScheduling(false)}>
                Back
              </button>
            </div>
          ) : (
            <div className="roll-nudge-actions">
              <button className="roll-nudge-btn-gold" onClick={() => setScheduling(true)}>
                Schedule
              </button>
              <button className="roll-nudge-btn-red" onClick={handleRemove}>
                Remove
              </button>
              <button className="roll-nudge-btn-gray" onClick={handleKeep}>
                Keep
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default App
