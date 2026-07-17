import React, { useState, useRef, useEffect } from 'react';
import { 
  Wand2, 
  Download, 
  Play, 
  Pause, 
  RotateCcw, 
  Settings2, 
  Sparkles, 
  Sliders, 
  SlidersHorizontal,
  Video,
  VideoOff,
  Eye,
  CheckCircle,
  Clock,
  ExternalLink,
  Info,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Share2,
  Link,
  Copy
} from 'lucide-react';
import { RecordingSession, ZoomSettings, MouseInteraction } from '../types';
import { saveSharedVideo } from '../lib/shareDb';

const WIDTH = 1280;
const HEIGHT = 720;

interface VideoPostProcessorProps {
  session: RecordingSession;
  onReset: () => void;
}

export default function VideoPostProcessor({ session, onReset }: VideoPostProcessorProps) {
  const [settings, setSettings] = useState<ZoomSettings>({
    intensity: 'medium',
    smoothness: 'cinematic',
    clickEffect: 'ripple',
    cursorStyle: 'halo',
    cursorColor: '#6366f1', // Indigo
    cursorSize: 32,
    showCursor: false,
    autoZoomEnabled: true
  });

  interface ZoomSegment {
    id: string;
    startTime: number;
    endTime: number;
    zoomLevel?: number;
    focusX?: number;
    focusY?: number;
  }

  // Pre-seed some default zoom segments so they appear immediately for a pristine out-of-the-box experience!
  const [segments, setSegments] = useState<ZoomSegment[]>([
    { id: 'seg_1', startTime: Math.min(1000, session.duration * 0.15), endTime: Math.min(4500, session.duration * 0.45), focusX: WIDTH * 0.35, focusY: HEIGHT * 0.35 },
    { id: 'seg_2', startTime: Math.min(7000, session.duration * 0.65), endTime: Math.min(10500, session.duration * 0.9), focusX: WIDTH * 0.65, focusY: HEIGHT * 0.55 }
  ]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>('seg_1');
  const [timelineZoom, setTimelineZoom] = useState<number>(1);

  // Undo / Redo history stacks
  const [historyPast, setHistoryPast] = useState<ZoomSegment[][]>([]);
  const [historyFuture, setHistoryFuture] = useState<ZoomSegment[][]>([]);

  const segmentsRef = useRef<ZoomSegment[]>(segments);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const pushToHistory = (newSegments: ZoomSegment[]) => {
    setHistoryPast(prev => [...prev, segments]);
    setHistoryFuture([]);
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryFuture(prev => [segments, ...prev]);
    setSegments(previous);
    setHistoryPast(prev => prev.slice(0, prev.length - 1));
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryPast(prev => [...prev, segments]);
    setSegments(next);
    setHistoryFuture(prev => prev.slice(1));
  };

  const addSegment = () => {
    const duration = 2000; // default 2 seconds zoom segment
    let start = currentTime;
    let end = currentTime + duration;

    // Clamp within video limits
    if (end > session.duration) {
      end = session.duration;
      start = Math.max(0, end - duration);
    }

    const newSegment: ZoomSegment = {
      id: `seg_${Date.now()}`,
      startTime: start,
      endTime: end
    };

    const nextSegments = [...segments, newSegment];
    pushToHistory(nextSegments);
    setSegments(nextSegments);
    setSelectedSegmentId(newSegment.id);
  };

  const deleteSelectedSegment = () => {
    if (!selectedSegmentId) return;
    const nextSegments = segments.filter(s => s.id !== selectedSegmentId);
    pushToHistory(nextSegments);
    setSegments(nextSegments);
    setSelectedSegmentId(null);
  };

  const resetTimeline = () => {
    pushToHistory([]);
    setSegments([]);
    setSelectedSegmentId(null);
  };

  const formatTimeLabel = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Drag operation tracking ref
  const dragRef = useRef<{
    type: 'scrub' | 'drag-segment' | 'resize-left' | 'resize-right';
    segmentId?: string;
    startX: number;
    startStartTime?: number;
    startEndTime?: number;
  } | null>(null);

  const getTimeFromX = (clientX: number, trackEl: HTMLElement): number => {
    const rect = trackEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = x / rect.width;
    return Math.max(0, Math.min(session.duration, pct * session.duration));
  };

  // Global window listeners for segment resizing and playhead scrubbing
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const drag = dragRef.current;
      const track = document.getElementById('timeline-interactive-track');
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const deltaX = e.clientX - drag.startX;
      const msPerPx = session.duration / rect.width;
      const deltaMs = deltaX * msPerPx;

      if (drag.type === 'scrub') {
        const newTime = Math.max(0, Math.min(session.duration, getTimeFromX(e.clientX, track)));
        setCurrentTime(newTime);
        if (session.type === 'youtube') {
          youtubePlayerRef.current?.seekTo(newTime / 1000, true);
        } else if (videoRef.current) {
          videoRef.current.currentTime = newTime / 1000;
        }
      } else if (drag.type === 'drag-segment' && drag.segmentId) {
        const seg = segments.find(s => s.id === drag.segmentId);
        if (seg && drag.startStartTime !== undefined && drag.startEndTime !== undefined) {
          const dur = drag.startEndTime - drag.startStartTime;
          let newStart = drag.startStartTime + deltaMs;
          let newEnd = newStart + dur;

          if (newStart < 0) {
            newStart = 0;
            newEnd = dur;
          }
          if (newEnd > session.duration) {
            newEnd = session.duration;
            newStart = newEnd - dur;
          }

          setSegments(prev => prev.map(s => s.id === drag.segmentId ? { ...s, startTime: newStart, endTime: newEnd } : s));
        }
      } else if (drag.type === 'resize-left' && drag.segmentId) {
        const seg = segments.find(s => s.id === drag.segmentId);
        if (seg && drag.startStartTime !== undefined) {
          let newStart = drag.startStartTime + deltaMs;
          newStart = Math.max(0, Math.min(seg.endTime - 300, newStart));
          setSegments(prev => prev.map(s => s.id === drag.segmentId ? { ...s, startTime: newStart } : s));
        }
      } else if (drag.type === 'resize-right' && drag.segmentId) {
        const seg = segments.find(s => s.id === drag.segmentId);
        if (seg && drag.startEndTime !== undefined) {
          let newEnd = drag.startEndTime + deltaMs;
          newEnd = Math.max(seg.startTime + 300, Math.min(session.duration, newEnd));
          setSegments(prev => prev.map(s => s.id === drag.segmentId ? { ...s, endTime: newEnd } : s));
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragRef.current) {
        if (dragRef.current.type !== 'scrub') {
          pushToHistory(segments);
        }
        dragRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [segments, session.duration]);

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = document.getElementById('timeline-interactive-track');
    if (!track) return;

    const target = e.target as HTMLElement;
    if (target.closest('.segment-block') || target.closest('.resize-handle')) {
      return;
    }

    const clickedTime = getTimeFromX(e.clientX, track);
    setCurrentTime(clickedTime);
    if (session.type === 'youtube') {
      youtubePlayerRef.current?.seekTo(clickedTime / 1000, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = clickedTime / 1000;
    }

    dragRef.current = {
      type: 'scrub',
      startX: e.clientX
    };
  };

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(session.duration);
  const [youtubeReady, setYoutubeReady] = useState(false);

  const youtubePlayerRef = useRef<any>(null);
  const youtubeTransformRef = useRef<HTMLDivElement>(null);

  function extractYouTubeId(url: string): string | null {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  // Load YouTube script and embed player if active
  useEffect(() => {
    if (session.type !== 'youtube') return;

    const ytVideoId = extractYouTubeId(session.rawVideoUrl);
    if (!ytVideoId) return;

    let player: any;

    const initPlayer = () => {
      // @ts-ignore
      player = new window.YT.Player('youtube-iframe-player', {
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
          mute: 1, // Start muted for reliable autoplay
          playsinline: 1
        },
        events: {
          onReady: (event: any) => {
            youtubePlayerRef.current = event.target;
            setYoutubeReady(true);
            const ytDuration = event.target.getDuration();
            if (ytDuration > 0) {
              const ytDurationMs = Math.round(ytDuration * 1000);
              session.duration = ytDurationMs;
              setSessionDuration(ytDurationMs);

              // Update the pre-seeded segments to match actual duration!
              setSegments([
                { id: 'seg_1', startTime: Math.min(1000, ytDurationMs * 0.15), endTime: Math.min(4500, ytDurationMs * 0.45), focusX: WIDTH * 0.35, focusY: HEIGHT * 0.35 },
                { id: 'seg_2', startTime: Math.min(7000, ytDurationMs * 0.65), endTime: Math.min(10500, ytDurationMs * 0.9), focusX: WIDTH * 0.65, focusY: HEIGHT * 0.55 }
              ]);
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
      setYoutubeReady(false);
    };
  }, [session.rawVideoUrl, session.id]);

  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [previewMode, setPreviewMode] = useState<'live' | 'compiled'>('live');
  const [compiledMimeType, setCompiledMimeType] = useState<string>('video/webm');
  
  // Sharing & Feedback Portal States
  const [isSharing, setIsSharing] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [isDraggingFocus, setIsDraggingFocus] = useState(false);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedSegmentId) return;
    setIsDraggingFocus(true);
    updateFocusFromEvent(e);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedSegmentId || !isDraggingFocus) return;
    updateFocusFromEvent(e);
  };

  const handleCanvasMouseUpOrLeave = () => {
    setIsDraggingFocus(false);
  };

  const updateFocusFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const videoX = (x / rect.width) * WIDTH;
    const videoY = (y / rect.height) * HEIGHT;

    setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { 
      ...s, 
      focusX: Math.max(0, Math.min(WIDTH, videoX)), 
      focusY: Math.max(0, Math.min(HEIGHT, videoY)) 
    } : s));

    setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        renderSingleFrame(video.currentTime * 1000);
      }
    }, 0);
  };

  // References
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cinematic Camera State (for smoothing)
  const cameraStateRef = useRef({
    x: WIDTH / 2,
    y: HEIGHT / 2,
    zoom: 1.0
  });

  // Zoom parameters based on settings
  const getZoomLevel = () => {
    switch (settings.intensity) {
      case 'low': return 1.25;
      case 'medium': return 1.5;
      case 'high': return 1.9;
      default: return 1.5;
    }
  };

  const getSmoothnessFactor = () => {
    switch (settings.smoothness) {
      case 'instant': return { pan: 1.0, zoom: 1.0 };
      case 'balanced': return { pan: 0.48, zoom: 0.48 };
      case 'cinematic': return { pan: 0.32, zoom: 0.32 };
      default: return { pan: 0.32, zoom: 0.32 };
    }
  };

  // Synchronize playing states
  const togglePlay = () => {
    if (session.type === 'youtube') {
      if (youtubePlayerRef.current) {
        if (isPlaying) {
          youtubePlayerRef.current.pauseVideo();
        } else {
          youtubePlayerRef.current.playVideo();
        }
      }
      setIsPlaying(!isPlaying);
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(e => console.error("Video play failed", e));
    }
  };

  const handleRestart = () => {
    if (session.type === 'youtube') {
      youtubePlayerRef.current?.seekTo(0, true);
      setCurrentTime(0);
      cameraStateRef.current = {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        zoom: 1.0
      };
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setCurrentTime(0);
    // Reset camera positions
    cameraStateRef.current = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      zoom: 1.0
    };
    if (!isPlaying) {
      renderSingleFrame(0);
    }
  };

  // Find the exact interpolated mouse coordinate at video time `t` (in ms)
  const getMousePositionAtTime = (history: MouseInteraction[], t: number) => {
    if (history.length <= 1) {
      return { x: WIDTH / 2, y: HEIGHT / 2, clicked: false, clickAge: 9999, isIdle: true, clickX: WIDTH / 2, clickY: HEIGHT / 2, beforeIdx: -1, speed: 0 };
    }

    // 1. Find indices of coordinates surrounding timestamp `t`
    let beforeIdx = -1;
    let afterIdx = -1;

    for (let i = 0; i < history.length; i++) {
      if (history[i].timestamp <= t) {
        beforeIdx = i;
      } else {
        afterIdx = i;
        break;
      }
    }

    // 2. Extract base coordinates (with interpolation if possible)
    let x = WIDTH / 2;
    let y = HEIGHT / 2;

    if (beforeIdx === -1) {
      // Before first recorded coordinate
      x = history[0].x;
      y = history[0].y;
      beforeIdx = 0;
    } else if (afterIdx === -1) {
      // After last recorded coordinate
      x = history[beforeIdx].x;
      y = history[beforeIdx].y;
    } else {
      // Interpolate between beforeIdx and afterIdx
      const e1 = history[beforeIdx];
      const e2 = history[afterIdx];
      const timeDiff = e2.timestamp - e1.timestamp;
      if (timeDiff > 0) {
        const weight = (t - e1.timestamp) / timeDiff;
        x = e1.x + (e2.x - e1.x) * weight;
        y = e1.y + (e2.y - e1.y) * weight;
      } else {
        x = e1.x;
        y = e1.y;
      }
    }

    // 3. Find the most recent click in the history before or at time `t`
    let lastClickTime = -99999;
    let clickedCoords = { x, y };
    for (let i = beforeIdx; i >= 0; i--) {
      if (history[i].type === 'click') {
        lastClickTime = history[i].timestamp;
        clickedCoords = { x: history[i].x, y: history[i].y };
        break;
      }
    }
    
    const clickAge = t - lastClickTime;
    const isClickedRecent = clickAge >= 0 && clickAge < 1500;

    // 4. Determine if mouse is idle / stationary
    // Look back at recent actions to see if mouse was moving within idleThreshold
    let isIdle = true;
    const idleThreshold = 2000; // 2 seconds
    for (let i = beforeIdx; i >= 0; i--) {
      if (t - history[i].timestamp > idleThreshold) {
        break;
      }
      if (history[i].type === 'move') {
        isIdle = false;
        break;
      }
    }

    // 5. Calculate real-time speed in a sliding window (last 350ms)
    let speed = 0;
    if (beforeIdx > 0) {
      const speedWindow = 350; // ms
      let currentIdx = beforeIdx;
      let lastX = x;
      let lastY = y;
      let oldestTime = t;
      let totalDistance = 0;

      while (currentIdx >= 0 && t - history[currentIdx].timestamp < speedWindow) {
        const pt = history[currentIdx];
        const dx = lastX - pt.x;
        const dy = lastY - pt.y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
        lastX = pt.x;
        lastY = pt.y;
        oldestTime = pt.timestamp;
        currentIdx--;
      }

      const timeSpan = t - oldestTime;
      if (timeSpan > 40) {
        speed = totalDistance / timeSpan; // px per ms
      }
    }

    return { 
      x, 
      y, 
      clicked: isClickedRecent, 
      clickAge,
      clickX: clickedCoords.x,
      clickY: clickedCoords.y,
      isIdle,
      beforeIdx,
      speed
    };
  };

  // Perform canvas drawing calculations for a specific time code
  const drawFrameOnCanvas = (
    ctx: CanvasRenderingContext2D, 
    video: HTMLVideoElement, 
    timeMs: number
  ) => {
    // Get mouse location data at this specific frame time
    const mouseData = getMousePositionAtTime(session.mouseHistory, timeMs);
    
    let targetZoom = 1.0;
    let targetX = WIDTH / 2;
    let targetY = HEIGHT / 2;

    // Segment-driven Zoom & Pan Camera Engine:
    // When inside any defined segment, smoothly zoom in to target coordinates. Otherwise stay unzoomed (1.0).
    if (settings.autoZoomEnabled) {
      const activeSegment = segmentsRef.current.find(seg => timeMs >= seg.startTime && timeMs <= seg.endTime);

      if (activeSegment) {
        const segZoom = activeSegment.zoomLevel || getZoomLevel();
        targetZoom = segZoom;

        // Prioritize custom focusX/focusY target coordinate if defined!
        if (activeSegment.focusX !== undefined && activeSegment.focusY !== undefined) {
          targetX = activeSegment.focusX;
          targetY = activeSegment.focusY;
        } else if (session.mouseHistory && session.mouseHistory.length > 1) {
          targetX = mouseData.x;
          targetY = mouseData.y;
        } else {
          targetX = WIDTH / 2;
          targetY = HEIGHT / 2;
        }

        // Click override (only applicable if mouse tracking coordinates are active)
        if (session.mouseHistory && session.mouseHistory.length > 1 && mouseData.clicked && mouseData.clickAge < 1000) {
          const progress = mouseData.clickAge / 1000;
          const peakPunch = Math.sin(progress * Math.PI); // peak at 500ms
          targetZoom = segZoom + (segZoom * 0.25) * peakPunch;
          targetX = mouseData.clickX;
          targetY = mouseData.clickY;
        }
      } else {
        // Outside of any active zoom segment, remain at full unzoomed aspect ratio (1.0 zoom) centered on raw video!
        targetZoom = 1.0;
        targetX = WIDTH / 2;
        targetY = HEIGHT / 2;
      }
    }

    // Relaxed frame boundaries so the camera can focus directly on edge widgets, but won't fly completely off-screen.
    // When zoomed out near 1.0, we taper the margin so it centers perfectly.
    const zoomCloserToOne = Math.max(0, 1 - (targetZoom - 1.0) * 4); // 1 at zoom=1.0, 0 at zoom>=1.25
    const bleedFactor = 0.65 + (0.35 * zoomCloserToOne); // 1.0 (no bleed) at zoom=1.0, 0.65 (35% bleed) at zoom>=1.25
    
    const marginX = (WIDTH / (2 * targetZoom)) * bleedFactor;
    const marginY = (HEIGHT / (2 * targetZoom)) * bleedFactor;
    targetX = Math.max(marginX, Math.min(WIDTH - marginX, targetX));
    targetY = Math.max(marginY, Math.min(HEIGHT - marginY, targetY));

    // Smoothly interpolate current camera coordinates towards target position
    const lerp = (start: number, end: number, amt: number) => start + (end - start) * amt;
    // When paused or scrubbing, instantly snap to coordinates for real-time visual feedback.
    // When playing or compiling, use the selected cinematic smoothness/easing factor.
    const ease = (isPlaying || isExporting) 
      ? getSmoothnessFactor() 
      : { pan: 1.0, zoom: 1.0 };

    cameraStateRef.current.x = lerp(cameraStateRef.current.x, targetX, ease.pan);
    cameraStateRef.current.y = lerp(cameraStateRef.current.y, targetY, ease.pan);
    cameraStateRef.current.zoom = lerp(cameraStateRef.current.zoom, targetZoom, ease.zoom);

    const currentCamX = cameraStateRef.current.x;
    const currentCamY = cameraStateRef.current.y;
    const currentCamZoom = cameraStateRef.current.zoom;

    // Clear Canvas and Draw Zoomed Frame
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    
    // 1. Center camera origin in canvas
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    // 2. Apply scale
    ctx.scale(currentCamZoom, currentCamZoom);
    // 3. Move camera focus to relative coordinates
    ctx.translate(-currentCamX, -currentCamY);
    // 4. Draw raw video image
    if (session.type !== 'youtube' && video) {
      ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);
    }

    // Apply Live auto-zoom transforms on the youtube player iframe wrapper
    if (session.type === 'youtube' && youtubeTransformRef.current) {
      const scale = currentCamZoom;
      const cx = currentCamX;
      const cy = currentCamY;
      
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

    // DRAW CUSTOM RED BULLSEYE TARGETING RETICLE ON PREVIEW (Only if there is a selected segment)
    if (selectedSegmentId && !isExporting) {
      const activeSeg = segmentsRef.current.find(s => s.id === selectedSegmentId);
      if (activeSeg) {
        const fx = activeSeg.focusX !== undefined ? activeSeg.focusX : WIDTH / 2;
        const fy = activeSeg.focusY !== undefined ? activeSeg.focusY : HEIGHT / 2;

        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(1 / currentCamZoom, 1 / currentCamZoom); // Keep constant visual size under extreme zoom

        // Outer radial gradient pulse glow
        const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, 32);
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
        gradient.addColorStop(0.5, 'rgba(239, 68, 68, 0.12)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Target Outer Ring
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Target Inner Ring
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Center white dot
        ctx.beginPath();
        ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        // Plus Hairlines
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-24, 0); ctx.lineTo(-12, 0);
        ctx.moveTo(12, 0); ctx.lineTo(24, 0);
        ctx.moveTo(0, -24); ctx.lineTo(0, -12);
        ctx.moveTo(0, 12); ctx.lineTo(0, 24);
        ctx.stroke();

        // Label offset slightly to the top-right
        ctx.font = 'bold 10px monospace';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText("ZOOM FOCUS TARGET", 30, 4);
        ctx.fillText("ZOOM FOCUS TARGET", 30, 4);

        ctx.restore();
      }
    }
    
    ctx.restore(); // This restores the camera transform (translate, scale, translate)
  };

  // Preview Render Loop
  const startPreviewLoop = () => {
    if (session.type === 'youtube') {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const renderLoop = () => {
        if (!isPlaying || !youtubePlayerRef.current) {
          return;
        }
        
        let ytTime = youtubePlayerRef.current.getCurrentTime?.();
        if (ytTime === undefined) ytTime = currentTime / 1000;

        const timeMs = ytTime * 1000;
        setCurrentTime(timeMs);
        drawFrameOnCanvas(ctx, null, timeMs);
        animationFrameRef.current = requestAnimationFrame(renderLoop);
      };

      animationFrameRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderLoop = () => {
      if (video.paused || video.ended) {
        setIsPlaying(false);
        return;
      }

      const timeMs = video.currentTime * 1000;
      setCurrentTime(timeMs);
      drawFrameOnCanvas(ctx, video, timeMs);
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);
  };

  // Run a single-frame preview draw (for pausing or scrubbing)
  const renderSingleFrame = (timeMs: number) => {
    if (session.type === 'youtube') {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawFrameOnCanvas(ctx, null, timeMs);
      return;
    }

    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrameOnCanvas(ctx, video, timeMs);
  };

  // Monitor YouTube play/pause events and time updates
  useEffect(() => {
    if (session.type !== 'youtube' || !youtubeReady) return;

    const interval = setInterval(() => {
      if (youtubePlayerRef.current) {
        // YT Player State: 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
        const playerState = youtubePlayerRef.current.getPlayerState?.();
        const isPl = playerState === 1;
        if (isPl !== isPlaying) {
          setIsPlaying(isPl);
        }

        const ytTime = youtubePlayerRef.current.getCurrentTime?.();
        if (ytTime !== undefined) {
          const timeMs = ytTime * 1000;
          setCurrentTime(timeMs);
          
          // Draw canvas reticle on current coordinate frame!
          const canvas = previewCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              drawFrameOnCanvas(ctx, null, timeMs);
            }
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [session.type, youtubeReady, isPlaying]);

  // Sync HTML5 video element state with React isPlaying state and currentTime
  useEffect(() => {
    if (session.type === 'youtube') return;

    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleTimeUpdate = () => {
      const timeMs = video.currentTime * 1000;
      setCurrentTime(timeMs);
      if (video.paused) {
        renderSingleFrame(timeMs);
      }
    };

    const handleSeeked = () => {
      renderSingleFrame(video.currentTime * 1000);
    };

    const handleLoadedMetadata = () => {
      renderSingleFrame(video.currentTime * 1000);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Initial draw & instant feedback when settings change while paused
    renderSingleFrame(video.currentTime * 1000);

    // Fallback delayed draw for slow-loading browser video blobs
    const timer = setTimeout(() => {
      renderSingleFrame(video.currentTime * 1000);
    }, 200);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      clearTimeout(timer);
    };
  }, [session, settings]);

  // Handle the active preview render loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let active = true;

    const renderLoop = () => {
      if (!active) return;

      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const timeMs = video.currentTime * 1000;
          setCurrentTime(timeMs);
          drawFrameOnCanvas(ctx, video, timeMs);
        }
      }

      if (isPlaying || isExporting) {
        animationFrameRef.current = requestAnimationFrame(renderLoop);
      }
    };

    if (isPlaying || isExporting) {
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    } else {
      renderSingleFrame(video.currentTime * 1000);
    }

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isExporting, settings, session]);

  // Export & Compile finalized video using WebM / MP4 rendering canvas in real-time
  const handleExportVideo = async () => {
    const rawVideo = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!rawVideo || !canvas || isExporting) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportedVideoUrl(null);
    rawVideo.pause();

    // Reset Camera tracking position for deterministic export starting coordinates
    cameraStateRef.current = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      zoom: 1.0
    };

    // Seek video to 0 first
    rawVideo.currentTime = 0;
    
    // Wait briefly for video seeking pipeline to complete
    await new Promise<void>((resolve) => {
      const seekHandler = () => {
        rawVideo.removeEventListener('seeked', seekHandler);
        resolve();
      };
      rawVideo.addEventListener('seeked', seekHandler);
    });

    // Capture the 30fps video stream of our preview canvas (which shows all effects in high fidelity!)
    const canvasStream = canvas.captureStream(30);
    const combinedStream = new MediaStream();
    
    // Add canvas video tracks
    canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));

    // Get original audio tracks from the video element's playing stream to maintain narration
    let audioTrackAdded = false;
    try {
      const videoStream = (rawVideo as any).captureStream ? (rawVideo as any).captureStream() : (rawVideo as any).mozCaptureStream ? (rawVideo as any).mozCaptureStream() : null;
      if (videoStream) {
        const audioTracks = videoStream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks.forEach((track: any) => {
            combinedStream.addTrack(track);
            audioTrackAdded = true;
          });
        }
      }
    } catch (e) {
      console.warn("Could not retrieve real-time audio track from captureStream", e);
    }

    // Fallback: Get original session audio track if active
    if (!audioTrackAdded) {
      try {
        const originalAudioTracks = await getAudioTracksFromBlob(session.rawBlob);
        if (originalAudioTracks && originalAudioTracks.length > 0) {
          originalAudioTracks.forEach(track => combinedStream.addTrack(track));
        }
      } catch (e) {
        console.warn("Could not retrieve fallback audio track", e);
      }
    }

    // Set up MediaRecorder on combined canvas output with highly compatible format detection
    const mimeTypesToTry = [
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    
    let selectedMime = 'video/webm';
    for (const mime of mimeTypesToTry) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combinedStream, { mimeType: selectedMime });
    } catch (err) {
      recorder = new MediaRecorder(combinedStream);
    }

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const finalBlob = new Blob(recordedChunks, { type: selectedMime });
      const finalUrl = URL.createObjectURL(finalBlob);
      setExportedVideoUrl(finalUrl);
      setCompiledMimeType(selectedMime);
      setPreviewMode('compiled');
      setIsExporting(false);
      setExportProgress(null);
    };

    // Monitor progress based on playing rawVideo currentTime
    const totalDurationMs = session.duration;
    
    const handleProgressUpdate = () => {
      const currentMs = rawVideo.currentTime * 1000;
      const pct = Math.min(99, Math.round((currentMs / totalDurationMs) * 100));
      setExportProgress(pct);
    };

    const handleVideoEnded = () => {
      rawVideo.removeEventListener('timeupdate', handleProgressUpdate);
      rawVideo.removeEventListener('ended', handleVideoEnded);
      
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      rawVideo.pause();
    };

    rawVideo.addEventListener('timeupdate', handleProgressUpdate);
    rawVideo.addEventListener('ended', handleVideoEnded);

    // Start recording
    recorder.start();
    setIsPlaying(true);

    // Play the video. This triggers our standard requestAnimationFrame loop,
    // which draws perfect cursor trails and auto-zooms at real 1x speed!
    rawVideo.play().catch(err => {
      console.error("Playback failed during export", err);
      setIsPlaying(false);
      setIsExporting(false);
      setExportProgress(null);
    });
  };

  const handleShareVideo = async () => {
    if (!exportedVideoUrl) return;
    setIsSharing(true);
    setShareLink(null);
    setCopiedLink(false);

    try {
      const res = await fetch(exportedVideoUrl);
      const blob = await res.blob();

      const videoId = `vid_${Math.random().toString(36).substr(2, 9)}`;
      const fileName = session.type === 'screen' ? 'Screen AutoZoom Video' : 'Sandbox Recording';
      await saveSharedVideo(videoId, fileName, blob, session.duration, compiledMimeType);

      const absoluteLink = `${window.location.origin}${window.location.pathname}?share=${videoId}`;
      setShareLink(absoluteLink);
    } catch (error) {
      console.error("Failed to generate sharing link:", error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Extract Audio tracks from original Blob
  const getAudioTracksFromBlob = async (blob: Blob): Promise<MediaStreamTrack[]> => {
    return new Promise((resolve) => {
      const audioUrl = URL.createObjectURL(blob);
      const audioEl = document.createElement('audio');
      audioEl.src = audioUrl;
      audioEl.crossOrigin = 'anonymous';
      
      audioEl.oncanplaythrough = () => {
        try {
          // @ts-ignore
          const stream = audioEl.captureStream ? audioEl.captureStream() : audioEl.mozCaptureStream ? audioEl.mozCaptureStream() : null;
          if (stream) {
            resolve(stream.getAudioTracks());
          } else {
            resolve([]);
          }
        } catch (e) {
          resolve([]);
        }
      };
      audioEl.onerror = () => resolve([]);
    });
  };

  const colors = [
    { value: '#6366f1', label: 'Indigo' },
    { value: '#10b981', label: 'Emerald' },
    { value: '#f43f5e', label: 'Rose' },
    { value: '#f59e0b', label: 'Amber' },
    { value: '#3b82f6', label: 'Blue' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-7xl mx-auto">
      {/* LEFT: Video Preview Area (8 Cols) */}
      <div className="lg:col-span-8 flex flex-col bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
              {previewMode === 'compiled' ? 'COMPILED AUTO-ZOOM PREVIEW' : 'CINEMATIC DYNAMIC AUTO-ZOOM PREVIEW'}
            </span>
            <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-400 border border-indigo-900/60 rounded-full px-2 py-0.5 ml-2 select-none">
              {session.mouseHistory?.length || 0} trackpoints
            </span>
          </div>

          {/* Dynamic Switcher between Live Easing and Rendered Video Output */}
          {exportedVideoUrl && (
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] md:text-xs">
              <button
                id="tab-preview-live"
                onClick={() => setPreviewMode('live')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${previewMode === 'live' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Live Canvas
              </button>
              <button
                id="tab-preview-compiled"
                onClick={() => setPreviewMode('compiled')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 cursor-pointer ${previewMode === 'compiled' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <CheckCircle className="w-3 h-3 text-emerald-300" />
                Compiled Video
              </button>
            </div>
          )}

          {previewMode === 'live' && (
            <div className="text-xs text-slate-400 font-mono">
              {Math.floor(currentTime / 1000)}s / {Math.floor(sessionDuration / 1000)}s
            </div>
          )}
        </div>

        {/* Dynamic Zooming Canvas Viewport */}
        <div className="relative aspect-video w-full bg-slate-900 flex items-center justify-center border-b border-slate-800/80">
          {previewMode === 'compiled' && exportedVideoUrl ? (
            <div className="w-full h-full bg-black relative flex items-center justify-center">
              <video
                src={exportedVideoUrl}
                className="w-full h-full max-w-full aspect-video object-contain"
                controls
                autoPlay
                playsInline
              />
              <div className="absolute top-3 left-3 bg-emerald-950/95 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] px-2.5 py-1 rounded-full select-none shadow-md z-10 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 block animate-pulse"></span>
                PREVIEWING COMPILED AUTO-ZOOM VIDEO
              </div>
            </div>
          ) : (
            <>
              {session.type === 'youtube' && (
                <div className="absolute inset-0 overflow-hidden bg-black flex items-center justify-center">
                  <div 
                    ref={youtubeTransformRef}
                    style={{
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  >
                    <div id="youtube-iframe-player" className="w-full h-full" />
                  </div>
                </div>
              )}

              <canvas
                ref={previewCanvasRef}
                width={WIDTH}
                height={HEIGHT}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUpOrLeave}
                onMouseLeave={handleCanvasMouseUpOrLeave}
                className={`w-full h-full max-w-full aspect-video object-contain cursor-crosshair ${
                  session.type === 'youtube' ? 'bg-transparent absolute inset-0 z-10' : 'bg-black'
                }`}
              />

              {/* Informative Tip: Guiding the user how to drag/click to target zoom focus visually */}
              {selectedSegmentId && (
                <div className="absolute top-4 left-4 right-4 bg-slate-950/90 border border-emerald-500/30 text-slate-200 text-xs px-4 py-2.5 rounded-xl shadow-2xl z-10 flex items-center gap-3 max-w-sm mx-auto transition-all animate-in fade-in duration-300">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-[10px] text-slate-300 leading-normal">
                    <strong>Drag Focus Target:</strong> Click or drag the bullseye reticle directly on the canvas above to set the exact zoom focus point!
                  </span>
                </div>
              )}

              {/* Reference video element (styled full-size inside viewport to prevent browser decoding/rendering throttle while remaining virtually invisible to the user) */}
              {session.type !== 'youtube' && (
                <video
                  ref={videoRef}
                  src={session.rawVideoUrl}
                  playsInline
                  muted
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0.001,
                    pointerEvents: 'none',
                    zIndex: -1,
                    objectFit: 'contain'
                  }}
                />
              )}
            </>
          )}

          {/* Overlays / Render Loading indicator */}
          {isExporting && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-6 z-20 backdrop-blur-sm">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin mb-4" />
              <h4 className="text-sm font-semibold text-slate-100">Compiling Auto-Zoom Keyframes</h4>
              <p className="text-xs text-slate-400 text-center mt-1.5 max-w-xs">
                Rendering your video with buttery smooth panning camera tracks and interactive click ripple animations. Please hold on...
              </p>
              <div className="w-48 bg-slate-800 h-2 rounded-full mt-4 overflow-hidden border border-slate-700">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-150" 
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-indigo-400 mt-2">
                {exportProgress}% COMPLETE
              </span>
            </div>
          )}
        </div>

        {/* INTERACTIVE KEYFRAME/SEGMENT TIMELINE WORKSPACE */}
        {previewMode === 'live' && (
          <div className="bg-slate-900/95 border-b border-slate-800 p-4 flex flex-col gap-3 select-none">
            {/* Timeline Toolbar Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-2 rounded-xl border border-slate-800/60">
              <div className="flex items-center gap-2">
                <button
                  id="btn-add-segment"
                  onClick={addSegment}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2 rounded-lg shadow-md transition-all cursor-pointer"
                  title="Add a Zoom Segment at current playhead"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add a segment</span>
                </button>

                <div className="h-6 w-[1px] bg-slate-800 mx-1"></div>

                <button
                  id="btn-toolbar-zoom-icon"
                  className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Zoom Focus Indicator"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                </button>

                <button
                  id="btn-toolbar-split-icon"
                  className="p-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                  title="Aspect/Crop Tool"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>

                <button
                  id="btn-delete-segment"
                  disabled={!selectedSegmentId}
                  onClick={deleteSelectedSegment}
                  className={`p-2 border rounded-lg transition-all cursor-pointer ${
                    selectedSegmentId 
                      ? 'bg-rose-950/40 border-rose-900 text-rose-400 hover:bg-rose-900/40' 
                      : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                  title="Delete Selected Segment"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div className="h-6 w-[1px] bg-slate-800 mx-1"></div>

                <button
                  id="btn-undo-timeline"
                  disabled={historyPast.length === 0}
                  onClick={handleUndo}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    historyPast.length > 0 
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700' 
                      : 'bg-slate-900/50 border-slate-900 text-slate-600 cursor-not-allowed'
                  }`}
                  title="Undo last change"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>

                <button
                  id="btn-redo-timeline"
                  disabled={historyFuture.length === 0}
                  onClick={handleRedo}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    historyFuture.length > 0 
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700' 
                      : 'bg-slate-900/50 border-slate-900 text-slate-600 cursor-not-allowed'
                  }`}
                  title="Redo last undone change"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>

                <button
                  id="btn-reset-timeline"
                  onClick={resetTimeline}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs px-3 py-2 rounded-lg transition-all cursor-pointer"
                  title="Clear all zoom segments"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Reset timeline</span>
                </button>
              </div>

              {/* Timeline Horizontal Zoom Scaling */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Timeline Zoom</span>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800/80 rounded-lg px-2 py-1">
                  <ZoomOut className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    id="slider-timeline-zoom"
                    type="range"
                    min="1"
                    max="5"
                    step="0.5"
                    value={timelineZoom}
                    onChange={(e) => setTimelineZoom(parseFloat(e.target.value))}
                    className="w-24 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all outline-none"
                  />
                  <ZoomIn className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            </div>

            {/* Scrollable Timeline Track Wrapper */}
            <div className="relative w-full overflow-x-auto bg-slate-950/60 border border-slate-800/80 rounded-xl max-h-[160px] shadow-inner scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {/* Inner Track container (expands based on timelineZoom) */}
              <div
                id="timeline-interactive-track"
                onMouseDown={handleTrackMouseDown}
                className="relative h-[95px] cursor-crosshair select-none"
                style={{ width: `${timelineZoom * 100}%`, minWidth: '100%' }}
              >
                {/* 1. Time Ticks Ruler (Top 24px) */}
                <div className="absolute top-0 left-0 right-0 h-6 bg-slate-900/50 border-b border-slate-800/60 pointer-events-none">
                  {(() => {
                    const totalSeconds = Math.ceil(session.duration / 1000);
                    const ticks = [];
                    for (let s = 0; s <= totalSeconds; s++) {
                      ticks.push(s);
                    }
                    return ticks.map((s) => {
                      const pct = (s * 1000 / session.duration) * 100;
                      if (pct > 100) return null;
                      const isMajor = s % 5 === 0;
                      return (
                        <div
                          key={s}
                          className="absolute top-0 bottom-0 flex flex-col items-center"
                          style={{ left: `${pct}%` }}
                        >
                          {isMajor ? (
                            <>
                              <div className="w-[1.5px] h-2.5 bg-slate-500"></div>
                              <span className="text-[9px] font-mono text-slate-400 font-bold mt-1 select-none">
                                {formatTimeLabel(s)}
                              </span>
                            </>
                          ) : (
                            <div className="w-[1px] h-1.5 bg-slate-700/60"></div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* 2. Visual Waveform/Video track mock background */}
                <div className="absolute top-8 left-0 right-0 bottom-3 px-1 pointer-events-none">
                  <div className="w-full h-full bg-slate-900/30 rounded-lg border border-slate-850 flex items-center justify-between overflow-hidden opacity-40">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div key={i} className="h-full w-[2px] bg-slate-800/80 rounded-full" style={{ height: `${20 + Math.sin(i * 1.2) * 15}%` }} />
                    ))}
                  </div>
                </div>

                {/* 3. Interactive Zoom Segments Container */}
                <div className="absolute top-8 left-0 right-0 bottom-3 pointer-events-none">
                  {segments.map((seg) => {
                    const leftPct = (seg.startTime / session.duration) * 100;
                    const widthPct = ((seg.endTime - seg.startTime) / session.duration) * 100;
                    const isSelected = seg.id === selectedSegmentId;

                    return (
                      <div
                        key={seg.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedSegmentId(seg.id);
                          dragRef.current = {
                            type: 'drag-segment',
                            segmentId: seg.id,
                            startX: e.clientX,
                            startStartTime: seg.startTime,
                            startEndTime: seg.endTime
                          };
                        }}
                        className={`segment-block absolute top-0 bottom-0 rounded-lg border-2 flex items-center justify-center transition-shadow pointer-events-auto cursor-grab active:cursor-grabbing ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/25 ring-2 ring-emerald-400/40 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                            : 'border-emerald-600/70 bg-emerald-600/10 hover:bg-emerald-600/20'
                        }`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      >
                        {/* Left Resize Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            dragRef.current = {
                              type: 'resize-left',
                              segmentId: seg.id,
                              startX: e.clientX,
                              startStartTime: seg.startTime
                            };
                          }}
                          className="resize-handle absolute left-0 top-0 bottom-0 w-2.5 bg-emerald-500/30 hover:bg-emerald-400 rounded-l-md cursor-ew-resize flex items-center justify-center border-r border-emerald-500/20"
                        >
                          <div className="w-[1px] h-4 bg-emerald-300/60" />
                        </div>

                        {/* Segment Display Text with Eye Icon */}
                        <div className="flex items-center gap-1 bg-slate-950/90 border border-emerald-500/30 px-2 py-0.5 rounded-md shadow-md text-emerald-400 font-bold font-mono text-[10px] select-none">
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Z</span>
                          <span className="text-[8px] text-emerald-500/70">
                            {((seg.endTime - seg.startTime) / 1000).toFixed(1)}s
                          </span>
                        </div>

                        {/* Right Resize Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            dragRef.current = {
                              type: 'resize-right',
                              segmentId: seg.id,
                              startX: e.clientX,
                              startEndTime: seg.endTime
                            };
                          }}
                          className="resize-handle absolute right-0 top-0 bottom-0 w-2.5 bg-emerald-500/30 hover:bg-emerald-400 rounded-r-md cursor-ew-resize flex items-center justify-center border-l border-emerald-500/20"
                        >
                          <div className="w-[1px] h-4 bg-emerald-300/60" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 4. Playhead Line */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-emerald-400 z-30 pointer-events-none"
                  style={{ left: `${(currentTime / session.duration) * 100}%` }}
                >
                  <div className="absolute top-0 -translate-x-1/2 -translate-y-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-emerald-400 z-30" />
                </div>
              </div>
            </div>

            {/* Helper Labels */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-1">
              <span>🖱️ Drag blocks to move • Drag ends to resize • Click track to scrub</span>
              <span>Selected Area: {selectedSegmentId ? `${segments.find(s => s.id === selectedSegmentId) ? ((segments.find(s => s.id === selectedSegmentId)!.startTime)/1000).toFixed(1) + 's - ' + ((segments.find(s => s.id === selectedSegmentId)!.endTime)/1000).toFixed(1) + 's' : 'none'}` : 'None'}</span>
            </div>
          </div>
        )}

        {/* Video Control Bar */}
        <div className="bg-slate-900/60 p-4 flex items-center justify-between gap-4">
          {previewMode === 'live' ? (
            <div className="flex items-center gap-2">
              <button
                id="btn-play-pause"
                onClick={togglePlay}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow transition-all cursor-pointer"
                title={isPlaying ? 'Pause Preview' : 'Play Preview'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              </button>
              <button
                id="btn-restart-preview"
                onClick={handleRestart}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-all cursor-pointer"
                title="Restart Video Timeline"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-400 bg-emerald-950/40 px-2.5 py-1.5 rounded-lg border border-emerald-800/40 font-semibold flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                Compiled Video Player Active
              </span>
              <button
                id="btn-switch-live"
                onClick={() => setPreviewMode('live')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                Adjust Live Settings
              </button>
            </div>
          )}

          <div className="text-[11px] text-slate-400 max-w-sm leading-relaxed hidden sm:block">
            {previewMode === 'live' ? (
              <span>💡 Move your mouse over settings or press Play. The camera pokes and zooms in close when clicks occur!</span>
            ) : (
              <span>🎉 Fully rendered output! Use standard video controls to inspect your cursor trails and smooth zooming.</span>
            )}
          </div>

          <button
            id="btn-discard-session"
            onClick={onReset}
            className="text-xs bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-950/80 px-3 py-2 rounded-lg transition-all cursor-pointer"
          >
            Discard Session
          </button>
        </div>
      </div>

      {/* RIGHT: Calibration & Export Controls (4 Cols) */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        {/* Cinematic Easing Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-indigo-400" />
            Cinematic Camera Config
          </h3>

          {/* Toggle AutoZoom */}
          <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800/80">
            <div>
              <div className="text-xs font-semibold text-slate-300">Auto-Zoom Tracks</div>
              <div className="text-[10px] text-slate-500">Enable automatic zoom algorithms</div>
            </div>
            <button
              id="toggle-auto-zoom"
              onClick={() => setSettings({ ...settings, autoZoomEnabled: !settings.autoZoomEnabled })}
              className={`relative inline-flex h-5 w-10 items-center rounded-full transition-all ${
                settings.autoZoomEnabled ? 'bg-indigo-600' : 'bg-slate-800'
              } cursor-pointer`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-all ${
                settings.autoZoomEnabled ? 'translate-x-5.5' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {settings.autoZoomEnabled && (
            <>
              {/* Zoom Intensity */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Zoom Scale Intensity
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((intensity) => (
                    <button
                      key={intensity}
                      id={`intensity-${intensity}`}
                      onClick={() => setSettings({ ...settings, intensity })}
                      className={`text-xs py-1.5 px-2 rounded-lg border font-medium uppercase tracking-wider transition-all ${
                        settings.intensity === intensity
                          ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                      } cursor-pointer`}
                    >
                      {intensity}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Pan Smoothness */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Camera Pan Easing
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['instant', 'balanced', 'cinematic'] as const).map((smoothness) => (
                    <button
                      key={smoothness}
                      id={`smoothness-${smoothness}`}
                      onClick={() => setSettings({ ...settings, smoothness })}
                      className={`text-xs py-1.5 px-2 rounded-lg border font-medium uppercase tracking-wider transition-all ${
                        settings.smoothness === smoothness
                          ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                      } cursor-pointer`}
                    >
                      {smoothness}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Active Segment Properties (if one is selected) */}
        {selectedSegmentId && (
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-xl flex flex-col gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-400" />
                Active Segment Config
              </h3>
              <button
                onClick={deleteSelectedSegment}
                className="text-[10px] bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 font-semibold px-2.5 py-1 rounded-lg border border-rose-900/30 transition-all cursor-pointer"
              >
                Delete Segment
              </button>
            </div>

            {(() => {
              const activeSeg = segments.find(s => s.id === selectedSegmentId);
              if (!activeSeg) return <p className="text-[10px] text-slate-500">No segment selected</p>;
              const segZoom = activeSeg.zoomLevel || getZoomLevel();
              
              return (
                <div className="flex flex-col gap-3 mt-1 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Start: <strong className="text-emerald-400">{(activeSeg.startTime / 1000).toFixed(2)}s</strong></span>
                    <span>End: <strong className="text-emerald-400">{(activeSeg.endTime / 1000).toFixed(2)}s</strong></span>
                    <span>Duration: <strong className="text-emerald-400">{((activeSeg.endTime - activeSeg.startTime) / 1000).toFixed(1)}s</strong></span>
                  </div>

                  {/* Segment-level zoom intensity control */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zoom Multiplier</label>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950 border border-emerald-900 px-2 py-0.5 rounded-md">{segZoom.toFixed(2)}x</span>
                    </div>
                    <input
                      id="slider-segment-zoom-multiplier"
                      type="range"
                      min="1.1"
                      max="2.5"
                      step="0.05"
                      value={segZoom}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSegments(prev => prev.map(s => s.id === selectedSegmentId ? { ...s, zoomLevel: val } : s));
                      }}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all outline-none"
                    />
                    <p className="text-[9px] text-slate-500 leading-relaxed mt-1">
                      Customize how close the camera frames the cursor specifically during this segment of the timeline.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* COMPILE AND DOWNLOAD BOX */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <h3 className="text-xs font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-indigo-400" />
            {session.type === 'youtube' ? 'Share Workspace' : 'Compile & Export'}
          </h3>

          {session.type === 'youtube' ? (
            <div className="flex flex-col gap-3">
              <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-3.5 flex flex-col gap-2 text-xs text-indigo-300">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-indigo-200">Instant Video Sharing!</h4>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Since this is a YouTube import, you can generate your interactive share workspace immediately without waiting for a lengthy compile process!
                    </p>
                  </div>
                </div>
              </div>

              <button
                id="btn-share-video"
                disabled={isSharing}
                onClick={handleShareVideo}
                className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isSharing ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-white animate-spin"></span>
                    <span>Creating Share Space...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Share Workspace & Get Feedback</span>
                  </>
                )}
              </button>

              {shareLink && (
                <div className="bg-slate-950 border border-indigo-500/20 p-4 rounded-xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-col gap-1 text-[10px]">
                    <span className="font-bold text-indigo-400 uppercase tracking-wide font-mono">Video Share Link Generated!</span>
                    <span className="text-slate-500">Anyone with this link can view the video and leave time-coded feedback.</span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-2 rounded-lg">
                    <input
                      type="text"
                      readOnly
                      value={shareLink}
                      className="bg-transparent text-xs text-slate-300 outline-none w-full font-mono overflow-ellipsis"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-all cursor-pointer shrink-0"
                      title="Copy link"
                    >
                      {copiedLink ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-center font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-wider font-mono flex items-center justify-center gap-1.5 mt-1"
                  >
                    <span>View Shared Video Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          ) : !exportedVideoUrl ? (
            <button
              id="btn-compile-video"
              disabled={isExporting}
              onClick={handleExportVideo}
              className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <Wand2 className="w-4 h-4" />
              Compile & Apply Zoom
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 flex flex-col gap-2 text-xs text-emerald-300">
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-emerald-200">Production Video Ready!</h4>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Your dynamic auto-zoomed recording was compiled successfully and includes your voiceover narration track.
                    </p>
                  </div>
                </div>
                <div className="border-t border-emerald-850/40 pt-2.5 mt-1 flex justify-between text-[10px] text-emerald-400/80 font-mono">
                  <span>Format: <strong>{compiledMimeType.includes('video/mp4') ? 'MP4' : 'WEBM'}</strong></span>
                  <span>MIME: <strong>{compiledMimeType.split(';')[0]}</strong></span>
                </div>
              </div>

              <a
                id="btn-download-video"
                href={exportedVideoUrl}
                download={`Screen-AutoZoom-${Date.now()}.${compiledMimeType.includes('video/mp4') ? 'mp4' : 'webm'}`}
                className="w-full flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg transition-all text-center cursor-pointer font-bold"
              >
                <Download className="w-4 h-4" />
                Download Video ({compiledMimeType.includes('video/mp4') ? 'MP4' : 'WebM'})
              </a>

              <button
                id="btn-share-video"
                disabled={isSharing}
                onClick={handleShareVideo}
                className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                {isSharing ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-white animate-spin"></span>
                    <span>Creating Share Space...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Share Workspace & Get Feedback</span>
                  </>
                )}
              </button>

              {shareLink && (
                <div className="bg-slate-950 border border-indigo-500/20 p-4 rounded-xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex flex-col gap-1 text-[10px]">
                    <span className="font-bold text-indigo-400 uppercase tracking-wide font-mono">Video Share Link Generated!</span>
                    <span className="text-slate-500">Anyone with this link can view the video and leave time-coded feedback.</span>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-2 rounded-lg">
                    <input
                      type="text"
                      readOnly
                      value={shareLink}
                      className="bg-transparent text-xs text-slate-300 outline-none w-full font-mono overflow-ellipsis"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-all cursor-pointer shrink-0"
                      title="Copy link"
                    >
                      {copiedLink ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <a
                    href={shareLink}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-center py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>View Interactive Shared Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <button
                id="btn-re-render"
                onClick={() => {
                  setExportedVideoUrl(null);
                  setPreviewMode('live');
                }}
                className="w-full text-xs text-slate-400 hover:text-slate-200 py-1.5 hover:underline cursor-pointer"
              >
                Modify settings and re-render
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
