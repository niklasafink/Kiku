const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(timestamp: number): string {
  return dateTime.format(timestamp);
}

const dateOnly = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export function formatDate(timestamp: number): string {
  return dateOnly.format(timestamp);
}

/** "heute", "morgen", "in 5 Tagen" for a number of whole days from now. */
export function inDays(days: number): string {
  if (days <= 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days} Tagen`;
}

export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
