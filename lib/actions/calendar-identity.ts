export function sameCalendarEvent(candidate: { title: string; startDate: Date | string }, title: string, start: Date) {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const time = new Date(candidate.startDate).getTime();
  return normalize(candidate.title) === normalize(title) && Number.isFinite(time) && Math.abs(time - start.getTime()) <= 60_000;
}
