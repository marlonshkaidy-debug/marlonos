import { useState, useEffect, useRef } from 'react'
import { useTasks } from './hooks/useTasks'
import { useVoiceRecorder } from './hooks/useVoiceRecorder'
import { transcribeAudio } from './services/whisperService'
import { DEFAULT_BUCKETS } from './lib/buckets'
import { formatTime } from './utils/time'
import './App.css'

const ALL_FILTER = 'All'

function App() {
  const { tasks, loading, addFromText, complete } = useTasks()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activeBucket, setActiveBucket] = useState(ALL_FILTER)
  const [voiceStatus, setVoiceStatus] = useState(null) // 'listening' | 'transcribing' | null
  const [micError, setMicError] = useState(null)

  const { isRecording, audioBlob, error: recorderError, startRecording, stopRecording } = useVoiceRecorder()
  const addFromTextRef = useRef(addFromText)
  const pendingTranscription = useRef(false)

  // Keep ref current so the effect always calls the latest addFromText
  useEffect(() => {
    addFromTextRef.current = addFromText
  }, [addFromText])

  // Show mic permission errors
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

        // Auto-submit the transcript
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

  const handleMicDown = () => {
    setMicError(null)
    setVoiceStatus('listening')
    startRecording()
  }

  const handleMicUp = () => {
    if (isRecording) {
      stopRecording()
    }
  }

  const filteredTasks =
    activeBucket === ALL_FILTER
      ? tasks
      : tasks.filter((t) => t.bucket === activeBucket)

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
      {/* Top Bar */}
      <div className="top-bar">
        <h1>MarlonOS</h1>
        <div className="date">{today}</div>
      </div>

      {/* Bucket Tabs */}
      <div className="bucket-tabs">
        {[ALL_FILTER, ...DEFAULT_BUCKETS].map((bucket) => (
          <button
            key={bucket}
            className={`bucket-tab ${activeBucket === bucket ? 'active' : ''}`}
            onClick={() => setActiveBucket(bucket)}
          >
            {bucket}
          </button>
        ))}
      </div>

      {/* Task List */}
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
          filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} onComplete={complete} />
          ))
        )}
        {sending && (
          <div className="sending-indicator">Processing with Claude...</div>
        )}
      </div>

      {/* Voice Status Banner */}
      {voiceStatus && (
        <div className="voice-status">
          {voiceStatus === 'listening' ? 'Listening...' : 'Transcribing...'}
        </div>
      )}

      {/* Mic Error Banner */}
      {micError && (
        <div className="mic-error" onClick={() => setMicError(null)}>
          {micError}
        </div>
      )}

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
          onPointerDown={handleMicDown}
          onPointerUp={handleMicUp}
          onPointerLeave={handleMicUp}
          disabled={sending || voiceStatus === 'transcribing'}
          aria-label="Hold to record"
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

function TaskCard({ task, onComplete }) {
  const isCritical = task.priority === 'critical'
  const isMustDo = task.mustDoToday
  const isCompleted = task.status === 'completed'

  const classes = [
    'task-card',
    isCompleted && 'completed',
    isCritical && 'critical',
    isMustDo && 'must-do-today',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <button
        className="task-checkbox"
        onClick={() => !isCompleted && onComplete(task.id)}
        aria-label={isCompleted ? 'Completed' : 'Mark complete'}
      >
        <span className="check-icon">&#10003;</span>
      </button>
      <div className="task-content">
        <div className="task-text">{task.text}</div>
        <div className="task-meta">
          <span className="task-bucket">{task.bucket}</span>
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
  )
}

export default App
