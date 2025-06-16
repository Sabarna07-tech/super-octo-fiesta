import React, { useEffect, useState } from 'react';
import Chart from 'chart.js/auto';

// --- Reusable Modal Component for Damage Details ---
const DamageDetailsModal = ({ isOpen, onClose, data }) => {
    if (!isOpen || !data) {
        return null;
    }
    const placeholderImageUrl = `https://via.placeholder.com/600x400/e2e8f0?text=${encodeURIComponent(data.details[0]?.type || 'Damage Image')}`;

    return (
        <>
            <div className="modal-backdrop fade show"></div>
            <div className="modal fade show" style={{ display: 'block' }} role="dialog">
                <div className="modal-dialog modal-xl modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div>
                                <h5 className="modal-title">Train Inspection Details</h5>
                                <div className="d-flex gap-4 small text-muted">
                                    <span><strong>Train ID:</strong> {data.id}</span>
                                    <span><strong>Date:</strong> {data.date}</span>
                                    <span><strong>Wagons:</strong> {data.wagons}</span>
                                </div>
                            </div>
                            <button type="button" className="btn-close" onClick={onClose}></button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', maxHeight: '75vh' }}>
                            <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
                                <h6 className="mb-3">Damage Analysis</h6>
                                <table className="table table-hover table-sm">
                                    <thead>
                                        <tr><th>Wagon #</th><th>View</th><th>Damage Type</th><th>Severity</th><th>Confidence</th></tr>
                                    </thead>
                                    <tbody>
                                        {data.details.length > 0 ? data.details.map((d, i) => (
                                            <tr key={i}>
                                                <td>{d.wagon}</td>
                                                <td>{d.view}</td>
                                                <td>{d.type}</td>
                                                <td><span className={`status-badge ${d.sev.toLowerCase()}`}>{d.sev}</span></td>
                                                <td>{d.confidence}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="5" className="text-center text-muted py-4">No damages detected.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="ms-4 p-3" style={{ flexBasis: '400px', background: 'var(--surface-light)', borderRadius: '8px' }}>
                               <h6 className="mb-3">Damage Image</h6>
                               <img src={placeholderImageUrl} alt="Damage" className="img-fluid rounded" />
                            </div>
                        </div>
                         <div className="modal-footer">
                            <button type="button" className="action-btn outline" onClick={onClose}>Close</button>
                            <button type="button" className="action-btn primary"><i className="fas fa-download me-2"></i>Export</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};


// --- The Main Dashboard Page Component ---
const NewDashboardPage = () => {
    // State for managing the details modal
    const [isModalOpen, setModalOpen] = useState(false);
    const [selectedTrain, setSelectedTrain] = useState(null);

    // Sample data for the table
    const sampleDetections = [
        { id: 'TR-2025-001', date: '2025-06-13', wagons: 45, status: 'Completed', primaryDamage: 'Surface Scratches', severity: 'Low', details: [{ wagon: 'W03', view: 'Left Side', type: 'Surface Scratch', sev: 'Low', confidence: '94.2%' }] },
        { id: 'TR-2025-002', date: '2025-06-13', wagons: 38, status: 'Critical', primaryDamage: 'Structural Damage', severity: 'High', details: [{ wagon: 'W03', view: 'Left Side', type: 'Structural Crack', sev: 'High', confidence: '99.1%' }] },
        { id: 'TR-2025-003', date: '2025-06-12', wagons: 52, status: 'Completed', primaryDamage: 'No Issues', severity: 'None', details: [] },
    ];
    
    // Function to open the modal with specific train data
    const handleViewDetails = (train) => {
        setSelectedTrain(train);
        setModalOpen(true);
    };
    
    // Function to close the modal
    const handleCloseModal = () => {
        setModalOpen(false);
        setSelectedTrain(null);
    };

    // This useEffect hook sets up and tears down the charts
    useEffect(() => {
        const chartInstances = [];
        const createChart = (ctx, config) => {
            if (ctx) {
                const chart = new Chart(ctx, { ...config, options: { ...config.options, responsive: true, maintainAspectRatio: false, animation: false } });
                chartInstances.push(chart);
            }
        };

        const weeklyCtx = document.getElementById('weeklyTrainsChart');
        createChart(weeklyCtx, { type: 'line', data: { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], datasets: [{ label: 'Trains Processed', data: [285, 312, 298, 352], borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', tension: 0.4, fill: true }] } });
        const damageCtx = document.getElementById('damageTypesChart');
        createChart(damageCtx, { type: 'doughnut', data: { labels: ['Scratches', 'Paint', 'Structural', 'Rust', 'Dents'], datasets: [{ data: [45, 23, 12, 15, 18], backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } } } });
        const severityCtx = document.getElementById('severityTrendsChart');
        createChart(severityCtx, { type: 'bar', data: { labels: ['Low', 'Medium', 'High', 'Critical'], datasets: [{ label: 'Damage Count', data: [65, 28, 12, 8], backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#dc2626'] }] }, options: { plugins: { legend: { display: false } } } });
        
        return () => chartInstances.forEach(chart => chart.destroy());
    }, []);
    
    const getSeverityBadge = (severity) => {
        switch(severity.toLowerCase()) {
            case 'high': case 'critical': return 'danger';
            case 'medium': return 'warning';
            case 'low': return 'warning';
            default: return 'success';
        }
    };

    return (
        <>
            <div className="fade-in">
                {/* Section 1: KPI Cards */}
                <div className="dashboard-grid">
                    <div className="kpi-card"><div className="kpi-header"><span className="kpi-title">Total Trains</span><div className="kpi-icon primary"><i className="fas fa-train"></i></div></div><div className="kpi-value">1,247</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>+12%</span></div></div>
                    <div className="kpi-card success"><div className="kpi-header"><span className="kpi-title">Processed Videos</span><div className="kpi-icon success"><i className="fas fa-video"></i></div></div><div className="kpi-value">7,482</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>6 per train</span></div></div>
                    <div className="kpi-card warning"><div className="kpi-header"><span className="kpi-title">Damage Detected</span><div className="kpi-icon warning"><i className="fas fa-exclamation-triangle"></i></div></div><div className="kpi-value">89</div><div className="kpi-change negative"><i className="fas fa-arrow-down"></i><span>7.1% rate</span></div></div>
                    <div className="kpi-card"><div className="kpi-header"><span className="kpi-title">Processing Rate</span><div className="kpi-icon primary"><i className="fas fa-tachometer-alt"></i></div></div><div className="kpi-value">96.8%</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>Efficiency</span></div></div>
                    <div className="kpi-card success"><div className="kpi-header"><span className="kpi-title">Inspections Complete</span><div className="kpi-icon success"><i className="fas fa-check-circle"></i></div></div><div className="kpi-value">1,158</div><div className="kpi-change positive"><i className="fas fa-arrow-up"></i><span>92.9%</span></div></div>
                    <div className="kpi-card danger"><div className="kpi-header"><span className="kpi-title">Critical Issues</span><div className="kpi-icon danger"><i className="fas fa-times-circle"></i></div></div><div className="kpi-value">12</div><div className="kpi-change neutral"><span>Immediate</span></div></div>
                </div>

                {/* Section 2: Charts */}
                <div className="charts-section">
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Weekly Trains Processed</h3></div><div className="chart-container"><canvas id="weeklyTrainsChart"></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Types Distribution</h3></div><div className="chart-container"><canvas id="damageTypesChart"></canvas></div></div>
                    <div className="chart-card"><div className="chart-header"><h3 className="chart-title">Damage Severity Trends</h3></div><div className="chart-container"><canvas id="severityTrendsChart"></canvas></div></div>
                </div>

                {/* Section 3: Data Table */}
                <div className="data-section">
                    <div className="section-header"><h2 className="section-title">Train Inspection Results</h2><div className="section-controls"><input type="text" className="search-input" placeholder="Search by train ID..."/><button className="filter-btn"><i className="fas fa-filter"></i><span>Filter</span></button></div></div>
                    <div className="table-responsive"><table className="data-table"><thead><tr><th>Date</th><th>Train ID</th><th>Wagons</th><th>Status</th><th>Primary Damage</th><th>Severity</th><th>Actions</th></tr></thead><tbody>
                        {sampleDetections.map(train => (<tr key={train.id}><td>{train.date}</td><td><strong>{train.id}</strong></td><td>{train.wagons}</td><td><span className={`status-badge ${train.status === 'Critical' ? 'danger' : 'success'}`}>{train.status}</span></td><td>{train.primaryDamage}</td><td><span className={`status-badge ${getSeverityBadge(train.severity)}`}>{train.severity}</span></td><td><button className="action-btn primary" onClick={() => handleViewDetails(train)}><i className="fas fa-eye"></i> View</button></td></tr>))}
                    </tbody></table></div>
                </div>
            </div>

            <DamageDetailsModal 
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                data={selectedTrain}
            />
        </>
    );
};

export default NewDashboardPage;