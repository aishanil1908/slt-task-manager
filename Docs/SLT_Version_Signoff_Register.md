# SLT Task Manager — Version Signoff Register
**Project:** Second Level Think — Unified Task Management Platform
**Organisation:** Second Level Thinking (Financial Services)
**Tech Stack:** Node.js/Express · PostgreSQL 18 · Vanilla JS/HTML
**Repository:** github.com/aishanil1908/slt-task-manager
**Server:** Proxmox CT 108, `/opt/slt-task-manager`, PM2 process: `slt-backend`

> This document is the SDLC/PDLC paper trail for the SLT platform.
> One entry per version/phase. Each entry is append-only — never edited after signoff.
> Maintained by: development team + project owner.

---

## How to Use This Register

| Status | Meaning |
|--------|---------|
| ✅ Signed Off | User confirmed all items work correctly in production |
| ⏳ Pending Approval | Built and deployed, awaiting user testing and confirmation |
| 🔴 Deferred | Planned but not built in this version — carried to next phase |
| ❌ Rejected | Decided against during this version |

---

---

# VERSION 1.0 — Phase 1: Core Build

| | |
|--|--|
| **Branch / Tag** | `main` (initial) |
| **Completed** | March 2026 (approx) |
| **Signed Off** | ✅ Yes — confirmed working, went to production |
| **DB State** | 14 tables, 4 views, 2 functions, 1 trigger |

## What Was Planned
Build a fully functional back-office task management system for a multi-vertical financial services firm. Replace manual WhatsApp/spreadsheet tracking with a structured, stage-gated workflow.

## What Was Built

| # | Feature | Status |
|---|---------|--------|
| 1 | 6-step task creation wizard (vertical → category → nature → client → details → assign) | ✅ |
| 2 | 5-stage lifecycle for Financial Transactions (pending→inprogress→confirm→postsales→done) | ✅ |
| 3 | 3-stage lifecycle for Non-Financial / CA / Broking tasks | ✅ |
| 4 | RBAC action buttons — managers vs staff see different controls | ✅ |
| 5 | MIS dashboard with 4-level drill-down (vertical → category → nature → tasks) | ✅ |
| 6 | User management (create, deactivate, role assignment) | ✅ |
| 7 | Renewal tracker — auto-created by DB trigger on insurance/FD post-sales entry | ✅ |
| 8 | Pilot Mode (username-only login, no password) for internal rollout | ✅ |
| 9 | Post-sales fulfillment forms — 11 product templates (MF, Insurance, FD, Bank, Tax, eGold, CA, Broking, PMS, AIF, Broking) | ✅ |
| 10 | Subtask system (basic) — subtasks as checklist items | ✅ |

## DB Objects Introduced
- Tables: `tasks`, `subtasks`, `task_proofs`, `task_stage_history`, `post_sales_fulfillment`, `renewal_tracker`, `notifications`, `users`, `verticals`, `categories`, `transaction_natures`, `user_sessions`, `user_vertical_access`, `system_config`
- Views: `v_tasks_full`, `v_dashboard_summary`, `v_renewals_due_30d`, `v_staff_performance`
- Functions: `update_task_stage()`, `create_renewal_tracker()`
- Trigger: `trg_create_renewal_tracker`

## What Was Deferred
- Password authentication (Pilot Mode active)
- File upload (proof tracking without files)
- Admin panel (user management via direct DB)

## Signoff
- **Signed off by:** Project Owner (Aisha)
- **Date:** March 2026
- **Notes:** System went live on Proxmox CT 108. Staff onboarded on pilot mode.

---

---

# VERSION 2.0 — Phase 2: Go-Live Hardening

| | |
|--|--|
| **Branch / Tag** | `main` |
| **Completed** | April 2026 |
| **Signed Off** | ✅ Yes — confirmed working, in active production use |
| **Git Commits** | `5ab4284`, `0218d11`, `7a83575` |
| **DB State** | 17 tables (added: `clients`, `job_profiles`, `user_reporting_map`) |

## What Was Planned
Harden the system for real production use — password auth, file uploads, a proper admin panel, and client master data.

## What Was Built

