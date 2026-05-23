import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { Slider } from "@/app/components/ui/slider";
import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Input } from "@/app/components/ui/input";
import { Settings } from "@/types";
import { AppSettings } from "@auto-editor/shared";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => Promise<AppSettings>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<Settings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, open]);

  const handleSave = async () => {
    await onSettingsChange(localSettings);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>配置视频解析与接口参数</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">解析参数</h4>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>静音阈值 (ms)</Label>
                <span className="text-sm text-muted-foreground">
                  {Math.round(localSettings.silenceThresholdMs)} ms
                </span>
              </div>
              <Slider
                value={[localSettings.silenceThresholdMs]}
                onValueChange={([value]) =>
                  setLocalSettings({
                    ...localSettings,
                    silenceThresholdMs: value,
                  })
                }
                min={100}
                max={2000}
                step={100}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                值越小，越敏感；默认 500ms
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>重复相似度</Label>
                <span className="text-sm text-muted-foreground">
                  {Math.round(localSettings.duplicateSimilarity * 100)}%
                </span>
              </div>
              <Slider
                value={[localSettings.duplicateSimilarity]}
                onValueChange={([value]) =>
                  setLocalSettings({
                    ...localSettings,
                    duplicateSimilarity: value,
                  })
                }
                min={0.5}
                max={0.99}
                step={0.01}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                值越高，需要更相似才会识别为重复
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">转录服务</h4>
            <div className="space-y-2">
              <Label>转录提供方</Label>
              <Select
                value={localSettings.transcribeProvider}
                onValueChange={(value: Settings["transcribeProvider"]) =>
                  setLocalSettings({
                    ...localSettings,
                    transcribeProvider: value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="volcengine">火山引擎</SelectItem>
                  <SelectItem value="mock">Mock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={localSettings.volcengine.apiKey}
                  onChange={(event) =>
                    setLocalSettings({
                      ...localSettings,
                      volcengine: {
                        ...localSettings.volcengine,
                        apiKey: event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Resource ID</Label>
                <Input
                  value={localSettings.volcengine.resourceId}
                  onChange={(event) =>
                    setLocalSettings({
                      ...localSettings,
                      volcengine: {
                        ...localSettings.volcengine,
                        resourceId: event.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Submit Endpoint</Label>
              <Input
                value={localSettings.volcengine.submitEndpoint}
                onChange={(event) =>
                  setLocalSettings({
                    ...localSettings,
                    volcengine: {
                      ...localSettings.volcengine,
                      submitEndpoint: event.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Query Endpoint</Label>
              <Input
                value={localSettings.volcengine.queryEndpoint}
                onChange={(event) =>
                  setLocalSettings({
                    ...localSettings,
                    volcengine: {
                      ...localSettings.volcengine,
                      queryEndpoint: event.target.value,
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900">上传方式</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>上传提供方</Label>
                <Select
                  value={localSettings.uploadProvider}
                  onValueChange={(value: Settings["uploadProvider"]) =>
                    setLocalSettings({
                      ...localSettings,
                      uploadProvider: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uguu">Uguu 临时上传</SelectItem>
                    <SelectItem value="public">本地公网直链</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>公网访问根地址</Label>
                <Input
                  value={localSettings.publicBaseUrl}
                  onChange={(event) =>
                    setLocalSettings({
                      ...localSettings,
                      publicBaseUrl: event.target.value,
                    })
                  }
                  placeholder="https://your-domain.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>上传接口</Label>
              <Input
                value={localSettings.uploadEndpoint ?? ""}
                onChange={(event) =>
                  setLocalSettings({
                    ...localSettings,
                    uploadEndpoint: event.target.value,
                  })
                }
                placeholder="https://uguu.se/upload"
              />
            </div>
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
