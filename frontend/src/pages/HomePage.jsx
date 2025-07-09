import React from 'react';
import { Link } from 'react-router-dom';
import '../assets/css/index.css';

const HomePage = () => {
    return (
        <div className="container mt-4 mb-5 fade-in">
            <div className="text-center mb-5">
                <h1 className="display-5 fw-bold">Wagon Damage Detection System</h1>
                <p className="lead text-muted">Welcome, Admin. Please follow the steps to process and analyze wagon videos.</p>
            </div>

            {/* The main row containing the action cards */}
            <div className="row g-4 justify-content-center">

                {/* Card 1: Retrieve & Extract */}
                <div className="col-12 col-md-6 col-lg-4 d-flex">
                    <div className="action-card w-100">
                        <div className="card-icon-wrapper icon-upload"><i className="fas fa-file-video"></i></div>
                        <h3 className="card-title">1. Retrieve & Extract from S3</h3>
                        <p className="card-description">Select videos from the S3 bucket to extract frames for analysis.</p>
                        <Link to="/upload" className="btn btn-primary mt-auto">
                            <i className="fas fa-search me-2"></i>Retrieve & Extract
                        </Link>
                    </div>
                </div>

                {/* Card 2: Damage Detection */}
                <div className="col-12 col-md-6 col-lg-4 d-flex">
                    <div className="action-card w-100">
                        <div className="card-icon-wrapper icon-detect"><i className="fas fa-search"></i></div>
                        <h3 className="card-title">2. Damage Detection</h3>
                        <p className="card-description">Analyze extracted frames using the AI model to identify, classify, and locate damages.</p>
                        <Link to="/damage_detection" className="btn btn-success mt-auto">
                            <i className="fas fa-search-plus me-2"></i>Run Detection
                        </Link>
                    </div>
                </div>

                {/* Card 3: View Dashboard */}
                <div className="col-12 col-md-6 col-lg-4 d-flex">
                    <div className="action-card w-100">
                        <div className="card-icon-wrapper icon-dashboard"><i className="fas fa-chart-line"></i></div>
                        <h3 className="card-title">3. View Dashboard</h3>
                        <p className="card-description">Review statistics, detailed reports, and trends for all processed wagon damages.</p>
                        <Link to="/dashboard" className="btn btn-info mt-auto">
                            <i className="fas fa-tachometer-alt me-2"></i>View Reports
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomePage;