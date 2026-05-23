import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Button } from '@/app/components/ui/button';
import { Segment } from '@/types';
import { formatTime } from '@/utils/format';

interface SegmentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segment: Segment | null;
  onSave: (segment: Segment) => void;
}

export function SegmentEditDialog({
  open,
  onOpenChange,
  segment,
  onSave,
}: SegmentEditDialogProps) {
  const [text, setText] = useState(segment?.text || '');

  // 当弹窗打开时，重置文本
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && segment) {
      setText(segment.text);
    }
    onOpenChange(newOpen);
  };

  const handleSave = () => {
    if (segment) {
      onSave({ ...segment, text });
      onOpenChange(false);
    }
  };

  if (!segment) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>编辑片段</DialogTitle>
          <DialogDescription>
            修改片段的文本内容
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">时间范围:</span>
              <span className="ml-2 font-medium">
                {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">时长:</span>
              <span className="ml-2 font-medium">
                {segment.duration.toFixed(1)}秒
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="segment-text">文本内容</Label>
            <Textarea
              id="segment-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="输入片段文本内容..."
              rows={6}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
