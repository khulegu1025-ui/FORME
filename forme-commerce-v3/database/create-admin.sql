-- First create an Auth user in Supabase Authentication > Users.
-- Example email: owner@admin.example.com. Choose your own strong password.
-- The user must be confirmed. No password is stored in this SQL or frontend.
-- With adminEmailDomain='admin.example.com' in config.js, login username is owner.
-- Change the email and username below to match the account you created.

INSERT INTO public.admin_users(user_id,username)
SELECT id,'owner' FROM auth.users WHERE lower(email)='khuleg8899@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Verify one row appears. Zero rows means the Auth email does not match.
SELECT username,user_id FROM public.admin_users;
