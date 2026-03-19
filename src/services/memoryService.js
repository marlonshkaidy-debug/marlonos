import { supabase } from '../lib/supabase'

// All functions fail silently — never block main flow

export async function getMemory() {
  try {
    const { data, error } = await supabase
      .from('memory')
      .select('*')
      .order('last_referenced', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('[MemorySpine] getMemory failed:', err)
    return []
  }
}

export async function lookupEntity(entityName) {
  try {
    const { data, error } = await supabase
      .from('memory')
      .select('*')
      .ilike('entity_name', entityName)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (err) {
    console.error('[MemorySpine] lookupEntity failed:', err)
    return null
  }
}

export async function upsertEntity(entityName, entityType, bucket, context, confidence = 'INFERRED') {
  try {
    // Check if entity already exists
    const existing = await lookupEntity(entityName)

    if (existing) {
      // Don't downgrade CONFIRMED to INFERRED
      if (existing.confidence === 'CONFIRMED' && confidence === 'INFERRED') {
        // Only update last_referenced and context if provided
        const updates = { last_referenced: new Date().toISOString() }
        if (context) updates.context = context
        const { error } = await supabase
          .from('memory')
          .update(updates)
          .eq('id', existing.id)
        if (error) throw error
        return
      }

      const updates = {
        entity_type: entityType,
        default_bucket: bucket,
        confidence,
        last_referenced: new Date().toISOString(),
      }
      if (context) updates.context = context

      const { error } = await supabase
        .from('memory')
        .update(updates)
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('memory').insert({
        entity_name: entityName,
        entity_type: entityType,
        default_bucket: bucket,
        context: context || null,
        confidence,
      })
      if (error) throw error
    }
  } catch (err) {
    console.error('[MemorySpine] upsertEntity failed:', err)
  }
}

export async function confirmEntity(entityName, bucket) {
  try {
    const existing = await lookupEntity(entityName)
    if (!existing) return

    const { error } = await supabase
      .from('memory')
      .update({
        confidence: 'CONFIRMED',
        default_bucket: bucket,
        correction_count: (existing.correction_count || 0) + 1,
        last_referenced: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) throw error
  } catch (err) {
    console.error('[MemorySpine] confirmEntity failed:', err)
  }
}

export async function inferEntity(entityName, bucket, context) {
  try {
    const existing = await lookupEntity(entityName)

    // Don't downgrade CONFIRMED
    if (existing && existing.confidence === 'CONFIRMED') {
      // Just update last_referenced
      await updateLastReferenced(entityName)
      return
    }

    await upsertEntity(entityName, existing?.entity_type || 'unknown', bucket, context, 'INFERRED')
  } catch (err) {
    console.error('[MemorySpine] inferEntity failed:', err)
  }
}

export async function updateLastReferenced(entityName) {
  try {
    const { error } = await supabase
      .from('memory')
      .update({ last_referenced: new Date().toISOString() })
      .ilike('entity_name', entityName)

    if (error) throw error
  } catch (err) {
    console.error('[MemorySpine] updateLastReferenced failed:', err)
  }
}
