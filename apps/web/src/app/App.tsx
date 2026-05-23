import { useEffect, useState } from "react";
import { HomePage } from "@/app/components/HomePage";
import { EditorPage } from "@/app/components/EditorPage";
import { SettingsDialog } from "@/app/components/SettingsDialog";
import { Settings, defaultSettings } from "@/types";
import { getSettings, saveSettings } from "@/utils/storage";
import { Toaster } from "@/app/components/ui/sonner";

type Page = "home" | "editor";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  useEffect(() => {
    let mounted = true;
    getSettings()
      .then((data) => {
        if (mounted) setSettings(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const navigateToEditor = (projectId?: string) => {
    setCurrentProjectId(projectId);
    setCurrentPage("editor");
  };

  const navigateToHome = () => {
    setCurrentProjectId(undefined);
    setCurrentPage("home");
  };

  const handleSettingsChange = async (next: Settings) => {
    const saved = await saveSettings(next);
    setSettings(saved);
    return saved;
  };

  return (
    <>
      {currentPage === "home" ? (
        <HomePage
          onNavigateToEditor={navigateToEditor}
          onSettingsOpen={() => setSettingsOpen(true)}
        />
      ) : (
        <EditorPage
          projectId={currentProjectId}
          onNavigateToHome={navigateToHome}
          onSettingsOpen={() => setSettingsOpen(true)}
          settings={settings}
          onSettingsChange={handleSettingsChange}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      <Toaster position="top-center" />
    </>
  );
}
