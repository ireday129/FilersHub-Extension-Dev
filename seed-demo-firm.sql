-- =====================================================
-- SEED: Demo Firm for Extension Testing
-- Run this in the Supabase SQL Editor
-- =====================================================

-- 1. Create the firm
INSERT INTO firms (firm_id, firm_name, slug, subscription_tier, subscription_status, max_clients, max_staff)
VALUES (
  gen_random_uuid(),
  'FilersHub Demo',
  'filershub-demo',
  'pro',
  'active',
  500,
  10
);

-- 2. Create the staff record (Firm Owner)
INSERT INTO staff (firm_id, email, full_name, role, is_active)
SELECT firm_id, 'test@filershub.com', 'Daniel', 'Firm Owner', true
FROM firms
WHERE slug = 'filershub-demo';

-- =====================================================
-- NEXT STEP (manual):
--
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add User" > "Create New User"
-- 3. Email: test@filershub.com
-- 4. Password: (choose one for testing)
-- 5. Check "Auto Confirm User"
-- 6. Copy the new user's UUID and run:
--
--    UPDATE staff
--    SET auth_user_id = '<paste-uuid-here>'
--    WHERE email = 'test@filershub.com';
--
-- After that, Daniel can sign in with email/password.
-- =====================================================
