import React, { useEffect, useState, useRef } from 'react';
import Chart from 'chart.js/auto';
// FIX: Corrected the import path to be a standard relative path without the extension.
import { getSystemStatus, getChartData, getComparisonDetails, getDamageCounts, getComparisonDates, getAllComparisons } from '../api/apiService';
import { toast } from 'react-toastify';
import { Box, MenuItem, Select, FormControl, InputLabel, IconButton, Tooltip } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { format, parse, isWithinInterval, subWeeks, subMonths, subYears, isSameDay, parseISO } from 'date-fns';

// Define BASE_PREFIX for S3 path construction
const BASE_PREFIX = '2024_Oct_CR_WagonDamageDetection/Wagon_H';

// --- Sub-component for Left/Right View ---
const renderDetailTable = (detailData) => (
    <table className="table table-sm table-borderless" style={{'--bs-table-bg': 'transparent'}}>
        <thead className="table-light">
            <tr><th>Old</th><th>New</th><th>Resolved</th><th>Image</th></tr>
        </thead>
        <tbody>
            {detailData && detailData.length > 0 ? (
                detailData.map((detail, index) => (
                    <tr key={index}>
                        <td>{detail.old}</td><td>{detail.new}</td><td>{detail.resolved}</td>
                        <td>
                            {detail.image ? (
                                <a href={detail.image} target="_blank" rel="noopener noreferrer"><img src={detail.image} alt="damage" style={{ width: '150px', borderRadius: '4px' }} /></a>
                            ) : <span className="text-muted">No Image</span>}
                        </td>
                    </tr>
                ))
            ) : (
                <tr><td colSpan="4" className="text-muted text-center py-3">No details found.</td></tr>
            )}
        </tbody>
    </table>
);

// --- Sub-component specifically for Top View, matching the new design ---
const renderTopViewDetailTable = (detailData) => (
    <table className="table table-sm table-borderless" style={{'--bs-table-bg': 'transparent'}}>
        <thead className="table-light">
            <tr><th>Damage Type</th><th>Count</th><th>Image</th></tr>
        </thead>
        <tbody>
            {detailData && detailData.length > 0 ? (
                detailData.map((detail, index) => (
                    <tr key={index}>
                        {detail.status ? (
                            <td colSpan="3" className="text-muted text-center">
                                {detail.status}
                                {detail.image && <a href={detail.image} target="_blank" rel="noopener noreferrer" className="ms-2"><i className="fas fa-image"></i></a>}
                            </td>
                        ) : (
                            <>
                                <td>{detail.type}</td>
                                <td>{detail.count}</td>
                                <td>
                                    {detail.image ? (
                                        <a href={detail.image} target="_blank" rel="noopener noreferrer"><img src={detail.image} alt={detail.type} style={{ width: '150px', borderRadius: '4px' }} /></a>
                                    ) : <span className="text-muted">No Image</span>}
                                </td>
                            </>
                        )}
                    </tr>
                ))
            ) : (
                <tr><td colSpan="3" className="text-muted text-center py-3">No details available.</td></tr>
            )}
        </tbody>
    </table>
);

// Helper to count class labels in a damage list
const renderLabelCounts = (damageList, title) => {
    if (!damageList || damageList.length === 0) return (
        <div style={{marginBottom: '1rem', color: '#222'}}><h6 style={{color:'#1a202c', fontWeight:600}}>{title}</h6><div className="text-muted">No data</div></div>
    );
    // Count occurrences of each label
    const counts = {};
    damageList.forEach(d => {
        if (d.label) counts[d.label] = (counts[d.label] || 0) + 1;
    });
    return (
        <div style={{marginBottom: '1rem', color: '#222'}}>
            <h6 style={{color:'#1a202c', fontWeight:600}}>{title}</h6>
            <ul style={{margin:0, paddingLeft: '1.2em', color:'#222', fontWeight:500}}>
                {Object.entries(counts).map(([label, count]) => (
                    <li key={label} style={{color:'#222'}}><strong>{label}</strong>: {count}</li>
                ))}
            </ul>
        </div>
    );
};

