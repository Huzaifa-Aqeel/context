import { localitySchema } from '@/schemas/context';

export function deriveLocality(address: {
  district?: string | null; city?: string | null; region?: string | null; country?: string | null;
}) {
  return localitySchema.parse({
    neighborhood: address.district || undefined, city: address.city || undefined,
    region: address.region || undefined, country: address.country || undefined,
  });
}
