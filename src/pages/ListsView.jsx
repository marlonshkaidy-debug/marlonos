import { useState } from 'react'

export default function ListsView({ activeLists, loading, onCreateList, onOpenList }) {
  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await onCreateList(name, 'permanent', null)
    setNewName('')
    setShowNewInput(false)
  }

  return (
    <div className="lists-view">
      <div className="lists-header">
        <h2 className="lists-title">My Lists</h2>
        <button
          className="lists-new-btn"
          onClick={() => setShowNewInput((s) => !s)}
        >
          {showNewInput ? 'Cancel' : '+ New List'}
        </button>
      </div>

      {showNewInput && (
        <form className="lists-new-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="List name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={!newName.trim()}>
            Create
          </button>
        </form>
      )}

      {loading ? (
        <div className="loading-spinner">Loading lists...</div>
      ) : activeLists.length === 0 ? (
        <div className="lists-empty">
          Say "create a grocery list" to get started
        </div>
      ) : (
        <div className="lists-grid">
          {activeLists.map((list) => {
            const items = list.list_items || []
            const checkedCount = items.filter((i) => i.is_checked).length
            const totalCount = items.length
            const isPermanent = list.type === 'permanent'

            return (
              <button
                key={list.id}
                className="list-card"
                onClick={() => onOpenList(list)}
              >
                <div className="list-card-header">
                  <span className="list-card-icon">
                    {isPermanent ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#c9a84c" stroke="none">
                        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    )}
                  </span>
                  <span className={`list-card-type ${list.type}`}>
                    {isPermanent ? 'Permanent' : 'Session'}
                  </span>
                </div>
                <div className="list-card-name">{list.name}</div>
                {list.context && (
                  <div className="list-card-context">{list.context}</div>
                )}
                <div className="list-card-progress">
                  <div className="list-card-progress-bar">
                    <div
                      className="list-card-progress-fill"
                      style={{
                        width: totalCount > 0 ? `${(checkedCount / totalCount) * 100}%` : '0%',
                      }}
                    />
                  </div>
                  <span className="list-card-count">
                    {checkedCount}/{totalCount}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
