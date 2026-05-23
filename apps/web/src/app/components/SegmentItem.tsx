import { Segment } from "@/types";
import { formatTime } from "@/utils/format";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Badge } from "@/app/components/ui/badge";
import { Eye, Pencil, Volume2, VolumeX, Copy, Scissors } from "lucide-react";
import { Card } from "@/app/components/ui/card";

interface SegmentItemProps {
  segment: Segment;
  onToggleSelect: (segmentId: string) => void;
  onPreview: (segment: Segment) => void;
  onEdit: (segment: Segment) => void;
  onSplit: (segment: Segment) => void;
}

const segmentConfig = {
  normal: {
    label: "正常",
    icon: <Volume2 className="h-3 w-3" />,
    color: "bg-green-100 text-green-800 border-green-200",
  },
  silent: {
    label: "静音",
    icon: <VolumeX className="h-3 w-3" />,
    color: "bg-gray-100 text-gray-800 border-gray-200",
  },
  duplicate: {
    label: "重复",
    icon: <Copy className="h-3 w-3" />,
    color: "bg-orange-100 text-orange-800 border-orange-200",
  },
} as const;

function resolveSegmentType(segment: Segment) {
  if (segment.reason === "duplicate") return "duplicate";
  if (segment.type === "silence") return "silent";
  return "normal";
}

export function SegmentItem({
  segment,
  onToggleSelect,
  onPreview,
  onEdit,
  onSplit,
}: SegmentItemProps) {
  const displayType = resolveSegmentType(segment);
  const config = segmentConfig[displayType];
  const startSeconds = segment.startMs / 1000;
  const endSeconds = segment.endMs / 1000;
  const durationSeconds = segment.durationMs / 1000;
  const displayText = segment.editedText ?? segment.text;

  return (
    <Card
      className={`p-4 transition-all ${
        segment.selected
          ? "border-indigo-300 bg-indigo-50/50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="space-y-3">
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

        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div>
            <span className="text-gray-400">时间:</span>
            <span className="ml-1 font-medium text-gray-600">
              {formatTime(startSeconds)} - {formatTime(endSeconds)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">时长:</span>
            <span className="ml-1 font-medium text-gray-600">
              {durationSeconds.toFixed(1)}s
            </span>
          </div>
        </div>

        {displayText && (
          <div className="bg-white rounded border border-gray-100 overflow-hidden p-2">
            <p className="text-sm text-gray-700 line-clamp-1">{displayText}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onPreview(segment)}
          >
            <Eye className="h-4 w-4 mr-1" />
            预览
          </Button>
          {segment.type === "speech" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onEdit(segment)}
              >
                <Pencil className="h-4 w-4 mr-1" />
                编辑
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onSplit(segment)}
              >
                <Scissors className="h-4 w-4 mr-1" />
                拆分
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
