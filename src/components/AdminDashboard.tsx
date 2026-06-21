import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { createTonePlayer, getInitials, getAvatarColor, shouldGroupWithPrevious } from '../lib/utils';
import * as faceapi from 'face-api.js';
import { jsPDF } from 'jspdf';
import { UserProfile, WorkSession, PaymentRecord, UserStatus, MessageRequest, Team } from '../types';
import { 
  Users, 
  Clock, 
  DollarSign, 
  CheckCircle, 
  AlertCircle,
  TrendingUp,
  Search,
  MoreVertical,
  Plus,
  LogOut,
  Activity,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Monitor,
  LayoutDashboard,
  FileText,
  Calendar,
  Menu,
  X,
  AlertTriangle,
  MessageSquare,
  Hash,
  Download,
  Camera,
  CameraOff,
  ExternalLink,
  Edit,
  Trash2,
  Eraser,
  Play,
  Loader2,
  Paperclip,
  Phone,
  Video,
  File,
  XCircle,
  Mic,
  MicOff,
  VideoOff,
  Maximize2,
  Minimize2,
  PhoneOff,
  Bell,
  BellOff,
  User,
  Database,
  RefreshCw,
  Check,
  CheckCheck,
  Eye,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, startOfWeek, endOfWeek, subDays, differenceInDays, isToday, isYesterday } from 'date-fns';
import { LiveWebRTCMonitor } from './LiveWebRTCMonitor';

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

const safeFormatDate = (date: any, formatStr: string) => {
  if (!date) return 'N/A';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return format(d, formatStr);
  } catch (e) {
    return 'N/A';
  }
};

