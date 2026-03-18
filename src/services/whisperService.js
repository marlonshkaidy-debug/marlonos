const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

export async function transcribeAudio(audioBlob) {
  if (!OPENAI_API_KEY) {
    console.error('[Whisper] Missing VITE_OPENAI_API_KEY')
    return null
  }

  // Determine file extension from mime type
  const ext = audioBlob.type.includes('mp4') ? 'mp4' : 'webm'

  const formData = new FormData()
  formData.append('file', audioBlob, `recording.${ext}`)
  formData.append('model', 'whisper-1')

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error('[Whisper] API error:', res.status, errorBody)
      return null
    }

    const data = await res.json()
    return data.text || null
  } catch (err) {
    console.error('[Whisper] Transcription failed:', err)
    return null
  }
}
