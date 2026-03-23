import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import userConfig from '../config/userConfig'
import { getDueDateLabel } from '../utils/time'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { transcribeAudio } from '../services/whisperService'
import { findTemplate } from '../config/listTemplates'

export default function SearchModal({
  modal,
  onClose,
  onCheckItem,
  onUncheckItem,
  onCheckAll,
  onDeleteItem,
  onToggleCore,
  onAddItem,
  onVoiceCommand,
  onVoiceListCommand,
  showToast,
  memory,
}) {
  const [addText, setAddText] = useState('')
  const [swipingId, setSwipingId] = useState(null)
  const [longPressId, setLongPressId] = useState(null)
  const longPressTimer = useRef(null)
  const touchStartX = useRef(0)
  const touchCurrentX = useRef(0)
  const overlayRef = useRef(null)
  const sheetRef = useRef(null)
  const dragStartY = useRef(null)

  // Voice recording
  const { isRecording, audioBlob, startRecording, stopRecording } = useVoiceRecorder()
  const [voiceStatus, setVoiceStatus] = useState(null)
  const pendingTranscription = useRef(false)

  // Template seeding
  const [seedItems, setSeedItems] = useState(null)
  const [seedingDone, setSeedingDone] = useState(false)
  const seedItemsRef = useRef(null)
  useEffect(() => { seedItemsRef.current = seedItems }, [seedItems])

  // Reset state when modal opens
  useEffect(() => {
    if (!modal.isOpen) return
    setVoiceStatus(null)
    setSeedingDone(false)
    setAddText('')
    pendingTranscription.current = false

    // Template seeding for empty list modals
    if (modal.type === 'list' && modal.listId && (!modal.data || modal.data.length === 0)) {
      const template = findTemplate(modal.title)
      if (template) {
        setSeedItems({
          label: template.label,
          items: template.items.map((text, i) => ({ text, id: `seed-${i}`, included: true })),
        })
      } else {
        setSeedItems(null)
      }
    } else {
      setSeedItems(null)
    }
  }, [modal.isOpen, modal.type, modal.listId, modal.title]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mic toggle — tap once to start (pulse red), tap again to stop immediately
  // Setting 'transcribing' on stop prevents double-tap and shows correct status
  const handleMicToggle = useCallback(() => {
    if (isRecording) {
      setVoiceStatus('transcribing')
      stopRecording()
    } else {
      pendingTranscription.current = false
      setVoiceStatus('recording')
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Process audio when recording stops
  useEffect(() => {
    if (!audioBlob || pendingTranscription.current || !modal.isOpen) return
    pendingTranscription.current = true

    const run = async () => {
      setVoiceStatus('transcribing')
      try {
        const transcript = await transcribeAudio(audioBlob)
        if (!transcript) return

        const lower = transcript.toLowerCase().trim()

        // Close commands
        if (['done', 'never mind', 'nevermind', 'close', 'go back'].includes(lower)) {
          onClose()
          return
        }

        // "Looks good" during template seeding → confirm seed items
        if (seedItemsRef.current && !seedingDone) {
          if (['looks good', 'that looks good', 'yes', 'confirm', 'perfect'].includes(lower)) {
            const items = seedItemsRef.current.items
            if (items && modal.listId && onAddItem) {
              const included = items.filter(item => item.included)
              for (let i = 0; i < included.length; i++) {
                await onAddItem(modal.listId, included[i].text, true, i)
              }
              setSeedingDone(true)
              setSeedItems(null)
            }
            return
          }
        }

        // Route to list-context pipeline when in list mode, otherwise global pipeline
        if (modal.type === 'list' && modal.listId && onVoiceListCommand) {
          await onVoiceListCommand(transcript, modal.listId, modal.title)
        } else if (onVoiceCommand) {
          await onVoiceCommand(transcript)
        }
      } finally {
        setVoiceStatus(null)
        pendingTranscription.current = false
      }
    }
    run()
  }, [audioBlob]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed item removal
  const handleSeedRemove = (seedId) => {
    setSeedItems(prev => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map(item =>
          item.id === seedId ? { ...item, included: false } : item
        ),
      }
    })
  }

  // Seed confirmation via button
  const handleSeedConfirm = async () => {
    if (!seedItems || !modal.listId || !onAddItem) return
    const included = seedItems.items.filter(item => item.included)
    for (let i = 0; i < included.length; i++) {
      await onAddItem(modal.listId, included[i].text, true, i)
    }
    setSeedingDone(true)
    setSeedItems(null)
  }

  // Close on overlay click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  // Swipe-down-to-dismiss on the sheet
  const handleSheetTouchStart = useCallback((e) => {
    dragStartY.current = e.touches[0].clientY
  }, [])

  const handleSheetTouchMove = useCallback((e) => {
    if (dragStartY.current === null) return
    const dy = e.touches[0].clientY - dragStartY.current
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`
    }
  }, [])

  const handleSheetTouchEnd = useCallback((e) => {
    if (dragStartY.current === null) return
    const dy = e.changedTouches[0].clientY - dragStartY.current
    dragStartY.current = null
    if (sheetRef.current) {
      sheetRef.current.style.transform = ''
    }
    if (dy > 120) onClose()
  }, [onClose])

  // Item swipe-to-delete
  const handleItemTouchStart = (e, itemId) => {
    touchStartX.current = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
    longPressTimer.current = setTimeout(() => {
      setLongPressId(itemId)
    }, 600)
  }

  const handleItemTouchMove = (e, itemId) => {
    clearTimeout(longPressTimer.current)
    touchCurrentX.current = e.touches[0].clientX
    const dx = touchCurrentX.current - touchStartX.current
    if (dx < -30) {
      setSwipingId(itemId)
    } else {
      setSwipingId(null)
    }
  }

  const handleItemTouchEnd = (itemId) => {
    clearTimeout(longPressTimer.current)
    const dx = touchCurrentX.current - touchStartX.current
    if (dx < -80 && onDeleteItem) {
      onDeleteItem(itemId, modal.listId)
    }
    setSwipingId(null)
  }

  // Handle long press core toggle
  useEffect(() => {
    if (longPressId && onToggleCore && modal.type === 'list') {
      const items = modal.data || []
      const item = items.find((i) => i.id === longPressId)
      if (item) {
        onToggleCore(longPressId, modal.listId, !item.is_core)
      }
      setLongPressId(null)
    }
  }, [longPressId, onToggleCore, modal])

  const handleAddItem = (e) => {
    e.preventDefault()
    const text = addText.trim()
    if (!text || !onAddItem || !modal.listId) return
    onAddItem(modal.listId, text)
    setAddText('')
  }

  // "Did you mean" suggestions from memory for no-results
  const didYouMean = useMemo(() => {
    if (!modal.query || (modal.data && modal.data.length > 0)) return []
    if (!memory || memory.length === 0) return []
    const queryWords = modal.query.toLowerCase().split(/\s+/)
    return memory
      .filter(m => queryWords.some(w => m.entity_name.toLowerCase().includes(w)))
      .slice(0, 3)
  }, [modal.query, modal.data, memory])

  if (!modal.isOpen) return null

  const isListView = modal.type === 'list'
  const items = modal.data || []
  const hasNoResults = items.length === 0

  // For list view, split into core and regular
  let coreItems = []
  let regularItems = []
  if (isListView && !seedItems) {
    const sortUnchecked = (a, b) => (a.item_order || 0) - (b.item_order || 0)
    const sortChecked = (a, b) => {
      const aTime = a.checked_at ? new Date(a.checked_at).getTime() : 0
      const bTime = b.checked_at ? new Date(b.checked_at).getTime() : 0
      return aTime - bTime
    }
    const uncheckedCore = items.filter((i) => i.is_core && !i.is_checked).sort(sortUnchecked)
    const checkedCore = items.filter((i) => i.is_core && i.is_checked).sort(sortChecked)
    const uncheckedRegular = items.filter((i) => !i.is_core && !i.is_checked).sort(sortUnchecked)
    const checkedRegular = items.filter((i) => !i.is_core && i.is_checked).sort(sortChecked)
    coreItems = [...uncheckedCore, ...checkedCore]
    regularItems = [...uncheckedRegular, ...checkedRegular]
  }

  const micIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  )

  return (
    <div className="search-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div
        className="search-modal-sheet"
        ref={sheetRef}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
      >
        <div className="search-modal-handle" />

        <div className="search-modal-header">
          <h2 className="search-modal-title">
            {hasNoResults && modal.query ? `No results for: ${modal.query}` : modal.title}
          </h2>
          <div className="search-modal-header-actions">
            {isListView && !seedItems && (
              <button
                className="search-modal-check-all"
                onClick={() => onCheckAll && onCheckAll(modal.listId)}
              >
                Check All
              </button>
            )}
            <button className="search-modal-close-x" onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {/* Voice Status */}
        {voiceStatus && (
          <div className="modal-voice-status">
            {voiceStatus === 'recording' ? 'Recording... tap to send' : 'Transcribing...'}
          </div>
        )}

        <div className="search-modal-content">
          {isListView ? (
            <>
              {/* Template Seeding Banner */}
              {seedItems && !seedingDone && (
                <div className="seed-banner">
                  <div className="seed-banner-title">
                    Suggested {seedItems.label} items — tap to remove any that don't apply, then add your own
                  </div>
                  <div className="seed-items-list">
                    {seedItems.items.map((item) => (
                      item.included && (
                        <div key={item.id} className="seed-item-row">
                          <span className="seed-item-check">&#10003;</span>
                          <span className="seed-item-text">{item.text}</span>
                          <button
                            className="seed-item-remove"
                            onClick={() => handleSeedRemove(item.id)}
                          >
                            &times;
                          </button>
                        </div>
                      )
                    ))}
                  </div>
                  <button className="seed-confirm-btn" onClick={handleSeedConfirm}>
                    Confirm Items
                  </button>
                </div>
              )}

              {/* "What else?" prompt after seeding */}
              {seedingDone && (
                <div className="seed-done-prompt">
                  What else do you want to add?
                </div>
              )}

              {/* Core Items Section */}
              {!seedItems && coreItems.length > 0 && (
                <div className="list-section-core">
                  <div className="list-section-label">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#c9a84c" stroke="none">
                      <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                    </svg>
                    Always
                  </div>
                  {coreItems.map((item) => (
                    <div
                      key={item.id}
                      className={`list-item-row ${item.is_checked ? 'checked' : ''} ${swipingId === item.id ? 'swiping' : ''}`}
                      onTouchStart={(e) => handleItemTouchStart(e, item.id)}
                      onTouchMove={(e) => handleItemTouchMove(e, item.id)}
                      onTouchEnd={() => handleItemTouchEnd(item.id)}
                    >
                      <button
                        className="list-item-checkbox"
                        onClick={() =>
                          item.is_checked
                            ? onUncheckItem(item.id, modal.listId)
                            : onCheckItem(item.id, modal.listId)
                        }
                      >
                        {item.is_checked && <span className="check-icon">&#10003;</span>}
                      </button>
                      <span className={`list-item-text ${item.is_checked ? 'checked' : ''}`}>
                        {item.text}
                      </span>
                      {swipingId === item.id && (
                        <span className="list-item-delete-hint">Delete</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Regular Items Section */}
              {!seedItems && regularItems.length > 0 && (
                <div className="list-section-regular">
                  {coreItems.length > 0 && (
                    <div className="list-section-label">Items</div>
                  )}
                  {regularItems.map((item) => (
                    <div
                      key={item.id}
                      className={`list-item-row ${item.is_checked ? 'checked' : ''} ${swipingId === item.id ? 'swiping' : ''}`}
                      onTouchStart={(e) => handleItemTouchStart(e, item.id)}
                      onTouchMove={(e) => handleItemTouchMove(e, item.id)}
                      onTouchEnd={() => handleItemTouchEnd(item.id)}
                    >
                      <button
                        className="list-item-checkbox"
                        onClick={() =>
                          item.is_checked
                            ? onUncheckItem(item.id, modal.listId)
                            : onCheckItem(item.id, modal.listId)
                        }
                      >
                        {item.is_checked && <span className="check-icon">&#10003;</span>}
                      </button>
                      <span className={`list-item-text ${item.is_checked ? 'checked' : ''}`}>
                        {item.text}
                      </span>
                      {swipingId === item.id && (
                        <span className="list-item-delete-hint">Delete</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!seedItems && coreItems.length === 0 && regularItems.length === 0 && !seedingDone && (
                <div className="search-modal-empty">No items yet. Add some below or say "add milk to {modal.title}"</div>
              )}

              {/* Add Item Form with Mic */}
              {!seedItems && (
                <form className="list-add-form" onSubmit={handleAddItem}>
                  <input
                    type="text"
                    placeholder="Add an item..."
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`mic-btn modal-mic-btn ${isRecording ? 'recording' : ''}`}
                    onClick={handleMicToggle}
                    disabled={voiceStatus === 'transcribing'}
                    aria-label={isRecording ? 'Tap to send recording' : 'Tap to record'}
                  >
                    {micIcon}
                  </button>
                  <button type="submit" disabled={!addText.trim()}>
                    +
                  </button>
                </form>
              )}
            </>
          ) : (
            /* Task search results */
            <>
              {hasNoResults ? (
                <div className="search-no-results">
                  {modal.query ? (
                    <>
                      <div className="no-results-message">
                        No tasks found for "{modal.query}".
                      </div>
                      {didYouMean.length > 0 && (
                        <div className="no-results-suggestions">
                          <div className="no-results-label">Did you mean:</div>
                          {didYouMean.map((entity) => (
                            <div key={entity.id || entity.entity_name} className="no-results-suggestion">
                              {entity.entity_name}
                              <span className="no-results-suggestion-bucket">{entity.default_bucket}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="no-results-prompt">
                        Say "add a task for {modal.query}" to create one, or "never mind" to close
                      </div>
                    </>
                  ) : (
                    <div className="no-results-message">No matching tasks found</div>
                  )}
                </div>
              ) : (
                items.map((task) => {
                  const bucketColor = userConfig.getBucketColor(task.bucket)
                  const dueDateLabel = getDueDateLabel(task.dueDate)
                  return (
                    <div key={task.id} className="search-task-card">
                      <div className="search-task-text">{task.text}</div>
                      <div className="search-task-meta">
                        <span
                          className="task-bucket"
                          style={{ background: `${bucketColor}20`, color: bucketColor }}
                        >
                          {task.bucket}
                        </span>
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
                  )
                })
              )}
            </>
          )}
        </div>

        <div className="search-modal-footer">
          {!isListView && (
            <button
              type="button"
              className={`mic-btn modal-mic-btn ${isRecording ? 'recording' : ''}`}
              onClick={handleMicToggle}
              disabled={voiceStatus === 'transcribing'}
              aria-label={isRecording ? 'Tap to send recording' : 'Tap to record'}
            >
              {micIcon}
            </button>
          )}
          <button className="search-modal-done" onClick={onClose}>
            {hasNoResults ? 'Close' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
