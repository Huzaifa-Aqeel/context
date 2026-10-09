const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const monthNumber = (name: string) => months[name.toLowerCase()] ?? Object.entries(months).find(([full]) => full.startsWith(name.toLowerCase()))?.[1];
const zoneAliases: Record<string, string> = { ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
  CT: 'America/Chicago', CST: 'America/Chicago', CDT: 'America/Chicago',
  MT: 'America/Denver', MST: 'America/Denver', MDT: 'America/Denver',
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles' };

function dateParts(text: string) {
  let match = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  let year: number, month: number, day: number;
  if (match) [, year, month, day] = match.map(Number) as [number, number, number, number];
  else {
    match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
    if (match) { month = monthNumber(match[1])!; day = Number(match[2]); year = Number(match[3]); }
    else {
      match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,]?\s+(20\d{2})\b/i);
      if (!match) return undefined;
      day = Number(match[1]); month = monthNumber(match[2])!; year = Number(match[3]);
    }
  }
  const validated = new Date(Date.UTC(year, month - 1, day));
  if (validated.getUTCFullYear() !== year || validated.getUTCMonth() + 1 !== month || validated.getUTCDate() !== day) return undefined;
  return { year, month, day };
}

function timeParts(text: string) {
  const twelve = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (twelve) {
    const hour = Number(twelve[1]); const minute = Number(twelve[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return undefined;
    return { hour: hour % 12 + (twelve[3].toLowerCase().startsWith('p') ? 12 : 0), minute };
  }
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return twentyFour ? { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) } : undefined;
}

function zoneOffsetMinutes(zone: string, year: number, month: number, day: number, hour: number, minute: number) {
  const explicit = zone.match(/^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (/^(UTC|GMT|Z)$/i.test(zone)) return 0;
  if (explicit) {
    const hours = Number(explicit[2]); const minutes = Number(explicit[3] ?? 0);
    return hours <= 14 && minutes < 60 ? (explicit[1] === '+' ? 1 : -1) * (hours * 60 + minutes) : undefined;
  }
  const iana = zoneAliases[zone.toUpperCase()] ?? zone;
  try {
    const local = Date.UTC(year, month - 1, day, hour, minute);
    let estimate = local;
    const format = new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    for (let pass = 0; pass < 2; pass++) {
      const parts = Object.fromEntries(format.formatToParts(new Date(estimate)).map((part) => [part.type, Number(part.value)]));
      const rendered = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      estimate += local - rendered;
    }
    const verified = format.formatToParts(new Date(estimate));
    const parts = Object.fromEntries(verified.map((part) => [part.type, Number(part.value)]));
    if (parts.year !== year || parts.month !== month || parts.day !== day || parts.hour !== hour || parts.minute !== minute) return undefined;
    return Math.round((local - estimate) / 60000);
  } catch { return undefined; }
}

/** A date, start time and explicit timezone are all required; never infer them from device locality. */
export function parseEventStart(dateText?: string, timeText?: string, timezoneText?: string) {
  if (!dateText || !timeText || !timezoneText) return undefined;
  const date = dateParts(dateText); const time = timeParts(timeText);
  if (!date || !time) return undefined;
  const zone = timezoneText.trim();
  const offset = zoneOffsetMinutes(zone, date.year, date.month, date.day, time.hour, time.minute);
  if (offset === undefined) return undefined;
  const sign = offset < 0 ? '-' : '+'; const absolute = Math.abs(offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  const start = `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(time.hour)}:${pad(time.minute)}:00${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return { start, timeZone: zoneAliases[zone.toUpperCase()] ?? zone };
}

export function parseIsoEventStart(text: string) {
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})T([0-2]\d:[0-5]\d)(?::[0-5]\d)?(Z|[+-]\d{2}:\d{2})\b/);
  if (!match) return undefined;
  const offset = match[3] === 'Z' ? '+00:00' : match[3];
  return parseEventStart(match[1], match[2], `UTC${offset}`);
}

export function explicitEventZone(text: string) {
  const spoken = text.match(/\b(Eastern|Central|Mountain|Pacific)\s+(?:Standard\s+|Daylight\s+)?Time\b/i)?.[1]?.toLowerCase();
  if (spoken) return ({ eastern: 'ET', central: 'CT', mountain: 'MT', pacific: 'PT' } as Record<string, string>)[spoken];
  return text.match(/\b(?:UTC|GMT)\s*[+-]\d{1,2}(?::?\d{2})?\b|\b(?:UTC|GMT|ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT)\b|\b(?:America|Europe|Asia|Australia)\/[A-Za-z_]+\b/i)?.[0];
}
