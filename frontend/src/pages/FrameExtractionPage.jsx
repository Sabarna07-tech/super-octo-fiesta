import React, { useState, useEffect, useRef } from 'react';

// FIX: Changed import paths to be relative.
import '../assets/css/upload.css';
import { startFrameExtraction, getTaskStatus } from '../api/apiService.js';
import { Link } from 'react-router-dom';

const FrameExtractionPage = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [videoPreview, setVideoPreview] = useState('');
    const [view, setView] = useState('upload');
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [results, setResults] = useState({ count: 0, frames: [] });
    const abortControllerRef = useRef(null);
    const pollIntervalRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setVideoPreview(URL.createObjectURL(file));
            setView('preview');
        }
    };

    const resetToUploadState = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }
        setSelectedFile(null);
        setVideoPreview('');
        setView('upload');
        setProgress(0);
        setStatusText('');
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }
        resetToUploadState();
        alert('Processing cancelled.');
    };

    const pollTaskStatus = (taskId) => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(async () => {
            try {
                const data = await getTaskStatus(taskId);
                if (data.state === 'SUCCESS') {
                    clearInterval(pollIntervalRef.current);
                    setResults({ count: data.result.count, frames: data.result.result || [] });
                    setView('results');
                } else if (data.state === 'FAILURE') {
                    clearInterval(pollIntervalRef.current);
                    alert('Processing failed: ' + data.status);
                    resetToUploadState();
                } else {
                    setProgress(data.progress || 0);
                    setStatusText(data.status || 'Processing...');
                }
            } catch (error) {
                console.error("Polling error:", error);
                clearInterval(pollIntervalRef.current);
                resetToUploadState();
            }
        }, 2000);
    };

    const handleExtractionSubmit = async (e) => {
        e.preventDefault();
        setView('processing');
        setProgress(0);
        setStatusText('Submitting...');

        abortControllerRef.current = new AbortController();

        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            const response = await startFrameExtraction(formData, abortControllerRef.current.signal);
            if (response.success) {
                pollTaskStatus(response.task_id);
            } else {
                alert('Error starting process: ' + response.error);
                resetToUploadState();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Extraction error:', error);
                alert('An unexpected error occurred during upload.');
                resetToUploadState();
            }
        }
    };

    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    return (
        <div>
            <div className="row mb-4">
                <div className="col-md-12">
                    <h2 className="page-title"><i className="fas fa-object-group me-2 text-success"></i>Frame Extraction</h2>
                    <nav aria-label="breadcrumb">
                        <ol className="breadcrumb">
                            {/* FIX: Changed <a> tag to <Link> for proper SPA navigation */}
                            <li className="breadcrumb-item"><Link to="/">Home</Link></li>
                            <li className="breadcrumb-item active">Frame Extraction</li>
                        </ol>
                    </nav>
                    <hr />
                </div>
            </div>

            <div className="row justify-content-center">
                <div className="col-lg-8">
                    {view === 'upload' && (
                        <div className="card shadow-sm mb-4">
                            <div className="card-header bg-light"><h5 className="mb-0"><i className="fas fa-video me-2"></i>1. Select Local Video for Extraction</h5></div>
                            <div className="card-body">
                                <input type="file" className="form-control" onChange={handleFileChange} accept="video/*" />
                            </div>
                        </div>
                    )}

                    {view === 'preview' && (
                        <div className="card shadow-sm mb-4">
                            <div className="card-header bg-light d-flex justify-content-between align-items-center">
                                <h5 className="mb-0"><i className="fas fa-play-circle me-2"></i>2. Preview and Confirm</h5>
                                <button type="button" onClick={resetToUploadState} className="btn btn-sm btn-outline-secondary">
                                    <i className="fas fa-exchange-alt me-1"></i> Change Video
                                </button>
                            </div>
                            <div className="card-body text-center">
                                <video src={videoPreview} className="img-fluid rounded" controls></video>
                                <p className="mt-2 text-muted">{selectedFile?.name}</p>
                                <div className="text-center mt-3">
                                    <button type="button" onClick={handleExtractionSubmit} className="btn btn-success btn-lg">
                                        <i className="fas fa-cogs me-2"></i>Start Extraction
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'processing' && (
                        <div className="card shadow-sm mb-4">
                            <div className="card-header bg-light"><h5 className="mb-0"><i className="fas fa-sync-alt fa-spin me-2"></i>Processing Video</h5></div>
                            <div className="card-body text-center p-5">
                                <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
                                    <span className="visually-hidden">Loading...</span>
                                </div>
                                <h4 className="mt-3">Extracting frames, please wait...</h4>
                                <p className="text-muted">{statusText}</p>
                                <div className="progress mt-4">
                                    <div className="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style={{ width: `${progress}%` }}>{progress}%</div>
                                </div>
                                <div className="mt-4">
                                    <button className="btn btn-outline-danger" onClick={handleCancel}>
                                        <i className="fas fa-times me-2"></i>Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {view === 'results' && (
                        <div className="card shadow-sm">
                             <div className="card-header d-flex justify-content-between align-items-center">
                                <h5 className="mb-0"><i className="fas fa-images me-2"></i>Extraction Results</h5>
                                <button onClick={resetToUploadState} className="btn btn-sm btn-primary">
                                    <i className="fas fa-redo me-2"></i>Start New Extraction
                                </button>
                            </div>
                            <div className="card-body">
                                <div className="alert alert-success">Successfully extracted {results.count} frames.</div>
                                <div className="row g-2">
                                    {results.frames && results.frames.length > 0 ? (
                                        results.frames.map((frame, index) => (
                                            <div key={index} className="col-lg-3 col-md-4 col-6 mb-2">
                                                <img src={`http://127.0.0.1:5000/${frame}`} alt={`Extracted Frame ${index + 1}`} className="img-fluid rounded shadow-sm" />
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center text-muted">No wagons were detected in the video.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FrameExtractionPage;