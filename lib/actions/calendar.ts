import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import type { Answer } from '@/types/context';
import { sameCalendarEvent } from './calendar-identity';

/** Called only for an explicit user request after the server validates event identity and start. */
export async function createCalendarAction(action: NonNullable<Answer['action']>): Promise<string> {
  if (Platform.OS === 'web') return 'Calendar creation is available in the iOS or Android app.';
  const permission = await Calendar.requestCalendarPermissions(false);
  if (!permission.granted) return 'Calendar permission was denied. I did not add the event.';
  const selected = Platform.OS === 'ios' ? Calendar.getDefaultCalendarSync() : await (async () => {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    return calendars.find((item) => item.allowsModifications && item.isPrimary)
      ?? calendars.find((item) => item.allowsModifications);
  })();
  if (!selected) return 'I could not find a writable calendar on this device.';
  const startDate = new Date(action.start);
  if (!Number.isFinite(startDate.getTime())) return 'I could not validate the event start time. I did not add it.';
  const endDate = new Date(action.end);
  if (!Number.isFinite(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) return 'I could not validate the event end time. I did not add it.';
  const key = `${selected.id}:${action.title.normalize('NFKC').trim().toLowerCase()}:${startDate.toISOString()}`;
  if (pendingCalendarActions.has(key)) return 'I am already adding this event to Calendar. Please wait.';
  pendingCalendarActions.add(key);
  try {
    const nearby = await selected.listEvents(new Date(startDate.getTime() - 60_000), new Date(startDate.getTime() + 60_000));
    if (nearby.some((event) => sameCalendarEvent(event, action.title, startDate)))
      return `${action.title} is already in Calendar for that start time. I did not add a duplicate.`;
    await selected.createEvent({ title: action.title, startDate, endDate,
    ...(/^[A-Za-z_]+\/[A-Za-z_]+$|^UTC$/i.test(action.timeZone) ? { timeZone: action.timeZone } : {}),
    ...(action.location ? { location: action.location } : {}),
    ...(action.reminderMinutes ? { alarms: [{ relativeOffset: -action.reminderMinutes }] } : {}),
    ...(action.endIsPlaceholder ? { notes: 'End time is a one-hour placeholder from Context. Check the event source for the actual duration.' } : {}),
    });
    return `${action.title} was added to Calendar${action.endIsPlaceholder ? ' with a one-hour end-time placeholder' : ''}${action.reminderMinutes ? `, with a reminder ${action.reminderMinutes} minutes before` : ''}.`;
  } catch {
    return 'I could not check for an existing Calendar event or add it. I did not intentionally create a duplicate; please check Calendar before trying again.';
  } finally { pendingCalendarActions.delete(key); }
}

const pendingCalendarActions = new Set<string>();
