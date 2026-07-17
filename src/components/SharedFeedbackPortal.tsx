import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Send, 
  MessageSquare, 
  Clock, 
  Share2, 
  ChevronLeft, 
  ThumbsUp, 
  CheckCircle, 
  AlertCircle,
  Copy,
  Download,
  Flame,
  Tv,
  ArrowRight
} from 'lucide-react';
import { getSharedVideo, getSharedVideoComments, addSharedVideoComment, ShareComment } from '../lib/shareDb';

interface SharedFeedbackPortalProps {
  videoId: string;
  onBackToStudio: () => void;
}

const FALLBACK_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

const REACTION_EMOJIS = [
  { emoji: '👏', label: 'Applaud' },
  { emoji: '👍', label: 'Like' },
  { emoji: '🤯', label: 'Mind Blown' },
  { emoji: '❓', label: 'Question' },
  { emoji: '❤️', label: 'Love' }
];

export default function SharedFeedbackPortal({ videoId, onBackToStudio }: SharedFeedbackPortalProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>('Screen Recording Walkthrough');
  const [videoDuration, setVideoDuration] = useState<number>(12000); // Default 12s
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Video State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0); // in seconds
  const [duration, setDuration] = useState<number>(0); // in seconds
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // YouTube / Zoom State & References
  const [sessionType, setSessionType] = useState<'screen' | 'sandbox' | 'youtube'>('screen');
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [zoomSettings, setZoomSettings] = useState<any>(null);

  const youtubePlayerRef = useRef<any>(null);
  const youtubeTransformRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Comments State
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [authorName, setAuthorName] = useState<string>('');
  const [commentText, setCommentText] = useState<string>('');
  const [selectedReaction, setSelectedReaction] = useState<string>('👍');
  const [anchorTime, setAnchorTime] = useState<number | null>(null);
  const [showShareSuccess, setShowShareSuccess] = useState<boolean>(false);

  // Extract YouTube ID helper
  function extractYouTubeId(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  // Load video and comments
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const videoRecord = await getSharedVideo(videoId);
      
      if (videoRecord) {
        setSessionType(videoRecord.type || 'screen');
        if (videoRecord.type === 'youtube') {
          setYoutubeUrl(videoRecord.youtubeUrl || null);
          setSegments(videoRecord.segments || []);
          setZoomSettings(videoRecord.zoomSettings || null);
          setVideoName(videoRecord.name);
          setVideoDuration(videoRecord.duration);
          setDuration(videoRecord.duration / 1000);
          setIsFallback(false);
        } else if (videoRecord.blob) {
          const objectUrl = URL.createObjectURL(videoRecord.blob);
          setVideoUrl(objectUrl);
          setVideoName(videoRecord.name);
          setVideoDuration(videoRecord.duration);
          setDuration(videoRecord.duration / 1000);
          setIsFallback(false);
        } else {
          setVideoUrl(FALLBACK_VIDEO_URL);
          setVideoName('Demo Studio Recording (Auto-Zoom Applied)');
          setVideoDuration(12000);
          setDuration(12);
          setIsFallback(true);
        }
      } else {
        // Fallback demo video
        setVideoUrl(FALLBACK_VIDEO_URL);
        setVideoName('Demo Studio Recording (Auto-Zoom Applied)');
        setVideoDuration(12000);
        setDuration(12);
        setIsFallback(true);
      }

      const loadedComments = getSharedVideoComments(videoId);
      setComments(loadedComments);
      setLoading(false);
    }
    loadData();

    // Cleanup object URL
    return () => {
      if (videoUrl && !videoUrl.startsWith('http')) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoId]);

  // Load YouTube script and embed player if active
  useEffect(() => {
    if (sessionType !== 'youtube' || !youtubeUrl) return;

    const ytVideoId = extractYouTubeId(youtubeUrl);
    if (!ytVideoId) return;

    let player: any;

    const initPlayer = () => {
      // @ts-ignore
      player = new window.YT.Player('youtube-shared-player', {
        height: '100%',
        width: '100%',
        videoId: ytVideoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          mute: isMuted ? 1 : 0,
          playsinline: 1
        },
        events: {
          onReady: (event: any) => {
            youtubePlayerRef.current = event.target;
            const ytDuration = event.target.getDuration();
            if (ytDuration > 0) {
              setDuration(ytDuration);
            }
          }
        }
      });
    };

    // @ts-ignore
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      // @ts-ignore
      if (!window.onYouTubeIframeAPIReady) {
        // @ts-ignore
        window.onYouTubeIframeAPIReady = () => {
          initPlayer();
        };
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      } else {
        const checkInterval = setInterval(() => {
          // @ts-ignore
          if (window.YT && window.YT.Player) {
            clearInterval(checkInterval);
            initPlayer();
          }
        }, 100);
      }
    }

    return () => {
      if (player && player.destroy) {
        player.destroy();
      }
      youtubePlayerRef.current = null;
    };
  }, [sessionType, youtubeUrl]);

  // Auto-update playback progress state from YouTube player
  useEffect(() => {
    if (sessionType !== 'youtube' || !isPlaying) return;

    const interval = setInterval(() => {
      if (youtubePlayerRef.current) {
        const time = youtubePlayerRef.current.getCurrentTime();
        if (time !== undefined) {
          setCurrentTime(time);
        }
      }
    }, 150);

    return () => clearInterval(interval);
  }, [sessionType, isPlaying]);

  // Render Loop to apply live auto-zoom transforms on the youtube player iframe
  useEffect(() => {
    if (sessionType !== 'youtube' || !youtubeUrl) return;

    let active = true;

    // Local camera state
    const cameraState = {
      x: 1280 / 2,
      y: 720 / 2,
      zoom: 1.0
    };

    const renderLoop = () => {
      if (!active) return;

      const timeMs = currentTime * 1000;

      // Find active segment
      const activeSegment = segments.find(seg => timeMs >= seg.startTime && timeMs <= seg.endTime);
      
      let targetZoom = 1.0;
      let targetX = 1280 / 2;
      let targetY = 720 / 2;

      const getZoomLevel = () => {
        const intensity = zoomSettings?.intensity || 'medium';
        if (intensity === 'low') return 1.15;
        if (intensity === 'high') return 1.45;
        return 1.30; // medium
      };

      if (activeSegment) {
        targetZoom = activeSegment.zoomLevel || getZoomLevel();
        if (activeSegment.focusX !== undefined && activeSegment.focusY !== undefined) {
          targetX = activeSegment.focusX;
          targetY = activeSegment.focusY;
        }
      }

      // Clamp target coordinates
      const WIDTH = 1280;
      const HEIGHT = 720;
      const zoomCloserToOne = Math.max(0, 1 - (targetZoom - 1.0) * 4);
      const bleedFactor = 0.65 + (0.35 * zoomCloserToOne);
      const marginX = (WIDTH / (2 * targetZoom)) * bleedFactor;
      const marginY = (HEIGHT / (2 * targetZoom)) * bleedFactor;
      targetX = Math.max(marginX, Math.min(WIDTH - marginX, targetX));
      targetY = Math.max(marginY, Math.min(HEIGHT - marginY, targetY));

      // Lerp
      const getSmoothnessAmount = () => {
        const smoothness = zoomSettings?.smoothness || 'cinematic';
        if (smoothness === 'snappy') return { pan: 0.22, zoom: 0.18 };
        if (smoothness === 'organic') return { pan: 0.04, zoom: 0.035 };
        return { pan: 0.08, zoom: 0.065 }; // cinematic
      };

      const ease = isPlaying ? getSmoothnessAmount() : { pan: 1.0, zoom: 1.0 };
      const lerp = (start: number, end: number, amt: number) => start + (end - start) * amt;

      cameraState.x = lerp(cameraState.x, targetX, ease.pan);
      cameraState.y = lerp(cameraState.y, targetY, ease.pan);
      cameraState.zoom = lerp(cameraState.zoom, targetZoom, ease.zoom);

      // Update transform style on target
      if (youtubeTransformRef.current) {
        const scale = cameraState.zoom;
        const cx = cameraState.x;
        const cy = cameraState.y;
        
        const container = youtubeTransformRef.current.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          const w = rect.width;
          const h = rect.height;
          
          const tx = (w / 2) - ((cx / WIDTH) * w * scale);
          const ty = (h / 2) - ((cy / HEIGHT) * h * scale);
          youtubeTransformRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
          youtubeTransformRef.current.style.transformOrigin = '0px 0px';
          youtubeTransformRef.current.style.width = `${w}px`;
          youtubeTransformRef.current.style.height = `${h}px`;
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [sessionType, youtubeUrl, segments, zoomSettings, isPlaying, currentTime]);

  // Sync current time as video plays
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (sessionType === 'youtube') {
      if (youtubePlayerRef.current) {
        if (isPlaying) {
          youtubePlayerRef.current.pauseVideo();
          setIsPlaying(false);
        } else {
          youtubePlayerRef.current.playVideo();
          setIsPlaying(true);
        }
      }
      return;
    }

    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(console.error);
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = () => {
    if (sessionType === 'youtube') {
      if (youtubePlayerRef.current) {
        if (isMuted) {
          youtubePlayerRef.current.unMute();
        } else {
          youtubePlayerRef.current.mute();
        }
        setIsMuted(!isMuted);
      }
      return;
    }

    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const seekTo = (seconds: number) => {
    if (sessionType === 'youtube') {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(seconds, true);
        setCurrentTime(seconds);
        if (!isPlaying) {
          youtubePlayerRef.current.playVideo();
          setIsPlaying(true);
        }
      }
      return;
    }

    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
      if (!isPlaying) {
        videoRef.current.play().catch(console.error);
        setIsPlaying(true);
      }
    }
  };

  // Convert time to format (00:00)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Add Comment
  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const timeToAnchor = anchorTime !== null ? anchorTime : currentTime;
    const newComment: ShareComment = {
      id: `c_${Date.now()}`,
      author: authorName.trim() || 'Anonymous Viewer',
      text: commentText.trim(),
      timestampMs: Math.round(timeToAnchor * 1000),
      rating: selectedReaction,
      createdAt: Date.now()
    };

    const updated = addSharedVideoComment(videoId, newComment);
    setComments(updated);

    // Reset Form
    setCommentText('');
    setAnchorTime(null);
  };

  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowShareSuccess(true);
    setTimeout(() => setShowShareSuccess(false), 3000);
  };

  // Calculate emoji counts
  const reactionCounts = comments.reduce((acc: { [key: string]: number }, c) => {
    if (c.rating) {
      acc[c.rating] = (acc[c.rating] || 0) + 1;
    }
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-slate-300">
        <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
        <p className="text-sm font-semibold font-mono uppercase tracking-wider text-slate-400">Loading Share Workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 py-2 animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToStudio}
              className="group flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              Back to Recorder Studio
            </button>
            <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-mono font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
              Shared Workspace Mode
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2 mt-1">
            <Tv className="w-6 h-6 text-indigo-400 shrink-0" />
            {videoName}
          </h2>
        </div>

        {/* Share Link Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCopyShareLink}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg hover:shadow-indigo-500/10 transition-all cursor-pointer border border-indigo-500/30"
          >
            {showShareSuccess ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Share Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* FALLBACK INFO ALERT FOR MULTI-DEVICE SIMULATION */}
      {isFallback && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed max-w-4xl">
          <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-slate-400">
            <span className="font-semibold text-slate-200">Shared Sandbox Demonstration:</span> Since this is a browser-only preview space, compiled video files live inside your local IndexedDB. We have loaded a high-fidelity technology demo video below to showcase the exact interactive feedback portal experience your viewers receive when accessing your shared links!
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN FEEDBACK LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT: Video Player and Timeline Markers (8 Columns) */}
        <div className="lg:col-span-8 flex flex-col gap-5 bg-slate-950 border border-slate-900 p-4 md:p-6 rounded-3xl shadow-2xl">
          
          {/* Custom Video Viewport */}
          <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden group shadow-lg border border-slate-900 flex items-center justify-center">
            {sessionType === 'youtube' ? (
              <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
                {/* Visual Transform Container */}
                <div 
                  ref={youtubeTransformRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none', // passes mouse/click events to parent transparent overlay
                  }}
                >
                  <div id="youtube-shared-player" className="w-full h-full" />
                </div>
                {/* Transparent Overlay to capture play/pause clicks on viewport */}
                <div 
                  onClick={togglePlay}
                  className="absolute inset-0 cursor-pointer z-10 bg-transparent"
                />
              </div>
            ) : (
              <video
                ref={videoRef}
                src={videoUrl || undefined}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className="w-full h-full object-contain"
                onClick={togglePlay}
                playsInline
              />
            )}

            {/* Play overlay on pause */}
            {!isPlaying && (
              <div 
                onClick={togglePlay}
                className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer group-hover:bg-black/30 transition-all z-20"
              >
                <div className="p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl transform hover:scale-110 transition-all duration-300">
                  <Play className="w-8 h-8 fill-current translate-x-0.5" />
                </div>
              </div>
            )}

            {/* Top Badge Overlay */}
            <div className="absolute top-3 left-3 bg-indigo-950/95 border border-indigo-500/30 text-indigo-300 font-mono text-[9px] font-bold px-2.5 py-1 rounded-full select-none shadow-md flex items-center gap-1.5 z-20">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 block animate-pulse"></span>
              AUTO-ZOOM EFFECTS ENABLED
            </div>
          </div>

          {/* PLAYER CONTROLS & TIMELINE WITH COMMENT DOTS */}
          <div className="flex flex-col gap-3.5 bg-slate-900/40 p-4 rounded-2xl border border-slate-900">
            
            {/* Timeline Progress with Comment Anchors */}
            <div className="relative">
              {/* Comment Dot Anchors */}
              <div className="absolute inset-x-0 -top-1 h-3 pointer-events-none">
                {comments.map((comment) => {
                  const commentSec = comment.timestampMs / 1000;
                  const ratio = duration > 0 ? (commentSec / duration) : 0;
                  const leftPct = Math.min(99, Math.max(1, ratio * 100));
                  
                  return (
                    <button
                      key={comment.id}
                      onClick={() => seekTo(commentSec)}
                      style={{ left: `${leftPct}%` }}
                      className="absolute top-0 h-3 w-3 bg-indigo-500 border-2 border-slate-950 rounded-full cursor-pointer pointer-events-auto transform -translate-x-1/2 group transition-all hover:scale-150 hover:bg-emerald-400 z-10"
                      title={`${comment.author}: "${comment.text}" at ${formatTime(commentSec)}`}
                    >
                      {/* Floating Tooltip */}
                      <span className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-950 text-white text-[10px] py-1 px-2.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all shadow-xl whitespace-nowrap border border-slate-800 font-sans z-30">
                        <strong className="text-indigo-400">{comment.rating} {comment.author}</strong>: {comment.text.length > 25 ? comment.text.substring(0, 25) + '...' : comment.text} ({formatTime(commentSec)})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Progress Slider Track */}
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.01"
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCurrentTime(val);
                  if (sessionType === 'youtube') {
                    youtubePlayerRef.current?.seekTo(val, true);
                  } else if (videoRef.current) {
                    videoRef.current.currentTime = val;
                  }
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none hover:bg-slate-700 transition-colors"
              />
            </div>

            {/* Custom Bottom Bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                </button>

                <div className="text-xs text-slate-400 font-mono select-none">
                  <span>{formatTime(currentTime)}</span>
                  <span className="mx-1 text-slate-700">/</span>
                  <span className="text-slate-500">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Quick reaction stat summaries */}
              <div className="hidden sm:flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-mono">Feedback Summary:</span>
                <div className="flex items-center gap-1.5">
                  {Object.entries(reactionCounts).map(([emoji, count]) => (
                    <span 
                      key={emoji} 
                      className="text-xs bg-slate-900 border border-slate-850 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-mono text-slate-300"
                      title={`${count} viewers selected ${emoji}`}
                    >
                      <span>{emoji}</span>
                      <span className="text-[10px] font-bold">{count}</span>
                    </span>
                  ))}
                  {comments.length === 0 && (
                    <span className="text-[10px] text-slate-600 italic">No feedback comments yet</span>
                  )}
                </div>
              </div>

              {/* Volume */}
              <button
                onClick={toggleMute}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* VIEWERS ENGAGEMENT PORTAL STATS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-1">
            <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-2xl flex flex-col gap-1 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Views</span>
              <span className="text-lg font-extrabold text-slate-200">14</span>
            </div>
            <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-2xl flex flex-col gap-1 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Feedback Anchors</span>
              <span className="text-lg font-extrabold text-indigo-400">{comments.length}</span>
            </div>
            <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-2xl flex flex-col gap-1 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Avg Watch Time</span>
              <span className="text-lg font-extrabold text-slate-200">92%</span>
            </div>
            <div className="bg-slate-900/20 border border-slate-900 p-4 rounded-2xl flex flex-col gap-1 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Status</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-block mx-auto mt-1 uppercase font-mono tracking-wide">
                Active Link
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Interaction Sidebar (4 Columns) */}
        <div className="lg:col-span-4 flex flex-col gap-6 w-full">
          
          {/* COMMENT SUBMISSION FORM */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <MessageSquare className="w-4.5 h-4.5 text-indigo-400" />
              Add Time-Coded Feedback
            </h3>

            <form onSubmit={handleSubmitComment} className="flex flex-col gap-3.5">
              
              {/* Author name input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sarah J. (Design)"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="bg-slate-950 border border-slate-850 focus:border-indigo-500 text-slate-300 text-xs rounded-lg p-2.5 outline-none transition-colors"
                />
              </div>

              {/* Timestamp Anchor details */}
              <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" />
                  Anchor to Timeline:
                </span>
                
                <button
                  type="button"
                  onClick={() => {
                    if (anchorTime === null) {
                      setAnchorTime(currentTime);
                    } else {
                      setAnchorTime(null);
                    }
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer ${
                    anchorTime !== null
                      ? 'bg-emerald-950 border-emerald-500/35 text-emerald-400'
                      : 'bg-indigo-950/40 border-indigo-500/25 text-indigo-400 hover:bg-indigo-950/80'
                  }`}
                  title="Click to lock the comment timestamp, or let it track the live play progress"
                >
                  {anchorTime !== null ? `${formatTime(anchorTime)} (Locked)` : `${formatTime(currentTime)} (Live)`}
                </button>
              </div>

              {/* Rating Emoji reaction */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Quick Emoji Reaction
                </label>
                <div className="flex items-center justify-between bg-slate-950 border border-slate-850 p-2 rounded-xl">
                  {REACTION_EMOJIS.map((item) => (
                    <button
                      key={item.emoji}
                      type="button"
                      onClick={() => setSelectedReaction(item.emoji)}
                      className={`text-lg p-1.5 rounded-lg transition-all hover:bg-slate-900 cursor-pointer ${
                        selectedReaction === item.emoji 
                          ? 'bg-indigo-600/20 border border-indigo-500/40 scale-125' 
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      title={item.label}
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment text area */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  Feedback Comment
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Leave details about this moment. Ask a question or suggest improvements..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="bg-slate-950 border border-slate-850 focus:border-indigo-500 text-slate-300 text-xs rounded-lg p-2.5 outline-none resize-none transition-colors leading-relaxed"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-2.5 px-4 rounded-xl shadow-lg hover:shadow-indigo-500/10 transition-all cursor-pointer border border-indigo-500/30"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Feedback</span>
              </button>
            </form>
          </div>

          {/* COMMENTS LIST */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4 max-h-[420px] overflow-y-auto">
            <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="flex items-center gap-2">
                <MessageSquare className="w-4.5 h-4.5 text-indigo-400" />
                Comments Timeline
              </span>
              <span className="text-[10px] font-mono font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-md">
                {comments.length} items
              </span>
            </h3>

            <div className="flex flex-col gap-3">
              {comments.map((c) => {
                const commentSec = c.timestampMs / 1000;
                return (
                  <div 
                    key={c.id} 
                    className="bg-slate-950 border border-slate-850/60 p-3 rounded-xl flex flex-col gap-1.5 hover:border-slate-800 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-200">{c.author}</span>
                        <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                          {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      {/* Interactive jump timestamp */}
                      <button
                        onClick={() => seekTo(commentSec)}
                        className="flex items-center gap-1 text-[10px] font-bold font-mono bg-indigo-950 border border-indigo-900/50 hover:bg-indigo-900 hover:border-indigo-800 text-indigo-300 px-2 py-0.5 rounded-md transition-all cursor-pointer shrink-0"
                        title="Seek video to this timestamp"
                      >
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatTime(commentSec)}</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 px-2.5 py-1.5 rounded-lg border border-slate-850/30">
                      {c.rating && <span className="mr-1.5 text-sm select-none">{c.rating}</span>}
                      {c.text}
                    </p>
                  </div>
                );
              })}

              {comments.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-xs italic">
                  No feedback recorded yet. Be the first to leave a comment!
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
