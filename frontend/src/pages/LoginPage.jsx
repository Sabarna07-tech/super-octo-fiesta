import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// FIX: Changed all import paths to be relative to the current file.
import '../assets/css/login.css';
import { login } from '../api/apiService.js';

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        document.body.classList.add('login-page-body');
        return () => {
            document.body.classList.remove('login-page-body');
        };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const response = await login(username, password);
            if (response.success) {
                if (response.role === 's3_uploader') {
                    navigate('/s3_dashboard');
                } else {
                    navigate('/');
                }
            } else {
                setError(response.message || 'Invalid credentials. Please try again.');
            }
        } catch (err) {
            setError('An error occurred while trying to log in. Please check your connection.');
            console.error(err);
        }
    };

    return (
        <div className="login-container">
            <div className="col-md-6 col-lg-5 col-xl-4">
                <div className="card shadow-sm border-0 rounded-lg">
                    <div className="card-header bg-primary text-white text-center">
                        <h3 className="my-2"><i className="fas fa-lock me-2"></i>Login</h3>
                    </div>
                    <div className="card-body">
                        {error && <div className="alert alert-danger">{error}</div>}
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor="username" className="form-label">Username</label>
                                <div className="input-group">
                                    <span className="input-group-text"><i className="fas fa-user"></i></span>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="username"
                                        name="username"
                                        placeholder="Enter username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="mb-3">
                                <label htmlFor="password" className="form-label">Password</label>
                                <div className="input-group">
                                    <span className="input-group-text"><i className="fas fa-key"></i></span>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-control"
                                        id="password"
                                        name="password"
                                        placeholder="Enter password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <button
                                        className="btn btn-outline-secondary"
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        <i className={`far ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>
                            <div className="d-grid mt-4">
                                <button className="btn btn-primary" type="submit">
                                    <i className="fas fa-sign-in-alt me-2"></i>Login
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="card-footer text-center py-2 bg-light">
                        <div className="small text-muted">Wagon Damage Detection System</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
