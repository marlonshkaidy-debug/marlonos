import { useState, useRef, useEffect, useCallback } from 'react'
import userConfig from '../config/userConfig'
import { getDueDateLabel } from '../utils/time'

export default function SearchModal({
  modal,
  onClose,
  onCheckItem,
  onUncheckItem,
  onCheckAll,
  onDeleteItem,
  onToggleCore,
  onAddItem,
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
    // Long press detection
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

  if (!modal.isOpen) return null

  const isListView = modal.type === 'list'
  const items = modal.data || []

  // For list view, split into core and regular, with unchecked at top (by item_order) and checked at bottom (by checked_at)
  let coreItems = []
  let regularItems = []
  if (isListView) {
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
          <h2 className="search-modal-title">{modal.title}</h2>
          <div className="search-modal-header-actions">
            {isListView && (
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

        <div className="search-modal-content">
          {isListView ? (
            <>
              {/* Core Items Section */}
              {coreItems.length > 0 && (
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
              {regularItems.length > 0 && (
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

              {coreItems.length === 0 && regularItems.length === 0 && (
                <div className="search-modal-empty">No items yet. Add some below or say "add milk to {modal.title}"</div>
              )}

              {/* Add Item Form */}
              <form className="list-add-form" onSubmit={handleAddItem}>
                <input
                  type="text"
                  placeholder="Add an item..."
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                />
                <button type="submit" disabled={!addText.trim()}>
                  +
                </button>
              </form>
            </>
          ) : (
            /* Task search results */
            <>
              {items.length === 0 ? (
                <div className="search-modal-empty">No matching tasks found</div>
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
          <button className="search-modal-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
