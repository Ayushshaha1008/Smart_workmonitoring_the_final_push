import React, { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { X, Camera, Monitor, Maximize2, Minimize2, Shield, ShieldAlert, ShieldCheck, AlertTriangle, Activity, User, RefreshCw, Clock, Coffee } from 'lucide-react';
import { format } from 'date-fns';

interface LiveWebRTCMonitorProps {
  employee: UserProfile;
  adminId: string;
  onClose: () => void;
}

export const LiveWebRTCMonitor: React.FC<LiveWebRTCMonitorProps> = ({ employee, adminId, onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed' | 'disconnected'>('connecting');
  const [remoteCamStream, setRemoteCamStream] = useState<MediaStream | null>(null);
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [isScreenMaximized, setIsScreenMaximized] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(false);
  const [isFaceMatched, setIsFaceMatched] = useState<boolean | null>(false);
  const [faceDetected, setFaceDetected] = useState<boolean | null>(true);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [liveElapsedTime, setLiveElapsedTime] = useState<number | null>(null);
  const [liveBreakTime, setLiveBreakTime] = useState<number | null>(null);
  const [employeeStatus, setEmployeeStatus] = useState<string | null>(null);
  const [liveEarnings, setLiveEarnings] = useState<number | null>(null);
  const [isPausedBySecurity, setIsPausedBySecurity] = useState(false);
  const [employeeAlerts, setEmployeeAlerts] = useState<any[]>([]);
  const [visitCount, setVisitCount] = useState<number>(employee.monitorCount || 0);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const signalingChannelRef = useRef<any>(null);
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--:--";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFullScreen = (ref: React.RefObject<HTMLVideoElement>) => {
    if (ref.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        ref.current.requestFullscreen();
      }
    }
  };

  const joiningChannelsRef = useRef<Set<string>>(new Set());

  const safeSend = useCallback(async (event: string, payload: any) => {
    const channel = signalingChannelRef.current;
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

  const cleanup = useCallback((topic: string) => {
    const existing = supabase.getChannels().find(c => c.topic === (topic.startsWith('realtime:') ? topic : `realtime:${topic}`));
    if (existing) supabase.removeChannel(existing);
  }, []);

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .eq('userId', employee.uid)
        .order('timestamp', { ascending: false })
        .limit(5);
      if (data) setEmployeeAlerts(data);
    };

    fetchAlerts();

    const alertTopic = `employee-alerts-${employee.uid}`;
    cleanup(alertTopic);
    const alertSubscription = supabase
      .channel(alertTopic)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'alerts',
        filter: `userId=eq.${employee.uid}`
      }, (payload) => {
        setEmployeeAlerts(prev => [payload.new, ...prev].slice(0, 5));
      })
      .subscribe();

    const callTopic = `calls:${employee.uid}`;
    cleanup(callTopic);
    const channel = supabase.channel(callTopic, { 
      config: { broadcast: { self: false } }
    });

    signalingChannelRef.current = channel;

    console.log(`Subscribing to monitor channel: calls:${employee.uid}`);

    const incrementMonitorCount = async () => {
      try {
        const { data: currentEmp, error: fetchError } = await supabase.from('users').select('monitorCount').eq('uid', employee.uid).single();
        if (fetchError) throw fetchError;
        
        const newCount = (currentEmp?.monitorCount || 0) + 1;
        const { error: updateError } = await supabase.from('users').update({ monitorCount: newCount }).eq('uid', employee.uid);
        if (updateError) throw updateError;
        
        setVisitCount(newCount);
      } catch (e) {
        console.warn('Failed to update monitor count:', e);
      }
    };
    incrementMonitorCount();

    channel
      .on('broadcast', { event: 'webrtc-mon-offer' }, async ({ payload }) => {
        console.log('Received monitor offer from employee');
        setMonitorError(null);
        await handleOffer(payload.offer || payload);
      })
      .on('broadcast', { event: 'webrtc-mon-ice' }, async ({ payload }) => {
        if (peerConnectionRef.current && payload) {
          const pc = peerConnectionRef.current;
          // Robust check: remoteDescription must be set AND signalingState should not be closed
          if (pc.remoteDescription && pc.signalingState !== 'closed') {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload));
            } catch (e) {
              console.warn('Recoverable error adding ICE candidate:', e);
            }
          } else {
            pendingIceCandidatesRef.current.push(payload);
          }
        }
      })
      .on('broadcast', { event: 'live-stats-update' }, ({ payload }) => {
        // Update local state with real-time data from employee
        setIsVerified(payload.isVerified);
        setIsFaceMatched(payload.isFaceMatched);
        setFaceDetected(payload.faceDetected ?? true);
        
        // We can expose these to the UI if needed
        if (payload.elapsedTime !== undefined) {
          setLiveElapsedTime(payload.elapsedTime);
        }
        if (payload.breakElapsedTime !== undefined) {
          setLiveBreakTime(payload.breakElapsedTime);
        }
        if (payload.status !== undefined) {
          setEmployeeStatus(payload.status);
        }
        if (payload.todayEarnings !== undefined) {
          setLiveEarnings(payload.todayEarnings);
        }
        if (payload.isPausedBySecurity !== undefined) {
          setIsPausedBySecurity(payload.isPausedBySecurity);
        }
      })
      .on('broadcast', { event: 'verification-status' }, ({ payload }) => {
        setIsVerified(payload.isVerified);
        setIsFaceMatched(payload.isFaceMatched);
        setFaceDetected(payload.faceDetected ?? true);
      })
      .on('broadcast', { event: 'monitor-error' }, ({ payload }) => {
        setMonitorError(payload.message);
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          console.log('Signaling channel ready, requesting live stream...');
          safeSend('request-live-stream', { fromId: adminId, fromName: 'Admin' });
        }
      });

    // Reset All State for new employee
    setRemoteCamStream(null);
    setRemoteScreenStream(null);
    setRemoteAudioStream(null);
    setStatus('connecting');
    setMonitorError(null);
    setIsVerified(false);
    setIsFaceMatched(false);

    return () => {
      console.log('Cleaning up monitoring session...');
      alertSubscription.unsubscribe();
      if (signalingChannelRef.current) {
        safeSend('stop-live-stream', { fromId: adminId });
      }
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      // Give a moment for the broadcast to be sent before unsubscribing
      setTimeout(() => {
        if (signalingChannelRef.current) signalingChannelRef.current.unsubscribe();
      }, 500);
    };
  }, [employee.uid, adminId]);

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    console.log('Handling WebRTC offer from employee...');
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    pendingIceCandidatesRef.current = [];
    
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      });
      peerConnectionRef.current = pc;
      console.log('PeerConnection created for monitor');

      pc.onicecandidate = (event) => {
        if (event.candidate && signalingChannelRef.current) {
          console.log('Sending ICE candidate to employee');
          safeSend('webrtc-mon-ice', event.candidate);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setStatus('connected');
        }
        if (pc.iceConnectionState === 'failed') {
          console.warn('ICE connection failed, attempting restart');
          try { (pc as any).restartIce(); } catch (e) {}
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('PC connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') setStatus('connected');
        if (pc.connectionState === 'failed') setStatus('failed');
      };

      // Track index counter: employee adds cam FIRST, screen SECOND
      let videoTrackIndex = 0;

      pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind, event.track.label);
        const stream = event.streams[0];
        if (!stream) {
          console.warn('No stream associated with track');
          return;
        }

        if (event.track.kind === 'audio') {
          setRemoteAudioStream(stream);
          return;
        }

        if (event.track.kind !== 'video') return;
        const track = event.track;
        const settings = track.getSettings();
        const label = track.label.toLowerCase();
        const contentHint = (track as any).contentHint;

        console.log(`Analyzing video track: label="${label}", hint="${contentHint}", res=${settings.width}x${settings.height}`);

        // Primary detection: use explicit hints set by sender
        const explicitlyScreen =
          contentHint === 'detail' ||
          contentHint === 'text' ||
          settings.displaySurface !== undefined ||
          label.includes('screen') ||
          label.includes('monitor') ||
          label.includes('window') ||
          label.includes('tab') ||
          label.includes('display') ||
          label.includes('capture') ||
          label.includes('entire') ||
          (settings.width || 0) > 1000; // Screens are usually high-res

        const explicitlyCam =
          contentHint === 'motion' ||
          label.includes('camera') ||
          label.includes('webcam') ||
          label.includes('facetime') ||
          label.includes('built-in');

        let isScreen: boolean;
        if (explicitlyScreen && !explicitlyCam) {
          isScreen = true;
        } else if (explicitlyCam) {
          isScreen = false;
        } else {
          // Last resort: cam is added first (index 0), screen is second (index 1)
          isScreen = videoTrackIndex > 0;
        }

        videoTrackIndex++;

        // Create a dedicated stream for each track to avoid overlap in <video> elements
        const trackStream = new MediaStream([track]);

        if (isScreen) {
          console.log('Assigned to Screenshare view');
          setRemoteScreenStream(trackStream);
          setStatus('connected');
        } else {
          console.log('Assigned to Camera view');
          setRemoteCamStream(trackStream);
          setStatus('connected');
        }
      };

      // ADDED: Get Admin Audio Stream for intercom (OPTIONAL & SILENT)
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(adminStream => {
          if (pc.signalingState !== 'closed') {
            adminStream.getTracks().forEach(track => pc.addTrack(track, adminStream));
          }
        })
        .catch(e => { 
          console.warn('Admin mic access denied for monitor:', e); 
        });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Process buffered candidates ONLY after remote description is set
      while (pendingIceCandidatesRef.current.length > 0) {
        const candidate = pendingIceCandidatesRef.current.shift();
        if (candidate && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(err => {
            console.warn('Post-setRemoteDescription ICE error:', err);
          });
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      safeSend('webrtc-mon-answer', answer);
    } catch (err) {
      console.error('Error handling WebRTC offer:', err);
      setStatus('failed');
    }
  };

  // Attach streams to video elements
  useEffect(() => {
    if (remoteCamStream && camVideoRef.current) {
      camVideoRef.current.srcObject = remoteCamStream;
      camVideoRef.current.play().catch(console.error);
    }
  }, [remoteCamStream]);

  useEffect(() => {
    if (remoteScreenStream && screenVideoRef.current) {
      if (screenVideoRef.current.srcObject !== remoteScreenStream) {
        screenVideoRef.current.srcObject = remoteScreenStream;
        screenVideoRef.current.play().catch(err => {
          if (err.name !== 'AbortError') console.error('Screen play error:', err);
        });
      }
    }
  }, [remoteScreenStream]);

  useEffect(() => {
    if (remoteAudioStream && audioRef.current) {
      audioRef.current.srcObject = remoteAudioStream;
      audioRef.current.play().catch(console.error);
    }
  }, [remoteAudioStream]);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-300 overflow-hidden">
      <audio ref={audioRef} autoPlay />
      {/* Header */}
      <div className="p-4 md:p-6 flex items-center justify-between border-b border-white/10 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-blue-500/50 shadow-lg shadow-blue-500/20">
            <img 
              src={employee.facePhotoUrl || employee.face_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.displayName)}`} 
              alt="" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              {employee.displayName}
              <span className={`w-2 h-2 rounded-full animate-pulse ${status === 'connected' ? 'bg-green-500' : 'bg-yellow-500'}`} />
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                {employee.position || 'Employee'} • {employee.specialCode}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                status === 'connected' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
              }`}>
                {status}
              </span>
              {visitCount !== undefined && (
                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded-lg border border-blue-500/20">
                  VISIT #{visitCount}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-4 mr-6 px-6 py-2 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Identity</span>
              <span className={`text-xs font-black ${isVerified ? 'text-green-400' : 'text-red-400'}`}>
                {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
              </span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Face Match</span>
              <span className={`text-xs font-black ${!faceDetected ? 'text-orange-400' : isFaceMatched ? 'text-green-400' : 'text-red-400'}`}>
                {!faceDetected ? 'NO FACE FOUND' : isFaceMatched ? 'MATCHED' : 'MISMATCH'}
              </span>
            </div>
          </div>
          <button 
            onClick={() => {
              safeSend('request-live-stream', { fromId: adminId, fromName: 'Admin', force: true });
              setStatus('connecting');
            }} 
            title="Request Reconnection"
            className="p-3 bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-2xl transition-all border border-slate-700/50"
          >
            <RefreshCw size={20} className={status === 'connecting' ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => window.location.reload()} 
            title="Hard Reload"
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-all border border-slate-700/50 flex flex-col items-center justify-center -gap-1"
          >
            <RefreshCw size={12} />
            <span className="text-[8px] font-black">F5</span>
          </button>
          <button 
            onClick={onClose}
            className="p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all shadow-lg shadow-red-500/10"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-950">
        {/* Left Side: Screen Share */}
        <div className={`flex-1 p-4 md:p-6 overflow-hidden flex flex-col gap-4 transition-all duration-500 ${isScreenMaximized ? 'w-full' : 'lg:w-2/3'}`}>
          <div className="flex-1 bg-slate-900 border border-white/10 rounded-[2.5rem] overflow-hidden relative group shadow-2xl flex items-center justify-center">
            {employeeStatus === 'break' && (
               <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-md animate-in fade-in duration-300">
                 <div className="text-center p-8">
                    <Coffee className="mx-auto text-yellow-500 mb-6 animate-pulse" size={80} />
                    <h3 className="text-3xl font-black text-white uppercase tracking-[0.2em] mb-2">On Break</h3>
                    <p className="text-slate-400 font-medium">Privacy screen is active. Monitoring will resume when employee returns.</p>
                 </div>
               </div>
            )}
            {remoteScreenStream ? (
              <>
                <video 
                  id={`screen-video-${employee.uid}`}
                  ref={screenVideoRef}
                  autoPlay 
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-6 left-6 flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10">
                  <Monitor size={16} className="text-blue-400" />
                  <span className="text-xs font-black text-white uppercase tracking-widest">Live Screen Share</span>
                </div>
                <div className="absolute top-6 right-6 flex items-center gap-3 opacity-100 transition-all">
                  <button 
                    onClick={() => setIsScreenMaximized(!isScreenMaximized)}
                    className={`p-3 backdrop-blur-md text-white rounded-2xl border border-white/10 transition-all hover:bg-blue-600 ${isScreenMaximized ? 'bg-blue-600' : 'bg-black/60'}`}
                  >
                    {isScreenMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                  </button>
                  <button 
                    onClick={() => toggleFullScreen(screenVideoRef)}
                    className="p-3 bg-black/60 backdrop-blur-md text-white rounded-2xl border border-white/10 transition-all hover:bg-blue-600"
                  >
                    <Maximize2 size={20} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-slate-800">
                <Monitor size={120} className="animate-pulse" />
                <p className="text-xl font-black uppercase tracking-widest">Waiting for Screen Share...</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Camera + Info */}
        {!isScreenMaximized && (
          <div className="w-full lg:w-1/3 p-4 md:p-6 border-l border-white/10 bg-slate-900/30 overflow-y-auto custom-scrollbar flex flex-col gap-6 animate-in slide-in-from-right duration-300">
            
            {/* Camera Feed - Larger size showing full face */}
            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] overflow-hidden relative group shadow-2xl" style={{ aspectRatio: '3/4', minHeight: '300px' }}>
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                <Camera size={14} className="text-purple-400" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Camera Feed</span>
              </div>
              
              {employeeStatus === 'break' && (
                 <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm">
                   <div className="text-center">
                      <Coffee className="mx-auto text-yellow-500 mb-2" size={32} />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Break Privacy</p>
                   </div>
                 </div>
              )}
              
              {remoteCamStream ? (
                <>
                  <video 
                    id={`cam-video-${employee.uid}`}
                    ref={camVideoRef}
                    autoPlay 
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ minHeight: '300px' }}
                  />
                  <button 
                    onClick={() => toggleFullScreen(camVideoRef)}
                    className="absolute bottom-4 right-4 p-2 bg-black/60 backdrop-blur-md text-white rounded-xl border border-white/10 opacity-100 transition-all hover:bg-blue-600"
                  >
                    <Maximize2 size={16} />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-700" style={{ minHeight: '300px' }}>
                  <Camera size={64} className="animate-pulse" />
                  <p className="text-xs font-black uppercase tracking-widest">
                    {monitorError ? monitorError : 'Waiting for Camera...'}
                  </p>
                </div>
              )}
            </div>

            {/* Status Indicators */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-white/10 rounded-3xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className={isVerified ? "text-green-400" : "text-red-400"} />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identity</span>
                </div>
                <p className={`text-sm font-black ${isVerified ? 'text-green-400' : 'text-red-400'}`}>
                  {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
                </p>
              </div>
              <div className="bg-slate-900 border border-white/10 rounded-3xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity size={14} className={isFaceMatched ? "text-green-400" : "text-red-400"} />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Face Match</span>
                </div>
                <p className={`text-sm font-black ${isFaceMatched ? 'text-green-400' : 'text-red-400'}`}>
                  {isFaceMatched ? 'MATCHED' : 'MISMATCH'}
                </p>
              </div>
            </div>

            {/* Live Stats display */}
            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-6 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${employeeStatus === 'break' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live Dashboard Status</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${employeeStatus === 'break' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
                  {employeeStatus || 'Active'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-400">
                    <Clock size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Work Time</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono">{formatTime(liveElapsedTime)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-yellow-400">
                    <Coffee size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Break Time</span>
                  </div>
                  <p className="text-xl font-black text-white font-mono">{formatTime(liveBreakTime)}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Today's Earnings</span>
                  <span className="text-sm font-black text-green-400 font-mono">₹{liveEarnings?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>

            {isPausedBySecurity && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-[2.5rem] p-6 animate-pulse shadow-xl shadow-red-500/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/20 rounded-xl text-red-500">
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-red-500 uppercase tracking-widest">Session Paused</h3>
                    <p className="text-[10px] text-red-500/70 font-bold">Face detection or verification mismatch exceeds grace period.</p>
                  </div>
                </div>
              </div>
            )}

            {(liveElapsedTime !== null || liveEarnings !== null) && (
              <div className="bg-slate-900 border border-blue-500/30 rounded-[2.5rem] p-6 space-y-4 shadow-xl shadow-blue-500/5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
                    <Activity size={18} />
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Real-time Session</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Duration</p>
                    <p className="text-xl font-black text-white font-mono">
                      {liveElapsedTime !== null ? (
                        `${Math.floor(liveElapsedTime / 3600).toString().padStart(2, '0')}:${Math.floor((liveElapsedTime % 3600) / 60).toString().padStart(2, '0')}:${(liveElapsedTime % 60).toString().padStart(2, '0')}`
                      ) : 'Loading...'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Current Earnings</p>
                    <p className="text-xl font-black text-green-400 font-mono">
                      ₹{liveEarnings !== null ? liveEarnings.toFixed(2) : '0.00'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Employee Profile */}
            <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-6 space-y-4 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
                  <User size={18} />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Employee Profile</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Position</p>
                  <p className="text-xs font-black text-white">{employee.position || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Rate</p>
                  <p className="text-xs font-black text-green-400">₹{employee.hourlyRate}/hr</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Last Active</p>
                  <p className="text-xs font-black text-white">{format(new Date(employee.lastActive), 'HH:mm:ss')}</p>
                </div>
              </div>
            </div>

            {/* Alerts */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-xl text-red-400">
                    <AlertTriangle size={18} />
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">Recent Alerts</h3>
                </div>
                <span className="px-2 py-1 bg-red-500/10 text-red-500 text-[10px] font-black rounded-lg">LIVE</span>
              </div>
              
              <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2">
                {employeeAlerts.length > 0 ? (
                  employeeAlerts.map((alert) => (
                    <div key={alert.id} className={`p-4 rounded-3xl border transition-all ${
                      alert.type === 'face_mismatch' || alert.type === 'continuous_mismatch' 
                      ? 'bg-red-500/5 border-red-500/20' 
                      : 'bg-slate-800/50 border-white/5'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          alert.type === 'face_mismatch' || alert.type === 'continuous_mismatch'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-blue-500/20 text-blue-500'
                        }`}>
                          {alert.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold">
                          {format(new Date(alert.timestamp), 'HH:mm:ss')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{alert.message || alert.details}</p>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                    <ShieldCheck size={48} className="mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No recent alerts</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
