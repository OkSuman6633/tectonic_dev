import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

import Header from './components/Header';
import DepartmentCanvas from './components/DepartmentCanvas';
import TaskSidebar from './components/TaskSidebar';
import TaskModal from './components/TaskModal';
import FinalOutputModal from './components/FinalOutputModal';
import useWebSocket from './hooks/useWebSocket';
import useMissionStore from './store/missionStore';

export default function App() {
  useWebSocket();
  const { darkMode } = useMissionStore();

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark bg-dark-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Main Canvas - Agent Flow */}
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex-1 flex flex-col overflow-hidden relative"
        >
          <DepartmentCanvas />
        </motion.main>

        {/* Right Sidebar - Task Status */}
        <TaskSidebar />
      </div>

      {/* Modals */}
      <TaskModal />
      <FinalOutputModal />
    </div>
  );
}
