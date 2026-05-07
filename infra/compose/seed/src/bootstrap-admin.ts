import { MedplumClient } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { signInPassword } from './medplum-auth.js';

const BASE_URL = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@vendo.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!1234';
const PROJECT_NAME = process.env.PROJECT_NAME ?? 'Vendo Clinic (Dev)';

export interface BootstrapResult {
  projectId: string;
  adminEmail: string;
  medplum: MedplumClient;
}

async function tryFindExistingProject(medplum: MedplumClient): Promise<Project | undefined> {
  try {
    await signInPassword(medplum, ADMIN_EMAIL, ADMIN_PASSWORD);
    const projects = await medplum.searchResources('Project', `name=${encodeURIComponent(PROJECT_NAME)}`);
    return projects[0] as Project | undefined;
  } catch {
    return undefined;
  }
}

export async function bootstrapAdminAndProject(): Promise<BootstrapResult> {
  const medplum = new MedplumClient({ baseUrl: BASE_URL, fetch });

  const existing = await tryFindExistingProject(medplum);
  if (existing?.id) {
    console.warn(`Admin and project already exist: ${ADMIN_EMAIL} / ${PROJECT_NAME}`);
    return { projectId: existing.id, adminEmail: ADMIN_EMAIL, medplum };
  }

  // Two-step registration: create user, then attach a new project to that login.
  // dev-bypass is acceptable here: this seed runs only against the local
  // Compose stack where Medplum is configured to accept it. Production
  // bootstrapping is a different ops workflow (terraform-managed Secrets +
  // out-of-band admin invite), not this script.
  const userResp = await medplum.startNewUser({
    firstName: 'Vendo',
    lastName: 'Admin',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    recaptchaToken: 'dev-bypass',
  });

  const projectResp = await medplum.startNewProject({
    login: userResp.login,
    projectName: PROJECT_NAME,
  });

  if (projectResp.code) {
    await medplum.processCode(projectResp.code);
  }

  const projects = await medplum.searchResources('Project', `name=${encodeURIComponent(PROJECT_NAME)}`);
  const project = projects[0] as Project | undefined;
  if (!project?.id) throw new Error('Project created but search returned no result');

  console.warn(`Created admin + project: ${ADMIN_EMAIL} / ${PROJECT_NAME}`);
  return { projectId: project.id, adminEmail: ADMIN_EMAIL, medplum };
}
