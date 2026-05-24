# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Limit Node.js memory to prevent OOM kills on constrained build hosts
ENV NODE_OPTIONS="--max_old_space_size=1024"

# Install dependencies (use wildcard so yarn.lock is optional)
COPY frontend/package.json frontend/yarn.lock* ./
RUN yarn install --network-timeout 120000 --frozen-lockfile || yarn install --network-timeout 120000

# Copy source and build
# REACT_APP_BACKEND_URL is intentionally empty so API calls are relative (/api/...)
COPY frontend/ .
ENV REACT_APP_BACKEND_URL=""
RUN yarn build

# ── Stage 2: Python backend + serve frontend ──────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-dejavu-core \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and system dependencies in one layer, then clean up
RUN playwright install chromium \
    && playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Copy backend source
COPY backend/ .

# Copy compiled React app into the backend's static folder
COPY --from=frontend-build /app/frontend/build ./static/frontend

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
