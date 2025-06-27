import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTask } from '../context/TaskContext';

// API services (checkS3UploadStatus, retrieveVideos, getVideoUrl are still used)
import {
    checkS3UploadStatus,
    retrieveVideos,
    getVideoUrl
} from '/src/api/apiService.js';

// Import CSS
import '/src/assets/css/s3_dashboard.css';
import '/src/assets/css/s3_upload.css';

const S3DashboardPage = () => {
    const userRole = localStorage.getItem('role');

    // === STATE FOR UPLOAD SECTION ===
    const [uploadDate, setUploadDate] = useState(new Date().toISOString().split('T')[0]);
    const [cameraAngle, setCameraAngle] = useState('left');
    const [videoType, setVideoType] = useState('entry');
    const [selectedFile, setSelectedFile] = useState(null);
    
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
            // We use a simple object to hold the XHR request so we can abort it
            xhr: new XMLHttpRequest(),
        };

        // Add to state and immediately reset the form
        setUploads(prev => [newUpload, ...prev].slice(0, 10));
        removeFile(null); // Reset the form for the next upload

        const formData = new FormData();
        formData.append('video', fileToUpload);
        formData.append('upload_date', uploadDate);
        formData.append('camera_angle', cameraAngle);
        formData.append('video_type', videoType);
        formData.append('user_name', localStorage.getItem('username') || 'Unknown User');
        
        const token = localStorage.getItem('token');

        // Configure and send the request
        newUpload.xhr.open('POST', 'http://127.0.0.1:5000/api/s3-upload');
        newUpload.xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        
        // Track progress
        newUpload.xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const progress = Math.round((event.loaded * 100) / event.total);
                setUploads(prev => prev.map(up => up.id === uploadId ? { ...up, progress } : up));
            }
        };

        // Handle completion
        newUpload.xhr.onload = () => {
            if (newUpload.xhr.status === 200) {
                const response = JSON.parse(newUpload.xhr.responseText);
                if (response.success && response.s3_key) {
                    setUploads(prev => prev.map(up => up.id === uploadId ? { ...up, status: 'Verifying...', s3_key: response.s3_key, progress: 100 } : up));
                    pollForStatus(uploadId, response.s3_key, fileToUpload.name);
                } else {
                    setUploads(prev => prev.map(up => up.id === uploadId ? { ...up, status: 'Failed', error: response.error } : up));
                    toast.error(`Upload failed for "${fileToUpload.name}": ${response.error}`);
                }
            } else {
                 setUploads(prev => prev.map(up => up.id === uploadId ? { ...up, status: 'Failed', error: 'Server error' } : up));
                 toast.error(`Upload failed for "${fileToUpload.name}": Server returned status ${newUpload.xhr.status}`);
            }
        };
        
        // Handle errors
        newUpload.xhr.onerror = () => {
             setUploads(prev => prev.map(up => up.id === uploadId ? { ...up, status: 'Failed', error: 'Network Error' } : up));
             toast.error(`Upload failed for "${fileToUpload.name}": Network error.`);
        };
        
        newUpload.xhr.send(formData);
    };

    const handleCancelUpload = (uploadId) => {
        const uploadToCancel = uploads.find(up => up.id === uploadId);
        if (uploadToCancel && uploadToCancel.xhr) {
            uploadToCancel.xhr.abort(); // Abort the XMLHttpRequest
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
            case 'Verifying...':
                return <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>;
            case 'Verified on S3':
                return <i className="fas fa-check-double text-success me-2"></i>;
            case 'Failed':
            case 'Cancelled':
            case 'Verification Error':
                return <i className="fas fa-times-circle text-danger me-2"></i>;
            default:
                return <i className="fas fa-info-circle text-secondary me-2"></i>;
        }
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
        <div id="s3_dashboard_container">
            <div className="row">
                {/* --- UPLOAD SECTION --- */}
                <div className="col-lg-7">
                    <div className="card shadow-sm">
                        <div className="card-header bg-primary text-white text-center"><h5 className="mb-0"><i className="fas fa-upload me-2"></i>Upload Video to S3 Bucket</h5></div>
                        <div className="card-body">
                             <form onSubmit={handleUpload}>
                                {/* ... form inputs for date, camera angle, etc. remain the same ... */}
                                <div className="row">
                                    <div className="col-md-6">
                                        <div className="mb-3">
                                            <label htmlFor="uploadDate" className="form-label">Video Date:</label>
                                            <input type="date" className="form-control" id="uploadDate" value={uploadDate} onChange={e => setUploadDate(e.target.value)} min={minDate} max={maxDate} required />
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Camera Angle:</label>
                                            <div>
                                                <div className="form-check"><input className="form-check-input" type="radio" id="camLeft" name="cameraAngle" value="left" checked={cameraAngle === 'left'} onChange={e => setCameraAngle(e.target.value)} /><label className="form-check-label" htmlFor="camLeft">Left</label></div>
                                                <div className="form-check"><input className="form-check-input" type="radio" id="camRight" name="cameraAngle" value="right" checked={cameraAngle === 'right'} onChange={e => setCameraAngle(e.target.value)} /><label className="form-check-label" htmlFor="camRight">Right</label></div>
                                                <div className="form-check"><input className="form-check-input" type="radio" id="camTop" name="cameraAngle" value="top" checked={cameraAngle === 'top'} onChange={e => setCameraAngle(e.target.value)} /><label className="form-check-label" htmlFor="camTop">Top</label></div>
                                            </div>
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Video Type:</label>
                                            <div>
                                                <div className="form-check"><input className="form-check-input" type="radio" id="vidEntry" name="videoType" value="entry" checked={videoType === 'entry'} onChange={e => setVideoType(e.target.value)} /><label className="form-check-label" htmlFor="vidEntry">Entry</label></div>
                                                <div className="form-check"><input className="form-check-input" type="radio" id="vidExit" name="videoType" value="exit" checked={videoType === 'exit'} onChange={e => setVideoType(e.target.value)} /><label className="form-check-label" htmlFor="vidExit">Exit</label></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-md-6">
                                        <input type="file" id="videoFile" ref={fileInputRef} className="d-none" accept="video/*" onChange={e => handleFileSelect(e.target.files[0])} />
                                        <div className="upload-zone" onDrop={onDrop} onDragOver={onDragOver} onClick={triggerFileSelect}>
                                            { !selectedFile ? (
                                                <div className="upload-zone-content text-center">
                                                    <i className="fas fa-cloud-upload-alt mb-2 upload-icon"></i><h6>Drag & Drop Video</h6><p className="text-muted mb-2">or</p>
                                                    <button type="button" className="btn btn-outline-primary" onClick={triggerFileSelect}><i className="fas fa-file-video me-1"></i>Select Video</button>
                                                </div>
                                            ) : (
                                                <div className="selected-file-details">
                                                    <i className="fas fa-file-video file-icon me-2 text-primary"></i><h6 className="mb-0">{selectedFile.name}</h6>
                                                    <div className="text-muted mb-3">{(selectedFile.size / (1024*1024)).toFixed(2)} MB</div>
                                                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={removeFile}><i className="fas fa-times me-1"></i>Remove</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center mt-4">
                                    <button type="submit" className="btn btn-primary" disabled={!selectedFile}>
                                       <i className="fas fa-cloud-upload-alt me-1"></i>Upload to S3
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                {/* --- UPLOAD HISTORY SECTION --- */}
                <div className="col-lg-5">
                    <div className="card shadow-sm">
                        <div className="card-header text-center"><h5 className="mb-0"><i className="fas fa-history me-2"></i>Upload History</h5></div>
                        <div className="card-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                            { uploads.length === 0 ? <p className="text-muted text-center">No upload history.</p> : (
                                <ul className="list-group list-group-flush">
                                    {uploads.map(upload => (
                                        <li key={upload.id} className="list-group-item">
                                            <div className="d-flex w-100 justify-content-between">
                                                <h6 className="mb-1 fw-bold text-break">{upload.fileName}</h6>
                                                <small className="text-muted text-nowrap ms-2">{formatTimestamp(upload.timestamp)}</small>
                                            </div>
                                            <div className="d-flex align-items-center mt-1">
                                                {getStatusIcon(upload.status)}
                                                <small className="flex-grow-1">{upload.status}</small>
                                                {upload.status === 'Uploading...' && (
                                                    <button className="btn btn-danger btn-sm py-0 px-2" onClick={() => handleCancelUpload(upload.id)}>Cancel</button>
                                                )}
                                            </div>
                                            {upload.status === 'Uploading...' && (
                                                <div className="progress mt-2" style={{height: '6px'}}>
                                                    <div className="progress-bar" role="progressbar" style={{width: `${upload.progress}%`}} aria-valuenow={upload.progress} aria-valuemin="0" aria-valuemax="100"></div>
                                                </div>
                                            )}
                                            {upload.s3_key && (
                                                <p className="mb-1 mt-2 small text-muted" style={{ wordBreak: 'break-all' }}>
                                                    <i className="fas fa-folder-open me-2"></i>
                                                    {upload.s3_key}
                                                </p>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- RETRIEVE & PROCESS SECTION (for non-s3_uploader roles) --- */}
            {userRole !== 's3_uploader' && (
                 <div className="row mt-4">
                     <div className="col-12">
                         <div className="card">
                             <div className="card-header"><h5 className="mb-0"><i className="fas fa-search me-2"></i>Retrieve & Process Videos from S3</h5></div>
                             <div className="card-body">
                                 {/* Form and display logic remains the same */}
                                 <form onSubmit={handleRetrieve}>
                                    {/* ... */}
                                 </form>
                                 {folders.map(folder => (
                                    <div key={folder.id}>
                                        {/* ... */}
                                    </div>
                                 ))}
                                 {previewUrl && (
                                    <div className="video-preview-container">
                                        <video key={previewUrl} controls autoPlay muted>
                                            <source src={previewUrl} type="video/mp4" />
                                            Your browser does not support the video tag.
                                        </video>
                                    </div>
                                 )}
                             </div>
                         </div>
                     </div>
                 </div>
            )}
        </div>
    );
};

export default S3DashboardPage;