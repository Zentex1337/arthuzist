-- Run this in Supabase SQL Editor to add the admin_permissions column
-- This column stores JSON permissions for admins

ALTER TABLE users
ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT NULL;

-- Example: Give adeeb69@aol.com all permissions (super admin has all by default anyway)
-- UPDATE users SET admin_permissions = '{"manage_orders": true, "manage_tickets": true, "manage_gallery": true, "manage_users": true, "view_logs": true}' WHERE email = 'adeeb69@aol.com';
