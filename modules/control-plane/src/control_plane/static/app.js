// Tectonic Control Plane - Enhanced Frontend
// With animated flow visualization and real-time thinking display

lucide.createIcons();

let ws = null;
let currentMissionId = null;
let taskOutputs = {};
let taskGraph = null;
let nodePositions = {};
let completedTasks = 0;
let totalTasks = 0;

// Connect WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        addEvent('system', 'Connected to Control Plane', 'info');
        checkMockMode();
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleEvent(data);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 2000);
    };
}

// Event handler
function handleEvent(event) {
    console.log('Event:', event);
    
    switch(event.type) {
        case 'mission_created':
            currentMissionId = event.mission.id;
            taskOutputs = {};
            completedTasks = 0;
            showStatus('Mission created', 'yellow', event.mission.objective);
            addEvent('mission', `Mission: ${event.mission.objective.substring(0, 40)}...`, 'info');
            document.getElementById('kill-btn').classList.remove('hidden');
            document.getElementById('download-btn').classList.add('hidden');
            document.getElementById('results-panel').classList.add('hidden');
            document.getElementById('budget-card').classList.remove('hidden');
            clearThinking();
            break;
            
        case 'mission_planning':
            showStatus('AI Planning...', 'yellow', 'Analyzing objective and creating task graph');
            addEvent('planning', 'AI analyzing objective', 'info');
            addThinking('system', 'thinking', '🧠 Analyzing mission objective and planning execution strategy...');
            break;
            
        case 'plan_created':
            taskGraph = event.graph;
            totalTasks = event.graph.tasks.length;
            showStatus('Plan ready', 'blue', `${totalTasks} tasks planned`);
            renderGraph(event.graph);
            addEvent('planning', `Plan created: ${totalTasks} tasks`, 'success');
            document.getElementById('task-count').textContent = `0 / ${totalTasks} completed`;
            break;
            
        case 'mission_started':
            showStatus('Executing...', 'blue', 'Running task pipeline');
            addEvent('execution', 'Mission execution started', 'info');
            break;
            
        case 'task_started':
            showStatus(`Running: ${event.name}`, 'blue', event.task_id);
            updateTaskStatus(event.task_id, 'running');
            addEvent('task', `Started: ${event.name}`, 'info');
            addThinking(event.task_id, 'thinking', `⚡ Starting task: ${event.name}`);
            animateFlowTo(event.task_id);
            break;
            
        case 'agent_compiled':
            addEvent('agent', `Agent compiled for ${event.task_id.substring(0,8)}`, 'info');
            break;
            
        case 'task_completed':
            completedTasks++;
            updateTaskStatus(event.task_id, event.status);
            taskOutputs[event.task_id] = {
                status: event.status,
                output: event.output || '',
                thinking: event.thinking || '',
                execution: event.execution || ''
            };
            
            document.getElementById('task-count').textContent = `${completedTasks} / ${totalTasks} completed`;
            
            if (event.thinking) {
                addThinking(event.task_id, 'thinking', event.thinking);
            }
            if (event.execution) {
                addThinking(event.task_id, 'execution', event.execution);
            }
            if (event.output) {
                addThinking(event.task_id, 'output', event.output.substring(0, 300) + (event.output.length > 300 ? '...' : ''));
            }
            
            addEvent('task', `${event.status === 'completed' ? '✓' : '✗'} ${event.task_id.substring(0,8)}`, 
                event.status === 'completed' ? 'success' : 'error');
            
            animateTaskComplete(event.task_id, event.status);
            break;
            
        case 'mission_completed':
            const isSuccess = event.status === 'completed';
            showStatus(isSuccess ? 'Mission Complete!' : 'Mission Failed', isSuccess ? 'green' : 'red');
            addEvent('mission', `Mission ${event.status}`, isSuccess ? 'success' : 'error');
            document.getElementById('submit-btn').disabled = false;
            document.getElementById('submit-btn').innerHTML = '<i data-lucide="rocket" class="w-4 h-4"></i>Launch Mission';
            lucide.createIcons();
            
            if (isSuccess) {
                document.getElementById('download-btn').classList.remove('hidden');
                showResultsPanel();
            }
            document.getElementById('kill-btn').classList.add('hidden');
            
            if (event.budget) {
                updateBudget(event.budget);
            }
            break;
    }
}

