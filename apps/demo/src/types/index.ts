// 片段类型
export type SegmentType = 'normal' | 'silent' | 'duplicate';

// 片段数据结构
export interface Segment {
  id: string;
  type: SegmentType;
  startTime: number; // 秒
  endTime: number; // 秒
  duration: number; // 秒
  text: string;
  selected: boolean; // 是否选中用于渲染
}

// 项目数据结构
export interface Project {
  id: string;
  name: string;
  videoFile?: File;
  videoUrl?: string;
  createdAt: string;
  updatedAt: string;
  segments: Segment[];
  status: 'draft' | 'parsed' | 'rendering' | 'completed';
  totalDuration: number; // 秒
}

// 设置配置
export interface Settings {
  silenceThreshold: number; // 静音检测阈值 (0-1)
  duplicateSimilarity: number; // 重复检测相似度 (0-1)
  autoRemoveSilent: boolean; // 自动去除静音
  autoRemoveDuplicate: boolean; // 自动去除重复
  exportQuality: 'low' | 'medium' | 'high';
}

// 默认设置
export const defaultSettings: Settings = {
  silenceThreshold: 0.3,
  duplicateSimilarity: 0.85,
  autoRemoveSilent: true,
  autoRemoveDuplicate: true,
  exportQuality: 'high',
};
