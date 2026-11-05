# Tectonic Control Plane

**Governed Autonomous Execution Control Plane with Just-In-Time (JIT) Agent Creation**

## Overview

The Tectonic Control Plane implements a governed autonomous execution system designed for tightly regulated environments. It features:

- **JIT Agent Creation**: Agents are not pre-defined; they are dynamically compiled at runtime based on task requirements
- **Mission Contracts**: The primary governed object that supersedes individual agents
- **Continuous Authorization**: Runtime policy enforcement for every consequential action
- **Evidence Fabric**: Universal telemetry with immutable event logging
- **Trust Registry**: Capability governance with risk tiering

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TECTONIC CONTROL PLANE                       │
├─────────────────────────────────────────────────────────────────┤
│  User Intent → Mission Contract → Mission Planner               │
│       ↓                                                         │
│  Dynamic Agent Compiler → JIT Agents (Ephemeral)               │
│       ↓                                                         │
│  Execution Graph Runner → Task Execution                        │
│       ↓                                                         │
│  Independent Assurance Node → Validation                        │
│       ↓                                                         │
│  Evidence Pack → Results/Artifacts                              │
│       ↓                                                         │
│  Agent Termination (credentials revoked)                        │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow Modes

### 1. Dynamic Workflow (Default)
Intent-driven execution following this lifecycle:
1. User Intent → Mission Contract
2. Mission Planner (AI) → Execution Graph
3. Agent Compiler → JIT Agents
4. Execution Runner → Results
5. Agent Termination

### 2. Static Workflow
Pre-defined sequential execution path (Agent A → Agent B → Agent C)

## Quick Start

```bash
cd modules/control-plane
pip install -e ".[dev]"
python run.py
```

Open http://localhost:8080 for the real-time dashboard.

## API Endpoints

- `POST /api/v1/missions` - Create and execute a mission
- `GET /api/v1/missions/{id}` - Get mission status
- `POST /api/v1/missions/{id}/kill` - Activate kill switch
- `GET /api/v1/capabilities` - List trust registry capabilities
- `GET /api/v1/evidence/{id}` - Get evidence pack
- `WS /ws` - WebSocket for real-time events

## Core Components

### Domain Models
- **MissionContract**: Objective, risk classification, authority, budget, oversight
- **TrustRegistry**: Capability definitions with risk tiers
- **EvidenceFabric**: Immutable event log
- **AgentBillOfMaterials**: Forensic data for each spawned agent
- **ExecutionGraph**: Task dependency graph

### Engine
- **MissionPlanner**: AI-powered planning using Gemini
- **RiskEngine**: Continuous authorization middleware
- **AgentCompiler**: JIT agent factory
- **ExecutionRunner**: Graph execution engine
- **AssuranceNode**: Independent output validation

## Safety Features

- Kill switch for immediate mission termination
- Budget limits (tokens, API calls, cost)
- Rate limiting per capability
- Agent quarantine capability
- Credential revocation on termination
- Risk-based authorization
