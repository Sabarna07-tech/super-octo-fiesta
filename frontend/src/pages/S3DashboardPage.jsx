import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { useTask } from '../context/TaskContext';

// Import all necessary API services
import {
    uploadVideoToS3,
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
    const [isUploading, setIsUploading] = useState(false);
    
    const [recentUploads, setRecentUploads] = useState(() => {
        try {
            const savedUploads = localStorage.getItem('uploadHistory');
            return savedUploads ? JSON.parse(savedUploads) : [];
        } catch (error) {
            console.error("Could not load upload history from localStorage:", error);
            return [];
        }
    });

    const abortControllerRef = useRef(null);
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
            localStorage.setItem('uploadHistory', JSON.stringify(recentUploads));
        } catch (error) {
            console.error("Could not save upload history to localStorage:", error);
            toast.warn("Could not save upload history. It will be lost on refresh.");
        }
    }, [recentUploads]);


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
                    setRecentUploads(prev => prev.map(up =>
                        up.id === uploadId ? { ...up, status: 'Verified on S3' } : up
                    ));
                    toast.success(`"${fileName}" has been successfully verified on S3.`);
                }
            } catch (error) {
                clearInterval(pollIntervalsRef.current[uploadId]);
                delete pollIntervalsRef.current[uploadId];
                console.error("Verification polling error:", error);
                setRecentUploads(prev => prev.map(up =>
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
        setIsUploading(true);
        abortControllerRef.current = new AbortController();
        
        const uploadId = Date.now();
        const newUpload = {
            id: uploadId,
            fileName: selectedFile.name,
            status: 'Uploading...',
            s3_key: null,
            timestamp: new Date().toISOString()
        };
        setRecentUploads(prev => [newUpload, ...prev].slice(0, 10));

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('upload_date', uploadDate);
        formData.append('camera_angle', cameraAngle);
        formData.append('video_type', videoType);
        formData.append('user_name', localStorage.getItem('username') || 'Unknown User');

        try {
            const response = await uploadVideoToS3(formData, abortControllerRef.current.signal);
            
            if (response.success && response.s3_key) {
                setRecentUploads(prev => prev.map(up => 
                    up.id === uploadId ? { ...up, status: 'Verifying...', s3_key: response.s3_key } : up
                ));
                toast.info(`Upload initiated for "${selectedFile.name}". Now verifying...`);
                pollForStatus(uploadId, response.s3_key, selectedFile.name);
            } else {
                throw new Error(response.error || "The server failed to process the upload request.");
            }
            
        } catch (error) {
             if (error.name !== 'AbortError') {
                console.error('S3 Upload Error:', error);
                toast.error(`Upload failed: ${error.message}`);
                setRecentUploads(prev => prev.map(up => up.id === uploadId ? { ...up, status: 'Failed' } : up));
            }
        } finally {
            setIsUploading(false);
            removeFile(null);
        }
    };

    const handleCancelUpload = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            toast.warn('Upload cancelled.');
            setRecentUploads(prev => prev.map(up => up.status === 'Uploading...' ? { ...up, status: 'Cancelled' } : up));
        }
    };

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
            const fullS3Key = `${folderName}/${videoName}`;
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

    const handleProcess = async (folderName) => {
        const folderToProcess = { name: folderName };
        await startS3FrameExtraction(folderToProcess);
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

    // --- DATE PICKER RESTRICTION LOGIC ---
    const today = new Date();
    const maxDate = today.toISOString().split('T')[0];
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);
    const minDate = twoDaysAgo.toISOString().split('T')[0];
    
    return (
        <div id="s3_dashboard_container">
            {/* --- UPLOAD SECTION --- */}
            <div className="row">
                <div className="col-lg-7">
                    <div className="card shadow-sm">
                        <div className="card-header bg-primary text-white text-center"><h5 className="mb-0"><i className="fas fa-upload me-2"></i>Upload Video to S3 Bucket</h5></div>
                        <div className="card-body">
                             <form onSubmit={handleUpload}>
                                <div className="row">
                                    <div className="col-md-6">
                                        <div className="mb-3">
                                            <label htmlFor="uploadDate" className="form-label">Video Date:</label>
                                            {/* ADDED min and max attributes to restrict dates */}
                                            <input
                                                type="date"
                                                className="form-control"
                                                id="uploadDate"
                                                value={uploadDate}
                                                onChange={e => setUploadDate(e.target.value)}
                                                min={minDate}
                                                max={maxDate}
                                                required
                                            />
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
                                    <button type="submit" className="btn btn-primary" disabled={!selectedFile || isUploading}>
                                        {isUploading ? <><span className="spinner-border spinner-border-sm me-2"></span>Uploading...</> : <><i className="fas fa-cloud-upload-alt me-1"></i>Upload to S3</>}
                                    </button>
                                    {isUploading && <button type="button" className="btn btn-sm btn-outline-danger ms-2" onClick={handleCancelUpload}><i className="fas fa-times me-1"></i>Cancel</button>}
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                {/* Upload History */}
                <div className="col-lg-5">
                    <div className="card shadow-sm">
                        <div className="card-header text-center"><h5 className="mb-0"><i className="fas fa-history me-2"></i>Upload History</h5></div>
                        <div className="card-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                            { recentUploads.length === 0 ? <p className="text-muted text-center">No upload history.</p> : (
                                <ul className="list-group list-group-flush">
                                    {recentUploads.map(upload => (
                                        <li key={upload.id} className="list-group-item">
                                            <div className="d-flex w-100 justify-content-between">
                                                <h6 className="mb-1 fw-bold">{upload.fileName}</h6>
                                                <small className="text-muted">{formatTimestamp(upload.timestamp)}</small>
                                            </div>
                                            <div className="d-flex align-items-center mt-1">
                                                {getStatusIcon(upload.status)}
                                                <small>{upload.status}</small>
                                            </div>
                                            {upload.status === 'Verified on S3' && (
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

            {userRole !== 's3_uploader' && (
                <>
                    {/* ... Retrieve and Process Section remains the same ... */}
                </>
            )}
        </div>
    );
};

export default S3DashboardPage;