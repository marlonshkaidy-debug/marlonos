const userConfig = {
  appName: 'MarlonOS',

  userName: 'Marlon',

  defaultBuckets: [
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
  ],

  priorityRules: {
    critical:
      'ONLY when user explicitly says "high priority", "critical", "must do today", "urgent", or "ASAP"',
    high: 'when user says "important" or "need to do today"',
    normal:
      'default for everything else, including personal/family tasks like pickups, appointments, and errands',
    low: '"whenever", "eventually", "at some point"',
  },

  timeZone: 'America/Chicago',
}

export default userConfig
