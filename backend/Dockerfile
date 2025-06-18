FROM python:3.10-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git libgl1-mesa-glx libglib2.0-0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 👇 Add DeepSort
COPY deep_sort_realtime /app/deep_sort_realtime
RUN pip install ./deep_sort_realtime

COPY . .

CMD ["python", "app.py"]  # or whatever your entrypoint is
