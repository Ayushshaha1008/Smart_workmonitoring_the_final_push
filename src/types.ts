export type UserRole = 'admin' | 'employee' | 'ceo' | 'founder';
export type UserStatus = 'active' | 'away' | 'break' | 'offline';

export interface UserProfile {
  uid: string;
  id?: string; // Fallback for user's schema
  email: string;
  displayName: string;
  name?: string; // Fallback for user's schema
  role: UserRole;
  status: UserStatus;
  hourlyRate: number;
  lastActive: string;
  faceDescriptor?: number[];
  specialCode: string;
  unique_code?: string; // Fallback for user's schema
  facePhotoUrl?: string;
  face_photo_url?: string; // Fallback for user's schema
  screenSnapshotUrl?: string;
  cameraSnapshotUrl?: string;
  payoutFrequency: 'daily' | 'weekly' | 'monthly';
  department?: string;
  team_id?: string;
  isApprovedForMessaging?: boolean;
  isMonitoringLive?: boolean;
  isCameraOn?: boolean;
  achievements?: string[];
  standardWorkingHours?: number;
  monitorCount?: number;
}

export interface Team {
  id: string;
  name: string;
  memberIds: string[];
  member_ids?: string[]; // Fallback for user's schema
  uniqueCode: string;
  unique_code?: string; // Fallback
  team_code?: string; // Fallback for user's schema
  createdAt: string;
}

export interface MessageRequest {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

export interface Message {
  id?: string;
  senderId: string;
  senderName: string;
  receiverIds: string[]; // Support multiple receivers
  teamId?: string; // Support team messages
  content: string;
  timestamp: string;
  isRead: boolean;
  attachmentUrl?: string;
  attachmentType?: string;
  attachmentName?: string;
}

export interface WorkSession {
  id?: string;
  userId: string;
  startTime: string;
  endTime?: string;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  status: 'active' | 'paused' | 'completed' | 'paid' | 'break' | 'away';
  date: string;
  paymentId?: string;
}

export interface PaymentRecord {
  id?: string;
  userId: string;
  amount: number;
  bonus?: number;
  status: 'pending' | 'approved' | 'paid' | 'archived';
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  employeeName?: string;
}
