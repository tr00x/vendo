import { MedplumClient } from '@medplum/core';

function requiredBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_MEDPLUM_BASE_URL is required');
  return url;
}

let browserClient: MedplumClient | undefined;

export function getBrowserMedplumClient(): MedplumClient {
  if (!browserClient) browserClient = new MedplumClient({ baseUrl: requiredBaseUrl() });
  return browserClient;
}

export function getServerMedplumClient(accessToken?: string): MedplumClient {
  // Server-side: per-request client (do NOT memoize across requests).
  const client = new MedplumClient({ baseUrl: requiredBaseUrl(), fetch });
  if (accessToken) client.setAccessToken(accessToken);
  return client;
}
