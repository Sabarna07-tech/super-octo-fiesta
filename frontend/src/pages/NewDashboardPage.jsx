import React, { useEffect, useState } from 'react';
import Chart from 'chart.js/auto';
// Import the new API function and toast for notifications
import { getSystemStatus, getChartData, getComparisonDetails, getDamageCounts } from '../api/apiService';
import { toast } from 'react-toastify';


// --- Sub-component to render the detailed damage table ---
const renderDetailTable = (detailData) => (
    <table className="table table-sm table-borderless" style={{'--bs-table-bg': 'transparent'}}>
        <thead className="table-light">
            <tr>
                <th>Old</th>
                <th>New</th>
                <th>Resolved</th>
                <th>Image</th>
            </tr>
        </thead>
        <tbody>
            {detailData && detailData.length > 0 ? (
                detailData.map((detail, index) => (
                    <tr key={index}>
                        <td>{detail.old}</td>
                        <td>{detail.new}</td>
                        <td>{detail.resolved}</td>
                        <td>
                            {detail.image ? (
                                <a href={detail.image} target="_blank" rel="noopener noreferrer">
                                    <img src={detail.image} alt="damage" style={{ width: '150px', borderRadius: '4px', cursor: 'pointer' }} />
                                </a>
                            ) : (
                                <span className="text-muted">No Image</span>
                            )}
                        </td>
                    </tr>
                ))
            ) : (
                <tr>
                    <td colSpan="4" className="text-muted text-center py-3">No details found.</td>
                </tr>
            )}
        </tbody>
    </table>
);

