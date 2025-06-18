import React, { useEffect, useState } from 'react';
import Chart from 'chart.js/auto';
import { getSystemStatus, getChartData } from '../api/apiService';

// --- Modal for Comparison Table Details ---
const ComparisonDetailModal = ({ isOpen, onClose, data }) => {
    const [showWagonDetails, setShowWagonDetails] = useState(false);

    if (!isOpen || !data) {
        return null;
    }

    return (
        <>
            <div className="modal-backdrop fade show"></div>
            <div className="modal fade show" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Comparison Details for {data.id}</h5>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body">
                            {/* This is the "new table" as requested */}
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Train ID</th>
                                        <th>Wagons</th>
                                        <th>Left View Damages</th>
                                        <th>Right View Damages</th>
                                        <th>Top View Damages</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>{data.id}</td>
                                        <td>{data.wagons}</td>
                                        <td>{data.left_damages}</td>
                                        <td>{data.right_damages}</td>
                                        <td>{data.top_damages}</td>
                                        <td>
                                            <button className="action-btn primary" onClick={() => setShowWagonDetails(!showWagonDetails)}>
                                                {showWagonDetails ? 'Hide' : 'View'} Details
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* This is the nested "Wagon View Table" */}
                            {showWagonDetails && (
                                <div className="mt-4">
                                    <h6 className="mb-3">Wagon Frame Details</h6>
                                    <div className="table-responsive" style={{maxHeight: '40vh'}}>
                                        <table className="table table-bordered table-hover">
                                            <thead className="table-light">
                                                <tr>
                                                    <th rowSpan="2" className="align-middle text-center">Wagon #</th>
                                                    <th colSpan="2" className="text-center">Left View</th>
                                                    <th colSpan="2" className="text-center">Right View</th>
                                                </tr>
                                                <tr>
                                                    <th className="text-center">Entry Frame</th>
                                                    <th className="text-center">Exit Frame</th>
                                                    <th className="text-center">Entry Frame</th>
                                                    <th className="text-center">Exit Frame</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.wagon_details.map(wagon => (
                                                    <tr key={wagon.wagon_id}>
                                                        <td className="text-center">{wagon.wagon_id}</td>
                                                        <td>{wagon.left_entry}</td>
                                                        <td>{wagon.left_exit}</td>
                                                        <td>{wagon.right_entry}</td>
                                                        <td>{wagon.right_exit}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="action-btn outline" onClick={onClose}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

// --- The Main Dashboard Page Component ---
const NewDashboardPage = () => {
    // State for the comparison table modal
    const [isComparisonModalOpen, setComparisonModalOpen] = useState(false);
    const [selectedComparisonTrain, setSelectedComparisonTrain] = useState(null);
    
    const [stats, setStats] = useState(null);
    const [chartsData, setChartsData] = useState(null);

    // Mock data for the Comparison Table with nested details
    const comparisonData = [
        { 
            id: 'TR-COMP-001', date: '2025-06-18', wagons: 2, left_damages: 5, right_damages: 2, top_damages: 1,
            wagon_details: [
                { wagon_id: 1, left_entry: 'L1_entry.jpg', left_exit: 'L1_exit.jpg', right_entry: 'R1_entry.jpg', right_exit: 'R1_exit.jpg' },
                { wagon_id: 2, left_entry: 'L2_entry.jpg', left_exit: 'L2_exit.jpg', right_entry: 'R2_entry.jpg', right_exit: 'R2_exit.jpg' }
            ]
        },
        { 
            id: 'TR-COMP-002', date: '2025-06-17', wagons: 3, left_damages: 0, right_damages: 8, top_damages: 4,
            wagon_details: [
                { wagon_id: 1, left_entry: 'L1_entry.jpg', left_exit: 'L1_exit.jpg', right_entry: 'R1_entry.jpg', right_exit: 'R1_exit.jpg' },
                { wagon_id: 2, left_entry: 'L2_entry.jpg', left_exit: 'L2_exit.jpg', right_entry: 'R2_entry.jpg', right_exit: 'R2_exit.jpg' },
                { wagon_id: 3, left_entry: 'L3_entry.jpg', left_exit: 'L3_exit.jpg', right_entry: 'R3_entry.jpg', right_exit: 'R3_exit.jpg' }
            ]
        },
    ];
    
    // Handler to open the comparison detail modal
    const handleOpenComparisonModal = (trainData) => {
        setSelectedComparisonTrain(trainData);
        setComparisonModalOpen(true);
    };
    
    useEffect(() => {
        // Chart and data fetching logic remains unchanged
        const chartInstances = [];
        const fetchDataAndCreateCharts = async () => {
            try {
                const statusRes = await getSystemStatus();
                if (statusRes.error) console.error("Error fetching system status:", statusRes.error); else setStats(statusRes);
                const chartRes = await getChartData();
                if (chartRes.error) console.error("Error fetching chart data:", chartRes.error); else setChartsData(chartRes);
            } catch (error) { console.error("Dashboard data fetching error:", error); }
        };
        fetchDataAndCreateCharts();
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
                <div className="dashboard-grid">
                    <div className="kpi-card"><div className="kpi-header"><span className="kpi-title">Total Trains</span><div className="kpi-icon primary"><i className="fas fa-train"></i></div></div><div className="kpi-value">{stats?.total_videos ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>All time</span></div></div>
                    <div className="kpi-card success"><div className="kpi-header"><span className="kpi-title">Processed Videos</span><div className="kpi-icon success"><i className="fas fa-video"></i></div></div><div className="kpi-value">{stats?.total_videos ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>{stats?.storage_usage}</span></div></div>
                    <div className="kpi-card warning"><div className="kpi-header"><span className="kpi-title">Damage Detected</span><div className="kpi-icon warning"><i className="fas fa-exclamation-triangle"></i></div></div><div className="kpi-value">{stats?.total_detections ?? '...'}</div><div className="kpi-change neutral"><span>Frames</span></div></div>
                    <div className="kpi-card"><div className="kpi-header"><span className="kpi-title">Processing Rate</span><div className="kpi-icon primary"><i className="fas fa-tachometer-alt"></i></div></div><div className="kpi-value">{stats?.processing_speed ?? '...'}</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>Efficiency</span></div></div>
                    <div className="kpi-card success"><div className="kpi-header"><span className="kpi-title">Inspections Complete</span><div className="kpi-icon success"><i className="fas fa-check-circle"></i></div></div><div className="kpi-value">1,158</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>92.9%</span></div></div>
                    <div className="kpi-card danger"><div className="kpi-header"><span className="kpi-title">Critical Issues</span><div className="kpi-icon danger"><i className="fas fa-times-circle"></i></div></div><div className="kpi-value">12</div><div className="kpi-change neutral"><span>Immediate</span></div></div>
                </div>

                {/* --- CHARTS --- */}
                <div className="charts-section">
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Weekly Trains Processed</h3></div><div className="chart-container"><canvas id="weeklyTrainsChart"></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Types Distribution</h3></div><div className="chart-container"><canvas id="damageTypesChart"></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Severity Trends</h3></div><div className="chart-container"><canvas id="severityTrendsChart"></canvas></div></div>
                </div>

                {/* --- The Train Inspection Results table has been removed as requested --- */}

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
                                            <a href="#" onClick={(e) => { e.preventDefault(); handleOpenComparisonModal(row); }} className="link-primary">
                                                <strong>{row.id}</strong>
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

            {/* Render the comparison details modal */}
            <ComparisonDetailModal isOpen={isComparisonModalOpen} onClose={() => setComparisonModalOpen(false)} data={selectedComparisonTrain} />
        </>
    );
};

export default NewDashboardPage;