-- ============================================================
-- SLT Task Manager — Phase 2 / Phase 3 DB Migration
-- Run this ONCE on the production PostgreSQL server after
-- pulling the phase-2 branch code.
-- Safe to re-run: all statements use IF NOT EXISTS / DO blocks.
-- ============================================================

-- ── 1. subtask_proofs ────────────────────────────────────────
-- Proof files uploaded against individual subtasks (D1–D2)
CREATE TABLE IF NOT EXISTS public.subtask_proofs (
    id                  SERIAL PRIMARY KEY,
    subtask_id          INTEGER NOT NULL REFERENCES public.subtasks(id) ON DELETE CASCADE,
    task_id             INTEGER NOT NULL REFERENCES public.tasks(id)    ON DELETE CASCADE,
    file_name           VARCHAR(500) NOT NULL,
    file_path           TEXT NOT NULL,
    file_size           BIGINT,
    mime_type           VARCHAR(200),
    original_file_name  VARCHAR(500),
    storage_root        TEXT,
    uuid_prefix         VARCHAR(100),
    uploaded_by         INTEGER NOT NULL REFERENCES public.users(id),
    uploaded_at         TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subtask_proofs_subtask_id ON public.subtask_proofs(subtask_id);
CREATE INDEX IF NOT EXISTS idx_subtask_proofs_task_id    ON public.subtask_proofs(task_id);


-- ── 2. deleted_proofs  (File Vault — D10/D11/D12) ────────────
-- Soft-deleted proof files; restorable by Admin/Partner
CREATE TABLE IF NOT EXISTS public.deleted_proofs (
    id                      SERIAL PRIMARY KEY,
    original_proof_id       INTEGER,                 -- former task_proofs.id (may no longer exist)
    task_id                 INTEGER REFERENCES public.tasks(id) ON DELETE SET NULL,
    stage                   VARCHAR(100),
    file_name               VARCHAR(500),
    file_path               TEXT,
    file_size               BIGINT,
    mime_type               VARCHAR(200),
    original_file_name      VARCHAR(500),
    storage_root            TEXT,
    uuid_prefix             VARCHAR(100),
    uploaded_by             INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    uploaded_at             TIMESTAMP WITHOUT TIME ZONE,
    deleted_by              INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    delete_reason           TEXT,
    deleted_by_role         VARCHAR(100),
    task_status_at_deletion VARCHAR(100),
    client_name             VARCHAR(300),
    task_title              VARCHAR(500),
    deleted_at              TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deleted_proofs_task_id ON public.deleted_proofs(task_id);


-- ── 3. feature_suggestions ───────────────────────────────────
-- User-submitted bug reports / feature requests
CREATE TABLE IF NOT EXISTS public.feature_suggestions (
    id              SERIAL PRIMARY KEY,
    submitted_by    INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
    category        VARCHAR(100)  NOT NULL DEFAULT 'feature_request',
    title           VARCHAR(300)  NOT NULL,
    description     TEXT          NOT NULL,
    priority        VARCHAR(50)   NOT NULL DEFAULT 'normal',
    status          VARCHAR(50)   NOT NULL DEFAULT 'open',
    admin_note      TEXT,
    created_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_suggestions_status   ON public.feature_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_feature_suggestions_priority ON public.feature_suggestions(priority);


-- ── 4. task_proofs — add is_restored column (D12) ────────────
-- Marks files that were restored from File Vault back to a task
ALTER TABLE public.task_proofs
  ADD COLUMN IF NOT EXISTS is_restored BOOLEAN DEFAULT FALSE;


-- ── Done ─────────────────────────────────────────────────────
-- Verify with:
--   \dt public.*  (should include the 3 new tables above)
--   \d public.task_proofs  (should show is_restored column)
