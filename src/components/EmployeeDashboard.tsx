import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { createTonePlayer, getInitials, getAvatarColor, shouldGroupWithPrevious } from '../lib/utils';
import { UserProfile, WorkSession, PaymentRecord, UserStatus, MessageRequest } from '../types';
import { FaceTracker } from './FaceTracker';
import { format, differenceInMinutes, isValid, subHours, subDays, isToday, isYesterday } from 'date-fns';
import { jsPDF } from 'jspdf';
import { 
  Play, 
  Pause, 
  LogOut, 
  DollarSign, 
  Clock, 
  Activity, 
  Eraser,
  Download,
  AlertCircle,
  TrendingUp,
  Monitor,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ArrowRight,
  MousePointer,
  MessageSquare,
  Search,
  ExternalLink,
  Users,
  Paperclip,
  Phone,
  PhoneOff,
  Video,
  File,
  XCircle,
  Mic,
  MicOff,
  VideoOff,
  Maximize2,
  Minimize2,
  Camera,
  CameraOff,
  X,
  Shield,
  ShieldAlert,
  Plus,
  Bell,
  BellOff,
  CheckCircle,
  Mail,
  Check,
  CheckCheck,
  Loader2,
  ShieldCheck,
  Menu,
  User,
  ClipboardList
} from 'lucide-react';

export const parseReceiverIds = (val: any): string[] => {
  if (Array.isArray(val)) return val;
  if (!val) return [];
  if (typeof val === 'string') {
    if (val.startsWith('{') && val.endsWith('}')) {
      return val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      try { return JSON.parse(val); } catch (e) { return []; }
    }
    return val.split(',').map(s => s.trim());
  }
  return [];
};

export const normalizeMessage = (m: any) => ({
  ...m,
  id: m.id || m.message_id || m.messageid,
  senderId: m.senderId || m.sender_id || m.senderid,
  senderName: m.senderName || m.sender_name || m.sendername,
  receiverIds: parseReceiverIds(m.receiverIds || m.receiver_ids || m.receiverids),
  teamId: m.teamId || m.team_id || m.teamid,
  content: m.content || '',
  attachmentUrl: m.attachmentUrl || m.attachment_url || m.attachmenturl,
  attachmentType: m.attachmentType || m.attachment_type || m.attachmenttype,
  attachmentName: m.attachmentName || m.attachment_name || m.attachmentname,
  timestamp: m.timestamp || m.created_at || m.createdat || new Date().toISOString(),
  isRead: m.isRead || m.is_read || m.isread || false
});

