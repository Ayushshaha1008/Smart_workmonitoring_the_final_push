# 🛠️ One-Click Database Fix

If you are running this locally and see errors like `column "displayName" does not exist` or `status 406`, copy and paste the entire script below into your **Supabase SQL Editor** and run it.

```sql
/**
 * ONE-CLICK FIX FOR WORKWATCH AI
 * This script ensures the table and all columns exist with correct case-sensitivity.
 */

-- 1. CREATE THE TABLE IF IT DOESN'T EXIST
CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    email TEXT,
    "displayName" TEXT,
    "specialCode" TEXT UNIQUE,
    role TEXT DEFAULT 'employee',
    status TEXT DEFAULT 'offline',
    "hourlyRate" NUMERIC DEFAULT 0,
    "standardWorkingHours" NUMERIC DEFAULT 8,
    "sessionApprovalStatus" TEXT DEFAULT 'none',
    "cameraSnapshotUrl" TEXT,
    "screenSnapshotUrl" TEXT,
    "isMonitoringLive" BOOLEAN DEFAULT false,
    "isCameraOn" BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ADD INDIVIDUAL COLUMNS (In case table existed but was missing them)
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "specialCode" TEXT;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "hourlyRate" NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "standardWorkingHours" NUMERIC DEFAULT 8;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "sessionApprovalStatus" TEXT DEFAULT 'none';
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "cameraSnapshotUrl" TEXT;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "screenSnapshotUrl" TEXT;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "isMonitoringLive" BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "isCameraOn" BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'employee';
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'offline';

-- 2.1 ADD CATEGORY TO MESSAGES
ALTER TABLE IF EXISTS public.messages ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'general';

-- 2.2 CREATE MISSING TABLES
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    assignees TEXT,
    assignee_name TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'todo',
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId TEXT,
    employeeName TEXT,
    employeeCode TEXT,
    startDate TEXT,
    endDate TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ENSURE UNIQUE CONSTRAINT ON specialCode
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_specialcode_key') THEN
        ALTER TABLE public.users ADD CONSTRAINT users_specialcode_key UNIQUE ("specialCode");
    END IF;
END $$;

-- 4. RELOAD SCHEMA CACHE (EXTREMELY IMPORTANT)
-- This tells Supabase to recognize the new columns immediately.
NOTIFY pgrst, 'reload';

-- 5. CREATE THE INITIAL ADMIN ACCOUNT
-- Login with:
-- Name: Admin
-- Code: 123456
INSERT INTO public.users (uid, "displayName", email, role, "specialCode", status, "hourlyRate")
VALUES ('admin-init-999', 'Admin', 'admin@local.test', 'admin', '123456', 'active', 1000)
ON CONFLICT (uid) DO UPDATE SET 
    "specialCode" = '123456', 
    role = 'admin', 
    "displayName" = 'Admin';

-- 6. STORAGE BUCKET SETUP
-- Ensure the "face-photos" bucket exists and is public.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('face-photos', 'face-photos', true)
ON CONFLICT (id) DO NOTHING;
```

### **Why was it failing?**
1.  **Case Sensitivity:** PostgreSQL treats `displayName` as `displayname` (lowercase) unless it's wrapped in double quotes. My React code expects the exact `displayName` name.
2.  **Schema Cache:** Your local Supabase instance needs a "reload" notification to see new columns immediately.
3.  **Missing table:** If you didn't create the `users` table first, the ALTER commands would fail.

### **How to Login Now:**
1. Run the SQL above in Supabase.
2. Hard-refresh your browser.
3. Click **Admin Login**.
4. Enter **Admin** as Full Name and **123456** as Special Code.
