export type MaintenanceWarning =
  | { level: 'overdue'; title: string }
  | { level: 'soon'; title: string; daysUntil: number }
  | { level: 'none' }

export function getMaintenanceWarning(
  schedules: Array<{
    title: string
    scheduledDate: string
    status: string
  }>
): MaintenanceWarning {
  if (!schedules || schedules.length === 0) {
    return { level: 'none' }
  }

  // Check overdue first — most urgent
  const overdue = schedules.find(s => s.status === 'overdue')
  if (overdue) {
    return { level: 'overdue', title: overdue.title }
  }

  // Check pending within 30 days
  const today = new Date()
  for (const s of schedules) {
    if (s.status !== 'pending') continue
    const due = new Date(s.scheduledDate)
    const daysUntil = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysUntil <= 30) {
      return { level: 'soon', title: s.title, daysUntil }
    }
  }

  return { level: 'none' }
}