export const EmployeeDashboard: React.FC<{ user: UserProfile; onLogout: () => void }> = ({ user, onLogout }) => {
  const [session, setSession] = useState<WorkSession | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [isOnLeave, setIsOnLeave] = useState(false);

  useEffect(() => {
    const fetchLeaves = async () => {
      const { data } = await supabase.from('leave_requests').select('*').eq('userId', user.uid);
      if (data) {
        setLeaveRequests(data.map((l: any) => ({
          ...l,
          leaveType: l.leave_type || l.leaveType || 'unpaid',
          isPaid: l.isPaid !== undefined ? l.isPaid : (l.leave_type === 'paid')
        })));
        
        const today = new Date().toISOString().split('T')[0];
        const currentLeave = data.find(l => 
          l.status === 'approved' && 
          today >= l.startDate && 
          today <= l.endDate
        );
        setIsOnLeave(!!currentLeave);
      }
    };
    fetchLeaves();
  }, [user.uid]);
  const sessionRef = useRef<WorkSession | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const statusRef = useRef<UserStatus>(user.status);
  const [elapsedTime, setElapsedTime] = useState(0);
  const elapsedTimeRef = useRef(0);
  const [breakElapsedTime, setBreakElapsedTime] = useState(0);
  const breakElapsedTimeRef = useRef(0);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { elapsedTimeRef.current = elapsedTime; }, [elapsedTime]);
  useEffect(() => { breakElapsedTimeRef.current = breakElapsedTime; }, [breakElapsedTime]);
  
  // Heartbeat to save progress every 60 seconds
  useEffect(() => {
    if (status === 'active' || status === 'away' || status === 'break') {
      const interval = setInterval(async () => {
        if (sessionRef.current?.id) {
          const workMinutes = Math.floor(elapsedTimeRef.current / 60);
          const breakMinutes = Math.floor(breakElapsedTimeRef.current / 60);
          
          const payload = {
            totalWorkMinutes: workMinutes,
            totalBreakMinutes: breakMinutes,
            lastHeartbeat: new Date().toISOString()
          };
          
          const snakePayload = {
            total_work_minutes: workMinutes,
            total_break_minutes: breakMinutes,
            last_heartbeat: new Date().toISOString()
          };
          
          try {
            const { error } = await supabase.from('work_sessions').update(payload).eq('id', sessionRef.current.id);
            if (error && (error.message.includes('column') || error.message.includes('not exist'))) {
              await supabase.from('work_sessions').update(snakePayload).eq('id', sessionRef.current.id);
            }
          } catch (e) {}
        }
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [status]);
  const [todayTotalWorkSeconds, setTodayTotalWorkSeconds] = useState(0);
  const [todayTotalBreakSeconds, setTodayTotalBreakSeconds] = useState(0);

  const [baseCompletedWorkMinutes, setBaseCompletedWorkMinutes] = useState(0);
  const [baseCompletedBreakMinutes, setBaseCompletedBreakMinutes] = useState(0);

  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);
  // Camera should only be on when active session exists and status is not a privacy-required one
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [isMonitoringLive, setIsMonitoringLive] = useState(user.isMonitoringLive || false);
  const [lastMouseMove, setLastMouseMove] = useState(Date.now());
  const [isScreenShareSupported, setIsScreenShareSupported] = useState(true);
  const [isFaceMatched, setIsFaceMatched] = useState(true);
  const isFaceMatchedRef = useRef(true);
  useEffect(() => { isFaceMatchedRef.current = isFaceMatched; }, [isFaceMatched]);
  const [faceDetected, setFaceDetected] = useState(true);
  const faceDetectedRef = useRef(true);
  useEffect(() => { faceDetectedRef.current = faceDetected; }, [faceDetected]);
  const [isVerifyingNow, setIsVerifyingNow] = useState(false);
  const [isVerified, setIsVerified] = useState(() => {
    if (!user.faceDescriptor) return true;
    try {
      const d = new Date();
      const workDay = format(d, 'yyyy-MM-dd');
      const stored = localStorage.getItem(`verified_${user.uid}_${workDay}`);
      return stored === 'true';
    } catch (e) {
      return false;
    }
  });
  const isVerifiedRef = useRef(isVerified);
  useEffect(() => { isVerifiedRef.current = isVerified; }, [isVerified]);
  
  const [isPausedBySecurity, setIsPausedBySecurity] = useState(false);
  const isPausedBySecurityRef = useRef(false);
  useEffect(() => { isPausedBySecurityRef.current = isPausedBySecurity; }, [isPausedBySecurity]);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [mismatchStartTime, setMismatchStartTime] = useState<number | null>(null);
  const [faceMissingStartTime, setFaceMissingStartTime] = useState<number | null>(null);
  // Overtime request (last 1 hour before auto-logout, employee can request extra time @ 2x pay)
  const [overtimeExtraMinutes, setOvertimeExtraMinutes] = useState(0);
  const overtimeExtraMinutesRef = useRef(0);
  useEffect(() => { overtimeExtraMinutesRef.current = overtimeExtraMinutes; }, [overtimeExtraMinutes]);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [overtimePromptShown, setOvertimePromptShown] = useState(false);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const todayEarningsRef = useRef(0);
  useEffect(() => { todayEarningsRef.current = todayEarnings; }, [todayEarnings]);
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [showCallModal, setShowCallModal] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended' | 'busy'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [callBusyUser, setCallBusyUser] = useState<string | null>(null);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharingInCall, setIsScreenSharingInCall] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveData, setLeaveData] = useState({ startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), reason: '' });
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);
  const [paidLeavesRemaining, setPaidLeavesRemaining] = useState(3);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const monitorChannelRef = useRef<any>(null);
  const callsChannelRef = useRef<any>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingCallIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const signalingChannelRef = useRef<any>(null);
  const isStartingLiveWebRTCRef = useRef(false);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveScreenStreamRef = useRef<MediaStream | null>(null);
  const callStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isCameraOn) {
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach(track => track.stop());
        liveStreamRef.current = null;
      }
      // Notify admin that camera is off
      if (monitorChannelRef.current) {
        safeSend(monitorChannelRef.current, 'monitor-error', { message: 'Camera turned off by employee' });
      }
    }
  }, [isCameraOn]);

  const prevStatusRef = useRef<UserStatus>(status);

  // ── Manual camera control: persist on active/break ────
  useEffect(() => {
    if (status === 'offline') {
      // Keep camera on as per user request "all time camera on till any on click event"
      // setIsCameraOn(false); 
      
      // But stop screen share on offline to save bandwidth
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      }
    } else if (status === 'active' && session?.id) {
      // Auto-start camera ONLY if it was never started in this session
      if (prevStatusRef.current === 'offline' && !isCameraOn) {
        setIsCameraOn(true);
      }
    }
    // Removed automatic stopping for break/leave - user wants it ON all time
    prevStatusRef.current = status;
  }, [status, session?.id]);

  useEffect(() => {
    const handleUnload = () => {
      if (user.uid) {
        // Save session progress if active
        if (sessionRef.current?.id) {
          const workMinutes = Math.floor(elapsedTimeRef.current / 60);
          const breakMinutes = Math.floor(breakElapsedTimeRef.current / 60);
          const sessionUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/work_sessions?id=eq.${sessionRef.current.id}`;
          const sessionData = JSON.stringify({ 
            total_work_minutes: workMinutes,
            total_break_minutes: breakMinutes,
            status: 'completed',
            end_time: new Date().toISOString()
          });
          const headers = {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          };
          fetch(sessionUrl, { method: 'PATCH', headers, body: sessionData, keepalive: true }).catch(() => {});
        }

        // Use fetch with keepalive for reliable status update on tab close
        // Construct URL manually to avoid supabase client being destroyed during unload
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?uid=eq.${user.uid}`;
        const data = JSON.stringify({ 
          status: 'offline',
          isMonitoringLive: false,
          cameraSnapshotUrl: null,
          screenSnapshotUrl: null
        });
        const headers = {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        };
        
        try {
          fetch(url, {
            method: 'PATCH',
            headers,
            body: data,
            keepalive: true
          });
        } catch (err) {
          // sendBeacon fallback
          try {
            navigator.sendBeacon(url, data);
          } catch (e) {}
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('unload', handleUnload);
      
      // Immediate offline update on component unmount
      if (user.uid) {
        supabase.from('users').update({ 
          status: 'offline',
          isMonitoringLive: false,
          cameraSnapshotUrl: null,
          screenSnapshotUrl: null
        }).eq('uid', user.uid).then();
      }
      
      // Stop ALL media tracks on unmount
      stopLiveWebRTC();
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => { track.stop(); });
        screenStreamRef.current = null;
      }
    };
  }, [user.uid]);

  useEffect(() => {
    setIsScreenShareSupported(!!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia));
  }, []);
  const [activeTab, setActiveTab] = useState<'tracking' | 'history' | 'payments' | 'messages' | 'teams' | 'meetings'>('tracking');
  const [joinCode, setJoinCode] = useState('');
  const [chatSidebarView, setChatSidebarView] = useState<'all' | 'teams' | 'direct'>('all');
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);
  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const employeesRef = useRef(employees);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  const [teams, setTeams] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [monitorNotification, setMonitorNotification] = useState<{show: boolean, message: string}>({ show: false, message: '' });
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(['admin']);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([]);
  const [isRequestingMessaging, setIsRequestingMessaging] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestRecipient, setRequestRecipient] = useState<UserProfile | null>(null);
  const [attachment, setAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  const [showLiveRequestModal, setShowLiveRequestModal] = useState(false);
  const notificationSound = useRef<HTMLAudioElement | null>(null);
  const ringtonePlayerRef = useRef(createTonePlayer('incoming'));
  const ringbackPlayerRef = useRef(createTonePlayer('outgoing'));
  const busyToneRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (showCallModal || showNotificationCenter || (activeTab === 'messages' && window.innerWidth < 768)) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showCallModal, showNotificationCenter, activeTab]);

  useEffect(() => {
    notificationSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3');
    busyToneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2347/2347-preview.mp3');
    busyToneRef.current.load();
    return () => {
      ringtonePlayerRef.current.stop();
      ringbackPlayerRef.current.stop();
    };
  }, []);

  const playIncomingCallTone = () => {
    ringtonePlayerRef.current.start();
  };

  const stopIncomingCallTone = () => {
    ringtonePlayerRef.current.stop();
  };

  const playRingbackTone = () => {
    ringbackPlayerRef.current.start();
  };

  const stopRingbackTone = () => {
    ringbackPlayerRef.current.stop();
  };

  const playBusyTone = () => {
    if (busyToneRef.current) {
      busyToneRef.current.play().catch(() => {});
    }
  };

  const playNotification = () => {
    if (notificationSound.current) {
      // Sound disabled per user request
      // notificationSound.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  const getWorkDay = (date: Date = new Date()) => {
    return format(date, 'yyyy-MM-dd');
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (showCallModal && callType === 'video' && !isVideoOff && !isScreenSharingInCall) {
      const startLocalVideo = async () => {
        try {
          if (localVideoRef.current && localVideoRef.current.srcObject) return;
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(() => {});
          }
        } catch (err: any) {
          const isPermissionError = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.toLowerCase().includes('denied');
          if (isPermissionError) {
            console.warn('Camera access denied for call preview.');
          } else {
            console.error('Error accessing camera:', err);
          }
        }
      };
      startLocalVideo();
    } else if (!showCallModal) {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [showCallModal, callType, isVideoOff, isScreenSharingInCall]);

  useEffect(() => {
    if (screenStream && screenStream.active) {
      if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
      
      const video = document.createElement('video');
      video.srcObject = screenStream;
      video.play();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      const interval = isMonitoringLive ? 1000 : 5000;
      
      snapshotIntervalRef.current = setInterval(async () => {
        if (screenStream.active && context) {
          canvas.width = 1280;
          canvas.height = 720;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(async (blob) => {
            if (blob) {
              const fileName = `screen-${user.uid}-${Date.now()}.jpg`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('face-photos')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

              if (uploadError) {
                console.error('Snapshot upload error:', uploadError);
                if (uploadError.message?.includes('Bucket not found')) {
                   // Only alert once or log to console to avoid spamming the user
                   console.warn('CRITICAL: "face-photos" bucket not found in Supabase Storage.');
                }
              }

              if (uploadData) {
                const { data: { publicUrl } } = supabase.storage
                  .from('face-photos')
                  .getPublicUrl(fileName);
                await supabase.from('users').update({ screenSnapshotUrl: publicUrl }).eq('uid', user.uid);
              }
            }
          }, 'image/jpeg', 0.5);
        }
      }, interval);
      
      return () => {
        if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
      };
    }
  }, [screenStream, isMonitoringLive, user.uid]);
  const handleVerified = useCallback(() => {
    setIsVerified(true);
    setIsVerifyingNow(false);
    // Sync to DB for Admin visibility
    supabase.from('users').update({ isVerified: true, lastVerifiedAt: new Date().toISOString() }).eq('uid', user.uid).then();
    
    try {
      const d = new Date();
      const workDay = format(d, 'yyyy-MM-dd');
      localStorage.setItem(`verified_${user.uid}_${workDay}`, 'true');
    } catch (e) {}
  }, [user.uid]);

  const handleFaceMatchChange = useCallback((match: boolean) => {
    setIsFaceMatched(match);
    supabase.from('users').update({ isFaceMatched: match }).eq('uid', user.uid).then();
  }, [user.uid]);

  const handleFaceDetectedChange = useCallback((detected: boolean) => {
    setFaceDetected(detected);
  }, []);

  const handleStreamReady = useCallback((stream: MediaStream) => {
    liveStreamRef.current = stream;
  }, []);

  // Removed old verifyStatus/faceMatchChange state updates as they are now memoized callbacks

  const cleanup = useCallback((topic: string) => {
    const existing = supabase.getChannels().find(c => c.topic === (topic.startsWith('realtime:') ? topic : `realtime:${topic}`));
    if (existing) {
      supabase.removeChannel(existing);
    }
  }, []);

  const joiningChannelsRef = useRef<Set<string>>(new Set());

  const safeSend = useCallback(async (channel: any, event: string, payload: any) => {
    if (!channel) return;
    
    const topic = (channel as any).topic;
    const state = (channel as any).state;
    
    if (state !== 'joined' && state !== 'joining' && !joiningChannelsRef.current.has(topic)) {
      joiningChannelsRef.current.add(topic);
      try {
        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            joiningChannelsRef.current.delete(topic);
          }
        });
      } catch (err) {
        joiningChannelsRef.current.delete(topic);
        console.warn(`Subscribe error for ${event}:`, err);
      }
    }

    if ((channel as any).state !== 'joined') {
      let attempts = 0;
      while ((channel as any).state !== 'joined' && attempts < 40) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
    }

    if ((channel as any).state === 'joined') {
      try {
        await channel.send({ type: 'broadcast', event, payload });
      } catch (err) {
        console.error(`Error sending ${event}:`, err);
      }
    }
  }, []);

  const oneShotSend = useCallback(async (channelId: string, event: string, payload: any) => {
    const fullTopic = (channelId.startsWith('realtime:') ? channelId : `realtime:${channelId}`);
    let channel = supabase.getChannels().find(c => c.topic === fullTopic);
    
    if (!channel) {
      channel = supabase.channel(channelId);
    }

    const state = (channel as any).state;

    if (state === 'joined') {
      await channel.send({ type: 'broadcast', event, payload });
      return;
    }

    if (state !== 'joining' && !joiningChannelsRef.current.has(fullTopic)) {
      joiningChannelsRef.current.add(fullTopic);
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          joiningChannelsRef.current.delete(fullTopic);
          await channel.send({ type: 'broadcast', event, payload });
          
          if (!channelId.startsWith('calls:')) {
            // Wait longer before cleanup to avoid race conditions or rapid remounts
            setTimeout(() => {
              const c = supabase.getChannels().find(ch => ch.topic === fullTopic);
              if (c) supabase.removeChannel(c);
            }, 60000);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          joiningChannelsRef.current.delete(fullTopic);
        }
      });
    } else {
      let attempts = 0;
      while ((channel as any).state !== 'joined' && attempts < 40) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if ((channel as any).state === 'joined') {
        await channel.send({ type: 'broadcast', event, payload });
      }
    }
  }, []);

  const broadcastStatus = useCallback(() => {
    if (peerConnectionRef.current) {
      safeSend(monitorChannelRef.current, 'verification-status', { 
        isVerified: isVerifiedRef.current, 
        isFaceMatched: isFaceMatchedRef.current, 
        faceDetected: faceDetectedRef.current,
        fromId: user.uid 
      });
    }
  }, [user.uid, safeSend]);

  const stopScreenShare = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
      if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
      await supabase.from('users').update({ 
        screenSnapshotUrl: null,
        isMonitoringLive: false 
      }).eq('uid', user.uid);

      // Also stop WebRTC if it was using this stream
      if (liveScreenStreamRef.current) {
        liveScreenStreamRef.current.getTracks().forEach(t => t.stop());
        liveScreenStreamRef.current = null;
      }
    }
  };

  const startScreenShare = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert("Screen sharing is not supported in this view. Please open the application in a new tab using the button below.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { cursor: "always" } as any,
        audio: false 
      });
      setScreenStream(stream);
      
      stream.getVideoTracks()[0].onended = () => {
        setScreenStream(null);
        if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
        supabase.from('users').update({ screenSnapshotUrl: null }).eq('uid', user.uid);
      };
    } catch (err) {
      console.error('Error sharing screen:', err);
      alert("Failed to start screen share. Make sure you've granted permissions and are using a supported browser.");
    }
  };

  useEffect(() => {
    const handleMouseMove = () => {
      setLastMouseMove(Date.now());
      setShowIdleWarning(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const subscription = supabase
      .channel(`user-live-${user.uid}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'users', 
        filter: `uid=eq.${user.uid}` 
      }, (payload) => {
        if (payload.new && 'isMonitoringLive' in payload.new) {
          setIsMonitoringLive(payload.new.isMonitoringLive);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user.uid]);

  // Re-negotiate WebRTC if media states change during active monitoring
  useEffect(() => {
    if (isMonitoringLive) {
      console.log('Media state changed during active monitoring, re-negotiating...');
      const timer = setTimeout(() => {
        startLiveWebRTC();
      }, 1000); // Small delay to allow streams to stabilize
      return () => clearTimeout(timer);
    }
  }, [isCameraOn, !!screenStream, isMonitoringLive]);
  const [hasSessionToday, setHasSessionToday] = useState(false);
  const [sessionApprovalStatus, setSessionApprovalStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const checkTodaySession = async (silent = false) => {
    if (!silent) setIsCheckingSession(true);
    const workDay = getWorkDay();
    try {
      let { data: existingSessions, error: sessionErr } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('userId', user.uid)
        .eq('date', workDay)
        .eq('status', 'completed');

      // Fallback for all-lowercase or snake_case columns
      if (sessionErr?.message?.includes('column "userId" does not exist') || (!existingSessions && !sessionErr)) {
        const { data: snakeSessions, error: snakeErr } = await supabase
          .from('work_sessions')
          .select('*')
          .filter('user_id', 'eq', user.uid)
          .filter('date', 'eq', workDay)
          .filter('status', 'eq', 'completed');
        
        if (snakeSessions) existingSessions = snakeSessions;

        if (snakeErr?.message?.includes('column "user_id" does not exist')) {
          const { data: lowerSessions } = await supabase
            .from('work_sessions')
            .select('*')
            .filter('userid', 'eq', user.uid)
            .filter('date', 'eq', workDay)
            .filter('status', 'eq', 'completed');
          if (lowerSessions) existingSessions = lowerSessions;
        }
      }

      if (existingSessions && existingSessions.length > 0) {
        setHasSessionToday(true);
        // Check most recent session_request alert for THIS WorkDay
        let { data: approvalAlerts } = await supabase
          .from('alerts')
          .select('*')
          .eq('userId', user.uid)
          .eq('type', 'session_request')
          .order('timestamp', { ascending: false })
          .limit(1);

        if (!approvalAlerts || approvalAlerts.length === 0) {
          const { data: lowerAlerts } = await supabase
            .from('alerts')
            .select('*')
            .filter('userid', 'eq', user.uid)
            .filter('type', 'eq', 'session_request')
            .order('timestamp', { ascending: false })
            .limit(1);
          if (lowerAlerts) approvalAlerts = lowerAlerts;
        }

        if (approvalAlerts && approvalAlerts.length > 0) {
          const latestAlert = approvalAlerts[0];
          const ts = latestAlert.timestamp || latestAlert.created_at || latestAlert.createdat;
          
          let alertWorkDay = null;
          if (ts) {
            const d = new Date(ts);
            if (isValid(d)) {
              alertWorkDay = getWorkDay(d);
            }
          }

          if (alertWorkDay === workDay) {
            if (latestAlert.status === 'approved') {
              setSessionApprovalStatus('approved');
            } else if (latestAlert.status === 'new' || latestAlert.status === 'pending') {
              setSessionApprovalStatus('pending');
            } else if (latestAlert.status === 'rejected') {
              setSessionApprovalStatus('rejected');
            } else {
              setSessionApprovalStatus('none');
            }
          } else {
            setSessionApprovalStatus('none');
          }
        } else {
          setSessionApprovalStatus('none');
        }
      } else {
        setHasSessionToday(false);
        setSessionApprovalStatus('none');
      }
    } catch (err) {
      console.error('checkTodaySession error:', err);
    } finally {
      if (!silent) setIsCheckingSession(false);
    }
  };

  const fetchData = useCallback(async () => {
    // Fetch employees
    const { data: empls } = await supabase.from('users').select('*').eq('role', 'employee');
    if (empls) setEmployees(empls);

    // Fetch teams I am part of
    const { data: myTeams } = await supabase.from('teams')
      .select('*')
      .filter('memberIds', 'cs', `{"${user.uid}"}`);
    if (myTeams) setTeams(myTeams);

    // Fetch messages for my teams and DMs
    const teamIds = (myTeams || []).map(t => t.id);
    const { data: allMsgs, error: msgErr } = await supabase.from('messages').select('*').order('timestamp', { ascending: true });
    
    if (allMsgs) {
      const mapped = allMsgs.map(normalizeMessage);
      const filtered = mapped.filter(m => {
        // Include messages sent by me
        if (m.senderId === user.uid) return true;
        // Include messages sent directly to me
        if (m.receiverIds.includes(user.uid)) return true;
        // Include team messages (my team OR any team message sent to/from me by teamId match)
        if (m.teamId && teamIds.includes(m.teamId)) return true;
        // Include team messages where receiverIds is empty (broadcast) and teamId is set — catches race condition
        if (m.teamId && (!m.receiverIds || m.receiverIds.length === 0)) return true;
        return false;
      });
      setMessages(filtered);
    } else if (msgErr) {
      // Retry with created_at if timestamp fails
      const { data: sMsgs } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
      if (sMsgs) {
        const mapped = sMsgs.map(normalizeMessage);
        const filtered = mapped.filter(m => {
          if (m.senderId === user.uid) return true;
          if (m.receiverIds.includes(user.uid)) return true;
          if (m.teamId && teamIds.includes(m.teamId)) return true;
          if (m.teamId && (!m.receiverIds || m.receiverIds.length === 0)) return true;
          return false;
        });
        setMessages(filtered);
      }
    }
  }, [user.uid]);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = setTimeout(() => fetchData(), 2000);
  }, [fetchData]);

  useEffect(() => {
    checkTodaySession();
  }, [user.uid]);

  useEffect(() => {
    fetchData();

    // Subscribe to changes
    const tChan = `teams-changes:${user.uid}`;
    const eChan = `employees-online:${user.uid}`;
    cleanup(tChan);
    cleanup(eChan);

    const teamsSub = supabase.channel(tChan).on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, debouncedFetch).subscribe();
    const employeesSub = supabase.channel(eChan).on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload: any) => {
      if (!payload.new) return;
      const newUser = payload.new as UserProfile;
      setEmployees(prev => {
        const index = prev.findIndex(e => e.uid === newUser.uid || (e as any).id === (newUser as any).id);
        if (index === -1) return [...prev, newUser];
        const next = [...prev];
        next[index] = { ...next[index], ...newUser };
        return next;
      });
    }).subscribe();

    return () => {
      supabase.removeChannel(teamsSub);
      supabase.removeChannel(employeesSub);
    };
  }, [user.uid, debouncedFetch, cleanup]);

  useEffect(() => {
    broadcastStatus();
  }, [isVerified, broadcastStatus]);

  useEffect(() => {
    broadcastStatus();
  }, [isFaceMatched, broadcastStatus]);

  useEffect(() => {
    broadcastStatus();
  }, [faceDetected, broadcastStatus]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isStartingWork, setIsStartingWork] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    type: 'session' | 'leave' | 'logout';
    loading?: boolean;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'session',
    loading: false
  });

  const stopAllMediaAndLogout = async () => {
    try {
      // 1. Stop active session first (updates DB, stops FaceTracker via setIsCameraOn(false))
      if (status !== 'offline') {
        await stopWork();
      }
      // 2. Force-stop ALL video/audio tracks attached to ANY video element in the DOM
      //    This catches FaceTracker's internal stream that we can't access via ref
      document.querySelectorAll('video').forEach((videoEl) => {
        const src = videoEl.srcObject as MediaStream | null;
        if (src) {
          src.getTracks().forEach(t => t.stop());
          videoEl.srcObject = null;
        }
      });
      // 3. Stop screen share stream
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      // 4. Stop WebRTC live stream
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach(t => t.stop());
        liveStreamRef.current = null;
      }
      if (liveScreenStreamRef.current) {
        liveScreenStreamRef.current = null;
      }
      // 5. Stop call stream
      if (callStreamRef.current) {
        callStreamRef.current.getTracks().forEach(t => t.stop());
        callStreamRef.current = null;
      }
      // 6. Close WebRTC peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      // 7. Turn off camera state
      setIsCameraOn(false);
      setScreenStream(null);
      // 8. Stop live WebRTC
      await stopLiveWebRTC();
    } catch (err) {
      console.error('Error stopping media on logout:', err);
    }
    onLogout();
  };

  const handleLogoutClick = () => {
    setConfirmModal({
      show: true,
      title: 'Confirm Logout',
      message: 'Are you sure you want to sign out? This will stop all monitoring and release camera/screen permissions.',
      onConfirm: stopAllMediaAndLogout,
      type: 'logout'
    });
  };

  const handleStartWorkClick = (skipConfirm = false) => {
    // Session restriction logic: If logout gap > 2 hours and not first session
    let needsApproval = false;
    const lastEndStr = localStorage.getItem(`last_end_${user.uid}`) || user.lastSessionEndTime;
    if (lastEndStr && todayTotalWorkSeconds > 0) {
      const lastEnd = new Date(lastEndStr).getTime();
      const now = new Date().getTime();
      const gapSeconds = (now - lastEnd) / 1000;
      if (gapSeconds > 7200) {
        needsApproval = true;
      }
    }

    if (needsApproval && sessionApprovalStatus !== 'approved') {
      setConfirmModal({
        show: true,
        title: 'Session Permission Required',
        message: 'You have been logged out for more than 2 hours. Resuming your session requires admin permission and a reason.',
        onConfirm: () => {
          const reasonText = prompt('Please enter the reason for session resumption:');
          if (reasonText) {
            requestSessionApproval(reasonText);
          }
        },
        type: 'session'
      });
      return;
    }

    if (skipConfirm) {
      startWork();
      return;
    }
    setConfirmModal({
      show: true,
      title: 'Start Work Session',
      message: 'Are you ready to start your work session? This will enable live monitoring and screen tracking.',
      onConfirm: startWork,
      type: 'session'
    });
  };

  const requestSessionApproval = async (reasonInput?: any) => {
    // Explicitly handle and discard React events or objects to prevent JSON circularity errors
    const reason = (typeof reasonInput === 'string' && reasonInput.length > 0) 
      ? reasonInput 
      : 'Standard manual request';
      
    setConfirmModal(prev => ({ ...prev, loading: true }));
    const alertPayload = {
      userId: user.uid,
      employeeName: user.displayName,
      type: 'session_request',
      timestamp: new Date().toISOString(),
      details: JSON.stringify({
        reason: reason,
        message: `${user.displayName} is requesting a second session.`
      }),
      status: 'new'
    };
    
    await supabase.from('alerts').insert(alertPayload);
    await supabase.from('users').update({ sessionApprovalStatus: 'pending' }).eq('uid', user.uid);
    setSessionApprovalStatus('pending');
    setConfirmModal({
      show: true,
      title: 'Request Sent',
      message: 'Your request for a second session has been sent to the admin. Please wait for approval.',
      onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false })),
      type: 'info' as any
    });
  };

  useEffect(() => {
    if (!user.uid) return;
    // signalingChannel will handle both standard calls and monitoring broadcasts
    const sigId = `calls:${user.uid}`;
    cleanup(sigId);
    const signalingChannel = supabase.channel(sigId, {
      config: { broadcast: { self: false } }
    });
    callsChannelRef.current = signalingChannel;
    monitorChannelRef.current = signalingChannel; 

    const sub = signalingChannel
      // 1. Session Approvals
      .on('broadcast', { event: 'leave-updated' }, (payload: any) => {
        // Refresh the actual leave status/dates (fetchData() alone never touched leave state)
        fetchLeaves();
        playNotification();
        const info = payload?.payload || {};
        if (info.status) {
          setConfirmModal({
            show: true,
            title: `Leave ${info.status.charAt(0).toUpperCase() + info.status.slice(1)}`,
            message: info.message || `Your leave request has been ${info.status}.`,
            onConfirm: () => setConfirmModal(prev => ({ ...prev, show: false })),
            type: 'leave'
          });
        }
      })
      .on('broadcast', { event: 'session-approved' }, () => {
        setSessionApprovalStatus('approved');
        checkTodaySession(); 
        fetchData(); 
        playNotification();
      })
      // 2. Monitoring Requests
      .on('broadcast', { event: 'request-live-stream' }, async ({ payload }) => {
        console.log('Received monitoring request from:', payload.fromName);
        if (isStartingLiveWebRTCRef.current && !payload.force) {
          console.log('Monitoring already starting, ignoring duplicate request');
          return;
        }
        
        // If force is requested and we are already starting, cancel the previous attempt if possible?
        // For simplicity, just reset the ref if force is true
        if (payload.force) {
          isStartingLiveWebRTCRef.current = false;
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }
        }
        
        setMonitorNotification({ 
          show: true, 
          message: `${payload.fromName || 'Admin'} is now monitoring your live feed` 
        });
        setTimeout(() => setMonitorNotification(prev => ({ ...prev, show: false })), 5000);
        await startLiveWebRTC();
      })
      .on('broadcast', { event: 'stop-live-stream' }, () => {
        stopLiveWebRTC();
      })
      // 3. WebRTC Monitoring Signaling
      .on('broadcast', { event: 'webrtc-mon-answer' }, async ({ payload }) => {
        if (peerConnectionRef.current) {
          const pc = peerConnectionRef.current;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            
            // Process buffered candidates ONLY after remote description is set
            while (pendingIceCandidatesRef.current.length > 0) {
              const candidate = pendingIceCandidatesRef.current.shift();
              if (candidate && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
                  console.warn('Post-setRemoteDescription ICE error:', err);
                });
              }
            }
          } catch (err) {
            console.error('setRemoteDescription error:', err);
          }
        }
      })
      .on('broadcast', { event: 'webrtc-mon-ice' }, async ({ payload }) => {
        if (peerConnectionRef.current && payload) {
          const pc = peerConnectionRef.current;
          // IMPORTANT: Check signalingState to ensure we can add candidates
          if (pc.remoteDescription && pc.signalingState !== 'closed') {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload));
            } catch (e) {
              console.warn('Candidate add failed (possibly concurrent state change):', e);
            }
          } else {
            pendingIceCandidatesRef.current.push(payload);
          }
        }
      })
      // 4. Standard Call Requests
      .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
        if (isInCall || incomingCall) {
          oneShotSend(`calls:${payload.fromId}`, 'call-busy', { from: user.displayName, fromId: user.uid });
        } else {
          setIncomingCall({ ...payload, context: 'call' });
          playIncomingCallTone();
          
          // Open chat with the caller
          const admin = employeesRef.current.find(e => e.uid === payload.fromId);
          if (admin) setSelectedChatUser(admin);
        }
      })
      .on('broadcast', { event: 'call-busy' }, ({ payload }) => {
        stopRingbackTone();
        stopIncomingCallTone();
        setCallStatus('busy');
        setCallBusyUser(payload.from || 'User');
        playBusyTone();
        setTimeout(() => {
          setCallStatus('idle');
          setShowCallModal(false);
          setIsInCall(false);
          setIncomingCall(null);
        }, 4000);
      })
      .on('broadcast', { event: 'webrtc-call-answer' }, async ({ payload }) => {
        stopRingbackTone();
        if (callPeerConnectionRef.current) {
          await callPeerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload)).catch(console.error);
          
          // Process buffered candidates
          while (pendingCallIceCandidatesRef.current.length > 0) {
            const candidate = pendingCallIceCandidatesRef.current.shift();
            if (candidate) {
              await callPeerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
            }
          }
          setCallStatus('connected');
          setCallDuration(0);
        }
      })
      .on('broadcast', { event: 'webrtc-call-ice' }, async ({ payload }) => {
        if (callPeerConnectionRef.current && payload) {
          if (callPeerConnectionRef.current.remoteDescription) {
            await callPeerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload)).catch(console.error);
          } else {
            pendingCallIceCandidatesRef.current.push(payload);
          }
        }
      })
      .on('broadcast', { event: 'call-ended' }, () => {
        stopIncomingCallTone();
        stopRingbackTone();
        endCall();
        setIncomingCall(null);
      })
      .on('broadcast', { event: 'call-busy' }, ({ payload }) => {
        stopRingbackTone();
        stopIncomingCallTone();
        setCallStatus('busy');
        setCallBusyUser(payload.from || 'User');
        playBusyTone();
        setTimeout(() => {
          setCallStatus('idle');
          setShowCallModal(false);
          setCallBusyUser(null);
          setIsInCall(false);
        }, 4000);
      })
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'users', 
        filter: `uid=eq.${user.uid}` 
      }, (payload) => {
        if (payload.new.sessionApprovalStatus) {
           setSessionApprovalStatus(payload.new.sessionApprovalStatus);
           if (payload.new.sessionApprovalStatus === 'approved') playNotification();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [user.uid]);

  // Separate effect for messages to avoid reloading signaling on team changes
  useEffect(() => {
    const msgChan = `messages-realtime:${user.uid}`;
    cleanup(msgChan);
    const messagesChannel = supabase.channel(msgChan)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages' 
      }, (payload) => {
        const newMsg = normalizeMessage(payload.new);
        const myTeamIds = teams.map(t => t.id);

        const isToMe = newMsg.receiverIds.includes(user.uid);
        const isFromMe = newMsg.senderId === user.uid;
        const isMyTeamMsg = newMsg.teamId && (myTeamIds.includes(newMsg.teamId) || !newMsg.receiverIds || newMsg.receiverIds.length === 0);

        if (isToMe || isFromMe || isMyTeamMsg) {
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          });
          if (!isFromMe) playNotification();
          setTimeout(scrollToBottom, 50);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [user.uid, teams]);

  useEffect(() => {
    messageContainerRef.current?.scrollTo({
      top: messageContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages, typingUsers]);

  useEffect(() => {
    if (activeTab === 'messages' && selectedRecipients.length > 0) {
      safeSend(callsChannelRef.current, 'typing', { userId: user.uid, userName: user.displayName, isTyping: isTyping });
    }
  }, [isTyping, activeTab, selectedRecipients, user.uid, user.displayName, safeSend]);

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 3000);
    }
  };

  const acceptCall = async () => {
    stopIncomingCallTone();
    if (!incomingCall) return;
    setCallStatus('connecting');
    if (incomingCall.context === 'mon') {
      await startLiveWebRTC();
    } else {
      await handleIncomingCall(incomingCall);
    }
    setIncomingCall(null);
  };

  const declineCall = () => {
    stopIncomingCallTone();
    if (incomingCall) {
      if (incomingCall.fromId) {
        // Use 'call-busy' which already has a listener on the other side to show busy/declined status
        oneShotSend(`calls:${incomingCall.fromId}`, incomingCall.context === 'mon' ? 'monitor-error' : 'call-busy', { message: 'Employee declined the call', from: user.displayName, fromId: user.uid });
      }
      setIncomingCall(null);
    }
  };

  const startLiveWebRTC = async () => {
    if (isStartingLiveWebRTCRef.current) return;
    isStartingLiveWebRTCRef.current = true;
    
    console.log('Starting Live WebRTC monitoring stream...');
    
    try {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      pendingIceCandidatesRef.current = [];
      
      // 1. Get Media Streams - Reuse already active ones from refs!
      let camStream: MediaStream | null = liveStreamRef.current;
      let screenStreamLocal: MediaStream | null = liveScreenStreamRef.current || screenStream;

      // Check if camStream is valid and has video
      const hasActiveVideo = camStream && camStream.active && camStream.getVideoTracks().some(t => t.readyState === 'live');

      if (isCameraOn && !hasActiveVideo) {
        console.log('Monitoring requested but no active camera stream found in ref. Waiting for FaceTracker...');
        // We don't call getUserMedia here to avoid hardware conflicts with FaceTracker
      }

      // NO RE-PROMPT: Only share screen if we ALREADY HAVE IT active
      if (!screenStreamLocal || !screenStreamLocal.active) {
        console.log('Requested monitoring but screen share is not active. Using existing camera if available.');
      } else {
        liveScreenStreamRef.current = screenStreamLocal;
      }

      // 2. Create PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      peerConnectionRef.current = pc;

      // 3. Add All Tracks for "Everything Share"
      if (camStream) {
        camStream.getTracks().forEach(track => {
          if (track.kind === 'video') (track as any).contentHint = 'motion';
          pc.addTrack(track, camStream!);
        });
      }
      if (screenStreamLocal) {
        screenStreamLocal.getTracks().forEach(track => {
          if (track.kind === 'video') (track as any).contentHint = 'detail';
          pc.addTrack(track, screenStreamLocal!);
        });
      }
      
      // 4. Handle ICE Candidates
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          try {
            (pc as any).restartIce();
          } catch (e) {
            console.warn('ICE restart not supported or failed:', e);
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          safeSend(monitorChannelRef.current, 'webrtc-mon-ice', event.candidate);
        }
      };

      pc.ontrack = (event) => {
        // Monitoring is mostly one-way, but we can receive admin audio
        if (event.track.kind === 'audio') {
          const remoteAudio = new Audio();
          remoteAudio.srcObject = event.streams[0];
          remoteAudio.play().catch(console.error);
        }
      };

      // 5. Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 6. Send Offer
      safeSend(monitorChannelRef.current, 'webrtc-mon-offer', { offer, fromId: user.uid, fromName: user.displayName, context: 'mon' });

      // Send verification status - Use REAL values now
      broadcastStatus();

      console.log('Live WebRTC offer sent with all tracks');
    } catch (err: any) {
      console.error('Error starting live WebRTC:', err);
    } finally {
      isStartingLiveWebRTCRef.current = false;
    }
  };

  const handleIncomingCall = async (callPayload: any) => {
    try {
      setIsInCall(true);
      setCallType(callPayload.type || 'video');
      setShowCallModal(true);
      setCallStatus('connecting'); 
      setCallDuration(0);
      stopIncomingCallTone();
      
      // CRITICAL: Set recipient so endCall knows who to notify
      if (callPayload.fromId) {
        setSelectedRecipients([callPayload.fromId]);
        const caller = employeesRef.current.find(e => e.uid === callPayload.fromId);
        if (caller) setSelectedChatUser(caller);
      }

      if (callPeerConnectionRef.current) {
        callPeerConnectionRef.current.onicecandidate = null;
        callPeerConnectionRef.current.ontrack = null;
        callPeerConnectionRef.current.close();
        callPeerConnectionRef.current = null;
      }
      pendingCallIceCandidatesRef.current = [];

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: callPayload.type !== 'voice',
          audio: true
        });
      } catch (mediaErr: any) {
        if (callPayload.type !== 'voice' && mediaErr?.name !== 'NotAllowedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } else {
          throw mediaErr;
        }
      }
      callStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      });
      callPeerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && callPayload.fromId) {
          oneShotSend(`calls:${callPayload.fromId}`, 'webrtc-call-ice', event.candidate);
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            setCallStatus('connected');
            stopIncomingCallTone();
        }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') endCall();
      };

      await pc.setRemoteDescription(new RTCSessionDescription(callPayload.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (callPayload.fromId) {
        oneShotSend(`calls:${callPayload.fromId}`, 'webrtc-call-answer', answer);
      }

      // Drain buffered candidates
      while (pendingCallIceCandidatesRef.current.length > 0) {
        const candidate = pendingCallIceCandidatesRef.current.shift();
        if (candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
        }
      }

    } catch (err: any) {
      console.error('Error handling incoming call:', err);
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera/microphone permission was denied. Please allow access in your browser settings and try again.'
        : err?.name === 'NotFoundError'
        ? 'No camera or microphone was found on this device.'
        : 'Failed to answer call. Please check camera/mic permissions.';
      alert(msg);
      setIsInCall(false);
      setShowCallModal(false);
      endCall();
    }
  };

  // Force camera ON when active or away
  useEffect(() => {
    if (session && (status === 'active' || status === 'away')) {
      if (!isCameraOn) {
        setIsCameraOn(true);
      }
    }
  }, [session, status]);

  const endCall = () => {
    stopIncomingCallTone();
    stopRingbackTone();
    if (callPeerConnectionRef.current) {
      callPeerConnectionRef.current.onicecandidate = null;
      callPeerConnectionRef.current.ontrack = null;
      callPeerConnectionRef.current.close();
      callPeerConnectionRef.current = null;
    }
    pendingCallIceCandidatesRef.current = [];
    
    // selective track stopping: PROTECT core camera feed if session is active
    if (localStream) {
      // ONLY stop if we're not supposed to be monitoring (offline) OR if it was a screen share only call
      if (status === 'offline' || isScreenSharingInCall) {
        localStream.getTracks().forEach(t => t.stop());
      }
      setLocalStream(null);
    }
    
    if (callStreamRef.current) {
      // ONLY stop if offline
      if (status === 'offline') {
        callStreamRef.current.getTracks().forEach(track => track.stop());
      }
      callStreamRef.current = null;
    }
    
    setShowCallModal(false);
    setIsInCall(false);
    setCallStatus('ended');
    setIncomingCall(null);
    setCallBusyUser(null);
    setIsScreenSharingInCall(false);
    
    const targetId = selectedRecipients[0];
    if (targetId) {
      oneShotSend(`calls:${targetId}`, 'call-ended', {});
    }
  };

  const stopLiveWebRTC = async () => {
    console.log('Stopping Live WebRTC...');
    isStartingLiveWebRTCRef.current = false;
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    // IMPORTANT: Do NOT null out liveStreamRef.current / liveScreenStreamRef.current here.
    // These refs are only populated once (camera ref is set a single time by FaceTracker's
    // onStreamReady, and is never re-fired while the camera stays on). Nulling them on every
    // stop meant the very next time the admin clicked the eye button, startLiveWebRTC() would
    // find no camera stream to attach (screen kept working because it has a state fallback,
    // camera does not) - causing camera to break after the first monitoring session.
    // The tracks themselves are still live and safe to reuse for the next monitoring request.
    
    try {
      await supabase.from('users').update({ isMonitoringLive: false }).eq('uid', user.uid);
    } catch (e) {}
    
    console.log('Live WebRTC stopped and cleaned up');
  };

  useEffect(() => {
    if (status === 'active') {
      // Removed redundant captureSnapshot as FaceTracker handles camera snapshots
      // and screen snapshots are handled by the screenStream effect
    }
  }, [status, isMonitoringLive, user.uid]);

  // ── Removed redundant listener that was causing "Failed to fetch" ────

  useEffect(() => {
    const fetchTodayStats = async () => {
      const now = new Date();
      let targetDate = getWorkDay(now);

      let { data: sessionsToSum } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('userId', user.uid)
        .eq('date', targetDate);

      if (!sessionsToSum || sessionsToSum.length === 0) {
        const { data: sSum } = await supabase
          .from('work_sessions')
          .select('*')
          .eq('user_id', user.uid)
          .eq('date', targetDate);
        if (sSum) sessionsToSum = sSum;
      }

      if (sessionsToSum && sessionsToSum.length > 0) {
        const normalized = sessionsToSum.map(normalizeSession);
        setHasSessionToday(true);
        
        // If there's an ongoing session from the same logic period, resume it
        const resumedSession = normalized.find(s => s.status === 'active' || s.status === 'paused' || s.status === 'break' || s.status === 'away');
        if (resumedSession) {
          if (!session) {
            setSession(resumedSession);
            setElapsedTime(resumedSession.totalWorkMinutes * 60);
            setBreakElapsedTime(resumedSession.totalBreakMinutes * 60);
            setStatus(resumedSession.status as any);
            if (resumedSession.status === 'active' || resumedSession.status === 'away') setIsCameraOn(true);
          } else {
            // Protect local precise seconds from being overwritten by truncated DB minutes
            const savedWorkSeconds = resumedSession.totalWorkMinutes * 60;
            const savedBreakSeconds = resumedSession.totalBreakMinutes * 60;
            
            if (savedWorkSeconds > elapsedTimeRef.current + 60) {
              setElapsedTime(savedWorkSeconds);
            }
            if (savedBreakSeconds > breakElapsedTimeRef.current + 60) {
              setBreakElapsedTime(savedBreakSeconds);
            }
            
            // Sync status if it changed in DB by someone else
            if (resumedSession.status !== statusRef.current) {
              setStatus(resumedSession.status as any);
            }
          }
        } else if (status === 'active' || status === 'paused' || status === 'break' || status === 'away') {
          setStatus('offline');
          setIsCameraOn(false);
          // Sync with DB
          supabase.from('users').update({ status: 'offline' }).eq('uid', user.uid).then();
        }

        const completedWorkMins = normalized
          .filter(s => !['active', 'paused', 'break', 'away'].includes(s.status))
          .reduce((acc, s) => acc + (s.totalWorkMinutes || 0), 0);
        
        const completedBreakMins = normalized
          .filter(s => !['active', 'paused', 'break', 'away'].includes(s.status))
          .reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
        
        setBaseCompletedWorkMinutes(completedWorkMins);
        setBaseCompletedBreakMinutes(completedBreakMins);
      } else {
        setHasSessionToday(false);
        setBaseCompletedWorkMinutes(0);
        setBaseCompletedBreakMinutes(0);
      }
    };

    fetchTodayStats();
    
    // Also fetch user's approval status
    const fetchApproval = async () => {
      const { data } = await supabase.from('users').select('sessionApprovalStatus').eq('uid', user.uid).single();
      if (data) setSessionApprovalStatus(data.sessionApprovalStatus || 'none');
    };
    fetchApproval();
  }, [user.uid, user.hourlyRate, session?.id]);

  // Calculate earnings and totals locally to avoid network spam
  useEffect(() => {
    const totalWorkSeconds = (baseCompletedWorkMinutes * 60) + elapsedTime;
    const totalBreakSeconds = (baseCompletedBreakMinutes * 60) + breakElapsedTime;

    setTodayTotalWorkSeconds(totalWorkSeconds);
    setTodayTotalBreakSeconds(totalBreakSeconds);

    const ratePerSec = (user.hourlyRate || 0) / 3600;
    // Requested overtime (last-hour extension) is paid at 2x; everything else at normal rate.
    const baseCutoffSeconds = ((user.standardWorkingHours || 8) + 2) * 3600;
    const overtimeSecondsApproved = overtimeExtraMinutes * 60;
    const overtimeSecondsWorked = Math.max(0, Math.min(elapsedTime - baseCutoffSeconds, overtimeSecondsApproved));
    const normalSeconds = totalWorkSeconds - overtimeSecondsWorked;
    const earnings = (normalSeconds * ratePerSec) + (overtimeSecondsWorked * ratePerSec * 2);
    setTodayEarnings(Number(earnings.toFixed(2)));
  }, [elapsedTime, breakElapsedTime, baseCompletedWorkMinutes, baseCompletedBreakMinutes, user.hourlyRate, user.standardWorkingHours, overtimeExtraMinutes]);

  const normalizeSession = (data: any): WorkSession => {
    if (!data) return data;
    return {
      ...data,
      id: data.id || data.session_id || data.sessionid,
      userId: data.userId || data.user_id || data.userid,
      startTime: data.startTime || data.start_time || data.starttime,
      endTime: data.endTime || data.end_time || data.endtime,
      totalWorkMinutes: data.totalWorkMinutes ?? data.total_work_minutes ?? data.totalworkminutes ?? 0,
      totalBreakMinutes: data.totalBreakMinutes ?? data.total_break_minutes ?? data.totalbreakminutes ?? 0,
    };
  };

  const formatSafe = (date: any, formatStr: string, fallback = '--') => {
    if (!date) return fallback;
    const d = new Date(date);
    if (!isValid(d)) return fallback;
    return format(d, formatStr);
  };

  const fetchActiveSession = async () => {
    if (isEndingSession) return;
    try {
      let { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .in('status', ['active', 'paused', 'break', 'away'])
        .eq('userId', user.uid)
        .maybeSingle();

      // Fallback for userid (lowercase) or user_id (snake_case)
      if (!data) {
        const { data: data2 } = await supabase
          .from('work_sessions')
          .select('*')
          .in('status', ['active', 'paused', 'break', 'away'])
          .filter('user_id', 'eq', user.uid)
          .maybeSingle();
        
        if (data2) data = data2;
        
        if (!data) {
          const { data: data3 } = await supabase
            .from('work_sessions')
            .select('*')
            .in('status', ['active', 'paused', 'break', 'away'])
            .filter('userid', 'eq', user.uid)
            .maybeSingle();
          if (data3) data = data3;
        }
      }

      if (data) {
        const normalized = normalizeSession(data);
        const isSameSession = sessionRef.current && sessionRef.current.id === normalized.id;
        
        // Eagerly update session object but be careful with status
        if (!isSameSession || sessionRef.current?.status !== normalized.status || sessionRef.current?.totalWorkMinutes !== normalized.totalWorkMinutes) {
          setSession(normalized);
        }
        
        // Better timer resumption: Only overwrite if it's a new session or if we don't have local tracking
        const savedWorkSeconds = (normalized.totalWorkMinutes || 0) * 60;
        const savedBreakSeconds = (normalized.totalBreakMinutes || 0) * 60;
        
        if (!isSameSession) {
          setElapsedTime(savedWorkSeconds);
          setBreakElapsedTime(savedBreakSeconds);
          console.log(`Initial session load: ${normalized.id}, work: ${savedWorkSeconds}s`);
        } else {
          // Protect local precise seconds from being overwritten by truncated DB minutes
          if (savedWorkSeconds > elapsedTimeRef.current + 61) {
             setElapsedTime(savedWorkSeconds);
          }
          if (savedBreakSeconds > breakElapsedTimeRef.current + 61) {
             setBreakElapsedTime(savedBreakSeconds);
          }
        }
        
        setIsVerified(true);
        // Only set active if currently offline and we found a session that should be active
        if (statusRef.current === 'offline') {
           setStatus(normalized.status as any);
        }
      } else {
        // Only set offline if explicit no session found (data is null and no critical error)
        setSession(null);
        setStatus('offline');
      }
    } catch (err) {
      console.error('fetchActiveSession error:', err);
    }
  };

  const fetchPayments = async () => {
    try {
      let { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('userId', user.uid)
        .order('createdAt', { ascending: false });

      if (error) {
        // Try snake_case
        const { data: data2, error: error2 } = await supabase
          .from('payments')
          .select('*')
          .eq('user_id', user.uid)
          .order('created_at', { ascending: false });
        
        if (!error2 && data2) {
          data = data2;
        } else if (error2) {
          // Try lowercase
          const { data: data3 } = await supabase
            .from('payments')
            .select('*')
            .eq('userid', user.uid)
            .order('createdat', { ascending: false });
          if (data3) data = data3;
        }
      }

      if (data) {
        setPayments(data.map((p: any) => ({
          ...p,
          id: p.id || p.payment_id || p.paymentid,
          periodStart: p.periodStart || p.period_start || p.periodstart,
          periodEnd: p.periodEnd || p.period_end || p.periodend,
          employeeName: p.employeeName || p.employee_name || p.employeename || p.userName || p.username,
          userId: p.userId || p.user_id || p.userid,
          createdAt: p.createdAt || p.created_at || p.createdat,
          paymentId: p.paymentId || p.payment_id || p.paymentid,
          status: p.status || 'pending',
          amount: p.amount || 0
        })));
      }
    } catch (err) {
      console.error('fetchPayments error:', err);
    }
  };

  const fetchSessions = async () => {
    let { data } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('userId', user.uid)
      .order('startTime', { ascending: false });

    if (!data || data.length === 0) {
      const { data: snakeData } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', user.uid)
        .order('start_time', { ascending: false });
      if (snakeData) data = snakeData;
    }

    if (data) setSessions(data.map(normalizeSession));
  };

  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedRecipients, selectedTeamId, activeTab]);

  const fetchMessages = async () => {
    try {
      const myTeamIds = teams.map(t => t.id);
      
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('timestamp', { ascending: true });
      
      if (data) {
        const mapped = data.map(normalizeMessage);
        const filtered = mapped.filter(m => {
          // My own sent messages
          if (m.senderId === user.uid) return true;
          // Messages sent directly to me
          if (m.receiverIds.includes(user.uid)) return true;
          // Team messages: teamId matches one of my teams
          if (m.teamId && myTeamIds.includes(m.teamId)) return true;
          // Team broadcast: has teamId + empty receiverIds (others' team messages)
          if (m.teamId && (!m.receiverIds || m.receiverIds.length === 0)) return true;
          return false;
        });
        setMessages(filtered);
        setTimeout(scrollToBottom, 100);
      } else if (error) {
        // Retry with created_at
        const { data: d2 } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
        if (d2) {
          const mapped = d2.map(normalizeMessage);
          const filtered = mapped.filter(m => {
            if (m.senderId === user.uid) return true;
            if (m.receiverIds.includes(user.uid)) return true;
            if (m.teamId && myTeamIds.includes(m.teamId)) return true;
            if (m.teamId && (!m.receiverIds || m.receiverIds.length === 0)) return true;
            return false;
          });
          setMessages(filtered);
          setTimeout(scrollToBottom, 100);
        }
      }
    } catch (e) { console.warn('fetchMessages failed:', e); }
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('displayName', { ascending: true });
    if (data) {
      const normalized = (data as any[]).map(u => ({
        ...u,
        displayName: u.displayName || u.display_name || u.name,
      }));
      setEmployees(normalized as UserProfile[]);
    }
  };

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .contains('memberIds', [user.uid])
        .order('name', { ascending: true });
      
      // Secondary check for alternate schema or team membership
      if (error || !data || data.length === 0) {
        const { data: data2 } = await supabase
          .from('teams')
          .select('*')
          .contains('member_ids', [user.uid])
          .order('name', { ascending: true });
        if (data2) setTeams(data2);
      } else {
        setTeams(data);
      }
      
      if (error && !error.message.includes('column')) console.warn('Teams table error (run DATABASE_FIX.md):', error.message);
    } catch (e) { console.warn('fetchTeams failed:', e); }
  };

  const fetchMessageRequests = async () => {
    const { data } = await supabase
      .from('message_requests')
      .select('*')
      .eq('senderId', user.uid);
    if (data) setMessageRequests(data as MessageRequest[]);
  };

  useEffect(() => {
    fetchActiveSession();
    fetchPayments();
    fetchSessions();
    fetchMessages();
    fetchEmployees();
    fetchTeams();
    fetchMessageRequests();

    // Set up real-time subscriptions
    const syncInterval = setInterval(() => {
      checkTodaySession(true);
    }, 10000);

    const cleanupChannel = (name: string) => {
      const existing = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
      if (existing) supabase.removeChannel(existing);
    };

    const sessionsChanName = `sessions-${user.uid}`;
    cleanupChannel(sessionsChanName);
    const sessionsSub = supabase
      .channel(sessionsChanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_sessions' }, (payload) => {
        const pNew = payload.new as any;
        const payloadUserId = pNew ? (pNew.userId || pNew.user_id || pNew.userid) : null;
        if (!payloadUserId || payloadUserId === user.uid) {
          fetchActiveSession();
          fetchSessions();
        }
      })
      .subscribe();

    const paymentsChanName = `payments-${user.uid}`;
    cleanupChannel(paymentsChanName);
    const paymentsSub = supabase
      .channel(paymentsChanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, (payload) => {
        const pNew = payload.new as any;
        const payloadUserId = pNew ? (pNew.userId || pNew.user_id || pNew.userid) : null;
        if (!payloadUserId || payloadUserId === user.uid) {
          fetchPayments();
        }
      })
      .subscribe();

    const messagesChanName = `messages-${user.uid}`;
    cleanupChannel(messagesChanName);
    const messagesSub = supabase
      .channel(messagesChanName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const pNew = payload.new as any;
        const senderId = pNew ? (pNew.senderId || pNew.sender_id || pNew.senderid) : null;
        if (senderId && senderId !== user.uid) playNotification();
        fetchMessages();
      })
      .subscribe();

    const teamsChanName = `teams-all`;
    cleanupChannel(teamsChanName);
    const teamsSub = supabase
      .channel(teamsChanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchTeams)
      .subscribe();

    const requestsChanName = `requests-emp-${user.uid}`;
    cleanupChannel(requestsChanName);
    const requestsSub = supabase
      .channel(requestsChanName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_requests' }, (payload) => {
        const pNew = payload.new as any;
        const senderId = pNew ? (pNew.senderId || pNew.sender_id || pNew.senderid) : null;
        if (!senderId || senderId === user.uid) {
          fetchMessageRequests();
        }
      })
      .subscribe();

    const alertsChanName = `alerts-emp-${user.uid}`;
    cleanupChannel(alertsChanName);
    const alertsSub = supabase
      .channel(alertsChanName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        playNotification();
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionsSub);
      supabase.removeChannel(paymentsSub);
      supabase.removeChannel(messagesSub);
      supabase.removeChannel(teamsSub);
      supabase.removeChannel(requestsSub);
      supabase.removeChannel(alertsSub);
      clearInterval(syncInterval);
    };
  }, [user.uid]);

  const markMessagesAsRead = useCallback(async () => {
    if (activeTab !== 'messages') return;
    
    // Find messages for current selection that are unread and not sent by me
    const unreadMessages = messages.filter(m => {
      const sId = m.senderId || m.sender_id || m.senderid;
      const isMe = sId === user.uid;
      if (isMe) return false;
      const readStatus = m.isRead || m.is_read || m.isread;
      if (readStatus) return false;

      if (selectedTeamId) {
        return (m.teamId === selectedTeamId || m.team_id === selectedTeamId || m.teamid === selectedTeamId);
      }
      if (selectedChatUser) {
        return (sId === selectedChatUser.uid);
      }
      return false;
    });

    if (unreadMessages.length > 0) {
      const ids = unreadMessages.map(m => m.id);
      try {
        await supabase.from('messages').update({ isRead: true }).in('id', ids);
      } catch (e) {
        try {
          await supabase.from('messages').update({ is_read: true }).in('id', ids);
        } catch (e2) {
          await supabase.from('messages').update({ isread: true }).in('id', ids);
        }
      }
    }
  }, [activeTab, selectedTeamId, selectedChatUser, messages, user.uid]);

  useEffect(() => {
    markMessagesAsRead();
  }, [activeTab, selectedTeamId, selectedChatUser, messages.length, markMessagesAsRead]);

  // Call Timer logic
  useEffect(() => {
    if (callStatus === 'connected' && showCallModal) {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callStatus, showCallModal]);

  const fetchAlerts = async () => {
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .eq('userId', user.uid)
      .order('timestamp', { ascending: false });
    if (data) setAlerts(data);
  };

  const fetchLeaves = useCallback(async () => {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('userId', user.uid)
      .eq('status', 'approved');
    
    if (data) {
      setApprovedLeaves(data);
      const today = format(new Date(), 'yyyy-MM-dd');
      const currentLeave = data.find((l: any) => today >= l.startDate && today <= l.endDate);
      if (currentLeave) {
        setIsOnLeave(true);
        setStatus('offline');
      }

      // Calculate paid leaves used this month
      const currentMonth = format(new Date(), 'yyyy-MM');
      const paidThisMonth = data.filter((l: any) => l.isPaid && l.startDate.startsWith(currentMonth)).length;
      setPaidLeavesRemaining(Math.max(0, 3 - paidThisMonth));
    }
  }, [user.uid]);

  useEffect(() => {
    fetchLeaves();

    // Fallback safety net: also listen directly on the leave_requests table for this
    // user, in case the 'leave-updated' broadcast is ever missed (e.g. tab was
    // backgrounded when the admin approved/rejected). This guarantees the employee's
    // access state catches up without needing a manual page refresh.
    const leaveChan = `leave-requests-${user.uid}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${leaveChan}`);
    if (existing) supabase.removeChannel(existing);
    const leaveSub = supabase
      .channel(leaveChan)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leave_requests',
        filter: `userId=eq.${user.uid}`
      }, () => {
        fetchLeaves();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leaveSub);
    };
  }, [fetchLeaves, user.uid]);

  const submitLeaveRequest = async () => {
    try {
      // Try with common column names to avoid schema cache issues
      const payload: any = {
        userId: user.uid,
        employeeName: user.displayName,
        startDate: leaveData.startDate,
        endDate: leaveData.endDate,
        reason: leaveData.reason,
        status: 'pending'
      };

      // Add code column with multiple possible names to be safe
      payload.employeeCode = user.specialCode;
      
      const { error } = await supabase.from('leave_requests').insert(payload);
      
      if (error && (error.message.includes('column') || error.message.includes('not exist'))) {
        delete payload.employeeCode;
        payload.employeecode = user.specialCode;
        await supabase.from('leave_requests').insert(payload);
      } else if (error) {
        throw error;
      }

      // Notify admin immediately: the admin dashboard listens for new INSERTs on the
      // 'alerts' table (plays a sound + refreshes its data the instant this lands),
      // so without this row the leave request just sat in 'leave_requests' silently
      // until the admin's next 10s poll cycle happened to catch it.
      try {
        await supabase.from('alerts').insert({
          userId: user.uid,
          employeeName: user.displayName,
          type: 'leave_request',
          timestamp: new Date().toISOString(),
          details: JSON.stringify({
            startDate: leaveData.startDate,
            endDate: leaveData.endDate,
            reason: leaveData.reason,
            message: `${user.displayName} requested leave from ${leaveData.startDate} to ${leaveData.endDate}.`
          }),
          status: 'new'
        });
      } catch (alertErr) {
        console.warn('Failed to send leave notification alert to admin:', alertErr);
      }

      alert('Leave request submitted successfully!');
      setShowLeaveModal(false);
    } catch (err: any) {
      alert(`Failed to submit leave request: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [user.uid]);

  // Security Pause Monitor: 15m for missing face, 30m for mismatch
  useEffect(() => {
    if (!session || status !== 'active') {
      setFaceMissingStartTime(null);
      setMismatchStartTime(null);
      setIsPausedBySecurity(false);
      return;
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      
      // Mandatory Screen Sharing for Work Calculation removed to allow standard tracking
      if (screenStreamRef.current) {
        setIsPausedBySecurity(false);
        setFaceMissingStartTime(null);
        setMismatchStartTime(null);
        // return; // Don't return, still verify face
      }

      // Track face detection for security alerts
      if (!faceDetected) {
        if (!faceMissingStartTime) {
          setFaceMissingStartTime(now);
        } else if (now - faceMissingStartTime > 15 * 60 * 1000) {
          setIsPausedBySecurity(true);
        }
      } else {
        setFaceMissingStartTime(null);
      }

      // Check Face Match (30 min grace)
      if (!isFaceMatched) {
        if (!mismatchStartTime) {
          setMismatchStartTime(now);
        } else if (now - mismatchStartTime > 30 * 60 * 1000) {
          setIsPausedBySecurity(true);
        }
      } else {
        setMismatchStartTime(null);
      }

      // If both conditions are cured, unpause
      if (faceDetected && isFaceMatched) {
        setIsPausedBySecurity(false);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [session, status, faceDetected, isFaceMatched, faceMissingStartTime, mismatchStartTime]);

  // Timer logic
  useEffect(() => {
    if (session) {
      timerRef.current = setInterval(() => {
        if (status === 'active' || status === 'away') {
          // Calculate work time ONLY if screen sharing is active
          if (!isPausedBySecurity && screenStream) {
            setElapsedTime(prev => prev + 1);
          }
        } else if (status === 'break') {
          setBreakElapsedTime(prev => prev + 1);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [session, status, isPausedBySecurity, screenStream]);

  // Real-time monitoring update to admin
  useEffect(() => {
    if (isMonitoringLive && status !== 'offline' && monitorChannelRef.current) {
      // Use a persistent interval that doesn't reset when elapsedTime changes
      const liveUpdateInterval = setInterval(() => {
        // We need to use the latest refs or state. 
        if (monitorChannelRef.current) {
          safeSend(monitorChannelRef.current, 'live-stats-update', {
            elapsedTime: elapsedTimeRef.current,
            breakElapsedTime: breakElapsedTimeRef.current,
            todayEarnings: todayEarningsRef.current,
            status: statusRef.current,
            isVerified: isVerifiedRef.current,
            isFaceMatched: isFaceMatchedRef.current,
            faceDetected: faceDetectedRef.current,
            isPausedBySecurity: isPausedBySecurityRef.current
          });
        }
      }, 2000); // Send every 2 seconds for smooth UI
      return () => clearInterval(liveUpdateInterval);
    }
  }, [isMonitoringLive, status !== 'offline']); // Only re-run when monitoring status or online status changes

  // Auto-logout logic: standardWorkingHours + 2 hours (+ any extra overtime employee requested, paid 2x)
  useEffect(() => {
    if (session && status === 'active') {
      const baseMaxSeconds = ((user.standardWorkingHours || 8) + 2) * 3600;
      const maxSeconds = baseMaxSeconds + (overtimeExtraMinutes * 60);

      // In the LAST 1 HOUR before the cutoff, let the employee request extra
      // overtime (paid 2x) if they need it, instead of getting cut off.
      if (!overtimePromptShown && !showOvertimeModal && elapsedTime >= baseMaxSeconds - 3600 && elapsedTime < baseMaxSeconds) {
        setShowOvertimeModal(true);
        setOvertimePromptShown(true);
      }

      if (elapsedTime >= maxSeconds) {
        stopWork().then(() => {
          onLogout();
          const extraMsg = overtimeExtraMinutes > 0 ? ` (including ${overtimeExtraMinutes} min of requested overtime @ 2x pay)` : '';
          alert(`Session ended automatically after ${(maxSeconds / 3600).toFixed(1)} hours${extraMsg}.`);
        });
      }
    }
  }, [elapsedTime, session, status, user.standardWorkingHours, overtimeExtraMinutes, overtimePromptShown, showOvertimeModal]);

  // Persist overtime request best-effort onto the session row (ignored if column doesn't exist)
  const requestOvertime = async (minutes: number) => {
    setOvertimeExtraMinutes(minutes);
    setShowOvertimeModal(false);
    if (sessionRef.current?.id) {
      try {
        await supabase.from('work_sessions').update({ overtimeMinutes: minutes }).eq('id', sessionRef.current.id);
      } catch (e) {
        try {
          await supabase.from('work_sessions').update({ overtime_minutes: minutes }).eq('id', sessionRef.current.id);
        } catch (e2) { /* column may not exist yet - ignore, feature still works client-side */ }
      }
    }
  };

  // Periodic sync to database
  useEffect(() => {
    if (session && status !== 'offline') {
      const syncInterval = setInterval(async () => {
        if (!sessionRef.current?.id) return;
        
        const workMins = Math.floor(elapsedTimeRef.current / 60);
        const breakMins = Math.floor(breakElapsedTimeRef.current / 60);

        try {
          // Use standard columns first
          const { error } = await supabase.from('work_sessions').update({
            totalWorkMinutes: workMins,
            totalBreakMinutes: breakMins,
            lastHeartbeat: new Date().toISOString()
          }).eq('id', sessionRef.current.id);
          
          if (error && (error.message.includes('column') || error.message.includes('not exist'))) {
             // Fallback to snake_case
             await supabase.from('work_sessions').update({
               total_work_minutes: workMins,
               total_break_minutes: breakMins,
               last_heartbeat: new Date().toISOString()
             }).eq('id', sessionRef.current.id);
          }
        } catch (e) {}
      }, 60000); // Sync every minute
      return () => clearInterval(syncInterval);
    }
  }, [session?.id, status !== 'offline']); // Only restart if session ID or offline status changes

  const safeFormatDate = (date: any, formatStr: string) => {
    if (!date) return 'N/A';
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      return format(d, formatStr);
    } catch (e) {
      return 'N/A';
    }
  };

  const startWork = async () => {
    setIsStartingWork(true);
    setConfirmModal(prev => ({ ...prev, loading: true }));
    setIsPausedBySecurity(false);
    setFaceMissingStartTime(null);
    setMismatchStartTime(null);

    try {
      // Reset timers for new session
      setElapsedTime(0);
      setBreakElapsedTime(0);
      setIsCameraOn(true); // Ensure camera is ON for new session

      const startTime = new Date().toISOString();
      const date = getWorkDay();

      // Strategy: Try multiple field name patterns
      const sessionVariants = [
        {
          userId: user.uid,
          startTime: startTime,
          totalWorkMinutes: 0,
          totalBreakMinutes: 0,
          status: 'active',
          date: date
        },
        {
          userid: user.uid,
          starttime: startTime,
          totalworkminutes: 0,
          totalbreakminutes: 0,
          status: 'active',
          date: date
        },
        {
          user_id: user.uid,
          start_time: startTime,
          total_work_minutes: 0,
          total_break_minutes: 0,
          status: 'active',
          date: date
        }
      ];

      let lastError = null;
      let successData = null;

      for (const table of ['work_sessions', 'sessions']) {
        for (const variant of sessionVariants) {
          try {
            const { data, error } = await supabase.from(table).insert(variant).select().single();
            if (data) {
              successData = data;
              break;
            }
            if (error) {
              lastError = error;
              if (!error.message.includes('column') && !error.message.includes('not exist')) {
                break;
              }
            }
          } catch (e: any) {
            lastError = e;
          }
        }
        if (successData) break;
      }
      
      if (successData) {
        const normalized = normalizeSession(successData);
        // Try updating user status - also with resilience
        try {
          await supabase.from('users').update({ status: 'active' }).eq('uid', user.uid);
        } catch (_) {
          // If uid fails, try id
          await supabase.from('users').update({ status: 'active' }).eq('id', user.uid);
        }
        setSession(normalized);
        setStatus('active');
      } else {
        throw lastError || new Error('All naming conventions failed');
      }
    } catch (err: any) {
      console.error('Final session start error:', err);
      alert(`Failed to start work session: ${err.message || 'Unknown error'}`);
    } finally {
      setIsStartingWork(false);
      setConfirmModal(prev => ({ ...prev, show: false, loading: false }));
    }
  };

  const stopWork = async () => {
    if (!session?.id || isEndingSession) return;
    setIsEndingSession(true);
    const endTime = new Date().toISOString();
    const workMinutes = Math.floor(elapsedTime / 60);
    const breakMinutes = Math.floor(breakElapsedTime / 60);
    
    // Stop camera, screen, all media immediately
    setIsCameraOn(false);
    setIsVerified(false);
    setIsVerifyingNow(false);
    setStatus('offline'); // CRITICAL: Stop the tracking loop
    
    // Force-stop ALL video tracks on DOM elements (catches FaceTracker internal stream)
    document.querySelectorAll('video, audio').forEach((el) => {
      const src = (el as HTMLVideoElement).srcObject as MediaStream | null;
      if (src) { src.getTracks().forEach(t => t.stop()); (el as HTMLVideoElement).srcObject = null; }
    });
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach(t => t.stop());
      liveStreamRef.current = null;
    }
    if (liveScreenStreamRef.current) {
      liveScreenStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);

    const payload = {
      status: 'completed',
      endTime,
      totalWorkMinutes: workMinutes,
      totalBreakMinutes: breakMinutes
    };

    const snakePayload = {
      status: 'completed',
      end_time: endTime,
      total_work_minutes: workMinutes,
      total_break_minutes: breakMinutes
    };

    // Try both work_sessions and sessions names for compatibility
    const tables = ['work_sessions', 'sessions'];
    let success = false;
    let lastError = null;

    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).update(payload).eq('id', session.id);
        if (!error) {
          success = true;
          break;
        }
        
        if (error.message.includes('column') || error.message.includes('not exist')) {
          await supabase.from(table).update(snakePayload).eq('id', session.id);
          success = true;
          break;
        }
        lastError = error;
      } catch (e) {
        lastError = e;
      }
    }

    if (success) {
      console.log('Session DB update successful');
    } else {
      console.error('Final attempt to end session failed:', lastError);
    }
    
    // Reset ALL session-related state immediately
    setSession(null);
    setStatus('offline');
    setHasSessionToday(true);
    setIsVerified(false);
    localStorage.removeItem(`verified_${user.uid}_${getWorkDay()}`);
    localStorage.setItem(`last_end_${user.uid}`, endTime);
    
    // Reset approval status so employee must request again for any additional session
    const userStatusPayload = { 
      status: 'offline',
      cameraSnapshotUrl: null,
      screenSnapshotUrl: null,
      lastActive: new Date().toISOString(),
      lastSessionEndTime: endTime,
      sessionApprovalStatus: 'none',
      isMonitoringLive: false // Ensure monitoring stops on session end
    };
    const userStatusSnakePayload = {
      status: 'offline',
      camera_snapshot_url: null,
      screen_snapshot_url: null,
      last_active: new Date().toISOString(),
      last_session_end_time: endTime,
      session_approval_status: 'none'
    };

    try {
      await supabase.from('users').update({ isMonitoringLive: false }).eq('uid', user.uid);
    } catch (e) {}

    setSessionApprovalStatus('none');
    
    // Clear flag after a short delay to allow DB sync/consistency
    setTimeout(() => setIsEndingSession(false), 3000);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getFullWorkDaySeconds = () => {
    return (baseCompletedWorkMinutes * 60) + elapsedTime;
  };

  const getFullBreakDaySeconds = () => {
    return (baseCompletedBreakMinutes * 60) + breakElapsedTime;
  };

  const handleStatusChange = useCallback(async (newStatus: UserStatus) => {
    if (statusRef.current === newStatus) return;

    console.log(`Transitioning status: ${statusRef.current} -> ${newStatus}`);

    // Update status in users table
    try {
      await supabase.from('users').update({ status: newStatus }).eq('uid', user.uid);
    } catch (e) {
      console.error('Failed to update user status:', e);
    }

    // Save progress if we have an active session
    if (sessionRef.current?.id) {
      const workMins = Math.floor(elapsedTimeRef.current / 60);
      const breakMins = Math.floor(breakElapsedTimeRef.current / 60);
      
      const updateData: any = {
        totalWorkMinutes: workMins,
        totalBreakMinutes: breakMins
      };
      
      // Update status globally if it's changing
      if (newStatus !== 'offline') {
        updateData.status = newStatus;
      }

      // Eagerly update local session state to avoid flashes and truncation before re-fetch
      setSession(prev => prev ? { 
        ...prev, 
        status: newStatus,
        totalWorkMinutes: workMins,
        totalBreakMinutes: breakMins 
      } : null);

      try {
        const tables = ['work_sessions', 'sessions'];
        let updateDone = false;
        for (const table of tables) {
          const { error } = await supabase.from(table).update(updateData).eq('id', sessionRef.current.id);
          if (!error) {
            updateDone = true;
            break;
          }
          if (error && (error.message.includes('column') || error.message.includes('not exist'))) {
            const snakeData: any = {
              total_work_minutes: workMins,
              total_break_minutes: breakMins,
              status: newStatus !== 'offline' ? newStatus : undefined
            };
            const { error: error2 } = await supabase.from(table).update(snakeData).eq('id', sessionRef.current.id);
            if (!error2) {
              updateDone = true;
              break;
            }
          }
        }
      } catch (e) {
        console.error('Failed to update session progress:', e);
      }
    }

    setStatus(newStatus);
  }, [user.uid]);

  const toggleBreak = async () => {
    const newStatus: UserStatus = status === 'break' ? 'active' : 'break';
    
    if (newStatus === 'break') {
      // PROPER PRIVACY: Stop signaling but keep camera ON as requested
      stopLiveWebRTC();
      // setIsCameraOn(false); 
      
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        setScreenStream(null);
      }
      
      // DO NOT stop camera tracks here to ensure "Face Detected" and local preview continue
      // if (liveStreamRef.current) {
      //   liveStreamRef.current.getTracks().forEach(t => t.stop());
      //   liveStreamRef.current = null;
      // }
      
      if (liveScreenStreamRef.current) {
        if (liveScreenStreamRef.current !== screenStreamRef.current) {
           liveScreenStreamRef.current.getTracks().forEach(t => t.stop());
        }
        liveScreenStreamRef.current = null;
      }

      // Notify admin explicitly for privacy
      if (monitorChannelRef.current) {
        safeSend(monitorChannelRef.current, 'monitor-error', { message: 'Employee is on break - Feed disabled for privacy' });
      }
    } else {
      // Re-enable camera on return from break
      setIsCameraOn(true);
    }

    await handleStatusChange(newStatus);
  };

  const joinTeam = async () => {
    if (!joinCode.trim()) return;
    setIsJoining(true);
    try {
      const { data: team, error: fetchError } = await supabase
        .from('teams')
        .select('*')
        .eq('uniqueCode', joinCode.trim().toUpperCase())
        .single();
      
      if (fetchError || !team) throw new Error('Invalid team code');
      
      if (team.memberIds.includes(user.uid)) {
        alert('You are already a member of this team');
        return;
      }
      
      const { error: updateError } = await supabase
        .from('teams')
        .update({
          memberIds: [...team.memberIds, user.uid]
        })
        .eq('id', team.id);
      
      if (updateError) throw updateError;
      
      alert(`Successfully joined ${team.name}!`);
      setJoinCode('');
      fetchTeams();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsJoining(false);
    }
  };

  const requestMessaging = async (recipient: UserProfile) => {
    if (!user) return;
    setIsRequestingMessaging(true);
    try {
      const newRequest: any = {
        senderId: user.uid,
        senderName: user.displayName,
        receiverId: recipient.uid,
        receiverName: recipient.displayName,
        status: 'pending',
        timestamp: new Date().toISOString()
      };
      const { error } = await supabase.from('message_requests').insert(newRequest);
      if (error) throw error;
      alert('Messaging request sent to admin for approval!');
      setShowRequestModal(false);
    } catch (err: any) {
      alert(`Failed to send request: ${err.message}`);
    } finally {
      setIsRequestingMessaging(false);
    }
  };

  const canMessage = (recipientId: string) => {
    if (!user.isApprovedForMessaging && !['admin', 'ceo', 'F', 'hr'].includes(recipientId)) return false;
    if (['admin', 'ceo', 'F', 'hr'].includes(recipientId)) return true;
    const recipient = employees.find(e => e.uid === recipientId);
    if (!recipient) return false;
    
    // Can message if in same team or same position
    if (recipient.team_id === user?.team_id || recipient.position === user?.position) return true;
    
    // Or if approved by admin
    return messageRequests.some(r => r.receiverId === recipientId && r.status === 'approved');
  };
  const sendMessage = async () => {
    if ((!newMessage.trim() && !attachment) || (selectedRecipients.length === 0 && !selectedTeamId)) return;

    // Try camelCase column names first (DATABASE_SETUP.md schema)
    const msgPayload: any = {
      senderId: user.uid,
      senderName: user.displayName,
      receiverIds: selectedTeamId ? [] : selectedRecipients,
      teamId: selectedTeamId || null,
      content: newMessage,
      attachmentUrl: attachment?.url || null,
      attachmentType: attachment?.type || null,
      attachmentName: attachment?.name || null,
      timestamp: new Date().toISOString(),
      isRead: false,
      category: selectedRecipients.includes('admin') && selectedChatUser?.uid === 'admin' ? 'support' : 'general'
    };

    const res = await supabase.from('messages').insert(msgPayload).select();
    let insertData = res.data;
    let error = res.error;

    if (error) {
      const errMsg = error.message?.toLowerCase() || '';
      // If camelCase cols fail, try snake_case fallback
      if (errMsg.includes('column') || errMsg.includes('schema')) {
        const snakePayload: any = {
          sender_id: user.uid,
          sender_name: user.displayName,
          receiver_ids: selectedTeamId ? [] : selectedRecipients,
          team_id: selectedTeamId || null,
          content: newMessage,
          attachment_url: attachment?.url || null,
          attachment_type: attachment?.type || null,
          attachment_name: attachment?.name || null,
          timestamp: new Date().toISOString(),
          is_read: false,
          category: selectedRecipients.includes('admin') && selectedChatUser?.uid === 'admin' ? 'support' : 'general'
        };
        const res2 = await supabase.from('messages').insert(snakePayload).select();
        error = res2.error;
        insertData = res2.data;
        if (error) {
          const lowerPayload: any = {
            senderid: user.uid,
            sendername: user.displayName,
            receiverids: selectedTeamId ? [] : selectedRecipients,
            teamid: selectedTeamId || null,
            content: newMessage,
            attachmenturl: attachment?.url || null,
            attachmenttype: attachment?.type || null,
            attachmentname: attachment?.name || null,
            timestamp: new Date().toISOString(),
            isread: false,
            category: selectedRecipients.includes('admin') && selectedChatUser?.uid === 'admin' ? 'support' : 'general'
          };
          const res3 = await supabase.from('messages').insert(lowerPayload).select();
          error = res3.error;
          insertData = res3.data;
          
          if (error && (error.message?.toLowerCase().includes('category') || error.message?.toLowerCase().includes('schema cache'))) {
            // Last ditch: try without category column
            const noCategoryPayload = { ...lowerPayload };
            delete noCategoryPayload.category;
            const res4 = await supabase.from('messages').insert(noCategoryPayload).select();
            error = res4.error;
            insertData = res4.data;
          }
        }
      }
    }

    if (!error) {
      if (insertData && insertData.length > 0) {
        const norm = normalizeMessage(insertData[0]);
        setMessages(prev => {
          if (prev.find(m => m.id === norm.id)) return prev;
          return [...prev, norm].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
      }
      setNewMessage('');
      setAttachment(null);
      setTimeout(scrollToBottom, 100);
    } else {
      console.error('Message send failed:', error.message);
      const isMissingTable = error.message?.includes('Could not find the table') || error.message?.includes('schema cache') || 
                             (error.message?.includes('relation') && error.message?.includes('does not exist') && error.message?.includes('messages'));
      if (isMissingTable) {
        alert('The "messages" table is missing. Please run SQL in DATABASE_FIX.md.');
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileName = `chat-${user.uid}-${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('face-photos') // Unified bucket names
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('face-photos')
        .getPublicUrl(fileName);

      setAttachment({
        url: publicUrl,
        type: file.type,
        name: file.name
      });
    } catch (err: any) {
      console.error('Upload error:', err);
      if (err.message?.includes('Bucket not found')) {
        alert('The "face-photos" bucket was not found. Please create it in Supabase Storage and set it to Public (see DATABASE_FIX.md).');
      } else {
        alert(`Failed to upload file: ${err.message}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const clearChat = async () => {
    if (!confirm('Are you sure you want to clear this chat for everyone? This will delete all messages in this conversation.')) return;

    try {
      let query = supabase.from('messages').delete();
      
      if (selectedTeamId) {
        query = query.eq('teamId', selectedTeamId);
      } else {
        const recipientId = selectedRecipients[0];
        query = query.or(`and(senderId.eq.${user.uid},receiverIds.cs.{"${recipientId}"}),and(senderId.eq.${recipientId},receiverIds.cs.{"${user.uid}"})`);
      }

      const { error } = await query;
      if (error) throw error;
      
      setMessages([]);
      alert('Chat cleared successfully!');
    } catch (err: any) {
      alert(`Failed to clear chat: ${err.message}`);
    }
  };

  const startCall = async (type: 'voice' | 'video') => {
    if (selectedRecipients.length === 0) return;
    const targetId = selectedRecipients[0];
    
    setIsInCall(true);
    setCallType(type);
    setShowCallModal(true);
    setCallStatus('calling');
    setCallDuration(0);
    playRingbackTone();
    
    try {
      let stream: MediaStream;
      let actualType = type;
      
      try {
        // First try: video + audio as requested
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: type === 'video', 
          audio: true 
        });
      } catch (mediaErr: any) {
        // Second try: audio only (if video failed or was requested as video)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          actualType = 'voice';
          setCallType('voice');
          setIsVideoOff(true);
        } catch (audioErr: any) {
          // Third try: use existing camera stream from FaceTracker if available
          const existingStream = callStreamRef.current;
          if (existingStream && existingStream.active && existingStream.getTracks().some(t => t.readyState === 'live')) {
            stream = existingStream;
            actualType = 'voice';
            setCallType('voice');
          } else {
            // Last resort: create a silent audio stream so call can still connect
            try {
              const ctx = new AudioContext();
              const dest = ctx.createMediaStreamDestination();
              stream = dest.stream;
              actualType = 'voice';
              setCallType('voice');
              setIsVideoOff(true);
            } catch {
              throw audioErr; // truly nothing works, surface the error
            }
          }
        }
      }

      callStreamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      });
      callPeerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          oneShotSend(`calls:${targetId}`, 'webrtc-call-ice', event.candidate);
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
          stopRingbackTone();
        }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') endCall();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      oneShotSend(`calls:${targetId}`, 'incoming-call', {
        fromName: user.displayName,
        fromId: user.uid,
        type: actualType,
        offer: offer
      });

    } catch (err: any) {
      stopRingbackTone();
      const isPermissionError = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.toLowerCase().includes('denied');
      if (isPermissionError) {
        alert('Microphone access denied. Please enable microphone permissions in browser settings to make calls.');
      } else {
        console.error('Call error:', err);
        alert('Failed to start call. Please check your microphone/camera permissions.');
      }
      setShowCallModal(false);
      setIsInCall(false);
    }
  };

   // handleIncomingOffer is replaced by unified handleIncomingCall

  const toggleScreenShareInCall = async () => {
    if (isScreenSharingInCall) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setIsScreenSharingInCall(false);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        if (callPeerConnectionRef.current) {
          const videoSender = callPeerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(stream.getVideoTracks()[0]);
          }
        }
        // Stop the screen stream tracks
        if (localStream) {
          localStream.getTracks().forEach(t => t.stop());
        }
        setLocalStream(stream);
      } catch (err) {
        console.error('Error switching back to camera:', err);
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharingInCall(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        if (callPeerConnectionRef.current) {
          const videoSender = callPeerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(stream.getVideoTracks()[0]);
          }
        }

        // INTEGRATION: Link call screen share to main work session timer
        setScreenStream(stream);
        screenStreamRef.current = stream;

        stream.getVideoTracks()[0].onended = () => {
          if (isScreenSharingInCall) toggleScreenShareInCall();
        };
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  };

  const downloadPayslip = (payment: PaymentRecord) => {
    const doc = new jsPDF();
    
    // Header with "Graphics"
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('8gen Technology', 20, 25);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Official Salary Statement', 150, 25);

    // Content
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.text('Employee Details:', 20, 60);
    doc.setFont('helvetica', 'bold');
    doc.text(`${user.displayName}`, 20, 70);
    doc.setFont('helvetica', 'normal');
    doc.text(`${user.email}`, 20, 75);
    doc.text(`Special Code: ${user.specialCode}`, 20, 80);

    doc.text('Payment Summary:', 120, 60);
    doc.rect(120, 65, 70, 30);
    doc.text(`Amount:`, 125, 75);
    doc.setFontSize(16);
    doc.text(`INR ${payment.amount.toLocaleString()}`, 125, 85);

    doc.setFontSize(12);
    doc.text('Period:', 20, 100);
    doc.text(`${payment.periodStart} to ${payment.periodEnd}`, 20, 110);

    doc.text('Status:', 120, 100);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text(`${payment.status.toUpperCase()}`, 120, 110);

    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFontSize(10);
    doc.text('This is a computer-generated document. No signature required.', 20, 140);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 20, 145);

    doc.save(`Payslip_8gen_${payment.periodStart}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden selection:bg-blue-500/30 selection:text-blue-200">
      {isOnLeave && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[1000] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 bg-blue-600/20 text-blue-400 rounded-[2rem] flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/20 border border-blue-500/20">
            <CalendarOff size={48} />
          </div>
          <h1 className="text-5xl font-black text-white mb-4 tracking-tighter">YOU ARE ON LEAVE</h1>
          <p className="text-slate-400 max-w-sm leading-relaxed mb-8 font-medium">
            Your approved leave is currently active. All work sessions and dashboard controls have been disabled to ensure your time off is respected.
          </p>
          <div className="bg-slate-900 border border-slate-800 px-8 py-4 rounded-3xl flex items-center gap-3 shadow-2xl">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm font-black text-slate-200 uppercase tracking-widest">Active Leave Period</span>
          </div>
        </div>
      )}
      <div className="text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Tracking & Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="text-blue-500" /> Live Tracking
              </h2>
              {isPausedBySecurity && status !== 'break' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 animate-pulse">
                  <div className="flex items-center gap-2 text-red-500 mb-1">
                    <ShieldAlert size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Tracking Paused</span>
                  </div>
                  <p className="text-[9px] text-red-400 leading-tight">Face missing or mismatch duration exceeded grace periods. Please ensure your face is visible to resume tracking.</p>
                </div>
              )}
              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                status === 'active' ? 'bg-green-500/20 text-green-400' :
                status === 'break' ? 'bg-yellow-500/20 text-yellow-400' :
                status === 'away' ? 'bg-orange-500/20 text-orange-400' :
                'bg-slate-700 text-slate-400'
              }`}>
                {status} {status !== 'offline' && status !== 'ready' && `(${formatTime(status === 'break' ? breakElapsedTime : elapsedTime)})`}
              </div>
            </div>

            {isCheckingSession ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Checking Session Status...</p>
              </div>
            ) : (
              <>
                {hasSessionToday && !session && sessionApprovalStatus !== 'approved' && (
                  <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                    <p className="text-xs font-bold text-yellow-500 flex items-center gap-2">
                      <AlertCircle size={14} /> Daily Session Completed
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      You have already completed a session today. Admin authorization is required to start another.
                    </p>
                    {sessionApprovalStatus === 'none' ? (
                      <button
                        onClick={() => requestSessionApproval()}
                        className="mt-3 w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-xl transition-all"
                      >
                        Request Authorization
                      </button>
                    ) : sessionApprovalStatus === 'rejected' ? (
                      <div className="mt-3 space-y-2">
                        <div className="py-2 bg-red-500/10 text-red-400 text-xs font-bold rounded-xl text-center border border-red-500/20">
                          Request Rejected by Admin
                        </div>
                        <button
                          onClick={() => requestSessionApproval()}
                          className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded-xl transition-all"
                        >
                          Request Again
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 py-2 bg-slate-800 text-slate-400 text-xs font-bold rounded-xl text-center flex items-center justify-center gap-2">
                        <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                        Authorization Pending...
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Today's Work</p>
                    <p className="text-xl font-black text-white font-mono">{formatTime(todayTotalWorkSeconds)}</p>
                    {status === 'active' && (
                      <p className="text-[10px] text-blue-400 font-bold mt-1">Session: {formatTime(elapsedTime)}</p>
                    )}
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Today's Break</p>
                    <p className="text-xl font-black text-yellow-400 font-mono">{formatTime(todayTotalBreakSeconds)}</p>
                    {status === 'break' && (
                      <p className="text-[10px] text-yellow-600 font-bold mt-1">Session: {formatTime(breakElapsedTime)}</p>
                    )}
                  </div>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 mb-6">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Today's Earnings</p>
                  <p className="text-2xl font-black text-green-400 font-mono">₹{todayEarnings}</p>
                </div>

                {/* Always mount FaceTracker to prevent re-initialization flashes, control visibility and active state via props */}
                <div className={`mb-6 space-y-4 ${!(status !== 'offline' || isVerifyingNow || isVerified) ? 'hidden' : 'block'}`}>
                  <FaceTracker 
                    user={user} 
                    status={status}
                    onStatusChange={handleStatusChange} 
                    onVerified={handleVerified}
                    onFaceMatchChange={handleFaceMatchChange}
                    onFaceDetectedChange={handleFaceDetectedChange}
                    onStreamReady={handleStreamReady}
                    isCameraOn={isCameraOn && (status !== 'offline' || isVerifyingNow || isVerified)}
                    isVerified={isVerified}
                  />
                </div>
                
                {(status !== 'offline' || isVerifyingNow || isVerified) && status !== 'offline' && (
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        if (isCameraOn) {
                          setIsCameraOn(false);
                        } else {
                          setIsCameraOn(true);
                        }
                      }}
                      disabled={isStartingWork}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
                        isCameraOn ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 shadow-slate-900/50' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/30'
                      } disabled:opacity-50`}
                    >
                      {isCameraOn ? <VideoOff size={18} /> : <Video size={18} />}
                      {isCameraOn ? 'Stop Camera' : 'Start Camera'}
                    </button>

                    {screenStream ? (
                      <button
                        onClick={stopScreenShare}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white transition-all shadow-lg active:scale-95 border border-red-600/20"
                      >
                        <XCircle size={18} />
                        Stop Screen Share
                      </button>
                    ) : (
                      <button
                        onClick={startScreenShare}
                        disabled={!isVerified}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${
                          !isVerified 
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                          : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/30'
                        }`}
                      >
                        <Monitor size={18} />
                        {isVerified ? 'Share Screen' : 'Verify to Share'}
                      </button>
                    )}

                    {!screenStream && (
                      <div className="space-y-2">
                        <button 
                          onClick={() => window.open(window.location.href, '_blank')}
                          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 transition-all"
                        >
                          <ExternalLink size={14} /> Open in New Tab to Share
                        </button>
                        {!isScreenShareSupported && (
                          <p className="text-[10px] text-center text-slate-500 px-2">
                            Note: Screen sharing requires a secure context and may be restricted in some views.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {showIdleWarning && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 animate-bounce">
                    <MousePointer className="text-red-500" />
                    <p className="text-xs text-red-400 font-bold">Idle Warning: Please move your mouse to stay active!</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-3">
              {status === 'offline' ? (
                <div className="space-y-3">
                  {!isVerified && user.faceDescriptor ? (
                        <button
                          onClick={() => {
                            setIsVerifyingNow(true);
                            setIsCameraOn(true);
                          }}
                          className={`w-full flex items-center justify-center gap-4 font-black py-6 rounded-[2.5rem] transition-all active:scale-95 shadow-2xl uppercase tracking-[0.2em] text-[10px] border-2 ${
                            isVerifyingNow 
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700'
                            : 'bg-amber-500/10 text-amber-500 border-amber-500/50 hover:bg-amber-500 hover:text-white shadow-amber-500/20'
                          }`}
                          disabled={isVerifyingNow}
                        >
                          {isVerifyingNow ? (
                            <div className="flex items-center gap-3">
                              <Loader2 size={22} className="animate-spin text-amber-500" />
                              <span>Verifying Identity...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <ShieldAlert size={22} className="text-amber-500" />
                              <span>Verify Yourself</span>
                            </div>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            handleStartWorkClick(true);
                          }}
                          className={`w-full flex items-center justify-center gap-4 font-black py-6 rounded-[2.5rem] transition-all active:scale-95 shadow-2xl uppercase tracking-[0.2em] text-[10px] border-2 bg-blue-600 text-white border-blue-500 shadow-blue-600/30 hover:bg-blue-500`}
                        >
                          <div className="flex items-center gap-3">
                            <Play fill="currentColor" size={22} />
                            <span>Start Work Session</span>
                          </div>
                        </button>
                      )}
                      

                    </div>
                  ) : (
                <>
                  {!isVerified && user.faceDescriptor ? (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-center space-y-3">
                      <p className="text-sm text-blue-400 font-bold">Verification Required</p>
                      <p className="text-xs text-slate-500 mt-1">Please use the camera above to verify your identity.</p>
                      <button
                        onClick={() => {
                          setIsVerifyingNow(true);
                          setIsCameraOn(true);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                      >
                        Verify Now
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={toggleBreak}
                        className={`flex items-center justify-center gap-2 font-bold py-4 rounded-2xl transition-all active:scale-95 ${
                          status === 'break' 
                          ? 'bg-green-600/20 text-green-400 border border-green-600/30' 
                          : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'
                        }`}
                      >
                        {status === 'break' ? <Play size={20} /> : <Pause size={20} />}
                        {status === 'break' ? 'Resume' : 'Break'}
                      </button>
                      <button
                        onClick={stopWork}
                        className="flex items-center justify-center gap-2 bg-red-600/20 text-red-400 border border-red-600/30 font-bold py-4 rounded-2xl transition-all active:scale-95"
                      >
                        <LogOut size={20} /> End Session
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Stats Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div onClick={() => setActiveTab('history')} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-5 hover:border-blue-500/50 transition-all cursor-pointer group hover:shadow-2xl hover:shadow-blue-500/10">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-black text-white font-mono leading-tight">
                        {formatTime(getFullWorkDaySeconds())}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold leading-tight">Total Work<br/>(Today)</p>
                    </div>
                    <Clock className="text-blue-500/50 w-7 h-7 flex-shrink-0 transition-transform group-hover:scale-110" />
                  </div>
                </div>

                <div onClick={() => setActiveTab('history')} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-5 hover:border-yellow-500/50 transition-all cursor-pointer group hover:shadow-2xl hover:shadow-yellow-500/10">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-lg font-black text-yellow-500 font-mono leading-tight">
                        {formatTime(getFullBreakDaySeconds())}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold leading-tight">Total Break<br/>(Today)</p>
                    </div>
                    <Pause className="text-yellow-500/50 w-7 h-7 flex-shrink-0 transition-transform group-hover:scale-110" />
                  </div>
                </div>
            </div>
        </div>

        {/* Right Column: Payments & History */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {(user.facePhotoUrl || user.face_photo_url) ? (
                <img 
                  src={user.facePhotoUrl || user.face_photo_url} 
                  alt={user.displayName || user.name} 
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500/30"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border-2 border-blue-500/30">
                  <Users size={32} />
                </div>
              )}
              <div>
                <h1 className="text-3xl font-black tracking-tight">Welcome, {user.displayName || user.name}</h1>
                <p className="text-slate-400 text-sm font-medium">
                  {user.position || 'Employee'} • {user.role.toUpperCase()}
                  {user.team_id && ` • Team: ${user.team_id}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
              {['tracking', 'history', 'payments', 'messages', 'meetings'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex-shrink-0 ${
                    activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {tab === 'meetings' ? 'Microsoft Teams' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
              <button 
                onClick={() => setShowLeaveModal(true)}
                className="p-2.5 bg-purple-600/10 hover:bg-purple-600 text-purple-500 hover:text-white rounded-xl transition-all border border-purple-500/20"
                title="Request Leave"
              >
                <Calendar size={20} />
              </button>
              <button 
                onClick={() => setShowNotificationCenter(true)}
                className="relative p-2 text-slate-400 hover:text-white transition-colors"
              >
                <Bell size={20} />
                {alerts.filter(a => a.status === 'new').length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-950" />
                )}
              </button>
              <button 
                onClick={handleLogoutClick}
                className="ml-4 flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-xl text-sm font-bold transition-all border border-red-500/20"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </div>

          {activeTab === 'meetings' && (
            <div className="h-[calc(100vh-20rem)] min-h-[600px] flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Microsoft Teams Integration</h2>
                  <p className="text-slate-400 text-sm">Collaborate with your team using Microsoft Teams</p>
                </div>
                <div className="flex items-center gap-3">
                  <a 
                    href="https://teams.microsoft.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-[#444791] hover:bg-[#3b3e7a] text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-[#444791]/20 active:scale-95"
                  >
                    <Video size={20} /> Launch Teams Web
                  </a>
                </div>
              </div>
              
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center p-12 text-center">
                <div className="w-24 h-24 bg-[#444791]/20 rounded-[2rem] flex items-center justify-center text-[#444791] mb-8">
                  <Video size={48} />
                </div>
                <h3 className="text-2xl font-bold mb-4">Microsoft Teams</h3>
                <p className="text-slate-400 max-w-md mb-8">
                  Microsoft Teams integration is active. You can start meetings, chat with colleagues, and collaborate in real-time.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                  <button 
                    onClick={() => window.open('https://teams.microsoft.com/l/meeting/new', '_blank')}
                    className="p-6 bg-slate-950 border border-slate-800 rounded-3xl hover:border-[#444791] transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-[#444791]/10 rounded-xl flex items-center justify-center text-[#444791] mb-4 group-hover:scale-110 transition-transform">
                      <Plus size={24} />
                    </div>
                    <h4 className="font-bold mb-1">Schedule Meeting</h4>
                    <p className="text-xs text-slate-500">Create a new meeting link for your team</p>
                  </button>
                  <button 
                    onClick={() => window.open('https://teams.microsoft.com/l/chat/0/0', '_blank')}
                    className="p-6 bg-slate-950 border border-slate-800 rounded-3xl hover:border-[#444791] transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-[#444791]/10 rounded-xl flex items-center justify-center text-[#444791] mb-4 group-hover:scale-110 transition-transform">
                      <MessageSquare size={24} />
                    </div>
                    <h4 className="font-bold mb-1">Open Team Chat</h4>
                    <p className="text-xs text-slate-500">Jump into real-time conversations</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 shadow-lg">
                  <div className="flex justify-between items-start mb-4">
                    <DollarSign className="text-white/50" />
                    <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded">Hourly Rate: ₹{user.hourlyRate}</span>
                  </div>
                  <p className="text-white/80 text-sm">Estimated Earnings (Today)</p>
                  <h2 className="text-3xl font-bold text-white mt-1">
                    ₹{todayEarnings.toFixed(2)}
                  </h2>
                </div>
                
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-yellow-500/20 rounded-2xl flex items-center justify-center">
                        <AlertCircle className="text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-slate-400 text-sm">System Status</p>
                        <p className="text-white font-bold">AI Monitoring Active</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsCameraOn(!isCameraOn)}
                      className={`p-3 rounded-2xl transition-all ${
                        isCameraOn 
                          ? 'bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white' 
                          : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'
                      }`}
                      title={isCameraOn ? "Turn Camera Off" : "Turn Camera On"}
                    >
                      {isCameraOn ? <Camera size={20} /> : <CameraOff size={20} />}
                    </button>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-4 mt-4 border border-white/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Calendar size={18} className="text-white/70" />
                      <span className="text-sm font-bold text-white">Approved Leave</span>
                    </div>
                    <p className="text-xs text-white/60">No approved leave for today.</p>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                <h2 className="text-xl font-bold mb-6">Live Monitoring Preview</h2>
                <div className="space-y-6">
                  <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 group">
                    {screenStream ? (
                      <>
                        <video 
                          ref={(el) => {
                            if (el) el.srcObject = screenStream;
                          }}
                          autoPlay 
                          muted 
                          playsInline 
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-4 left-4 bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest animate-pulse">
                          Live Screen Sharing
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 space-y-3">
                        <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center">
                          <Monitor size={32} className="opacity-20" />
                        </div>
                        <p className="text-sm font-black uppercase tracking-widest">Waiting for Screen Share...</p>
                        <p className="text-[10px] text-slate-500">Click "Share Screen" to start monitoring</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Shield className="text-blue-500" size={16} />
                      <span className="text-sm font-bold text-white">Privacy Notice</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Your screen is being monitored for productivity. Monitoring automatically stops when you end your session or take a break.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                <h2 className="text-xl font-bold mb-6">Active Session Details</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <span className="text-slate-400">Session Started</span>
                    <span className="font-mono">{session ? formatSafe(session.startTime, 'h:mm:ss a', '--:--:--') : '--:--:--'}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-800">
                    <span className="text-slate-400">Current Work Time</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {Math.floor(elapsedTime / 3600)}h {Math.floor((elapsedTime % 3600) / 60)}m {elapsedTime % 60}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Achievements Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
                    <TrendingUp className="text-blue-500" />
                  </div>
                  <h2 className="text-xl font-bold">Your Achievements</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {user.achievements && user.achievements.length > 0 ? (
                    user.achievements.map((achievement, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex items-center gap-4 group hover:border-blue-500/50 transition-all">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-blue-400 font-bold">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{achievement}</p>
                          <p className="text-[10px] text-slate-500">Awarded by Admin</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-10 text-center bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl">
                      <p className="text-slate-500 text-sm">No achievements yet. Keep up the good work!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'teams' && (
            <div className="flex h-[calc(100vh-220px)] min-h-[600px] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
              {/* ── Left Sidebar: Channel & DM List ── */}
              <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div className="p-5 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
                        <MessageSquare size={16} className="text-white" />
                      </div>
                      <span className="font-black text-white text-sm uppercase tracking-widest">Chat</span>
                    </div>
                  </div>
                  
                  {/* Sidebar Filter Tabs */}
                  <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800 mb-4">
                    {(['all', 'teams', 'direct'] as const).map((view) => (
                      <button
                        key={view}
                        onClick={() => setChatSidebarView(view)}
                        className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all ${
                          chatSidebarView === view 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {view}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Join team code..."
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && joinTeam()}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-600 uppercase"
                      maxLength={8}
                    />
                    <button
                      onClick={joinTeam}
                      disabled={isJoining || !joinCode.trim()}
                      className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-2 rounded-xl transition-all text-xs font-bold"
                    >
                      {isJoining ? '...' : 'Join'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {/* Teams Section */}
                  {(chatSidebarView === 'all' || chatSidebarView === 'teams') && (
                    <>
                      <div className="px-5 py-4 flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Teams</span>
                        <Users size={12} className="text-slate-600" />
                      </div>
                      <div className="px-3 space-y-1 mb-6">
                        {teams.map(team => {
                          const isActive = selectedTeamId === team.id;
                          const teamMessages = messages.filter(m => m.teamId === team.id);
                          const lastMsg = teamMessages[teamMessages.length - 1];
                          return (
                            <button
                              key={team.id}
                              onClick={() => { setSelectedTeamId(team.id); setSelectedChatUser(null); setSelectedRecipients([]); }}
                              className={`w-full text-left p-3 rounded-2xl transition-all group ${
                                isActive ? 'bg-blue-600/10 border border-blue-500/40' : 'hover:bg-slate-800/60 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${
                                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                                }`}>
                                  {team.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-400' : 'text-slate-200'}`}>
                                      {team.name}
                                    </p>
                                    {(() => {
                                      const unreadCount = teamMessages.filter(m => {
                                        return m.senderId !== user.uid && !m.isRead;
                                      }).length;
                                      return unreadCount > 0 ? (
                                        <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg flex-shrink-0">
                                          {unreadCount}
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  <p className="text-[10px] text-slate-500 truncate">
                                    {lastMsg ? lastMsg.content || '📎 Attachment' : 'No messages'}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Direct Messages Section */}
                  {(chatSidebarView === 'all' || chatSidebarView === 'direct') && (
                    <>
                      <div className="px-5 py-4 flex items-center justify-between border-t border-slate-800/50">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Direct Messages</span>
                        <Mail size={12} className="text-slate-600" />
                      </div>
                      <div className="px-3 space-y-1 pb-10">
                        {/* Admin is always here */}
                        {(() => {
                          const isActive = selectedChatUser?.uid === 'admin';
                          return (
                            <button
                              onClick={() => { setSelectedChatUser({ uid: 'admin', displayName: 'Admin Support' }); setSelectedTeamId(null); setSelectedRecipients(['admin']); }}
                              className={`w-full text-left p-3 rounded-2xl transition-all group ${
                                isActive ? 'bg-blue-600/10 border border-blue-500/40' : 'hover:bg-slate-800/60 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm flex-shrink-0 bg-slate-900 border border-slate-800`}>
                                  <Shield size={18} className="text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-400' : 'text-slate-200'}`}>Admin Support</p>
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  </div>
                                  <p className="text-[10px] text-blue-500/60 font-medium">Online · Administrator</p>
                                </div>
                                {(() => {
                                  const unreadCount = messages.filter(m => {
                                    const senderIsAdmin = employees.find(e => e.uid === m.senderId)?.role === 'admin' || m.senderId === 'admin';
                                    return (senderIsAdmin || m.senderId === 'admin') && !m.isRead && m.receiverIds.includes(user.uid);
                                  }).length;
                                  return unreadCount > 0 ? (
                                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                      {unreadCount}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </button>
                          );
                        })()}
                        {employees.filter(e => e.uid !== user.uid).map(emp => {
                          const isActive = selectedChatUser?.uid === emp.uid;
                          return (
                            <button
                              key={emp.uid}
                              onClick={() => { setSelectedChatUser(emp); setSelectedTeamId(null); setSelectedRecipients([emp.uid]); }}
                              className={`w-full text-left p-3 rounded-2xl transition-all group ${
                                isActive ? 'bg-blue-600/10 border border-blue-500/40' : 'hover:bg-slate-800/60 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative flex-shrink-0">
                                  <img src={emp.facePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.displayName)}&size=32`}
                                    className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                                  <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${emp.status === 'active' ? 'bg-green-500' : 'bg-slate-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-400' : 'text-slate-200'}`}>
                                    {emp.displayName}
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate font-medium uppercase tracking-widest">
                                    {emp.status === 'active' ? (
                                      <span className="text-green-500">● Online</span>
                                    ) : (
                                      <span className="text-slate-600">● Offline</span>
                                    )}
                                    <span className="mx-1 text-slate-700">|</span>
                                    {emp.position || 'Employee'}
                                  </p>
                                </div>
                                {(() => {
                                  const unreadCount = messages.filter(m => {
                                    const mSenderId = m.senderId || m.sender_id || m.senderid;
                                    const mReceiverIds = parseReceiverIds(m.receiverIds || m.receiver_ids || m.receiverids || []);
                                    const mIsRead = m.isRead ?? m.is_read ?? m.isread ?? false;
                                    return String(mSenderId) === String(emp.uid) && !mIsRead && mReceiverIds.map(String).includes(String(user.uid));
                                  }).length;
                                  return unreadCount > 0 ? (
                                    <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                      {unreadCount}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Main Chat Area ── */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {(selectedTeamId || selectedChatUser) ? (() => {
                  const currentTeam = teams.find(t => t.id === selectedTeamId);
                  const chatTitle = currentTeam ? currentTeam.name : selectedChatUser?.displayName;
                  const chatSubtitle = currentTeam ? `${currentTeam.memberIds?.length || 0} Members · Code: ${currentTeam.uniqueCode}` : (selectedChatUser?.uid === 'admin' ? 'System Support' : selectedChatUser?.position);
                  
                  const chatMessages = messages
                    .filter(m => {
                      if (selectedTeamId) return m.teamId === selectedTeamId;
                      if (!selectedChatUser) return false;
                      
                      const mSenderId = m.senderId || m.sender_id || m.senderid;
                      const mReceiverIds = parseReceiverIds(m.receiverIds || m.receiver_ids || m.receiverids || []);
                      const mCategory = m.category || (m as any).category;
                      const mTeamId = m.teamId || m.team_id || m.teamid;

                      if (mTeamId) return false;

                      const isMeToOther = String(mSenderId) === String(user.uid) && mReceiverIds.map(String).includes(String(selectedChatUser.uid));
                      const isOtherToMe = String(mSenderId) === String(selectedChatUser.uid) && mReceiverIds.map(String).includes(String(user.uid));

                      // Robust check for Admin Support messages
                      if (selectedChatUser.uid === 'admin') {
                        const sentToAdmin = String(mSenderId) === String(user.uid) && mReceiverIds.map(String).includes('admin');
                        // Admin can send with their real uid (not 'admin' string), with receiverIds containing employee uid
                        const isAdminSender = String(mSenderId) === 'admin' || 
                          employees.find(e => String(e.uid) === String(mSenderId) && (e.role === 'admin' || e.role === 'ceo' || e.role === 'founder')) !== undefined;
                        const receivedFromAdmin = isAdminSender && mReceiverIds.map(String).includes(String(user.uid));
                        return (sentToAdmin || receivedFromAdmin) && (mCategory === 'support' || !mCategory);
                      }
                      
                      return (isMeToOther || isOtherToMe);
                    })
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                  
                  return (
                    <>
                      {/* Chat Header */}
                      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-sm">
                            {chatTitle?.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-black text-white">{chatTitle}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{chatSubtitle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {currentTeam && (
                            <div className="hidden md:flex -space-x-2">
                              {(currentTeam?.memberIds || []).slice(0, 4).map(mid => {
                                const emp = employees.find(e => e.uid === mid);
                                return emp ? (
                                  <div key={mid} title={emp.displayName}
                                    className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-700 overflow-hidden flex-shrink-0">
                                    <img src={emp.facePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.displayName)}&size=32`}
                                      className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  </div>
                                ) : null;
                              })}
                            </div>
                          )}
                          {selectedChatUser && (
                            <div className="flex items-center gap-2">
                               <button onClick={() => startCall('voice')} className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-blue-400 transition-all active:scale-95"><Phone size={18} /></button>
                               <button onClick={() => startCall('video')} className="p-2.5 bg-blue-600/10 hover:bg-blue-600/20 rounded-xl text-blue-400 transition-all active:scale-95"><Video size={18} /></button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Messages Area */}
                      <div ref={messageContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-900/50">
                        {(() => {
                          if (chatMessages.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
                                  <MessageSquare size={28} className="text-slate-600" />
                                </div>
                                <p className="text-slate-500 font-bold text-sm">No messages yet</p>
                                <p className="text-slate-700 text-xs mt-1">Be the first to say something!</p>
                              </div>
                            );
                          }

                          const groups: { [key: string]: any[] } = {};
                          chatMessages.forEach(msg => {
                            const date = new Date(msg.timestamp);
                            let dateStr = format(date, 'yyyy-MM-dd');
                            if (isToday(date)) dateStr = 'Today';
                            else if (isYesterday(date)) dateStr = 'Yesterday';
                            else dateStr = format(date, 'MMMM d, yyyy');
                            if (!groups[dateStr]) groups[dateStr] = [];
                            groups[dateStr].push(msg);
                          });

                          return Object.entries(groups).map(([date, groupMsgs]) => (
                            <div key={date} className="space-y-6">
                              <div className="flex justify-center sticky top-0 z-10 py-2">
                                <span className="px-4 py-1.5 bg-slate-800/90 backdrop-blur-md text-[10px] font-black text-slate-300 rounded-full border border-slate-700/50 uppercase tracking-[0.2em] shadow-xl">
                                  {date}
                                </span>
                              </div>
                              {groupMsgs.map((msg, idx) => {
                                const sId = msg.senderId || msg.sender_id || msg.senderid;
                                const isMe = sId === user.uid;
                                const prevMsg = groupMsgs[idx - 1];
                                const prevSenderId = prevMsg ? (prevMsg.senderId || prevMsg.sender_id || prevMsg.senderid) : undefined;
                                const isGrouped = prevMsg ? shouldGroupWithPrevious(
                                  { senderId: sId, timestamp: msg.timestamp },
                                  { senderId: prevSenderId, timestamp: prevMsg.timestamp }
                                ) : false;
                                return (
                                  <div key={msg.id || idx} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${isGrouped ? 'mt-1' : 'mt-4'} ${isMe ? 'animate-in slide-in-from-right-4' : 'animate-in slide-in-from-left-4'} duration-300`}>
                                    <div className="w-8 h-8 flex-shrink-0">
                                      {!isGrouped && (() => {
                                        const sender = employees.find(e => e.uid === sId);
                                        const avatarColor = getAvatarColor(msg.senderName);
                                        return sender?.facePhotoUrl ? (
                                          <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden">
                                            <img src={sender.facePhotoUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                          </div>
                                        ) : (
                                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-md" style={{ backgroundColor: avatarColor }}>
                                            {getInitials(msg.senderName)}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    <div className={`max-w-[85%] md:max-w-[65%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                      {!isGrouped && (
                                        <div className="flex items-center gap-2 mb-1 px-1">
                                          <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">{isMe ? 'You' : msg.senderName}</span>
                                          <span className="text-[9px] text-slate-600 font-bold">{safeFormatDate(msg.timestamp, 'h:mm a')}</span>
                                        </div>
                                      )}
                                      <div className={`group relative px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-lg transition-all hover:scale-[1.01] ${
                                        isMe
                                          ? 'text-white rounded-tr-md border border-white/10'
                                          : 'bg-slate-800 text-slate-200 rounded-tl-md border border-slate-700 shadow-black/20'
                                      }`}
                                      style={isMe ? { backgroundColor: '#6264A7' } : undefined}
                                      >
                                        {msg.attachmentUrl && (
                                          <div className="mb-2 p-2 bg-black/20 rounded-xl border border-white/10 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                              {msg.attachmentType?.startsWith('image/') ? (
                                                <img src={msg.attachmentUrl} className="w-8 h-8 object-cover rounded-lg cursor-zoom-in" referrerPolicy="no-referrer" onClick={() => window.open(msg.attachmentUrl, '_blank')} />
                                              ) : <File size={14} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[10px] font-bold truncate text-white">{msg.attachmentName}</p>
                                              <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="text-[9px] text-blue-400 hover:underline font-bold mt-0.5 inline-block">Download</a>
                                            </div>
                                          </div>
                                        )}
                                        {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                                        {isMe && (
                                          <div className="flex justify-end mt-1.5 opacity-60">
                                            {(msg.isRead || msg.is_read || msg.isread) ? (
                                              <CheckCheck size={11} className="text-white" />
                                            ) : (
                                              <Check size={11} className="text-white/60" />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      {isGrouped && (
                                        <span className="text-[8px] text-slate-700 font-mono mt-0.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {safeFormatDate(msg.timestamp, 'h:mm a')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ));
                        })()}
                      </div>

                      {/* Message Input Bar */}
                      <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md">
                        {attachment && (
                          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl border border-slate-700">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                              {attachment.type.startsWith('image/') ? (
                                <img src={attachment.url} className="w-7 h-7 object-cover rounded-lg" referrerPolicy="no-referrer" />
                              ) : <File size={14} />}
                            </div>
                            <p className="flex-1 text-[10px] font-bold truncate text-slate-300">{attachment.name}</p>
                            <button onClick={() => setAttachment(null)} className="text-slate-500 hover:text-red-400">
                              <XCircle size={14} />
                            </button>
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                          <div className="flex-1 relative">
                            <textarea
                              className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-slate-600 min-h-[44px] max-h-32"
                              placeholder={`Message ${currentTeam?.name}...`}
                              value={newMessage}
                              rows={1}
                              onChange={(e) => {
                                setNewMessage(e.target.value);
                                handleTyping();
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 pb-0.5">
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                              title="Attach file"
                              className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-400 hover:text-blue-400 transition-all"
                            >
                              {isUploading ? (
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                              ) : <Paperclip size={16} />}
                            </button>
                            <button
                              onClick={sendMessage}
                              disabled={(!newMessage.trim() && !attachment) || isUploading}
                              title="Send (Enter)"
                              className="w-10 h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-all"
                            >
                              <ExternalLink size={16} className="rotate-90" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[9px] text-slate-700 mt-1 px-1">Enter to send · Shift+Enter for new line</p>
                      </div>
                    </>
                  );
                })() : (
                  /* No team selected */
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-24 h-24 bg-slate-800/60 rounded-3xl flex items-center justify-center mb-6 border border-slate-700">
                      <Users size={40} className="text-slate-600" />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2">Select a Team</h3>
                    <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                      {teams.length > 0
                        ? 'Pick a team from the sidebar to start chatting with your teammates.'
                        : 'Join a team using a team code from your admin to get started.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'history' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-xl font-bold">Work History</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="text-blue-500" size={18} />
                    <input 
                      type="date" 
                      className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      value={selectedHistoryDate}
                      onChange={(e) => setSelectedHistoryDate(e.target.value)}
                    />
                    {selectedHistoryDate && (
                      <button 
                        onClick={() => setSelectedHistoryDate('')}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl border border-slate-700 transition-all font-semibold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search history..."
                      className="bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      value={historySearchTerm}
                      onChange={(e) => setHistorySearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-950/50 text-slate-500 text-xs uppercase tracking-widest">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Start</th>
                      <th className="px-6 py-4">End</th>
                      <th className="px-6 py-4">Work</th>
                      <th className="px-6 py-4">Break</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sessions.filter(s => {
                      const dateMatches = !selectedHistoryDate || s.date === selectedHistoryDate;
                      const termMatches = !historySearchTerm || 
                        s.date.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
                        (s.status || '').toLowerCase().includes(historySearchTerm.toLowerCase());
                      return dateMatches && termMatches;
                    }).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 text-sm">{s.date}</td>
                        <td className="px-6 py-4 text-sm font-mono">{formatSafe(s.startTime || s.start_time || s.starttime, 'h:mm a')}</td>
                        <td className="px-6 py-4 text-sm font-mono">{formatSafe(s.endTime || s.end_time || s.endtime, 'h:mm a')}</td>
                        <td className="px-6 py-4 text-sm font-bold text-blue-400">{s.totalWorkMinutes}m</td>
                        <td className="px-6 py-4 text-sm text-yellow-500">{s.totalBreakMinutes}m</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            s.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-xl font-bold">Payment History</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search period..."
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={paymentSearchTerm}
                    onChange={(e) => setPaymentSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-950/50 text-slate-500 text-xs uppercase tracking-widest">
                      <th className="px-6 py-4">Period</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {payments
                      .filter(p => {
                        const term = paymentSearchTerm.toLowerCase();
                        const start = (p.periodStart || '').toLowerCase();
                        const end = (p.periodEnd || '').toLowerCase();
                        return !paymentSearchTerm || start.includes(term) || end.includes(term);
                      })
                      .map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium">
                          {p.periodStart} - {p.periodEnd}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-blue-400">
                          ₹{p.amount.toLocaleString()}
                        </td>
                         <td className="px-6 py-4">
                          <span className={`${
                            p.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                            p.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          } px-2 py-1 rounded-full text-[10px] font-black uppercase shadow-lg shadow-black/20 animate-in fade-in zoom-in`}>
                            {p.status === 'paid' ? 'COMPLETED' : 
                             p.status === 'approved' ? 'APPROVED' : 
                             'PENDING'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => downloadPayslip(p)}
                            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                          >
                            <Download size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="flex flex-col h-full">
              {!user.isApprovedForMessaging && (
                <div className="mb-6 p-6 bg-blue-600/10 border border-blue-500/30 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center gap-6 text-center md:text-left">
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                      <ShieldAlert size={32} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white">Messaging Restricted</h3>
                      <p className="text-slate-400 text-sm mt-1">Your account is not yet approved for full messaging features. You can only message administrators.</p>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      const { error } = await supabase.from('message_requests').insert({
                        senderId: user.uid,
                        senderName: user.displayName,
                        receiverId: 'admin',
                        receiverName: 'System Admin',
                        status: 'pending',
                        timestamp: new Date().toISOString()
                      });
                      if (!error) {
                        alert('Request sent to admin for approval!');
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-lg shadow-blue-600/20 active:scale-95 whitespace-nowrap"
                  >
                    REQUEST APPROVAL
                  </button>
                </div>
              )}
              <div className="flex flex-col lg:flex-row gap-8 h-[750px] animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                {/* Sidebar: Users and Teams */}
                <div className={`${isChatSidebarOpen ? 'flex' : 'hidden lg:flex'} w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex-col absolute inset-0 z-20 lg:relative lg:inset-auto shadow-2xl`}>
                  <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold">Messaging</h2>
                      <button onClick={() => setIsChatSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                      </button>
                    </div>

                    {/* Sidebar Filter Tabs */}
                    <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800 mb-4 shadow-inner">
                      {(['all', 'teams', 'direct'] as const).map((view) => (
                        <button
                          key={view}
                          onClick={() => setChatSidebarView(view)}
                          className={`flex-1 py-2 text-[9px] font-black uppercase tracking-tighter rounded-lg transition-all ${
                            chatSidebarView === view 
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {view}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search contacts..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        value={chatSearchTerm}
                        onChange={(e) => setChatSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-900/30">
                    <div className="p-4 space-y-6">
                      {/* Teams Section */}
                      {(chatSidebarView === 'all' || chatSidebarView === 'teams') && (
                        <div>
                          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2 flex items-center gap-2">
                            <Users size={12} /> Your Teams
                          </h3>
                          <div className="space-y-1">
                            {teams.filter(t => t.name.toLowerCase().includes(chatSearchTerm.toLowerCase())).map(team => (
                              <button
                                key={team.id}
                                onClick={() => {
                                  setSelectedTeamId(team.id);
                                  setSelectedChatUser(null);
                                  setSelectedRecipients([]);
                                  setIsChatSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group ${
                                  selectedTeamId === team.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-800 text-slate-400'
                                }`}
                              >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${selectedTeamId === team.id ? 'bg-white/20' : 'bg-slate-800 text-blue-400'}`}>
                                  <Users size={18} />
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                  <p className="text-sm font-bold truncate">{team.name}</p>
                                  <p className={`text-[10px] ${selectedTeamId === team.id ? 'text-blue-100' : 'text-slate-500'}`}>
                                    {team.memberIds.length} members
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Direct Messages Section */}
                      {(chatSidebarView === 'all' || chatSidebarView === 'direct') && (
                        <div>
                          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2 flex items-center gap-2">
                            <MessageSquare size={12} /> Contacts
                          </h3>
                          <div className="space-y-1">
                            {/* Admin Support */}
                            <button
                              onClick={() => {
                                setSelectedChatUser({ uid: 'admin', displayName: 'Admin Support' });
                                setSelectedTeamId(null);
                                setSelectedRecipients(['admin']);
                                setIsChatSidebarOpen(false);
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group ${
                                selectedRecipients.length === 1 && selectedRecipients[0] === 'admin' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              <div className="relative">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${selectedRecipients.length === 1 && selectedRecipients[0] === 'admin' ? 'bg-white/20' : 'bg-slate-900 border border-slate-800'}`}>
                                  <Shield size={18} className={selectedRecipients.length === 1 && selectedRecipients[0] === 'admin' ? 'text-white' : 'text-blue-400'} />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 bg-green-500 shadow-lg shadow-green-500/20" />
                              </div>
                              <div className="text-left flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">Admin Support</p>
                                <p className={`text-[10px] uppercase font-black tracking-tighter ${selectedRecipients.length === 1 && selectedRecipients[0] === 'admin' ? 'text-blue-100' : 'text-slate-500'}`}>
                                  OFFICIAL CHANNEL
                                </p>
                              </div>
                            </button>

                            {employees.filter(e => e.uid !== user.uid).filter(e => e.displayName.toLowerCase().includes(chatSearchTerm.toLowerCase())).map(emp => {
                              const isSelected = selectedChatUser?.uid === emp.uid;
                              const isRestricted = !canMessage(emp.uid);
                              return (
                                <div key={emp.uid} className="relative group">
                                  <button
                                    disabled={isRestricted}
                                    onClick={() => {
                                      setSelectedChatUser(emp);
                                      setSelectedTeamId(null);
                                      setSelectedRecipients([emp.uid]);
                                      setIsChatSidebarOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                                      isRestricted ? 'opacity-40 grayscale cursor-not-allowed' : 
                                      isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    <div className="relative">
                                      <img 
                                        src={emp.facePhotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.displayName)}&background=1e293b&color=3b82f6&size=64`}
                                        className="w-10 h-10 rounded-xl object-cover border border-white/5" 
                                        referrerPolicy="no-referrer" 
                                      />
                                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${emp.status === 'active' ? 'bg-green-500 shadow-green-500/30' : 'bg-slate-700'} shadow-lg`} />
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                      <p className="text-sm font-bold truncate">{emp.displayName}</p>
                                      <p className={`text-[10px] uppercase font-black tracking-tighter ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                                        {emp.status === 'active' ? 'ACTIVE' : 'OFFLINE'}
                                      </p>
                                    </div>
                                  </button>
                                  {isRestricted && (
                                    <button 
                                      onClick={() => {
                                        setRequestRecipient(emp);
                                        setShowRequestModal(true);
                                      }}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[8px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all shadow-xl"
                                    >
                                      Request
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl relative">
                  {(selectedChatUser || selectedTeamId) ? (
                    <>
                      <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-4">
                          <button onClick={() => setIsChatSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors bg-slate-950 border border-slate-800 rounded-xl"><Menu size={20} /></button>
                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                            {selectedTeamId ? <Users size={24} /> : <User size={24} />}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm md:text-xl text-white">
                              {selectedTeamId ? teams.find(t => t.id === selectedTeamId)?.name : (selectedChatUser?.displayName || 'Admin Support')}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${selectedTeamId ? 'bg-blue-500' : (selectedChatUser?.status === 'active' || selectedChatUser?.uid === 'admin' ? 'bg-green-500 animate-pulse' : 'bg-slate-600')}`} />
                              <p className="text-[10px] md:text-xs text-slate-500 font-medium">
                                {selectedTeamId ? 'Broadcast Mode' : (selectedChatUser?.status === 'active' || selectedChatUser?.uid === 'admin' ? 'Active Conversation' : 'Offline Session')}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 md:gap-3">
                          <button onClick={() => startCall('voice')} className="p-2 md:p-3 bg-slate-950 border border-slate-800 hover:border-blue-500/50 rounded-xl text-slate-400 hover:text-blue-400 transition-all active:scale-90 shadow-lg"><Phone size={18} /></button>
                          <button onClick={() => startCall('video')} className="p-2 md:p-3 bg-slate-950 border border-slate-800 hover:border-blue-500/50 rounded-xl text-slate-400 hover:text-blue-400 transition-all active:scale-90 shadow-lg"><Video size={18} /></button>
                          <button onClick={clearChat} className="p-2 md:p-3 bg-slate-950 border border-slate-800 hover:border-red-500/50 text-slate-400 hover:text-red-500 rounded-xl transition-all active:scale-90 shadow-lg" title="Purge Records"><Eraser size={18} /></button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-slate-950/20" ref={messageContainerRef}>
                        {(() => {
                          const filteredMessages = messages.filter(m => {
                            const mTeamId = m.teamId || m.team_id || m.teamid;
                            const mSenderId = String(m.senderId || m.sender_id || m.senderid || '');
                            const mReceiverIds = parseReceiverIds(m.receiverIds || m.receiver_ids || m.receiverids || []).map(String);

                            // Team chat
                            if (selectedTeamId && mTeamId === selectedTeamId) return true;

                            // Direct chat (no team)
                            if (!selectedTeamId && selectedChatUser) {
                              const targetUid = String(selectedChatUser.uid);
                              const myUid = String(user.uid);
                              const isAdminSelected = targetUid === 'admin';

                              // Message I sent to this person
                              const isMeToThem = mSenderId === myUid && (
                                mReceiverIds.includes(targetUid) ||
                                (isAdminSelected && (mReceiverIds.includes('admin') || mReceiverIds.includes('support')))
                              );

                              // Message they sent to me
                              const isThemToMe = mReceiverIds.includes(myUid) && (
                                mSenderId === targetUid ||
                                // Admin can have their real uid as senderId
                                (isAdminSelected && (
                                  mSenderId === 'admin' ||
                                  mSenderId === 'system' ||
                                  Boolean(employees.find(e => String(e.uid) === mSenderId && (e.role === 'admin' || e.role === 'ceo' || e.role === 'founder')))
                                ))
                              );

                              return isMeToThem || isThemToMe;
                            }
                            return false;
                          }).sort((a, b) => {
                            const tA = new Date(a.timestamp).getTime();
                            const tB = new Date(b.timestamp).getTime();
                            return (isNaN(tA) ? 0 : tA) - (isNaN(tB) ? 0 : tB);
                          });

                          const groups: { [key: string]: any[] } = {};
                          filteredMessages.forEach(msg => {
                            const date = new Date(msg.timestamp);
                            let dateStr = format(date, 'yyyy-MM-dd');
                            if (isToday(date)) dateStr = 'Today';
                            else if (isYesterday(date)) dateStr = 'Yesterday';
                            else dateStr = format(date, 'MMMM d, yyyy');
                            
                            if (!groups[dateStr]) groups[dateStr] = [];
                            groups[dateStr].push(msg);
                          });

                          return Object.entries(groups).map(([date, groupMsgs]) => (
                            <div key={date} className="space-y-6">
                              <div className="flex justify-center sticky top-0 md:top-2 z-10">
                                <span className="px-5 py-1.5 bg-slate-900/90 backdrop-blur-md text-[10px] font-black text-slate-400 rounded-full border border-slate-800/50 uppercase tracking-[0.2em] shadow-2xl">
                                  {date}
                                </span>
                              </div>
                              {groupMsgs.map((msg, idx) => {
                                const mSenderId = msg.senderId || msg.sender_id || msg.senderid;
                                const mSenderName = msg.senderName || msg.sender_name || msg.sendername;
                                const isMe = mSenderId === user.uid;
                                const displayName = mSenderId === 'admin' ? 'Central Admin' : mSenderName;
                                const prevMsg = groupMsgs[idx - 1];
                                const prevSenderId = prevMsg ? (prevMsg.senderId || prevMsg.sender_id || prevMsg.senderid) : undefined;
                                const isGrouped = prevMsg ? shouldGroupWithPrevious(
                                  { senderId: mSenderId, timestamp: msg.timestamp },
                                  { senderId: prevSenderId, timestamp: prevMsg.timestamp }
                                ) : false;
                                const avatarColor = getAvatarColor(mSenderId === 'admin' ? 'admin' : displayName);
                                return (
                                  <div key={idx} className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-1' : 'mt-4'} animate-in fade-in slide-in-from-bottom-2`}>
                                    {/* Avatar gutter - only shown for the first message in a consecutive run from others */}
                                    {!isMe && (
                                      <div className="w-8 h-8 flex-shrink-0 self-start">
                                        {!isGrouped && (
                                          <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-md"
                                            style={{ backgroundColor: avatarColor }}
                                          >
                                            {getInitials(displayName)}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[70%]`}>
                                      {!isGrouped && (
                                        <div className="flex items-center gap-2 mb-1 px-2">
                                          {!isMe && (
                                            <span className="text-[11px] font-black text-slate-300">
                                              {displayName}
                                            </span>
                                          )}
                                          <span className="text-[9px] text-slate-600 font-mono">{safeFormatDate(msg.timestamp, 'h:mm a')}</span>
                                        </div>
                                      )}
                                      <div className={`group relative w-full p-3.5 md:p-4 rounded-2xl shadow-lg transition-transform hover:scale-[1.01] ${
                                        isMe 
                                          ? `text-white border border-white/10 ${isGrouped ? 'rounded-tr-md' : 'rounded-tr-md'}` 
                                          : `bg-slate-800 text-slate-200 border border-slate-700/50 ${isGrouped ? 'rounded-tl-md' : 'rounded-tl-md'}`
                                      }`}
                                      style={isMe ? { backgroundColor: '#6264A7' } : undefined}
                                      >
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                        
                                        {msg.attachmentUrl && (
                                          <div className="mt-4 rounded-2xl overflow-hidden bg-black/20 border border-white/5 shadow-inner">
                                            {msg.attachmentType?.startsWith('image/') ? (
                                              <img 
                                                src={msg.attachmentUrl} 
                                                alt="Broadcast Attachment" 
                                                className="max-w-full h-auto object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                                                referrerPolicy="no-referrer" 
                                                onClick={() => window.open(msg.attachmentUrl, '_blank')} 
                                              />
                                            ) : (
                                              <div className="p-4 flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-blue-400 shadow-xl">
                                                  <File size={22} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-xs font-bold truncate text-white uppercase tracking-tight">{msg.attachmentName}</p>
                                                  <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 font-black mt-1.5 inline-block uppercase tracking-widest">Download Data</a>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      {isGrouped && (
                                        <span className="text-[8px] text-slate-700 font-mono mt-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {safeFormatDate(msg.timestamp, 'h:mm a')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ));
                        })()}
                        
                        {Object.entries(typingUsers).map(([uid, typing]) => {
                          if (!typing || uid === user.uid) return null;
                          const isInContext = selectedRecipients.includes(uid);
                          if (!isInContext) return null;
                          const typingUser = employees.find(e => e.uid === uid) || (uid === 'admin' ? { displayName: 'Admin' } : null);
                          if (!typingUser) return null;

                          return (
                            <div key={uid} className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-2">
                              <div className="bg-slate-800/80 backdrop-blur-sm p-4 rounded-3xl rounded-tl-sm flex gap-1.5 shadow-xl border border-slate-700/30">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2">{typingUser.displayName} is typing</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="p-4 md:p-8 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
                        {attachment && (
                          <div className="mb-4 flex items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-2xl animate-in slide-in-from-bottom-4 shadow-2xl border-l-4 border-l-blue-500">
                            <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                              {attachment.type.startsWith('image/') ? (
                                <img src={attachment.url} alt="Upload Preview" className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                              ) : (
                                <File size={24} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black truncate text-white uppercase tracking-tight">{attachment.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{attachment.type.split('/')[1].toUpperCase()} • {(attachment as any).size ? Math.round((attachment as any).size / 1024) + 'KB' : 'READY TO SEND'}</p>
                            </div>
                            <button onClick={() => setAttachment(null)} className="p-3 text-slate-500 hover:text-red-500 transition-all hover:bg-red-500/10 rounded-xl active:scale-90">
                              <XCircle size={24} />
                            </button>
                          </div>
                        )}
                        <div className="flex gap-4 items-end">
                          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="p-5 bg-slate-950 border border-slate-800 hover:border-blue-500/50 rounded-[2rem] text-slate-400 hover:text-blue-500 transition-all active:scale-95 disabled:opacity-50 shadow-xl group"
                          >
                            {isUploading ? <Loader2 className="animate-spin text-blue-500" size={24} /> : <Paperclip size={24} className="group-hover:rotate-12 transition-transform" />}
                          </button>
                          <div className="flex-1 relative">
                            <textarea 
                              placeholder="Type a message or drop files..."
                              className="w-full bg-slate-950 border border-slate-800 rounded-[2rem] pl-8 pr-20 py-5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium resize-none min-h-[64px] max-h-48 custom-scrollbar scroll-smooth shadow-inner"
                              rows={1}
                              value={newMessage}
                              onChange={(e) => { 
                                setNewMessage(e.target.value); 
                                e.target.style.height = 'auto';
                                e.target.style.height = e.target.scrollHeight + 'px';
                                handleTyping(); 
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  sendMessage();
                                }
                              }}
                            />
                            <button 
                              onClick={sendMessage}
                              disabled={!newMessage.trim() && !attachment}
                              className="absolute right-3 bottom-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white w-12 h-12 rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-90 flex items-center justify-center group"
                            >
                              <Play size={22} className="group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-950/20">
                      <div className="w-32 h-32 bg-blue-600/10 rounded-[3rem] flex items-center justify-center text-blue-500 mb-10 shadow-[0_0_80px_rgba(59,130,246,0.1)] relative">
                        <MessageSquare size={64} className="animate-bounce" style={{ animationDuration: '3s' }} />
                        <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xs font-black animate-pulse">!</div>
                      </div>
                      <h3 className="text-3xl font-black mb-6 tracking-tight">Broadcast Center</h3>
                      <p className="text-slate-500 max-w-sm text-lg leading-relaxed px-6">Secure, end-to-end encrypted messaging. Select a contact or team from the navigation rail to begin your session.</p>
                      <button 
                        onClick={() => setIsChatSidebarOpen(true)}
                        className="mt-10 lg:hidden px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black shadow-xl shadow-blue-600/20 transition-all active:scale-95 uppercase tracking-widest text-xs"
                      >
                        Open Directory
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300 overflow-hidden">
          <div className="w-full max-w-3xl h-full flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                  {callType === 'video' ? <Video size={20} /> : <Phone size={20} />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-white leading-tight">
                    {selectedRecipients.length === 1
                      ? (selectedRecipients[0] === 'admin' ? 'Admin Support' : employees.find(e => e.uid === selectedRecipients[0])?.displayName)
                      : 'Group Meeting'}
                  </h2>
                  <p className="text-xs flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${callStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <span className={callStatus === 'connected' ? 'text-green-400 font-bold' : 'text-slate-400'}>
                      {callStatus === 'calling' ? 'Calling...' : callStatus === 'connected' ? 'Connected' : callStatus === 'busy' ? 'Busy' : 'Disconnected'}
                    </span>
                    {callStatus === 'connected' && (
                      <span className="ml-2 text-slate-500 font-mono">{formatTime(callDuration)}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Main call area */}
            <div className="flex-1 relative overflow-hidden mx-4">
              {callType === 'video' ? (
                <div className="w-full h-full grid grid-cols-2 gap-3">
                  {/* Remote */}
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-3xl font-bold text-slate-600">
                        {selectedRecipients[0] === 'admin' ? 'A' : employees.find(e => e.uid === selectedRecipients[0])?.displayName?.charAt(0) ?? '?'}
                      </div>
                    </div>
                    <video ref={remoteVideoRef} className="w-full h-full object-cover relative z-10" autoPlay playsInline />
                    <div className="absolute bottom-3 left-3 z-20 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-white text-xs font-bold">
                      {selectedRecipients[0] === 'admin' ? 'Admin' : employees.find(e => e.uid === selectedRecipients[0])?.displayName}
                    </div>
                  </div>
                  {/* Local */}
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden relative">
                    {isVideoOff ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                        <VideoOff size={48} className="text-slate-700" />
                      </div>
                    ) : (
                      <video ref={localVideoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                    )}
                    <div className="absolute bottom-3 left-3 z-20 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-white text-xs font-bold">
                      You {isScreenSharingInCall && '(Screen)'}
                    </div>
                  </div>
                </div>
              ) : (
                /* Voice call — full centered avatar layout */
                <div className="w-full h-full flex flex-col items-center justify-center gap-6">
                  {/* Animated ring + avatar */}
                  <div className="relative flex items-center justify-center">
                    {callStatus === 'connected' && (
                      <>
                        <div className="absolute w-52 h-52 rounded-full border-2 border-blue-500/20 animate-ping" />
                        <div className="absolute w-44 h-44 rounded-full border-2 border-blue-500/30 animate-pulse" />
                      </>
                    )}
                    {callStatus === 'calling' && (
                      <div className="absolute w-44 h-44 rounded-full border-2 border-yellow-500/30 animate-ping" />
                    )}
                    <div className="w-36 h-36 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-5xl font-black text-white shadow-2xl shadow-blue-600/30 z-10">
                      {selectedRecipients[0] === 'admin'
                        ? 'A'
                        : (employees.find(e => e.uid === selectedRecipients[0])?.displayName?.charAt(0)?.toUpperCase() ?? '?')}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-white">
                      {selectedRecipients[0] === 'admin' ? 'Admin Support' : employees.find(e => e.uid === selectedRecipients[0])?.displayName}
                    </p>
                    <p className={`text-sm font-bold mt-1 ${callStatus === 'connected' ? 'text-green-400' : 'text-yellow-400'}`}>
                      {callStatus === 'calling' ? '🔔 Ringing...' : callStatus === 'connected' ? '🎙️ Voice Call Active' : callStatus}
                    </p>
                    {callStatus === 'connected' && (
                      <p className="text-slate-500 font-mono text-lg mt-2">{formatTime(callDuration)}</p>
                    )}
                  </div>
                  {/* Hidden audio elements */}
                  <video ref={remoteVideoRef} className="hidden" autoPlay playsInline />
                  <video ref={localVideoRef} className="hidden" autoPlay muted playsInline />
                </div>
              )}
            </div>

            {/* Control buttons — always visible, never overflow */}
            <div className="shrink-0 px-6 py-5 flex items-center justify-center flex-wrap gap-4">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-1 transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                <span className="text-[8px] font-black uppercase tracking-wide">{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              {callType === 'video' && (
                <>
                  <button
                    onClick={() => setIsVideoOff(!isVideoOff)}
                    className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-1 transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
                    <span className="text-[8px] font-black uppercase tracking-wide">{isVideoOff ? 'Show' : 'Hide'}</span>
                  </button>
                  <button
                    onClick={toggleScreenShareInCall}
                    className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-1 transition-all ${isScreenSharingInCall ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    <Monitor size={22} />
                    <span className="text-[8px] font-black uppercase tracking-wide">Screen</span>
                  </button>
                </>
              )}

              <button
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-600 text-white flex flex-col items-center justify-center gap-1 hover:bg-red-500 transition-all shadow-xl shadow-red-600/20 active:scale-95"
              >
                <PhoneOff size={24} />
                <span className="text-[8px] font-black uppercase tracking-wide">End</span>
              </button>
            </div>

          </div>
        </div>
      )}
      {/* Overtime Request Modal - shown in the last 1 hour before auto-logout */}
      {showOvertimeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="w-full max-w-sm bg-slate-900 border-2 border-amber-500/30 rounded-[3rem] p-8 text-center shadow-2xl">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Clock size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Need Extra Time?</h3>
            <p className="text-slate-400 mb-6 text-sm leading-relaxed">
              Your session will end automatically in under an hour. If you need to keep working, choose how much extra time you need — it will be paid at <span className="text-amber-400 font-bold">2x rate</span>.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[30, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  onClick={() => requestOvertime(mins)}
                  className="py-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 font-bold transition-all"
                >
                  +{mins} min
                </button>
              ))}
            </div>
            <button
              onClick={() => requestOvertime(0)}
              className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
            >
              No, end on time
            </button>
          </div>
        </div>
      )}
      {/* Incoming Call / Monitor Request Ringing Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
           <div className="w-full max-w-sm bg-slate-900 border-2 border-blue-500/30 rounded-[3rem] p-10 text-center shadow-2xl relative overflow-hidden">
              {/* Pulsing Background */}
              <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
              
              <div className="relative z-10 flex flex-col items-center">
                 <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white mb-6 animate-bounce shadow-xl shadow-blue-600/20">
                    {incomingCall.context === 'mon' ? <Monitor size={48} /> : (incomingCall.type === 'video' ? <Video size={48} /> : <Phone size={48} />)}
                 </div>
                 
                 <h2 className="text-2xl font-black text-white mb-2">{incomingCall.fromName || 'Admin'}</h2>
                 <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-10">
                   {incomingCall.context === 'mon' ? 'Requesting Live Monitoring' : `Incoming ${incomingCall.type || 'Video'} Call`}
                 </p>
                 
                 <div className="flex gap-4 w-full">
                    <button 
                      onClick={declineCall}
                      className="flex-1 h-16 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-2xl flex items-center justify-center transition-all group active:scale-95 border border-red-600/20"
                    >
                       <X size={32} />
                    </button>
                    <button 
                      onClick={acceptCall}
                      className="flex-[3] h-16 bg-green-600 hover:bg-green-500 text-white rounded-2xl flex items-center justify-center font-black text-lg gap-3 transition-all shadow-xl shadow-green-600/20 active:scale-95"
                    >
                       <Phone /> Accept
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Request Messaging Modal */}
          {/* Confirmation Modal */}
          {confirmModal.show && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${
                  confirmModal.type === 'logout' ? 'bg-red-500/20 text-red-500' :
                  confirmModal.type === 'leave' ? 'bg-purple-500/20 text-purple-500' :
                  'bg-blue-500/20 text-blue-500'
                }`}>
                  {confirmModal.type === 'logout' ? <LogOut size={32} /> :
                   confirmModal.type === 'leave' ? <Calendar size={32} /> :
                   <Play size={32} />}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{confirmModal.title}</h3>
                <p className="text-slate-400 mb-8 leading-relaxed">{confirmModal.message}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                    className="flex-1 py-4 rounded-2xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (confirmModal.loading) return;
                      await confirmModal.onConfirm();
                      // Modal is closed inside onConfirm (startWork) or here if it wasn't async
                      if (confirmModal.type !== 'session') {
                        setConfirmModal(prev => ({ ...prev, show: false }));
                      }
                    }}
                    disabled={confirmModal.loading}
                    className={`flex-1 py-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
                      confirmModal.type === 'logout' ? 'bg-red-600 hover:bg-red-500' :
                      confirmModal.type === 'leave' ? 'bg-purple-600 hover:bg-purple-500' :
                      'bg-blue-600 hover:bg-blue-500'
                    } disabled:opacity-50`}
                  >
                    {confirmModal.loading && <Loader2 className="animate-spin" size={20} />}
                    {confirmModal.loading ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showRequestModal && requestRecipient && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md max-h-[95vh] overflow-y-auto custom-scrollbar shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">Request Access</h2>
            <p className="text-slate-400 mb-6">You need admin approval to message {requestRecipient.displayName} from {requestRecipient.position} position.</p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setShowRequestModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => requestMessaging(requestRecipient)}
                disabled={isRequestingMessaging}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {isRequestingMessaging ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 duration-200 p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-600/10 rounded-2xl flex items-center justify-center text-purple-500">
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Request Leave</h2>
                <p className="text-slate-400 text-sm">Submit your leave application for approval</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Start Date</label>
                  <input 
                    type="date" 
                    value={leaveData.startDate}
                    onChange={(e) => setLeaveData(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">End Date</label>
                  <input 
                    type="date" 
                    value={leaveData.endDate}
                    onChange={(e) => setLeaveData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Reason</label>
                <textarea 
                  value={leaveData.reason}
                  onChange={(e) => setLeaveData(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Why are you taking leave?"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white h-32 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowLeaveModal(false)}
                  className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={submitLeaveRequest}
                  className="flex-3 py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-purple-600/20"
                >
                  Submit Application
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* On Leave Overlay */}
      {isOnLeave && (
        <div className="fixed inset-0 z-[1000] bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
           <div className="w-32 h-32 bg-purple-600/20 rounded-full flex items-center justify-center text-purple-500 mb-8 animate-pulse shadow-2xl shadow-purple-600/20">
              <CalendarOff size={64} />
           </div>
           <h1 className="text-4xl font-black text-white mb-4">Approval Active: You are on Leave</h1>
           <p className="text-slate-400 max-w-md text-lg leading-relaxed">
             System access is temporarily restricted during your approved leave period. 
             If this is an error, please contact your administrator.
           </p>
           <button onClick={onLogout} className="mt-12 flex items-center gap-3 bg-red-600 hover:bg-red-500 text-white px-10 py-5 rounded-2xl font-black transition-all shadow-xl shadow-red-600/20 active:scale-95">
             <LogOut size={24} /> Logout
           </button>
        </div>
      )}

      {/* Break Restrictor removed per user request to allow dashboard access during break */}
      
      {/* Notification Center Modal */}
      {showNotificationCenter && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2.5rem] shadow-2xl max-h-[95vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500">
                  <Bell size={24} />
                </div>
                <h2 className="text-2xl font-bold">Notifications</h2>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={async () => {
                    await supabase.from('alerts').update({ status: 'read' }).eq('userId', user.uid).eq('status', 'new');
                    fetchAlerts();
                  }}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 px-3 py-1 bg-blue-500/5 rounded-lg transition-colors"
                >
                  Mark all as read
                </button>
                <button 
                  onClick={() => setShowNotificationCenter(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                      <BellOff size={32} />
                    </div>
                    <p className="text-slate-500 font-medium">No notifications yet</p>
                  </div>
                ) : (
                  alerts.map(alert => (
                    <div 
                      key={alert.id} 
                      className={`p-4 rounded-2xl border transition-all ${
                        alert.status === 'new' 
                          ? 'bg-blue-600/5 border-blue-500/20' 
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className={`p-2 rounded-xl h-fit ${
                          alert.type === 'face_mismatch' || alert.type === 'continuous_mismatch' ? 'bg-red-500/10 text-red-500' :
                          alert.type === 'leave_request' ? 'bg-purple-500/10 text-purple-500' :
                          'bg-blue-500/10 text-blue-500'
                        }`}>
                          {alert.type === 'face_mismatch' || alert.type === 'continuous_mismatch' ? <ShieldAlert size={18} /> :
                           alert.type === 'leave_request' ? <Calendar size={18} /> :
                           <Bell size={18} />}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-slate-200 text-sm">
                            {alert.type === 'face_mismatch' ? 'Face Mismatch Alert' : 
                             alert.type === 'continuous_mismatch' ? 'Identity Verification Required' :
                             alert.type === 'leave_request' ? `Leave Request ${alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}` :
                             'System Notification'}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">{alert.details}</p>
                          <p className="text-[10px] text-slate-600 mt-2 font-mono">{formatSafe(alert.timestamp || alert.created_at || alert.createdat, 'MMM d, h:mm a')}</p>
                        </div>
                        {alert.status === 'new' && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="p-6 bg-slate-950/50 border-t border-slate-800">
              <button 
                onClick={async () => {
                  if (confirm('Are you sure you want to clear all notifications?')) {
                    await supabase.from('alerts').delete().eq('userId', user.uid);
                    fetchAlerts();
                  }
                }}
                className="w-full py-3 text-xs font-black text-red-500 uppercase tracking-widest hover:bg-red-500/5 rounded-xl transition-all"
              >
                Clear All Notifications
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Achievement Modal */}
      
      {/* Monitor Notification Popup */}
      {monitorNotification.show && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-10 fade-in duration-500">
          <div className="bg-blue-600 border-2 border-blue-400 text-white px-8 py-5 rounded-[2rem] shadow-2xl flex items-center gap-4 backdrop-blur-xl">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
              <Activity className="text-white" size={24} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest opacity-80">Security Alert</p>
              <p className="font-bold text-lg">{monitorNotification.message}</p>
            </div>
          </div>
        </div>
      )}
        </div>
    </div>
  );
};