// Status display
function showStatus(text, color, detail = '') {
    const card = document.getElementById('status-card');
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const statusDetail = document.getElementById('status-detail');
    
    card.classList.remove('hidden');
    statusText.textContent = text;
    statusDetail.textContent = detail;
    
    indicator.className = 'w-3 h-3 rounded-full';
    const colors = { yellow: 'bg-yellow-500', blue: 'bg-blue-500', green: 'bg-green-500', red: 'bg-red-500' };
    indicator.classList.add(colors[color] || 'bg-gray-500');
    
    if (color === 'blue' || color === 'yellow') {
        indicator.classList.add('pulse-ring');
    }
}

// Budget display
function updateBudget(budget) {
    if (budget.tokens !== undefined) {
        document.getElementById('tokens-used').textContent = `${budget.tokens.toLocaleString()} / ${budget.max_tokens?.toLocaleString() || '∞'}`;
    }
    if (budget.api_calls !== undefined) {
        document.getElementById('calls-used').textContent = `${budget.api_calls} / ${budget.max_api_calls || '∞'}`;
    }
}

// Evidence log
function addEvent(type, message, level = 'info') {
    const events = document.getElementById('events');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const item = document.createElement('div');
    item.className = `evidence-item ${level} fade-slide-in`;
    item.innerHTML = `
        <span class="time">${time}</span>
        <span class="type">${type.toUpperCase()}</span>
        <span class="msg">${escapeHtml(message)}</span>
    `;
    
    events.insertBefore(item, events.firstChild);
    if (events.children.length > 50) events.removeChild(events.lastChild);
}

// Thinking stream
function clearThinking() {
    const stream = document.getElementById('thinking-stream');
    stream.innerHTML = '';
    document.getElementById('thinking-empty')?.remove();
}

function addThinking(taskId, type, content) {
    document.getElementById('thinking-empty')?.remove();
    
    const stream = document.getElementById('thinking-stream');
    const item = document.createElement('div');
    item.className = `thinking-item ${type}`;
    
    const taskLabel = taskId === 'system' ? 'SYSTEM' : taskId.substring(0, 12);
    const icon = type === 'thinking' ? '💭' : type === 'execution' ? '⚡' : '✅';
    
    item.innerHTML = `
        <div class="task-label">${icon} ${taskLabel}</div>
        <div class="content">${escapeHtml(content)}</div>
    `;
    
    stream.appendChild(item);
    stream.scrollTop = stream.scrollHeight;
    
    document.getElementById('thinking-status').textContent = type === 'thinking' ? 'Reasoning...' : type === 'execution' ? 'Executing...' : 'Complete';
}

// Graph rendering with SVG connections
function renderGraph(graph) {
    document.getElementById('empty-state').classList.add('hidden');
    const nodesContainer = document.getElementById('graph-nodes');
    const svg = document.getElementById('graph-svg');
    
    nodesContainer.innerHTML = '';
    svg.innerHTML = '';
    nodePositions = {};
    
    // Calculate layout
    const tasks = graph.tasks;
    const levels = {};
    const taskMap = {};
    tasks.forEach(t => { taskMap[t.id] = t; levels[t.id] = 0; });
    
    // Calculate depth levels based on dependencies
    let changed = true;
    while (changed) {
        changed = false;
        for (const t of tasks) {
            for (const dep of (t.dependencies || [])) {
                if (levels[t.id] <= levels[dep]) {
                    levels[t.id] = levels[dep] + 1;
                    changed = true;
                }
            }
        }
    }
    
    // Group by level
    const byLevel = {};
    for (const t of tasks) {
        const lvl = levels[t.id];
        if (!byLevel[lvl]) byLevel[lvl] = [];
        byLevel[lvl].push(t);
    }
    
    const maxLevel = Math.max(...Object.keys(byLevel).map(Number));
    const containerWidth = nodesContainer.offsetWidth || 600;
    const nodeWidth = 200;
    const nodeHeight = 80;
    const levelGap = 120;
    const nodeGap = 20;
    
    // Create nodes
    for (const [level, levelTasks] of Object.entries(byLevel)) {
        const lvl = parseInt(level);
        const y = 40 + lvl * levelGap;
        const totalWidth = levelTasks.length * nodeWidth + (levelTasks.length - 1) * nodeGap;
        const startX = (containerWidth - totalWidth) / 2;
        
        levelTasks.forEach((task, i) => {
            const x = startX + i * (nodeWidth + nodeGap);
            nodePositions[task.id] = { x: x + nodeWidth/2, y: y + nodeHeight/2, w: nodeWidth, h: nodeHeight };
            
            const node = document.createElement('div');
            node.id = `task-${task.id}`;
            node.className = 'task-node glass absolute p-4 flex flex-col';
            node.style.cssText = `left:${x}px;top:${y}px;width:${nodeWidth}px;min-height:${nodeHeight}px;`;
            node.onclick = () => showTaskDetails(task.id);
            
            const riskColors = { low: 'green', moderate: 'yellow', high: 'orange', critical: 'red' };
            const riskColor = riskColors[task.risk_level] || 'gray';
            
            node.innerHTML = `
                <div class="flex items-start justify-between gap-2 mb-2">
                    <span class="text-xs font-bold text-gray-400">${task.id}</span>
                    <span class="w-2 h-2 rounded-full bg-${riskColor}-500 flex-shrink-0 mt-1"></span>
                </div>
                <div class="text-sm font-medium leading-tight flex-1">${escapeHtml(task.name)}</div>
                <div class="status-badge mt-2 text-xs text-gray-500">Pending</div>
            `;
            
            nodesContainer.appendChild(node);
        });
    }
    
    // Draw connections after a short delay to ensure positions are correct
    setTimeout(() => drawConnections(tasks), 50);
}

