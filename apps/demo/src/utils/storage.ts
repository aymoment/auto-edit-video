import { Project, Settings, defaultSettings } from '@/types';

const PROJECTS_KEY = 'video-editor-projects';
const SETTINGS_KEY = 'video-editor-settings';

// 获取所有项目
export const getProjects = (): Project[] => {
  try {
    const data = localStorage.getItem(PROJECTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
};

// 保存项目
export const saveProject = (project: Project): void => {
  try {
    const projects = getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    
    if (index >= 0) {
      projects[index] = project;
    } else {
      projects.unshift(project);
    }
    
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Failed to save project:', error);
  }
};

// 删除项目
export const deleteProject = (projectId: string): void => {
  try {
    const projects = getProjects().filter(p => p.id !== projectId);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch (error) {
    console.error('Failed to delete project:', error);
  }
};

// 获取单个项目
export const getProject = (projectId: string): Project | null => {
  const projects = getProjects();
  return projects.find(p => p.id === projectId) || null;
};

// 获取设置
export const getSettings = (): Settings => {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? { ...defaultSettings, ...JSON.parse(data) } : defaultSettings;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return defaultSettings;
  }
};

// 保存设置
export const saveSettings = (settings: Settings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};
