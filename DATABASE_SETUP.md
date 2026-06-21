# Database Setup & Clean Reset

If you are seeing errors like "Database Schema Outdated" or "Unable to add employee", or if you want to start fresh, follow these steps.

## 1. Clean Reset (DANGER: Deletes ALL Data)

Run the following SQL in your **Supabase SQL Editor** to delete all existing tables and recreate them with the correct schema.

```sql
-- DANGER: This will delete ALL your data and reset the database schema!
-- Run this in your Supabase SQL Editor.

-- 1. Drop existing tables (using CASCADE to handle dependencies)
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.payroll CASCADE;
DROP TABLE IF EXISTS public.achievements CASCADE;
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.message_requests CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- 2. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. Create users table
CREATE TABLE public.users (
    uid TEXT PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee', -- 'admin', 'employee', 'ceo', 'founder'
    "facePhotoUrl" TEXT,
    "faceDescriptor" FLOAT8[],
    "specialCode" TEXT UNIQUE,
    status TEXT DEFAULT 'offline', -- 'active', 'away', 'break', 'offline'
    "lastActive" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "hourlyRate" NUMERIC DEFAULT 0,
    "payoutFrequency" TEXT DEFAULT 'monthly',
    position TEXT,
    "teamCode" TEXT,
    "standardWorkingHours" INTEGER DEFAULT 8,
    "sessionApprovalStatus" TEXT DEFAULT 'none', -- 'pending', 'approved', 'none'
    "cameraSnapshotUrl" TEXT,
    "screenSnapshotUrl" TEXT,
    "isCameraOn" BOOLEAN DEFAULT TRUE,
    "isMonitoringLive" BOOLEAN DEFAULT FALSE,
    "isApprovedForMessaging" BOOLEAN DEFAULT FALSE,
    achievements TEXT[] DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create teams table
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    memberIds TEXT[] DEFAULT '{}',
    uniqueCode TEXT UNIQUE NOT NULL,
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create sessions table
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    date TEXT NOT NULL,
    startTime TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    endTime TIMESTAMP WITH TIME ZONE,
    totalWorkMinutes INTEGER DEFAULT 0,
    totalBreakMinutes INTEGER DEFAULT 0,
    earnings NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active', -- 'active', 'completed', 'paid'
    paymentId UUID,
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create payments table
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    employeeName TEXT,
    amount NUMERIC NOT NULL DEFAULT 0,
    bonus NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'paid', 'archived'
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create alerts table
CREATE TABLE public.alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    employeeName TEXT NOT NULL,
    type TEXT NOT NULL, -- 'security', 'session_request', 'session_approval', etc.
    details TEXT,
    status TEXT DEFAULT 'new', -- 'new', 'read', 'approved', 'rejected'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    senderId TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    senderName TEXT NOT NULL,
    receiverIds TEXT[] NOT NULL DEFAULT '{}',
    teamId UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    attachmentUrl TEXT,
    attachmentType TEXT,
    attachmentName TEXT,
    category TEXT DEFAULT 'general',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    isRead BOOLEAN DEFAULT FALSE
);

-- 9. Create message_requests table
CREATE TABLE public.message_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    senderId TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    senderName TEXT NOT NULL,
    receiverId TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
    receiverName TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    assignees TEXT, -- Column renamed as per user requirement, was assignee_id
    assignee_name TEXT,
    due_date TEXT,
    status TEXT DEFAULT 'todo', -- 'todo', 'in_progress', 'completed', 'pending_approval', 'approved', 'rejected'
    created_by TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Create leave_requests table
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    userId TEXT,
    employeeName TEXT,
    employeeCode TEXT,
    startDate TEXT,
    endDate TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 13. Create Policies (Allow all for development)
CREATE POLICY "Allow all access to users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow all access to sessions" ON public.sessions FOR ALL USING (true);
CREATE POLICY "Allow all access to payments" ON public.payments FOR ALL USING (true);
CREATE POLICY "Allow all access to alerts" ON public.alerts FOR ALL USING (true);
CREATE POLICY "Allow all access to messages" ON public.messages FOR ALL USING (true);
CREATE POLICY "Allow all access to message_requests" ON public.message_requests FOR ALL USING (true);
CREATE POLICY "Allow all access to teams" ON public.teams FOR ALL USING (true);
CREATE POLICY "Allow all access to tasks" ON public.tasks FOR ALL USING (true);
CREATE POLICY "Allow all access to leave_requests" ON public.leave_requests FOR ALL USING (true);

-- 12. Enable Realtime
BEGIN;
  -- Remove existing publication if it exists
  DROP PUBLICATION IF EXISTS supabase_realtime;
  -- Create new publication
  CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
COMMIT;

-- 14. Reload schema cache
NOTIFY pgrst, 'reload';
```

## 2. Storage Buckets

Make sure you have the following storage buckets in Supabase and they are set to **Public**.

### `face-photos`
1. Go to **Storage** in Supabase.
2. Click **New Bucket**.
3. Name it `face-photos`.
4. Toggle **Public bucket** to ON.
5. Click **Save**.

This bucket is used for all media: face photos, chat uploads, and worker snapshots.