// Helper to render a table of class counts for left/right
const renderClassCountTable = (data) => {
    // Gather all unique class labels from OLD, NEW, RESOLVED
    const allLabels = new Set();
    ['OLD', 'NEW', 'RESOLVED'].forEach(status => {
        (data?.[status] || []).forEach(d => {
            if (d.label) allLabels.add(d.label);
        });
    });
    const labels = Array.from(allLabels).sort();
    // Helper to count per status
    const getCount = (status, label) => (data?.[status] || []).filter(d => d.label === label).length;
    return (
        <table className="table table-sm table-bordered" style={{marginBottom: '1rem'}}>
            <thead>
                <tr>
                    <th>Status</th>
                    {labels.map(label => <th key={label}>{label}</th>)}
                </tr>
            </thead>
            <tbody>
                {['OLD', 'NEW', 'RESOLVED'].map(status => (
                    <tr key={status}>
                        <td>{status}</td>
                        {labels.map(label => <td key={label}>{getCount(status, label)}</td>)}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

// --- Modal for Comparison Table Details ---
const ComparisonDetailModal = ({ isOpen, onClose, data, details, isLoading }) => {
    const [showWagonDetails, setShowWagonDetails] = useState(false);

    useEffect(() => {
        setShowWagonDetails(false);
    }, [data]);

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-backdrop fade show" style={{ backdropFilter: 'blur(6px)', background: 'rgba(0,0,0,0.3)' }}></div>
            <div className="modal fade show" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content" style={{ background: "#1E3A8A" }}>
                        <div className="modal-header" style={{ background: '#1E3A8A', color: '#fff', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
                            <h5 className="modal-title">Comparison Details for {data?.id}</h5>
                            <button
                                type="button"
                                className="custom-close-btn"
                                onClick={onClose}
                                aria-label="Close"
                                style={{ position: 'absolute', top: '6px', right: '12px', zIndex: 2 }}
                            >
                                <i className="fas fa-times" style={{ fontSize: '1.2rem', lineHeight: '1' }}></i>
                            </button>
                        </div>
                        <div className="modal-body">
                            <table className="table mb-4">
                                <thead><tr><th>Train ID</th><th>Wagons</th><th>Left View Variations</th><th>Right View Variations</th><th>Top View Variations</th><th>Actions</th></tr></thead>
                                <tbody>
                                    <tr>
                                        <td>{data?.id}</td><td>{data?.wagons}</td><td>{data?.left_damages}</td>
                                        <td>{data?.right_damages}</td><td>{data?.top_damages}</td>
                                        <td>
                                            <button className="action-btn primary" onClick={() => setShowWagonDetails(!showWagonDetails)} disabled={isLoading}>
                                                {isLoading ? <span className="spinner-border spinner-border-sm"></span> : (showWagonDetails ? 'Hide Details' : 'View Details')}
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {showWagonDetails && (
                                <div className="mt-4">
                                    <h6 className="mb-3">Wagon Frame Details</h6>
                                    {isLoading ? (
                                        <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
                                    ) : (
                                        <div className="table-responsive" style={{maxHeight: '50vh'}}>
                                            <table className="table table-bordered table-hover">
                                                <thead className="table-light"><tr><th className="align-middle text-center" style={{width: '100px'}}>Wagon #</th><th className="text-center">Left View</th><th className="text-center">Right View</th><th className="text-center">Top View</th></tr></thead>
                                                <tbody>
                                                    {details && details.length > 0 ? details.map((wagon, index) => (
                                                        <tr key={wagon.wagon_id}>
                                                            <td className="text-center align-middle"><strong>{`WAG${index + 1}`}</strong></td>
                                                            <td className="p-0">{renderDetailTable(wagon.left_view_details)}</td>
                                                            <td className="p-0">{renderDetailTable(wagon.right_view_details)}</td>
                                                            <td className="p-0">{renderTopViewDetailTable(wagon.top_view_details)}</td>
                                                        </tr>
                                                    )) : <tr><td colSpan="4" className="text-muted text-center py-4">No wagon details available.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer"><button type="button" className="custom-close-btn text-btn" onClick={onClose}>Close</button></div>
                    </div>
                </div>
            </div>
        </>
    );
};

// --- Modal for a single view (Left/Right/Top) ---
const ComparisonViewModal = ({ isOpen, onClose, entry, view, selectedWagonIndex = null }) => {
    if (!isOpen || !entry || !view) return null;
    const wagons = entry.results[view] || [];
    
    // If a specific wagon is selected, filter to show only that wagon
    const wagonsToShow = selectedWagonIndex !== null ? [wagons[selectedWagonIndex]] : wagons;
    const wagonIndices = selectedWagonIndex !== null ? [selectedWagonIndex] : wagons.map((_, idx) => idx);
    
    return (
        <>
            <div className="modal-backdrop fade show" style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.3)' }}></div>
            <div className="modal fade show modal-animate-in" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content" style={{ background: '#1E3A8A', borderRadius: '1rem' }}>
                        <div className="modal-header" style={{background: '#1E3A8A', borderRadius: '1rem' }}>
                            <h5 className="modal-title">
                                {selectedWagonIndex !== null 
                                    ? `${view.charAt(0).toUpperCase() + view.slice(1)} Comparison - WAG${selectedWagonIndex + 1} (${entry.date})`
                                    : `${view.charAt(0).toUpperCase() + view.slice(1)} Comparison Result (${entry.date})`
                                }
                            </h5>
                            <button
                                type="button"
                                className="custom-close-btn"
                                onClick={onClose}
                                aria-label="Close"
                                style={{ position: 'absolute', top: '6px', right: '12px', zIndex: 2 }}
                            >
                                <i className="fas fa-times" style={{ fontSize: '1.2rem', lineHeight: '1' }}></i>
                            </button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', color: '#222' }}>
                            {wagonsToShow.length === 0 ? (
                                <div className="text-muted">No data found for this view.</div>
                            ) : wagonsToShow.map((data, idx) => {
                                const wagonIndex = wagonIndices[idx];
                                return (
                                    <div key={wagonIndex} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'stretch', marginBottom: '2rem', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: '#f8fafc', color: '#222' }}>
                                        {/* Wagon Image on top */}
                                        <div style={{ width: '100%', textAlign: 'center', marginBottom: '1rem' }}>
                                            {view === 'top' ? (
                                                <div><strong>Top Image:</strong><br />
                                                    {data?.image_url ? <img src={data.image_url} alt="Top" style={{maxWidth:'100%',maxHeight:260, borderRadius:8, boxShadow:'0 4px 24px rgba(0,0,0,0.12)'}} /> : <span className="text-muted">No image</span>}
                                                </div>
                                            ) : (
                                                <div><strong>Wagon Image:</strong><br />
                                                    {data?.image_url ? <img src={data.image_url} alt="Wagon" style={{maxWidth:'100%',maxHeight:260, borderRadius:8, boxShadow:'0 4px 24px rgba(0,0,0,0.12)'}} /> : <span className="text-muted">No image</span>}
                                                </div>
                                            )}
                                        </div>
                                        {/* Table below image */}
                                        <div style={{ width: '100%' }}>
                                            <h6 style={{marginBottom: '1rem', color:'#1a202c', fontWeight:700}}>Wagon: {`WAG${wagonIndex + 1}`}</h6>
                                            {view === 'top' ? (
                                                <table className="table table-sm table-bordered">
                                                    <thead><tr><th>Cracks</th><th>Gravel</th><th>Hole</th></tr></thead>
                                                    <tbody><tr>
                                                        <td>{data?.cracks ?? '-'}</td>
                                                        <td>{data?.gravel ?? '-'}</td>
                                                        <td>{data?.hole ?? '-'}</td>
                                                    </tr></tbody>
                                                </table>
                                            ) : (
                                                <>
                                                    {renderClassCountTable(data)}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="modal-footer"><button type="button" className="custom-close-btn text-btn" onClick={onClose}>Close</button></div>
                    </div>
                </div>
            </div>
        </>
    );
};

// Helper to normalize date to 'yyyy-MM-dd'
const normalizeDate = (dateStr) => {
    // Try parsing as 'yyyy-MM-dd'
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Try parsing as 'dd-MM-yyyy'
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split('-');
        return `${y}-${m}-${d}`;
    }
    // Fallback: try parseISO
    try {
        return format(parseISO(dateStr), 'yyyy-MM-dd');
    } catch {
        return dateStr;
    }
};

// --- The Main Dashboard Page Component ---
const NewDashboardPage = () => {
    const [selectedComparisonTrain, setSelectedComparisonTrain] = useState(null);
    const [isComparisonModalOpen, setComparisonModalOpen] = useState(false);
    const [comparisonDetails, setComparisonDetails] = useState(null);
    const [isComparisonLoading, setIsComparisonLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [chartsData, setChartsData] = useState(null);
    const [comparisonData, setComparisonData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // New state to track which view is selected for each entry
    const [selectedView, setSelectedView] = useState({}); // { [trainId]: 'left' | 'right' | 'top' }
    const [comparisonEntries, setComparisonEntries] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);
    const [selectedWagonIndex, setSelectedWagonIndex] = useState(null); // Track selected wagon index
    const [availableDates, setAvailableDates] = useState([]); // For calendar
    const [selectedDate, setSelectedDate] = useState(null);
    const [filterRange, setFilterRange] = useState('all');
    const pieChartRef = useRef(null);
    const weeklyLineChartRef = useRef(null); // <-- Add ref for new chart
    const [expandedRows, setExpandedRows] = useState({});

    const toggleRow = (index) => {
        // Close all other expanded rows when opening a new one
        setExpandedRows(prev => {
            const newState = {};
            if (!prev[index]) {
                // Opening this row, close all others
                newState[index] = true;
            }
            // If closing this row, all rows will be closed
            return newState;
        });
    };

    const handleWagonClick = (entry, wagonIndex, view) => {
        setSelectedEntry(entry);
        setSelectedView(view);
        setSelectedWagonIndex(wagonIndex);
        setModalOpen(true);
    };
    
    const handleOpenComparisonModal = async (trainData) => {
        setSelectedComparisonTrain(trainData);
        setComparisonModalOpen(true);
        setIsComparisonLoading(true);
        setComparisonDetails(null);

        try {
            const response = await getComparisonDetails(trainData.s3_path);
            if(response.success){
                setComparisonDetails(response.details);
            } else {
                toast.error(response.error || "Failed to fetch comparison details.");
            }
        } catch (error) {
            console.error("Error fetching comparison details:", error);
            toast.error("An error occurred while fetching details.");
        } finally {
            setIsComparisonLoading(false);
        }
    };
    
    const handleCloseComparisonModal = () => {
        setComparisonModalOpen(false);
        setSelectedComparisonTrain(null);
        setComparisonDetails(null);
    };

    useEffect(() => {
        setLoading(true);
        getAllComparisons().then(res => {
            if (res.success) {
                // Normalize all entry dates
                const normalizedEntries = res.comparisons.map(entry => ({ ...entry, date: normalizeDate(entry.date) }));
                setComparisonEntries(normalizedEntries);
                
                // Process comparison results to generate chart data
                const damageTypeCounts = {};
                const severityData = {};
                
                console.log('Processing comparison entries:', normalizedEntries);

                normalizedEntries.forEach(entry => {
                    console.log('Processing entry:', entry.date, entry.results);
                    
                    // Process left, right, and top view results
                    ['left', 'right', 'top'].forEach(view => {
                        if (entry.results[view]) {
                            console.log(`Processing ${view} view:`, entry.results[view]);
                            
                            entry.results[view].forEach(wagon => {
                                console.log(`Processing wagon in ${view} view:`, wagon);
                                
                                // For left/right views, check for damage classifications
                                if (view === 'left' || view === 'right') {
                                    // Check for OLD, NEW, RESOLVED damage types
                                    ['OLD', 'NEW', 'RESOLVED'].forEach(status => {
                                        if (wagon[status] && Array.isArray(wagon[status])) {
                                            wagon[status].forEach(damage => {
                                                if (damage.label) {
                                                    damageTypeCounts[damage.label] = (damageTypeCounts[damage.label] || 0) + 1;
                                                    severityData[damage.label] = (severityData[damage.label] || 0) + 1;
                                                    console.log(`Added ${damage.label} from ${view} view`);
                                                }
                                            });
                                        }
                                    });
                                }
                                // For top view, check for multiple possible data structures
                                else if (view === 'top') {
                                    // Check for detections array
                                    if (wagon.detections && Array.isArray(wagon.detections)) {
                                        wagon.detections.forEach(detection => {
                                            if (detection.class) {
                                                damageTypeCounts[detection.class] = (damageTypeCounts[detection.class] || 0) + 1;
                                                severityData[detection.class] = (severityData[detection.class] || 0) + 1;
                                                console.log(`Added ${detection.class} from top view detections`);
                                            }
                                        });
                                    }
                                    
                                    // Check for other possible structures like damage_list, damages, etc.
                                    if (wagon.damage_list && Array.isArray(wagon.damage_list)) {
                                        wagon.damage_list.forEach(damage => {
                                            if (damage.class || damage.label || damage.type) {
                                                const damageType = damage.class || damage.label || damage.type;
                                                damageTypeCounts[damageType] = (damageTypeCounts[damageType] || 0) + 1;
                                                severityData[damageType] = (severityData[damageType] || 0) + 1;
                                                console.log(`Added ${damageType} from top view damage_list`);
                                            }
                                        });
                                    }
                                    
                                    // Check for damages array
                                    if (wagon.damages && Array.isArray(wagon.damages)) {
                                        wagon.damages.forEach(damage => {
                                            if (damage.class || damage.label || damage.type) {
                                                const damageType = damage.class || damage.label || damage.type;
                                                damageTypeCounts[damageType] = (damageTypeCounts[damageType] || 0) + 1;
                                                severityData[damageType] = (severityData[damageType] || 0) + 1;
                                                console.log(`Added ${damageType} from top view damages`);
                                            }
                                        });
                                    }
                                    
                                    // Check for direct damage type properties
                                    ['scratch', 'dent', 'crack', 'rust', 'hole', 'wire', 'gunny_bag', 'open_door'].forEach(damageType => {
                                        if (wagon[damageType] && typeof wagon[damageType] === 'number' && wagon[damageType] > 0) {
                                            damageTypeCounts[damageType] = (damageTypeCounts[damageType] || 0) + wagon[damageType];
                                            severityData[damageType] = (severityData[damageType] || 0) + wagon[damageType];
                                            console.log(`Added ${wagon[damageType]} ${damageType} from top view direct properties`);
                                        }
                                    });
                                }
                            });
                        }
                    });
                });
                
                console.log('Final damage type counts:', damageTypeCounts);
                console.log('Final severity data:', severityData);
                
                // Convert to chart format
                const chartData = {
                    damage_types: {
                        labels: Object.keys(damageTypeCounts),
                        data: Object.values(damageTypeCounts)
                    }
                };
                
                setChartsData(chartData);
                setError(null);
            } else {
                setError(res.error || 'Failed to fetch data.');
            }
            setLoading(false);
        }).catch(err => {
            setError('Failed to fetch data.');
            setLoading(false);
        });
    }, []);

    // Fetch system status separately
    useEffect(() => {
        const fetchSystemStatus = async () => {
            try {
                const statusRes = await getSystemStatus();
                if (statusRes.error) {
                    console.error("Error fetching system status:", statusRes.error);
                } else {
                    setStats(statusRes);
                }
            } catch (err) {
                console.error("Failed to fetch system status:", err);
            }
        };
        
        fetchSystemStatus();
    }, []);

    useEffect(() => {
        if (!chartsData) return;
        const chartInstances = [];
        const createChart = (ctx, config) => {
            if (ctx) {
                const chart = new Chart(ctx, { ...config, options: { ...config.options, responsive: true, maintainAspectRatio: false, animation: true } });
                chartInstances.push(chart);
            }
        };
        // const damageCtx = document.getElementById('damageTypesChart');
        // if (chartsData.damage_types) createChart(damageCtx, { type: 'doughnut', data: { labels: chartsData.damage_types.labels, datasets: [{ data: chartsData.damage_types.data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } } } });
        // Use ref for pie chart
        if (pieChartRef.current && chartsData.damage_types) {
            createChart(pieChartRef.current, {
                type: 'pie',
                data: {
                    labels: chartsData.damage_types.labels,
                    datasets: [{
                        data: chartsData.damage_types.data,
                        backgroundColor: [
                            '#2C3E50', // Hole - Dark Slate Blue
                            '#27AE60', // Scratch - Green
                            '#5a8dc1', // Dent - Steel Blue
                            '#E74C3C', // Open Door - Red
                            '#8E44AD', // Crack - Purple
                            '#2C3E50', // Hole (repeated for more data points)
                            '#27AE60', // Scratch (repeated for more data points)
                            '#5a8dc1', // Dent (repeated for more data points)
                            '#E74C3C', // Open Door (repeated for more data points)
                            '#8E44AD', // Crack (repeated for more data points)
                            '#2C3E50', // Hole (repeated for more data points)
                            '#27AE60', // Scratch (repeated for more data points)
                            '#5a8dc1', // Dent (repeated for more data points)
                            '#E74C3C'  // Open Door (repeated for more data points)
                        ],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                boxWidth: 24,
                                boxHeight: 12,
                                padding: 24,
                                font: {
                                    size: 14,
                                    family: 'inherit',
                                    weight: '500'
                                },
                                color: '#374151'
                            }
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        animateScale: true,
                        animateRotate: true
                    }
                }
            });
        }
        const severityCtx = document.getElementById('severityTrendsChart');
        if (chartsData.damage_types) createChart(severityCtx, { 
            type: 'bar', 
            data: { 
                labels: chartsData.damage_types.labels, 
                datasets: [{ 
                    label: 'Damage Count', 
                    data: chartsData.damage_types.data, 
                    backgroundColor: [
                        '#2C3E50', // Hole - Dark Slate Blue
                        '#27AE60', // Scratch - Green
                        '#5a8dc1', // Dent - Steel Blue
                        '#E74C3C', // Open Door - Red
                        '#8E44AD'  // Crack - Purple
                    ] 
                }] 
            }, 
            options: { 
                plugins: { 
                    legend: { display: false } 
                } 
            } 
        });
        // --- New: Weekly Trains Processed Line Chart ---
        if (weeklyLineChartRef.current && comparisonEntries.length > 0) {
            // Group entries by week (ISO week)
            const weekMap = {};
            comparisonEntries.forEach(entry => {
                const date = new Date(entry.date);
                // Get ISO week string: 'YYYY-Www'
                const year = date.getFullYear();
                const week = getISOWeek(date);
                const key = `${year}-W${week.toString().padStart(2, '0')}`;
                weekMap[key] = (weekMap[key] || 0) + 1;
            });
            // Sort weeks chronologically
            const sortedWeeks = Object.keys(weekMap).sort();
            const weekLabels = sortedWeeks;
            const weekCounts = sortedWeeks.map(w => weekMap[w]);
            createChart(weeklyLineChartRef.current, {
                type: 'line',
                data: {
                    labels: weekLabels,
                    datasets: [{
                        label: 'Trains Processed',
                        data: weekCounts,
                        borderColor: '#B0C4DE',
                        backgroundColor: 'rgba(176, 196, 222, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#B0C4DE',
                        pointBorderColor: '#fff',
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: true }
                    },
                    scales: {
                        x: { title: { display: true, text: 'Week' } },
                        y: { title: { display: true, text: 'Trains' }, beginAtZero: true, precision: 0 }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 800 }
                }
            });
        }
        return () => chartInstances.forEach(chart => chart.destroy());
    }, [chartsData, comparisonEntries]);

    // --- Helper: Get ISO week number ---
    function getISOWeek(date) {
        const tmp = new Date(date.valueOf());
        const dayNum = (date.getDay() + 6) % 7;
        tmp.setDate(tmp.getDate() - dayNum + 3);
        const firstThursday = tmp.valueOf();
        tmp.setMonth(0, 1);
        if (tmp.getDay() !== 4) {
            tmp.setMonth(0, 1 + ((4 - tmp.getDay()) + 7) % 7);
        }
        return 1 + Math.ceil((firstThursday - tmp) / 604800000);
    }

    console.log('comparisonData', comparisonData);

    // Filtering logic for table
    const getFilteredEntries = () => {
        let filtered = comparisonEntries;
        if (selectedDate) {
            filtered = filtered.filter(entry => isSameDay(parse(entry.date, 'yyyy-MM-dd', new Date()), selectedDate));
        }
        const now = new Date();
        switch (filterRange) {
            case 'recent':
                filtered = filtered.slice(-1); // Most recent
                break;
            case 'week':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subWeeks(now, 1), end: now }));
                break;
            case 'month':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subMonths(now, 1), end: now }));
                break;
            case '3months':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subMonths(now, 3), end: now }));
                break;
            case '6months':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subMonths(now, 6), end: now }));
                break;
            case 'year':
                filtered = filtered.filter(entry => isWithinInterval(parse(entry.date, 'yyyy-MM-dd', new Date()), { start: subYears(now, 1), end: now }));
                break;
            default:
                break;
        }
        // Create a shallow copy and sort by date descending
        const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
        return sorted;
    };

    const totalTrains = comparisonEntries.length;
    const totalLeft = comparisonEntries.reduce((sum, entry) => Array.isArray(entry.results?.left) ? sum + entry.results.left.length : sum, 0);
    const totalRight = comparisonEntries.reduce((sum, entry) => Array.isArray(entry.results?.right) ? sum + entry.results.right.length : sum, 0);
    const totalTop = comparisonEntries.reduce((sum, entry) => Array.isArray(entry.results?.top) ? sum + entry.results.top.length : sum, 0);
    const totalVariations = totalLeft + totalRight + totalTop;

    return (
        <>
            <div className="fade-in">
                <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', marginBottom: 32 }}>
                    <div className="kpi-card" style={{ minWidth: 0, width: '100%' }}><div className="kpi-header"><span className="kpi-title">Total Trains</span><div className="kpi-icon primary"><i className="fas fa-train"></i></div></div><div className="kpi-value">{totalTrains}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>All time</span></div></div>
                    <div className="kpi-card" style={{ minWidth: 0, width: '100%' }}><div className="kpi-header"><span className="kpi-title">Variations Observed</span><div className="kpi-icon primary"><i className="fas fa-exclamation-triangle"></i></div></div><div className="kpi-value">{totalVariations}</div><div style={{ fontSize: '0.95em', color: '#666', fontWeight: 500, marginTop: 4 }}>
                        Left: {totalLeft} &nbsp;|&nbsp; Right: {totalRight} &nbsp;|&nbsp; Top: {totalTop}
                    </div></div>
                    <div className="kpi-card" style={{ minWidth: 0, width: '100%' }}><div className="kpi-header"><span className="kpi-title">Processing Rate</span><div className="kpi-icon primary"><i className="fas fa-tachometer-alt"></i></div></div><div className="kpi-value">{stats?.processing_speed ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>Efficiency</span></div></div>
                </div>

                {/* --- Update charts-section to 3 columns --- */}
                <div className="charts-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginBottom: 32 }}>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Weekly Trains Processed</h3></div><div className="chart-container" style={{minHeight: 250}}><canvas ref={weeklyLineChartRef}></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Types Distribution</h3></div><div className="chart-container"><div className="chart-container" style={{minHeight: 250}}><canvas ref={pieChartRef}></canvas></div></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Severity Trends</h3></div><div className="chart-container"><canvas id="severityTrendsChart"></canvas></div></div>
                </div>

                <div className="data-section mt-4">
                    <div className="section-header" style={{display:'flex',alignItems:'center',gap:16}}>
                        <h2 className="section-title">Comparison Entries</h2>
                        <LocalizationProvider dateAdapter={AdapterDateFns}>
                            <DatePicker
                                label="Select Date"
                                value={selectedDate}
                                onChange={date => setSelectedDate(date)}
                                renderInput={({ inputRef, inputProps, InputProps }) => (
                                    <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
                                        <input ref={inputRef} {...inputProps} style={{ display: 'none' }} />
                                        <Tooltip title="Calendar">
                                            <IconButton>{InputProps?.endAdornment || <CalendarMonthIcon />}</IconButton>
                                        </Tooltip>
                                    </Box>
                                )}
                                shouldDisableDate={date => {
                                    // Only enable availableDates (all normalized)
                                    return !availableDates.some(d => isSameDay(parse(d, 'yyyy-MM-dd', new Date()), date));
                                }}
                                disableFuture
                                clearable
                            />
                        </LocalizationProvider>
                        <FormControl size="small" sx={{ minWidth: 160, ml: 2 }}>
                            <InputLabel>Filter</InputLabel>
                            <Select
                                value={filterRange}
                                label="Filter"
                                onChange={e => setFilterRange(e.target.value)}
                            >
                                <MenuItem value="all">All</MenuItem>
                                <MenuItem value="recent">Most Recent</MenuItem>
                                <MenuItem value="week">Last Week</MenuItem>
                                <MenuItem value="month">Last Month</MenuItem>
                                <MenuItem value="3months">Past 3 Months</MenuItem>
                                <MenuItem value="6months">Past 6 Months</MenuItem>
                                <MenuItem value="year">Past Year</MenuItem>
                            </Select>
                        </FormControl>
                        <button className="action-btn outline" style={{marginLeft:8}} onClick={() => { setSelectedDate(null); setFilterRange('all'); }}>Reset</button>
                    </div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}></th>
                                    <th>Date</th>
                                    <th>User</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={4} className="text-center text-muted">Loading...</td></tr>
                                ) : error ? (
                                    <tr><td colSpan={4} className="text-center text-danger">{error}</td></tr>
                                ) : getFilteredEntries().length === 0 ? (
                                    <tr><td colSpan={4} className="text-center text-muted">No data found.</td></tr>
                                ) : (
                                    getFilteredEntries().map((entry, idx) => {
                                        const isExpanded = expandedRows[idx];
                                        const wagonCount = entry.results?.left?.length || entry.results?.right?.length || entry.results?.top?.length || 0;
                                        
                                        // Generate custom wagon data for the dropdown
                                        const wagonsData = Array.from({ length: wagonCount }, (_, i) => {
                                            const wagonId = `WAG${i + 1}`;
                                            // Determine status based on dummy logic
                                            let status = 'Clean';
                                            if (entry.results?.left?.[i]?.NEW?.length > 0 || entry.results?.right?.[i]?.NEW?.length > 0) {
                                                status = 'Damaged';
                                            } else if (entry.results?.left?.[i]?.OLD?.length > 0 || entry.results?.right?.[i]?.OLD?.length > 0) {
                                                status = 'Warning';
                                            } else if (entry.results?.top?.[i] && (entry.results.top[i].cracks > 0 || entry.results.top[i].hole > 0 || entry.results.top[i].gravel > 0)) {
                                                status = 'Damaged';
                                            }
                                            return { id: wagonId, status: status };
                                        });

                                        return (
                                            <React.Fragment key={idx}>
                                                <tr className={`expandable-row ${isExpanded ? 'expanded' : ''}`} onClick={() => toggleRow(idx)}>
                                                    <td>
                                                        <i className={`fas ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} expand-icon ${isExpanded ? 'expanded' : ''}`}></i>
                                                    </td>
                                                    <td>{entry.date}</td>
                                                    <td>{entry.user}</td>
                                                    <td>
                                                        {['left','right','top'].map(view => (
                                                            <button
                                                                key={view}
                                                                className="action-btn primary me-2"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedEntry(entry); setSelectedView(view); setModalOpen(true); }}
                                                                disabled={!entry.results[view]}
                                                            >
                                                                {view.charAt(0).toUpperCase() + view.slice(1)}
                                                            </button>
                                                        ))}
                                                    </td>
                                                </tr>
                                                <tr className="expanded-content">
                                                    <td colSpan="4">
                                                        <div className="expanded-details">
                                                            <h4 style={{ marginBottom: '1rem', color: '#333' }}>Wagon Details ({wagonCount} Wagons)</h4>
                                                            <div className="wagon-grid">
                                                                {wagonsData.map((wagon, wagonIndex) => (
                                                                    <div key={wagon.id} className={`wagon-card ${wagon.status.toLowerCase()}`}>
                                                                        <div className="wagon-id">{wagon.id}</div>
                                                                        <div className="wagon-status">{wagon.status}</div>
                                                                        <div className="wagon-actions">
                                                                            {['left', 'right', 'top'].map(view => (
                                                                                <button
                                                                                    key={view}
                                                                                    className="wagon-action-btn"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleWagonClick(entry, wagonIndex, view);
                                                                                    }}
                                                                                    disabled={!entry.results[view] || !entry.results[view][wagonIndex]}
                                                                                    title={`View ${view.charAt(0).toUpperCase() + view.slice(1)} Data`}
                                                                                >
                                                                                    {view.charAt(0).toUpperCase()}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <ComparisonDetailModal 
                isOpen={isComparisonModalOpen} 
                onClose={handleCloseComparisonModal} 
                data={selectedComparisonTrain}
                details={comparisonDetails}
                isLoading={isComparisonLoading}
            />
            <ComparisonViewModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setSelectedWagonIndex(null);
                }}
                entry={selectedEntry}
                view={selectedView}
                selectedWagonIndex={selectedWagonIndex}
            />
        </>
    );
};

export default NewDashboardPage;
