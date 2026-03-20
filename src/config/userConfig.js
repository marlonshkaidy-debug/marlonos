const CUSTOM_BUCKETS_KEY = 'marlonos_custom_buckets'
const BUCKET_COLORS_KEY = 'marlonos_bucket_colors'

function loadCustomBuckets() {
  try {
    const stored = localStorage.getItem(CUSTOM_BUCKETS_KEY)
    if (stored) return JSON.parse(stored)
  } catch (err) {
    console.error('[UserConfig] Failed to load custom buckets:', err)
  }
  return []
}

function saveCustomBuckets(buckets) {
  try {
    localStorage.setItem(CUSTOM_BUCKETS_KEY, JSON.stringify(buckets))
  } catch (err) {
    console.error('[UserConfig] Failed to save custom buckets:', err)
  }
}

// --- Bucket Color System ---
const DEFAULT_BUCKET_COLORS = {
  'Work / Advisory': '#3B82F6',
  'Coaching': '#22C55E',
  'Home / Personal': '#A855F7',
  'Ventures': '#F97316',
}

const COLOR_ROTATION = ['#06B6D4', '#EAB308', '#EC4899', '#14B8A6', '#8B5CF6', '#F43F5E']

function loadBucketColors() {
  try {
    const stored = localStorage.getItem(BUCKET_COLORS_KEY)
    if (stored) return JSON.parse(stored)
  } catch (err) {
    console.error('[UserConfig] Failed to load bucket colors:', err)
  }
  return {}
}

function saveBucketColors(colors) {
  try {
    localStorage.setItem(BUCKET_COLORS_KEY, JSON.stringify(colors))
  } catch (err) {
    console.error('[UserConfig] Failed to save bucket colors:', err)
  }
}

const baseBuckets = [
  {
    name: 'Work / Advisory',
    context: 'client follow-ups, CE, applications, prospecting, Damien coordination',
  },
  {
    name: 'Coaching',
    context: '7v7 practice, playbook prep, game day, player communication',
  },
  {
    name: 'Home / Personal',
    context: 'Olivia, Noah, family logistics, personal appointments',
  },
  {
    name: 'Ventures',
    context: 'TrainingLogic, Senior Care, Marlin Directive, entrepreneurial work',
  },
]

const BASE_BUCKET_NAMES = baseBuckets.map((b) => b.name.toLowerCase())

const userConfig = {
  appName: 'MarlonOS',

  userName: 'Marlon',

  defaultBuckets: [...baseBuckets, ...loadCustomBuckets()],

  priorityRules: {
    critical:
      'ONLY when user explicitly says "high priority", "critical", "must do today", "urgent", or "ASAP"',
    high: 'when user says "important" or "need to do today"',
    normal:
      'default for everything else, including personal/family tasks like pickups, appointments, and errands',
    low: '"whenever", "eventually", "at some point"',
  },

  timeZone: 'America/Chicago',

  // --- Bucket Color API ---
  getBucketColor(bucketName) {
    // Default buckets have fixed colors
    if (DEFAULT_BUCKET_COLORS[bucketName]) return DEFAULT_BUCKET_COLORS[bucketName]
    // Check stored custom colors
    const stored = loadBucketColors()
    if (stored[bucketName]) return stored[bucketName]
    // Assign from rotation based on how many custom colors exist
    const usedCount = Object.keys(stored).length
    const color = COLOR_ROTATION[usedCount % COLOR_ROTATION.length]
    stored[bucketName] = color
    saveBucketColors(stored)
    return color
  },

  removeBucketColor(bucketName) {
    const stored = loadBucketColors()
    delete stored[bucketName]
    saveBucketColors(stored)
  },

  // --- Dynamic bucket management ---
  addCustomBucket(bucketName, context) {
    const customBuckets = loadCustomBuckets()
    if (
      this.defaultBuckets.some(
        (b) => b.name.toLowerCase() === bucketName.toLowerCase()
      )
    ) {
      return
    }
    const newBucket = { name: bucketName, context: context || '' }
    customBuckets.push(newBucket)
    saveCustomBuckets(customBuckets)
    this.defaultBuckets.push(newBucket)
    // Pre-assign a color
    this.getBucketColor(bucketName)
  },

  removeCustomBucket(bucketName) {
    // Prevent deleting default buckets
    if (BASE_BUCKET_NAMES.includes(bucketName.toLowerCase())) {
      return { success: false, reason: 'default' }
    }
    const customBuckets = loadCustomBuckets()
    const idx = customBuckets.findIndex(
      (b) => b.name.toLowerCase() === bucketName.toLowerCase()
    )
    if (idx === -1) {
      return { success: false, reason: 'not_found' }
    }
    const actualName = customBuckets[idx].name
    customBuckets.splice(idx, 1)
    saveCustomBuckets(customBuckets)
    // Remove from live config
    const liveIdx = this.defaultBuckets.findIndex(
      (b) => b.name.toLowerCase() === bucketName.toLowerCase()
    )
    if (liveIdx !== -1) this.defaultBuckets.splice(liveIdx, 1)
    // Clean up color
    this.removeBucketColor(actualName)
    return { success: true, deletedName: actualName }
  },

  isDefaultBucket(bucketName) {
    return BASE_BUCKET_NAMES.includes(bucketName.toLowerCase())
  },
}

export default userConfig
