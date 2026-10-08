import { privateJson } from '@/lib/api/server';
import { analysisLabels, providerReadiness } from '@/lib/server/config';

export function GET() {
  const providers = providerReadiness();
  return privateJson({ status: 'ok', analysisConfigured: providers.vision && providers.llm && providers.qloo, providers, analysisProviders: analysisLabels() });
}
