import type { ResolvedEntity } from '@/types/context';

const carrierNames: Record<string, string> = {
  poster: 'poster', clothing: 'clothing item', brand_mark: 'brand mark', book_cover: 'book', artwork: 'artwork',
  product: 'product', logo: 'logo', venue_sign: 'sign', album_cover: 'album cover', film_reference: 'film reference', other: 'reference',
};

/** Speak the observed reference before any cultural enrichment. */
export function visualLead(entity: ResolvedEntity) {
  const description = entity.visualDescription?.trim();
  const carrier = entity.carrier ? carrierNames[entity.carrier] : undefined;
  const object = description || (carrier ? `${entity.detectedName} ${carrier}` : entity.detectedName);
  const named = entity.relatedName && ['book_cover', 'album_cover', 'artwork'].includes(entity.carrier ?? '') && !object.toLocaleLowerCase().includes(entity.relatedName.toLocaleLowerCase())
    ? `${object} by ${entity.relatedName}` : object;
  const phrase = named.replace(/[.!?]+$/, '');
  const prefixed = /^(?:a|an|the|this|that)\s/i.test(phrase) ? phrase : entity.visualDescription ? `a ${phrase}` : phrase;
  return `I can see ${prefixed}.`;
}

export function visualName(entity: ResolvedEntity) {
  return entity.groundingBasis === 'related' ? entity.detectedName : entity.qlooName ?? entity.detectedName;
}

export function questionNamesEntity(entity: ResolvedEntity, question: string) {
  const normalized = question.toLocaleLowerCase();
  return [entity.detectedName, entity.qlooName].some((name) => Boolean(name && normalized.includes(name.toLocaleLowerCase())));
}
