import { Segment, SegmentType } from '@/types';
import { formatTime } from '@/utils/format';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Badge } from '@/app/components/ui/badge';
import { Eye, Pencil, Volume2, VolumeX, Copy } from 'lucide-react';
import { Card } from '@/app/components/ui/card';

interface SegmentItemProps {
  segment: Segment;
  onToggleSelect: (segmentId: string) => void;
  onPreview: (segment: Segment) => void;
  onEdit: (segment: Segment) => void;
}

const segmentConfig: Record<
  SegmentType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  normal: {
    label: '正常',
    icon: <Volume2 className="h-3 w-3" />,
    color: 'bg-green-100 text-green-800 border-green-200',
  },
  silent: {
    label: '静音',
    icon: <VolumeX className="h-3 w-3" />,
    color: 'bg-gray-100 text-gray-800 border-gray-200',
  },
  duplicate: {
    label: '重复',
    icon: <Copy className="h-3 w-3" />,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
  },
};

export function SegmentItem({
  segment,
  onToggleSelect,
  onPreview,
  onEdit,
}: SegmentItemProps) {
  const config = segmentConfig[segment.type];

  return (
    <Card
      className={`p-4 transition-all ${
        segment.selected
          ? 'border-indigo-300 bg-indigo-50/50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="space-y-3">
        {/* 头部 - 类型和选择框 */}
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={`${config.color} flex items-center gap-1`}
          >
            {config.icon}
            <span>{config.label}</span>
          </Badge>
          <Checkbox
            checked={segment.selected}
            onCheckedChange={() => onToggleSelect(segment.id)}
          />
        </div>

        {/* 时间信息 */}
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">时间:</span>
            <span className="ml-1 font-medium">
              {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">时长:</span>
            <span className="ml-1 font-medium">{segment.duration.toFixed(1)}s</span>
          </div>
        </div>

        {/* 文本内容 */}
        {segment.text && (
          <p className="text-sm text-gray-700 line-clamp-2 bg-white p-2 rounded border border-gray-100">
            {segment.text}
          </p>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(segment)}
          >
            <Eye className="h-4 w-4 mr-1" />
            预览
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onEdit(segment)}
          >
            <Pencil className="h-4 w-4 mr-1" />
            编辑
          </Button>
        </div>
      </div>
    </Card>
  );
}
