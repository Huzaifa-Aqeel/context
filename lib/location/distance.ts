export function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const arc = 2 * Math.asin(Math.sqrt(Math.sin(lat / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2));
  return 6371000 * arc;
}

export function straightLineKilometers(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  return Math.round(metersBetween(a, b) / 100) / 10;
}

export function spokenDistance(meters: number, locale = 'en-US'): string {
  if (!Number.isFinite(meters) || meters < 0) return 'an unknown distance';
  if (locale.toLowerCase().startsWith('en-us')) {
    const feet = meters * 3.28084;
    return feet < 1000 ? `about ${Math.max(50, Math.round(feet / 50) * 50)} feet away`
      : `about ${(meters / 1609.344).toFixed(1)} miles away`;
  }
  return meters < 1000 ? `about ${Math.max(50, Math.round(meters / 50) * 50)} metres away`
    : `about ${(meters / 1000).toFixed(1)} kilometres away`;
}
