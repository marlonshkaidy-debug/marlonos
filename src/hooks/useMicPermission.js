import { useState, useEffect } from 'react'

const STORAGE_KEY = 'mic_permission_granted'

export function useMicPermission() {
  const [micPermission, setMicPermission] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true' ? 'granted' : 'unknown'
  })

  useEffect(() => {
    if (micPermission === 'granted') return

    // Proactively request mic permission on first load
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Permission granted — stop tracks immediately, we just needed the prompt
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return micPermission
}
