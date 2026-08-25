# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Build backend dependencies ----
FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Stage 2: Production ----
FROM python:3.11-slim

WORKDIR /app

# Avoid a thread explosion on Render's small CPU instance. Face AI is loaded
# lazily on the first enrollment/verification request, not during health boot.
ENV FACE_MODEL_PRELOAD=true \
    FACE_MODEL_ALLOW_DOWNLOAD=false \
    FACE_MODEL_DIR=/opt/face-models \
    FACE_LIVENESS_MODEL_PATH=/opt/face-models/minifasnet_v2.onnx \
    FACE_LIVENESS_V1SE_MODEL_PATH=/opt/face-models/minifasnet_v1se.onnx \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

# Copy installed packages from builder
COPY --from=builder /usr/local /usr/local
# Serve the SPA from the same Render Web Service as the API.
COPY --from=frontend-builder /frontend/dist ./frontend/dist
# ENV PATH=/root/.local/bin:$PATH

# Security: run as non-root user
RUN useradd -m appuser

# Copy application code
COPY . .

# Use the model files committed with the project. Render does not need to
# download them during build or during a user's first camera request.
RUN mkdir -p /opt/face-models && \
    cp /app/models/face/face_detection_yunet_2023mar.onnx /opt/face-models/ && \
    cp /app/models/face/face_recognition_sface_2021dec.onnx /opt/face-models/ && \
    cp /app/models/face/minifasnet_v2.onnx /opt/face-models/ && \
    cp /app/models/face/minifasnet_v1se.onnx /opt/face-models/

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appuser /app

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
