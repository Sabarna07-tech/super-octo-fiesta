import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import Footer from './Footer';
import LogoutModal from './LogoutModal';

// frontend/src/components/BaseLayout.jsx

// ... (imports)

const Sidebar = ({ isCollapsed, onLogoutClick }) => {
    const userRole = localStorage.getItem('role');

    return (
        <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} id="sidebar">
            <div className="sidebar-header">
                <div className="logo"><i className="fas fa-train"></i></div>
                <h1 className="sidebar-title">TrainVision</h1>
            </div>
            
            <div className="nav-menu" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div>
                    {userRole === 's3_uploader' ? (
                        <div className="nav-item">
                            <NavLink to="/s3_dashboard" className="nav-link" end><i className="nav-icon fas fa-upload"></i><span className="nav-text">Upload</span></NavLink>
                        </div>
                    ) : userRole === 'viewer' ? (
                        <div className="nav-item">
                            <NavLink to="/dashboard" className="nav-link" end><i className="nav-icon fas fa-chart-line"></i><span className="nav-text">Dashboard</span></NavLink>
                        </div>
                    ) : ( // Admin and other standard users
                        <>
                            <div className="nav-item">
                                <NavLink to="/dashboard" className="nav-link" end><i className="nav-icon fas fa-chart-line"></i><span className="nav-text">Dashboard</span></NavLink>
                            </div>
                            {/* FIXED: Restored correct links and names */}
                            <div className="nav-item">
                                <NavLink to="/frame_extraction" className="nav-link"><i className="nav-icon fas fa-cogs"></i><span className="nav-text">Frame Extraction</span></NavLink>
                            </div>
                            <div className="nav-item">
                                <NavLink to="/damage_detection" className="nav-link"><i className="nav-icon fas fa-search"></i><span className="nav-text">Damage Detection</span></NavLink>
                            </div>
                        </>
                    )}
                </div>

                <div style={{ marginTop: 'auto' }}>
                    <div className="nav-item">
                        <a href="#" className="nav-link" onClick={onLogoutClick}><i className="nav-icon fas fa-sign-out-alt"></i><span className="nav-text">Logout</span></a>
                    </div>
                </div>
            </div>
        </nav>
    );
};


// ... (rest of the file)

const TopBar = ({ toggleSidebar, pageTitle }) => (
    <header className="top-bar">
        <div className="top-bar-left">
            <button className="sidebar-toggle" id="sidebarToggle" onClick={toggleSidebar}><i className="fas fa-bars"></i></button>
            <h1 className="page-title">{pageTitle}</h1>
        </div>
        <div className="top-bar-right">
            <div className="status-indicator"><div className="status-dot"></div><span>System Online</span></div>
        </div>
    </header>
);

const BaseLayout = () => {
    const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

    const toggleSidebar = () => setSidebarCollapsed(!isSidebarCollapsed);
    const handleLogoutClick = (e) => {
        e.preventDefault();
        setIsLogoutModalOpen(true);
    };

    const getPageTitle = () => {
        const path = window.location.pathname.split('/').pop();
        if (path === 'dashboard') return 'Train Inspection Dashboard';
        if (path === 's3_dashboard') return 'Upload'; // Add this special case
        const formattedPath = path.replace(/_/g, ' ');
        return formattedPath.replace(/\b\w/g, char => char.toUpperCase());
    };

    return (
        <div className="app-container">
            <Sidebar isCollapsed={isSidebarCollapsed} onLogoutClick={handleLogoutClick} />
            <div className="main-content">
                <TopBar toggleSidebar={toggleSidebar} pageTitle={getPageTitle()} />
                <div className="content-area">
                    <Outlet />
                </div>
                <Footer />
            </div>
            <LogoutModal isOpen={isLogoutModalOpen} onClose={() => setIsLogoutModalOpen(false)} />
        </div>
    );
};

export default BaseLayout;