-- ============================================================
-- Permissions Upgrade Migration
-- Adds: per-user permission overrides, missing permissions,
--       scope permissions, and a permissions version stamp.
--
-- SAFE TO RE-RUN. Does not delete any existing data.
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Per-user permission overrides
--    effect = 'allow' -> grant this permission to the user
--    effect = 'deny'  -> revoke it even if their role grants it
--    deny always wins over allow.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    effect VARCHAR(10) NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, permission_id)
);

COMMENT ON TABLE user_permissions IS 'Per-user permission overrides on top of role permissions. deny wins.';

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission ON user_permissions(permission_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_permissions' AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access" ON user_permissions
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ------------------------------------------------------------
-- 2) Permissions version stamp
--    Bumped whenever a user's effective permissions change so the
--    browser can detect it and re-apply immediately.
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_updated_at TIMESTAMPTZ DEFAULT NOW();

-- ------------------------------------------------------------
-- 3) Missing permissions referenced by the UI but never created
--    plus the two data-scope permissions that replace the
--    hardcoded admin/manager/employee scoping.
-- ------------------------------------------------------------
INSERT INTO permissions (name, category, description) VALUES
    ('view_reports',          'reports',     'View reports'),
    ('export_reports',        'reports',     'Export reports (CSV/PDF/Excel)'),
    ('view_archives',         'archives',    'View archived tasks and issues'),
    ('view_roles',            'roles',       'View roles and the permission matrix'),
    ('manage_settings',       'settings',    'Manage system settings and branding'),
    ('delete_tasks',          'tasks',       'Delete tasks'),
    ('delete_technical_issues','technical_issues','Delete technical issues'),
    ('view_all_data',         'scope',       'See data across every department'),
    ('view_department_data',  'scope',       'See data for the whole department, not just own records')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 4) OPTIONAL — DISABLED BY DEFAULT
--
--    This block would top up the built-in roles. It is commented
--    out on purpose: the application already falls back to the
--    original role behaviour (admin = all data, manager =
--    department data) without needing these rows, so your existing
--    role/permission matrix is left EXACTLY as you configured it.
--
--    Only uncomment if you want the built-in roles topped up.
-- ------------------------------------------------------------

-- -- admin -> every permission
-- INSERT INTO role_permissions (role_id, permission_id)
-- SELECT r.id, p.id
-- FROM roles r CROSS JOIN permissions p
-- WHERE lower(r.name) = 'admin'
-- ON CONFLICT (role_id, permission_id) DO NOTHING;

-- -- manager -> department scope + report permissions
-- INSERT INTO role_permissions (role_id, permission_id)
-- SELECT r.id, p.id
-- FROM roles r CROSS JOIN permissions p
-- WHERE lower(r.name) = 'manager'
--   AND p.name IN ('view_department_data', 'view_reports', 'export_reports')
-- ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ------------------------------------------------------------
-- 5) Stamp every user so the first login after the migration
--    picks up a fresh permissions version.
-- ------------------------------------------------------------
UPDATE users SET permissions_updated_at = NOW();
