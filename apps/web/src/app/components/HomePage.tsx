import { useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Settings as SettingsIcon, Plus, Video } from "lucide-react";
import { HistoryCard } from "@/app/components/HistoryCard";
import { Project } from "@/types";
import { deleteProject, getProjects, updateProjectTitle } from "@/utils/storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { toast } from "sonner";

interface HomePageProps {
  onNavigateToEditor: (projectId?: string) => void;
  onSettingsOpen: () => void;
}

type EditState = {
  open: boolean;
  project: Project | null;
  title: string;
};

export function HomePage({ onNavigateToEditor, onSettingsOpen }: HomePageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [editState, setEditState] = useState<EditState>({
    open: false,
    project: null,
    title: ""
  });

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载失败";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      await loadProjects();
      toast.success("项目已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      toast.error(message);
    }
  };

  const handleOpenProject = (project: Project) => {
    onNavigateToEditor(project.id);
  };

  const openEditDialog = (project: Project) => {
    setEditState({ open: true, project, title: project.title });
  };

  const handleSaveTitle = async () => {
    if (!editState.project) return;
    const title = editState.title.trim();
    if (!title) {
      toast.error("请输入项目名称");
      return;
    }
    try {
      const updated = await updateProjectTitle(editState.project.id, title);
      setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditState({ open: false, project: null, title: "" });
      toast.success("项目已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新失败";
      toast.error(message);
    }
  };

  const countLabel = useMemo(() => {
    if (loading) return "加载中...";
    return `共 ${projects.length} 个项目`;
  }, [loading, projects.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-900">口播自动剪辑</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={onSettingsOpen}>
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-lg">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold mb-2">开始新的剪辑</h2>
              <p className="text-indigo-100 mb-6">
                上传您的口播视频,自动识别静音和重复片段,一键生成精简版本
              </p>
              <Button
                size="lg"
                className="bg-white text-indigo-600 hover:bg-indigo-50"
                onClick={() => onNavigateToEditor()}
              >
                <Plus className="h-5 w-5 mr-2" />
                创建新项目
              </Button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">历史记录</h2>
              <span className="text-sm text-muted-foreground">{countLabel}</span>
            </div>

            {projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <HistoryCard
                    key={project.id}
                    project={project}
                    onOpen={handleOpenProject}
                    onDelete={handleDeleteProject}
                    onEdit={openEditDialog}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-lg border-2 border-dashed border-gray-200">
                <Video className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 mb-2">还没有任何项目</p>
                <p className="text-sm text-muted-foreground">
                  点击上方按钮开始创建您的第一个项目
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog
        open={editState.open}
        onOpenChange={(open) =>
          setEditState((prev) => ({ ...prev, open, project: open ? prev.project : null }))
        }
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>修改项目名称</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              value={editState.title}
              onChange={(event) =>
                setEditState((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="请输入项目名称"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditState({ open: false, project: null, title: "" })}>
              取消
            </Button>
            <Button onClick={handleSaveTitle}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
