import { supabase } from '../lib/supabase'

// All functions fail silently — never block UI

export async function getLists() {
  try {
    const { data, error } = await supabase
      .from('lists')
      .select('*, list_items(*)')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('[ListService] getLists failed:', err)
    return []
  }
}

export async function getList(listId) {
  try {
    const { data, error } = await supabase
      .from('lists')
      .select('*, list_items(*)')
      .eq('id', listId)
      .single()

    if (error) throw error
    // Sort items: unchecked first by order, checked at bottom
    if (data?.list_items) {
      data.list_items.sort((a, b) => {
        if (a.is_checked !== b.is_checked) return a.is_checked ? 1 : -1
        return (a.item_order || 0) - (b.item_order || 0)
      })
    }
    return data
  } catch (err) {
    console.error('[ListService] getList failed:', err)
    return null
  }
}

export async function createList(name, type = 'permanent', context = null) {
  try {
    const { data, error } = await supabase
      .from('lists')
      .insert({ name, type, context })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('[ListService] createList failed:', err)
    return null
  }
}

export async function archiveList(listId) {
  try {
    const { error } = await supabase
      .from('lists')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', listId)

    if (error) throw error
  } catch (err) {
    console.error('[ListService] archiveList failed:', err)
  }
}

export async function deleteList(listId) {
  try {
    const { error } = await supabase
      .from('lists')
      .delete()
      .eq('id', listId)

    if (error) throw error
  } catch (err) {
    console.error('[ListService] deleteList failed:', err)
  }
}

export async function addItem(listId, text, isCore = false, order = 0) {
  try {
    const { data, error } = await supabase
      .from('list_items')
      .insert({ list_id: listId, text, is_core: isCore, item_order: order })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('[ListService] addItem failed:', err)
    return null
  }
}

export async function checkItem(itemId) {
  try {
    const { data, error } = await supabase
      .from('list_items')
      .update({ is_checked: true, checked_at: new Date().toISOString() })
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('[ListService] checkItem failed:', err)
    return null
  }
}

export async function uncheckItem(itemId) {
  try {
    const { data, error } = await supabase
      .from('list_items')
      .update({ is_checked: false, checked_at: null })
      .eq('id', itemId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.error('[ListService] uncheckItem failed:', err)
    return null
  }
}

export async function checkAllItems(listId) {
  try {
    const { error } = await supabase
      .from('list_items')
      .update({ is_checked: true, checked_at: new Date().toISOString() })
      .eq('list_id', listId)
      .eq('is_checked', false)

    if (error) throw error
  } catch (err) {
    console.error('[ListService] checkAllItems failed:', err)
  }
}

export async function deleteItem(itemId) {
  try {
    const { error } = await supabase
      .from('list_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
  } catch (err) {
    console.error('[ListService] deleteItem failed:', err)
  }
}

export async function getCoreItems(listName) {
  try {
    const { data, error } = await supabase
      .from('lists')
      .select('id, list_items(*)')
      .ilike('name', listName)
      .eq('list_items.is_core', true)

    if (error) throw error
    // Flatten all core items across matching lists
    const items = []
    for (const list of (data || [])) {
      for (const item of (list.list_items || [])) {
        items.push(item)
      }
    }
    return items
  } catch (err) {
    console.error('[ListService] getCoreItems failed:', err)
    return []
  }
}

export async function getArchivedLists() {
  try {
    const { data, error } = await supabase
      .from('lists')
      .select('*, list_items(*)')
      .eq('is_archived', true)
      .order('archived_at', { ascending: false })

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('[ListService] getArchivedLists failed:', err)
    return []
  }
}

export async function updateItemCore(itemId, isCore) {
  try {
    const { error } = await supabase
      .from('list_items')
      .update({ is_core: isCore })
      .eq('id', itemId)

    if (error) throw error
  } catch (err) {
    console.error('[ListService] updateItemCore failed:', err)
  }
}

export async function promoteCoreItems(listId) {
  // Promote items that appear on 3+ versions of this list to is_core
  try {
    const list = await getList(listId)
    if (!list) return

    // Get all lists with same name (including archived)
    const { data: allVersions, error } = await supabase
      .from('lists')
      .select('id, list_items(text)')
      .ilike('name', list.name)

    if (error) throw error
    if (!allVersions || allVersions.length < 3) return

    // Count how many list versions each item text appears on
    const itemCounts = {}
    for (const version of allVersions) {
      for (const item of (version.list_items || [])) {
        const key = item.text.toLowerCase().trim()
        itemCounts[key] = (itemCounts[key] || 0) + 1
      }
    }

    // Promote items appearing 3+ times on current list
    for (const item of (list.list_items || [])) {
      const key = item.text.toLowerCase().trim()
      if (itemCounts[key] >= 3 && !item.is_core) {
        await updateItemCore(item.id, true)
      }
    }
  } catch (err) {
    console.error('[ListService] promoteCoreItems failed:', err)
  }
}
