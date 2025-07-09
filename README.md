# Wagon Damage Detection System

A full-stack, containerized web application that automatically detects, classifies, and reports damage to train wagons from video footage. The system features secure role-based authentication, direct AWS S3 video management, scalable background processing, and a user-friendly web interface.

---

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Setup & Installation](#setup--installation)
- [Project Structure](#project-structure)
- [Handling Critical Challenges](#handling-critical-challenges)
- [Usage](#usage)
- [License](#license)

---

## Features

- **Role-Based Authentication**  
  Secure JWT-based authentication supporting multiple user roles (e.g., administrator, uploader).

- **S3-Based Video Management**  
  Retrieve and process videos directly from AWS S3, searchable by date, client, or camera angle.

- **Asynchronous Frame Extraction**  
  Uses Celery for non-blocking, scalable extraction of key video frames in the background.

- **Real-Time Task Monitoring**  
  The frontend polls for background task status, providing users with live progress updates.

- **Result Visualization**  
  Gallery view displays extracted frames securely loaded from S3.

- **Containerized Environment**  
  Entire stack is Dockerized for consistent and easy deployment.

---

## System Architecture

```
+-------------------------------------------------------------------------------------------------+
|                                         User's Browser                                          |
+-------------------------------------------------------------------------------------------------+
             |                                        ^
             | HTTP/API Requests                      | UI Updates
             v                                        |
+--------------------------+           +-----------------------------+          +----------------+
|    Frontend Container    |           |    Backend (API) Container  |          |      AWS S3    |
| (React SPA on port 5173) |-----------| (Flask Server on port 5000) |<-------->| (Video Storage)|
+--------------------------+           +-----------------------------+          +----------------+
                                       |                 ^
                                       | Adds job to     | Reads task status
                                       | queue           | and results from
                                       v                 |
+-------------------------------------------------------------------------------------------------+
|                                    Docker Network (redis)                                       |
+-------------------------------------------------------------------------------------------------+
      |                 ^                            |                           ^
      | Task messages   | Task results               | Fetches job from          | Pushes results to
      | from Backend    | to Backend                 | queue                     | Result Backend
      v                 |                            v                           |
+--------------------------+           +-----------------------------+
|     Redis Container      |           |    Worker Container         |
| (Broker & Result Backend)|<----------|       (Celery)            |
+--------------------------+           +-----------------------------+
                                                     |
                                                     | Downloads/Uploads
                                                     | data from/to
                                                     v
                                              +----------------+
                                              |      AWS S3    |
                                              +----------------+
```

**Component Overview:**

- **Frontend:** React SPA (port 5173). Talks to backend via REST API.
- **Backend (API):** Flask (port 5000). Handles auth, data serving, and job delegation.
- **Redis:** Message broker and result backend for Celery.
- **Worker:** Celery process for long-running video processing tasks.
- **AWS S3:** Centralized video and frame storage.
- **Docker Compose:** Orchestrates all services for seamless dev/prod setup.

---

## Technology Stack

- **Backend:** Python, Flask, Celery, Redis, PyJWT, Boto3, Ultralytics YOLO, OpenCV
- **Frontend:** JavaScript, React, Vite, Bootstrap
- **Infrastructure:** Docker, Docker Compose

---

## Setup & Installation

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### 1. Clone the Repository

```sh
git clone https://github.com/AiSPRY/WagonDamageNew.git
cd WagonDamageNew/backend
```

### 2. Create the Environment File

Create `backend/.env` and add your AWS credentials and config:

```
AWS_ACCESS_KEY_ID=YOUR_ACTUAL_AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_ACTUAL_AWS_SECRET_KEY
AWS_REGION=us-east-1

# Docker-specific configuration
REDIS_HOST=redis
```

> **Note:** Never commit `.env` to version control.

### 3. Build and Run the Application

From the `backend/` directory, run:

```sh
docker-compose up --build
```

This will:
- Build images and install dependencies.
- Start `redis-1`, `backend-1`, and `worker-1` containers.
- Connect all via a shared Docker network.

### 4. Access the Application

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:5000](http://localhost:5000)

### 5. Stopping the Application

- Press `Ctrl+C` in the terminal to stop all containers.
- To remove containers:  
  ```sh
  docker-compose down
  ```

---

## Project Structure

```
.
├── backend/
│   ├── .env                 # Secret keys and environment variables
│   ├── app.py               # Main Flask application
│   ├── config.py            # App configuration
│   ├── Dockerfile           # Flask app image instructions
│   ├── docker-compose.yml   # Orchestrates all services
│   ├── requirements.txt     # Python dependencies
│   ├── api/
│   │   └── routes.py        # API endpoint definitions
│   ├── models/
│   │   └── best_weights.pt  # Trained YOLO model
│   └── services/
│       ├── celery_worker.py     # Celery tasks
│       ├── frame_extractor.py   # Video processing logic
│       └── s3_utils.py          # AWS S3 helpers
└── frontend/
    ├── package.json         # JS dependencies
    └── src/
        ├── App.jsx              # Main React app
        ├── api/
        │   └── apiService.js    # Centralized API calls
        ├── components/          # Reusable components
        ├── context/
        │   └── TaskContext.jsx  # Global state manager for tasks
        └── pages/               # Page/route components
```

---

## Handling Critical Challenges

- **Long-Running Tasks:**  
  Celery enables async video processing, returning a `task_id` so the UI never blocks.

- **Platform Incompatibility:**  
  Docker ensures consistent Linux environments, eliminating "works on my machine" issues.

- **Frontend State Management:**  
  React Context API (`TaskContext.jsx`) globally tracks task status, even when navigating pages.

- **Scalability:**  
  Add more worker containers in `docker-compose.yml` for parallel processing.

---

## Usage

1. **Upload or select videos stored in AWS S3.**
2. **Start a video analysis job:**  
   The backend queues the job and returns a `task_id`.
3. **Monitor progress in real-time:**  
   The frontend polls the backend for status using the `task_id`.
4. **View results:**  
   Extracted frames are displayed in a gallery view, loaded securely from S3.
5. **Role-based access:**  
   Only authorized users (by role) can upload, manage, or view results.

---

## License

This project is for demonstration/educational purposes. For production or commercial use, please consult the repository owner and ensure compliance with all third-party dependencies' licenses.

---

> **Questions or Contributions?**  
  Please open an issue or pull request!
