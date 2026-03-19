import { supabase } from '../lib/supabase'

export async function logTranscript(rawTranscript, parsedOutput, taskIds) {
  try {
    const { data, error } = await supabase
      .from('transcripts')
      .insert({
        raw_transcript: rawTranscript,
        parsed_output: parsedOutput,
        task_ids: taskIds || null,
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  } catch (err) {
    console.error('[TranscriptLog] Failed to log transcript:', err)
    return null
  }
}

export async function markCorrected(transcriptId, correctionNotes) {
  try {
    const { error } = await supabase
      .from('transcripts')
      .update({
        was_corrected: true,
        correction_notes: correctionNotes,
      })
      .eq('id', transcriptId)

    if (error) throw error
  } catch (err) {
    console.error('[TranscriptLog] Failed to mark corrected:', err)
  }
}

export async function linkTaskIds(transcriptId, taskIds) {
  try {
    const { error } = await supabase
      .from('transcripts')
      .update({ task_ids: taskIds })
      .eq('id', transcriptId)

    if (error) throw error
  } catch (err) {
    console.error('[TranscriptLog] Failed to link task IDs:', err)
  }
}
