# Wagon Damage Detection and Comparison Platform

This is a comprehensive web application designed for uploading, processing, and analyzing videos to detect damages. It features a React-based frontend, a Python Flask backend, and leverages Celery for asynchronous task processing, with a sophisticated architecture that separates GPU-intensive tasks from CPU-bound ones for optimal performance and scalability.

## Table of Contents

1. [Key Features](#key-features)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Getting Started](#getting-started)
5. [Running Locally](#running-locally)
6. [Environment Variables](#environment-variables)
7. [Project Structure](#project-structure)

## Key Features

* **User Authentication:** Secure JWT-based authentication with multiple user roles (Admin, S3 Uploader, Viewer).
* **S3 Video Management:** Direct video uploads to AWS S3 with a structured folder system.
* **Asynchronous Frame Extraction:** A GPU-optimized service that extracts frames from videos for analysis.
* **Damage Comparison:** A CPU-bound service that compares video frames to identify and report damages.
* **Dynamic Dashboard:** Real-time monitoring of system status, storage usage, and processing metrics.
* **Task Management:** View the status of ongoing processing tasks and cancel them if needed.
* **Optimized Caching:** Redis is used for caching API responses to reduce load times and improve user experience.

## Technology Stack

* **Frontend:** React, Vite, CSS
* **Backend:** Flask, Python
* **Task Queue:** Celery
* **Message Broker/Cache:** Redis
* **Database/Storage:** AWS S3
* **Containerization:** Docker, Docker Compose

## Architecture

The application is designed as a distributed system to efficiently handle different types of workloads. The core of the backend is split into two main services, each with its own dedicated worker pool, orchestrated by a central task broker (Redis).

### App Service (CPU-Bound)

* Runs the Flask application and Celery worker subscribed to `cpu_queue`
* Handles API requests, user management, dashboard views, and damage comparisons

### GPU Service (GPU-Bound)

* Runs a dedicated Celery worker subscribed to `gpu_queue`
* Handles computationally expensive frame extraction tasks using GPU acceleration

### Architecture Diagram

```
+------------------+
|  User's Browser  |
| (React Frontend) |
+------------------+
        |
        | HTTP/API Calls
        v
+--------------------------------------------------------------------------+
|                        App Service (CPU-Intensive)                         |
|                                                                          |
|  +-----------------+      +--------------------+      +----------------+  |
|  | Flask Backend   |----->|   run_comparison() |----->| Redis Broker   |  |
|  | (API Endpoints) |      +--------------------+      | (Task Queue)   |  |
|  +-----------------+      (Sends to cpu_queue)       +-------+--------+  |
|          ^                                                   |             |
|          |                                                   | cpu.task    |
|          |  (Sends to gpu_queue)                             v             |
|  +---------------------+                           +--------------------+  |
|  | frame_extraction()  |                           | CPU Celery Worker  |  |
|  +---------------------+                           | (Consumes cpu_queue) |  |
|                                                    +--------------------+  |
+--------------------------------------------------------------------------+
        |
        | gpu.task
        v
+--------------------------------------------------------------------------+
|                       GPU Service (GPU-Intensive)                          |
|                                                                          |
|                               +---------------------+                      |
|                               | GPU Celery Worker   |                      |
|                               | (Consumes gpu_queue)|                      |
|                               +---------------------+                      |
+--------------------------------------------------------------------------+
```

## Getting Started

Follow these instructions to get the project running on your local machine.

### Prerequisites

* Docker and Docker Compose
* Git
* An AWS S3 bucket and IAM user credentials with appropriate permissions.

### Installation

1. **Clone the repository:**

   ```sh
   git clone https://github.com/your-username/your-repo-name.git
   cd your-repo-name
   ```

2. **Configure Backend Environment Variables:**
   Navigate to the `backend` directory and create a file named `.env`. Populate it with the necessary credentials and configuration. See the [Environment Variables](#environment-variables) section for details.

   ```sh
   cd backend
   touch .env
   ```

3. **Configure Frontend Environment Variables:**
   Navigate to the `frontend` directory, create a `.env` file, and set the API endpoint.

   ```sh
   # In frontend/.env
   VITE_API_BASE_URL=http://localhost:5000/api
   ```

## Running Locally

To simulate the distributed architecture on a local machine, we use two separate `docker-compose` configurations.

### Step 1: Start the App Service

Start Redis, Flask API server, and the CPU worker:

```bash
cd backend
docker-compose -f docker-compose.app.yml up --build
```

You should see logs for `backend_service` and `cpu_worker_service` connecting to Redis and consuming from `cpu_queue`.

### Step 2: Start the GPU Service

In a second terminal:

```bash
cd backend
docker-compose -f docker-compose.gpu.yml up --build
```

This worker will connect to Redis and consume tasks from `gpu_queue`.

### Step 3: Start the Frontend

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

### Step 4: Use the Application

Open your browser to `http://localhost:5173` and begin using the application.

* Triggering a **Damage Comparison** shows logs in the CPU worker terminal.
* Triggering **Frame Extraction** shows logs in the GPU worker terminal.

## Environment Variables

The following environment variables are required in `backend/.env`:

```env
FLASK_APP=app:create_app()
FLASK_ENV=development
JWT_SECRET_KEY=your-very-secret-key
JWT_ACCESS_TOKEN_EXPIRES_MINUTES=60
S3_BUCKET=your-bucket-name
S3_UPLOAD_FOLDER=uploads
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_DEFAULT_REGION=us-east-1
REDIS_HOST=redis
REDIS_PORT=6379
```

## Project Structure

```
.
├── backend
│   ├── api
│   │   └── routes.py             # Flask API routes
│   ├── services
│   │   ├── celery_worker.py      # Celery task setup
│   │   ├── frame_extractor.py    # GPU-based frame extraction logic
│   │   ├── compare.py            # CPU-based frame comparison logic
│   │   └── s3_utils.py           # AWS S3 helper functions
│   ├── app.py                    # Flask app factory
│   ├── Dockerfile                # Backend Docker config
│   ├── docker-compose.app.yml    # CPU-related services
│   └── docker-compose.gpu.yml    # GPU worker services
├── frontend
│   ├── src
│   │   ├── pages                 # Page-level React components
│   │   ├── components            # Reusable components
│   │   └── api                   # API interaction logic
│   └── ...
└── README.md
```

---

This setup provides a robust, scalable, and modular solution for video damage detection using distributed services and efficient resource utilization.
