import 'server-only';
import type { MedplumClient } from '@medplum/core';
import type { Bundle, Resource, ResourceType } from '@medplum/fhirtypes';

type ExtractByType<T extends ResourceType> = Extract<Resource, { resourceType: T }>;

/**
 * Domain error: caller observed a target resource in a state that makes the
 * write impossible (e.g. Slot already busy). Caught by `withTransactionConcurrency`
 * and re-thrown without retry — the situation will not improve by waiting.
 */
export class PreconditionUnmetError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'PreconditionUnmetError';
  }
}

/**
 * Optimistic-concurrency wrapper around medplum.updateResource.
 *
 * Reads a fresh copy of the resource, lets a mutator produce the updated
 * version, then PUTs it with `If-Match: W/"<versionId>"`. If the server
 * rejects with HTTP 409 Conflict or 412 Precondition Failed, we re-read
 * and retry up to `maxAttempts` times.
 *
 * Why: every cross-portal write — adding a note, toggling a flag, attaching
 * a PACS link, scheduling, completing, closing — does
 * `read → spread(...sr, mutation) → update`. Two concurrent requests can
 * both read the same versionId and the second PUT silently overwrites
 * (lost-update). With If-Match, the second PUT is rejected and we replay
 * its mutation against fresh state.
 *
 * The mutator MUST be a pure function over the resource — it will be
 * re-invoked on every retry against the latest server copy.
 */
export async function withConcurrency<T extends ResourceType>(
  medplum: MedplumClient,
  resourceType: T,
  id: string,
  mutator: (current: ExtractByType<T>) => ExtractByType<T>,
  options: { maxAttempts?: number } = {},
): Promise<ExtractByType<T>> {
  // 10 retries gives headroom for ~10 concurrent writers on the same
  // resource (rare in this app — at most doctor + clinic + a triage flag
  // together). At >10 the situation is pathological and we'd rather
  // surface an error than spin forever.
  const maxAttempts = options.maxAttempts ?? 10;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const current = (await medplum.readResource(resourceType, id)) as ExtractByType<T>;
    const versionId = current.meta?.versionId;
    const next = mutator(current);
    try {
      const updated = await medplum.updateResource(next as Resource, {
        headers: versionId ? { 'If-Match': `W/"${versionId}"` } : {},
      });
      return updated as ExtractByType<T>;
    } catch (err) {
      const status = extractStatus(err);
      if (status === 409 || status === 412) {
        lastError = err;
        // Exponential-ish backoff with jitter to keep concurrent retries
        // from lockstepping.
        const delay = Math.min(50 * attempt, 800) + Math.floor(Math.random() * 100);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `withConcurrency exhausted ${maxAttempts} attempts on ${resourceType}/${id}: ${String(lastError)}`,
  );
}

function extractStatus(err: unknown): number | undefined {
  const e = err as { status?: number; outcome?: { issue?: Array<{ code?: string }> } };
  if (typeof e?.status === 'number') return e.status;
  // Medplum can throw OperationOutcome — map "conflict" to 409.
  const code = e?.outcome?.issue?.[0]?.code;
  if (code === 'conflict') return 409;
  return undefined;
}

/**
 * Optimistic-concurrency wrapper around a FHIR transaction Bundle.
 *
 * Why: scheduleAppointment and rescheduleAppointment must atomically
 * (a) flip a Slot from `free` to `busy`, (b) create/move an Appointment,
 * (c) append a note to the ServiceRequest. Two concurrent clinic-staff
 * actions racing for the same slot would both see `status=free` at read time
 * and both PUT — last-write-wins, so the first patient is silently overbooked.
 *
 * Fix: the build callback re-reads every input resource each attempt and
 * embeds `ifMatch: W/"<versionId>"` on every PUT entry of the Bundle. The
 * server enforces ifMatch — the second writer's transaction fails atomically
 * with HTTP 412 (no partial writes — Bundle is transactional), and we retry
 * by re-reading. The mutator naturally observes the updated state on retry
 * and short-circuits with `PreconditionUnmetError("slot-taken")` if the slot
 * is no longer free.
 *
 * Build callback contract:
 *   - Re-reads resources with `medplum.readResource` (NOT cached).
 *   - Throws `PreconditionUnmetError` when domain precondition no longer holds.
 *   - Returns a Bundle whose every PUT entry carries `request.ifMatch`.
 */
export async function withTransactionConcurrency(
  medplum: MedplumClient,
  build: () => Promise<Bundle>,
  options: { maxAttempts?: number } = {},
): Promise<Bundle> {
  const maxAttempts = options.maxAttempts ?? 10;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const bundle = await build();
    try {
      return await medplum.executeBatch(bundle);
    } catch (err) {
      const status = extractStatus(err);
      if (status === 409 || status === 412) {
        lastError = err;
        const delay = Math.min(50 * attempt, 800) + Math.floor(Math.random() * 100);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `withTransactionConcurrency exhausted ${maxAttempts} attempts: ${String(lastError)}`,
  );
}

/** Build a partial object containing `ifMatch` only when a versionId is
 *  available — designed for spreading into a `BundleEntryRequest` so that
 *  `exactOptionalPropertyTypes` stays satisfied. */
export function ifMatchProp(versionId: string | undefined): { ifMatch?: string } {
  return versionId ? { ifMatch: `W/"${versionId}"` } : {};
}
