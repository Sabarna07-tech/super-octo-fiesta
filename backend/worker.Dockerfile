# Use the full (non-slim) Python 3.10 image for maximum compatibility with ML libraries
FROM python:3.10-bookworm

# Install system dependencies, including build tools
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# This pip command will succeed in the full environment
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command for the worker (can be overridden in docker-compose)
CMD ["celery", "-A", "services.celery_worker.celery_app", "worker", "--loglevel=info", "-P", "threads"]