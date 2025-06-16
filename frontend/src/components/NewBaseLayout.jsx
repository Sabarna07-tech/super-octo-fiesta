import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const Sidebar = ({ isCollapsed }) => (
    <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} id="sidebar">
        <div className="sidebar-header">
            <div className="logo">
                <i className="fas fa-train"></i>
            </div>
            <h1 className="sidebar-title">TrainVision</h1>
        </div>
        <div className="nav-menu">
            <div className="nav-item">
                <NavLink to="/new-dashboard" className="nav-link" end>
                    <i className="nav-icon fas fa-chart-line"></i>
                    <span className="nav-text">Dashboard</span>
                </NavLink>
            </div>
             <div className="nav-item">
                <NavLink to="/" className="nav-link">
                    <i className="nav-icon fas fa-arrow-left"></i>
                    <span className="nav-text">Back to Old UI</span>
                </NavLink>
            </div>
        </div>
    </nav>
);

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

    const toggleSidebar = () => {
        setSidebarCollapsed(!isSidebarCollapsed);
    };

    return (
        <div className="app-container">
            <Sidebar isCollapsed={isSidebarCollapsed} />
            <main className="main-content">
                <TopBar toggleSidebar={toggleSidebar} pageTitle="Train Inspection Dashboard" />
                <div className="content-area">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default NewBaseLayout;