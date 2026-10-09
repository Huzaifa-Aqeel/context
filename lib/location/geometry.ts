/** GeoJSON uses longitude then latitude. No network or map UI is involved. */
export function withinGeojson(point: { latitude: number; longitude: number }, geometry: unknown): boolean | undefined {
  if (!geometry || typeof geometry !== 'object') return undefined;
  const value = geometry as { type?: unknown; coordinates?: unknown };
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.type === 'MultiPolygon' ? value.coordinates : undefined;
  if (!Array.isArray(polygons)) return undefined;
  const insideRing = (ring: unknown): boolean => {
    if (!Array.isArray(ring)) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if (!Array.isArray(a) || !Array.isArray(b) || typeof a[0] !== 'number' || typeof a[1] !== 'number'
        || typeof b[0] !== 'number' || typeof b[1] !== 'number') return false;
      if ((a[1] > point.latitude) !== (b[1] > point.latitude)
        && point.longitude < (b[0] - a[0]) * (point.latitude - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) continue;
    if (insideRing(polygon[0]) && !polygon.slice(1).some(insideRing)) return true;
  }
  return false;
}
