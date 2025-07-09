import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../assets/css/damage_detection.css';

const StatusItem = ({ icon, badgeClass, title, subtitle, status }) => (
    <div className="status-item d-flex align-items-center mb-3">
        <div className="status-icon me-3">
            <span className={`status-badge bg-${badgeClass}`}><i className={`fas ${icon}`}></i></span>
        </div>
        <div className="status-text flex-grow-1">
            <h6 className="mb-0">{title}</h6>
            <small className="text-muted">{subtitle}</small>
        </div>
        <div className="status-state">
            <span className={`badge bg-${badgeClass}`}>{status}</span>
        </div>
    </div>
);


const DamageDetectionPage = () => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [videos, setVideos] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState('');
    const [view, setView] = useState('form'); // form, preview, processing, results
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState([
        { id: 'init', title: 'Initializing detection algorithm', subtitle: 'Setting up environment and loading models', state: 'waiting' },
        { id: 'extract', title: 'Frame extraction', subtitle: 'Extracting frames from video for analysis', state: 'waiting' },
        { id: 'object', title: 'Object detection', subtitle: 'Identifying wagon components in each frame', state: 'waiting' },
        { id: 'analysis', title: 'Damage analysis', subtitle: 'Analyzing detected components for damages', state: 'waiting' },
        { id: 'report', title: 'Report generation', subtitle: 'Generating detailed report of detected damages', state: 'waiting' },
    ]);
    
    // Mock video fetching
    useEffect(() => {
        if (selectedDate) {
            setVideos(['video_wagon_1.mp4', 'video_wagon_2.mp4']);
        } else {
            setVideos([]);
        }
    }, [selectedDate]);

    const handleProcess = (e) => {
        e.preventDefault();
        if (!selectedVideo) {
            alert('Please select a video.');
            return;
        }
        setView('processing');
        // Mock processing
        const interval = setInterval(() => {
            setProgress(prev => {
                const next = prev + 10;
                if (next >= 100) {
                    clearInterval(interval);
                    setTimeout(() => setView('results'), 500);
                    return 100;
                }
                return next;
            });
        }, 500);
    };
    
    const handleNewDetection = () => {
        setView('form');
        setProgress(0);
        setSelectedVideo('');
    }

    const getStatusProps = (state) => {
        if (state === 'in-progress') return { icon: 'fa-spinner fa-spin', badgeClass: 'primary', statusText: 'In Progress' };
        if (state === 'completed') return { icon: 'fa-check', badgeClass: 'success', statusText: 'Completed' };
        return { icon: 'fa-clock', badgeClass: 'secondary', statusText: 'Waiting' };
    };

    return (
        <div>
            <div className="row mb-4">
                <div className="col-md-12">
                    <h2 className="page-title"><i className="fas fa-search me-2 text-success"></i>Wagon Damage Detection</h2>
                    <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Home</Link></li><li className="breadcrumb-item active">Damage Detection</li></ol></nav>
                    <hr />
                </div>
            </div>

            {view === 'form' && (
                <div className="card shadow-sm mb-4">
                    <div className="card-header text-center"><h5 className="mb-0"><i className="fas fa-calendar-alt me-2"></i>Select Date and Video</h5></div>
                    <div className="card-body">
                        <form onSubmit={handleProcess}>
                            <div className="row g-4">
                                <div className="col-md-6"><label htmlFor="dateInput" className="form-label">Select Date</label><input type="date" className="form-control" id="dateInput" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required /></div>
                                <div className="col-md-6"><label htmlFor="videoSelect" className="form-label">Select Video</label><select className="form-select" id="videoSelect" value={selectedVideo} onChange={e => setSelectedVideo(e.target.value)} disabled={videos.length === 0} required><option value="">{videos.length > 0 ? 'Choose a video...' : 'No videos available'}</option>{videos.map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                            </div>
                            <div className="d-grid gap-2 col-md-6 mx-auto mt-4"><button type="submit" className="btn btn-success btn-lg" disabled={videos.length === 0}><i className="fas fa-cog me-2"></i>Process Video</button></div>
                        </form>
                    </div>
                </div>
            )}
            
            {view === 'processing' && (
                <div className="card shadow-sm">
                    <div className="card-header text-center"><h5 className="mb-0"><i className="fas fa-cogs me-2"></i>Processing Status</h5></div>
                    <div className="card-body">
                         <h4 className="text-center mb-4">Processing Video for Damage Detection</h4>
                         <div className="progress mb-4" style={{ height: '25px' }}><div className="progress-bar progress-bar-striped progress-bar-animated bg-success" style={{ width: `${progress}%` }}>{progress}%</div></div>
                         <div className="status-list">
                            {status.map(s => {
                                let state = 'waiting';
                                if (progress < 20) { if (s.id === 'init') state = 'in-progress'; }
                                else if (progress < 40) { if (s.id === 'init') state = 'completed'; if (s.id === 'extract') state = 'in-progress'; }
                                else if (progress < 60) { if (s.id === 'extract' || s.id === 'init') state = 'completed'; if (s.id === 'object') state = 'in-progress'; }
                                else if (progress < 80) { if (s.id === 'object' || s.id==='extract' || s.id==='init') state = 'completed'; if (s.id === 'analysis') state = 'in-progress'; }
                                else { state = 'completed'; }
                                const props = getStatusProps(state);
                                return <StatusItem key={s.id} title={s.title} subtitle={s.subtitle} icon={props.icon} badgeClass={props.badgeClass} status={props.statusText} />
                             })}
                         </div>
                    </div>
                </div>
            )}
            
            {view === 'results' && (
                <div className="card shadow-sm">
                    <div className="card-header text-center"><h5 className="mb-0"><i className="fas fa-clipboard-check me-2"></i>Detection Results</h5></div>
                    <div className="card-body">
                        <div className="alert alert-success"><i className="fas fa-check-circle me-2"></i>Processing complete!</div>
                         {/* Results summary and table would be populated from API data */}
                        <div className="mt-4 text-center"><button className="btn btn-secondary" onClick={handleNewDetection}><i className="fas fa-redo me-2"></i>New Detection</button></div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DamageDetectionPage;