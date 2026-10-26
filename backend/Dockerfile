FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright (optional, for browser automation)
RUN pip install playwright && \
    playwright install chromium && \
    playwright install-deps chromium || true

# Copy application code
COPY . .

# Create artifacts directory
RUN mkdir -p /app/artifacts

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=5 \
    CMD wget -qO- http://localhost:8001/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
