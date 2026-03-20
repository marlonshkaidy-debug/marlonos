import { useState, useEffect } from 'react'

const STORAGE_KEY = 'mic_permission_granted'

export function useMicPermission() {
  const [micPermission, setMicPermission] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true' ? 'granted' : 'unknown'
  })

  useEffect(() => {
    if (micPermission === 'granted') return

    // Check if permission API is available for a silent check first
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then((result) => {
        if (result.state === 'granted') {
          localStorage.setItem(STORAGE_KEY, 'true')
          setMicPermission('granted')
          return
        }
        if (result.state === 'denied') {
          localStorage.removeItem(STORAGE_KEY)
          setMicPermission('denied')
          return
        }
        // State is 'prompt' — attempt silent background request
        requestMicPermission()
      }).catch(() => {
        // Permissions API not supported for microphone — fall through
        requestMicPermission()
      })
    } else {
      requestMicPermission()
    }

    function requestMicPermission() {
      setMicPermission('requesting')
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          // Permission granted — release the stream immediately
          stream.getTracks().forEach((t) => t.stop())
          localStorage.setItem(STORAGE_KEY, 'true')
          setMicPermission('granted')
        })
        .catch((err) => {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            localStorage.removeItem(STORAGE_KEY)
            setMicPermission('denied')
          }
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return micPermission
}
