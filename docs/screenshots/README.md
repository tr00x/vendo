# Screenshots

The README references six PNG captures of the running portal, taken in
**light mode** at **1440×900**. All patient names, DOBs, phone numbers,
member IDs, and clinical notes visible in these captures are
LLM-generated synthetic demo data from `infra/compose/seed/src/realistic-seed.ts`
— no real PHI in any image.

To regenerate from a clean stack:

```bash
# 1. Bring up Medplum + portal as described in the root README.
#    Run the realistic seed so the dashboard isn't empty.
cd infra/compose && docker compose up -d --wait
cd seed && pnpm seed && pnpm exec tsx src/realistic-seed.ts
cd ../../../apps/portal && pnpm dev
```

Then snap PNGs and save with these filenames:

| Filename | Page | Login as |
|---|---|---|
| `01-signin.png` | `/login` (password + magic-link tabs visible) | logged-out |
| `02-dashboard.png` | `/dashboard` (some referrals visible) | `s.smith@familypractice.example` |
| `03-wizard.png` | `/refer` step 3 (Study) | `s.smith@familypractice.example` |
| `04-referral-detail.png` | `/refer/<id>` of any active referral | `s.smith@familypractice.example` |
| `05-clinic-inbox.png` | `/clinic/inbox` | `staff@vendoclinic.local` |
| `06-account.png` | `/account` | `s.smith@familypractice.example` |

Demo passwords are in `apps/portal/src/app/dev-login/client.tsx`.

Avoid macOS / Chrome chrome (window controls, address bar) — the showcase
looks cleaner without them. `cmd-shift-4` then space-click → click on the
viewport works on macOS, or use a headless capture:

```bash
pnpm -C apps/portal exec playwright screenshot http://localhost:3000/login \
  --viewport-size=1440,900 docs/screenshots/01-signin.png
```
