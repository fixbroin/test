import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Timestamp } from 'firebase/firestore'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely converts various timestamp formats to milliseconds.
 * Handles Firestore Timestamp, serialized plain objects, ISO strings, and Date objects.
 */
export function getTimestampMillis(ts: any): number {
  if (!ts) return 0;
  
  // Real Firestore Timestamp
  if (typeof ts.toMillis === 'function') {
    return ts.toMillis();
  }
  
  // Plain object from JSON/Cache (Firestore-like)
  if (typeof ts === 'object') {
    if (ts.seconds !== undefined) {
      return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000;
    }
    // Admin SDK format (_seconds)
    if (ts._seconds !== undefined) {
      return ts._seconds * 1000 + (ts._nanoseconds || 0) / 1000000;
    }
    // Date object
    if (ts instanceof Date) {
      return ts.getTime();
    }
  }
  
  // ISO String or other date string
  if (typeof ts === 'string') {
    const date = new Date(ts);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  
  // Already a number
  if (typeof ts === 'number') {
    return ts;
  }
  
  return 0;
}

/**
 * Returns a Date object shifted to represent the target timezone's local time.
 * Useful for "now" calculations on servers with different default timezones.
 */
export function getZonedDate(date?: Date | string | number, timeZone: string = 'Asia/Kolkata'): Date {
  const d = date ? new Date(date) : new Date();
  const zonedString = d.toLocaleString('en-US', { timeZone }); //
  return new Date(zonedString);
}

/**
 * Formats a Date to an ISO string (YYYY-MM-DD) in the target timezone.
 * Prevents "yesterday" issues when formatting dates in UTC.
 */
export function formatZonedDateToISO(date?: Date | string | number, timeZone: string = 'Asia/Kolkata'): string {
  const d = date ? new Date(date) : new Date();
  // Using Intl.DateTimeFormat with en-CA gives YYYY-MM-DD format
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Converts a "wall clock" date (created by getZonedDate) back to a real UTC Date object.
 * This is necessary before calling .toISOString() or sending the date to the client.
 */
export function convertWallClockToUTC(wallClockDate: Date, timeZone: string = 'Asia/Kolkata'): Date {
  // Use a temporary date to find the offset difference between server local and target timezone
  const testDate = new Date(wallClockDate.getTime());
  const zonedString = testDate.toLocaleString('en-US', { timeZone });
  const zonedDate = new Date(zonedString);
  const offset = zonedDate.getTime() - testDate.getTime();
  return new Date(testDate.getTime() - offset);
}

/**
 * Formats a date string or object for display, respecting the target timezone.
 */
export function formatDateInTimezone(date: Date | string | number | undefined, timeZone: string = 'Asia/Kolkata', options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('en-IN', { ...options, timeZone }).format(d);
}

/**
 * Formats a time string or object for display, respecting the target timezone.
 */
export function formatTimeInTimezone(date: Date | string | number | undefined, timeZone: string = 'Asia/Kolkata', options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return new Intl.DateTimeFormat('en-IN', { ...options, timeZone }).format(d);
}
