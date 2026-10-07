import { privateJson } from '@/lib/api/server';

export function GET() { return privateJson({ status: 'ok', stage: 'scaffold', analysisAvailable: false }); }
