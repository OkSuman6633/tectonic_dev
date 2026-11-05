import { create } from 'zustand';

const useMissionStore = create((set, get) => ({
  // Connection state
  connected: false,
  mockMode: null,
  modelName: null,
  
  // Theme
  darkMode: true,
  
  // Current mission
  currentMissionId: null,
  missionStatus: null,
  missionObjective: null,
  
  // Task graph
  graph: null,
  tasks: [],
  completedCount: 0,
  
  // Task outputs and thinking
  taskOutputs: {},
  thinkingStream: [],
  
  // Budget tracking
  budget: {
    tokensUsed: 0,
    maxTokens: 50000,
    apiCallsUsed: 0,
    maxApiCalls: 20,
  },
  
  // Evidence log
  evidenceLog: [],
  
  // UI state
  selectedTask: null,
  showTaskModal: false,
  showReport: false,
  showFinalOutput: false,
  isExecuting: false,
  
  // Actions
  setConnected: (connected) => set({ connected }),
  
  setMockMode: (mockMode, modelName) => set({ mockMode, modelName }),
  
  toggleDarkMode: () => {
    const newDarkMode = !get().darkMode;
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ darkMode: newDarkMode });
  },
  
  startMission: (missionId, objective) => set({
    currentMissionId: missionId,
    missionObjective: objective,
    missionStatus: 'planning',
    tasks: [],
    taskOutputs: {},
    thinkingStream: [],
    evidenceLog: [],
    completedCount: 0,
    isExecuting: true,
  }),
  
  setGraph: (graph) => {
    const tasks = graph?.tasks || [];
    set({ graph, tasks });
  },
  
  updateTaskStatus: (taskId, status, outputData) => {
    const { tasks, taskOutputs, completedCount } = get();
    const updatedTasks = tasks.map(task => 
      task.id === taskId ? { ...task, status, output_data: outputData || task.output_data } : task
    );
    const newOutputs = outputData ? { ...taskOutputs, [taskId]: outputData } : taskOutputs;
    const newCompleted = status === 'completed' ? completedCount + 1 : completedCount;
    set({ 
      tasks: updatedTasks, 
      taskOutputs: newOutputs, 
      completedCount: newCompleted 
    });
  },
  
  addThinking: (taskId, type, content, taskName = null) => {
    const { thinkingStream, tasks } = get();
    // Use provided taskName, or look up from tasks, or use taskId
    const resolvedTaskName = taskName || tasks.find(t => t.id === taskId)?.name || taskId;
    set({
      thinkingStream: [...thinkingStream, {
        id: Date.now() + Math.random(), // Ensure unique IDs for rapid updates
        taskId,
        taskName: resolvedTaskName,
        type,
        content,
        timestamp: new Date(),
      }]
    });
  },
  
  addEvidence: (type, message, level = 'info') => {
    const { evidenceLog } = get();
    set({
      evidenceLog: [...evidenceLog, {
        id: Date.now(),
        type,
        message,
        level,
        timestamp: new Date(),
      }]
    });
  },
  
  updateBudget: (tokensUsed, apiCallsUsed) => {
    const { budget } = get();
    set({
      budget: {
        ...budget,
        tokensUsed: budget.tokensUsed + (tokensUsed || 0),
        apiCallsUsed: budget.apiCallsUsed + (apiCallsUsed || 0),
      }
    });
  },
  
  setBudgetLimits: (maxTokens, maxApiCalls) => {
    const { budget } = get();
    set({
      budget: {
        ...budget,
        maxTokens: maxTokens || budget.maxTokens,
        maxApiCalls: maxApiCalls || budget.maxApiCalls,
      }
    });
  },
  
  completeMission: (status) => set({
    missionStatus: status,
    isExecuting: false,
  }),
  
  selectTask: (task) => set({ selectedTask: task, showTaskModal: true }),
  
  closeTaskModal: () => set({ selectedTask: null, showTaskModal: false }),
  
  setShowReport: (show) => set({ showReport: show }),
  
  setShowFinalOutput: (show) => set({ showFinalOutput: show }),
  
  reset: () => set({
    currentMissionId: null,
    missionStatus: null,
    missionObjective: null,
    graph: null,
    tasks: [],
    taskOutputs: {},
    thinkingStream: [],
    evidenceLog: [],
    completedCount: 0,
    selectedTask: null,
    showTaskModal: false,
    showReport: false,
    showFinalOutput: false,
    isExecuting: false,
    budget: {
      tokensUsed: 0,
      maxTokens: 50000,
      apiCallsUsed: 0,
      maxApiCalls: 20,
    },
  }),
}));

export default useMissionStore;