| # | Feature | Status |
|---|---------|--------|
| 1 | Password authentication — bcrypt, JWT 24h, PILOT_MODE=false | ✅ |
| 2 | File upload middleware — multi-storage support (local/network/NAS/cloud-reserved) | ✅ |
| 3 | System Admin panel (`slt-admin-panel.html`) — dark theme, always requires password | ✅ |
| 4 | Admin: User CRUD — create, edit, deactivate, reset password | ✅ |
| 5 | Admin: Job Profiles — reusable role templates assignable to users | ✅ |
| 6 | Admin: Reporting hierarchy — primary/secondary manager assignment | ✅ |
| 7 | Admin: Master data wizard — verticals → products → natures, is_system protection | ✅ |
| 8 | Client master table — `clients` table, deduplication, PAN storage | ✅ |
| 9 | Dynamic API URL — works on both laptop (dev) and server (prod) without code changes | ✅ |
| 10 | Test suite — Jest 86/86 passing, Playwright 32/37 (5 skipped, acceptable) | ✅ |

## DB Objects Introduced
- Tables: `clients`, `job_profiles`, `user_reporting_map`
- Columns added to `users`: `secondary_reports_to`, `allow_dual_reporting`, `job_profile_id`

## Migration Applied
No formal migration file — schema applied directly during deployment setup.

## What Was Deferred
- Subtask redesign (carried to Phase 3)
- File delete / File Vault (carried to Phase 3)
- MIS export PDF/Excel (carried to Phase 3)

## Signoff
- **Signed off by:** Project Owner (Aisha)
- **Date:** April 2026
- **Notes:** System fully live with real data. Pilot mode retired.

---

---

# VERSION 3.0 — Phase 3: Operational Features

| | |
|--|--|
| **Branch / Tag** | `phase-2` (git branch) |
| **Built** | 2026-06-03 |
| **Deployed to Server** | 2026-06-08 (DB migration applied manually via SSH) |
| **Signed Off** | ⏳ PENDING — built and deployed, awaiting user testing |
| **Git Commit** | `4f0393d` |
| **DB State** | 20 tables (added: `subtask_proofs`, `deleted_proofs`, `feature_suggestions`; column: `task_proofs.is_restored`) |

## What Was Planned

Redesign subtasks as real independent work units, add proper file management with a soft-delete vault, fix the manager instructions display bug, and add operational controls (transfer, suspend, cancel, suggestions).

## What Was Built

### A — Subtask System Redesign (D1–D5)

| # | Decision | What Was Built | Approval |
|---|----------|---------------|---------|
| D1 | Subtasks as independent work cards, not checkboxes | Work cards with title, instructions, assignee, due date, proof upload, Mark as Done button | ⏳ |
| D2 | Each subtask supports up to 3 proof files | `POST /api/tasks/:taskId/subtasks/:subtaskId/proof`, 3-file limit enforced backend + frontend. New table: `subtask_proofs` | ⏳ |
| D3 | When task has subtasks — main task has NO proof upload section | `renderDetail()` hides `proofSection` when `hasSubtasks=true` | ⏳ |
| D4 | When task has no subtasks — original proof upload unchanged | `renderDetail()` shows `proofSection` normally | ⏳ |
| D5 | Backend blocks stage advance until ALL subtasks are marked complete | `PUT /api/tasks/:id/stage` checks subtask completion count before `confirm`/`verify`, returns 400 with message | ⏳ |

### B — File Management & Soft Delete (D6–D12)

| # | Decision | What Was Built | Approval |
|---|----------|---------------|---------|
| D6 | Staff can delete own file before Submit — no reason needed | `DELETE /api/tasks/:id/proof/:proofId` — checks `uploaded_by = req.user.id` AND `task.status = inprogress` | ⏳ |
| D7 | After Submit, staff cannot delete | Same route — non-managers get 403 if task not inprogress | ⏳ |
| D8 | Manager can delete any file at any stage — reason required | Manager bypass in DELETE route, reason validated server-side, reason modal in frontend | ⏳ |
| D9 | Manager deleting from completed task reverts task to Stage 2 | DELETE route reverts status, wipes s3 fields, sends notification to staff | ⏳ |
| D10 | All deletes are soft — record moves to `deleted_proofs`, file stays on disk | INSERT to `deleted_proofs` then DELETE from `task_proofs`. New table: `deleted_proofs` | ⏳ |
| D11 | Admin panel: File Vault section — view all soft-deleted files, permanently delete | `GET /api/admin/deleted-files`, `DELETE /api/admin/deleted-files/:id`. Admin panel `sec-filevault` section | ⏳ |
| D12 | Admin/Partner can restore a file from vault back to the task | `POST /api/admin/deleted-files/:id/restore`. Restored files shown in separate "Restored Files" section in task detail. Column: `task_proofs.is_restored` | ⏳ |

