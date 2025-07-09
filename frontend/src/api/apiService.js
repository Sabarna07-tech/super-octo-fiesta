// The base URL for your Flask backend API
const API_URL = 'http://127.0.0.1:5000/api';

const G4DN_API_URL = "http://127.0.0.1:5005"



/**
 * A helper function to create authorization headers.
 */
const getAuthHeaders = (isJson = true) => {
    const token = localStorage.getItem('token');
    const headers = {
        'Authorization': `Bearer ${token}`
    };
    if (isJson) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
};

/**
 * A wrapper for fetch that handles 401 Unauthorized errors automatically.
 * It will log the user out and reload the page to redirect to the login screen.
 */
export const fetchWithAuth = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (response.status === 401) {
        // Token is invalid or expired.
        logout();
        // Reload the page. The App's ProtectedRoute will redirect to /login.
        window.location.reload(); 
        // Throw an error to stop further execution in the calling function.
        throw new Error('Session expired. Please log in again.');
    }
    return response;
};


/**
 * Handles user login. Stores the token and role on success.
 */
export const login = async (username, password) => {
    const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('username', username);
    }
    return data;
};

/**
 * Handles user logout. Clears user data from localStorage.
 */
export const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    return Promise.resolve({ success: true });
};

/**
 * Polls the status of a Celery task.
 */
export const getTaskStatus = async (taskId) => {
    const response = await fetchWithAuth(`${API_URL}/task-status/${taskId}`, {
        headers: getAuthHeaders(),
    });
    return response.json();
};

/**
 * Sends a request to cancel a running Celery task.
 */
export const cancelTask = async (taskId) => {
    const response = await fetchWithAuth(`${API_URL}/cancel-task/${taskId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
    });
    return response.json();
};

/**
 * Retrieves a list of video folders and files from S3 based on criteria.
 */
export const retrieveVideos = async (formData) => {
    const response = await fetchWithAuth(`${API_URL}/retrieve-videos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
    });
    return response.json();
};

/**
 * Uploads a video file directly to the S3 bucket.
 */
export const uploadVideoToS3 = async (formData, signal) => {
     const response = await fetchWithAuth(`${API_URL}/s3-upload`, {
        method: 'POST',
        headers: getAuthHeaders(false),
        body: formData,
        signal,
    });
    return response.json();
}

/**
 * Checks the status of a file on S3.
 */
export const checkS3UploadStatus = async (s3_key) => {
    const response = await fetchWithAuth(`${API_URL}/s3-upload-status`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ s3_key }),
    });
    return response.json();
};


/**
 * Starts the processing of videos that are already on S3.
 */
export const processS3Videos = async (videoKey) => {
    const response = await fetchWithAuth(`${API_URL}/process-s3-videos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ video_key: videoKey })
    });
    return response.json();
}

/**
 * Fetches system status data for the main dashboard.
 */
export const getSystemStatus = async () => {
    const response = await fetchWithAuth(`${API_URL}/system-status`, {
        headers: getAuthHeaders()
    });
    return response.json();
};

/**
 * Fetches chart data for the main dashboard.
 */
export const getChartData = async () => {
    const response = await fetchWithAuth(`${API_URL}/chart-data`, {
        headers: getAuthHeaders()
    });
    return response.json();
};

/**
 * Fetches the live comparison details from S3 for a given path.
 */
export const getComparisonDetails = async (s3Path) => {
    const response = await fetchWithAuth(`${API_URL}/comparison-details/${s3Path}`, {
        headers: getAuthHeaders()
    });
    return response.json();
};

/**
 * NEW: Fetches the total damage counts for a given S3 path.
 */
export const getDamageCounts = async (s3Path) => {
    const response = await fetchWithAuth(`${API_URL}/damage-counts/${s3Path}`, {
        headers: getAuthHeaders()
    });
    return response.json();
};

/**
 * Fetches a presigned URL for a video on S3.
 */
export const getVideoUrl = async (s3_key) => {
    const response = await fetchWithAuth(`${API_URL}/get-video-url`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ s3_key }),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch video URL');
    }
    return response.json();
};

/**
 * posts a comparison request to the server.
 */
export const postCompare = async (payload) => {
    const response = await fetchWithAuth(`${API_URL}/run-comparison`,{
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
    });
    if (!response.ok){
        const errorData = await response.json().catch(() => ({ error: 'Failed to start comparison task.' }));
        throw new Error(errorData.error || 'Failed to start comparison task.');
    }
    return await response.json()
};

/**
 * Posts a top-down comparison request to the server.
 */
export const postTopCompare = async (payload) => {
    const response = await fetchWithAuth(`${API_URL}/run-top-comparison`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to start top comparison task.' }));
        throw new Error(errorData.error || 'Failed to start top comparison task.');
    }
    return await response.json();
};

/**
 * Fetches the list of available comparison dates from the new /comparison-dates endpoint.
 */
export const getComparisonDates = async () => {
    const response = await fetchWithAuth(`${API_URL}/comparison-dates`, {
        headers: getAuthHeaders()
    });
    return response.json();
};

/**
 * Fetches all comparison entries (date, user, left/right/top data) from the backend.
 */
export const getAllComparisons = async () => {
    const response = await fetchWithAuth(`${API_URL}/comparisons`, {
        headers: getAuthHeaders()
    });
    return response.json();
};


/**
 * starts frameextraction process in g4dn backend.
 */
export const startFrameExtraction = async (payload) => {
	const response = await fetch(`${G4DN_API_URL}/frame-extract`, {
        method: 'POST',
		headers: {
			'Content-Type': 'application/json', 
		},
        body: JSON.stringify(payload),
    });
    return response.json();
};

/**
 * cancel frame extraction
 */
export const cancelFrameExtra = async (taskId) => {
	const response = await fetch(`${G4DN_API_URL}/cancel-task/${taskId}`, {
        method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
    });
    return response.json();
};

/**
 * Polls the status of a Celery task from the g4dn backend.
 */
export const getG4DNTaskStatus = async (taskId) => {
    const response = await fetch(`${G4DN_API_URL}/task-status/${taskId}`);
    return response.json();
};
