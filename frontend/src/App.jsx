import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Import Pages
import LoginPage from './pages/LoginPage.jsx';
import S3DashboardPage from './pages/S3DashboardPage.jsx';
import NewDashboardPage from './pages/NewDashboardPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import DamageCamparison from './pages/DamageCamparison.jsx';
import RunTopComparison from './pages/RunTopComparison.jsx'; // Import the new component
import FrameExtraction from './pages/FrameExtraction.jsx';

// Import the single, new layout
import NewBaseLayout from './components/NewBaseLayout.jsx';

const ProtectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return children;
};

// This component determines the user's home page after login
const RoleBasedRedirect = () => {
    const userRole = localStorage.getItem('role');
    if (userRole === 's3_uploader') {
        return <Navigate to="/s3_dashboard" replace />;
    }
    // Admin, viewer, and other roles default to the new dashboard
    return <Navigate to="/new-dashboard" replace />;
};

function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* All protected routes now use the NewBaseLayout */}
            <Route path="/" element={<ProtectedRoute><NewBaseLayout /></ProtectedRoute>}>
                {/* The index route redirects based on role */}
                <Route index element={<RoleBasedRedirect />} />
                
                {/* Define routes for each role */}
                <Route path="new-dashboard" element={<NewDashboardPage />} />
                <Route path="comparison" element={<DamageCamparison />} />
                <Route path="run_top_comparison" element={<RunTopComparison />} /> 
                <Route path="s3_dashboard" element={<S3DashboardPage />} />
				<Route path="frame_extraction" element={<FrameExtraction/>} />
            </Route>

            {/* Fallback route to redirect any unknown paths */}
            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
}

export default App;