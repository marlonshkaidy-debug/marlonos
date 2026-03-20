import { useState, useEffect, useCallback, useMemo } from 'react'
import * as listService from '../services/listService'

export function useLists() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)

  const refreshLists = useCallback(async () => {
    try {
      const data = await listService.getLists()
      setLists(data)
    } catch (err) {
      console.error('[useLists] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshLists()
  }, [refreshLists])

  // Sorted: permanent first (alphabetical), then session (alphabetical)
  const activeLists = useMemo(() => {
    const permanent = lists
      .filter((l) => l.type === 'permanent' && !l.is_archived)
      .sort((a, b) => a.name.localeCompare(b.name))
    const session = lists
      .filter((l) => l.type === 'session' && !l.is_archived)
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...permanent, ...session]
  }, [lists])

  const createList = useCallback(
    async (name, type = 'permanent', context = null) => {
      const newList = await listService.createList(name, type, context)
      if (newList) {
        setLists((prev) => [{ ...newList, list_items: [] }, ...prev])
      }
      return newList
    },
    []
  )

  const addItemToList = useCallback(
    async (listId, text, isCore = false, order = 0) => {
      const newItem = await listService.addItem(listId, text, isCore, order)
      if (newItem) {
        // Optimistic update
        setLists((prev) =>
          prev.map((l) =>
            l.id === listId
              ? { ...l, list_items: [...(l.list_items || []), newItem] }
              : l
          )
        )
      }
      return newItem
    },
    []
  )

  const checkItem = useCallback(async (itemId, listId) => {
    // Optimistic update
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              list_items: (l.list_items || []).map((item) =>
                item.id === itemId
                  ? { ...item, is_checked: true, checked_at: new Date().toISOString() }
                  : item
              ),
            }
          : l
      )
    )
    await listService.checkItem(itemId)
  }, [])

  const uncheckItem = useCallback(async (itemId, listId) => {
    // Optimistic update
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              list_items: (l.list_items || []).map((item) =>
                item.id === itemId
                  ? { ...item, is_checked: false, checked_at: null }
                  : item
              ),
            }
          : l
      )
    )
    await listService.uncheckItem(itemId)
  }, [])

  const checkAllItems = useCallback(async (listId) => {
    // Optimistic update
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              list_items: (l.list_items || []).map((item) => ({
                ...item,
                is_checked: true,
                checked_at: item.checked_at || new Date().toISOString(),
              })),
            }
          : l
      )
    )
    await listService.checkAllItems(listId)
  }, [])

  const deleteList = useCallback(async (listId) => {
    // Optimistic update
    setLists((prev) => prev.filter((l) => l.id !== listId))
    await listService.deleteList(listId)
  }, [])

  const archiveList = useCallback(async (listId) => {
    // Optimistic update
    setLists((prev) => prev.filter((l) => l.id !== listId))
    await listService.archiveList(listId)
  }, [])

  const deleteItem = useCallback(async (itemId, listId) => {
    // Optimistic update
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? { ...l, list_items: (l.list_items || []).filter((item) => item.id !== itemId) }
          : l
      )
    )
    await listService.deleteItem(itemId)
  }, [])

  const toggleItemCore = useCallback(async (itemId, listId, isCore) => {
    // Optimistic update
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              list_items: (l.list_items || []).map((item) =>
                item.id === itemId ? { ...item, is_core: isCore } : item
              ),
            }
          : l
      )
    )
    await listService.updateItemCore(itemId, isCore)
  }, [])

  return {
    lists,
    activeLists,
    loading,
    createList,
    addItemToList,
    checkItem,
    uncheckItem,
    checkAllItems,
    deleteList,
    archiveList,
    deleteItem,
    toggleItemCore,
    refreshLists,
  }
}
