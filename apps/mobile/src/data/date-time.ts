export function localDateKey(value: string | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatSourceTime(
  value: string | null,
  timeZone: string,
  timeOnly = false,
): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unbekannt';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    day: timeOnly ? undefined : '2-digit',
    month: timeOnly ? undefined : '2-digit',
    year: timeOnly ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
