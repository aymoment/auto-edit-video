import { useState, useEffect } from 'react';
import { Button } from '@/app/components/ui/button';
import { Settings as SettingsIcon, Plus, Video } from 'lucide-react';
import { HistoryCard } from '@/app/components/HistoryCard';
import { SettingsDialog } from '@/app/components/SettingsDialog';
import { Project, Settings, defaultSettings } from '@/types';
import { getProjects, deleteProject, getSettings } from '@/utils/storage';

interface HomePageProps {
  onNavigateToEditor: (projectId?: string) => void;
  onSettingsOpen: () => void;
}

export function HomePage({ onNavigateToEditor, onSettingsOpen }: HomePageProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = () => {
    setProjects(getProjects());
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProject(projectId);
    loadProjects();
  };

  const handleOpenProject = (project: Project) => {
    onNavigateToEditor(project.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* 顶部栏 */}
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

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="space-y-8">
          {/* 新建项目卡片 */}
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

          {/* 历史记录 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">历史记录</h2>
              <span className="text-sm text-muted-foreground">
                共 {projects.length} 个项目
              </span>
            </div>

            {projects.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((project) => (
                  <HistoryCard
                    key={project.id}
                    project={project}
                    onOpen={handleOpenProject}
                    onDelete={handleDeleteProject}
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
    </div>
  );
}
