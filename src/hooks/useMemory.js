import { useState, useEffect, useCallback } from 'react'
import * as memoryService from '../services/memoryService'

export function useMemory() {
  const [memory, setMemory] = useState([])
  const [loading, setLoading] = useState(true)

  const refreshMemory = useCallback(async () => {
    try {
      const data = await memoryService.getMemory()
      setMemory(data)
    } catch (err) {
      console.error('[MemorySpine] refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshMemory()
  }, [refreshMemory])

  const confirmEntity = useCallback(
    async (name, bucket) => {
      await memoryService.confirmEntity(name, bucket)
      await refreshMemory()
    },
    [refreshMemory]
  )

  return { memory, loading, confirmEntity, refreshMemory }
}