export const AdminDashboard: React.FC<{ user: UserProfile; onLogout: () => void }> = ({ user, onLogout }) => {
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const employeesRef = useRef(employees);
  useEffect(() => { employeesRef.current = employees; }, [employees]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [isInCall, setIsInCall] = useState(false);
  const [callBusyUser, setCallBusyUser] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'summary' | 'management' | 'report' | 'live' | 'teams' | 'payments' | 'messages' | 'meetings' | 'leaves'>('summary');
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<UserProfile | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showEmployeeDetails, setShowEmployeeDetails] = useState<UserProfile | null>(null);
  const [liveSearchTerm, setLiveSearchTerm] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [pendingSearchTerm, setPendingSearchTerm] = useState('');
  const [approvedSearchTerm, setApprovedSearchTerm] = useState('');
  const [paidSearchTerm, setPaidSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageRecipient, setMessageRecipient] = useState<string[]>([]);
  const [messageContent, setMessageContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [newEmployee, setNewEmployee] = useState({
    displayName: '',
    email: '',
    specialCode: '',
    hourlyRate: 500,
    payoutFrequency: 'monthly' as 'daily' | 'weekly' | 'monthly',
    position: '',
    team_id: '',
    standardWorkingHours: 8,
    role: 'employee' as 'employee' | 'admin' | 'ceo' | 'founder',
    facePhoto: null as File | null
  });
  const [paidOutFilter, setPaidOutFilter] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'all'>('all');
  const [isResettingPaidOut, setIsResettingPaidOut] = useState(false);
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingPayroll, setIsGeneratingPayroll] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSingleLiveCast, setShowSingleLiveCast] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showLiveViewModal, setShowLiveViewModal] = useState(false);
  const [monitoredEmployees, setMonitoredEmployees] = useState<Set<string>>(new Set());
  const [monitoredEmployeesData, setMonitoredEmployeesData] = useState<Map<string, { streams: MediaStream[], isFaceMatched: boolean }>>(new Map());
  const monitoringChannelsRef = useRef<Map<string, any>>(new Map());
  const monitoredPCsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const pendingCallIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const joiningChannelsRef = useRef<Set<string>>(new Set());

  const cleanup = useCallback((topic: string) => {
    const existing = supabase.getChannels().find(c => c.topic === (topic.startsWith('realtime:') ? topic : `realtime:${topic}`));
    if (existing) supabase.removeChannel(existing);
  }, []);

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

  // Monitoring Signaling Effect
  useEffect(() => {
    // Cleanup old set of monitored employees
    monitoringChannelsRef.current.forEach((channel, uid) => {
      if (!monitoredEmployees.has(uid)) {
        safeSend(channel, 'stop-live-stream', { fromId: user.uid });
        channel.unsubscribe();
        monitoringChannelsRef.current.delete(uid);
      }
    });

    // Sub to new ones
    monitoredEmployees.forEach(uid => {
      // SKIP background signaling if full-view monitor is already open for this user
      // to prevent duplicate answer signaling conflicts
      if (showWebRTCMonitor && monitoringEmployee?.uid === uid) {
          if (monitoringChannelsRef.current.has(uid)) {
              const oldChan = monitoringChannelsRef.current.get(uid);
              if (oldChan) supabase.removeChannel(oldChan);
              monitoringChannelsRef.current.delete(uid);
          }
          if (monitoredPCsRef.current.has(uid)) {
              const pc = monitoredPCsRef.current.get(uid);
              if (pc) {
                  pc.onicecandidate = null;
                  pc.ontrack = null;
                  pc.close();
              }
              monitoredPCsRef.current.delete(uid);
          }
          return;
      }

      if (!monitoringChannelsRef.current.has(uid)) {
        const uidChanId = `calls:${uid}`;
        cleanup(uidChanId);
        const channel = supabase.channel(uidChanId); // Use the SAME channel employee is listening for calls
        monitoringChannelsRef.current.set(uid, channel);
        
        channel.on('broadcast', { event: 'verification-status' }, ({ payload }) => {
          setMonitoredEmployeesData(prev => {
            const next = new Map(prev);
            const current = (next.get(uid) || { streams: [], isFaceMatched: false }) as { streams: MediaStream[], isFaceMatched: boolean };
            next.set(uid, { streams: current.streams, isFaceMatched: !!payload.isFaceMatched });
            return next;
          });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // REQUEST THE STREAM ONCE SUBSCRIBED
            safeSend(channel, 'request-live-stream', { fromId: user.uid, fromName: user.displayName });
          }
        });
      }
    });
  }, [monitoredEmployees, user.uid, user.displayName]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    const modals = [
      showMessageModal, showCallModal, showEmployeeDetails, 
      showNotificationCenter, showAddTeamModal, showAchievementModal, 
      showPaymentModal, showAddEmployeeModal, showSingleLiveCast,
      showLiveViewModal
    ];
    if (modals.some(m => !!m)) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showMessageModal, showCallModal, showEmployeeDetails, showNotificationCenter, showAddTeamModal, showAchievementModal, showPaymentModal, showAddEmployeeModal, showSingleLiveCast, showLiveViewModal]);

  const [teams, setTeams] = useState<Team[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [chatSidebarView, setChatSidebarView] = useState<'all' | 'teams' | 'direct'>('all');
  const [selectedChatUser, setSelectedChatUser] = useState<UserProfile | null>(null);
  const [selectedChatTeam, setSelectedChatTeam] = useState<Team | null>(null);
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);

  const [attachment, setAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const [chartFilter, setChartFilter] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [customModal, setCustomModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    type: 'alert'
  });

  const showAlert = (title: string, message: string) => {
    setCustomModal({ show: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setCustomModal({ show: true, title, message, type: 'confirm', onConfirm });
  };

  const deletePayment = async (id: string) => {
    showConfirm('Delete Payment', 'Are you sure you want to delete this payment record?', async () => {
      try {
        const { error } = await supabase.from('payments').delete().eq('id', id);
        if (error) throw error;
        showAlert('Success', 'Payment record deleted!');
        fetchData();
      } catch (err: any) {
        showAlert('Error', `Failed to delete payment: ${err.message}`);
      }
    });
  };

  const clearAlerts = async () => {
    showConfirm('Clear Alerts', 'Are you sure you want to clear all security alerts?', async () => {
      const { error } = await supabase.from('alerts').delete().in('type', ['face_mismatch', 'continuous_mismatch']);
      if (error) showAlert('Error', error.message);
      else {
        showAlert('Success', 'Security alerts cleared!');
        fetchData();
      }
    });
  };

  const deleteAlert = async (id: string) => {
    const { error } = await supabase.from('alerts').delete().eq('id', id);
    if (error) showAlert('Error', error.message);
    else fetchData();
  };

  const handleLeaveApproval = async (id: string, status: 'approved' | 'rejected', isPaid: boolean, adminComment: string) => {
    try {
      // NOTE: the leave_requests table only has: id, userId, employeeName, employeeCode,
      // startDate, endDate, reason, status, timestamp. Columns like isPaid, leave_type,
      // adminComment, decisionDate do NOT exist in the schema - updating them threw a
      // "column does not exist" error every time, which meant `status` never actually
      // got updated and Approve/Reject silently did nothing. We update `status` first
      // (guaranteed to exist) and only best-effort try the extra metadata afterward.
      const { error } = await supabase
        .from('leave_requests')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      // Best-effort: store paid/unpaid + admin note if those columns happen to exist.
      // Failure here must NOT block the approval itself.
      try {
        await supabase
          .from('leave_requests')
          .update({
            isPaid,
            leave_type: isPaid ? 'paid' : 'unpaid',
            adminComment,
            decisionDate: new Date().toISOString()
          })
          .eq('id', id);
      } catch (metaErr) {
        console.warn('Optional leave metadata columns not available:', metaErr);
      }

      // Notify the employee in real time so their access updates immediately,
      // without waiting for a page refresh.
      const leave = leaveRequests.find(l => l.id === id);
      if (leave) {
        oneShotSend(`calls:${leave.userId}`, 'leave-updated', {
          status,
          message: `Your leave request from ${leave.startDate} to ${leave.endDate} has been ${status}.`
        });
      }
      
      showAlert('Success', `Leave request ${status}!`);
      fetchData();
    } catch (err: any) {
      showAlert('Error', `Failed to update leave: ${err.message}`);
    }
  };
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [selectedReportDate, setSelectedReportDate] = useState(safeFormatDate(new Date(), 'yyyy-MM-dd'));
  const [achievementEmployee, setAchievementEmployee] = useState<UserProfile | null>(null);
  const [achievementTitle, setAchievementTitle] = useState('');
  const [bonusAmount, setBonusAmount] = useState('');
  const [newTeam, setNewTeam] = useState({ name: '', memberIds: [] as string[], uniqueCode: '' });
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isMonitoringLive, setIsMonitoringLive] = useState(false);
  const [showWebRTCMonitor, setShowWebRTCMonitor] = useState(false);
  const [monitoringEmployee, setMonitoringEmployee] = useState<UserProfile | null>(null);
  
  // Call states
  const [callEmployee, setCallEmployee] = useState<UserProfile | null>(null);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended' | 'busy'>('idle');
  const [callType, setCallType] = useState<'voice' | 'video'>('video');
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const isInCallRef = useRef(isInCall);
  const incomingCallRef = useRef(incomingCall);
  
  useEffect(() => { isInCallRef.current = isInCall; }, [isInCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const callPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const callSignalingChannelRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const notificationSound = useRef<HTMLAudioElement | null>(null);
  const busyToneRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Reliable, network-free ring tones (no dead-link/CORS risk)
  const ringtonePlayerRef = useRef(createTonePlayer('incoming'));
  const ringbackPlayerRef = useRef(createTonePlayer('outgoing'));

  useEffect(() => {
    notificationSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    busyToneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const playNotification = () => {
    if (notificationSound.current) {
      // Sound disabled per user request
      // notificationSound.current.play().catch(e => console.log('Audio play failed:', e));
    }
  };

  // Consolidated Signaling: Main effect handles everything reliably
  useEffect(() => {
    if (!user.uid) return;

    const callChan = `calls:${user.uid}`;
    cleanup(callChan);
    const callsChannel = supabase.channel(callChan, {
      config: { broadcast: { self: false } }
    });
    callSignalingChannelRef.current = callsChannel;

    const adminSupportChan = supabase.channel('calls:admin', {
      config: { broadcast: { self: false } }
    });

    const setupCallHandlers = (channel: any) => {
      channel
        .on('broadcast', { event: 'incoming-call' }, ({ payload }) => {
          if (isInCallRef.current || incomingCallRef.current) {
            oneShotSend(`calls:${payload.fromId}`, 'call-busy', { from: user.displayName, fromId: user.uid });
          } else {
            setCallType(payload.type);
            setIncomingCall({ ...payload, context: 'call' });
            setCallStatus('calling');
            playIncomingCallTone();
            
            // Set callEmployee so we know who we are talking to
            const sender = employeesRef.current.find(e => e.uid === payload.fromId);
            if (sender) setCallEmployee(sender);
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
            setCallEmployee(null);
            setShowCallModal(false);
            setCallBusyUser(null);
            setIsInCall(false);
          }, 4000);
        })
        .on('broadcast', { event: 'webrtc-call-answer' }, async ({ payload }) => {
          stopRingbackTone();
          stopIncomingCallTone();
          if (callPeerConnectionRef.current) {
            console.log('Received webrtc-call-answer, setting remote description...');
            await callPeerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload)).catch(console.error);
            
            // Drain buffered candidates
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
            if (callPeerConnectionRef.current.remoteDescription && callPeerConnectionRef.current.signalingState !== 'closed') {
              try {
                await callPeerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload));
              } catch (e) { console.error('ICE candidate error (call):', e); }
            } else {
              pendingCallIceCandidatesRef.current.push(payload);
            }
          }
        })
        .on('broadcast', { event: 'verification-status' }, ({ payload }) => {
          setEmployees(prev => prev.map(emp => 
            emp.uid === payload.fromId 
              ? { ...emp, isVerified: payload.isVerified, isFaceMatched: payload.isFaceMatched } 
              : emp
          ));
        })
        .on('broadcast', { event: 'monitor-error' }, ({ payload }) => {
          showAlert('Monitoring Alert', payload.message || 'An error occurred during live monitoring.');
          setCallStatus('idle');
          setCallEmployee(null);
          setShowCallModal(false);
          setIsInCall(false);
        })
        .on('broadcast', { event: 'call-ended' }, () => {
          stopIncomingCallTone();
          endCall();
        });
    };

    setupCallHandlers(callsChannel);
    setupCallHandlers(adminSupportChan);
    
    callsChannel.subscribe();
    adminSupportChan.subscribe();

    return () => {
      if (callsChannel) callsChannel.unsubscribe();
      if (adminSupportChan) adminSupportChan.unsubscribe();
    };
  }, [user.uid, cleanup]);

  // Removed dangerous internal safeFormatDate as it was moved above for initialization visibility

   // initiateCall is defined lower down as a proxy to unified startCall

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

  const endCall = () => {
    stopIncomingCallTone();
    stopRingbackTone();
    if (callPeerConnectionRef.current) {
      callPeerConnectionRef.current.close();
      callPeerConnectionRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setShowCallModal(false);
    const targetId = callEmployee?.uid || incomingCall?.fromId || selectedChatUser?.uid;
    if (targetId) {
      oneShotSend(`calls:${targetId}`, 'call-ended', {});
    }

    setCallStatus('idle');
    setCallEmployee(null);
    setIncomingCall(null);
    setIsInCall(false);
    setCallBusyUser(null);
    stopIncomingCallTone();
    stopRingbackTone();
  };

  useEffect(() => {
    const updateMonitoringStatus = async () => {
      const isLive = activeTab === 'live';
      setIsMonitoringLive(isLive);
      
      // Update all active employees to start/stop live monitoring
      const activeEmployeeIds = employees.filter(e => e.status === 'active' || e.status === 'away' || e.status === 'break').map(e => e.uid);
      
      if (activeEmployeeIds.length > 0) {
        await supabase
          .from('users')
          .update({ isMonitoringLive: isLive })
          .in('uid', activeEmployeeIds);
      }
    };
    
    updateMonitoringStatus();
  }, [activeTab]);

  const resetPaidOut = async () => {
    showConfirm('Reset Payouts', 'Are you sure you want to reset all paid records? This will archive them in history and clear the current list for a new cycle.', async () => {
      try {
        const { error } = await supabase
          .from('payments')
          .update({ status: 'archived' })
          .eq('status', 'paid');
        
        if (error) throw error;
        
        const { data } = await supabase.from('payments').select('*').order('createdAt', { ascending: false });
        if (data) setPayments(data as PaymentRecord[]);
        
        showAlert('Success', 'Payouts reset and archived successfully!');
      } catch (err: any) {
        showAlert('Error', `Failed to reset payouts: ${err.message}`);
      }
    });
  };
  const [isEditingEmployee, setIsEditingEmployee] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isScreenSharingInCall, setIsScreenSharingInCall] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const canManageTeams = user.role === 'ceo' || user.role === 'founder' || user.role === 'admin';

  const generateUniqueCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeam.name.trim()) {
      showAlert('Error', 'Please enter a team name.');
      return;
    }
    if (newTeam.memberIds.length === 0) {
      showAlert('Error', 'Please select at least one member for the team.');
      return;
    }

    try {
      if (selectedTeam) {
        const payload: any = {
          name: newTeam.name || selectedTeam.name,
          memberIds: newTeam.memberIds,
          uniqueCode: selectedTeam.uniqueCode || generateUniqueCode()
        };
        
        let { error } = await supabase.from('teams').update(payload).eq('id', selectedTeam.id);
        
        if (error) {
          const snakePayload = {
            name: payload.name,
            member_ids: payload.memberIds,
            unique_code: payload.uniqueCode
          };
          const { error: err2 } = await supabase.from('teams').update(snakePayload).eq('id', selectedTeam.id);
          if (err2) throw err2;
        }

        // Update all members to have this team association
        if (newTeam.memberIds.length > 0) {
          await supabase.from('users').update({ team_id: selectedTeam.id, teamCode: payload.name }).in('uid', newTeam.memberIds);
        }

        showAlert('Success', 'Team updated successfully!');
      } else {
        const teamId = crypto.randomUUID();
        const payload: any = {
          id: teamId,
          name: newTeam.name,
          uniqueCode: generateUniqueCode(),
          memberIds: newTeam.memberIds,
          createdAt: new Date().toISOString()
        };
        
        let { error } = await supabase.from('teams').insert(payload);
        
        if (error) {
          const snakePayload = {
            id: teamId,
            name: payload.name,
            unique_code: payload.uniqueCode,
            member_ids: payload.memberIds,
            created_at: payload.createdAt
          };
          const { error: err2 } = await supabase.from('teams').insert(snakePayload);
          if (err2) throw err2;
        }

        // Update all members to have this team association
        if (newTeam.memberIds.length > 0) {
          await supabase.from('users').update({ team_id: teamId, teamCode: payload.name }).in('uid', newTeam.memberIds);
        }

        showAlert('Success', 'Team created successfully!');
      }

      setShowAddTeamModal(false);
      setSelectedTeam(null);
      setNewTeam({ name: '', memberIds: [] as string[], uniqueCode: '' });
      setTeamSearchTerm('');
      
      // Refresh teams
      const { data } = await supabase.from('teams').select('*');
      if (data) setTeams(data);
      
      showAlert('Success', selectedTeam ? 'Team updated successfully!' : 'Team created successfully!');
    } catch (err: any) {
      console.error('Error saving team:', err);
      const msg = (err.message || '').toLowerCase();
      
      const isTableMissing = msg.includes('relation "teams" does not exist') || 
                             msg.includes('could not find the table') ||
                             (msg.includes('teams') && msg.includes('not found') && !msg.includes('column'));
                             
      if (isTableMissing) {
        showAlert('Database Setup Required', 
          'The "teams" table does not exist. Please run the SQL from DATABASE_FIX.md in your Supabase SQL Editor.');
      } else if (msg.includes('column') && msg.includes('does not exist')) {
        showAlert('Update Required', 
          `A required column is missing in your "teams" table: ${err.message}. Please run the ALTER TABLE section in DATABASE_FIX.md.`);
      } else {
        showAlert('Error', `Failed to save team: ${err.message}`);
      }
    }
  };

  const handleAddAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!achievementEmployee || !achievementTitle) return;

    try {
      const currentAchievements = achievementEmployee.achievements || [];
      const { error: userError } = await supabase
        .from('users')
        .update({
          achievements: [...currentAchievements, achievementTitle]
        })
        .eq('uid', achievementEmployee.uid);

      if (userError) throw userError;

      if (bonusAmount && parseFloat(bonusAmount) > 0) {
        const { error: payError } = await supabase
          .from('payments')
          .insert({
            userId: achievementEmployee.uid,
            employeeName: achievementEmployee.displayName,
            amount: 0,
            bonus: parseFloat(bonusAmount),
            status: 'approved',
            periodStart: safeFormatDate(new Date(), 'yyyy-MM-dd'),
            periodEnd: safeFormatDate(new Date(), 'yyyy-MM-dd'),
            createdAt: new Date().toISOString()
          });
        if (payError) throw payError;
      }

      setShowAchievementModal(false);
      setAchievementEmployee(null);
      setAchievementTitle('');
      setBonusAmount('');
      showAlert('Success', 'Achievement and bonus added!');
    } catch (err: any) {
      showAlert('Error', `Failed: ${err.message}`);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newEmployee.facePhoto && !isEditingEmployee) {
      showAlert('Error', 'Please select a face photo for the employee.');
      return;
    }

    if (!modelsLoaded && newEmployee.facePhoto) {
      showAlert('Wait', 'AI models are still loading. Please wait a few seconds and try again.');
      return;
    }

    setIsExtracting(true);
    try {
      let faceDescriptor = null;
      let publicUrl = null;

      if (newEmployee.facePhoto) {
        // 1. Extract face descriptor
        const img = await faceapi.bufferToImage(newEmployee.facePhoto);
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        
        if (!detection) {
          showAlert('Error', 'No face detected in the photo. Please try another one.');
          setIsExtracting(false);
          return;
        }

        faceDescriptor = Array.from(detection.descriptor);

        // 2. Upload photo to Supabase Storage
        const fileName = `${Date.now()}-${newEmployee.displayName.replace(/\s+/g, '_')}`;
        try {
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('face-photos')
            .upload(fileName, newEmployee.facePhoto);

          if (uploadError) throw uploadError;

          const { data: { publicUrl: url } } = supabase.storage
            .from('face-photos')
            .getPublicUrl(fileName);
          
          publicUrl = url;
        } catch (storageErr: any) {
          console.error('Storage error:', storageErr);
          throw new Error(`Storage Error: ${storageErr.message}. Make sure the "face-photos" bucket exists and is public in Supabase Storage.`);
        }
      }

      // ── Smart column-stripping insert/update ────────────────────────────
      // Extracts the failing column name from Supabase error messages and
      // retries automatically, stripping one bad column per attempt.
      const extractBadColumn = (msg: string): string | null => {
        // Pattern: "Could not find the 'colName' column"
        const m1 = msg.match(/find the '([^']+)' column/i);
        if (m1) return m1[1];
        // Pattern: "column "colName" of relation"
        const m2 = msg.match(/column "([^"]+)" of relation/i);
        if (m2) return m2[1];
        return null;
      };

      const smartUpsert = async (data: Record<string, any>, table: string, isUpdate: boolean, matchCol?: string, matchVal?: string): Promise<void> => {
        let payload = { ...data };
        let attempts = 0;
        const MAX_ATTEMPTS = 20; // strip up to 20 bad columns before giving up

        while (attempts < MAX_ATTEMPTS) {
          const op = isUpdate
            ? supabase.from(table).update(payload).eq(matchCol!, matchVal!)
            : supabase.from(table).insert(payload);

          const { error } = await op;

          if (!error) return; // success

          const msg = error.message || '';
          const bad = extractBadColumn(msg);

          if (bad && bad in payload) {
            // Strip the bad column and retry
            console.warn(`Stripping unsupported column "${bad}" and retrying...`);
            delete payload[bad];
            attempts++;
            continue;
          }

          // Non-column error — throw it
          throw new Error(msg);
        }

        throw new Error('Could not save employee after stripping all unsupported columns. Please run DATABASE_SETUP.md SQL in Supabase.');
      };

      if (isEditingEmployee && editingEmployeeId) {
        const updateData: Record<string, any> = {
          displayName: newEmployee.displayName,
          email: newEmployee.email,
          specialCode: newEmployee.specialCode,
          hourlyRate: newEmployee.hourlyRate,
          position: newEmployee.position || null,
          role: newEmployee.role,
          team_id: newEmployee.team_id || null,
          standardWorkingHours: newEmployee.standardWorkingHours,
          lastActive: new Date().toISOString()
        };
        if (faceDescriptor) updateData.faceDescriptor = faceDescriptor;
        if (publicUrl) updateData.facePhotoUrl = publicUrl;

        await smartUpsert(updateData, 'users', true, 'uid', editingEmployeeId);
        showAlert('Success', 'Employee updated successfully!');
      } else {
        const uid = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

        const insertData: Record<string, any> = {
          uid,
          displayName: newEmployee.displayName,
          email: newEmployee.email,
          specialCode: newEmployee.specialCode,
          hourlyRate: newEmployee.hourlyRate || 0,
          role: newEmployee.role || 'employee',
          status: 'offline',
          lastActive: new Date().toISOString(),
          faceDescriptor,
          facePhotoUrl: publicUrl,
          position: newEmployee.position || null,
          team_id: newEmployee.team_id || null,
          standardWorkingHours: newEmployee.standardWorkingHours || 8
        };

        await smartUpsert(insertData, 'users', false);
        showAlert('Success', 'Employee added successfully!');
        fetchData();
      }

      setShowAddEmployeeModal(false);
      setIsEditingEmployee(false);
      setEditingEmployeeId(null);
      setNewEmployee({ 
        displayName: '', 
        email: '', 
        specialCode: '', 
        hourlyRate: 500, 
        payoutFrequency: 'monthly', 
        position: '',
        team_id: '',
        standardWorkingHours: 8,
        facePhoto: null 
      });
    } catch (err: any) {
      console.error('Error saving employee:', err);
      if (err.message.includes('Unable to add')) {
        showAlert('Error', err.message);
      } else if (err.message.includes('Database Schema Outdated')) {
        showAlert('Error', err.message);
      } else {
        showAlert('Error', `Unable to add employee: ${err.message || 'Unknown error'}. Please check your database connection and storage bucket.`);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDeleteEmployee = async (uid: string) => {
    showConfirm('Delete Employee', 'Are you sure you want to delete this employee? This will also delete all their sessions, payments, and alerts. This action cannot be undone.', async () => {
      try {
        // 1. Delete related data first to avoid foreign key violations
        const tables = ['sessions', 'payments', 'alerts', 'messages'];
        for (const table of tables) {
          try {
            if (table === 'messages') {
              await supabase.from(table).delete().eq('senderId', uid);
            } else {
              await supabase.from(table).delete().eq('userId', uid);
            }
          } catch (e) {
            console.warn(`Could not delete from ${table}:`, e);
          }
        }

        try {
          await supabase.from('message_requests').delete().or(`senderId.eq.${uid},receiverId.eq.${uid}`);
        } catch (e) {
          console.warn(`Could not delete from message_requests:`, e);
        }
        
        // 2. Delete the user
        const { error } = await supabase.from('users').delete().eq('uid', uid);
        if (error) throw new Error(`Unable to delete employee: ${error.message}`);
        
        showAlert('Success', 'Employee and all related data deleted successfully!');
        fetchData();
      } catch (err: any) {
        console.error('Delete error:', err);
        showAlert('Error', err.message || 'Unable to delete employee. Please check your database connection.');
      }
    });
  };

  const handleBulkStatusChange = async (newStatus: UserStatus) => {
    if (selectedEmployees.length === 0) return;
    
    showConfirm('Bulk Status Change', `Are you sure you want to change the status of ${selectedEmployees.length} employees to ${newStatus}?`, async () => {
      try {
        const { error } = await supabase
          .from('users')
          .update({ status: newStatus })
          .in('uid', selectedEmployees);
        
        if (error) throw error;
        
        showAlert('Success', `Status updated for ${selectedEmployees.length} employees!`);
        setSelectedEmployees([]);
        fetchData();
      } catch (err: any) {
        showAlert('Error', `Failed to update status: ${err.message}`);
      }
    });
  };

  const handleBulkTeamAssignment = async (team_id: string) => {
    if (selectedEmployees.length === 0) return;
    
    showConfirm('Bulk Team Assignment', `Assign ${selectedEmployees.length} employees to team ${team_id}?`, async () => {
      try {
        const { error } = await supabase
          .from('users')
          .update({ team_id })
          .in('uid', selectedEmployees);
        
        if (error) throw error;
        
        showAlert('Success', `Assigned ${selectedEmployees.length} employees to team ${team_id}!`);
        setSelectedEmployees([]);
        fetchData();
      } catch (err: any) {
        showAlert('Error', `Failed to assign team: ${err.message}`);
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedEmployees.length === 0) return;
    
    showConfirm('Bulk Delete', `Are you sure you want to delete ${selectedEmployees.length} employees? This will also delete all their related data. This action cannot be undone.`, async () => {
      try {
        for (const uid of selectedEmployees) {
          // Reusing logic from handleDeleteEmployee for each selected employee
          const tables = ['sessions', 'payments', 'alerts', 'messages'];
          for (const table of tables) {
            try {
              if (table === 'messages') {
                await supabase.from(table).delete().eq('senderId', uid);
              } else {
                await supabase.from(table).delete().eq('userId', uid);
              }
            } catch (e) {
              console.warn(`Could not delete from ${table} for ${uid}:`, e);
            }
          }
          try {
            await supabase.from('message_requests').delete().or(`senderId.eq.${uid},receiverId.eq.${uid}`);
          } catch (e) {
            console.warn(`Could not delete from message_requests for ${uid}:`, e);
          }
          await supabase.from('users').delete().eq('uid', uid);
        }
        
        showAlert('Success', `${selectedEmployees.length} employees deleted successfully!`);
        setSelectedEmployees([]);
        fetchData();
      } catch (err: any) {
        showAlert('Error', `Bulk delete failed: ${err.message}`);
      }
    });
  };

  const clearChat = async () => {
    showConfirm('Clear Chat', 'Are you sure you want to clear this chat for everyone? This will delete all messages in this conversation.', async () => {
      try {
        let query = supabase.from('messages').delete();
        
        if (selectedTeamId) {
          query = query.eq('teamId', selectedTeamId);
        } else {
          // For private chats, we delete messages between admin and the recipient
          const recipientId = messageRecipient[0];
          query = query.or(`and(senderId.eq.admin,receiverIds.cs.{"${recipientId}"}),and(senderId.eq.${recipientId},receiverIds.cs.{"admin"})`);
        }

        const { error } = await query;
        if (error) throw error;
        
        setMessages([]);
        showAlert('Success', 'Chat cleared successfully!');
      } catch (err: any) {
        showAlert('Error', `Failed to clear chat: ${err.message}`);
      }
    });
  };

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error('Error loading models in Admin:', err);
      }
    };
    loadModels();
  }, []);

  const fetchData = useCallback(async (retryCount = 0) => {
    try {
      // Auto-reset alerts daily at 12 AM (client-side check)
      const lastReset = localStorage.getItem('lastAlertReset');
      const today = new Date().toDateString();
      if (lastReset !== today) {
        const { error: deleteError } = await supabase.from('alerts').delete().lt('timestamp', new Date().toISOString());
        if (!deleteError) {
          localStorage.setItem('lastAlertReset', today);
        }
      }

      const { data: empData, error: empError } = await supabase.from('users').select('*').neq('uid', user.uid);
      if (empError) {
        if (empError.message.includes('schema cache') && retryCount < 3) {
          console.warn('Schema cache issue detected, retrying in 2s...');
          setTimeout(() => fetchData(retryCount + 1), 2000);
          return;
        }
        throw empError;
      }
      if (empData) setEmployees(empData);

      const { data: sessData, error: sessError } = await supabase.from('work_sessions').select('*').order('startTime', { ascending: false });
      if (sessError) {
        let { data: sessData2, error: sessError2 } = await supabase.from('work_sessions').select('*').order('start_time', { ascending: false });
        if (sessError2) {
          const { data: sessData3 } = await supabase.from('work_sessions').select('*').order('starttime', { ascending: false });
          if (sessData3) sessData2 = sessData3;
        }
        if (sessData2) setSessions(sessData2.map((s: any) => ({
          ...s,
          userId: s.userId || s.user_id || s.userid,
          startTime: s.startTime || s.start_time || s.starttime,
          endTime: s.endTime || s.end_time || s.endtime,
          totalWorkMinutes: s.totalWorkMinutes ?? s.total_work_minutes ?? s.totalworkminutes ?? 0,
          totalBreakMinutes: s.totalBreakMinutes ?? s.total_break_minutes ?? s.totalbreakminutes ?? 0,
          status: s.status || 'completed',
          date: s.date || s.session_date || s.sessiondate
        })));
      } else if (sessData) {
        setSessions(sessData.map((s: any) => ({
          ...s,
          userId: s.userId || s.user_id || s.userid,
          startTime: s.startTime || s.start_time || s.starttime,
          endTime: s.endTime || s.end_time || s.endtime,
          totalWorkMinutes: s.totalWorkMinutes ?? s.total_work_minutes ?? s.totalworkminutes ?? 0,
          totalBreakMinutes: s.totalBreakMinutes ?? s.total_break_minutes ?? s.totalbreakminutes ?? 0
        })));
      }

      const { data: payData, error: payError } = await supabase.from('payments').select('*').order('createdAt', { ascending: false });
      if (payError) {
        let { data: payData2, error: payError2 } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
        if (payError2) {
          const { data: payData3 } = await supabase.from('payments').select('*').order('createdat', { ascending: false });
          if (payData3) payData2 = payData3;
        }
        if (payData2) setPayments(payData2.map((p: any) => ({
          ...p,
          id: p.id || p.payment_id || p.paymentid,
          periodStart: p.periodStart || p.period_start || p.periodstart,
          periodEnd: p.periodEnd || p.period_end || p.periodend,
          employeeName: p.employeeName || p.employee_name || p.employeename,
          userId: p.userId || p.user_id || p.userid,
          createdAt: p.createdAt || p.created_at || p.createdat,
          status: p.status || 'pending',
          amount: p.amount || 0
        })));
      } else if (payData) {
        setPayments(payData.map((p: any) => ({
          ...p,
          id: p.id || p.payment_id || p.paymentid,
          periodStart: p.periodStart || p.period_start || p.periodstart,
          periodEnd: p.periodEnd || p.period_end || p.periodend,
          employeeName: p.employeeName || p.employee_name || p.employeename,
          userId: p.userId || p.user_id || p.userid,
          createdAt: p.createdAt || p.created_at || p.createdat,
          status: p.status || 'pending',
          amount: p.amount || 0
        })));
      }

      try {
        // Use a more robust fetching approach for leave requests
        let leaveQuery = supabase.from('leave_requests').select('*');
        const { data: leaveData, error: leaveError } = await leaveQuery;
        
        if (leaveError) {
          console.error('Leave fetch error:', leaveError);
        } else if (leaveData) {
          // Sort manually if created_at or timestamp are inconsistent
          const sorted = [...leaveData].sort((a, b) => {
            const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
            const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
            return timeB - timeA;
          });
          setLeaveRequests(sorted);
        }
      } catch (e) {
        console.error('Leave requests failure:', e);
      }

      const { data: alertData, error: alertError } = await supabase.from('alerts').select('*').order('timestamp', { ascending: false });
      if (alertError) throw alertError;
      if (alertData) setAlerts(alertData);

      const { data: msgData, error: msgError } = await supabase.from('messages').select('*').order('timestamp', { ascending: true });
      if (msgData) {
        setMessages(msgData.map(normalizeMessage));
      } else if (msgError) {
         // Retry with created_at
         const { data: m2 } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
         if (m2) setMessages(m2.map(normalizeMessage));
      }

      const { data: teamData, error: teamError } = await supabase.from('teams').select('*').order('name', { ascending: true });
      if (teamError) {
        const msg = (teamError.message || '').toLowerCase();
        if (msg.includes('not found') || msg.includes('does not exist')) {
          console.error('Teams table missing');
        } else {
          throw teamError;
        }
      }
      
      let finalTeams = teamData || [];
      if (finalTeams.length === 0) {
        // Fallback for team_records
        const { data: teamData2 } = await supabase.from('team_records').select('*');
        if (teamData2) finalTeams = teamData2;
      }

      if (finalTeams.length > 0) {
        const processedTeams = finalTeams.map((t: any) => ({
          ...t,
          memberIds: Array.isArray(t.memberIds) ? t.memberIds : (Array.isArray(t.member_ids) ? t.member_ids : []),
          uniqueCode: t.uniqueCode || t.unique_code || t.team_code || ''
        }));
        setTeams(processedTeams);
      } else {
        setTeams([]);
      }

      const { data: reqData } = await supabase.from('message_requests').select('*').order('timestamp', { ascending: false });
      if (reqData) setMessageRequests(reqData);
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
    }
  }, [user.uid, user.role]);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    fetchTimeoutRef.current = setTimeout(() => fetchData(), 2000);
  }, [fetchData]);

  const handleApproveSession = async (emp: UserProfile) => {
    try {
      // 1. Update User Profile Status
      console.log(`Approving session for ${emp.uid}...`);
      const { error: userError } = await supabase.from('users').update({ sessionApprovalStatus: 'approved' }).eq('uid', emp.uid);
      if (userError) throw userError;

      // 2. Update the related Alert status to 'approved'
      const { error: alertError } = await supabase.from('alerts')
        .update({ status: 'approved' })
        .eq('userId', emp.uid)
        .eq('type', 'session_request')
        .eq('status', 'new'); // Target the active request
      
      if (alertError) console.warn('Could not update alert status:', alertError);

      // 3. Broadcast to the Employee for immediate UI update
      oneShotSend(`calls:${emp.uid}`, 'session-approved', { approvedBy: user.displayName });

      // Update local state immediately
      setEmployees(prev => prev.map(e => e.uid === emp.uid ? { ...e, sessionApprovalStatus: 'approved' } : e));
      
      showAlert('Success', `Session approved for ${emp.displayName}. They can now start work immediately.`);
    } catch (err: any) {
      console.error('Approval error:', err);
      showAlert('Error', `Failed to approve session: ${err.message}`);
    }
  };

  const handleRejectSession = async (emp: UserProfile) => {
    try {
      // 1. Update User Profile Status
      const { error: userError } = await supabase.from('users').update({ sessionApprovalStatus: 'rejected' }).eq('uid', emp.uid);
      if (userError) throw userError;

      // 2. Update the Alert
      await supabase.from('alerts')
        .update({ status: 'rejected' })
        .eq('userId', emp.uid)
        .eq('type', 'session_request')
        .eq('status', 'new');

      setEmployees(prev => prev.map(e => e.uid === emp.uid ? { ...e, sessionApprovalStatus: 'rejected' } : e));
      showAlert('Rejected', `Session request rejected for ${emp.displayName}.`);
    } catch (err: any) {
      console.error('Rejection error:', err);
      showAlert('Error', `Failed to reject session: ${err.message}`);
    }
  };

  useEffect(() => {
    const initFetch = async () => {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    };
    initFetch();

    const usersChan = `users-all:${user.uid}`;
    cleanup(usersChan);
    const usersSub = supabase.channel(usersChan).on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload: any) => {
      if (!payload.new) return;
      const newUser = payload.new as UserProfile;
      setEmployees(prev => {
        const index = prev.findIndex(e => e.uid === newUser.uid || e.uid === (newUser as any).id);
        if (index === -1) return [...prev, newUser];
        const next = [...prev];
        next[index] = { ...next[index], ...newUser };
        return next;
      });
    }).subscribe();
    
    const sessChan = `sessions-all:${user.uid}`;
    cleanup(sessChan);
    const sessionsSub = supabase.channel(sessChan).on('postgres_changes', { event: '*', schema: 'public', table: 'work_sessions' }, () => {
      debouncedFetch();
    }).subscribe();

    const payChan = `payments-all:${user.uid}`;
    cleanup(payChan);
    const paymentsSub = supabase.channel(payChan).on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, debouncedFetch).subscribe();
    
    const alertsChan = `alerts-all:${user.uid}`;
    cleanup(alertsChan);
    const alertsSub = supabase.channel(alertsChan).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
      playNotification();
      debouncedFetch();
    }).subscribe();

    // Realtime subscription for leave_requests so admin sees new submissions instantly
    const leaveChan = `leave-requests-admin:${user.uid}`;
    cleanup(leaveChan);
    const leaveSub = supabase.channel(leaveChan).on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, (payload) => {
      playNotification();
      debouncedFetch();
    }).subscribe();

    const msgsChan = `messages-all:${user.uid}`;
    cleanup(msgsChan);
    const messagesSub = supabase.channel(msgsChan).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      const newMsg = normalizeMessage(payload.new);
      setMessages(prev => {
        if (prev.find(m => m.id === newMsg.id)) return prev;
        return [...prev, newMsg].sort((a, b) => {
          const tA = new Date(a.timestamp).getTime();
          const tB = new Date(b.timestamp).getTime();
          return (isNaN(tA) ? 0 : tA) - (isNaN(tB) ? 0 : tB);
        });
      });
      if (newMsg.senderId !== user.uid) playNotification();
    }).subscribe();

    const teamsChan = `teams-all:${user.uid}`;
    cleanup(teamsChan);
    const teamsSub = supabase.channel(teamsChan).on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, debouncedFetch).subscribe();
    
    const reqsChan = `requests-all:${user.uid}`;
    cleanup(reqsChan);
    const requestsSub = supabase.channel(reqsChan).on('postgres_changes', { event: '*', schema: 'public', table: 'message_requests' }, debouncedFetch).subscribe();

    const typeChan = `chat-typing:${user.uid}`;
    cleanup(typeChan);
    const typingSub = supabase.channel(typeChan)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        setTypingUsers(prev => ({
          ...prev,
          [payload.userId]: payload.isTyping
        }));
      })
      .subscribe();

    const syncInterval = setInterval(fetchData, 10000);

    return () => {
      supabase.removeChannel(usersSub);
      supabase.removeChannel(sessionsSub);
      supabase.removeChannel(paymentsSub);
      supabase.removeChannel(alertsSub);
      supabase.removeChannel(messagesSub);
      supabase.removeChannel(teamsSub);
      supabase.removeChannel(requestsSub);
      supabase.removeChannel(typingSub);
      clearInterval(syncInterval);
    };
  }, [fetchData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  useEffect(() => {
    if (activeTab === 'messages' && (selectedChatUser || selectedChatTeam) && callSignalingChannelRef.current) {
      safeSend(callSignalingChannelRef.current, 'typing', { userId: user.uid, userName: user.displayName, isTyping: isTyping });
    }
  }, [isTyping, activeTab, selectedChatUser, selectedChatTeam, user.uid, user.displayName]);

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 3000);
    }
  };

  const approvePayment = async (paymentId: string) => {
    let { error } = await supabase.from('payments').update({ status: 'approved' }).eq('id', paymentId);
    if (error) {
      const { error: err2 } = await supabase.from('payments').update({ status: 'approved' }).eq('payment_id', paymentId);
      error = err2;
      if (err2) {
        const { error: err3 } = await supabase.from('payments').update({ status: 'approved' }).eq('paymentid', paymentId);
        error = err3;
      }
    }
    
    if (error) {
       console.error('Approve payment failed:', error);
       showAlert('Error', 'Failed to approve payment: ' + error.message);
    } else {
      showAlert('Success', 'Payment approved successfully!');
      fetchData();
    }
  };

  const markAsPaid = async (paymentId: string) => {
    let { error } = await supabase.from('payments').update({ status: 'paid' }).eq('id', paymentId);
    if (error) {
      const { error: err2 } = await supabase.from('payments').update({ status: 'paid' }).eq('payment_id', paymentId);
      error = err2;
      if (err2) {
        const { error: err3 } = await supabase.from('payments').update({ status: 'paid' }).eq('paymentid', paymentId);
        error = err3;
      }
    }

    if (!error) {
      // Also update related sessions to 'paid'
      const { error: sessErr } = await supabase.from('work_sessions').update({ status: 'paid' }).eq('paymentId', paymentId);
      if (sessErr) {
        const { error: sErr2 } = await supabase.from('work_sessions').update({ status: 'paid' }).eq('payment_id', paymentId);
        if (sErr2) {
          await supabase.from('work_sessions').update({ status: 'paid' }).eq('paymentid', paymentId);
        }
      }
      showAlert('Success', 'Payment marked as paid!');
      fetchData();
    } else {
      console.error('Mark as paid failed:', error);
      showAlert('Error', 'Failed to mark as paid: ' + error.message);
    }
  };

  const markMessagesAsRead = useCallback(async () => {
    if (!showMessageModal && activeTab !== 'messages') return;
    
    // Find messages for current selection that are unread and not sent by me (admin)
    const unreadMessages = messages.filter(m => {
      const sId = m.senderId || m.sender_id || m.senderid;
      const isMe = sId === user.uid;
      if (isMe) return false;
      const readStatus = m.isRead || m.is_read || m.isread;
      if (readStatus) return false;

      // In modal: look at messageRecipient
      if (showMessageModal && messageRecipient.length > 0) {
        return messageRecipient.includes(sId);
      }
      
      // In messages tab: look at selectedChatUser or selectedChatTeam
      if (activeTab === 'messages') {
        if (selectedChatTeam) {
          return (m.teamId === selectedChatTeam.id || m.team_id === selectedChatTeam.id || m.teamid === selectedChatTeam.id);
        }
        if (selectedChatUser) {
          return (sId === selectedChatUser.uid);
        }
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
  }, [showMessageModal, activeTab, selectedChatUser, selectedChatTeam, messageRecipient, messages, user.uid]);

  useEffect(() => {
    markMessagesAsRead();
  }, [showMessageModal, activeTab, selectedChatUser, selectedChatTeam, messageRecipient, messages.length, markMessagesAsRead]);

  const handleMessageRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase.from('message_requests').update({ status }).eq('id', requestId);
      if (error) throw error;
      showAlert('Success', `Request ${status} successfully!`);
      fetchData();
    } catch (err: any) {
      showAlert('Error', `Failed to update request: ${err.message}`);
    }
  };

  const downloadPayslip = (p: PaymentRecord) => {
    const doc = new jsPDF();
    const companyName = "8GEN TECHNOLOGY PVT LTD";
    const ceoName = "DARSHAN PATIL";
    
    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, 105, 25, { align: 'center' });
    
    // Logo placeholder
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(1);
    doc.circle(25, 20, 10, 'S');
    doc.setFontSize(12);
    doc.text("8G", 25, 22, { align: 'center' });

    // Body
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.text("PAYSLIP", 105, 55, { align: 'center' });
    
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 60, 190, 60);

    // Details Table
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    const startY = 75;
    const rowHeight = 10;
    const col1 = 25;
    const col2 = 100;

    const emp = employees.find(e => e.uid === p.userId);
    const data = [
      ["Employee Name", p.employeeName || "N/A"],
      ["Employee ID", emp?.specialCode || "N/A"],
      ["Position", emp?.position || "N/A"],
      ["Period Start", p.periodStart],
      ["Period End", p.periodEnd],
      ["Payment Date", safeFormatDate(p.createdAt, 'MMM d, yyyy')],
      ["Status", p.status.toUpperCase()],
      ["Total Amount", `INR ${p.amount.toLocaleString()}`]
    ];

    data.forEach((row, i) => {
      const y = startY + (i * rowHeight);
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
      doc.rect(20, y - 7, 170, rowHeight, 'F');
      doc.setFont("helvetica", "bold");
      doc.text(row[0], col1, y);
      doc.setFont("helvetica", "normal");
      doc.text(row[1], col2, y);
    });

    // Verification Section
    const footerY = 180;
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(130, footerY + 15, 185, footerY + 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Verified by CEO", 157.5, footerY + 20, { align: 'center' });
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(ceoName, 157.5, footerY + 10, { align: 'center' });
    
    // Green Tick
    doc.setTextColor(34, 197, 94);
    doc.text("✓ VERIFIED", 157.5, footerY - 5, { align: 'center' });

    doc.save(`payslip-${p.employeeName}-${p.periodEnd}.pdf`);
  };

  const sendMessage = async () => {
    if ((!messageContent.trim() && !attachment) || (messageRecipient.length === 0 && !selectedTeamId)) return;

    const payload: any = {
      senderId: user.uid,
      senderName: user.displayName,
      receiverIds: selectedTeamId ? [] : messageRecipient,
      teamId: selectedTeamId || null,
      content: messageContent,
      attachmentUrl: attachment?.url || null,
      attachmentType: attachment?.type || null,
      attachmentName: attachment?.name || null,
      timestamp: new Date().toISOString(),
      isRead: false,
      category: selectedTeamId ? 'general' : 'support' // Team messages are 'general'; direct admin-to-employee are 'support'
    };

    const res = await supabase.from('messages').insert(payload).select();
    let insertData = res.data;
    let error = res.error;

    if (error && (error.message.includes('column') || error.message.includes('schema'))) {
      const snakePayload = {
        sender_id: user.uid,
        sender_name: user.displayName,
        receiver_ids: selectedTeamId ? [] : messageRecipient,
        team_id: selectedTeamId || null,
        content: messageContent,
        attachment_url: attachment?.url || null,
        attachment_type: attachment?.type || null,
        attachment_name: attachment?.name || null,
        timestamp: new Date().toISOString(),
        is_read: false,
        category: selectedTeamId ? 'general' : 'support'
      };
      const res2 = await supabase.from('messages').insert(snakePayload).select();
      if (res2.error && (res2.error.message.includes('column') || res2.error.message.includes('schema'))) {
        const lowerPayload = {
          senderid: user.uid,
          sendername: user.displayName,
          receiverids: selectedTeamId ? [] : messageRecipient,
          teamid: selectedTeamId || null,
          content: messageContent,
          attachmenturl: attachment?.url || null,
          attachmenttype: attachment?.type || null,
          attachmentname: attachment?.name || null,
          timestamp: new Date().toISOString(),
          isread: false,
          category: selectedTeamId ? 'general' : 'support'
        };
        const res3 = await supabase.from('messages').insert(lowerPayload).select();
        error = res3.error;
        insertData = res3.data;

        if (error && (error.message?.toLowerCase().includes('category') || error.message?.toLowerCase().includes('schema cache'))) {
          // Retry without category
          const noCategoryPayload = { ...lowerPayload };
          delete noCategoryPayload.category;
          const res4 = await supabase.from('messages').insert(noCategoryPayload).select();
          error = res4.error;
          insertData = res4.data;
        }
      } else {
        error = res2.error;
        insertData = res2.data;

        if (error && (error.message?.toLowerCase().includes('category') || error.message?.toLowerCase().includes('schema cache'))) {
          const noCategoryPayload = { ...snakePayload };
          delete noCategoryPayload.category;
          const res4 = await supabase.from('messages').insert(noCategoryPayload).select();
          error = res4.error;
          insertData = res4.data;
        }
      }
    } else if (error && (error.message?.toLowerCase().includes('category') || error.message?.toLowerCase().includes('schema cache'))) {
      const noCategoryPayload = { ...payload };
      delete noCategoryPayload.category;
      const res4 = await supabase.from('messages').insert(noCategoryPayload).select();
      error = res4.error;
      insertData = res4.data;
    }

    if (!error) {
      if (!selectedChatUser && !selectedChatTeam) {
        showAlert('Success', 'Message sent successfully!');
        setShowMessageModal(false);
      }
      
      if (insertData && insertData.length > 0) {
        const norm = normalizeMessage(insertData[0]);
        setMessages(prev => {
          if (prev.find(m => m.id === norm.id)) return prev;
          return [...prev, norm].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        });
      }

      setMessageContent('');
      setAttachment(null);
      // Only clear recipient if it was a group modal message, not a direct chat
      if (!selectedChatUser) {
        setMessageRecipient([]);
        setSelectedTeamId(null);
      }
    } else {
      console.error('Message send error:', error);
      const isMissingTable = (error.message?.includes('Could not find the table') || error.message?.includes('schema cache') || 
                             (error.message?.includes('relation') && error.message?.includes('does not exist') && error.message?.includes('messages'))) && !error.message?.toLowerCase().includes('column');
      if (isMissingTable) {
        showAlert('Database Error', 'The "messages" table is missing or schema is stale. Please copy and run the SQL code from DATABASE_FIX.md in your Supabase SQL Editor.');
      } else if (error.message?.toLowerCase().includes('column') && error.message?.toLowerCase().includes('does not exist')) {
        showAlert('Schema Error', `A required column is missing in your "messages" table: ${error.message}. Please run the FIX section in DATABASE_FIX.md.`);
      } else {
        showAlert('Error', `Failed to send message: ${error.message}`);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileName = `chat-admin-${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from('face-photos') // Using existing bucket
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
        showAlert('Storage Error', 'The "face-photos" bucket was not found. Please create it in Supabase Storage and set it to Public (see DATABASE_FIX.md).');
      } else {
        alert(`Failed to upload file: ${err.message}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const acceptCall = async () => {
    stopIncomingCallTone();
    if (!incomingCall) return;
    if (incomingCall.context === 'mon') {
      // In Admin, context 'mon' means employee is sending offer, so we answer (already handled by monitor triggers usually?)
      // Wait, Admin is the one that receives the 'webrtc-mon-offer' broadcast.
      // So incomingCall with context 'mon' in admin might be redundant OR it's a notification.
      // Let's just treat it as answering a call.
      await handleIncomingOffer(incomingCall);
    } else {
      await handleIncomingOffer(incomingCall);
    }
    setIncomingCall(null);
  };

  const declineCall = () => {
    stopIncomingCallTone();
    if (incomingCall) {
      if (incomingCall.fromId) {
        oneShotSend(`calls:${incomingCall.fromId}`, 'call-busy', { fromId: user.uid, from: user.displayName, message: 'Admin declined the call' });
      }
      setIncomingCall(null);
    }
  };

  const startCall = async (type: 'voice' | 'video', targetEmp?: UserProfile) => {
    const target = targetEmp || selectedChatUser;
    if (!target) return;
    
    setIsInCall(true);
    setCallEmployee(target);
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
        // Second try: audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          actualType = 'voice';
          setCallType('voice');
          setIsVideoOff(true);
        } catch (audioErr: any) {
          // Third try: reuse existing localStream if available
          const existingStream = localStream;
          if (existingStream && existingStream.active && existingStream.getTracks().some((t: MediaStreamTrack) => t.readyState === 'live')) {
            stream = existingStream;
            actualType = 'voice';
            setCallType('voice');
          } else {
            // Last resort: silent stream so call can still connect
            try {
              const ctx = new AudioContext();
              const dest = ctx.createMediaStreamDestination();
              stream = dest.stream;
              actualType = 'voice';
              setCallType('voice');
              setIsVideoOff(true);
            } catch {
              throw audioErr;
            }
          }
        }
      }

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
          oneShotSend(`calls:${target.uid}`, 'webrtc-call-ice', event.candidate);
        }
      };

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
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

      oneShotSend(`calls:${target.uid}`, 'incoming-call', {
        fromName: user.displayName,
        fromId: user.uid,
        type: actualType,
        offer: offer
      });

    } catch (err: any) {
      stopRingbackTone();
      const isPermissionError = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.toLowerCase().includes('denied');
      if (isPermissionError) {
        showAlert('Error', 'Microphone access denied. Please enable microphone permissions in browser settings to make calls.');
      } else {
        console.error('Call error:', err);
        showAlert('Error', 'Failed to start call. Please check your microphone/camera permissions.');
      }
      setShowCallModal(false);
      setIsInCall(false);
    }
  };

  const initiateCall = (emp: UserProfile, type: 'voice' | 'video') => startCall(type, emp);

  const handleIncomingOffer = async (payload: any) => {
    // Monitoring offers should be handled by LiveWebRTCMonitor component, not the main call modal
    if (payload.context === 'mon') {
      console.log('Ignoring mon offer in main dashboard handler (mon component should catch it)');
      return;
    }
    setIsInCall(true);
    setCallType(payload.type);
    setShowCallModal(true);
    setCallStatus('connecting');
    setCallDuration(0);
    stopIncomingCallTone();
 
    // CRITICAL: Set recipient so endCall knows who to notify
    if (payload.fromId) {
      const caller = employees.find(e => e.uid === payload.fromId);
      if (caller) {
        setCallEmployee(caller);
        setSelectedChatUser(caller);
      }
    }
 
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: payload.type === 'video',
          audio: true
        });
      } catch (mediaErr: any) {
        // Camera failed (busy/not found/denied-only-for-video) — retry with audio only
        // so the call can still connect instead of failing outright.
        if (payload.type === 'video' && mediaErr?.name !== 'NotAllowedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } else {
          throw mediaErr;
        }
      }
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
          oneShotSend(`calls:${payload.fromId}`, 'webrtc-call-ice', event.candidate);
        }
      };
 
      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };
 
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
          setCallDuration(0);
          stopIncomingCallTone();
        }
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') endCall();
      };
 
      await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
 
      oneShotSend(`calls:${payload.fromId}`, 'webrtc-call-answer', answer);
 
    } catch (err: any) {
      console.error('Error answering call:', err);
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera/microphone permission was denied. Please allow access in your browser settings and try again.'
        : err?.name === 'NotFoundError'
        ? 'No camera or microphone was found on this device.'
        : 'Failed to answer call. Please check camera/mic permissions.';
      showAlert('Error', msg);
      endCall();
    }
  };

  const toggleScreenShareInCall = async () => {
    if (isScreenSharingInCall) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setIsScreenSharingInCall(false);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        
        if (callPeerConnectionRef.current) {
          const sender = callPeerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(stream.getVideoTracks()[0]);
          }
        }
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
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        if (callPeerConnectionRef.current) {
          const sender = callPeerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(stream.getVideoTracks()[0]);
          }
        }

        stream.getVideoTracks()[0].onended = () => {
          if (isScreenSharingInCall) toggleScreenShareInCall();
        };
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  };

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

  const createPayment = async () => {
    if (!selectedEmployee || !paymentAmount) return;

    // Check for duplicate pending/paid payment for this employee for the same month
    const pEnd = format(new Date(), 'yyyy-MM-dd');
    const targetMonth = format(new Date(), 'yyyy-MM');
    const existingPayment = payments.find(p => {
      const pId = p.userId || p.user_id || p.userid;
      const pPeriodEnd = p.periodEnd || p.period_end || p.periodend;
      if (!pPeriodEnd) return false;
      return pId === selectedEmployee.uid && format(new Date(pPeriodEnd), 'yyyy-MM') === targetMonth;
    });

    if (existingPayment) {
      const confirmRetry = confirm(`A payment for this employee already exists for ${format(new Date(), 'MMMM yyyy')}. Are you sure you want to create another one?`);
      if (!confirmRetry) return;
    }
    
    const pStart = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const cAt = new Date().toISOString();
    const eName = selectedEmployee.displayName || 'Employee';
    const amountVal = parseFloat(paymentAmount);

    let payData: any = null;

    // Trial 1: CamelCase
    const { data: d1 } = await supabase.from('payments').insert({
      userId: selectedEmployee.uid,
      amount: amountVal,
      status: 'pending',
      periodStart: pStart,
      periodEnd: pEnd,
      createdAt: cAt,
      employeeName: eName,
      userName: eName
    }).select().single();

    if (d1) {
      payData = d1;
    } else {
      // Trial 2: Lowercase
      const { data: d2 } = await supabase.from('payments').insert({
        userid: selectedEmployee.uid,
        amount: amountVal,
        status: 'pending',
        periodstart: pStart,
        periodend: pEnd,
        createdat: cAt,
        employeename: eName
      }).select().single();
      
      if (d2) {
        payData = d2;
      } else {
        // Trial 3: Snake Case (last resort)
        const { data: d3 } = await supabase.from('payments').insert({
          user_id: selectedEmployee.uid,
          amount: amountVal,
          status: 'pending',
          period_start: pStart,
          period_end: pEnd,
          employee_name: eName
        }).select().single();
        if (d3) payData = d3;
      }
    }

    if (payData) {
      // Mark sessions as paid with fallbacks
      const pId = payData.id || payData.payment_id || payData.paymentid;
      
      const updatePayload: any = { paymentId: pId, payment_id: pId, paymentid: pId, status: 'paid' };
      
      const { error: sessErr } = await supabase.from('work_sessions')
        .update(updatePayload)
        .eq('userId', selectedEmployee.uid)
        .is('paymentId', null)
        .eq('status', 'completed');
        
      if (sessErr) {
        await supabase.from('work_sessions')
          .update(updatePayload)
          .eq('user_id', selectedEmployee.uid)
          .is('payment_id', null)
          .eq('status', 'completed');
      }
      
      fetchData();
    }

    setShowPaymentModal(false);
    setSelectedEmployee(null);
    setPaymentAmount('');
  };

  const generateAutomatedPayroll = async () => {
    setIsGeneratingPayroll(true);
    try {
      // 1. Fetch all completed sessions
      const { data: rawSessions, error: sessionError } = await supabase
        .from('work_sessions')
        .select('*');

      if (sessionError) throw sessionError;
      
      const unpaidSessions = (rawSessions || []).filter(s => {
        const pId = s.paymentId || (s as any).payment_id || (s as any).paymentid;
        const status = (s.status || (s as any).session_status || '').toLowerCase();
        const hasEndTime = s.endTime || (s as any).end_time || (s as any).endtime;
        
        // If it has no payment ID and is either explicitly completed OR has an end time but no status
        const isCompleted = status === 'completed' || (!status && hasEndTime);
        return (pId === null || pId === undefined || pId === '') && isCompleted;
      });
      
      if (!unpaidSessions || unpaidSessions.length === 0) {
        alert('No unpaid completed sessions found for any employee.');
        setIsGeneratingPayroll(false);
        return;
      }

      console.log('Unpaid sessions found:', unpaidSessions.length);

      // 2. Group by userId
      const sessionsByUser: { [userId: string]: any[] } = {};
      unpaidSessions.forEach(s => {
        const uId = s.userId || (s as any).user_id || (s as any).userid;
        if (!sessionsByUser[uId]) sessionsByUser[uId] = [];
        sessionsByUser[uId].push(s);
      });

      let createdCount = 0;
      for (const userId of Object.keys(sessionsByUser)) {
        const emp = employees.find(e => {
          const eUid = e.uid || (e as any).id || (e as any).user_id || (e as any).userid;
          return eUid === userId;
        });
        
        if (!emp) continue;

        const userSessions = sessionsByUser[userId];
        const totalMinutes = userSessions.reduce((acc, s) => {
          const m = s.totalWorkMinutes ?? (s as any).total_work_minutes ?? (s as any).totalworkminutes ?? 0;
          return acc + m;
        }, 0);
        
        const totalHours = totalMinutes / 60;
        const standardHours = emp.standardWorkingHours || (emp as any).standard_working_hours || (emp as any).standardworkinghours || 8;
        const hourlyRate = emp.hourlyRate || (emp as any).hourly_rate || (emp as any).hourlyrate || 500;
        
        const numSessions = userSessions.length;
        const periodStandardHours = numSessions * standardHours;
        let amount = 0;
        
        if (totalHours > periodStandardHours) {
          const overtimeHours = totalHours - periodStandardHours;
          amount = (periodStandardHours * hourlyRate) + (overtimeHours * (hourlyRate * 1.5));
        } else {
          amount = totalHours * hourlyRate;
        }

        if (amount <= 0) continue;

        const periodDays = emp.payoutFrequency === 'daily' ? 1 : emp.payoutFrequency === 'weekly' ? 7 : 30;
        const pStart = format(subDays(new Date(), periodDays), 'yyyy-MM-dd');
        const pEnd = format(new Date(), 'yyyy-MM-dd');
        const cAt = new Date().toISOString();
        const eName = emp.displayName || emp.name || (emp as any).username || 'Employee';

        let payData: any = null;
        
        // Trial 1: CamelCase
        const { data: d1 } = await supabase.from('payments').insert({
          userId: userId,
          amount: parseFloat(amount.toFixed(2)),
          status: 'pending',
          periodStart: pStart,
          periodEnd: pEnd,
          createdAt: cAt,
          employeeName: eName
        }).select().single();
        
        if (d1) {
          payData = d1;
        } else {
          // Trial 2: Lowercase
          const { data: d2 } = await supabase.from('payments').insert({
            userid: userId,
            amount: parseFloat(amount.toFixed(2)),
            status: 'pending',
            periodstart: pStart,
            periodend: pEnd,
            createdat: cAt,
            employeename: eName
          }).select().single();
          
          if (d2) {
            payData = d2;
          } else {
            // Trial 3: Snake Case (reported problematic but trying safely)
            const { data: d3 } = await supabase.from('payments').insert({
              user_id: userId,
              amount: parseFloat(amount.toFixed(2)),
              status: 'pending',
              period_start: pStart,
              period_end: pEnd,
              employee_name: eName
            }).select().single();
            if (d3) payData = d3;
          }
        }

        if (payData) {
          const pId = payData.id || payData.payment_id || payData.paymentid;
          const sessionIds = userSessions.map(s => s.id || (s as any).session_id || (s as any).sessionid).filter(Boolean);
          
          if (sessionIds.length > 0) {
            const updateObj: any = { 
              paymentId: pId, payment_id: pId, paymentid: pId, status: 'paid' 
            };
            await supabase.from('work_sessions').update(updateObj).in('id', sessionIds);
            await supabase.from('work_sessions').update(updateObj).in('session_id', sessionIds);
          }
          createdCount++;
        }
      }

      alert(`Successfully generated ${createdCount} payroll records!`);
      fetchData();
    } catch (err: any) {
      console.error('Payroll generation error:', err);
      alert(`Failed to generate payroll: ${err.message}`);
    } finally {
      setIsGeneratingPayroll(false);
    }
  };

  const processBulkPayroll = async () => {
    showConfirm('Process Bulk Payroll', 'Are you sure you want to process all pending and approved payments? This will mark them as PAID.', async () => {
      setIsGeneratingPayroll(true);
      try {
        // 1. Get all pending and approved payments
        const { data: pendingPayments } = await supabase
          .from('payments')
          .select('*')
          .in('status', ['pending', 'approved']);

        if (!pendingPayments || pendingPayments.length === 0) {
          showAlert('Info', 'No pending or approved payments to process.');
          return;
        }

        // 2. Mark them as paid
        const mappedPayments = (pendingPayments || []).map((p: any) => ({
          ...p,
          id: p.id || p.payment_id || p.paymentid
        }));
        const paymentIds = mappedPayments.map(p => p.id).filter(Boolean);
        
        if (paymentIds.length === 0) {
          showAlert('Info', 'No valid payments found to process.');
          setIsGeneratingPayroll(false);
          return;
        }

        let { error: payError } = await supabase
          .from('payments')
          .update({ status: 'paid' })
          .in('id', paymentIds);
          
        if (payError) {
          const { error: pErr2 } = await supabase.from('payments').update({ status: 'paid' }).in('payment_id', paymentIds);
          payError = pErr2;
          if (pErr2) {
            const { error: pErr3 } = await supabase.from('payments').update({ status: 'paid' }).in('paymentid', paymentIds);
            payError = pErr3;
          }
        }

        if (payError) throw payError;

        // 3. Update related sessions to 'paid'
        let { error: sessionError } = await supabase
          .from('work_sessions')
          .update({ status: 'paid' })
          .in('paymentId', paymentIds);

        if (sessionError) {
          // Fallback to snake_case
          const { error: sErr } = await supabase
            .from('work_sessions')
            .update({ status: 'paid' })
            .in('payment_id', paymentIds);
          sessionError = sErr;
          
          if (sErr) {
            // Fallback to lowercase
            const { error: lErr } = await supabase
              .from('work_sessions')
              .update({ status: 'paid' })
              .in('paymentid', paymentIds);
            sessionError = lErr;
          }
        }

        // We log warning instead of hard crash if column mismatch occurs
        if (sessionError) {
          console.warn('Could not couple paid status to work sessions:', sessionError.message);
        }

        showAlert('Success', `Successfully processed ${pendingPayments.length} payments!`);
        fetchData();
      } catch (err: any) {
        console.error('Bulk payroll error:', err);
        showAlert('Error', `Failed to process bulk payroll: ${err.message}`);
      } finally {
        setIsGeneratingPayroll(false);
      }
    });
  };

  // Chart Data: Total work hours per employee based on filter
  const chartData = employees.map(emp => {
    const empSessions = sessions.filter(s => {
      if (s.userId !== emp.uid) return false;
      const sessionDate = new Date(s.startTime);
      const now = new Date();
      
      if (chartFilter === 'daily') {
        return sessionDate.toDateString() === now.toDateString();
      } else if (chartFilter === 'weekly') {
        const weekStart = startOfWeek(now);
        const weekEnd = endOfWeek(now);
        return sessionDate >= weekStart && sessionDate <= weekEnd;
      } else if (chartFilter === 'monthly') {
        return sessionDate.getMonth() === now.getMonth() && sessionDate.getFullYear() === now.getFullYear();
      } else if (chartFilter === 'yearly') {
        return sessionDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
    
    const totalMinutes = empSessions.reduce((acc, s) => acc + (s.totalWorkMinutes || 0), 0);
    const hours = totalMinutes / 60;
    return {
      name: emp.displayName,
      hours: isNaN(hours) ? 0 : parseFloat(hours.toFixed(1)),
      status: emp.status
    };
  });

  const getOutstandingAmount = (employeeId: string) => {
    const emp = employees.find(e => e.uid === employeeId);
    if (!emp) return 0;
    
    // 1. Unpaid session minutes
    const unpaidSessions = sessions.filter(s => s.userId === employeeId && s.status === 'completed' && !s.paymentId);
    const totalMinutes = unpaidSessions.reduce((acc, s) => acc + (s.totalWorkMinutes || 0), 0);
    const sessionEarnings = (totalMinutes / 60) * emp.hourlyRate;

    return sessionEarnings;
  };

  const filteredEmployees = employees.filter(e => {
    const matchesSearch = e.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         e.specialCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchesDept = positionFilter === 'all' || e.position === positionFilter;
    return matchesSearch && matchesStatus && matchesDept;
  });

  const stats = {
    totalEmployees: employees.length,
    activeNow: employees.filter(e => e.status === 'active' || e.status === 'away' || e.status === 'break').length,
    pendingPayments: payments.filter(p => p.status === 'pending').length,
    totalPaid: payments.filter(p => {
      if (p.status !== 'paid') return false;
      const date = new Date(p.createdAt);
      if (isNaN(date.getTime())) return false;
      const now = new Date();
      if (paidOutFilter === 'daily') return date.toDateString() === now.toDateString();
      if (paidOutFilter === 'weekly') return differenceInDays(now, date) <= 7;
      if (paidOutFilter === 'monthly') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      if (paidOutFilter === 'yearly') return date.getFullYear() === now.getFullYear();
      return true;
    }).reduce((acc, p) => acc + (p.amount || 0), 0)
  };

  const NavButtons = () => (
    <nav className="space-y-6">
      <div>
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-4">Overview</h3>
        <div className="space-y-1">
          <button 
            onClick={() => { setActiveTab('summary'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'summary' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <TrendingUp size={18} /> Dashboard
          </button>
          <button 
            onClick={() => { setActiveTab('live'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'live' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Monitor size={18} /> Live Workforce
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-4">Management</h3>
        <div className="space-y-1">
          <button 
            onClick={() => { setActiveTab('management'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'management' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Users size={18} /> Employees
          </button>
          <button 
            onClick={() => { setActiveTab('teams'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'teams' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={18} /> Teams
          </button>
          <button 
            onClick={() => { setActiveTab('payments'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'payments' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <DollarSign size={18} /> Payroll
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-4">Reporting</h3>
        <div className="space-y-1">
          <button 
            onClick={() => { setActiveTab('report'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'report' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Clock size={18} /> Attendance
          </button>
          <button 
            onClick={() => { setActiveTab('meetings'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'meetings' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Video size={18} /> Microsoft Teams
          </button>
          <button 
            onClick={() => { setActiveTab('messages'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'messages' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <MessageSquare size={18} /> Messaging
          </button>
          <button 
            onClick={() => { setActiveTab('leaves'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'leaves' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Calendar size={18} /> Leaves
            {leaveRequests.filter(l => l.status === 'pending').length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {leaveRequests.filter(l => l.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );

  const getDailyStats = (employeeId: string, dateStr?: string) => {
    const targetDate = dateStr || safeFormatDate(new Date(), 'yyyy-MM-dd');
    const empSessions = sessions.filter(s => {
      const sUid = s.userId || (s as any).user_id || (s as any).userid;
      return sUid === employeeId && s.date === targetDate;
    });
    
    const workMinutes = empSessions.reduce((acc, s) => {
      const min = s.totalWorkMinutes ?? (s as any).total_work_minutes ?? (s as any).totalworkminutes ?? 0;
      return acc + min;
    }, 0);
    
    const breakMinutes = empSessions.reduce((acc, s) => {
      const min = s.totalBreakMinutes ?? (s as any).total_break_minutes ?? (s as any).totalbreakminutes ?? 0;
      return acc + min;
    }, 0);
    
    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
    };

    return {
      work: formatTime(workMinutes),
      break: formatTime(breakMinutes),
      hours: (workMinutes / 60).toFixed(2),
      wage: ((workMinutes / 60) * (employees.find(e => e.uid === employeeId)?.hourlyRate || 0)).toFixed(2)
    };
  };

  const downloadProjectManual = () => {
    const doc = new jsPDF();
    
    // Page 1: Cover
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 297, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('WorkWatch AI', 105, 120, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Technical Documentation & User Manual', 105, 135, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 260, { align: 'center' });
    
    // Page 2: Overview
    doc.addPage();
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Project Overview', 20, 30);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const overview = "WorkWatch AI is a comprehensive, remote-first employee management and productivity tracking platform. It leverages real-time synchronization, computer vision for identity verification, and a robust administrative backend to ensure operational transparency and secure work environments.";
    doc.text(doc.splitTextToSize(overview, 170), 20, 50);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Roles & Permissions:', 20, 80);
    doc.setFont('helvetica', 'normal');
    const roles = "1. Employee: Focuses on task execution, biometric attendance, and productivity reporting.\n2. Admin: Oversight, live monitoring, payroll management, and team communication control.";
    doc.text(doc.splitTextToSize(roles, 170), 20, 90);

    // Page 3: Security & Compliance
    doc.addPage();
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Security & Compliance', 20, 30);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const security = "The system implements biometric integrity checks. Face descriptors are stored as encrypted vectors (Descriptors), not raw images, ensuring privacy. Local verification reduces latency while maintaining data isolation.";
    doc.text(doc.splitTextToSize(security, 170), 20, 50);

    doc.setFont('helvetica', 'bold');
    doc.text('Grace Periods:', 20, 80);
    doc.setFont('helvetica', 'normal');
    const grace = "• Missing Face: 15 minutes cumulative grace period before session auto-pause.\n• Face Mismatch: 30 minutes cumulative grace period before session auto-pause.\nThese rules protect organizational integrity while allowing for natural movement (drinking water, short stretches) without interrupting the work flow.";
    doc.text(doc.splitTextToSize(grace, 170), 20, 90);

    doc.save('WorkWatch_AI_Manual.pdf');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex relative">
      {/* Sidebar (Desktop) */}
      <div className="w-64 bg-slate-900 border-r border-slate-800 p-6 space-y-8 hidden lg:block">
        <h2 className="text-2xl font-bold">Admin Panel</h2>
        <NavButtons />
      </div>

      {/* Sidebar (Mobile) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 p-6 space-y-8 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Admin Panel</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400">
                <X size={24} />
              </button>
            </div>
            <NavButtons />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="w-full space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400"
              >
                <Menu size={24} />
              </button>
              <div>
                <h1 className="text-3xl font-bold">
                  {user.role === 'ceo' ? 'CEO Dashboard' : user.role === 'founder' ? 'Founder Dashboard' : 'Admin Dashboard'}
                </h1>
                <p className="text-slate-400">Manage employees and monitor daily performance</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowNotificationCenter(true)}
                className="relative p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"
                title="Notification Center"
              >
                <Bell size={20} />
                {(alerts.length > 0 || messageRequests.filter(r => r.status === 'pending').length > 0 || payments.filter(p => p.status === 'pending').length > 0) && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-950">
                    {alerts.length + messageRequests.filter(r => r.status === 'pending').length + payments.filter(p => p.status === 'pending').length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('live')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shadow-lg ${activeTab === 'live' ? 'bg-blue-600 text-white shadow-blue-600/30' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'}`}
              >
                <Activity size={18} />
                <span className="hidden sm:inline">Live Monitor</span>
                {employees.filter(e => e.status === 'active' || e.status === 'away' || e.status === 'break').length > 0 && (
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                )}
              </button>
              <input 
                type="date" 
                className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-sm"
                defaultValue={safeFormatDate(new Date(), 'yyyy-MM-dd')}
              />
              <button 
                onClick={downloadProjectManual}
                className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl hover:bg-slate-800 transition-all text-blue-400"
                title="Download Project Manual"
              >
                <File size={18} />
              </button>
              <button 
                onClick={onLogout}
                className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl hover:bg-slate-800 transition-all"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>          {activeTab === 'leaves' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-3">
                        <Calendar className="text-purple-500" /> Leave Management
                      </h2>
                      <p className="text-slate-400 text-sm mt-1">Review and approve employee leave applications</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-y-3">
                      <thead>
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="px-6 py-4 font-black">Employee</th>
                          <th className="px-6 py-4 font-black">Duration</th>
                          <th className="px-6 py-4 font-black">Reason</th>
                          <th className="px-6 py-4 font-black">Status</th>
                          <th className="px-6 py-4 font-black text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaveRequests.map((req) => {
                          const currentMonth = format(new Date(), 'yyyy-MM');
                          const paidThisMonth = leaveRequests.filter(l => l.userId === req.userId && l.status === 'approved' && l.isPaid && l.startDate.startsWith(currentMonth)).length;
                          const remaining = Math.max(0, 3 - paidThisMonth);

                          return (
                            <tr key={req.id} className="bg-slate-950/50 hover:bg-slate-950 transition-all group border border-slate-800">
                              <td className="px-6 py-4 rounded-l-2xl border-l border-t border-b border-slate-800">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-bold text-slate-300">
                                    {req.employeeName?.[0]}
                                  </div>
                                  <div>
                                    <p className="font-bold text-white">{req.employeeName}</p>
                                    <p className="text-[10px] text-slate-500">Remaining Paid Leave: {remaining}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 border-t border-b border-slate-800">
                                <p className="text-sm font-bold text-slate-300">{req.startDate} to {req.endDate}</p>
                                <p className="text-[10px] text-slate-500">Applied on {safeFormatDate(req.created_at, 'MMM d')}</p>
                              </td>
                              <td className="px-6 py-4 border-t border-b border-slate-800">
                                <p className="text-xs text-slate-400 line-clamp-2 italic whitespace-normal">"{req.reason}"</p>
                              </td>
                              <td className="px-6 py-4 border-t border-b border-slate-800">
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                                  req.status === 'approved' ? 'bg-green-500/10 text-green-500' :
                                  req.status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                                  'bg-yellow-500/10 text-yellow-500'
                                }`}>
                                  {req.status}
                                </span>
                                {req.status === 'approved' && (
                                   <div className={`text-[9px] font-bold mt-1 ${req.isPaid ? 'text-green-500' : 'text-blue-500'}`}>
                                      {req.isPaid ? 'PAID LEAVE' : 'UNPAID LEAVE'}
                                   </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right rounded-r-2xl border-r border-t border-b border-slate-800">
                                {req.status === 'pending' && (
                                  <div className="flex justify-end gap-2">
                                    <button 
                                      onClick={() => handleLeaveApproval(req.id, 'approved', true, 'Approved as Paid Leave')}
                                      className="px-3 py-2 bg-green-600/10 hover:bg-green-600 text-green-500 hover:text-white rounded-lg transition-all text-[9px] font-black uppercase"
                                    >
                                      Approve Paid
                                    </button>
                                    <button 
                                      onClick={() => handleLeaveApproval(req.id, 'approved', false, 'Approved as Unpaid Leave')}
                                      className="px-3 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-lg transition-all text-[9px] font-black uppercase"
                                    >
                                      Approve Unpaid
                                    </button>
                                    <button 
                                      onClick={() => handleLeaveApproval(req.id, 'rejected', false, 'Rejected by Admin')}
                                      className="px-3 py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-lg transition-all text-[9px] font-black uppercase"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                                {req.status !== 'pending' && (
                                  <p className="text-[10px] text-slate-500 italic">{req.adminComment}</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {leaveRequests.length === 0 && (
                      <div className="text-center py-20 bg-slate-950/20 rounded-[2.5rem] border border-dashed border-slate-800">
                        <Calendar size={48} className="mx-auto text-slate-800 mb-4" />
                        <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">No leave requests found</p>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'meetings' && (
        <div className="h-[calc(100vh-12rem)] min-h-[600px] flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
              Microsoft Teams integration is active. You can start meetings, chat with employees, and collaborate in real-time.
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

      {activeTab === 'summary' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl hover:border-blue-500/30 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-600/10 rounded-2xl text-blue-500 group-hover:scale-110 transition-transform">
                      <Users size={24} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Staff</span>
                  </div>
                  <p className="text-3xl font-black">{employees.length}</p>
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <span className="text-green-500 font-bold">+{employees.filter(e => e.status === 'active' || e.status === 'away' || e.status === 'break').length}</span> active now
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl hover:border-green-500/30 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-600/10 rounded-2xl text-green-500 group-hover:scale-110 transition-transform">
                      <DollarSign size={24} />
                    </div>
                    <select 
                      value={paidOutFilter}
                      onChange={(e) => setPaidOutFilter(e.target.value as any)}
                      className="bg-transparent text-[10px] font-bold text-slate-500 uppercase tracking-widest outline-none cursor-pointer hover:text-white transition-colors"
                    >
                      <option value="daily">Daily Payout</option>
                      <option value="weekly">Weekly Payout</option>
                      <option value="monthly">Monthly Payout</option>
                      <option value="yearly">Yearly Payout</option>
                      <option value="all">Total Payout</option>
                    </select>
                  </div>
                  <p className="text-3xl font-black">₹{stats.totalPaid.toLocaleString()}</p>
                  <p className="text-xs text-slate-500 mt-2">Across {payments.filter(p => p.status === 'paid').length} transactions</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl hover:border-yellow-500/30 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-yellow-600/10 rounded-2xl text-yellow-500 group-hover:scale-110 transition-transform">
                      <Clock size={24} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Work Hours</span>
                  </div>
                  <p className="text-3xl font-black">{Math.floor(sessions.reduce((acc, s) => acc + (s.totalWorkMinutes || 0), 0) / 60)}h</p>
                  <p className="text-xs text-slate-500 mt-2">Total productivity logged</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl hover:border-red-500/30 transition-all group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-red-600/10 rounded-2xl text-red-500 group-hover:scale-110 transition-transform">
                      <ShieldAlert size={24} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alerts</span>
                  </div>
                  <p className="text-3xl font-black">{alerts.length}</p>
                  <p className="text-xs text-slate-500 mt-2">Security incidents today</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {/* Productivity Chart */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                      <h2 className="text-xl font-bold">Work Productivity (Hours)</h2>
                      <p className="text-slate-400 text-xs">Total hours logged per employee</p>
                    </div>
                    <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
                      {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setChartFilter(filter)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${chartFilter === filter ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                          {filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          stroke="#64748b" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(val) => `${val}h`}
                        />
                        <Tooltip 
                          cursor={{ fill: '#1e293b' }}
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                        />
                        <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.status === 'active' ? '#3b82f6' : '#64748b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* System Health & Quick Insights */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                      <Activity size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">System Health & Insights</h2>
                      <p className="text-xs text-slate-500">Real-time overview of your workforce and system status.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 transition-all group text-center md:text-left">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all">
                          <Users size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">Live</span>
                      </div>
                      <p className="text-2xl font-black text-white">{employees.filter(e => e.status === 'active' || e.status === 'away' || e.status === 'break').length}</p>
                      <p className="text-xs text-slate-500 mt-1">Active Now</p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-yellow-500/50 transition-all group text-center md:text-left">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500 group-hover:bg-yellow-500 group-hover:text-white transition-all">
                          <Clock size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">Pending</span>
                      </div>
                      <p className="text-2xl font-black text-white">{employees.filter(e => e.sessionApprovalStatus === 'pending').length}</p>
                      <p className="text-xs text-slate-500 mt-1">Approvals</p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-red-500/50 transition-all group text-center md:text-left">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-red-500/10 rounded-lg text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
                          <AlertTriangle size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">Security</span>
                      </div>
                      <p className="text-2xl font-black text-white">{alerts.length}</p>
                      <p className="text-xs text-slate-500 mt-1">Alerts</p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/50 transition-all group text-center md:text-left">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                          <DollarSign size={18} />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Estimated</span>
                      </div>
                      <p className="text-2xl font-black text-white font-mono">
                        ₹{employees.reduce((acc, emp) => {
                          const todaySessions = sessions.filter(s => s.userId === emp.uid && s.date === safeFormatDate(new Date(), 'yyyy-MM-dd'));
                          const totalMins = todaySessions.reduce((sum, s) => sum + (s.totalWorkMinutes || 0), 0);
                          return acc + (totalMins / 60) * (emp.hourlyRate || 500);
                        }, 0).toFixed(0)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Daily Cost</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

            {activeTab === 'payments' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 gap-8">
                  <div className="space-y-8">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                      <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                          <DollarSign className="text-green-500" /> Payroll Management
                        </h2>
                        <p className="text-xs text-slate-500">Process and approve employee payouts</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={generateAutomatedPayroll}
                          disabled={isGeneratingPayroll}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-600/20"
                        >
                          {isGeneratingPayroll ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                          Generate Payroll
                        </button>
                        <button 
                          onClick={processBulkPayroll}
                          disabled={isGeneratingPayroll}
                          className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-green-600/20"
                        >
                          {isGeneratingPayroll ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                          Finalize & Pay All
                        </button>
                      </div>
                    </div>

                    <div className="space-y-12">
                        {payments.filter(p => (p.status || '').toLowerCase() === 'pending').length > 0 && (
                          <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                            <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                                <Clock size={16} />
                              </div>
                              Pending Approvals
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                              {payments.filter(p => (p.status || '').toLowerCase() === 'pending').map((p) => (
                                <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all flex flex-col justify-between shadow-xl group">
                                  <div className="flex justify-between items-start mb-6">
                                    <div>
                                      <p className="font-bold text-lg text-slate-200 group-hover:text-white transition-colors">{p.employeeName}</p>
                                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">{p.periodStart} - {p.periodEnd}</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-2xl font-black text-blue-400">₹{p.amount ? p.amount.toLocaleString() : '0'}</span>
                                      <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Base Payout</span>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => approvePayment(p.id!)}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/10 active:scale-95"
                                  >
                                    Approve Payment
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {payments.filter(p => (p.status || '').toLowerCase() === 'approved').length > 0 && (
                          <div className="animate-in fade-in slide-in-from-left-4 duration-500 delay-100">
                            <h3 className="text-sm font-bold text-green-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                                <CheckCircle size={16} />
                              </div>
                              Ready for Dispatch
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                              {payments.filter(p => (p.status || '').toLowerCase() === 'approved').map((p) => (
                                <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-6 hover:border-green-500/30 transition-all flex flex-col justify-between shadow-xl group">
                                  <div className="flex justify-between items-start mb-6">
                                    <div>
                                      <p className="font-bold text-lg text-slate-200 group-hover:text-white transition-colors">{p.employeeName}</p>
                                      <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">{p.periodStart} - {p.periodEnd}</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-2xl font-black text-green-400">₹{p.amount ? p.amount.toLocaleString() : '0'}</span>
                                      <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Approved</span>
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => markAsPaid(p.id!)}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-2xl transition-all text-[10px] uppercase tracking-widest shadow-lg shadow-green-600/10 active:scale-95"
                                  >
                                    Record as Dispatched
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Database size={16} /> Payout History
                            </h3>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={12} />
                              <input 
                                type="text"
                                placeholder="Search by name..."
                                className="bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-slate-700 w-48"
                                value={paidSearchTerm}
                                onChange={(e) => setPaidSearchTerm(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden">
                            <table className="w-full text-left">
                              <thead className="bg-slate-900/50 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                                <tr>
                                  <th className="px-6 py-4">Employee</th>
                                  <th className="px-6 py-4">Period</th>
                                  <th className="px-6 py-4">Amount</th>
                                  <th className="px-6 py-4">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-900">
                                {payments
                                  .filter(p => (p.status || '').toLowerCase() === 'paid')
                                  .filter(p => !paidSearchTerm || p.employeeName?.toLowerCase().includes(paidSearchTerm.toLowerCase()))
                                  .slice(0, 100) // Show last 100
                                  .map(p => (
                                  <tr key={p.id} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4 text-sm font-bold text-slate-300">{p.employeeName}</td>
                                    <td className="px-6 py-4 text-[10px] text-slate-500">{p.periodStart} - {p.periodEnd}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-400">₹{p.amount ? p.amount.toLocaleString() : '0'}</td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-4">
                                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[8px] font-black uppercase">PAID</span>
                                        <button 
                                          onClick={() => downloadPayslip(p)}
                                          className="p-1.5 bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-500 hover:text-white rounded-lg transition-all"
                                          title="Download Receipt"
                                        >
                                          <Download size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {payments.filter(p => (p.status || '').toLowerCase() === 'paid').length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-slate-600 text-xs font-bold uppercase tracking-widest italic">No paid records found</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          )}

          {activeTab === 'live' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black tracking-tight">Live Workforce</h2>
                  <p className="text-slate-400 text-sm">Real-time AI monitoring & live snapshots</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowOnlyActive(!showOnlyActive)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all shadow-lg ${
                      showOnlyActive 
                        ? 'bg-blue-600 border-blue-500 text-white' 
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Filter size={18} />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {showOnlyActive ? 'Showing Active' : 'Show All'}
                    </span>
                  </button>
                  <button 
                    onClick={() => {
                      fetchData();
                      showAlert('Refresh', 'Refreshing live feeds...');
                    }}
                    className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-all shadow-lg group"
                  >
                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                    <span className="text-xs font-bold uppercase tracking-widest">Refresh All</span>
                  </button>
                  <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-2xl px-4 py-2 flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      {employees.filter(e => e.status === 'active' || e.status === 'away' || e.status === 'break').length} Active Sessions
                    </span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search by name or code..."
                      className="bg-slate-900 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-xl"
                      value={liveSearchTerm}
                      onChange={(e) => setLiveSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="max-h-[800px] overflow-y-auto pr-4 custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-6">
                    {employees.filter(e => {
                      const matchesSearch = e.displayName.toLowerCase().includes(liveSearchTerm.toLowerCase()) || 
                        e.specialCode.toLowerCase().includes(liveSearchTerm.toLowerCase());
                      const isActiveStatus = e.status === 'active' || e.status === 'away' || e.status === 'break';
                      const matchesActive = showOnlyActive ? isActiveStatus : true;
                      return matchesSearch && matchesActive;
                    }).map(emp => (
                      <div key={emp.uid} className={`bg-slate-900 border ${
                        emp.status === 'active' ? 'border-green-500/30' : 
                        emp.status === 'break' ? 'border-yellow-500/30' :
                        emp.status === 'away' ? 'border-amber-500/30' :
                        'border-slate-800'
                      } rounded-[2.5rem] p-6 space-y-5 hover:border-blue-500/50 transition-all group shadow-2xl relative overflow-hidden flex flex-col justify-between hover:shadow-blue-500/10`}>
                        {(emp.status === 'active' || emp.status === 'away' || emp.status === 'break') && (
                          <div className={`absolute top-0 left-0 w-1.5 h-full ${
                            emp.status === 'active' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' :
                            emp.status === 'break' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)]' :
                            'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                          }`} />
                        )}
                        
                        <div className="space-y-5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="relative flex-shrink-0">
                                <div className={`w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all ${
                                  emp.status === 'active' ? 'border-green-500 shadow-lg shadow-green-500/20' : 
                                  emp.status === 'break' ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' :
                                  emp.status === 'away' ? 'border-amber-500 shadow-lg shadow-amber-500/20' :
                                  'border-slate-800'
                                }`}>
                                  <img 
                                    src={emp.facePhotoUrl || emp.face_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.displayName || emp.name || 'User')}&background=random`} 
                                    alt={emp.displayName || emp.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                                  emp.status === 'active' ? 'bg-green-500' : 
                                  emp.status === 'break' ? 'bg-yellow-500' : 
                                  emp.status === 'away' ? 'bg-amber-500' :
                                  'bg-slate-600'
                                } shadow-lg`} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-black text-white text-lg leading-none truncate">{emp.displayName || emp.name}</h3>
                                  <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-slate-800 text-slate-500 rounded-md border border-slate-700">
                                    {emp.role || 'EMPLOYEE'}
                                  </span>
                                </div>
                                <p className="text-[10px] font-mono text-slate-500 leading-none uppercase tracking-tighter">{emp.uid.slice(0, 8)}</p>
                              </div>
                            </div>
                            
                            <button 
                              className="p-2.5 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 transition-all hover:text-white"
                              title="Quick Snapshot"
                            >
                              <Camera size={18} />
                            </button>
                          </div>

                          {/* Session Stats */}
                          <div className="grid grid-cols-2 gap-3 pt-2">
                            {(() => {
                              const today = new Date().toISOString().split('T')[0];
                              const empTodaySessions = sessions.filter(s => 
                                (s.userId === emp.uid || (s as any).user_id === emp.uid) && 
                                (s.date === today || (s.startTime && s.startTime.startsWith(today)))
                              );
                              const totalWork = empTodaySessions.reduce((acc, s) => acc + (s.totalWorkMinutes || 0), 0);
                              const totalBreak = empTodaySessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
                              
                              return (
                                <>
                                  <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Today's Work</p>
                                    <p className="text-sm font-black text-blue-400 font-mono">
                                      {Math.floor(totalWork / 60)}h {totalWork % 60}m
                                    </p>
                                  </div>
                                  <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Today's Break</p>
                                    <p className="text-sm font-black text-yellow-400 font-mono">
                                      {Math.floor(totalBreak / 60)}h {totalBreak % 60}m
                                    </p>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="flex items-center justify-between px-2 py-1 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                          <button onClick={() => initiateCall(emp, 'video')} className="p-2.5 text-slate-500 hover:text-blue-400 Transition-all active:scale-90"><Video size={20} /></button>
                          <button onClick={() => initiateCall(emp, 'voice')} className="p-2.5 text-slate-500 hover:text-blue-400 Transition-all active:scale-90"><Phone size={20} /></button>
                          <button onClick={() => { setMessageRecipient([emp.uid]); setShowMessageModal(true); }} className="p-2.5 text-slate-500 hover:text-white Transition-all active:scale-90"><MessageSquare size={20} /></button>
                          <button onClick={async () => { 
                            setMonitoringEmployee(emp); 
                            setShowWebRTCMonitor(true); 
                            setMonitoredEmployees(prev => new Set(prev).add(emp.uid));
                            try {
                              await supabase.from('users').update({ isMonitoringLive: true }).eq('uid', emp.uid);
                            } catch (e) {}
                          }} className="p-2.5 text-slate-500 hover:text-blue-400 Transition-all active:scale-90"><Eye size={20} /></button>
                          <button onClick={() => setShowEmployeeDetails(emp)} className="p-2.5 text-slate-500 hover:text-blue-400 Transition-all active:scale-90"><Activity size={20} /></button>
                        </div>

                        {emp.sessionApprovalStatus === 'pending' && (
                          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <ShieldAlert className="text-amber-500" size={18} />
                              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none">Security Authorization Required</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleApproveSession(emp)} className="flex-1 bg-green-600 hover:bg-green-500 text-white text-[9px] font-black py-2.5 rounded-xl transition-all">APPROVE</button>
                              <button onClick={() => handleRejectSession(emp)} className="flex-1 bg-slate-800 hover:bg-red-600 text-white text-[9px] font-black py-2.5 rounded-xl transition-all">REJECT</button>
                            </div>
                          </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950 rounded-[2rem] overflow-hidden aspect-video flex items-center justify-center relative border border-slate-800 group-hover:border-blue-500/20 transition-all shadow-inner">
                            {emp.cameraSnapshotUrl ? (
                              <img src={emp.cameraSnapshotUrl} alt="Cam" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-slate-800">
                                <span className="w-10 h-10 rounded-full border border-slate-900 flex items-center justify-center"><Camera size={20} /></span>
                                <span className="text-[8px] font-black uppercase tracking-[0.2em]">NO CAM</span>
                              </div>
                            )}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                              <div className={`w-1.5 h-1.5 rounded-full ${emp.isCameraOn ? 'bg-blue-500 animate-pulse' : 'bg-slate-500'}`} />
                              <span className="text-[10px] font-black text-white/90 tracking-tighter">CAM</span>
                            </div>
                          </div>

                          <div className="bg-slate-950 rounded-[2rem] overflow-hidden aspect-video flex items-center justify-center relative border border-slate-800 group-hover:border-blue-500/20 transition-all shadow-inner">
                            {emp.screenSnapshotUrl ? (
                              <img src={emp.screenSnapshotUrl} alt="Screen" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-slate-800">
                                <span className="w-10 h-10 rounded-full border border-slate-900 flex items-center justify-center"><Monitor size={20} /></span>
                                <span className="text-[8px] font-black uppercase tracking-[0.2em]">NO SCREEN</span>
                              </div>
                            )}
                            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                              <div className={`w-1.5 h-1.5 rounded-full ${emp.isMonitoringLive ? 'bg-blue-500 animate-pulse' : 'bg-slate-500'}`} />
                              <span className="text-[10px] font-black text-white/90 tracking-tighter">SCREEN</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] pt-4 border-t border-slate-800/50 mt-4">
                          <div className="flex items-center gap-2 text-slate-500">
                            <Clock size={12} className="text-slate-600" />
                            <span className="font-bold">Active: <span className="text-white">{safeFormatDate(emp.lastActive, 'h:mm a')}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 rounded-xl border border-green-500/20">
                            <ShieldCheck size={12} className="text-green-500" />
                            <span className="font-black text-green-500 uppercase tracking-tighter">SECURED</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          {activeTab === 'messages' && (
            <div className="flex flex-col lg:flex-row gap-8 h-[700px] animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
              {/* Sidebar: Users and Teams */}
              <div className={`${isChatSidebarOpen ? 'flex' : 'hidden lg:flex'} w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex-col absolute inset-0 z-20 lg:relative lg:inset-auto`}>
                <div className="p-6 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Messaging</h2>
                    <button onClick={() => setIsChatSidebarOpen(false)} className="lg:hidden p-2 text-slate-400"><X size={20} /></button>
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

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={chatSearchTerm}
                      onChange={(e) => setChatSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="p-4 space-y-6">
                    {/* Teams Section */}
                    {(chatSidebarView === 'all' || chatSidebarView === 'teams') && (
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Teams</h3>
                        <div className="space-y-1">
                          {teams.filter(t => t.name.toLowerCase().includes(chatSearchTerm.toLowerCase())).map(team => (
                            <button
                              key={team.id}
                              onClick={() => {
                                if (selectedChatTeam?.id === team.id) {
                                  setSelectedChatTeam(null);
                                  setSelectedTeamId(null);
                                } else {
                                  setSelectedChatTeam(team);
                                  setSelectedChatUser(null);
                                  setSelectedTeamId(team.id);
                                  setIsChatSidebarOpen(false);
                                }
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                                selectedChatTeam?.id === team.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedChatTeam?.id === team.id ? 'bg-white/20' : 'bg-slate-800'}`}>
                                <Users size={18} />
                              </div>
                              <div className="text-left flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{team.name}</p>
                                <p className={`text-[10px] ${selectedChatTeam?.id === team.id ? 'text-blue-100' : 'text-slate-500'}`}>
                                  {team.memberIds.length} members
                                </p>
                              </div>
                              {(() => {
                                const unreadCount = messages.filter(m => {
                                  const mTeamId = m.teamId || m.team_id || m.teamid;
                                  const mSenderId = m.senderId || m.sender_id || m.senderid;
                                  const isRead = m.isRead || m.is_read || m.isread;
                                  return mSenderId !== user.uid && !isRead && mTeamId === team.id;
                                }).length;
                                return unreadCount > 0 ? (
                                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                    {unreadCount}
                                  </div>
                                ) : null;
                              })()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Employees Section */}
                    {(chatSidebarView === 'all' || chatSidebarView === 'direct') && (
                      <div>
                        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Employees</h3>
                        <div className="space-y-1">
                          {/* Support Inbox Item */}
                          <button
                            onClick={() => {
                              setSelectedChatUser({ uid: 'admin', displayName: 'Support Inbox', status: 'active' } as any);
                              setSelectedChatTeam(null);
                              setSelectedTeamId(null);
                              setMessageRecipient(['admin']);
                              setIsChatSidebarOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                              selectedChatUser?.uid === 'admin' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'hover:bg-slate-800 text-slate-400'
                            }`}
                          >
                            <div className="relative">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedChatUser?.uid === 'admin' ? 'bg-white/20' : 'bg-slate-800'}`}>
                                <Shield size={18} />
                              </div>
                              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 bg-green-500" />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">Support Inbox</p>
                              <p className={`text-[10px] uppercase font-black tracking-tighter ${selectedChatUser?.uid === 'admin' ? 'text-purple-100' : 'text-slate-500'}`}>
                                SYSTEM CHANNEL
                              </p>
                            </div>
                            {(() => {
                              const unreadCount = messages.filter(m => {
                                const mReceiverIds = parseReceiverIds(m.receiverIds || m.receiver_ids || m.receiverids || []);
                                const isRead = m.isRead || m.is_read || m.isread;
                                const mCategory = m.category || (m as any).category || 'general';
                                return mCategory === 'support' && !isRead && mReceiverIds.includes('admin');
                              }).length;
                              return unreadCount > 0 ? (
                                <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                  {unreadCount}
                                </div>
                              ) : null;
                            })()}
                          </button>

                          {employees.filter(e => e.displayName.toLowerCase().includes(chatSearchTerm.toLowerCase())).map(emp => (
                            <button
                              key={emp.uid}
                              onClick={() => {
                                if (selectedChatUser?.uid === emp.uid) {
                                  setSelectedChatUser(null);
                                  setMessageRecipient([]);
                                } else {
                                  setSelectedChatUser(emp);
                                  setSelectedChatTeam(null);
                                  setSelectedTeamId(null);
                                  setMessageRecipient([emp.uid]);
                                  setIsChatSidebarOpen(false);
                                }
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                                selectedChatUser?.uid === emp.uid ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              <div className="relative">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedChatUser?.uid === emp.uid ? 'bg-white/20' : 'bg-slate-800'}`}>
                                  <User size={18} />
                                </div>
                                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${emp.status === 'active' ? 'bg-green-500' : 'bg-slate-700'}`} />
                              </div>
                              <div className="text-left flex-1 min-w-0">
                                <p className="text-sm font-bold truncate">{emp.displayName}</p>
                                <p className={`text-[10px] uppercase font-black tracking-tighter ${selectedChatUser?.uid === emp.uid ? 'text-blue-100' : 'text-slate-500'}`}>
                                  {emp.status === 'active' ? 'ONLINE' : 'OFFLINE'}
                                </p>
                              </div>
                              {(() => {
                                const isAdminUser = user.role === 'admin' || user.role === 'ceo' || user.role === 'founder';
                                const unreadCount = messages.filter(m => {
                                  const mSenderId = m.senderId || m.sender_id || m.senderid;
                                  const mReceiverIds = m.receiverIds || m.receiver_ids || m.receiverids || [];
                                  const isRead = m.isRead || m.is_read || m.isread;
                                  
                                  return mSenderId === emp.uid && !isRead && (mReceiverIds.includes(user.uid) || (isAdminUser && mReceiverIds.includes('admin')));
                                }).length;
                                return unreadCount > 0 ? (
                                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg">
                                    {unreadCount}
                                  </div>
                                ) : null;
                              })()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat Area */}
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl">
                {(selectedChatUser || selectedChatTeam) ? (
                  <>
                    <div className="p-4 md:p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setIsChatSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-white"><Menu size={20} /></button>
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                          {selectedChatTeam ? <Users size={20} /> : <User size={20} />}
                        </div>
                        <div>
                          <h3 className="font-bold text-base md:text-xl">{selectedChatTeam?.name || selectedChatUser?.displayName}</h3>
                          <p className="text-[10px] md:text-xs text-slate-500">
                            {selectedChatTeam ? 'Team Broadcast' : `Direct Message • ${selectedChatUser?.status}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 md:gap-2">
                        <button onClick={() => startCall('voice')} className="p-2 md:p-3 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"><Phone size={18} /></button>
                        <button onClick={() => startCall('video')} className="p-2 md:p-3 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"><Video size={18} /></button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar bg-slate-900/50">
                      {(() => {
                        const filteredMessages = messages.filter(m => {
                          const mTeamId = m.teamId || m.team_id || m.teamid;
                          const mSenderId = String(m.senderId || m.sender_id || m.senderid || '');
                          const mReceiverIds = parseReceiverIds(m.receiverIds || m.receiver_ids || m.receiverids || []).map(String);
                          const myUid = String(user.uid);

                          // Team chat
                          if (selectedChatTeam && mTeamId === selectedChatTeam.id) return true;

                          // Direct chat (no team)
                          if (selectedChatUser && !mTeamId) {
                            const targetUid = String(selectedChatUser.uid);

                            // "Support Inbox" — messages between any employee and admin channel
                            if (selectedChatUser.uid === 'admin') {
                              const toAdmin = mReceiverIds.includes('admin') || mReceiverIds.includes('support') || mReceiverIds.includes(myUid);
                              const fromAdmin = mSenderId === myUid || mSenderId === 'admin';
                              return (toAdmin || fromAdmin) && (m.category === 'support' || !m.category);
                            }

                            // Direct message with a specific employee
                            const isMeToThem = mSenderId === myUid && (mReceiverIds.includes(targetUid) || mReceiverIds.includes('admin'));
                            const isThemToMe = mSenderId === targetUid && (
                              mReceiverIds.includes(myUid) ||
                              mReceiverIds.includes('admin') ||
                              mReceiverIds.includes('support')
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
                            <div className="flex justify-center sticky top-0 z-10 py-2">
                              <span className="px-4 py-1.5 bg-slate-800/90 backdrop-blur-md text-[10px] font-black text-slate-300 rounded-full border border-slate-700/50 uppercase tracking-[0.2em] shadow-xl">
                                {date}
                              </span>
                            </div>
                            {groupMsgs.map((msg, idx) => {
                              const mSenderId = msg.senderId || (msg as any).sender_id || (msg as any).senderid;
                              const mSenderName = msg.senderName || (msg as any).sender_name || (msg as any).sendername;
                              const isMe = mSenderId === user.uid;
                              const prevMsg = groupMsgs[idx - 1];
                              const prevSenderId = prevMsg ? (prevMsg.senderId || (prevMsg as any).sender_id || (prevMsg as any).senderid) : undefined;
                              const isGrouped = prevMsg ? shouldGroupWithPrevious(
                                { senderId: mSenderId, timestamp: msg.timestamp },
                                { senderId: prevSenderId, timestamp: prevMsg.timestamp }
                              ) : false;
                              const avatarColor = getAvatarColor(mSenderName);
                              return (
                                <div key={idx} className={`flex items-end gap-2.5 ${isMe ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-1' : 'mt-4'} animate-in fade-in slide-in-from-bottom-2`}>
                                  {!isMe && (
                                    <div className="w-8 h-8 flex-shrink-0 self-start">
                                      {!isGrouped && (
                                        <div
                                          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-md"
                                          style={{ backgroundColor: avatarColor }}
                                        >
                                          {getInitials(mSenderName)}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[70%]`}>
                                    {!isGrouped && (
                                      <div className="flex items-center gap-2 mb-1 px-2">
                                        {!isMe && (
                                          <span className="text-[11px] font-black text-slate-300">
                                            {mSenderName}
                                          </span>
                                        )}
                                        <span className="text-[10px] text-slate-600 font-bold">{safeFormatDate(msg.timestamp, 'h:mm a')}</span>
                                      </div>
                                    )}
                                    <div className={`group relative w-full p-3.5 md:p-4 rounded-2xl shadow-lg transition-all hover:scale-[1.01] ${
                                      isMe 
                                        ? 'text-white rounded-tr-md border border-white/10' 
                                        : 'bg-slate-800 text-slate-200 rounded-tl-md border border-slate-700/50 shadow-black/20'
                                    }`}
                                    style={isMe ? { backgroundColor: '#6264A7' } : undefined}
                                    >
                                      {msg.attachmentUrl && (
                                        <div className="mb-3 rounded-2xl overflow-hidden bg-black/20 border border-white/10">
                                          {msg.attachmentType?.startsWith('image/') ? (
                                            <img src={msg.attachmentUrl} className="max-w-full h-auto object-cover cursor-zoom-in" referrerPolicy="no-referrer" onClick={() => window.open(msg.attachmentUrl, '_blank')} />
                                          ) : (
                                            <div className="p-3 flex items-center gap-4">
                                              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/10 flex items-center justify-center">
                                                <File size={18} />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold truncate text-white">{msg.attachmentName}</p>
                                                <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline font-bold mt-1 inline-block">Download File</a>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
                                      {isMe && (
                                        <div className="flex justify-end mt-2 opacity-60">
                                          {(msg.isRead || msg.is_read || msg.isread) ? (
                                            <CheckCheck size={12} className="text-white" />
                                          ) : (
                                            <Check size={12} className="text-white/60" />
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
                    </div>
                
                    <div className="px-4 pb-4">
                      {Object.entries(typingUsers).map(([uid, typing]) => {
                        if (!typing || uid === user.uid) return null;
                        const typingUser = employees.find(e => e.uid === uid);
                        if (!typingUser) return null;
                        
                        // Only show typing if it's in the current chat context
                        const isInContext = selectedChatTeam 
                          ? typingUser.team_id === selectedChatTeam.id
                          : selectedChatUser?.uid === uid;
                        
                        if (!isInContext) return null;

                        return (
                          <div key={uid} className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-2 mb-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{typingUser.displayName} is typing...</span>
                            </div>
                            <div className="bg-slate-800/50 p-3 rounded-2xl rounded-tl-none flex gap-1">
                              <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div ref={chatEndRef} />

              <div className="p-4 md:p-6 bg-slate-950 border-t border-slate-800">
                <div className="relative">
                  <textarea 
                    className="w-full bg-slate-900 border border-slate-800 rounded-3xl px-4 md:px-6 py-3 md:py-4 pr-24 md:pr-32 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 md:h-28 resize-none shadow-inner"
                    placeholder={selectedChatTeam ? "Broadcast to team..." : "Type your message..."}
                    value={messageContent}
                    onChange={(e) => {
                      setMessageContent(e.target.value);
                      handleTyping();
                    }}
                  />
                        <div className="absolute bottom-3 md:bottom-4 right-3 md:right-4 flex items-center gap-2 md:gap-3">
                          <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="p-2 md:p-3 bg-slate-800 border border-slate-700 rounded-2xl text-slate-400 hover:text-blue-400 transition-all hover:scale-105 active:scale-95"
                          >
                            {isUploading ? (
                              <div className="w-4 h-4 md:w-5 md:h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Paperclip size={18} md:size={20} />
                            )}
                          </button>
                          <button 
                            onClick={sendMessage}
                            disabled={(!messageContent.trim() && !attachment) || isUploading}
                            className="p-2 md:p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all disabled:opacity-50 hover:scale-105 active:scale-95 shadow-lg shadow-blue-600/20"
                          >
                            <Play size={18} md:size={20} />
                          </button>
                        </div>
                      </div>
                      {attachment && (
                        <div className="mt-4 flex items-center gap-4 p-3 bg-slate-900 border border-slate-800 rounded-2xl animate-in slide-in-from-bottom-2">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                            {attachment.type.startsWith('image/') ? (
                              <img src={attachment.url} className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                            ) : (
                              <File size={16} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate">{attachment.name}</p>
                          </div>
                          <button onClick={() => setAttachment(null)} className="p-2 text-slate-500 hover:text-red-500"><X size={16} /></button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 md:p-12">
                    <button onClick={() => setIsChatSidebarOpen(true)} className="lg:hidden mb-6 p-4 bg-slate-800 rounded-full text-blue-400 animate-bounce">
                      <MessageSquare size={32} />
                    </button>
                    <div className="hidden lg:flex w-24 h-24 rounded-full bg-slate-800 items-center justify-center text-slate-700 mb-6">
                      <MessageSquare size={48} />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold mb-2">Admin Communication Center</h3>
                    <p className="text-slate-500 max-w-sm text-sm">Select an employee or team to start messaging. You can broadcast to entire teams or message individuals directly.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {showWebRTCMonitor && monitoringEmployee && (
            <LiveWebRTCMonitor 
              employee={monitoringEmployee} 
              adminId={user.uid}
              onClose={async () => {
                const uidToRemove = monitoringEmployee.uid;
                setShowWebRTCMonitor(false);
                setMonitoringEmployee(null);
                setMonitoredEmployees(prev => {
                  const next = new Set(prev);
                  next.delete(uidToRemove);
                  return next;
                });
                try {
                  await supabase.from('users').update({ isMonitoringLive: false }).eq('uid', uidToRemove);
                } catch (e) {}
              }} 
            />
          )}

          {showCallModal && callEmployee && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
              <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                      {callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">
                        {callStatus === 'calling' ? `Calling ${callEmployee.displayName}...` : 
                         callStatus === 'connected' ? `CONNECTED • ${callEmployee.displayName}` : 'CALL ENDED'}
                      </h2>
                      <div className="flex items-center gap-2">
                        {callStatus === 'connected' && <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${callStatus === 'connected' ? 'text-green-500' : 'text-slate-500'}`}>
                          {callStatus === 'connected' ? 'Live Connection Active' : callEmployee.position || 'Employee'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={endCall}
                    className="p-3 hover:bg-red-500/10 text-slate-400 hover:text-red-500 rounded-2xl transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 relative bg-black overflow-hidden">
                  {callType === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center relative">
                      {/* Remote Video */}
                      <video 
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Local Video (PIP) */}
                      <div className="absolute bottom-6 right-6 w-48 aspect-video bg-slate-900 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl z-10">
                        <video 
                          ref={localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {callStatus === 'busy' && (
                <div className="flex flex-col items-center justify-center space-y-6 py-10 animate-pulse">
                  <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center text-white shadow-2xl">
                    <PhoneOff size={48} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-black text-white">{callBusyUser || 'Recipient'} is Busy</h3>
                    <p className="text-slate-500 mt-2">The user is currently in another call.</p>
                  </div>
                </div>
              )}

              {callStatus === 'calling' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                          <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6 animate-pulse">
                            <Phone size={40} className="text-blue-500" />
                          </div>
                          <h3 className="text-2xl font-black text-white mb-2">Calling {callEmployee.displayName}</h3>
                          <p className="text-slate-400 font-bold animate-pulse">Waiting for answer...</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900">
                      <div className="w-32 h-32 rounded-full bg-blue-500/10 flex items-center justify-center mb-8 relative">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-ping" />
                        <User size={64} className="text-blue-500" />
                      </div>
                      <h3 className="text-3xl font-black text-white mb-2">{callEmployee.displayName}</h3>
                      <p className="text-blue-400 font-bold text-lg uppercase tracking-widest">
                        {callStatus === 'calling' ? 'Calling...' : 'Voice Call Active'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-center flex-wrap gap-3">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${isMuted ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  {callType === 'video' && (
                    <button
                      onClick={() => setIsVideoOff(!isVideoOff)}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${isVideoOff ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                      {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                    </button>
                  )}
                  <button
                    onClick={endCall}
                    className="w-14 h-12 px-4 bg-red-600 text-white rounded-2xl hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <PhoneOff size={20} />
                    <span className="text-xs font-black uppercase tracking-wide">End</span>
                  </button>
                  {callType === 'video' && (
                    <button
                      onClick={toggleScreenShareInCall}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${isScreenSharingInCall ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                      <Monitor size={20} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-2xl font-bold">Daily Attendance Report</h2>
                  <p className="text-slate-400">Detailed breakdown for {safeFormatDate(selectedReportDate, 'EEEE, d MMMM yyyy')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="text-blue-500" size={20} />
                  <input 
                    type="date" 
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedReportDate}
                    onChange={(e) => setSelectedReportDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-sm">
                      <th className="py-4 px-4">Date</th>
                      <th className="py-4 px-4">Employee</th>
                      <th className="py-4 px-4">Code</th>
                      <th className="py-4 px-4">Work Time</th>
                      <th className="py-4 px-4">Break Time</th>
                      <th className="py-4 px-4">Hours</th>
                      <th className="py-4 px-4">Wage</th>
                      <th className="py-4 px-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {employees.map(emp => {
                      const stats = getDailyStats(emp.uid, selectedReportDate);
                      
                      return (
                        <tr key={emp.uid} className="text-sm hover:bg-slate-800/30">
                          <td className="py-4 px-4 text-slate-400">{selectedReportDate}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-blue-400">{emp.displayName.charAt(0)}</div>
                              <div>
                                <p className="font-bold">{emp.displayName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="bg-slate-800 px-2 py-1 rounded text-[10px] font-mono">{emp.specialCode}</span>
                          </td>
                          <td className="py-4 px-4 font-mono text-blue-400">{stats.work}</td>
                          <td className="py-4 px-4 font-mono text-yellow-500">{stats.break}</td>
                          <td className="py-4 px-4 font-bold">{stats.hours}h</td>
                          <td className="py-4 px-4 font-bold text-green-400">₹{stats.wage}</td>
                          <td className="py-4 px-4">
                            <button 
                              onClick={() => setShowEmployeeDetails(emp)}
                              className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1 rounded-lg transition-colors"
                            >
                              View More
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'management' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-xl font-bold">Employee Directory</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={() => {
                        setMessageRecipient(employees.map(e => e.uid));
                        setShowMessageModal(true);
                      }}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    >
                      <MessageSquare size={18} /> Message All
                    </button>
                    {selectedEmployees.length > 0 && (
                      <div className="flex items-center gap-2 animate-in fade-in zoom-in">
                        <button 
                          onClick={() => {
                            setMessageRecipient(selectedEmployees);
                            setShowMessageModal(true);
                          }}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
                        >
                          <MessageSquare size={18} /> Message ({selectedEmployees.length})
                        </button>
                        
                        <div className="relative group/bulk">
                          <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all">
                            Bulk Actions <MoreVertical size={16} />
                          </button>
                          <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 hidden group-hover/bulk:block">
                            <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 mb-1">Change Status</div>
                            {(['active', 'away', 'break', 'offline'] as const).map(status => (
                              <button 
                                key={status}
                                onClick={() => handleBulkStatusChange(status)}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors capitalize"
                              >
                                Set to {status}
                              </button>
                            ))}
                            <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800 mt-2 mb-1">Assign Team</div>
                            {teams.length > 0 ? teams.map(team => (
                              <button 
                                key={team.id}
                                onClick={() => handleBulkTeamAssignment(team.uniqueCode)}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors"
                              >
                                {team.name}
                              </button>
                            )) : (
                              <div className="px-4 py-2 text-[10px] text-slate-600">No teams available</div>
                            )}
                            <div className="border-t border-slate-800 mt-2 pt-1">
                              <button 
                                onClick={handleBulkDelete}
                                className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                Delete Selected
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1">
                      {(['all', 'active', 'away', 'break', 'offline'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setStatusFilter(status)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                            statusFilter === status 
                              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                    <select 
                      className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={positionFilter}
                      onChange={(e) => setPositionFilter(e.target.value)}
                    >
                      <option value="all">All Positions</option>
                      {Array.from(new Set(employees.map(e => e.position).filter(Boolean))).map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                    <button 
                      onClick={generateAutomatedPayroll}
                      disabled={isGeneratingPayroll}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      <DollarSign size={18} /> {isGeneratingPayroll ? 'Generating...' : 'Automate Payroll'}
                    </button>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search employees..."
                        className="bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <button 
                      onClick={() => setShowAddEmployeeModal(true)}
                      className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition-all"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-sm">
                        <th className="py-4 px-6 w-10">
                          <input 
                            type="checkbox" 
                            checked={selectedEmployees.length === filteredEmployees.length && filteredEmployees.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedEmployees(filteredEmployees.map(emp => emp.uid));
                              } else {
                                setSelectedEmployees([]);
                              }
                            }}
                            className="rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500"
                          />
                        </th>
                        <th className="py-4 px-6">Employee</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6">Hourly Rate</th>
                        <th className="py-4 px-6">Last Active</th>
                        <th className="py-4 px-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredEmployees.map((emp) => (
                        <tr key={emp.uid} className={`group hover:bg-slate-800/30 transition-colors ${selectedEmployees.includes(emp.uid) ? 'bg-blue-600/5' : ''}`}>
                          <td className="py-4 px-6">
                            <input 
                              type="checkbox" 
                              checked={selectedEmployees.includes(emp.uid)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEmployees([...selectedEmployees, emp.uid]);
                                } else {
                                  setSelectedEmployees(selectedEmployees.filter(id => id !== emp.uid));
                                }
                              }}
                              className="rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-blue-500 font-bold">
                                {emp.displayName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold">{emp.displayName}</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{emp.specialCode}</p>
                                  {emp.position && <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest bg-blue-500/10 px-1 rounded">{emp.position}</span>}
                                  {emp.team_id && <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-800 px-1 rounded">Team: {emp.team_id}</span>}
                                </div>
                                <p className="text-xs text-slate-500">{emp.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                              emp.status === 'active' ? 'bg-green-500/10 text-green-500' :
                              emp.status === 'away' ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-slate-800 text-slate-500'
                            }`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                emp.status === 'active' ? 'bg-green-500' :
                                emp.status === 'away' ? 'bg-yellow-500' :
                                'bg-slate-500'
                              }`} />
                              {emp.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-4 px-6 font-bold">₹{emp.hourlyRate}/hr</td>
                          <td className="py-4 px-6 text-sm text-slate-400">
                            {safeFormatDate(emp.lastActive, 'MMM d, h:mm a')}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => {
                                  setMessageRecipient([emp.uid]);
                                  setShowMessageModal(true);
                                }}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                                title="Send Message"
                              >
                                <MessageSquare size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  setIsEditingEmployee(true);
                                  setEditingEmployeeId(emp.uid);
                                  setNewEmployee({
                                    displayName: emp.displayName,
                                    email: emp.email,
                                    specialCode: emp.specialCode,
                                    hourlyRate: emp.hourlyRate,
                                    payoutFrequency: emp.payoutFrequency || 'monthly',
                                    position: emp.position || '',
                                    team_id: emp.team_id || '',
                                    standardWorkingHours: emp.standardWorkingHours || 8,
                                    facePhoto: null
                                  });
                                  setShowAddEmployeeModal(true);
                                }}
                                className="p-2 bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-xl transition-all"
                                title="Edit Employee"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteEmployee(emp.uid)}
                                className="p-2 bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl transition-all"
                                title="Delete Employee"
                              >
                                <Trash2 size={16} />
                              </button>
                              <button 
                                onClick={() => setShowEmployeeDetails(emp)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                                title="View Details"
                              >
                                <FileText size={16} />
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedEmployee(emp);
                                  setPaymentAmount(getOutstandingAmount(emp.uid).toFixed(2));
                                  setShowPaymentModal(true);
                                }}
                                className="bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
                              >
                                Pay (₹{getOutstandingAmount(emp.uid).toLocaleString()})
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Productivity Chart */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                <h2 className="text-xl font-bold mb-6">Work Productivity (Hours)</h2>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <YAxis 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => `${val}h`}
                      />
                      <Tooltip 
                        cursor={{ fill: '#1e293b' }}
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      />
                      <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.status === 'active' ? '#3b82f6' : '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Sidebar: Consistently removed redundant sections - handled in Notification Center */}
          
          {activeTab === 'teams' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Team Management</h2>
                  <p className="text-slate-400 text-sm">Create and organize employees into teams</p>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search teams..." 
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                      value={liveSearchTerm}
                      onChange={(e) => setLiveSearchTerm(e.target.value)}
                    />
                  </div>
                  {canManageTeams && (
                    <button 
                      onClick={() => {
                        setSelectedTeam(null);
                        setNewTeam({ name: '', memberIds: [] as string[], uniqueCode: '' });
                        setShowAddTeamModal(true);
                      }}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                      <Plus size={20} /> Create New Team
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {teams.filter(t => t.name.toLowerCase().includes(liveSearchTerm.toLowerCase())).length === 0 ? (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-[3rem] bg-slate-900/50">
                    <Users size={48} className="mb-4 opacity-20" />
                    <p className="font-bold text-lg">No teams found</p>
                    <p className="text-sm">Create a new team to get started</p>
                  </div>
                ) : (
                  teams.filter(t => t.name.toLowerCase().includes(liveSearchTerm.toLowerCase())).map(team => (
                  <div key={team.id} className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 hover:border-blue-500/30 transition-all group shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-blue-600/10 transition-all" />
                    
                    <div className="flex items-center justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600/20 to-blue-600/5 flex items-center justify-center text-blue-500 border border-blue-500/20 shadow-inner">
                          <Users size={28} />
                        </div>
                        <div>
                          <h3 className="font-black text-xl text-white tracking-tight">{team.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg">
                              <User size={12} className="text-slate-500" />
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{team.memberIds.length} Members</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                              <Hash size={12} className="text-blue-400" />
                              <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">{team.uniqueCode}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageTeams && (
                          <>
                            <button 
                              onClick={() => {
                                setSelectedTeam(team);
                                setNewTeam({ name: team.name, memberIds: team.memberIds, uniqueCode: team.uniqueCode });
                                setShowAddTeamModal(true);
                              }}
                              className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 hover:text-blue-400 hover:border-blue-500/30 transition-all"
                            >
                              <Edit size={18} />
                            </button>
                            <button 
                              onClick={async () => {
                                if (confirm('Are you sure you want to delete this team?')) {
                                  await supabase.from('teams').delete().eq('id', team.id);
                                }
                              }}
                              className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-500 hover:text-red-500 hover:border-red-500/30 transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Team Roster</label>
                        <span className="text-[9px] font-bold text-blue-500/50 bg-blue-500/5 px-2 py-0.5 rounded-md uppercase">
                          {team.memberIds.length} ACTIVE
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                        {team.memberIds.map((mid: string) => {
                          const emp = employees.find(e => e.uid === mid);
                          const isOnline = emp?.status === 'active';
                          return (
                            <div key={mid} className="flex items-center gap-3 bg-slate-950/50 border border-slate-800/50 p-2.5 rounded-2xl text-xs hover:bg-slate-800 hover:border-slate-700 transition-all group/member relative overflow-hidden">
                              {isOnline && (
                                <div className="absolute top-0 right-0 w-1 h-1 bg-green-500 rounded-full mt-2 mr-2" />
                              )}
                              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/5 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                {emp?.facePhotoUrl || emp?.face_photo_url ? (
                                  <img src={emp.facePhotoUrl || emp?.face_photo_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs font-black text-blue-400">{emp?.displayName?.charAt(0) || '?'}</span>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className={`font-bold truncate group-hover/member:text-white transition-colors ${isOnline ? 'text-slate-200' : 'text-slate-500'}`}>
                                  {emp?.displayName || emp?.name || 'Unknown'}
                                </span>
                                <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest truncate">
                                  {isOnline ? 'Online' : 'Offline'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {team.memberIds.length === 0 && (
                          <div className="col-span-2 py-6 text-center bg-slate-950 rounded-2xl border border-dashed border-slate-800">
                             <p className="text-[10px] text-slate-600 italic font-medium">Empty roster</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-800/50 flex items-center justify-between relative z-10">
                      <button 
                        onClick={() => {
                          setSelectedTeamId(team.id);
                          setMessageRecipient([]);
                          setShowMessageModal(true);
                        }}
                        className="group/btn flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-2xl text-xs font-black transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                      >
                        <MessageSquare size={16} className="group-hover/btn:rotate-12 transition-transform" /> 
                        <span>MESSAGE TEAM</span>
                      </button>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Created On</span>
                        <span className="text-[10px] font-bold text-slate-400">{safeFormatDate(team.createdAt, 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                )))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals outside max-w container */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold">Send Message</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={clearChat}
                  className="p-2 hover:bg-red-500/10 text-red-500 rounded-xl transition-all"
                  title="Clear Chat for Everyone"
                >
                  <Eraser size={18} />
                </button>
                {messageRecipient.length > 0 && (
                  <>
                    <button 
                      onClick={() => startCall('voice')}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-blue-400 transition-all"
                      title="Voice Call"
                    >
                      <Phone size={18} />
                    </button>
                    <button 
                      onClick={() => startCall('video')}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-blue-400 transition-all"
                      title="Video Call"
                    >
                      <Video size={18} />
                    </button>
                    <button 
                      onClick={() => startCall('video')}
                      className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-blue-400 transition-all"
                      title="Start Meeting"
                    >
                      <Users size={18} />
                    </button>
                  </>
                )}
                <button onClick={() => setShowMessageModal(false)} className="p-2 text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
            </div>
            <p className="text-slate-400 mb-6">Send a direct message to employees.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Message Type</label>
                <div className="flex gap-2 mb-4">
                  <button 
                    onClick={() => setSelectedTeamId(null)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${!selectedTeamId ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                    Individual
                  </button>
                  <button 
                    onClick={() => {
                      if (teams.length > 0) setSelectedTeamId(teams[0].id);
                      setMessageRecipient([]);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${selectedTeamId ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                  >
                    Team Broadcast
                  </button>
                </div>

                {selectedTeamId ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Select Team</label>
                    <select 
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Recipients</label>
                    <div className="max-h-32 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1">
                      {employees.map(emp => (
                        <label key={emp.uid} className="flex items-center gap-2 p-2 hover:bg-slate-900 rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={messageRecipient.includes(emp.uid)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMessageRecipient([...messageRecipient, emp.uid]);
                              } else {
                                setMessageRecipient(messageRecipient.filter(id => id !== emp.uid));
                              }
                            }}
                            className="rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm">{emp.displayName} ({emp.specialCode})</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button 
                        onClick={() => setMessageRecipient(employees.map(e => e.uid))}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Select All
                      </button>
                      <button 
                        onClick={() => setMessageRecipient([])}
                        className="text-[10px] text-slate-500 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Message Content</label>
                <div className="relative">
                  <textarea 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
                    placeholder="Type your message here..."
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                  />
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-blue-400 transition-all"
                      title="Attach File"
                    >
                      {isUploading ? (
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Paperclip size={16} />
                      )}
                    </button>
                  </div>
                </div>
                {attachment && (
                  <div className="mt-2 flex items-center gap-3 p-2 bg-slate-950 border border-slate-800 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                      {attachment.type.startsWith('image/') ? (
                        <img src={attachment.url} className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
                      ) : (
                        <File size={16} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate">{attachment.name}</p>
                    </div>
                    <button onClick={() => setAttachment(null)} className="p-1 text-slate-500 hover:text-red-500">
                      <XCircle size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowMessageModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={sendMessage}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Details Modal */}
      {showEmployeeDetails && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl font-bold text-blue-500">
                  {showEmployeeDetails.displayName.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{showEmployeeDetails.displayName}</h2>
                  <p className="text-slate-400">{showEmployeeDetails.email} • ₹{showEmployeeDetails.hourlyRate}/hr</p>
                </div>
              </div>
              <button onClick={() => setShowEmployeeDetails(null)} className="p-2 text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 relative group">
                <p className="text-slate-500 text-xs uppercase font-bold mb-1">Outstanding</p>
                <p className="text-2xl font-black text-blue-400">₹{getOutstandingAmount(showEmployeeDetails.uid).toLocaleString()}</p>
                {getOutstandingAmount(showEmployeeDetails.uid) > 0 && (
                  <button 
                    onClick={() => {
                      setSelectedEmployee(showEmployeeDetails);
                      setPaymentAmount(getOutstandingAmount(showEmployeeDetails.uid).toFixed(2));
                      setShowPaymentModal(true);
                    }}
                    className="absolute top-4 right-4 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <DollarSign size={16} />
                  </button>
                )}
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <p className="text-slate-500 text-xs uppercase font-bold mb-1">Total Work</p>
                <p className="text-2xl font-black text-white">
                  {sessions.filter(s => s.userId === showEmployeeDetails.uid).reduce((acc, s) => acc + (s.totalWorkMinutes || 0), 0)}m
                </p>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <p className="text-slate-500 text-xs uppercase font-bold mb-1">Total Breaks</p>
                <p className="text-2xl font-black text-yellow-500">
                  {sessions.filter(s => s.userId === showEmployeeDetails.uid).reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0)}m
                </p>
              </div>
            </div>

            <h3 className="text-lg font-bold mb-4">Payment History</h3>
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden mb-8">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-slate-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {payments.filter(p => p.userId === showEmployeeDetails.uid).map(p => (
                    <tr key={p.id} className="text-sm">
                      <td className="px-4 py-3">{p.periodStart} - {p.periodEnd}</td>
                      <td className="px-4 py-3 font-bold text-blue-400">₹{p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${
                          p.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => {
                            // Reuse the downloadPayslip logic if available, or implement a simple version
                            const doc = new jsPDF();
                            doc.setFontSize(20);
                            doc.text('8gen Technology - Payslip', 20, 20);
                            doc.setFontSize(12);
                            doc.text(`Employee: ${p.employeeName}`, 20, 40);
                            doc.text(`Period: ${p.periodStart} to ${p.periodEnd}`, 20, 50);
                            doc.text(`Amount: ₹${p.amount.toLocaleString()}`, 20, 60);
                            doc.text(`Status: ${p.status.toUpperCase()}`, 20, 70);
                            doc.save(`payslip-${p.employeeName}-${p.periodEnd}.pdf`);
                          }}
                          className="p-1 hover:bg-slate-800 rounded text-blue-400"
                        >
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-bold mb-4">Recent Work Sessions</h3>
            <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-slate-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Work</th>
                    <th className="px-4 py-3">Break</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {sessions.filter(s => s.userId === showEmployeeDetails.uid).slice(0, 10).map(s => (
                    <tr key={s.id} className="text-sm">
                      <td className="px-4 py-3">{s.date}</td>
                      <td className="px-4 py-3 font-bold text-blue-400">{s.totalWorkMinutes}m</td>
                      <td className="px-4 py-3 text-yellow-500">{s.totalBreakMinutes}m</td>
                      <td className="px-4 py-3 capitalize text-slate-400">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <h2 className="text-2xl font-bold mb-2">{isEditingEmployee ? 'Edit Employee' : 'Add New Employee'}</h2>
            <p className="text-slate-400 mb-6">{isEditingEmployee ? 'Update employee information and face data' : 'Create credentials and register face photo.'}</p>
            
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Full Name</label>
                <input 
                  type="text" 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Darshan Patil"
                  value={newEmployee.displayName}
                  onChange={(e) => setNewEmployee({...newEmployee, displayName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Email</label>
                <input 
                  type="email" 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@workwatch.ai"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Job Position</label>
                  <input 
                    type="text" 
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Senior Developer"
                    value={newEmployee.position}
                    onChange={(e) => setNewEmployee({...newEmployee, position: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Assign Team</label>
                  <select 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.team_id || ''}
                    onChange={(e) => setNewEmployee({...newEmployee, team_id: e.target.value})}
                  >
                    <option value="">No Team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Special Code</label>
                  <input 
                    type="text" 
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ABC123"
                    value={newEmployee.specialCode}
                    onChange={(e) => setNewEmployee({...newEmployee, specialCode: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">User Role</label>
                  <select 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee({...newEmployee, role: e.target.value as any})}
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                    <option value="ceo">CEO</option>
                    <option value="founder">Founder</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Standard Working Hours</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    max="24"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.standardWorkingHours || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 8 : parseInt(e.target.value);
                      setNewEmployee({...newEmployee, standardWorkingHours: isNaN(val) ? 8 : val});
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Hourly Rate (₹)</label>
                  <input 
                    type="number" 
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newEmployee.hourlyRate || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                      setNewEmployee({...newEmployee, hourlyRate: isNaN(val) ? 0 : val});
                    }}
                  />
                </div>
              </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Reference Photo (Must match live face)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  required={!isEditingEmployee}
                  onChange={(e) => setNewEmployee({...newEmployee, facePhoto: e.target.files?.[0] || null})}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-600/10 file:text-blue-400 hover:file:bg-blue-600/20"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddEmployeeModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isExtracting}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {isExtracting ? 'Extracting Face...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <h2 className="text-2xl font-bold mb-2">Create Payment</h2>
            <p className="text-slate-400 mb-6">Generating payout for {selectedEmployee.displayName || selectedEmployee.name}</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Amount (₹)</label>
                <input 
                  type="number" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={createPayment}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20"
                >
                  Confirm Payout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Center Modal */}
      {showNotificationCenter && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 z-[70] animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col relative">
            <div className="p-8 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-white">Notification Center</h2>
                <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest font-bold">Security, Sessions & Requests</p>
              </div>
              <button 
                onClick={() => setShowNotificationCenter(false)}
                className="p-3 bg-slate-800 hover:bg-red-600 text-white rounded-2xl transition-all shadow-lg active:scale-95"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                  {/* Security Alerts Section */}
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <ShieldAlert size={14} className="text-red-500" /> Security Intelligence
                      </h3>
                      {alerts.filter(a => a.type !== 'session_request' && a.type !== 'leave_request' && a.type !== 'session_approval').length > 0 && (
                        <button 
                          onClick={clearAlerts}
                          className="text-[9px] text-red-500 hover:text-red-400 font-black uppercase tracking-wider bg-red-500/10 px-3 py-1 rounded-full transition-all"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {alerts.filter(a => a.type !== 'session_request' && a.type !== 'leave_request' && a.type !== 'session_approval').map(alert => (
                        <div key={alert.id} className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-4 relative group hover:border-red-500/30 transition-all">
                          <button 
                            onClick={() => deleteAlert(alert.id)}
                            className="absolute top-4 right-4 p-1.5 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-500/10"
                          >
                            <X size={12} />
                          </button>
                          <div className="flex gap-4">
                            <div className="p-3 bg-red-500/10 rounded-xl text-red-500 h-fit">
                              <ShieldAlert size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-100">{alert.type === 'face_mismatch' ? 'Identity Verification Failed' : alert.type === 'continuous_mismatch' ? 'Continuous Identity Mismatch' : 'Security Anomaly'}</p>
                              <p className="text-[10px] text-slate-400 mt-1">Affected Staff: <span className="text-white font-black">{alert.employeeName}</span></p>
                              <div className="text-[10px] text-slate-500 mt-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800/40 leading-relaxed">
                                {(() => {
                                  try {
                                    const d = JSON.parse(alert.details);
                                    if (d.startDate && d.endDate) return `Period: ${d.startDate} to ${d.endDate}${d.reason ? ' • Reason: ' + d.reason : ''}`;
                                    return alert.details;
                                  } catch (_) { return alert.details; }
                                })()}
                              </div>
                              <p className="text-[9px] text-slate-600 mt-3 font-mono uppercase tracking-tighter">{safeFormatDate(alert.timestamp, 'MMM d, yyyy • h:mm a')}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {alerts.filter(a => a.type !== 'session_request' && a.type !== 'session_approval').length === 0 && (
                        <div className="text-center py-10 bg-slate-950/20 rounded-3xl border border-dashed border-slate-800/50">
                          <ShieldCheck className="mx-auto text-slate-800 mb-2 opacity-20" size={32} />
                          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">System Secure</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Operational Overlays Section */}
                  <section>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-6">
                      <Play size={14} className="text-yellow-500" /> Operational Overlays
                    </h3>
                    <div className="space-y-3">
                      {alerts.filter(a => (a.type === 'session_request' || a.type === 'session_approval') && a.status === 'new').map((req) => (
                        <div key={req.id} className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-4 transition-all hover:border-yellow-500/30">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500">
                                <Play size={18} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-100">{req.employeeName}</p>
                                <p className="text-[10px] text-slate-500">Requesting Additional Session</p>
                              </div>
                            </div>
                            <p className="text-[9px] text-slate-600 font-mono">{safeFormatDate(req.timestamp, 'h:mm a')}</p>
                          </div>
                          {req.details && <p className="text-[10px] text-slate-500 bg-slate-900/50 p-2 rounded-lg italic mb-4 border border-slate-800/30 overflow-hidden text-ellipsis whitespace-nowrap">"{req.details}"</p>}
                          <div className="flex gap-2">
                            <button 
                              onClick={async () => {
                                await supabase.from('alerts').update({ status: 'approved' }).eq('id', req.id);
                                await supabase.from('users').update({ sessionApprovalStatus: 'approved' }).eq('uid', req.userId);
                                oneShotSend(`calls:${req.userId}`, 'session-approved', { status: 'approved' });
                                fetchData();
                              }}
                              className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white text-[10px] font-black uppercase py-3 rounded-xl transition-all shadow-lg shadow-yellow-600/20 active:scale-95"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={async () => {
                                await supabase.from('alerts').update({ status: 'rejected' }).eq('id', req.id);
                                await supabase.from('users').update({ sessionApprovalStatus: 'none' }).eq('uid', req.userId);
                                fetchData();
                              }}
                              className="flex-1 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-500 text-[10px] font-black uppercase py-3 rounded-xl transition-all border border-slate-800"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                      {(alerts.filter(a => (a.type === 'session_request' || a.type === 'session_approval') && a.status === 'new').length === 0) && (
                        <div className="text-center py-8 bg-slate-950/20 rounded-3xl border border-dashed border-slate-800/50">
                          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">No Operational Requests</p>
                        </div>
                      )}
                    </div>
                  </section>



                  {/* Communication Gateways Section */}
                  <section>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-6">
                      <MessageSquare size={14} className="text-blue-500" /> Communication Gateways
                    </h3>
                    <div className="space-y-3">
                      {messageRequests.filter(r => r.status === 'pending').map((req) => (
                        <div key={req.id} className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-4 transition-all hover:border-blue-500/30">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                                <MessageSquare size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-100 truncate">{req.senderName}</p>
                                <p className="text-[10px] text-slate-500">Wants to message <span className="text-white font-bold">{req.receiverName}</span></p>
                              </div>
                            </div>
                            <p className="text-[9px] text-slate-600 font-mono">{safeFormatDate(req.timestamp, 'h:mm a')}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                handleMessageRequest(req.id, 'approved');
                                fetchData();
                              }}
                              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={() => {
                                handleMessageRequest(req.id, 'rejected');
                                fetchData();
                              }}
                              className="flex-1 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-500 text-[10px] font-black uppercase py-3 rounded-xl transition-all border border-slate-800"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                      {messageRequests.filter(r => r.status === 'pending').length === 0 && (
                        <div className="text-center py-8 bg-slate-950/20 rounded-3xl border border-dashed border-slate-800/50">
                          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">No Message Requests</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Financial Pipeline Section */}
                  <section>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2 mb-6">
                      <DollarSign size={14} className="text-green-500" /> Financial Pipeline
                    </h3>
                    <div className="space-y-3">
                      {payments.filter(p => p.status === 'pending').map((p) => (
                        <div key={p.id} className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-4 transition-all hover:border-green-500/30">
                          <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="p-3 bg-green-500/10 rounded-xl text-green-500">
                                <DollarSign size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-100 truncate">{p.employeeName || 'Staff Member'}</p>
                                <p className="text-[10px] text-slate-500 tracking-tight">{p.periodStart} - {p.periodEnd}</p>
                              </div>
                            </div>
                            <span className="text-xl font-black text-green-400">₹{p.amount.toLocaleString()}</span>
                          </div>
                          <button 
                            onClick={() => approvePayment(p.id!)}
                            className="w-full bg-green-600 hover:bg-green-500 text-white text-[10px] font-black uppercase py-3 rounded-xl transition-all shadow-lg shadow-green-600/20 active:scale-95"
                          >
                            Authorize Payout
                          </button>
                        </div>
                      ))}
                      {payments.filter(p => p.status === 'pending').length === 0 && (
                        <div className="text-center py-8 bg-slate-950/20 rounded-3xl border border-dashed border-slate-800/50">
                          <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Pipeline Clear</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Transaction History Section */}
                  <section>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <CheckCheck size={14} className="text-slate-500" /> History & Logs
                      </h3>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" size={10} />
                        <input 
                          type="text"
                          placeholder="FILTRATION..."
                          className="bg-slate-950/50 border border-slate-800/50 rounded-full pl-8 pr-3 py-1 text-[8px] text-white focus:outline-none focus:ring-1 focus:ring-slate-700 w-32 font-bold transition-all"
                          value={paidSearchTerm}
                          onChange={(e) => setPaidSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                      {payments
                        .filter(p => p.status === 'paid' || p.status === 'approved')
                        .filter(p => !paidSearchTerm || p.employeeName?.toLowerCase().includes(paidSearchTerm.toLowerCase()))
                        .map((p) => (
                        <div key={p.id} className="bg-slate-950/30 border border-slate-800/30 rounded-xl p-3 flex items-center justify-between group hover:bg-slate-800/20 transition-all">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${p.status === 'paid' ? 'bg-slate-800 text-slate-500' : 'bg-green-500/10 text-green-500'}`}>
                              {p.status === 'paid' ? <Check size={14} /> : <Clock size={14} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-300 truncate">{p.employeeName || 'Staff Member'}</p>
                              <p className="text-[9px] text-slate-500 tracking-tighter uppercase font-medium">{p.status === 'paid' ? 'Settled' : 'Awaiting Settlement'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-slate-400">₹{p.amount.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{p.periodStart} - {p.periodEnd}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
          </div>
        </div>
      )}
      {showSingleLiveCast && selectedEmployee && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 z-[60]">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 md:p-10 w-full max-w-6xl max-h-[95vh] overflow-y-auto shadow-2xl relative custom-scrollbar">
            <button 
              onClick={() => {
                setShowSingleLiveCast(false);
                setSelectedEmployee(null);
              }} 
              className="absolute top-4 right-4 md:top-8 md:right-8 p-2 md:p-3 bg-slate-800 hover:bg-red-600 text-white rounded-2xl transition-all shadow-xl z-10"
            >
              <X size={20} md:size={24} />
            </button>

            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 mb-8 md:mb-10">
              <div className="relative">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl overflow-hidden border-4 border-blue-600/30">
                  <img 
                    src={selectedEmployee.facePhotoUrl || selectedEmployee.face_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedEmployee.displayName || selectedEmployee.name || 'User')}&background=random`} 
                    alt={selectedEmployee.displayName || selectedEmployee.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className={`absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full border-4 border-slate-900 ${
                  selectedEmployee.status === 'active' ? 'bg-green-500' : 
                  selectedEmployee.status === 'break' ? 'bg-yellow-500' : 
                  selectedEmployee.status === 'away' ? 'bg-amber-500' : 'bg-slate-600'
                }`} />
              </div>
              <div className="text-center md:text-left">
                <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white">{selectedEmployee.displayName || selectedEmployee.name}</h2>
                <div className="flex items-center justify-center md:justify-start gap-3 mt-1">
                  <span className="text-[10px] md:text-xs font-mono text-slate-500 uppercase tracking-widest">{selectedEmployee.specialCode || selectedEmployee.unique_code}</span>
                  <span className="w-1 h-1 bg-slate-700 rounded-full" />
                  <span className={`text-[10px] md:text-xs font-bold uppercase ${
                    selectedEmployee.status === 'active' ? 'text-green-500' : 
                    selectedEmployee.status === 'break' ? 'text-yellow-500' : 
                    selectedEmployee.status === 'away' ? 'text-amber-500' : 'text-slate-500'
                  }`}>
                    {selectedEmployee.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Camera size={16} className="text-blue-500" /> Camera Feed
                  </h3>
                  {selectedEmployee.status === 'active' && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" /> LIVE
                    </span>
                  )}
                </div>
                <div className="aspect-video bg-slate-950 rounded-[2rem] border-2 border-slate-800 overflow-hidden shadow-inner relative group">
                  {selectedEmployee.cameraSnapshotUrl ? (
                    <img 
                      src={`${selectedEmployee.cameraSnapshotUrl}?t=${Date.now()}`} 
                      alt="Camera Feed" 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                      <Camera size={64} className="mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest opacity-40">Camera Offline</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Monitor size={16} className="text-purple-500" /> Screen Monitor
                  </h3>
                  {selectedEmployee.status === 'active' && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" /> LIVE
                    </span>
                  )}
                </div>
                <div className="aspect-video bg-slate-950 rounded-[2rem] border-2 border-slate-800 overflow-hidden shadow-inner relative group">
                  {selectedEmployee.screenSnapshotUrl ? (
                    <img 
                      src={`${selectedEmployee.screenSnapshotUrl}?t=${Date.now()}`} 
                      alt="Screen Monitor" 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-700">
                      <Monitor size={64} className="mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest opacity-40">Screen Share Offline</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <button 
                onClick={() => {
                  setSelectedChatUser(selectedEmployee);
                  setActiveTab('messages');
                  setShowSingleLiveCast(false);
                }}
                className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-blue-600/20"
              >
                <MessageSquare size={20} /> Send Message
              </button>
              <button 
                onClick={async () => {
                  setMonitoringEmployee(selectedEmployee);
                  setShowWebRTCMonitor(true);
                  setShowSingleLiveCast(false);
                  // Update employee's monitoring status so they start the feed
                  try {
                    await supabase.from('users').update({ isMonitoringLive: true }).eq('uid', selectedEmployee.uid);
                  } catch (e) {}
                }}
                className="flex items-center justify-center gap-3 bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-green-600/20"
              >
                <Video size={20} /> Live Video Feed
              </button>
              <button 
                onClick={() => {
                  setShowEmployeeDetails(selectedEmployee);
                  setShowSingleLiveCast(false);
                }}
                className="flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-2xl transition-all"
              >
                <Activity size={20} /> View Full Report
              </button>
              <button 
                onClick={() => {
                  // Trigger a manual alert
                  supabase.from('alerts').insert({
                    userId: selectedEmployee.uid,
                    employeeName: selectedEmployee.displayName,
                    type: 'admin_check',
                    timestamp: new Date().toISOString(),
                    status: 'new',
                    details: 'Admin is currently monitoring your live feed.'
                  });
                  alert('Alert sent to employee.');
                }}
                className="flex items-center justify-center gap-3 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-yellow-600/20"
              >
                <AlertCircle size={20} /> Send Attention Alert
              </button>
            </div>
          </div>
        </div>
      )}
      {showLiveViewModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-6xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">Live Workforce View</h2>
                <p className="text-slate-400">Real-time monitoring of all active employees</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="text" 
                    placeholder="Enter secrets code to search employee..."
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
                    value={liveSearchTerm}
                    onChange={(e) => setLiveSearchTerm(e.target.value)}
                  />
                </div>
                <button onClick={() => setShowLiveViewModal(false)} className="p-2 text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {employees.filter(e => 
                e.displayName.toLowerCase().includes(liveSearchTerm.toLowerCase()) || 
                e.specialCode.toLowerCase().includes(liveSearchTerm.toLowerCase())
              ).map(emp => (
                <div key={emp.uid} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-4 hover:border-blue-500/50 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${emp.status === 'active' ? 'bg-green-500 animate-pulse' : emp.status === 'break' ? 'bg-yellow-500' : 'bg-slate-700'}`} />
                      <h3 className="font-bold truncate max-w-[120px]">{emp.displayName}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-slate-500 uppercase">{emp.status}</span>
                      <div className="flex items-center gap-1.5 ml-2">
                        <button 
                          onClick={() => {
                            setMessageRecipient([emp.uid]);
                            setShowMessageModal(true);
                          }}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="Send Message"
                        >
                          <MessageSquare size={16} />
                        </button>
                        <button 
                          onClick={async () => {
                            setMonitoringEmployee(emp);
                            setShowWebRTCMonitor(true);
                            setShowLiveViewModal(false);
                            setMonitoredEmployees(prev => new Set(prev).add(emp.uid));
                            try {
                              await supabase.from('users').update({ isMonitoringLive: true }).eq('uid', emp.uid);
                            } catch (e) {}
                          }}
                          className="p-2 bg-green-500/10 hover:bg-green-600 rounded-lg text-green-500 hover:text-white transition-colors"
                          title="View Live WebRTC Feed"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => setShowEmployeeDetails(emp)}
                          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="View Details"
                        >
                          <Activity size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {/* Camera Snapshot */}
                    <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center relative border border-slate-800">
                      {emp.cameraSnapshotUrl ? (
                        <img 
                          src={emp.cameraSnapshotUrl} 
                          alt="Cam" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-700">
                          <Camera size={24} />
                          <span className="text-[10px]">No Camera Feed</span>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-white/70">
                        CAMERA
                      </div>
                      {emp.facePhotoUrl && (
                        <img 
                          src={emp.facePhotoUrl} 
                          alt="Ref" 
                          className="absolute bottom-2 right-2 w-10 h-10 rounded-lg border border-slate-700 object-cover opacity-50"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>

                    {/* Screen Snapshot */}
                    <div className="bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center relative border border-slate-800 group-hover:border-blue-500/30 transition-all">
                      {emp.screenSnapshotUrl ? (
                        <img 
                          src={emp.screenSnapshotUrl} 
                          alt="Screen" 
                          className="w-full h-full object-cover cursor-zoom-in"
                          referrerPolicy="no-referrer"
                          onClick={() => window.open(emp.screenSnapshotUrl!, '_blank')}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-700">
                          <Monitor size={24} />
                          <span className="text-[10px]">No Screen Share</span>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded text-[8px] text-white/70">
                        SCREEN
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock size={10} />
                      <span>{safeFormatDate(emp.lastActive, 'h:mm a')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ShieldCheck size={10} className={emp.status === 'active' ? 'text-green-500' : 'text-slate-700'} />
                      <span>AI Active</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Ringing Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
           <div className="w-full max-w-sm bg-slate-900 border-2 border-blue-500/30 rounded-[3rem] p-10 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
              
              <div className="relative z-10 flex flex-col items-center">
                 <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white mb-6 animate-bounce shadow-xl shadow-blue-600/20">
                    {incomingCall.type === 'video' ? <Video size={48} /> : <Phone size={48} />}
                 </div>
                 
                 <h2 className="text-2xl font-black text-white mb-2">{incomingCall.fromName || 'Employee'}</h2>
                 <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-10">
                   {incomingCall.context === 'mon' ? 'Employee Started Live Feed' : `Incoming ${incomingCall.type || 'Video'} Call`}
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
      {/* Achievement Modal */}
      {showAchievementModal && achievementEmployee && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <h2 className="text-2xl font-bold mb-2 text-blue-400">Add Achievement</h2>
            <p className="text-slate-400 mb-6">Recognize {achievementEmployee.displayName} for their hard work.</p>
            
            <form onSubmit={handleAddAchievement} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Achievement Title</label>
                <input 
                  type="text" 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Completed work within 10 hours"
                  value={achievementTitle}
                  onChange={(e) => setAchievementTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Bonus Amount (Optional)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                  <input 
                    type="number" 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowAchievementModal(false);
                    setAchievementEmployee(null);
                    setAchievementTitle('');
                    setBonusAmount('');
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!achievementTitle}
                  className="flex-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
                >
                  Add Achievement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddTeamModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md max-h-[95vh] overflow-y-auto shadow-2xl custom-scrollbar">
            <h2 className="text-2xl font-bold mb-2">{selectedTeam ? 'Edit Team' : 'Create New Team'}</h2>
            <p className="text-slate-400 mb-6">Group employees together for easier management and messaging.</p>
            
            <form onSubmit={handleAddTeam} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Team Name</label>
                <input 
                  type="text" 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Development Team"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({...newTeam, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Select Members</label>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input 
                    type="text" 
                    placeholder="Search by name or code..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={teamSearchTerm}
                    onChange={(e) => setTeamSearchTerm(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1 custom-scrollbar">
                  {employees.filter(emp => 
                    emp.displayName.toLowerCase().includes(teamSearchTerm.toLowerCase()) || 
                    emp.specialCode.toLowerCase().includes(teamSearchTerm.toLowerCase())
                  ).map(emp => (
                    <label key={emp.uid} className="flex items-center gap-3 p-3 hover:bg-slate-900 rounded-xl cursor-pointer transition-colors">
                      <input 
                        type="checkbox" 
                        checked={newTeam.memberIds.includes(emp.uid)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewTeam({...newTeam, memberIds: [...newTeam.memberIds, emp.uid]});
                          } else {
                            setNewTeam({...newTeam, memberIds: newTeam.memberIds.filter(id => id !== emp.uid)});
                          }
                        }}
                        className="rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-blue-400">
                          {emp.displayName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{emp.displayName}</p>
                          <p className="text-[10px] text-slate-500">{emp.email}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">{newTeam.memberIds.length} members selected</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowAddTeamModal(false);
                    setSelectedTeam(null);
                    setNewTeam({ name: '', memberIds: [] as string[], uniqueCode: '' });
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-3 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newTeam.name || newTeam.memberIds.length === 0}
                  className="flex-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
                >
                  {selectedTeam ? 'Save Changes' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-4 md:p-8 animate-in fade-in duration-300 overflow-hidden">
          <div className="w-full max-w-5xl h-full max-h-screen flex flex-col gap-4 md:gap-8 overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                  {callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {messageRecipient.length === 1 ? employees.find(e => e.uid === messageRecipient[0])?.displayName : 'Group Meeting'}
                  </h2>
                  <p className="text-slate-400 text-sm flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${callStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    {callStatus === 'calling' ? 'Calling...' : 'Connected'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white font-mono text-sm">
                  {callStatus === 'connected' ? formatTime(callDuration) : 'Connecting...'}
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 relative">
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden relative group">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-slate-600">
                    {messageRecipient.length === 1 ? employees.find(e => e.uid === messageRecipient[0])?.displayName.charAt(0) : 'G'}
                  </div>
                </div>
                <video ref={remoteVideoRef} className="w-full h-full object-cover relative z-10" autoPlay playsInline />
                <div className="absolute bottom-6 left-6 z-20 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl text-white text-sm font-bold">
                  {messageRecipient.length === 1 ? employees.find(e => e.uid === messageRecipient[0])?.displayName : 'Group'}
                </div>
              </div>

              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden relative group">
                {isVideoOff ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                    <VideoOff size={64} className="text-slate-800" />
                  </div>
                ) : (
                  <video ref={localVideoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                )}
                <div className="absolute bottom-6 left-6 z-20 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl text-white text-sm font-bold">
                  You {isScreenSharingInCall && '(Screen Sharing)'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center flex-wrap gap-3 md:gap-6 pb-4 md:pb-8 px-4">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              
              {callType === 'video' && (
                <>
                  <button 
                    onClick={() => setIsVideoOff(!isVideoOff)}
                    className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                  </button>
                  <button 
                    onClick={toggleScreenShareInCall}
                    className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all ${isScreenSharingInCall ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                  >
                    <Monitor size={20} />
                  </button>
                </>
              )}

              <button 
                onClick={endCall}
                className="w-14 h-14 md:w-20 md:h-20 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 transition-all shadow-xl shadow-red-600/20 active:scale-95"
              >
                <LogOut size={24} className="rotate-90" />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Modal for Alerts and Confirmations */}
      {customModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${customModal.type === 'alert' ? 'bg-blue-500/20 text-blue-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                {customModal.type === 'alert' ? <ShieldAlert size={24} /> : <AlertTriangle size={24} />}
              </div>
              <h3 className="text-xl font-bold">{customModal.title}</h3>
            </div>
            
            <p className="text-slate-400 mb-8 leading-relaxed">
              {customModal.message}
            </p>
            
            <div className="flex items-center justify-end gap-4">
              {customModal.type === 'confirm' && (
                <button
                  onClick={() => setCustomModal(prev => ({ ...prev, show: false }))}
                  className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all active:scale-95"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  setCustomModal(prev => ({ ...prev, show: false }));
                  if (customModal.type === 'confirm' && customModal.onConfirm) {
                    customModal.onConfirm();
                  }
                }}
                className={`px-6 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg ${customModal.type === 'alert' ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20' : 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-yellow-600/20'}`}
              >
                {customModal.type === 'alert' ? 'OK' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
