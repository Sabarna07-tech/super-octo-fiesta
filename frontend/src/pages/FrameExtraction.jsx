import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { startFrameExtraction, cancelFrameExtra, getG4DNTaskStatus } from '../api/apiService.js';

const FrameExtraction = () => {
    const [clientId, setClientId] = useState('');
    const [retrieveDate, setRetrieveDate] = useState('');
    const [cameraAngle, setCameraAngle] = useState('left');
	const [direction, setDirection] = useState('entry');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [taskId, setTaskId] = useState(null);
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [extractionResult, setExtractionResult] = useState(null); // New state for the result
    const pollIntervalRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setRetrieveDate(today);

        // Cleanup on unmount
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);

    const taskCancel = async () => {
        if (!taskId) return;
        try {
            const res = await cancelFrameExtra(taskId);
            setStatus(res?.message || '');
            setError(res?.error || '');
            setTaskId(null);
            clearInterval(pollIntervalRef.current);
        } catch (err)
 {
            console.error(err);
            setError('Error while cancelling the task.');
        }
    };
    
    const pollTaskStatus = (id) => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }

        pollIntervalRef.current = setInterval(async () => {
            try {
                const data = await getG4DNTaskStatus(id);
                setProgress(data.progress || 0);
                setStatusText(data.status || 'Processing...');

                if (data.state === 'SUCCESS') {
                    clearInterval(pollIntervalRef.current);
                    setStatus('Frame extraction completed successfully!');
                    setError('');
                    setTaskId(null);
                    setExtractionResult(data.result); // Store the result from the backend
                } else if (data.state === 'FAILURE') {
                    clearInterval(pollIntervalRef.current);
                    setError(data.status || 'Task failed.');
                    setStatus('');
                    setTaskId(null);
                }
            } catch (err) {
                clearInterval(pollIntervalRef.current);
                setError('Failed to get task status.');
                setTaskId(null);
            }
        }, 2000);
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        if (taskId) {
            setStatus("Another task is already in progress. Please wait.");
            return;
        }
        setIsLoading(true);
        setStatus('');
        setError('');
        setExtractionResult(null); // Reset previous results
        setProgress(0);
        setStatusText('Starting task...');

        const payload = {
            date: retrieveDate,
            name: clientId,
            view: cameraAngle,
			direction: direction
        };

        try {
            const res = await startFrameExtraction(payload);
            if (res.task_id) {
                setTaskId(res.task_id);
                setStatus(res.message || 'Task started successfully.');
                pollTaskStatus(res.task_id);
            } else {
                setError(res?.error || 'Unknown response from server');
            }
        } catch (err) {
            console.error(err);
            setError('Error while starting the task. Please check server logs.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="data-section fade-in">
            <div className="section-header">
                <h2 className="section-title">Extract Frames</h2>
            </div>
            <div className="p-4">
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 150px' }}>
                            <label htmlFor="clientId" className="form-label fw-bold small">Client ID</label>
                            <input type="text" className="search-input w-100" id="clientId" value={clientId} onChange={e => setClientId(e.target.value)} required />
                        </div>
                        <div style={{ flex: '1 1 150px' }}>
                            <label htmlFor="retrieveDate" className="form-label fw-bold small">Date</label>
                            <input type="date" className="search-input w-100" id="retrieveDate" value={retrieveDate} onChange={e => setRetrieveDate(e.target.value)} required />
                        </div>
                        <div style={{ flex: '0 1 200px' }}>
                            <label className="form-label fw-bold small">Camera Angle</label>
                            <div className="d-flex gap-3 pt-2">
                                {['left', 'right', 'top'].map(view => (
                                    <div className="form-check" key={view}>
                                        <input className="form-check-input" type="radio" name="camera_angle" id={`camera_${view}`} value={view} checked={cameraAngle === view} onChange={e => setCameraAngle(e.target.value)} />
                                        <label className="form-check-label" htmlFor={`camera_${view}`}>{view.charAt(0).toUpperCase() + view.slice(1)}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
						
						<div style={{ flex: '0 1 200px' }}>
							<label className="form-label fw-bold small">Direction</label>
							<div className="d-flex gap-3 pt-2">
								{['entry', 'exit'].map(dir => (
									<div className="form-check" key={dir}>
										<input
											className="form-check-input"
											type="radio"
											name="direction"
											id={`direction_${dir}`}
											value={dir}
											checked={direction === dir}
											onChange={e => setDirection(e.target.value)}
										/>
										<label className="form-check-label" htmlFor={`direction_${dir}`}>
											{dir.charAt(0).toUpperCase() + dir.slice(1)}
										</label>
									</div>
								))}
							</div>
						</div>
						
                        <div style={{ flex: '1 1 auto' }}>
                            <button type="submit" className="action-btn primary w-100" disabled={isLoading || taskId}>
                                {isLoading ? <><span className="spinner-border spinner-border-sm me-2"></span>Starting...</> : <><i className="fas fa-play me-2"></i>Start Process</>}
                            </button>
                        </div>
                    </div>
                </form>
                
                {taskId && (
                    <div className="mt-4">
                        <h5 className="text-center">Processing Task </h5>
                        <p className="text-center text-muted">{statusText}</p>
                        <div className="progress" style={{ height: '20px' }}>
                            <div
                                className="progress-bar progress-bar-striped progress-bar-animated"
                                role="progressbar"
                                style={{ width: `${progress}%` }}
                                aria-valuenow={progress}
                                aria-valuemin="0"
                                aria-valuemax="100"
                            >
                                {progress}%
                            </div>
                        </div>
                        <div className="text-center mt-3">
                            <button onClick={taskCancel} className="btn btn-danger">
                                Cancel Process
                            </button>
                        </div>
                    </div>
                )}


                {status && !taskId && <div className="alert alert-success mt-4">{status}</div>}
                {error && <div className="alert alert-danger mt-4">{error}</div>}
                
                {extractionResult && (
                    <div className="alert alert-info mt-4">
                        <p className="mb-1"><strong>Extraction Result:</strong></p>
                        <p className="mb-0">Status: {extractionResult.status}</p>
                        <p className="mb-0">Message: {extractionResult.message}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FrameExtraction;