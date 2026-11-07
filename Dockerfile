# ===== Stage 1: Build Frontend =====
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ===== Stage 2: Python Backend with Full Agent Builder =====
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including git for some packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt ./

# Install Python dependencies - full requirements for agent building
# Build version: 8 – fix API response shapes to match frontend TypeScript types
RUN pip install --no-cache-dir -r requirements.txt && \
    echo "=== Installed versions ===" && \
    pip show litellm | grep Version && \
    pip show anthropic | grep Version && \
    pip show mcp | grep Version

# Copy the full application code
COPY agent_builder/ ./agent_builder/
COPY server_full.py ./server.py

# Shared platform runtime: the Builder and every generated agent get guardrails, memory, RAG, vector DB,
# FinOps, PromptOps and audit tools from it. modules/ is filtered by .dockerignore to the ten src/ trees
# tectonic_runtime loads (see tectonic_runtime/_paths.py).
COPY tectonic_runtime/ ./tectonic_runtime/
COPY modules/ ./modules/

# Fail the build (not production) if the platform modules cannot load: a syntax error or a missing
# dependency here used to make every generated agent silently run without them.
RUN python -m compileall -q agent_builder tectonic_runtime server.py && \
    TECTONIC_OFFLINE=1 python -c "import tectonic_runtime.adk_tools as t, tectonic_runtime._paths as p; \
missing = [m for m in p.MODULE_PACKAGES if not (p.MODULES_DIR / m / 'src').is_dir()]; \
assert not missing, f'modules missing from image: {missing}'; \
print('platform modules OK:', len(t.worker_tools(team='build_check')), 'worker tools')"

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create directories and ensure writable
RUN mkdir -p /app/generated_agents /app/logs /app/data && \
    chmod -R 777 /app/generated_agents /app/logs /app/data

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV AGENT_BUILDER_HOST=0.0.0.0
ENV AGENT_BUILDER_PORT=8080
ENV AGENT_BUILDER_OUTPUT_DIR=/app/generated_agents
ENV AGENT_BUILDER_LOG_DIR=/app/logs
# Suppress ADK warnings about LiteLLM
ENV ADK_SUPPRESS_GEMINI_LITELLM_WARNINGS=true

EXPOSE 8080

CMD ["python", "server.py"]
