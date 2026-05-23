import { useState, useEffect, useRef } from 'react';
import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Card } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import {
  Settings as SettingsIcon,
  ArrowLeft,
  Upload,
  Play,
  Loader2,
  CheckCircle2,
  Film,
} from 'lucide-react';
import { SegmentItem } from '@/app/components/SegmentItem';
import { SegmentEditDialog } from '@/app/components/SegmentEditDialog';
import { Project, Segment, Settings } from '@/types';
import { saveProject, getProject, getSettings } from '@/utils/storage';
import { formatDuration } from '@/utils/format';
import { toast } from 'sonner';

interface EditorPageProps {
  projectId?: string;
  onNavigateToHome: () => void;
  onSettingsOpen: () => void;
}

export function EditorPage({
  projectId,
  onNavigateToHome,
  onSettingsOpen,
}: EditorPageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [renderProgress, setRenderProgress] = useState(0);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectId) {
      const existingProject = getProject(projectId);
      if (existingProject) {
        setProject(existingProject);
      } else {
        // 项目不存在，创建新项目
        createNewProject();
      }
    } else {
      createNewProject();
    }
  }, [projectId]);

  const createNewProject = () => {
    const newProject: Project = {
      id: `project-${Date.now()}`,
      name: `项目 ${new Date().toLocaleString('zh-CN')}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      segments: [],
      status: 'draft',
      totalDuration: 0,
    };
    setProject(newProject);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error('请上传视频文件');
      return;
    }

    setIsUploading(true);
    
    // 模拟上传
    setTimeout(() => {
      const videoUrl = URL.createObjectURL(file);
      const updatedProject: Project = {
        ...project!,
        name: file.name.replace(/\.[^/.]+$/, ''),
        videoFile: file,
        videoUrl,
        updatedAt: new Date().toISOString(),
      };
      setProject(updatedProject);
      saveProject(updatedProject);
      setIsUploading(false);
      toast.success('视频上传成功');
    }, 1000);
  };

  const handleParse = async () => {
    if (!project?.videoUrl) {
      toast.error('请先上传视频');
      return;
    }

    setIsParsing(true);
    setParseProgress(0);

    // 模拟解析进度
    const progressInterval = setInterval(() => {
      setParseProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 5;
      });
    }, 200);

    // 模拟API调用
    setTimeout(() => {
      clearInterval(progressInterval);
      setParseProgress(100);

      const settings = getSettings();
      
      // 生成模拟片段数据
      const mockSegments: Segment[] = [
        {
          id: 'seg-1',
          type: 'normal',
          startTime: 0,
          endTime: 5.2,
          duration: 5.2,
          text: '大家好，欢迎来到今天的视频。今天我要和大家分享一个非常有趣的话题...',
          selected: true,
        },
        {
          id: 'seg-2',
          type: 'silent',
          startTime: 5.2,
          endTime: 7.5,
          duration: 2.3,
          text: '',
          selected: !settings.autoRemoveSilent,
        },
        {
          id: 'seg-3',
          type: 'normal',
          startTime: 7.5,
          endTime: 15.8,
          duration: 8.3,
          text: '首先让我们从基础开始讲解，这个概念其实非常简单，只要大家跟着我的思路...',
          selected: true,
        },
        {
          id: 'seg-4',
          type: 'duplicate',
          startTime: 15.8,
          endTime: 20.1,
          duration: 4.3,
          text: '只要大家跟着我的思路，只要大家跟着我的思路...',
          selected: !settings.autoRemoveDuplicate,
        },
        {
          id: 'seg-5',
          type: 'normal',
          startTime: 20.1,
          endTime: 28.6,
          duration: 8.5,
          text: '接下来我们深入探讨一下这个问题的核心要点，这里有三个关键点需要注意...',
          selected: true,
        },
        {
          id: 'seg-6',
          type: 'silent',
          startTime: 28.6,
          endTime: 30.2,
          duration: 1.6,
          text: '',
          selected: !settings.autoRemoveSilent,
        },
        {
          id: 'seg-7',
          type: 'normal',
          startTime: 30.2,
          endTime: 38.9,
          duration: 8.7,
          text: '好的，今天的内容就分享到这里。如果觉得有帮助的话，记得点赞关注！',
          selected: true,
        },
      ];

      const totalDuration = mockSegments[mockSegments.length - 1].endTime;

      const updatedProject: Project = {
        ...project,
        segments: mockSegments,
        status: 'parsed',
        totalDuration,
        updatedAt: new Date().toISOString(),
      };

      setProject(updatedProject);
      saveProject(updatedProject);
      setIsParsing(false);
      toast.success(`解析完成！识别到 ${mockSegments.length} 个片段`);
    }, 3000);
  };

  const handleRender = async () => {
    if (!project?.segments.length) {
      toast.error('请先解析视频');
      return;
    }

    const selectedSegments = project.segments.filter((s) => s.selected);
    if (selectedSegments.length === 0) {
      toast.error('请至少选择一个片段');
      return;
    }

    setIsRendering(true);
    setRenderProgress(0);

    // 模拟渲染进度
    const progressInterval = setInterval(() => {
      setRenderProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + 3;
      });
    }, 300);

    // 模拟API调用
    setTimeout(() => {
      clearInterval(progressInterval);
      setRenderProgress(100);

      const updatedProject: Project = {
        ...project,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      };

      setProject(updatedProject);
      saveProject(updatedProject);
      setIsRendering(false);
      toast.success('视频渲染完成！');
    }, 5000);
  };

  const handleToggleSelect = (segmentId: string) => {
    if (!project) return;
    
    const updatedSegments = project.segments.map((seg) =>
      seg.id === segmentId ? { ...seg, selected: !seg.selected } : seg
    );

    const updatedProject = { ...project, segments: updatedSegments };
    setProject(updatedProject);
    saveProject(updatedProject);
  };

  const handlePreviewSegment = (segment: Segment) => {
    if (videoRef.current) {
      videoRef.current.currentTime = segment.startTime;
      videoRef.current.play();
      
      // 在结束时间停止
      const stopAtEnd = () => {
        if (videoRef.current && videoRef.current.currentTime >= segment.endTime) {
          videoRef.current.pause();
          videoRef.current.removeEventListener('timeupdate', stopAtEnd);
        }
      };
      videoRef.current.addEventListener('timeupdate', stopAtEnd);
    }
  };

  const handleEditSegment = (segment: Segment) => {
    setEditingSegment(segment);
    setIsEditDialogOpen(true);
  };

  const handleSaveSegment = (updatedSegment: Segment) => {
    if (!project) return;

    const updatedSegments = project.segments.map((seg) =>
      seg.id === updatedSegment.id ? updatedSegment : seg
    );

    const updatedProject = { ...project, segments: updatedSegments };
    setProject(updatedProject);
    saveProject(updatedProject);
    toast.success('片段已更新');
  };

  const selectedCount = project?.segments.filter((s) => s.selected).length || 0;
  const totalDuration = project?.segments
    .filter((s) => s.selected)
    .reduce((sum, s) => sum + s.duration, 0) || 0;

  if (!project) return null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onNavigateToHome}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{project.name}</h1>
              <p className="text-sm text-muted-foreground">
                {project.status === 'draft' && '草稿'}
                {project.status === 'parsed' && '已解析'}
                {project.status === 'rendering' && '渲染中'}
                {project.status === 'completed' && '已完成'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onSettingsOpen}>
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* 主要内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧 - 操作控制区 */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">操作</h2>

            {/* 上传视频 */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                className="w-full"
                variant={project.videoUrl ? 'outline' : 'default'}
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {project.videoUrl ? '重新上传' : '上传视频'}
                  </>
                )}
              </Button>
              {project.videoUrl && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  视频已上传
                </p>
              )}
            </div>

            {/* 开始解析 */}
            <div>
              <Button
                className="w-full"
                onClick={handleParse}
                disabled={!project.videoUrl || isParsing || isRendering}
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    解析中...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    开始解析
                  </>
                )}
              </Button>
              {isParsing && (
                <div className="mt-2">
                  <Progress value={parseProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {parseProgress}%
                  </p>
                </div>
              )}
            </div>

            {/* 开始渲染 */}
            <div>
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                onClick={handleRender}
                disabled={
                  !project.segments.length || isParsing || isRendering
                }
              >
                {isRendering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    渲染中...
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4 mr-2" />
                    开始渲染
                  </>
                )}
              </Button>
              {isRendering && (
                <div className="mt-2">
                  <Progress value={renderProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {renderProgress}%
                  </p>
                </div>
              )}
            </div>

            {/* 统计信息 */}
            {project.segments.length > 0 && (
              <Card className="p-4 bg-indigo-50 border-indigo-100">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">总片段:</span>
                    <span className="font-medium">{project.segments.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">已选择:</span>
                    <span className="font-medium text-indigo-600">
                      {selectedCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">输出时长:</span>
                    <span className="font-medium">
                      {formatDuration(totalDuration)}
                    </span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* 中间 - 视频预览区 */}
        <div className="flex-1 flex items-center justify-center bg-gray-900 p-8">
          {project.videoUrl ? (
            <video
              ref={videoRef}
              src={project.videoUrl}
              controls
              className="max-w-full max-h-full rounded-lg shadow-2xl"
            />
          ) : (
            <div className="text-center text-gray-400">
              <Upload className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">请上传视频文件</p>
            </div>
          )}
        </div>

        {/* 右侧 - 片段列表 */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">片段列表</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {project.segments.length > 0
                ? `共 ${project.segments.length} 个片段`
                : '暂无片段'}
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {project.segments.length > 0 ? (
                project.segments.map((segment) => (
                  <SegmentItem
                    key={segment.id}
                    segment={segment}
                    onToggleSelect={handleToggleSelect}
                    onPreview={handlePreviewSegment}
                    onEdit={handleEditSegment}
                  />
                ))
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Film className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">还没有片段</p>
                  <p className="text-xs mt-1">上传并解析视频后会显示</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 编辑片段弹窗 */}
      <SegmentEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        segment={editingSegment}
        onSave={handleSaveSegment}
      />
    </div>
  );
}