### C — Bug Fix (D13)

| # | Decision | What Was Built | Approval |
|---|----------|---------------|---------|
| D13 | Manager instructions (task.description) was never shown to staff — fix it | Yellow instructions box added to task detail modal in `renderDetail()` | ⏳ |

### D — Task Management Controls

| # | Feature | What Was Built | Approval |
|---|---------|---------------|---------|
| 14 | Transfer task — managers can reassign to another staff member | Transfer button + API route | ⏳ |
| 15 | Suspend task — Admin/Partner can suspend directly | Suspend button + status `suspended` | ⏳ |
| 16 | Staff suspension request — staff can flag a task for suspension | 🚩 Request Suspension button | ⏳ |
| 17 | Cancel task — Admin/Partner only, hidden from staff | Cancel button + status `cancelled` | ⏳ |
| 18 | Accept & Start Task for staff — was incorrectly gated to managers | Fixed gating, staff assignee sees 🚀 Accept & Start button on pending tasks | ⏳ |

### E — Suggestions System

| # | Feature | What Was Built | Approval |
|---|---------|---------------|---------|
| 19 | Floating 💡 button — any logged-in user can submit a suggestion | Frontend modal, `POST /api/suggestions`, notifies all admins | ⏳ |
| 20 | Admin panel: Suggestions view — list, filter, update status, add admin note | `GET /api/suggestions`, `PUT /api/suggestions/:id`. Admin panel section | ⏳ |

### F — Minor Fixes

| # | Feature | What Was Built | Approval |
|---|---------|---------------|---------|
| 21 | SIP Registration: all 31 dates available | Was only 8 selective dates. Fixed to full 1–31 dropdown | ⏳ |
| 22 | Admin panel: password required on new user creation | Added password field to new user form | ⏳ |
| 23 | Admin panel: username auto-preview as you type full name | JS live-preview in user creation form | ⏳ |

## DB Objects Introduced

| Object | Type | Purpose |
|--------|------|---------|
| `subtask_proofs` | Table | Proof files per subtask |
| `deleted_proofs` | Table | Soft-deleted proof files (File Vault) |
| `feature_suggestions` | Table | User-submitted suggestions |
| `task_proofs.is_restored` | Column (bool) | Marks restored vault files |

## Migration Applied
- **File:** `db_migrations/phase2_phase3_migration.sql`
- **Applied:** 2026-06-08 manually via SSH (`psql -U slt_user -d slt_taskmanager`)
- **Applied by:** Project Owner (Aisha) with AI assistance

## Deployment Notes
- Server tracking branch changed from `main` to `phase-2` in `/opt/slt-task-manager/auto_update.sh`
- `main` branch preserved as stable rollback point
- Phase-2 branch pushed to GitHub: 2026-06-08
- Auto-update cron: `*/5 * * * *` — pulls `phase-2`, runs `npm install`, restarts PM2
- Server DNS issue noted (github.com unreachable intermittently from CT 108) — needs investigation

## What Was Deferred to Phase 4

| # | Feature | Reason |
|---|---------|--------|
| 1 | MIS Export PDF/Excel | Not yet started — highest priority for Phase 4 |
| 2 | Change Password UI | Not yet started |
| 3 | Performance Analytics (Chart.js) | v_staff_performance view exists, UI not built |
| 4 | Settings Page (system_config UI) | Not yet started |
| 5 | Full RBAC UI Gating | Not yet started |
| 6 | Proxmox Production VM Setup | Currently on LXC container |
| 7 | Roles as DB Table | user_role still an enum |

## Pending Actions Before Signoff

- [ ] User to test all 23 items in the table above and confirm each works
- [ ] Investigate server DNS issue — `ping github.com` failing intermittently from CT 108
- [ ] Run `bash /opt/slt-task-manager/auto_update.sh` after DNS is confirmed working to verify auto-deploy works end-to-end
- [ ] Once all items confirmed — update `design_subtask_file_management.md`: mark D1–D13 as ✅
- [ ] Update `project_phases_roadmap.md`: change all ✳️ to ✅ for Phase 3

## Signoff
- **Signed off by:** _(pending)_
- **Date:** _(pending)_
- **Notes:** _(pending)_

---

*Next version entry will be added below when Phase 4 begins.*
