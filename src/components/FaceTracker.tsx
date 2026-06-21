import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { supabase } from '../supabase';
import { UserStatus, UserProfile } from '../types';
import { Shield, ShieldAlert, ShieldCheck, Camera } from 'lucide-react';

interface FaceTrackerProps {
  user: UserProfile;
  status?: UserStatus;
  onStatusChange: (status: UserStatus) => void;
  onVerified?: () => void;
  onFaceMatchChange?: (isMatch: boolean) => void;
  onFaceDetectedChange?: (detected: boolean) => void;
  isCameraOn?: boolean;
  isVerified?: boolean;
  onStreamReady?: (stream: MediaStream) => void;
}

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

// Global singletons for models
let modelsLoadedGlobal = false;
let modelLoadPromise: Promise<void> | null = null;

const loadModelsModule = async () => {
  if (modelsLoadedGlobal) return;
  if (!modelLoadPromise) {
    modelLoadPromise = (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        modelsLoadedGlobal = true;
      } catch (err) {
        console.error('Model load failed:', err);
        modelLoadPromise = null;
        throw err;
      }
    })();
  }
  return modelLoadPromise;
};

export const FaceTracker = React.memo(({
  user,
  status: parentStatus,
  onStatusChange,
  onVerified,
  onFaceMatchChange,
  onFaceDetectedChange,
  onStreamReady,
  isCameraOn = true,
  isVerified: parentIsVerified = false
}: FaceTrackerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraOnRef = useRef(isCameraOn);
  const verifyingRef = useRef(false);
  const trackingRef = useRef(false);

  const [modelsLoaded, setModelsLoaded] = useState(modelsLoadedGlobal);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [faceDetected, setFaceDetected] = useState(true);
  const [faceMatched, setFaceMatched] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [awayTimeout, setAwayTimeout] = useState<NodeJS.Timeout | null>(null);

  // Memoize the parsed face descriptor to handle string vs array and prevent re-parsing
  const parsedFaceDescriptor = React.useMemo(() => {
    if (!user.faceDescriptor) return null;
    let desc = user.faceDescriptor;
    if (typeof desc === 'string') {
      try {
        desc = JSON.parse(desc);
      } catch (e) {
        console.error('Failed to parse face_descriptor:', e);
        return null;
      }
    }
    if (Array.isArray(desc)) {
      try {
        return new Float32Array(desc);
      } catch (e) {
        console.error('Failed to create Float32Array from descriptor:', e);
        return null;
      }
    }
    return null;
  }, [user.faceDescriptor]);

  const [isVerifying, setIsVerifying] = useState(!!parsedFaceDescriptor && !parentIsVerified);
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'fail'>(parentIsVerified ? 'success' : 'idle');

  // Sync internal isVerifying with prop if verification status changes elsewhere
  useEffect(() => {
    if (parentIsVerified) {
      setIsVerifying(false);
      setVerificationStatus('success');
    }
  }, [parentIsVerified]);
  const [showTimeoutError, setShowTimeoutError] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const isStartingCameraRef = useRef(false);
  const [cameraStatus, setCameraStatus] = useState<string>('idle');
  const playRetryCountRef = useRef(0);
  const MAX_PLAY_RETRIES = 5;

  // Keep cameraOnRef synced
  useEffect(() => { cameraOnRef.current = isCameraOn; }, [isCameraOn]);
  useEffect(() => { trackingRef.current = isTracking; }, [isTracking]);

  // Load face-api models once (Singleton approach)
  useEffect(() => {
    if (modelsLoadedGlobal) {
      setModelsLoaded(true);
      return;
    }

    loadModelsModule().then(() => {
      setModelsLoaded(true);
      setModelError(null);
    }).catch(err => {
      setModelError('Failed to load AI models. Please check your internet connection.');
    });
  }, []);

  // ── stopVideo: immediately kills stream and clears video ──────────────
  const stopVideo = useCallback(() => {
    // Kill detection/snapshot loops first
    if (detectionIntervalRef.current) { clearInterval(detectionIntervalRef.current); detectionIntervalRef.current = null; }
    if (snapshotIntervalRef.current) { clearInterval(snapshotIntervalRef.current); snapshotIntervalRef.current = null; }
    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      streamRef.current = null;
    }
    // Clear video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    setIsTracking(false);
    trackingRef.current = false;
    verifyingRef.current = false;
    setFaceDetected(false);
  }, []);

  // ── startVideo: get fresh stream, attach to video ─────────────────────
  const startVideo = useCallback((force = false) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError('Your browser does not support camera access.');
      return;
    }

    if (isStartingCameraRef.current && !force) {
      console.log('Camera start already in progress, skipping...');
      return;
    }
    
    // Safety check: if stream is already active and healthy, don't restart unless forced
    if (streamRef.current && streamRef.current.active && !force) {
      console.log('Stream already active, skipping startVideo');
      return;
    }

    console.log('Attempting to start camera...');
    setCameraStatus('requesting');
    isStartingCameraRef.current = true;
    setPermissionError(null);

    // Timeout to reset flag if it hangs
    const hangTimeout = setTimeout(() => {
      if (isStartingCameraRef.current) {
        console.warn('Camera request timed out (10s)');
        setCameraStatus('timeout');
        isStartingCameraRef.current = false;
      }
    }, 10000);

    // Always clean up any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (!cameraOnRef.current && !force) {
      isStartingCameraRef.current = false;
      clearTimeout(hangTimeout);
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then(stream => {
        clearTimeout(hangTimeout);
        setPermissionError(null);
        setCameraStatus('streaming');
        
        if (!cameraOnRef.current && !force) { 
          stream.getTracks().forEach(t => { t.stop(); t.enabled = false; }); 
          isStartingCameraRef.current = false; 
          return; 
        }
        
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) { isStartingCameraRef.current = false; return; }
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        const tryPlay = () => {
          if (!video) { isStartingCameraRef.current = false; return; }
          
          video.play().then(() => {
            console.log('Camera video playing successfully');
            setIsTracking(true);
            trackingRef.current = true;
            isStartingCameraRef.current = false;
            playRetryCountRef.current = 0;
            setCameraStatus('playing');
            // Notify dashboard of fresh stream
            if (stream) onStreamReady?.(stream);
          }).catch(e => {
            console.warn(`Video play failed (attempt ${playRetryCountRef.current + 1}):`, e);
            if (playRetryCountRef.current < MAX_PLAY_RETRIES) {
              playRetryCountRef.current++;
              setTimeout(tryPlay, 500);
            } else {
              console.error('Max video play retries reached');
              setPermissionError('Camera started but failed to play video. Please refresh or check if another app is using the camera.');
              isStartingCameraRef.current = false;
              playRetryCountRef.current = 0;
              setCameraStatus('error');
            }
          });
        };

        if (video.readyState >= 2) { tryPlay(); }
        else {
          video.onloadeddata = tryPlay;
          video.oncanplay = tryPlay;
        }
      })
      .catch(err => {
        clearTimeout(hangTimeout);
        isStartingCameraRef.current = false;
        setCameraStatus('error');
        const isPermissionError = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.toLowerCase().includes('denied');
        
        if (isPermissionError) {
          console.warn('Camera access denied by user.');
          setPermissionError('Camera access denied. Please enable camera permissions in your browser settings to continue.');
        } else {
          console.error('Camera access error:', err);
          setPermissionError(`Could not access camera (${err.name}). Please ensure no other app is using it.`);
        }
      });
  }, [isCameraOn, onStreamReady]);

  useEffect(() => {
    if (isCameraOn && modelsLoaded) {
      startVideo();
    } else if (!isCameraOn) {
      stopVideo();
      supabase.from('users').update({ cameraSnapshotUrl: null }).eq('uid', user.uid).then();
    }
    return () => {
      stopVideo();
    };
  }, [isCameraOn, modelsLoaded, startVideo, stopVideo, user.uid]);

  useEffect(() => {
    if (!isCameraOn) {
      stopVideo();
      supabase.from('users').update({ cameraSnapshotUrl: null }).eq('uid', user.uid).then();
    }
  }, [isCameraOn, user.uid, stopVideo]);

  // ── Activity tracking ─────────────────────────────────────────────────
  useEffect(() => {
    const onAct = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', onAct);
    window.addEventListener('keydown', onAct);
    return () => { window.removeEventListener('mousemove', onAct); window.removeEventListener('keydown', onAct); };
  }, []);

  // ── Verification timeout ──────────────────────────────────────────────
  useEffect(() => {
    if (!isVerifying || !isTracking) return;
    const t = setTimeout(() => {
      if (verificationStatus !== 'success') { setShowTimeoutError(true); setVerificationStatus('fail'); }
    }, 20000);
    return () => clearTimeout(t);
  }, [isVerifying, isTracking, verificationStatus]);

  // ── verifyFace: compare detected face to stored descriptor ────────────
  const verifyFace = useCallback(async () => {
    if (!videoRef.current || !modelsLoaded || !parsedFaceDescriptor || verifyingRef.current) return;
    if (videoRef.current.readyState < 2 || videoRef.current.paused || videoRef.current.videoWidth === 0) return;
    verifyingRef.current = true;
    try {
      const det = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
        .withFaceLandmarks().withFaceDescriptor();
      if (det) {
        const dist = faceapi.euclideanDistance(det.descriptor, parsedFaceDescriptor);
        if (dist < 0.7) {
          setVerificationStatus('success');
          setFaceDetected(true); setFaceMatched(true);
          setTimeout(() => { setIsVerifying(false); onVerified?.(); }, 500);
        }
      }
    } catch (e) { console.error('verifyFace error:', e); }
    finally { verifyingRef.current = false; }
  }, [modelsLoaded, user.faceDescriptor, onVerified]);

  // Auto-verify loop while isVerifying
  useEffect(() => {
    if (!isVerifying || !isTracking || verificationStatus === 'success' || verificationStatus === 'fail') return;
    const iv = setInterval(verifyFace, 600);
    return () => clearInterval(iv);
  }, [isVerifying, isTracking, verificationStatus, verifyFace]);

  // ── Main detection + snapshot loop ───────────────────────────────────
  useEffect(() => {
    if (!isTracking || !modelsLoaded || isVerifying) return;

    // Clear any old intervals
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);

    // Face detection every 2s
    detectionIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused || video.videoWidth === 0) return;
      if (!streamRef.current || !streamRef.current.active) return;

      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
          .withFaceLandmarks().withFaceDescriptor();

        const present = !!det;
        setFaceDetected(present);
        onFaceDetectedChange?.(present);

        if (!present) {
          setFaceMatched(false);
          onFaceMatchChange?.(false);
          // NOTE: We intentionally do NOT auto-switch status to 'break' here.
          // Break must only be started by the employee explicitly clicking
          // the Break button — auto-flipping to 'break' caused sessions to
          // get stuck on break and mixed up work/break time totals.
        } else {
          if (det && parsedFaceDescriptor) {
            const dist = faceapi.euclideanDistance(det.descriptor, parsedFaceDescriptor);
            const match = dist < 0.7;
            setFaceMatched(match);
            onFaceMatchChange?.(match);
          }
          if (awayTimeout) { clearTimeout(awayTimeout); setAwayTimeout(null); }
          
          if (parentStatus !== 'break') {
            const isIdle = Date.now() - lastActivity > 300000;
            updateStatus(isIdle ? 'away' : 'active');
          }
        }
      } catch (e) { /* silent */ }
    }, 2000);

    // Snapshot upload every 10s for admin live preview
    snapshotIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused || video.videoWidth === 0) return;
      if (!streamRef.current || !streamRef.current.active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        canvas.toBlob(async blob => {
          if (!blob) return;
          const { data } = await supabase.storage.from('face-photos')
            .upload(`cam-${user.uid}-latest.jpg`, blob, { contentType: 'image/jpeg', upsert: true });
          if (data) {
            const { data: { publicUrl } } = supabase.storage.from('face-photos').getPublicUrl(`cam-${user.uid}-latest.jpg`);
            supabase.from('users').update({ cameraSnapshotUrl: publicUrl }).eq('uid', user.uid).then();
          }
        }, 'image/jpeg', 0.6);
      } catch (e) { /* silent */ }
    }, 10000);

    return () => {
      if (detectionIntervalRef.current) { clearInterval(detectionIntervalRef.current); detectionIntervalRef.current = null; }
      if (snapshotIntervalRef.current) { clearInterval(snapshotIntervalRef.current); snapshotIntervalRef.current = null; }
    };
  }, [isTracking, modelsLoaded, isVerifying, lastActivity, user.uid, awayTimeout, onFaceDetectedChange, onFaceMatchChange, user.faceDescriptor, parentStatus]);

  const updateStatus = async (status: UserStatus) => {
    try {
      await supabase.from('users').update({ status, lastActive: new Date().toISOString() }).eq('uid', user.uid);
      onStatusChange(status);
    } catch (e) { console.error('Status update error:', e); }
  };

  const handleRetry = () => {
    setVerificationStatus('idle');
    setShowTimeoutError(false);
    verifyingRef.current = false;
    startVideo();
  };

  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-black border-4 border-slate-800 shadow-2xl" id="face-tracker-container" style={{ minHeight: 320 }}>
      {/* Live video — always rendered so srcObject assignment works */}
      <video
        ref={videoRef}
        id="face-tracker-video"
        autoPlay muted playsInline
        style={{ display: 'block', width: '100%', height: '100%', minHeight: 320, objectFit: 'cover', background: '#0f172a' }}
      />

      {/* Status badges */}
      {!isVerifying && isTracking && (
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/15">
            <div className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[11px] font-black text-white uppercase tracking-widest">
              {faceDetected ? 'Face Detected' : 'No Face Detected'}
            </span>
          </div>
          {faceDetected && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/15">
              <div className={`w-2 h-2 rounded-full ${faceMatched ? 'bg-blue-400' : 'bg-yellow-400 animate-ping'}`} />
              <span className="text-[11px] font-black text-white uppercase tracking-widest">
                {faceMatched ? 'Identity Confirmed' : 'Identity Mismatch'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Camera off overlay */}
      {!isCameraOn && !permissionError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 z-20">
          <Camera size={40} className="text-slate-600 mb-3" />
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Camera Off</p>
        </div>
      )}

      {/* Camera Starting Overlay */}
      {isCameraOn && !isTracking && !permissionError && !modelError && !(videoRef.current && videoRef.current.srcObject) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm z-20 p-6 text-center">
          <div className="w-16 h-16 bg-blue-600/10 rounded-3xl flex items-center justify-center mb-6">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Starting Camera</h3>
          <p className="text-slate-400 text-xs mb-8 max-w-xs">
            {cameraStatus === 'requesting' ? 'Waiting for browser permission prompt...' : 
             cameraStatus === 'timeout' ? 'Camera request is taking longer than expected.' :
             'Initializing video stream...'}
          </p>
          
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button 
              id="force-start-btn"
              onClick={() => startVideo(true)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-95"
            >
              Force Start Camera
            </button>
          </div>
        </div>
      )}

      {/* Permission Error Overlay */}
      {permissionError && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center z-50">
          <div className="w-20 h-20 bg-red-500/20 text-red-400 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
            <ShieldAlert size={40} />
          </div>
          <h3 className="text-2xl font-black text-white mb-4">Camera Access Required</h3>
          <div className="space-y-4 mb-8 max-w-sm">
            <p className="text-slate-300 text-sm leading-relaxed">
              {permissionError}
            </p>
            <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 text-left">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Troubleshooting</p>
              <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                <li>Check your browser's address bar for a blocked camera icon.</li>
                <li>Ensure no other application (Zoom, Teams, etc.) is using the camera.</li>
                <li>
                  <strong>AI Studio Users:</strong> If permissions are blocked in the preview, click the <span className="text-blue-400">"Open in new tab"</span> icon in the top right.
                </li>
              </ul>
            </div>
          </div>
          <button 
            id="retry-access-btn"
            onClick={() => {
              setPermissionError(null);
              startVideo();
            }}
            className="w-full max-w-xs py-4 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-95"
          >
            Retry Access
          </button>
        </div>
      )}

      {/* Verification overlay */}
      {isVerifying && isCameraOn && (
        <div className="absolute inset-0 bg-slate-950/88 backdrop-blur-lg flex flex-col items-center justify-center p-6 text-center z-30">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${
            verificationStatus === 'success' ? 'bg-green-500/20 text-green-400' :
            verificationStatus === 'fail'    ? 'bg-red-500/20 text-red-400' :
                                               'bg-blue-500/20 text-blue-400'
          }`}>
            {verificationStatus === 'success' ? <ShieldCheck size={40} /> :
             verificationStatus === 'fail'    ? <ShieldAlert size={40} /> :
                                                <Shield size={40} className="animate-pulse" />}
          </div>
          <h3 className="text-2xl font-black text-white mb-2">Identity Verification</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs">Look directly at the camera with good lighting.</p>

          {verificationStatus === 'idle' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center"><Shield className="text-blue-400" size={24} /></div>
              </div>
              <p className="text-blue-400 font-black text-sm uppercase tracking-widest animate-pulse">Scanning…</p>
            </div>
          ) : verificationStatus === 'success' ? (
            <div className="flex flex-col items-center gap-3">
              <ShieldCheck size={48} className="text-green-400" />
              <p className="text-green-400 font-black uppercase tracking-widest">Verified!</p>
            </div>
          ) : (
            <div className="space-y-3 w-full max-w-xs">
              <button onClick={handleRetry}
                id="retry-verify-btn"
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all">
                <Camera size={20} /> Retry Verification
              </button>
              {showTimeoutError && <p className="text-red-400 text-xs font-bold text-center">Timeout — check lighting and retry.</p>}
            </div>
          )}
        </div>
      )}

      {/* Models loading or error */}
      {(!modelsLoaded || modelError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-40 p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            {modelError ? (
              <>
                <ShieldAlert size={40} className="text-red-400" />
                <p className="text-sm text-red-400 font-bold">{modelError}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all"
                >
                  Reload Page
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="space-y-1">
                  <p className="text-sm text-white font-black uppercase tracking-widest">Initializing AI</p>
                  <p className="text-[10px] text-slate-500 font-bold">Loading face recognition models...</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
})
