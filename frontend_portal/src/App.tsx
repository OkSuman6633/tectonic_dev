import React, { useEffect } from 'react';
import { usePortalStore } from './store/usePortalStore';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { ChatArea } from './components/ChatArea';
import { ProjectsView } from './components/ProjectsView';
import { AgentRosterModal } from './components/AgentRosterModal';
import { AgentDetailsModal } from './components/AgentDetailsModal';
import { AuthModal } from './components/AuthModal';
import { TraceDrawer } from './components/TraceDrawer';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const { 
    activeNavTab,
    fetchAgents, 
    initAuth, 
    checkBackendStatus 
  } = usePortalStore();

  useEffect(() => {
    // Initial startup
    const init = async () => {
      await initAuth();
      await fetchAgents();
      await checkBackendStatus();
    };
    init();

    // Periodic synchronization with the shared backend (every 10 seconds)
    const interval = setInterval(() => {
      fetchAgents(true);
      checkBackendStatus();
    }, 10000);

    // Instant synchronization when returning to this browser tab from Tectonic Studio (:5173)
    const handleFocus = () => {
      fetchAgents(true);
      checkBackendStatus();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchAgents, initAuth, checkBackendStatus]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080b11] text-slate-100 font-sans antialiased select-none">
      {/* Tectonic Left Sidebar */}
      <Sidebar />

      {/* Main View Area: Projects View or Chats View */}
      {activeNavTab === 'projects' ? (
        <ProjectsView />
      ) : (
        <div className="flex flex-1 flex-col h-screen min-w-0 bg-[#0e131f] overflow-hidden">
          <ChatHeader />
          <ChatArea />
        </div>
      )}

      {/* Slide-out & Floating Modals */}
      <AgentRosterModal />
      <AgentDetailsModal />
      <AuthModal />
      <TraceDrawer />
      <SettingsModal />
    </div>
  );
};

export default App;
