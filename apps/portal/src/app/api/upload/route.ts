import { NextResponse } from 'next/server';
import { getSession, isExpired } from '@/lib/auth/session';
import { getServerMedplumClient } from '@/lib/medplum';
import { auditLog } from '@/lib/audit';
import { log } from '@/lib/log';
import type { Practitioner } from '@medplum/fhirtypes';
import { ALLOWED_MIME, MAX_BYTES, magicMatches, sanitizeFilename } from './validation';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session.accessToken || isExpired(session) || !session.profileId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const medplum = getServerMedplumClient(session.accessToken);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported type' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 });
  }
  const safeName = sanitizeFilename(file.name, file.type);
  if (!safeName) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (!magicMatches(bytes, file.type)) {
      log.warn('upload_magic_mismatch', { mime: file.type, size: file.size });
      return NextResponse.json(
        { error: 'File contents do not match the declared type' },
        { status: 415 },
      );
    }
    const binary = await medplum.createBinary({
      data: bytes,
      contentType: file.type,
      filename: safeName,
    });
    const url = binary.url ?? `${process.env.NEXT_PUBLIC_MEDPLUM_BASE_URL}fhir/R4/Binary/${binary.id}`;
    log.info('upload_ok', { id: binary.id, mime: file.type, size: file.size });
    if (binary.id) {
      const agent: Practitioner = { resourceType: 'Practitioner', id: session.profileId };
      auditLog({
        medplum,
        agent,
        action: 'C',
        subtype: 'upload',
        target: { reference: `Binary/${binary.id}` },
        outcome: '0',
      });
    }
    return NextResponse.json({ url, contentType: file.type, filename: safeName });
  } catch (err) {
    log.error('upload_failed', { error: String(err) });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
