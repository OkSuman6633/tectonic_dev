# Tectonic Control Plane - Premium Frontend

A premium React-based frontend for the Tectonic Governed Autonomous Execution Control Plane.

## Features

### 1. 3D Agent Execution Visualization
- Interactive React Flow-based graph with custom nodes
- Central "Brain" node representing Mission Control
- Animated edges with traveling particles during execution
- Glassmorphic design with premium glowing effects
- Pan, zoom, and minimap controls

### 2. Word Document Export
- Professional .docx report generation using docx library
- Title page with mission details
- Executive summary
- Detailed task execution breakdown
- Budget utilization metrics
- Headers, footers, and page numbers

### 3. Semantic Task Naming
- Tasks display actual descriptive names from the Mission Planner
- E.g., "Regulatory Risk Assessment" instead of "Task 1"
- Names shown in graph nodes, thinking stream, and exported reports

### 4. Premium Animations & Theming
- Framer Motion animations throughout
- Markdown rendering with react-markdown and remark-gfm
- Full Light/Dark mode support
- Responsive three-panel layout

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **@xyflow/react** - Graph visualization
- **Framer Motion** - Animations
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **react-markdown** - Markdown rendering
- **docx** - Word document generation

## Development

```bash
# Install dependencies
npm install

# Start development server (proxies API to localhost:8080)
npm run dev

# Build for production
npm run build
```

## Production Build

The build outputs to `../static/app/` which is served by the FastAPI backend:
- Visit `http://localhost:8080/` for the React app
- Visit `http://localhost:8080/legacy` for the legacy vanilla JS UI

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── AgentNode.jsx      # Task node visualization
│   │   ├── AnimatedEdge.jsx   # Animated graph edges
│   │   ├── BrainNode.jsx      # Central brain node
│   │   ├── EvidenceLog.jsx    # Event log panel
│   │   ├── ExecutionGraph.jsx # Main graph canvas
│   │   ├── Header.jsx         # Top navigation bar
│   │   ├── MissionForm.jsx    # Mission creation form
│   │   ├── StatusCard.jsx     # Mission status display
│   │   ├── TaskModal.jsx      # Task detail modal
│   │   └── ThinkingStream.jsx # Agent thinking display
│   ├── hooks/
│   │   └── useWebSocket.js    # WebSocket connection hook
│   ├── store/
│   │   └── missionStore.js    # Zustand state store
│   ├── utils/
│   │   └── exportDocx.js      # Word export utility
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.js
```
