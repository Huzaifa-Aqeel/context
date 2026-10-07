import { privateJson } from '@/lib/api/server';
import { providerReadiness } from '@/lib/server/config';

export function GET() {
  const providers = providerReadiness();
  return privateJson({ status: 'ok', analysisConfigured: providers.groq && providers.qloo, providers });
}
