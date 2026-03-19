const CUSTOM_BUCKETS_KEY = 'marlonos_custom_buckets'

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

  // Dynamic bucket management
  addCustomBucket(bucketName, context) {
    const customBuckets = loadCustomBuckets()
    // Don't add duplicates
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
  },
}

export default userConfig
