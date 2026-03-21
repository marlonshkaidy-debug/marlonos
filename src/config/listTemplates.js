export const LIST_TEMPLATES = {
  packing: {
    triggers: ['packing', 'pack', 'travel', 'trip', 'suitcase', 'luggage'],
    label: 'Always Pack',
    items: [
      'Phone charger',
      'Laptop & charger',
      'Toiletries bag',
      'Toothbrush & toothpaste',
      'Deodorant',
      'Medications',
      'Wallet & ID',
      'AirPods / headphones',
      'Sunglasses',
      'Umbrella / rain jacket'
    ]
  },
  sports: {
    triggers: ['sports', 'game', 'practice', 'gear', 'equipment', 'coaching', 'football', 'soccer', 'baseball', 'basketball'],
    label: 'Always Bring',
    items: [
      'Cleats / sport shoes',
      'Water bottle',
      'Uniform / jersey',
      'Mouth guard',
      'Gloves',
      'Helmet',
      'Playbook / notes',
      'First aid kit',
      'Whistle',
      'Equipment bag'
    ]
  },
  camping: {
    triggers: ['camping', 'camp', 'hiking', 'hike', 'outdoors', 'backpacking'],
    label: 'Always Pack',
    items: [
      'Tent & stakes',
      'Sleeping bag',
      'Flashlight & batteries',
      'First aid kit',
      'Bug spray',
      'Sunscreen',
      'Water bottles',
      'Fire starter',
      'Pocket knife',
      'Rain gear'
    ]
  },
  cleaning: {
    triggers: ['cleaning', 'clean', 'chores', 'housework'],
    label: 'Standard Checklist',
    items: [
      'Vacuum all floors',
      'Mop hard floors',
      'Clean bathrooms',
      'Wipe down surfaces',
      'Take out trash',
      'Clean kitchen',
      'Do laundry',
      'Change bed sheets',
      'Clean windows / mirrors',
      'Organize clutter'
    ]
  }
}

export function findTemplate(listName) {
  if (!listName) return null
  const lower = listName.toLowerCase()
  for (const [, template] of Object.entries(LIST_TEMPLATES)) {
    if (template.triggers.some(t => lower.includes(t))) {
      return template
    }
  }
  return null
}
