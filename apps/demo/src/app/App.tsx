import { useState } from "react";
import { HomePage } from "@/app/components/HomePage";
import { EditorPage } from "@/app/components/EditorPage";
import { SettingsDialog } from "@/app/components/SettingsDialog";
import { Settings, defaultSettings } from "@/types";
import { getSettings } from "@/utils/storage";
import { Toaster } from "@/app/components/ui/sonner";

type Page = "home" | "editor";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [currentProjectId, setCurrentProjectId] = useState<
    string | undefined
  >();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] =
    useState<Settings>(getSettings());

  const navigateToEditor = (projectId?: string) => {
    setCurrentProjectId(projectId);
    setCurrentPage("editor");
  };

  const navigateToHome = () => {
    setCurrentProjectId(undefined);
    setCurrentPage("home");
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
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />

      <Toaster position="top-center" />
    </>
  );
}