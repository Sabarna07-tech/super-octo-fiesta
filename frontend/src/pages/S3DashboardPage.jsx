import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTask } from '../context/TaskContext';

// API services
import {
    checkS3UploadStatus,
    retrieveVideos,
    getVideoUrl,
    uploadVideoToS3
} from '/src/api/apiService.js';

// Import CSS
import '/src/assets/css/s3_dashboard.css';
import '/src/assets/css/s3_upload.css';
import '/src/assets/css/s3_upload_vertical.css';

const S3DashboardPage = () => {
    const userRole = localStorage.getItem('role');

    // === STATE FOR UPLOAD SECTION ===
    const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
    const [cameraAngle, setCameraAngle] = useState('left');
    const [videoType, setVideoType] = useState('entry');
    const [selectedFile, setSelectedFile] = useState(null);
    const [loadStatus, setLoadStatus] = useState('loaded');
    
    // This state now manages all uploads, including their progress and status
    const [uploads, setUploads] = useState(() => {
        try {
            const savedUploads = localStorage.getItem('uploadHistory');
            // Filter out any uploads that were in progress when the page was last closed
            const parsed = savedUploads ? JSON.parse(savedUploads) : [];
            return parsed.filter(up => up.status !== 'Uploading...');
        } catch (error) {
            console.error("Could not load upload history from localStorage:", error);
            return [];
        }
    });

    const fileInputRef = useRef(null);
    const pollIntervalsRef = useRef({});
    
    // === STATE FOR RETRIEVE & PREVIEW SECTION ===
    const { startS3FrameExtraction } = useTask();
    const [retrieveForm, setRetrieveForm] = useState({
        retrieve_date: new Date().toISOString().split('T')[0],
        client_id: localStorage.getItem('username') || 'Unknown User',
        camera_angle: 'left',
        video_type: 'entry'
    });
    const [folders, setFolders] = useState([]);
    const [isRetrieving, setIsRetrieving] = useState(false);
    const [selectedVideo, setSelectedVideo] = useState({ folderName: '', videoName: '' });
    const [previewUrl, setPreviewUrl] = useState('');
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // === PERSISTENCE AND CLEANUP EFFECTS ===
    useEffect(() => {
        document.body.classList.add('s3-dashboard-page-body');
        const intervals = pollIntervalsRef.current;
        return () => {
            document.body.classList.remove('s3-dashboard-page-body');
            Object.values(intervals).forEach(clearInterval);
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('uploadHistory', JSON.stringify(uploads));
        } catch (error) {
            console.error("Could not save upload history to localStorage:", error);
            toast.warn("Could not save upload history. It will be lost on refresh.");
        }
    }, [uploads]);

    // This function remains the same
    const pollForStatus = (uploadId, s3Key, fileName) => {
        if (pollIntervalsRef.current[uploadId]) {
            clearInterval(pollIntervalsRef.current[uploadId]);
        }

        pollIntervalsRef.current[uploadId] = setInterval(async () => {
            try {
                const response = await checkS3UploadStatus(s3Key);
                if (response.success && response.exists) {
                    clearInterval(pollIntervalsRef.current[uploadId]);
                    delete pollIntervalsRef.current[uploadId];
                    setUploads(prev => prev.map(up =>
                        up.id === uploadId ? { ...up, status: 'Verified on S3', progress: 100 } : up
                    ));
                    toast.success(`"${fileName}" has been successfully verified on S3.`);
                }
            } catch (error) {
                clearInterval(pollIntervalsRef.current[uploadId]);
                delete pollIntervalsRef.current[uploadId];
                console.error("Verification polling error:", error);
                setUploads(prev => prev.map(up =>
                    up.id === uploadId ? { ...up, status: 'Verification Error' } : up
                ));
            }
        }, 5000);
    };

    const handleFileSelect = (file) => {
        if (file && file.type.startsWith('video/')) {
            setSelectedFile(file);
        } else if (file) {
            toast.error('Please select a valid video file.');
        }
    };
    
    const triggerFileSelect = (e) => {
        if (e) e.stopPropagation();
        fileInputRef.current.click();
    };

    const onDrop = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            handleFileSelect(event.dataTransfer.files[0]);
            event.dataTransfer.clearData();
        }
    }, []);

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const removeFile = (e) => {
        if (e) e.stopPropagation();
        setSelectedFile(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedFile) {
            toast.error('Please select a file to upload.');
            return;
        }
        
        const uploadId = Date.now();
        const fileToUpload = selectedFile;

        const newUpload = {
            id: uploadId,
            fileName: fileToUpload.name,
            status: 'Uploading...',
            progress: 0,
            s3_key: null,
            timestamp: new Date().toISOString(),
        };

        // Add to state and immediately reset the form
        setUploads(prev => [newUpload, ...prev].slice(0, 10));
        removeFile(null); // Reset the form for the next upload

        const formData = new FormData();
        formData.append('video', fileToUpload);
        formData.append('upload_date', uploadDate);
        formData.append('camera_angle', cameraAngle);
        formData.append('video_type', videoType);
        formData.append('load_status', loadStatus);
        formData.append('user_name', localStorage.getItem('username') || 'Unknown User');

        // Start simulated progress for better UX
        const progressInterval = setInterval(() => {
            setUploads(prev => prev.map(up => {
                if (up.id === uploadId && up.status === 'Uploading...' && up.progress < 90) {
                    // Simulate progress up to 90% (save 10% for completion)
                    const increment = Math.random() * 15 + 5; // Random increment between 5-20%
                    return { ...up, progress: Math.min(up.progress + increment, 90) };
                }
                return up;
            }));
        }, 500);

        try {
            // Use the API service instead of custom XMLHttpRequest
            const response = await uploadVideoToS3(formData);
            
            // Clear the progress interval
            clearInterval(progressInterval);
            
            if (response.success && response.s3_key) {
                setUploads(prev => prev.map(up => 
                    up.id === uploadId ? { ...up, status: 'Verifying...', s3_key: response.s3_key, progress: 100 } : up
                ));
                pollForStatus(uploadId, response.s3_key, fileToUpload.name);
            } else {
                setUploads(prev => prev.map(up => 
                    up.id === uploadId ? { ...up, status: 'Failed', error: response.error || 'Upload failed' } : up
                ));
                toast.error(`Upload failed for "${fileToUpload.name}": ${response.error || 'Unknown error'}`);
            }
        } catch (error) {
            // Clear the progress interval on error
            clearInterval(progressInterval);
            
            console.error('Upload error:', error);
            setUploads(prev => prev.map(up => 
                up.id === uploadId ? { ...up, status: 'Failed', error: error.message || 'Network Error' } : up
            ));
            toast.error(`Upload failed for "${fileToUpload.name}": ${error.message || 'Network error'}`);
        }
    };

    const handleCancelUpload = (uploadId) => {
        const uploadToCancel = uploads.find(up => up.id === uploadId);
        if (uploadToCancel) {
            // Since we're using the API service, we can't directly cancel the request
            // But we can update the UI to show it as cancelled
            setUploads(prev => prev.map(up => up.id === uploadId ? { ...up, status: 'Cancelled', progress: 0 } : up));
            toast.warn(`Upload of "${uploadToCancel.fileName}" was cancelled.`);
        }
    };
    
    // Other handlers (retrieve, preview, etc.) remain unchanged
    const handleRetrieveFormChange = (e) => {
        const { name, value } = e.target;
        setRetrieveForm(prev => ({ ...prev, [name]: value }));
    };

    const handleRetrieve = async (e) => {
        e.preventDefault();
        setIsRetrieving(true);
        setFolders([]);
        setPreviewUrl('');
        setSelectedVideo({ folderName: '', videoName: '' });

        try {
            const response = await retrieveVideos(retrieveForm);
            if (response.success) {
                setFolders(response.folders);
                toast.success(`${response.folders.length > 0 ? response.folders.reduce((acc, f) => acc + f.videos.length, 0) : 0} videos found.`);
            } else {
                toast.error(response.error || 'Failed to retrieve videos.');
            }
        } catch (error) {
            toast.error("Error retrieving videos.");
            console.error(error);
        } finally {
            setIsRetrieving(false);
        }
    };

    const handleVideoSelect = async (folderName, videoName) => {
        if (selectedVideo.videoName === videoName && selectedVideo.folderName === folderName) {
            setPreviewUrl('');
            setSelectedVideo({ folderName: '', videoName: '' });
            return;
        }

        setIsPreviewLoading(true);
        setPreviewUrl('');
        setSelectedVideo({ folderName, videoName });

        try {
            const fullS3Key = `${folderName}${videoName}`;
            const response = await getVideoUrl(fullS3Key);
            if (response.success) {
                setPreviewUrl(response.url);
            } else {
                toast.error(response.error || 'Failed to get video preview.');
            }
        } catch (error) {
            toast.error('Error fetching video preview.');
            console.error(error);
        } finally {
            setIsPreviewLoading(false);
        }
    };
    
    const getStatusIcon = (status) => {
        switch(status) {
            case 'Uploading...':
                return <span className="spinner-border spinner-border-sm text-primary me-2" role="status" aria-hidden="true" style={{animationDuration: '0.8s'}} title="Uploading file..."></span>;
            case 'Verifying...':
                return <span className="spinner-border spinner-border-sm text-info me-2" role="status" aria-hidden="true" style={{animationDuration: '1.2s'}} title="Verifying on S3..."></span>;
            case 'Verified on S3':
                return <i className="fas fa-check-double text-success me-2" title="Successfully uploaded and verified"></i>;
            case 'Failed':
            case 'Cancelled':
            case 'Verification Error':
                return <i className="fas fa-times-circle text-danger me-2" title="Upload failed"></i>;
            default:
                return <i className="fas fa-info-circle text-secondary me-2"></i>;
        }
    }

    const getStatusText = (upload) => {
        if (upload.status === 'Uploading...' && upload.progress > 0) {
            return `Uploading... ${Math.round(upload.progress)}%`;
        }
        return upload.status;
    }
    
    const formatTimestamp = (isoString) => {
        if (!isoString) return '';
        return new Date(isoString).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const today = new Date();
    const maxDate = today.toISOString().split('T')[0];
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);
    const minDate = twoDaysAgo.toISOString().split('T')[0];
    
    return (
        <div className="s3-vertical-layout">
            
            {/* --- UPLOAD SECTION - HORIZONTAL LAYOUT --- */}
            <div className="upload-section">
                <form onSubmit={handleUpload} className="upload-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="uploadDate" className="form-label">Video Date</label>
                            <input type="date" className="form-control" id="uploadDate" value={uploadDate} onChange={e => setUploadDate(e.target.value)} min={minDate} max={maxDate} required />
                        </div>
                        
                        <div className="form-group">
                            <label className="form-label">Camera Angle</label>
                            <div className="radio-group">
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="camLeft" name="cameraAngle" value="left" checked={cameraAngle === 'left'} onChange={e => setCameraAngle(e.target.value)} />
                                    <label className="form-check-label" htmlFor="camLeft">Left</label>
                                </div>
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="camRight" name="cameraAngle" value="right" checked={cameraAngle === 'right'} onChange={e => setCameraAngle(e.target.value)} />
                                    <label className="form-check-label" htmlFor="camRight">Right</label>
                                </div>
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="camTop" name="cameraAngle" value="top" checked={cameraAngle === 'top'} onChange={e => setCameraAngle(e.target.value)} />
                                    <label className="form-check-label" htmlFor="camTop">Top</label>
                                </div>
                            </div>
                        </div>
                        
                        <div className="form-group">
                            <label className="form-label">Video Type</label>
                            <div className="radio-group">
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="vidEntry" name="videoType" value="entry" checked={videoType === 'entry'} onChange={e => setVideoType(e.target.value)} />
                                    <label className="form-check-label" htmlFor="vidEntry">Entry</label>
                                </div>
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="vidExit" name="videoType" value="exit" checked={videoType === 'exit'} onChange={e => setVideoType(e.target.value)} />
                                    <label className="form-check-label" htmlFor="vidExit">Exit</label>
                                </div>
                            </div>
                        </div>
                        
                        <div className="form-group">
                            <label className="form-label">Load Status</label>
                            <div className="radio-group">
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="statusLoaded" name="loadStatus" value="loaded" checked={loadStatus === 'loaded'} onChange={e => setLoadStatus(e.target.value)} />
                                    <label className="form-check-label" htmlFor="statusLoaded">Loaded</label>
                                </div>
                                <div className="form-check">
                                    <input className="form-check-input" type="radio" id="statusUnloaded" name="loadStatus" value="unloaded" checked={loadStatus === 'unloaded'} onChange={e => setLoadStatus(e.target.value)} />
                                    <label className="form-check-label" htmlFor="statusUnloaded">Unloaded</label>
                                </div>
                            </div>
                        </div>
                        
                        <div className="form-group">
                            <label className="form-label">Select Video</label>
                            <input type="file" id="videoFile" ref={fileInputRef} className="d-none" accept="video/*" onChange={e => handleFileSelect(e.target.files[0])} />
                            { !selectedFile ? (
                                <button type="button" className="btn btn-outline-primary select-video-btn" onClick={triggerFileSelect}>
                                    <i className="fas fa-file-video me-1"></i>Select Video
                                </button>
                            ) : (
                                <div className="selected-file-display">
                                    <div className="file-info">
                                        <i className="fas fa-file-video file-icon"></i>
                                        <span className="file-name">{selectedFile.name}</span>
                                        <span className="file-size">({(selectedFile.size / (1024*1024)).toFixed(2)} MB)</span>
                                    </div>
                                    <button type="button" className="remove-btn" onClick={removeFile}>
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div className="form-group">
                            <label className="form-label">&nbsp;</label>
                            <button type="submit" className="btn btn-primary upload-btn" disabled={!selectedFile}>
                                <i className="fas fa-cloud-upload-alt me-1"></i>Upload to S3
                            </button>
                        </div>
                    </div>
                </form>
            </div>
            
            {/* --- UPLOAD HISTORY SECTION - HORIZONTAL LAYOUT --- */}
            <div className="upload-history-section">
                <div className="section-header">
                    <h3 className="section-title">
                        <i className="fas fa-history"></i>
                        Upload History
                    </h3>
                </div>
                
                <div className="history-content">
                    { uploads.length === 0 ? (
                        <p className="text-muted text-center">No upload history.</p>
                    ) : (
                        <div className="history-list">
                            {uploads.map(upload => (
                                <div key={upload.id} className="history-item">
                                    <div className="history-info">
                                        <h6 className="history-filename">{upload.fileName}</h6>
                                        <small className="history-timestamp">{formatTimestamp(upload.timestamp)}</small>
                                    </div>
                                    <div className="history-status">
                                        {getStatusIcon(upload.status)}
                                        <span className="status-text">{getStatusText(upload)}</span>
                                        {upload.status === 'Uploading...' && (
                                            <button className="btn btn-danger btn-sm cancel-btn" onClick={() => handleCancelUpload(upload.id)}>Cancel</button>
                                        )}
                                    </div>
                                    {upload.status === 'Uploading...' && (
                                        <div className="progress">
                                            <div className="progress-bar" role="progressbar" style={{width: `${upload.progress}%`}} aria-valuenow={upload.progress} aria-valuemin="0" aria-valuemax="100"></div>
                                        </div>
                                    )}
                                    {upload.s3_key && (
                                        <p className="history-s3-key">
                                            <i className="fas fa-folder-open me-2"></i>
                                            {upload.s3_key}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* --- RETRIEVE & PROCESS SECTION (for non-s3_uploader roles) --- */}
            {userRole !== 's3_uploader' && (
                <div className="card">
                    <div className="card-header">
                        <h5><i className="fas fa-search"></i>Retrieve & Process Videos from S3</h5>
                    </div>
                    <div className="card-body">
                        <form onSubmit={handleRetrieve}>
                            <div className="row">
                                <div className="col-md-3">
                                    <div className="mb-3">
                                        <label htmlFor="retrieveDate" className="form-label">Date</label>
                                        <input type="date" className="form-control" id="retrieveDate" name="retrieve_date" value={retrieveForm.retrieve_date} onChange={handleRetrieveFormChange} required />
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="mb-3">
                                        <label htmlFor="clientId" className="form-label">Client ID</label>
                                        <input type="text" className="form-control" id="clientId" name="client_id" value={retrieveForm.client_id} onChange={handleRetrieveFormChange} required />
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="mb-3">
                                        <label className="form-label">Camera Angle</label>
                                        <select className="form-control" name="camera_angle" value={retrieveForm.camera_angle} onChange={handleRetrieveFormChange}>
                                            <option value="left">Left</option>
                                            <option value="right">Right</option>
                                            <option value="top">Top</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="mb-3">
                                        <label className="form-label">Video Type</label>
                                        <select className="form-control" name="video_type" value={retrieveForm.video_type} onChange={handleRetrieveFormChange}>
                                            <option value="entry">Entry</option>
                                            <option value="exit">Exit</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="text-center">
                                <button type="submit" className="btn btn-primary" disabled={isRetrieving}>
                                    {isRetrieving ? (
                                        <>
                                            <span className="spinner-border spinner-border-sm me-2"></span>Retrieving...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-search me-1"></i>Retrieve Videos
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                        
                        {folders.length > 0 && (
                            <div className="mt-4">
                                <h6 className="mb-3">Available Videos:</h6>
                                {folders.map(folder => (
                                    <div key={folder.id} className="mb-3">
                                        <h6 className="text-primary">{folder.folderName}</h6>
                                        <div className="row">
                                            {folder.videos.map(video => (
                                                <div key={video.id} className="col-md-4 mb-2">
                                                    <button 
                                                        className={`btn btn-outline-primary w-100 ${selectedVideo.videoName === video.videoName && selectedVideo.folderName === folder.folderName ? 'active' : ''}`}
                                                        onClick={() => handleVideoSelect(folder.folderName, video.videoName)}
                                                    >
                                                        {video.videoName}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {isPreviewLoading && (
                            <div className="text-center mt-4">
                                <div className="spinner-border text-primary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                </div>
                                <p className="mt-2">Loading video preview...</p>
                            </div>
                        )}
                        
                        {previewUrl && (
                            <div className="video-preview-container mt-4">
                                <video key={previewUrl} controls autoPlay muted>
                                    <source src={previewUrl} type="video/mp4" />
                                    Your browser does not support the video tag.
                                </video>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default S3DashboardPage;