function drawConnections(tasks) {
    const svg = document.getElementById('graph-svg');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Gradient for lines
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.id = 'flowGradient';
    gradient.innerHTML = `<stop offset="0%" stop-color="#9333ea" stop-opacity="0.6"/>
                          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.6"/>`;
    defs.appendChild(gradient);
    
    // Arrow marker
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.id = 'arrowhead';
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    marker.innerHTML = `<polygon points="0 0, 10 3.5, 0 7" fill="rgba(147,51,234,0.6)"/>`;
    defs.appendChild(marker);
    
    svg.appendChild(defs);
    
    // Draw lines
    for (const task of tasks) {
        const to = nodePositions[task.id];
        if (!to) continue;
        
        for (const dep of (task.dependencies || [])) {
            const from = nodePositions[dep];
            if (!from) continue;
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const midY = (from.y + to.y) / 2;
            const d = `M${from.x},${from.y + from.h/2} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y - to.h/2 - 10}`;
            
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'url(#flowGradient)');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('marker-end', 'url(#arrowhead)');
            path.id = `line-${dep}-${task.id}`;
            
            svg.appendChild(path);
        }
    }
}

// Task status updates with animations
function updateTaskStatus(taskId, status) {
    const node = document.getElementById(`task-${taskId}`);
    if (!node) return;
    
    node.classList.remove('running', 'completed', 'failed');
    
    const badge = node.querySelector('.status-badge');
    
    if (status === 'running') {
        node.classList.add('running', 'node-active');
        if (badge) {
            badge.textContent = '⚡ Running...';
            badge.className = 'status-badge mt-2 text-xs text-blue-400';
        }
    } else if (status === 'completed') {
        node.classList.add('completed', 'node-complete-anim');
        if (badge) {
            badge.textContent = '✓ Complete';
            badge.className = 'status-badge mt-2 text-xs text-green-400';
        }
    } else {
        node.classList.add('failed');
        if (badge) {
            badge.textContent = '✗ Failed';
            badge.className = 'status-badge mt-2 text-xs text-red-400';
        }
    }
}

// Animate flow pulse traveling to a task
function animateFlowTo(taskId) {
    const svg = document.getElementById('graph-svg');
    const pos = nodePositions[taskId];
    if (!pos) return;
    
    // Find incoming paths
    const paths = svg.querySelectorAll(`path[id$="-${taskId}"]`);
    
    paths.forEach(path => {
        // Animate the path
        path.classList.add('flow-line');
        
        // Create traveling pulse
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pulse.setAttribute('r', '6');
        pulse.setAttribute('fill', '#9333ea');
        pulse.style.filter = 'drop-shadow(0 0 8px #9333ea)';
        
        const pathD = path.getAttribute('d');
        pulse.style.offsetPath = `path('${pathD}')`;
        pulse.classList.add('travel-pulse');
        
        svg.appendChild(pulse);
        
        // Remove pulse after animation
        setTimeout(() => {
            pulse.remove();
            path.classList.remove('flow-line');
        }, 1200);
    });
}

// Animate task completion
function animateTaskComplete(taskId, status) {
    const node = document.getElementById(`task-${taskId}`);
    if (!node) return;
    
    // Brief highlight effect
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 rounded-xl pointer-events-none';
    overlay.style.background = status === 'completed' 
        ? 'radial-gradient(circle, rgba(34,197,94,0.3) 0%, transparent 70%)'
        : 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)';
    overlay.style.animation = 'pulse-ring 0.6s ease-out forwards';
    
    node.style.position = 'relative';
    node.appendChild(overlay);
    
    setTimeout(() => overlay.remove(), 600);
}

