import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Video, 
  HelpCircle, 
  Monitor, 
  Layers, 
  Play, 
  AlertCircle,
  FileVideo,
  MousePointerClick,
  Info,
  UploadCloud,
  ArrowRight,
  Eye,
  Sliders,
  CheckCircle2,
  VideoOff,
  Camera,
  CameraOff,
  Move,
  Settings,
  Youtube
} from 'lucide-react';
import VideoPostProcessor from './components/VideoPostProcessor';
import SharedFeedbackPortal from './components/SharedFeedbackPortal';
import { MouseInteraction, RecordingSession } from './types';

export default function App() {
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [sharedVideoId, setSharedVideoId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  // Camera Overlay States
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraSize, setCameraSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [cameraShape, setCameraShape] = useState<'circle' | 'square' | 'rounded'>('circle');
  const [cameraPos, setCameraPos] = useState({ x: 30, y: window.innerHeight - 250 });
  const [isDraggingBubble, setIsDraggingBubble] = useState(false);

  // Dynamic window resizing updater
  useEffect(() => {
    const handleResize = () => {
      setCameraPos(prev => ({
        x: Math.min(prev.x, window.innerWidth - 180),
        y: Math.min(prev.y, window.innerHeight - 180)
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Bubble Drag and Drop implementation
  const dragStartRef = useRef({ x: 0, y: 0 });
  const bubblePosStartRef = useRef({ x: 0, y: 0 });

  const handleBubbleMouseDown = (e: React.MouseEvent) => {
    // Prevent dragging if clicking button toggles inside the bubble
    if ((e.target as HTMLElement).closest('.bubble-ctrl-btn')) return;
    setIsDraggingBubble(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    bubblePosStartRef.current = { ...cameraPos };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingBubble) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      
      // Keep inside screen boundaries
      const sizePx = cameraSize === 'sm' ? 120 : cameraSize === 'lg' ? 240 : 185;
      setCameraPos({
        x: Math.max(10, Math.min(window.innerWidth - sizePx - 10, bubblePosStartRef.current.x + dx)),
        y: Math.max(10, Math.min(window.innerHeight - sizePx - 10, bubblePosStartRef.current.y + dy))
      });
    };

    const handleMouseUp = () => {
      setIsDraggingBubble(false);
    };

    if (isDraggingBubble) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingBubble, cameraSize]);

  // Video Element ref for camera stream
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
      cameraVideoRef.current.play().catch(err => {
        console.error("Camera playback failed:", err);
      });
    }
  }, [cameraStream]);

  // Toggle Camera stream
  const toggleCamera = async () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    } else {
      setCameraEnabled(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 480 }, 
            height: { ideal: 480 },
            facingMode: 'user' 
          },
          audio: false
        });
        setCameraStream(stream);
        // Default position lower left
        setCameraPos({ x: 30, y: window.innerHeight - 250 });
      } catch (err: any) {
        console.error("Camera access failed:", err);
        setErrorMessage("Camera access was denied or unavailable. Please grant webcam permissions to enable live face recording.");
        setCameraEnabled(false);
        setCameraStream(null);
      }
    }
  };

  // Check URL query parameters for shared video ID on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('share') || params.get('sharedVideoId');
    if (sharedId) {
      setSharedVideoId(sharedId);
    }
  }, []);

  const handleBackToStudio = () => {
    setSharedVideoId(null);
    const newUrl = window.location.origin + window.location.pathname;
    window.history.pushState({}, '', newUrl);
  };

  // Recording References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const mouseHistoryRef = useRef<MouseInteraction[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const capturedCaptionsRef = useRef<any[]>([]);

  // Cleanup active streams on unmount to safeguard camera/mic permissions
  useEffect(() => {
    return () => {
      stopAllActiveTracks();
    };
  }, []);

  const stopAllActiveTracks = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    }
  };

  // Global cursor tracker during screen recording mode to capture cursor moves inside browser tab
  useEffect(() => {
    if (!isRecording) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      const elapsed = Date.now() - recordingStartTimeRef.current;
      const x = (e.clientX / window.innerWidth) * 1280;
      const y = (e.clientY / window.innerHeight) * 720;
      
      mouseHistoryRef.current.push({
        x: Math.max(0, Math.min(1280, x)),
        y: Math.max(0, Math.min(720, y)),
        type: 'move',
        timestamp: elapsed
      });
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      const elapsed = Date.now() - recordingStartTimeRef.current;
      const x = (e.clientX / window.innerWidth) * 1280;
      const y = (e.clientY / window.innerHeight) * 720;
      
      mouseHistoryRef.current.push({
        x: Math.max(0, Math.min(1280, x)),
        y: Math.max(0, Math.min(720, y)),
        type: 'mousedown',
        timestamp: elapsed
      });
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const elapsed = Date.now() - recordingStartTimeRef.current;
      const x = (e.clientX / window.innerWidth) * 1280;
      const y = (e.clientY / window.innerHeight) * 720;
      
      mouseHistoryRef.current.push({
        x: Math.max(0, Math.min(1280, x)),
        y: Math.max(0, Math.min(720, y)),
        type: 'mouseup',
        timestamp: elapsed
      });

      mouseHistoryRef.current.push({
        x: Math.max(0, Math.min(1280, x)),
        y: Math.max(0, Math.min(720, y)),
        type: 'click',
        timestamp: elapsed
      });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    window.addEventListener('mousedown', handleGlobalMouseDown, { passive: true });
    window.addEventListener('mouseup', handleGlobalMouseUp, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isRecording]);

  // Launch the browser media capture and begin recording session
  const startRecording = async () => {
    setErrorMessage(null);
    recordedChunksRef.current = [];
    mouseHistoryRef.current = [];
    
    try {
      const displayConstraints: DisplayMediaStreamOptions = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: true
      };

      const screenStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      streamRef.current = screenStream;

      let finalCombinedStream = screenStream;

      if (audioEnabled) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;

          const audioContext = new AudioContext();
          const audioDestination = audioContext.createMediaStreamDestination();

          if (screenStream.getAudioTracks().length > 0) {
            const screenAudioSource = audioContext.createMediaStreamSource(
              new MediaStream([screenStream.getAudioTracks()[0]])
            );
            screenAudioSource.connect(audioDestination);
          }

          const micAudioSource = audioContext.createMediaStreamSource(micStream);
          micAudioSource.connect(audioDestination);

          const combinedTracks = [
            screenStream.getVideoTracks()[0],
            audioDestination.stream.getAudioTracks()[0]
          ];
          finalCombinedStream = new MediaStream(combinedTracks);
        } catch (micErr) {
          console.warn("Could not retrieve microphone stream. Fallback to system audio only.", micErr);
          setErrorMessage("Microphone permission was denied. Recording system audio only.");
        }
      }

      const mimeTypesToTry = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9,opus',
        'video/webm'
      ];
      
      let selectedMimeType = 'video/webm';
      for (const mime of mimeTypesToTry) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
          selectedMimeType = mime;
          break;
        }
      }

      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(finalCombinedStream, { mimeType: selectedMimeType });
      } catch (e) {
        mediaRecorder = new MediaRecorder(finalCombinedStream);
      }

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const duration = Date.now() - recordingStartTimeRef.current;
        const videoBlob = new Blob(recordedChunksRef.current, { type: selectedMimeType });
        const videoUrl = URL.createObjectURL(videoBlob);

        const newSession: RecordingSession = {
          id: `sess_${Date.now()}`,
          rawBlob: videoBlob,
          rawVideoUrl: videoUrl,
          duration,
          mouseHistory: [...mouseHistoryRef.current],
          timestamp: Date.now(),
          width: 1280,
          height: 720,
          type: 'screen',
          captions: capturedCaptionsRef.current.length > 0 ? [...capturedCaptionsRef.current] : undefined
        };

        setSession(newSession);
        setIsRecording(false);
        stopAllActiveTracks();
      };

      screenStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      };

      recordingStartTimeRef.current = Date.now();
      
      mouseHistoryRef.current.push({
        x: 640,
        y: 360,
        type: 'move',
        timestamp: 0
      });

      capturedCaptionsRef.current = [];
      if (audioEnabled) {
        // @ts-ignore
        const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognitionClass) {
          try {
            const rec = new SpeechRecognitionClass();
            rec.continuous = true;
            rec.interimResults = false;
            rec.lang = 'en-US';
            rec.onresult = (event: any) => {
              const lastResultIndex = event.resultIndex;
              const result = event.results[lastResultIndex];
              if (result && result[0]) {
                const text = result[0].transcript.trim();
                if (text) {
                  const relativeTimeMs = Date.now() - recordingStartTimeRef.current;
                  capturedCaptionsRef.current.push({
                    id: `cap_${Math.random().toString(36).substring(2, 9)}`,
                    text,
                    startTime: Math.max(0, relativeTimeMs - 2200),
                    endTime: relativeTimeMs + 1800
                  });
                }
              }
            };
            rec.onerror = (e: any) => {
              console.warn("Speech recognition error", e);
            };
            rec.start();
            recognitionRef.current = rec;
          } catch (speechErr) {
            console.warn("Could not start speech recognition", speechErr);
          }
        }
      }

      mediaRecorder.start();
      setIsRecording(true);

    } catch (err: any) {
      console.error("Screen recording setup failed:", err);
      if (err.name === 'NotAllowedError') {
        setErrorMessage("Screen recording permission request was cancelled or denied.");
      } else if (err.message && (err.message.includes('display-capture') || err.message.includes('permission') || err.message.includes('Permissions policy'))) {
        setErrorMessage("SECURITY NOTIFICATION: Browsers block screen capture inside iframe embeds by default. To start screen recording successfully, please open the application in a NEW TAB using the button in the top-right corner of your AI Studio workspace!");
      } else {
        setErrorMessage(`Recording setup error: ${err.message || err}`);
      }
      stopAllActiveTracks();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Video Uploader handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleVideoUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVideoUpload(e.dataTransfer.files[0]);
    }
  };

  const handleVideoUpload = (file: File) => {
    setErrorMessage(null);
    if (!file.type.startsWith('video/')) {
      setErrorMessage("Please upload a valid video file (such as .mp4, .webm, or .mov).");
      return;
    }

    // Enforce 20 MB size limit
    const MAX_SIZE_MB = 20;
    const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setErrorMessage(`The uploaded video file (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 20 MB size limit. Please upload a smaller video.`);
      return;
    }

    const videoUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.src = videoUrl;
    tempVideo.preload = 'auto';

    tempVideo.onloadedmetadata = () => {
      const duration = Math.round(tempVideo.duration * 1000) || 10000;
      const width = tempVideo.videoWidth || 1280;
      const height = tempVideo.videoHeight || 720;

      // Seed mock mouse trajectory for the video duration so timeline processes smoothly
      const mockHistory: MouseInteraction[] = [];
      const steps = 15;
      for (let i = 0; i <= steps; i++) {
        mockHistory.push({
          x: width / 2,
          y: height / 2,
          type: 'move',
          timestamp: (i / steps) * duration
        });
      }

      const uploadSession: RecordingSession = {
        id: `upload_${Date.now()}`,
        rawBlob: file,
        rawVideoUrl: videoUrl,
        duration,
        mouseHistory: mockHistory,
        timestamp: Date.now(),
        width,
        height,
        type: 'screen'
      };

      setSession(uploadSession);
    };

    tempVideo.onerror = () => {
      setErrorMessage("The uploaded video file could not be decoded. Please try another standard MP4/WebM file.");
    };

    // Force browser to load the local video blob to trigger metadata events
    tempVideo.load();
  };

  const handleLoadYoutubeVideo = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      setErrorMessage("Please enter a YouTube video URL first.");
      return;
    }

    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = trimmedUrl.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (!videoId) {
      setErrorMessage("Invalid YouTube URL. Please enter a valid watch URL (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ) or a shortened link.");
      return;
    }

    // Since we don't know the exact duration yet, we seed a default 60-second duration (60000 ms).
    // The VideoPostProcessor YouTube player will query the active duration and dynamically update it later.
    const duration = 60000;
    const width = 1280;
    const height = 720;

    // Seed mock mouse trajectory for the video duration so timeline processes smoothly
    const mockHistory: MouseInteraction[] = [];
    const steps = 15;
    for (let i = 0; i <= steps; i++) {
      mockHistory.push({
        x: width / 2,
        y: height / 2,
        type: 'move',
        timestamp: (i / steps) * duration
      });
    }

    const youtubeSession: RecordingSession = {
      id: `youtube_${videoId}_${Date.now()}`,
      rawVideoUrl: trimmedUrl,
      duration,
      mouseHistory: mockHistory,
      timestamp: Date.now(),
      width,
      height,
      type: 'youtube'
    };

    setSession(youtubeSession);
    setYoutubeUrl('');
  };

  const handleResetSession = () => {
    if (session) {
      URL.revokeObjectURL(session.rawVideoUrl);
    }
    setSession(null);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-white">
      {/* Upper Navigation Header */}
      <header className="bg-slate-900/40 border-b border-slate-900 px-6 py-4 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600/10 border border-emerald-500/20 rounded-xl">
              <FileVideo className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold uppercase tracking-wider text-white">
                  Video Auto-Zoom Editor
                </h1>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-900 text-emerald-400">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Upload or record video, configure keyframe timeline, and auto-zoom with bullseye target precision</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:inline-block">
              {isRecording ? (
                <span className="flex items-center gap-2 text-red-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
                  Recording Active Screen Share...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px]">
                  READY TO POST-PROCESS
                </span>
              )}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 p-6 flex flex-col gap-8 w-full max-w-7xl mx-auto justify-center">
        
        {/* Universal Notifications Banner */}
        {errorMessage && (
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-4 flex flex-col gap-3 text-rose-300 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <h4 className="font-semibold text-rose-200">Editor Notification</h4>
                <p className="text-slate-400 mt-1">{errorMessage}</p>
              </div>
              <button 
                onClick={() => setErrorMessage(null)}
                className="text-slate-500 hover:text-slate-300 text-xs font-semibold px-2 cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
            {errorMessage.includes('NEW TAB') && (
              <div className="mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-950/40 border border-indigo-500/20 p-3 rounded-lg text-xs">
                <span className="text-slate-300 font-medium">
                  📌 <strong className="text-indigo-400">Security Requirement:</strong> Web browsers disable screen recording inside iframes to prevent clickjacking and security leaks. Pop this app out to record.
                </span>
                <button
                  onClick={() => {
                    window.open(window.location.href, '_blank');
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-md shrink-0 transition-all cursor-pointer"
                >
                  Open in New Tab 🚀
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Route views */}
        {sharedVideoId ? (
          <SharedFeedbackPortal
            videoId={sharedVideoId}
            onBackToStudio={handleBackToStudio}
          />
        ) : !session ? (
          /* SECTION 1: Uploader and Direct Screen Recording Setup Screen */
          <div className="flex flex-col gap-8 py-4">
            <div className="max-w-2xl mx-auto text-center flex flex-col gap-3">
              <h2 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
                Add Zoom Effects to Your Video
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Import any screen recording, presentation, or walk-through video to easily apply stunning cinematic auto-zoom-in and zoom-out transitions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full mt-4">
              
              {/* Option A: Upload Existing Video File (Recommended) */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative group bg-slate-900/60 border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-5 cursor-pointer transition-all duration-300 hover:bg-slate-900 hover:border-emerald-500/60 ${
                  isDraggingOver 
                    ? 'border-emerald-500 bg-emerald-500/5 scale-[1.01] shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                    : 'border-slate-800'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="video/*"
                  className="hidden"
                />
                
                <div className="p-4 bg-emerald-600/10 group-hover:bg-emerald-600/20 border border-emerald-500/20 group-hover:border-emerald-500/40 rounded-2xl text-emerald-400 transition-all duration-300">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-200 group-hover:text-white transition-colors">
                    Upload Video File
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                    Drag and drop your MP4, WebM, or MOV screen recording file here, or click to browse.
                  </p>
                </div>

                <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] text-slate-400 font-mono">
                  Supports up to 4K • Max 20 MB
                </div>
              </div>

              {/* Option B: Direct Screen Recording */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-5 hover:bg-slate-900 hover:border-slate-700/80 transition-all duration-300">
                <div className={`p-4 rounded-2xl border transition-all duration-300 ${
                  isRecording 
                    ? 'bg-red-600/10 border-red-500/30 text-red-500 animate-pulse' 
                    : 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400'
                }`}>
                  <Video className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-200">
                    {isRecording ? 'Capturing Video...' : 'Record Screen Capture'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                    Record your browser tab, specific app window, or your entire monitor directly in the browser.
                  </p>
                </div>

                {/* Microphone Toggle Control */}
                <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-850 w-full max-w-[240px]">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 select-none w-full justify-between">
                    <span>Include Microphone</span>
                    <input
                      type="checkbox"
                      checked={audioEnabled}
                      onChange={(e) => setAudioEnabled(e.target.checked)}
                      disabled={isRecording}
                      className="accent-emerald-500 h-4 w-4 rounded cursor-pointer"
                    />
                  </label>
                </div>

                {/* Webcam/Camera Bubble Toggle Control */}
                <div className="flex flex-col gap-2.5 w-full max-w-[240px]">
                  <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-850 w-full">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300 select-none w-full justify-between">
                      <span className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-indigo-400" />
                        Webcam Overlay
                      </span>
                      <input
                        type="checkbox"
                        checked={cameraEnabled}
                        onChange={toggleCamera}
                        disabled={isRecording}
                        className="accent-indigo-500 h-4 w-4 rounded cursor-pointer"
                      />
                    </label>
                  </div>

                  {cameraStream && (
                    <div className="flex flex-col gap-2 bg-slate-950/60 border border-slate-850 p-3 rounded-xl w-full text-left animate-in fade-in duration-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5 text-center border-b border-slate-900 pb-1">Webcam Bubble settings</div>
                      
                      {/* Shape selector */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 gap-1 mb-1.5">
                        <span>Bubble Shape:</span>
                        <div className="flex gap-1">
                          {(['circle', 'square', 'rounded'] as const).map((shape) => (
                            <button
                              key={shape}
                              onClick={() => setCameraShape(shape)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono capitalize transition-all cursor-pointer ${
                                cameraShape === shape 
                                  ? 'bg-indigo-600 text-white font-bold' 
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              {shape}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Size selector */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 gap-1">
                        <span>Bubble Size:</span>
                        <div className="flex gap-1">
                          {(['sm', 'md', 'lg'] as const).map((sz) => (
                            <button
                              key={sz}
                              onClick={() => setCameraSize(sz)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase transition-all cursor-pointer ${
                                cameraSize === sz 
                                  ? 'bg-indigo-600 text-white font-bold' 
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              {sz}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-full max-w-[240px] flex items-center justify-center gap-2 font-bold text-xs py-3 rounded-xl shadow-lg transition-all cursor-pointer ${
                    isRecording 
                      ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <div className="h-2 w-2 rounded-full bg-white animate-ping"></div>
                      <span>Stop Recording</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Start Screen Capture</span>
                    </>
                  )}
                </button>
              </div>

              {/* Option C: Load YouTube Video Link */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-5 hover:bg-slate-900 hover:border-slate-700/80 transition-all duration-300">
                <div className="p-4 bg-red-600/10 border border-red-500/20 rounded-2xl text-red-500 transition-all duration-300">
                  <Youtube className="w-8 h-8" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-200">
                    Import YouTube Video
                  </h3>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                    Paste any public YouTube link to add professional zoom effects, configure camera timelines, and share with others.
                  </p>
                </div>

                {/* Form to enter YouTube Link */}
                <form onSubmit={handleLoadYoutubeVideo} className="w-full max-w-[240px] flex flex-col gap-2">
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="Paste YouTube link..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500/50 transition-colors"
                  />
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg transition-all cursor-pointer"
                  >
                    <span>Load Video</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>

            </div>

            {/* Quick Tutorial Bento Grid explaining Zoom Points & Segments */}
            <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <div className="p-1 bg-emerald-600/10 rounded-md border border-emerald-500/20 text-xs font-bold font-mono">1</div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-200">Set Zoom Segments</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Add dynamic timeline segment intervals where you want the video camera to fluidly zoom in on critical content and then gracefully zoom out.
                </p>
              </div>

              <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <div className="p-1 bg-emerald-600/10 rounded-md border border-emerald-500/20 text-xs font-bold font-mono">2</div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-200">Bullseye Focus Target</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Simply click anywhere directly on the video player canvas during a segment to set the zoom focus. Drag it around to position it precisely.
                </p>
              </div>

              <div className="bg-slate-900/30 border border-slate-850 p-5 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <div className="p-1 bg-emerald-600/10 rounded-md border border-emerald-500/20 text-xs font-bold font-mono">3</div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-200">Compile & Save</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Select transitions (cinematic, instant, balanced) and cursor highlighting effects, then compile to download your finished auto-zoomed video!
                </p>
              </div>
            </div>

          </div>
        ) : (
          /* SECTION 2: Editing, post-processing, and compiling mode */
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-slate-900 pb-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Studio Post-Production</span>
                <h2 className="text-2xl font-bold text-white tracking-tight">Timeline & Camera Zoom Targeting</h2>
              </div>
              <button
                onClick={handleResetSession}
                className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 px-4 py-2 rounded-xl transition-all cursor-pointer"
              >
                ← Import another video
              </button>
            </div>

            <VideoPostProcessor
              session={session}
              onReset={handleResetSession}
            />
          </div>
        )}
      </main>

      {/* Global Application Footer */}
      <footer className="bg-slate-900/10 border-t border-slate-900 py-6 text-center text-xs text-slate-600 mt-auto">
        <p>© 2026 Video Auto-Zoom Editor • Designed with professional visual timeline and target bullseye control.</p>
      </footer>

      {/* Draggable Camera Bubble Overlay */}
      {cameraStream && (
        <div
          onMouseDown={handleBubbleMouseDown}
          style={{
            position: 'fixed',
            left: `${cameraPos.x}px`,
            top: `${cameraPos.y}px`,
            zIndex: 9999,
          }}
          className={`group cursor-grab active:cursor-grabbing border-4 border-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-100 select-none overflow-hidden ${
            cameraShape === 'circle' 
              ? 'rounded-full' 
              : cameraShape === 'rounded' 
                ? 'rounded-3xl' 
                : 'rounded-none'
          } ${
            cameraSize === 'sm' 
              ? 'w-[120px] h-[120px]' 
              : cameraSize === 'lg' 
                ? 'w-[240px] h-[240px]' 
                : 'w-[185px] h-[185px]'
          }`}
        >
          {/* Live Camera Stream Video Track */}
          <video
            ref={cameraVideoRef}
            muted
            playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />

          {/* Drag Overlay with indicators */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-2 pointer-events-none text-white">
            {/* Top Indicator: Rec Light / Status */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono">
              <span className={`h-1.5 w-1.5 rounded-full block ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></span>
              <span>{isRecording ? 'LIVE REC' : 'CAMERA'}</span>
            </div>

            {/* Middle Indicator: Drag Icon */}
            <div className="p-1 bg-slate-950/80 rounded-lg">
              <Move className="w-4 h-4 text-slate-300" />
            </div>

            {/* Bottom Controls */}
            <div className="flex gap-1.5 pointer-events-auto bubble-ctrl-btn">
              <button
                onClick={() => {
                  setCameraShape(prev => prev === 'circle' ? 'rounded' : prev === 'rounded' ? 'square' : 'circle');
                }}
                className="p-1 bg-slate-950/95 hover:bg-slate-900 text-slate-300 hover:text-white rounded border border-slate-800 transition-all text-[9px] font-bold font-mono cursor-pointer"
                title="Change Shape"
              >
                Shape
              </button>
              <button
                onClick={() => {
                  setCameraSize(prev => prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm');
                }}
                className="p-1 bg-slate-950/95 hover:bg-slate-900 text-slate-300 hover:text-white rounded border border-slate-800 transition-all text-[9px] font-bold font-mono cursor-pointer"
                title="Change Size"
              >
                Size
              </button>
              <button
                onClick={toggleCamera}
                className="p-1 bg-red-950/95 hover:bg-red-900 text-red-300 hover:text-white rounded border border-red-900/50 transition-all text-[9px] font-bold font-mono cursor-pointer"
                title="Turn Off Camera"
              >
                Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