// --- Modal for Comparison Table Details (Upgraded for Live Data) ---
const ComparisonDetailModal = ({ isOpen, onClose, data, details, isLoading }) => {
    const [showWagonDetails, setShowWagonDetails] = useState(false);

    useEffect(() => {
        // Reset the details view when a new train is selected
        setShowWagonDetails(false);
    }, [data]);

    if (!isOpen) {
        return null;
    }

    return (
        <>
            <div className="modal-backdrop fade show"></div>
            <div className="modal fade show" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Comparison Details for {data?.id}</h5>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body">
                            <table className="table mb-4">
                                <thead><tr><th>Train ID</th><th>Wagons</th><th>Left View Damages</th><th>Right View Damages</th><th>Top View Damages</th><th>Actions</th></tr></thead>
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
                                                <thead className="table-light"><tr><th className="align-middle text-center" style={{width: '100px'}}>Wagon #</th><th className="text-center">Left View</th><th className="text-center">Right View</th></tr></thead>
                                                <tbody>
                                                    {details && details.length > 0 ? details.map(wagon => (
                                                        <tr key={wagon.wagon_id}>
                                                            <td className="text-center align-middle"><strong>{wagon.wagon_id}</strong></td>
                                                            <td className="p-0">{renderDetailTable(wagon.left_view_details)}</td>
                                                            <td className="p-0">{renderDetailTable(wagon.right_view_details)}</td>
                                                        </tr>
                                                    )) : <tr><td colSpan="3" className="text-muted text-center py-4">No wagon details available.</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer"><button type="button" className="action-btn outline" onClick={onClose}>Close</button></div>
                    </div>
                </div>
            </div>
        </>
    );
};


// --- The Main Dashboard Page Component ---
const NewDashboardPage = () => {
    // State for the modal, now includes loading and fetched details
    const [selectedComparisonTrain, setSelectedComparisonTrain] = useState(null);
    const [isComparisonModalOpen, setComparisonModalOpen] = useState(false);
    const [comparisonDetails, setComparisonDetails] = useState(null);
    const [isComparisonLoading, setIsComparisonLoading] = useState(false);
    
    const [stats, setStats] = useState(null);
    const [chartsData, setChartsData] = useState(null);
    
    // **EDIT**: The comparison table data is now managed by state
    const [comparisonData, setComparisonData] = useState([
        { 
            id: 'TR-COMP-001', 
            date: '2025-06-17', 
            wagons: 2, 
            left_damages: 'Loading...', // Default loading state
            right_damages: 'Loading...', 
            top_damages: 'Loading...',
            s3_path: '2024_Oct_CR_WagonDamageDetection/Wagon_H/17-06-2025/admin1/Comparision_Results'
        },
        // You can add more initial train data here
    ]);
	
	const [totalDetectedDamages, setTotalDetectedDamages] = useState('...');
    
    // This handler now opens the modal and fetches the live data
    const handleOpenComparisonModal = async (trainData) => {
        // Set initial state to show the modal with loading indicators
        setSelectedComparisonTrain(trainData);
        setComparisonModalOpen(true);
        setIsComparisonLoading(true);
        setComparisonDetails(null); // Clear previous details

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
            // Stop loading indicator regardless of outcome
            setIsComparisonLoading(false);
        }
    };
    
    // This handler now resets all relevant states on close
    const handleCloseComparisonModal = () => {
        setComparisonModalOpen(false);
        setSelectedComparisonTrain(null);
        setComparisonDetails(null);
    };

    useEffect(() => {
        const chartInstances = [];
        const fetchDataAndCreateCharts = async () => {
            try {
                // Fetch system status and chart data
                const statusRes = await getSystemStatus();
                if (statusRes.error) console.error("Error fetching system status:", statusRes.error); else setStats(statusRes);
                const chartRes = await getChartData();
                if (chartRes.error) console.error("Error fetching chart data:", chartRes.error); else setChartsData(chartRes);

                // **EDIT**: Fetch damage counts for each train in the comparison table
                // Use Promise.all to fetch all counts in parallel
                const updatedData = await Promise.all(comparisonData.map(async (train) => {
                    const countsRes = await getDamageCounts(train.s3_path);
                    if (countsRes.success) {
                        return {
                            ...train,
                            left_damages: countsRes.counts.left_view_damages,
                            right_damages: countsRes.counts.right_view_damages,
                            top_damages: countsRes.counts.top_view_damages,
                        };
                    }
                    // Return original train data with error message on failure
                    return { ...train, left_damages: 'Error', right_damages: 'Error', top_damages: 'Error' };
                }));
				
				// Calculate total damages
                const total = updatedData.reduce((acc, train) => {
                    const l = parseInt(train.left_damages) || 0;
                    const r = parseInt(train.right_damages) || 0;
                    const t = parseInt(train.top_damages) || 0;
                    return acc + l + r + t;
                }, 0);

                setTotalDetectedDamages(total);
				setComparisonData(updatedData);

            } catch (error) { 
                console.error("Dashboard data fetching error:", error); 
            }
        };

        fetchDataAndCreateCharts();

        // Chart creation logic (no changes needed here)
        if (chartsData) {
            const createChart = (ctx, config) => {
                if (ctx) {
                    const chart = new Chart(ctx, { ...config, options: { ...config.options, responsive: true, maintainAspectRatio: false, animation: true } });
                    chartInstances.push(chart);
                }
            };
            const weeklyCtx = document.getElementById('weeklyTrainsChart');
            if (chartsData.damage_by_date) createChart(weeklyCtx, { type: 'line', data: { labels: chartsData.damage_by_date.labels, datasets: [{ label: 'Trains Processed', data: chartsData.damage_by_date.data, borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', tension: 0.4, fill: true }] } });
            const damageCtx = document.getElementById('damageTypesChart');
            if (chartsData.damage_types) createChart(damageCtx, { type: 'doughnut', data: { labels: chartsData.damage_types.labels, datasets: [{ data: chartsData.damage_types.data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } } } });
            const severityCtx = document.getElementById('severityTrendsChart');
            if (chartsData.damage_types) createChart(severityCtx, { type: 'bar', data: { labels: chartsData.damage_types.labels, datasets: [{ label: 'Damage Count', data: chartsData.damage_types.data, backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#dc2626'] }] }, options: { plugins: { legend: { display: false } } } });
        }

        return () => chartInstances.forEach(chart => chart.destroy());
    }, [chartsData]);

    return (
        <>
            <div className="fade-in">
                {/* --- KPI CARDS --- */}
				{/*<div className="dashboard-grid">
                    <div className="kpi-card"><div className="kpi-header"><span className="kpi-title">Total Trains</span><div className="kpi-icon primary"><i className="fas fa-train"></i></div></div><div className="kpi-value">{stats?.total_videos ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>All time</span></div></div>
                    <div className="kpi-card success"><div className="kpi-header"><span className="kpi-title">Processed Videos</span><div className="kpi-icon success"><i className="fas fa-video"></i></div></div><div className="kpi-value">{stats?.total_videos ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>{stats?.storage_usage}</span></div></div>
                    <div className="kpi-card warning"><div className="kpi-header"><span className="kpi-title">Damage Detected</span><div className="kpi-icon warning"><i className="fas fa-exclamation-triangle"></i></div></div><div className="kpi-value">{stats?.total_detections ?? '...'}</div><div className="kpi-change neutral"><span>Frames</span></div></div>
						{/*<div className="kpi-card"><div className="kpi-header"><span className="kpi-title">Processing Rate</span><div className="kpi-icon primary"><i className="fas fa-tachometer-alt"></i></div></div><div className="kpi-value">{stats?.processing_speed ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>Efficiency</span></div></div>
                    <div className="kpi-card success"><div className="kpi-header"><span className="kpi-title">Inspections Complete</span><div className="kpi-icon success"><i className="fas fa-check-circle"></i></div></div><div className="kpi-value">&nbsp;</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i>&nbsp;</div></div>
						<div className="kpi-card danger"><div className="kpi-header"><span className="kpi-title">Critical Issues</span><div className="kpi-icon danger"><i className="fas fa-times-circle"></i></div></div><div className="kpi-value">&nbsp;</div><div className="kpi-change neutral">&nbsp;</div></div>
				</div>*/}

                {/* --- CHARTS --- */}
				{/*<div className="charts-section">
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Weekly Trains Processed</h3></div><div className="chart-container"><canvas id="weeklyTrainsChart"></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Types Distribution</h3></div><div className="chart-container"><canvas id="damageTypesChart"></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Severity Trends</h3></div><div className="chart-container"><canvas id="severityTrendsChart"></canvas></div></div>
				</div>*/}

                {/* --- COMPARISON TABLE --- */}
                <div className="data-section mt-4">
                    <div className="section-header"><h2 className="section-title">Comparison Table</h2></div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Train ID</th>
                                    <th>Date</th>
                                    <th>Left View Damages</th>
                                    <th>Right View Damages</th>
                                    <th>Top View Damages</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparisonData.map((row) => (
                                    <tr key={row.id}>
                                        <td>
                                            <a href="#" onClick={(e) => { e.preventDefault(); handleOpenComparisonModal(row); }} className="link-primary fw-bold">
                                                {row.id}
                                            </a>
                                        </td>
                                        <td>{row.date}</td>
                                        <td>{row.left_damages}</td>
                                        <td>{row.right_damages}</td>
                                        <td>{row.top_damages}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Render the comparison details modal with new props */}
            <ComparisonDetailModal 
                isOpen={isComparisonModalOpen} 
                onClose={handleCloseComparisonModal} 
                data={selectedComparisonTrain}
                details={comparisonDetails}
                isLoading={isComparisonLoading}
            />
        </>
    );
};

export default NewDashboardPage;