// Task details modal
function showTaskDetails(taskId) {
    const data = taskOutputs[taskId] || {};
    const task = taskGraph?.tasks?.find(t => t.id === taskId);
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    
    let content = `<div class="glass-strong rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-auto p-6">
        <div class="flex justify-between items-start mb-6">
            <div>
                <h3 class="text-xl font-bold mb-1">${task?.name || taskId}</h3>
                <span class="text-xs text-gray-400">${taskId}</span>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>`;
    
    if (task?.description) {
        content += `<div class="mb-4 text-sm text-gray-300">${escapeHtml(task.description)}</div>`;
    }
    
    if (data.thinking) {
        content += `<div class="mb-4">
            <h4 class="text-purple-400 font-semibold mb-2 text-sm flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-purple-500"></span>THINKING
            </h4>
            <div class="bg-purple-900/20 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-40 overflow-auto">${escapeHtml(data.thinking)}</div>
        </div>`;
    }
    
    if (data.execution) {
        content += `<div class="mb-4">
            <h4 class="text-blue-400 font-semibold mb-2 text-sm flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-blue-500"></span>EXECUTION
            </h4>
            <div class="bg-blue-900/20 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-40 overflow-auto">${escapeHtml(data.execution)}</div>
        </div>`;
    }
    
    content += `<div>
        <h4 class="text-green-400 font-semibold mb-2 text-sm flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>OUTPUT
        </h4>
        <div class="bg-green-900/20 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap max-h-60 overflow-auto">${escapeHtml(data.output || 'No output yet')}</div>
    </div></div>`;
    
    modal.innerHTML = content;
    document.body.appendChild(modal);
}

// Results panel
async function showResultsPanel() {
    const panel = document.getElementById('results-panel');
    const content = document.getElementById('results-content');
    panel.classList.remove('hidden');
    
    try {
        const res = await fetch(`/api/v1/missions/${currentMissionId}/report`);
        const report = await res.json();
        
        let html = '<div class="space-y-2">';
        for (const task of (report.tasks || []).slice(-3)) {
            if (task.output) {
                html += `<div class="bg-white/5 rounded-lg p-3">
                    <div class="text-xs font-semibold text-gray-400 mb-1">${escapeHtml(task.name)}</div>
                    <div class="text-sm text-gray-300">${escapeHtml(task.output.substring(0, 150))}${task.output.length > 150 ? '...' : ''}</div>
                </div>`;
            }
        }
        html += '</div>';
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = `<div class="text-red-400 text-sm">Failed to load results</div>`;
    }
}

// Download report
function downloadReport() {
    if (currentMissionId) {
        window.open(`/api/v1/missions/${currentMissionId}/download`, '_blank');
    }
}

// Utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Check mock mode
async function checkMockMode() {
    try {
        const res = await fetch('/health');
        const data = await res.json();
        const banner = document.getElementById('mode-banner');
        const icon = document.getElementById('mode-icon');
        const text = document.getElementById('mode-text');
        
        if (data.mock_mode) {
            banner.className = 'mode-banner mock';
            icon.textContent = '🔶';
            text.textContent = 'MOCK MODE — Using simulated responses';
        } else {
            banner.className = 'mode-banner live';
            icon.textContent = '🟢';
            text.textContent = `LIVE MODE — ${data.model || 'AI Model'}`;
        }
    } catch (e) {
        console.error('Failed to check mode:', e);
    }
}

// Form submission
document.getElementById('mission-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="shimmer w-full h-full absolute inset-0"></span>Launching...';
    
    const payload = {
        objective: document.getElementById('objective').value,
        risk_classification: document.getElementById('risk').value,
        workflow_mode: document.getElementById('mode').value,
        max_tokens: parseInt(document.getElementById('max-tokens').value),
        max_api_calls: parseInt(document.getElementById('max-calls').value)
    };
    
    try {
        const res = await fetch('/api/v1/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error('Failed to create mission');
        
        // Clear thinking stream
        document.getElementById('thinking-stream').innerHTML = '';
        
    } catch (error) {
        alert('Error: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="rocket" class="w-4 h-4"></i>Launch Mission';
        lucide.createIcons();
    }
});

// Initialize
connectWebSocket();
