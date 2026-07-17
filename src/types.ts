export interface MouseInteraction {
  x: number;
  y: number;
  type: 'move' | 'click' | 'mousedown' | 'mouseup';
  timestamp: number; // millisecond timestamp relative to start
}

export interface RecordingSession {
  id: string;
  rawBlob?: Blob;
  rawVideoUrl: string;
  duration: number; // in milliseconds
  mouseHistory: MouseInteraction[];
  timestamp: number; // calendar time
  width: number;
  height: number;
  type: 'sandbox' | 'screen' | 'youtube';
}

export interface ZoomSettings {
  intensity: 'low' | 'medium' | 'high'; // 1.2x, 1.5x, 1.9x
  smoothness: 'instant' | 'balanced' | 'cinematic'; // interpolation factor (0.1, 0.05, 0.02)
  clickEffect: 'none' | 'ripple' | 'ring' | 'pulse';
  cursorStyle: 'default' | 'halo' | 'laser' | 'spotlight' | 'none';
  cursorColor: string;
  cursorSize: number;
  showCursor: boolean;
  autoZoomEnabled: boolean;
}

export type ToolType = 'select' | 'brush' | 'rectangle' | 'circle' | 'arrow' | 'text' | 'sticky' | 'mock-browser';

export interface BaseElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  strokeWidth?: number;
  text?: string;
  points?: { x: number; y: number }[]; // For freehand brush and lines
}
