import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Slider } from '@/app/components/ui/slider';
import { Switch } from '@/app/components/ui/switch';
import { Button } from '@/app/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Settings } from '@/types';
import { saveSettings } from '@/utils/storage';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  const handleSave = () => {
    saveSettings(localSettings);
    onSettingsChange(localSettings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>配置视频解析和导出参数</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 静音检测阈值 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>静音检测灵敏度</Label>
              <span className="text-sm text-muted-foreground">
                {Math.round(localSettings.silenceThreshold * 100)}%
              </span>
            </div>
            <Slider
              value={[localSettings.silenceThreshold]}
              onValueChange={([value]) =>
                setLocalSettings({ ...localSettings, silenceThreshold: value })
              }
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              值越高，越容易识别为静音
            </p>
          </div>

          {/* 重复检测相似度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>重复检测相似度</Label>
              <span className="text-sm text-muted-foreground">
                {Math.round(localSettings.duplicateSimilarity * 100)}%
              </span>
            </div>
            <Slider
              value={[localSettings.duplicateSimilarity]}
              onValueChange={([value]) =>
                setLocalSettings({ ...localSettings, duplicateSimilarity: value })
              }
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              值越高，需要更相似才会被识别为重复
            </p>
          </div>

          {/* 自动去除选项 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>自动去除静音片段</Label>
                <p className="text-xs text-muted-foreground">
                  解析后自动取消选择静音片段
                </p>
              </div>
              <Switch
                checked={localSettings.autoRemoveSilent}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, autoRemoveSilent: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>自动去除重复片段</Label>
                <p className="text-xs text-muted-foreground">
                  解析后自动取消选择重复片段
                </p>
              </div>
              <Switch
                checked={localSettings.autoRemoveDuplicate}
                onCheckedChange={(checked) =>
                  setLocalSettings({ ...localSettings, autoRemoveDuplicate: checked })
                }
              />
            </div>
          </div>

          {/* 导出质量 */}
          <div className="space-y-2">
            <Label>导出视频质量</Label>
            <Select
              value={localSettings.exportQuality}
              onValueChange={(value: 'low' | 'medium' | 'high') =>
                setLocalSettings({ ...localSettings, exportQuality: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低 (快速导出)</SelectItem>
                <SelectItem value="medium">中等 (平衡)</SelectItem>
                <SelectItem value="high">高 (最佳质量)</SelectItem>
              </SelectContent>
            </Select>
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
