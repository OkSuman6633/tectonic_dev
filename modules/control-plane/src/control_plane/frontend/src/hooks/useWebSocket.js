import { useEffect, useRef, useCallback } from 'react';
import useMissionStore from '../store/missionStore';

export default function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  
  const {
    setConnected,
    setMockMode,
    startMission,
    setGraph,
    updateTaskStatus,
    addThinking,
    addEvidence,
    updateBudget,
    completeMission,
  } = useMissionStore();
  
  const handleEvent = useCallback((event) => {
    console.log('WS Event:', event);
    
    switch (event.type) {
      case 'mission_created':
        startMission(event.mission.id, event.mission.objective);
        addEvidence('mission', `Mission created: ${event.mission.objective.substring(0, 50)}...`, 'info');
        break;
        
      case 'mission_planning':
        addThinking('system', 'thinking', '🧠 Analyzing mission objective and planning execution strategy...');
        addEvidence('planning', 'AI analyzing objective...', 'info');
        break;
        
      case 'plan_created':
        setGraph(event.graph);
        addEvidence('planning', `Plan created: ${event.graph?.tasks?.length || 0} tasks`, 'success');
        break;
        
      case 'mission_started':
        addEvidence('execution', 'Mission execution started', 'info');
        break;
        
      case 'task_started':
        updateTaskStatus(event.task_id, 'running');
        addThinking(event.task_id, 'thinking', `⚡ Starting task: ${event.name}`);
        addEvidence('task', `Started: ${event.name}`, 'info');
        break;
        
      case 'agent_compiled':
        addEvidence('agent', `Agent compiled for task`, 'info');
        break;
      
      case 'thinking_stream':
        // Real-time streaming of thinking/execution/output
        addThinking(event.task_id, event.chunk_type, event.content, event.task_name);
        break;
        
      case 'task_completed':
        // Store the full output data object with output, thinking, execution
        const outputData = {
          output: event.output || '',
          thinking: event.thinking || '',
          execution: event.execution || '',
          full_response: event.full_response || event.output || '',
        };
        updateTaskStatus(event.task_id, event.status, outputData);
        addEvidence('task', `Completed: ${event.name}`, 'success');
        if (event.tokens_used) {
          updateBudget(event.tokens_used, 1);
        }
        break;
        
      case 'task_failed':
        updateTaskStatus(event.task_id, 'failed');
        addThinking(event.task_id, 'error', `❌ Task failed: ${event.error || 'Unknown error'}`);
        addEvidence('task', `Failed: ${event.name}`, 'error');
        break;
        
      case 'mission_completed':
        completeMission('completed');
        addEvidence('mission', 'Mission completed successfully', 'success');
        break;
        
      case 'mission_failed':
        completeMission('failed');
        addEvidence('mission', `Mission failed: ${event.error || 'Unknown error'}`, 'error');
        break;
        
      case 'budget_update':
        updateBudget(event.tokens, event.api_calls);
        break;
        
      default:
        console.log('Unknown event type:', event.type);
    }
  }, [
    startMission, setGraph, updateTaskStatus, addThinking, 
    addEvidence, updateBudget, completeMission
  ]);
  
  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        addEvidence('system', 'Connected to Control Plane', 'info');
        
        // Check mock mode
        fetch('/health')
          .then(res => res.json())
          .then(data => {
            setMockMode(data.mock_mode, data.model || 'Unknown');
          })
          .catch(console.error);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleEvent(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    }
  }, [setConnected, setMockMode, handleEvent, addEvidence]);
  
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);
  
  return wsRef.current;
}
