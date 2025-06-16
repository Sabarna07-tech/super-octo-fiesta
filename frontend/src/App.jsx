import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import BaseLayout from './components/BaseLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import S3DashboardPage from './pages/S3DashboardPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import DamageDetectionPage from './pages/DamageDetectionPage.jsx';

const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return children;
};

const RoleProtectedRoute = ({ children, allowedRole }) => {
    const userRole = localStorage.getItem('role');
    if (userRole !== allowedRole) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
}

const RoleBasedHomePage = () => {
    const userRole = localStorage.getItem('role');
    if (userRole === 's3_uploader') {
        return <Navigate to="/s3_dashboard" replace />;
    }
    // For admin, viewer, and any other role, redirect to the main dashboard.
    return <Navigate to="/dashboard" replace />;
};


function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={<ProtectedRoute><BaseLayout /></ProtectedRoute>}>
                <Route index element={<RoleBasedHomePage />} />
                
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="frame_extraction" element={<UploadPage />} />
                <Route path="damage_detection" element={<DamageDetectionPage />} />
                
                <Route 
                    path="s3_dashboard" 
                    element={<RoleProtectedRoute allowedRole="s3_uploader"><S3DashboardPage /></RoleProtectedRoute>} 
                />
            </Route>

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
}

export default App;