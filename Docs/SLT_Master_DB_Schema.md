# SLT Task Manager — Master Database Schema
**DB:** `slt_taskmanager` (PostgreSQL)
**Last updated:** 2026-06-08
**Version:** Phase 2 / Phase 3 (branch: `phase-2`)

---

## Table of Contents
1. [Enums](#enums)
2. [Core Tables](#core-tables)
3. [Task Workflow Tables](#task-workflow-tables)
4. [File Management Tables](#file-management-tables)
5. [User & Access Tables](#user--access-tables)
6. [Reference / Lookup Tables](#reference--lookup-tables)
7. [Tracker & Notification Tables](#tracker--notification-tables)
8. [System Tables](#system-tables)
9. [Views](#views)
10. [Functions & Triggers](#functions--triggers)
11. [Migration History](#migration-history)

---

## Enums

| Enum | Values |
|------|--------|
| `task_status` | `pending`, `inprogress`, `postsales`, `done` |
| `task_priority` | `Normal`, `High`, `Urgent` |
| `tx_type` | `Financial Transaction`, `Non-Financial`, `CA Work`, `Broking Work` |
| `ps_template_type` | `mf_purchase`, `mf_redemption`, `pms`, `aif`, `insurance`, `fd`, `bank`, `tax`, `egold`, `ca_work`, `broking`, `none` |
| `sip_frequency` | `monthly`, `weekly` |
| `proof_requirement` | `Yes — Mandatory`, `Yes — Optional`, `No` |
| `user_role` | `Admin / Partner`, `Operations Manager`, `Relationship Manager`, `Back Office Operator`, `KYC Executive`, `CA / Tax Specialist`, `System Admin` |
| `notification_type` | `task_assigned`, `task_confirmed`, `task_sent_back`, `task_completed`, `nudge`, `renewal_reminder`, `maturity_reminder`, `overdue_alert` |

---

## Core Tables

### `tasks`
The central table. Every unit of work in the system is a task.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `vertical_id` | int FK→verticals | Which business vertical |
| `category_id` | int FK→categories | Product/service category |
| `nature_id` | int FK→transaction_natures | Specific nature of work |
| `tx_type` | enum | Financial / Non-Financial / CA Work / Broking Work |
| `sip_frequency` | enum | `monthly` or `weekly` (SIP tasks only) |
| `sip_date` | int | Day of month for SIP |
| `sip_day` | varchar(10) | Day of week for weekly SIP |
| `ps_template` | enum | Post-sales form template to use |
| `client_name` | varchar(200) NOT NULL | |
| `client_father` | varchar(200) | Father/spouse name |
| `client_mobile` | varchar(15) NOT NULL | |
| `client_email` | varchar(200) | |
| `client_id` | int FK→clients | Link to client master (NULL for old tasks) |
| `title` | varchar(500) NOT NULL | |
| `description` | text | Manager instructions visible to staff |
| `priority` | enum | Default: `Normal` |
| `proof_required` | enum | Default: `Yes — Mandatory` |
| `due_date` | date NOT NULL | |
| `status` | enum | Default: `pending` |
| `stage` | int (1–5) | Workflow stage; constraint: 1≤stage≤5 |
| `proof_uploaded` | bool | Stage 2 proof flag |
| `s4_doc_uploaded` | bool | Stage 4 post-sales doc flag |
| `s3_confirmed_by` | int FK→users | Manager who confirmed at Stage 3 |
| `s3_confirmed_at` | timestamp | |
| `s3_note` | text | Manager note at Stage 3 |
| `assigned_to` | int FK→users NOT NULL | Staff handling this task |
| `created_by` | int FK→users NOT NULL | |
| `created_at` | timestamp | Default: now |
| `updated_at` | timestamp | Default: now |
| `completed_at` | timestamp | Set when status→done |

**Task lifecycle (stages):**
```
Stage 1: pending     → assigned, not started
Stage 2: inprogress  → staff working, uploads proof here
Stage 3: (confirm)   → manager reviews, confirms or sends back
Stage 4: postsales   → financial tasks only, post-sales fulfillment
Stage 5: done        → completed
```

---

### `subtasks`
Independent work units under a task. All subtasks must be completed before the task can advance past Stage 2.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `task_id` | int FK→tasks CASCADE | |
| `title` | varchar(500) NOT NULL | |
| `instructions` | text | |
| `assigned_to` | int FK→users | Can differ from parent task assignee |
| `due_date` | date | |
| `display_order` | int | Default: 0 |
| `is_completed` | bool | Default: false |
| `completed_at` | timestamp | |
| `completed_by` | int FK→users | |
| `created_at` | timestamp | |

---

## Task Workflow Tables

### `task_stage_history`
Audit trail of every stage/status transition on every task.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `task_id` | int FK→tasks CASCADE | |
| `from_status` | enum task_status | |
| `to_status` | enum task_status NOT NULL | |
| `from_stage` | int | |
| `to_stage` | int | |
| `action` | varchar(100) | e.g. `start`, `confirm`, `send_back`, `verify`, `reopen` |
| `action_by` | int FK→users NOT NULL | |
| `note` | text | |
| `created_at` | timestamp | |

### `post_sales_fulfillment`
One record per task at Stage 4. Holds product-specific fulfillment data. Template used depends on `tasks.ps_template`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `task_id` | int FK→tasks CASCADE UNIQUE | One-to-one with task |
| `ps_template` | enum NOT NULL | Which form fields apply |
| `folio_number` | varchar(50) | MF |
| `units` | numeric(15,6) | MF |
| `nav_rate` | numeric(12,4) | MF |
| `allotment_date` | date | MF |
| `tx_reference` | varchar(100) | MF/general |
| `amount_credited` | numeric(15,2) | MF redemption |
| `client_account_no` | varchar(100) | MF/PMS/AIF |
| `demat_account_no` | varchar(100) | PMS/AIF/Broking |
| `portal_login_id` | varchar(200) | PMS/AIF |
| `temp_password` | varchar(200) | PMS/AIF |
| `contribution_amount` | numeric(15,2) | PMS/AIF |
| `policy_number` | varchar(100) | Insurance |
| `policy_issued_date` | date | Insurance |
| `coverage_from` | date | Insurance |
| `coverage_to` | date | Insurance |
| `next_premium_due` | date | Insurance — triggers renewal_tracker |
| `annual_premium` | numeric(12,2) | Insurance |
| `fd_account_no` | varchar(100) | FD |
| `fd_receipt_no` | varchar(100) | FD |
| `fd_maturity_date` | date | FD — triggers renewal_tracker |
| `interest_rate` | numeric(5,2) | FD |
| `maturity_amount` | numeric(15,2) | FD |
| `bank_account_no` | varchar(100) | Bank |
| `account_type` | varchar(50) | Bank |
| `ifsc_code` | varchar(20) | Bank |
| `net_banking_login` | varchar(200) | Bank |
| `itr_ack_no` | varchar(50) | Tax |
| `filing_date` | date | Tax |
| `financial_year` | varchar(20) | Tax |
| `itr_form` | varchar(20) | Tax |
| `total_income` | numeric(15,2) | Tax |
| `eg_order_ref` | varchar(100) | eGold |
| `eg_quantity_grams` | numeric(12,4) | eGold |
| `eg_rate_per_gram` | numeric(12,2) | eGold |
| `eg_metal_type` | varchar(20) | eGold |
| `ca_filing_ref` | varchar(100) | CA Work |
| `ca_completion_date` | date | CA Work |
| `ca_period` | varchar(100) | CA Work |
| `broker_client_id` | varchar(100) | Broking |
| `broker_demat_no` | varchar(100) | Broking |
| `credentials_shared` | bool | Default: false |
| `submitted_by` | int FK→users | |
| `submitted_at` | timestamp | |
| `verified_by` | int FK→users | |
| `verified_at` | timestamp | |

---

## File Management Tables

### `task_proofs`
Proof files uploaded by staff for the main task (Stage 2 or Stage 4). Only relevant when task has no subtasks.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `task_id` | int FK→tasks CASCADE | |
| `stage` | int | Constraint: must be 2 or 4 |
| `file_name` | varchar(300) NOT NULL | UUID-prefixed storage name |
| `file_path` | varchar(500) NOT NULL | Path relative to storage_root |
| `file_size` | int | Bytes |
| `mime_type` | varchar(100) | |
| `original_file_name` | varchar(255) | Original name from user's device |
| `storage_root` | varchar(500) | Absolute base path on server |
| `uuid_prefix` | varchar(36) | UUID used to prefix filename |
| `uploaded_by` | int FK→users NOT NULL | |
| `uploaded_at` | timestamp | |

### `subtask_proofs`
Proof files uploaded against individual subtasks. Max 3 files per subtask enforced at app layer. *(Added: Phase 3)*

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `subtask_id` | int FK→subtasks CASCADE | |
| `task_id` | int FK→tasks CASCADE | Denormalized for easy querying |
| `file_name` | varchar(500) NOT NULL | |
| `file_path` | text NOT NULL | |
| `file_size` | bigint | |
| `mime_type` | varchar(200) | |
| `original_file_name` | varchar(500) | |
| `storage_root` | text | |
| `uuid_prefix` | varchar(100) | |
| `uploaded_by` | int FK→users NOT NULL | |
| `uploaded_at` | timestamp | Default: now |

### `deleted_proofs` — File Vault
Soft-deleted proof files (from `task_proofs`). Files stay on disk; only the DB record moves here. Admin/Partner can restore or permanently delete. *(Added: Phase 3)*

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `original_proof_id` | int | Former `task_proofs.id` |
| `task_id` | int FK→tasks SET NULL | |
| `stage` | varchar(100) | |
| `file_name` | varchar(500) | |
| `file_path` | text | |
| `file_size` | bigint | |
| `mime_type` | varchar(200) | |
| `original_file_name` | varchar(500) | |
| `storage_root` | text | |
| `uuid_prefix` | varchar(100) | |
| `uploaded_by` | int FK→users SET NULL | Original uploader |
| `uploaded_at` | timestamp | Original upload time |
| `deleted_by` | int FK→users SET NULL | Who deleted it |
| `delete_reason` | text | Required for managers |
| `deleted_by_role` | varchar(100) | Role snapshot at time of deletion |
| `task_status_at_deletion` | varchar(100) | Task status snapshot |
| `client_name` | varchar(300) | Denormalized for vault display |
| `task_title` | varchar(500) | Denormalized for vault display |
| `deleted_at` | timestamp | Default: now |

---

## User & Access Tables

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `username` | varchar(50) UNIQUE NOT NULL | |
| `full_name` | varchar(150) NOT NULL | |
| `email` | varchar(200) UNIQUE NOT NULL | |
| `mobile` | varchar(15) | |
| `password_hash` | varchar(255) | bcrypt |
| `role` | enum user_role NOT NULL | |
| `reports_to` | int FK→users SET NULL | Primary manager (legacy field) |
| `secondary_reports_to` | int FK→users | Secondary manager (legacy field) |
| `allow_dual_reporting` | bool | Default: false |
| `job_profile_id` | int FK→job_profiles | |
| `tasks_active` | int | Denormalized counter |
| `tasks_completed` | int | Denormalized counter |
| `efficiency_pct` | numeric(5,2) | Denormalized |
| `is_active` | bool | Default: true |
| `last_login` | timestamp | |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### `user_reporting_map`
Formal manager-staff reporting relationships. Replaces the legacy `reports_to` columns on users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `user_id` | int FK→users CASCADE | Staff |
| `manager_id` | int FK→users CASCADE | Manager |
| `priority` | varchar(10) | `primary` or `secondary` |
| `assigned_by` | int FK→users | |
| `assigned_at` | timestamp | |
| `is_active` | bool | Default: true |
| UNIQUE | (user_id, manager_id) | |

### `user_vertical_access`
Which verticals a user can see/work in.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `user_id` | int FK→users CASCADE | |
| `vertical_id` | int FK→verticals CASCADE | |
| UNIQUE | (user_id, vertical_id) | |

### `user_sessions`
JWT session tracking for logout/invalidation.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `user_id` | int FK→users CASCADE | |
| `token_hash` | varchar(500) NOT NULL | |
| `expires_at` | timestamp NOT NULL | |
| `created_at` | timestamp | |
| `ip_address` | varchar(50) | |

### `job_profiles`
Reusable job role templates assignable to users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `title` | varchar(100) UNIQUE NOT NULL | |
| `description` | text | |
| `is_active` | bool | |
| `created_by` | int FK→users | |
| `created_at` / `updated_at` | timestamp | |

---

## Reference / Lookup Tables

### `verticals`
Top-level business verticals (e.g. Wealth Management, Insurance, CA).

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `code` | varchar(10) UNIQUE NOT NULL | Short code |
| `name` | varchar(100) NOT NULL | |
| `icon` | varchar(10) | Emoji icon |
| `display_order` | int | |
| `is_active` | bool | |
| `is_system` | bool | System-seeded, cannot delete |
| `created_at` | timestamp | |

### `categories`
Product/service categories within a vertical (e.g. Mutual Funds, Insurance).

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `vertical_id` | int FK→verticals CASCADE | |
| `code` | varchar(20) UNIQUE NOT NULL | |
| `name` | varchar(100) NOT NULL | |
| `icon` | varchar(10) | |
| `requires_postsales` | bool | Default: false |
| `default_ps_template` | enum | Default post-sales template |
| `display_order` | int | |
| `is_active` | bool | |
| `is_system` | bool | |
| `created_at` | timestamp | |

### `transaction_natures`
Specific types of work within a category (e.g. SIP Purchase, Lump Sum, Redemption).

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `category_id` | int FK→categories CASCADE | |
| `code` | varchar(50) NOT NULL | |
| `name` | varchar(200) NOT NULL | |
| `description` | varchar(300) | |
| `icon` | varchar(10) | |
| `ps_template_override` | enum | Overrides category default |
| `is_sip` | bool | Default: false |
| `display_order` | int | |
| `is_active` | bool | |
| `ft_allowed` | bool | Can be Financial Transaction |
| `nft_allowed` | bool | Can be Non-Financial |
| `is_system` | bool | |

### `clients`
Client master — single source of truth for client identities.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `client_name` | varchar(150) NOT NULL | |
| `father_spouse_name` | varchar(150) | |
| `mobile` | varchar(15) | |
| `email` | varchar(100) | |
| `pan_number` | varchar(10) | Uppercase, validated at app layer |
| `address` | text | |
| `source` | varchar(50) | Default: `slt_taskmanager` |
| `created_by` | int FK→users SET NULL | |
| `is_active` | bool | |
| `created_at` / `updated_at` | timestamptz | |

---

## Tracker & Notification Tables

### `renewal_tracker`
Auto-created by trigger when insurance/FD post-sales fulfillment is submitted. Used for renewal reminders.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `task_id` | int FK→tasks CASCADE | |
| `tracker_type` | varchar(20) | `insurance_renewal` or `fd_maturity` |
| `client_name/mobile/email` | varchar | Denormalized |
| `product_name` | varchar(100) | |
| `policy_or_fd_no` | varchar(100) | |
| `renewal_due_date` | date NOT NULL | |
| `coverage_to` | date | Insurance only |
| `reminder_30d_sent` | bool | |
| `reminder_7d_sent` | bool | |
| `reminder_1d_sent` | bool | |
| `followup_task_id` | int FK→tasks | Task created for renewal follow-up |
| `is_actioned` | bool | Default: false |
| `created_at` | timestamp | |

### `notifications`
In-app notifications for all users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `recipient_id` | int FK→users CASCADE | |
| `type` | enum notification_type | |
| `title` | varchar(300) NOT NULL | |
| `message` | text | |
| `task_id` | int FK→tasks SET NULL | |
| `is_read` | bool | Default: false |
| `read_at` | timestamp | |
| `created_at` | timestamp | |

### `feature_suggestions`
User-submitted bug reports and feature requests. *(Added: Phase 3)*

| Column | Type | Notes |
|--------|------|-------|
| `id` | serial PK | |
| `submitted_by` | int FK→users SET NULL | |
| `category` | varchar(100) | `bug_report`, `feature_request`, `ui_improvement`, `other` |
| `title` | varchar(300) NOT NULL | |
| `description` | text NOT NULL | |
| `priority` | varchar(50) | `normal`, `important`, `critical` |
| `status` | varchar(50) | `open`, `under_review`, `planned`, `done`, `rejected` |
| `admin_note` | text | Admin response |
| `created_at` / `updated_at` | timestamp | |

---

## System Tables

### `system_config`
Key-value store for runtime configuration flags.

| Column | Type | Notes |
|--------|------|-------|
| `key` | varchar(100) PK | |
| `value` | text NOT NULL | |
| `description` | varchar(500) | |
| `updated_by` | int FK→users | |
| `updated_at` | timestamp | |

---

## Views

| View | Purpose |
|------|---------|
| `v_tasks_full` | Tasks joined with vertical, category, nature, assigned user, created-by user, stage-3 confirmer |
| `v_dashboard_summary` | Aggregate counts: pending, inprogress, postsales, done, overdue, created today |
| `v_renewals_due_30d` | Renewal tracker entries due within 30 days, not yet actioned |
| `v_staff_performance` | Per-user task counts by status |
| `v_user_reporting` | Users with their primary/secondary managers and job profile resolved |

---

## Functions & Triggers

### `update_task_stage(task_id, action, actor_id, note)`
Stored procedure that handles all task stage transitions atomically and writes to `task_stage_history`.

| Action | Transition |
|--------|-----------|
| `start` | pending → inprogress (stage 1→2) |
| `confirm` | inprogress → postsales or done (stage 2→4 or 2→5) |
| `verify` | postsales → done (stage 4→5) |
| `send_back` | any → inprogress (stage →2), clears s3 confirmation |
| `reopen` | done → inprogress (stage 5→2) |

### `create_renewal_tracker()` (trigger)
Fires AFTER INSERT OR UPDATE on `post_sales_fulfillment`. Auto-creates entries in `renewal_tracker` for insurance (on `next_premium_due`) and FD (on `fd_maturity_date`).

---

## Migration History

| Migration File | Date Applied | What Changed |
|----------------|-------------|--------------|
| *(initial schema)* | Pre-2026-06-03 | All tables up to Phase 2 |
| `phase2_phase3_migration.sql` | 2026-06-08 | Added: `subtask_proofs`, `deleted_proofs`, `feature_suggestions` |
