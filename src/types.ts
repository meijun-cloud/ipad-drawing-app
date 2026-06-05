export type ToolType = 'pen' | 'pencil' | 'crayon' | 'watercolor' | 'airbrush' | 'eraser' | 'lasso';

export interface BrushSettings {
  size: number;
  opacity: number;
  stabilizer: 'none' | 'low' | 'high';
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  time: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
  tool: ToolType;
  size: number;
  opacity: number;
  stabilizer: 'none' | 'low' | 'high';
}
