import 'server-only';
import type { MedplumClient } from '@medplum/core';
import type { AuditEvent, Practitioner, Reference } from '@medplum/fhirtypes';
import { log } from './log';

/** HIPAA AuditEvent.action codes (FHIR R4 audit-event-action value-set). */
export type AuditAction = 'C' | 'R' | 'U' | 'D' | 'E';

export interface AuditArgs {
  medplum: MedplumClient;
  agent: Practitioner;
  action: AuditAction;
  /** What the action was performed on. Free-form FHIR reference. */
  target: { reference: string };
  /** 0=success, 4=minor failure, 8=serious failure, 12=major failure. */
  outcome?: '0' | '4' | '8' | '12';
  /** Short event identifier — ties together related operations. */
  subtype?: string;
  /** IPv4/IPv6 of the originating request. Caller passes via headers. */
  sourceIp?: string;
}

/**
 * Append a HIPAA AuditEvent for a single user action. Designed to be called
 * fire-and-forget from Server Actions — failures are swallowed and logged
 * locally so a flaky audit write never blocks user-facing work, but the
 * incident is still observable in the application log.
 *
 * Why self-reported (user session writes its own audit row): keeps the
 * portal stateless w.r.t. service tokens, and combined with the AuditEvent
 * AccessPolicy entry that disables reads, users cannot tamper with the log
 * once it's written. An Admin role with read access is the audit-review path.
 */
export function auditLog(args: AuditArgs): void {
  void writeAuditEvent(args).catch((err) => {
    log.warn('audit_event_write_failed', {
      action: args.action,
      target: args.target.reference,
      error: String(err),
    });
  });
}

async function writeAuditEvent(args: AuditArgs): Promise<void> {
  const { medplum, agent, action, target, outcome = '0', subtype, sourceIp } = args;
  const agentRef: Reference<Practitioner> = { reference: `Practitioner/${agent.id}` };
  const event: AuditEvent = {
    resourceType: 'AuditEvent',
    type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110100', display: 'Application Activity' },
    ...(subtype
      ? { subtype: [{ system: 'http://vendo.local/audit-subtype', code: subtype }] }
      : {}),
    action,
    recorded: new Date().toISOString(),
    outcome,
    agent: [
      {
        who: agentRef,
        requestor: true,
        ...(sourceIp ? { network: { address: sourceIp, type: '2' as const } } : {}),
      },
    ],
    source: {
      observer: agentRef,
      site: 'vendo-portal',
    },
    entity: [{ what: target }],
  };
  await medplum.createResource(event);
}
