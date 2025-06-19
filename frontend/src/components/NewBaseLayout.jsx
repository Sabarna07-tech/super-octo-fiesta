import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import LogoutModal from './LogoutModal';

const Sidebar = ({ isCollapsed, onLogoutClick }) => {
    // Get user role from local storage to display correct links
    const userRole = localStorage.getItem('role');

    return (
        <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} id="sidebar">
            <div className="sidebar-header">
                <div className="logo"><i className="fas fa-train"></i></div>
                <h1 className="sidebar-title">TrainVision</h1>
            </div>
            
            <div className="nav-menu" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div>
                    {/* Role-based navigation links */}
                    {userRole === 's3_uploader' && (
                        <div className="nav-item">
                            <NavLink to="/s3_dashboard" className="nav-link" end><i className="nav-icon fas fa-upload"></i><span className="nav-text">Upload</span></NavLink>
                        </div>
                    )}

                    {userRole === 'viewer' && (
                        <div className="nav-item">
                            <NavLink to="/new-dashboard" className="nav-link" end><i className="nav-icon fas fa-chart-line"></i><span className="nav-text">Dashboard</span></NavLink>
                        </div>
                    )}

                    {(userRole === 'admin' || userRole === 'standard') && ( // For admin and standard users
                        <>
                            <div className="nav-item">
                                <NavLink to="/new-dashboard" className="nav-link" end><i className="nav-icon fas fa-chart-line"></i><span className="nav-text">Dashboard</span></NavLink>
                            </div>
                            <div className="nav-item">
                                <NavLink to="/comparison" className="nav-link"><i className="nav-icon fas fa-cogs"></i><span className="nav-text">Damage Comparison</span></NavLink>
                            </div>
                        </>
                    )}
                </div>

                {/* Logout button at the bottom */}
                <div style={{ marginTop: 'auto' }}>
                    <div className="nav-item">
                        <a href="#" className="nav-link" onClick={onLogoutClick}>
                            <i className="nav-icon fas fa-sign-out-alt"></i>
                            <span className="nav-text">Logout</span>
                        </a>
                    </div>
                </div>
            </div>
        </nav>
    );
};

const TopBar = ({ toggleSidebar, pageTitle }) => (
    <header className="top-bar">
        <div className="top-bar-left">
            <button className="sidebar-toggle" id="sidebarToggle" onClick={toggleSidebar}>
                <i className="fas fa-bars"></i>
            </button>
            <h1 className="page-title">{pageTitle}</h1>
        </div>
        <div className="top-bar-right">
            <div className="status-indicator">
                <div className="status-dot"></div>
                <span>System Online</span>
            </div>
        </div>
    </header>
);

const NewBaseLayout = () => {
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

    const toggleSidebar = () => {
        setSidebarCollapsed(!isSidebarCollapsed);
    };

    const handleLogoutClick = (e) => {
        e.preventDefault();
        setIsLogoutModalOpen(true);
    };
    
    // Dynamically set page title based on the current path
    const getPageTitle = () => {
        const path = window.location.pathname;
        if (path.includes('/new-dashboard')) return 'Train Inspection Dashboard';
        if (path.includes('/upload')) return 'Retrieve & Process from S3';
        if (path.includes('/s3_dashboard')) return 'Upload to S3';
        return 'Wagon Damage Detection';
    };

    return (
        <div className="app-container">
            <Sidebar isCollapsed={isSidebarCollapsed} onLogoutClick={handleLogoutClick} />
            <main className="main-content">
                <TopBar toggleSidebar={toggleSidebar} pageTitle={getPageTitle()} />
                <div className="content-area">
                    <Outlet />
                </div>
            </main>
            <LogoutModal isOpen={isLogoutModalOpen} onClose={() => setIsLogoutModalOpen(false)} />
        </div>
    );
};

export default NewBaseLayout;