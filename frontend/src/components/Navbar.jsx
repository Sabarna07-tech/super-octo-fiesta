import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Offcanvas } from 'bootstrap';
import ThemeToggler from './ThemeToggler'; // 1. IMPORT THE TOGGLER

const Navbar = ({ onLogoutClick }) => {
    const userRole = localStorage.getItem('role');

    /**
     * Hides the offcanvas menu programmatically.
     * This prevents conflicts between Bootstrap's JS and React Router.
     */
    const hideMenu = () => {
        const offcanvasElement = document.getElementById('offcanvasNavbar');
        // A check to see if the offcanvas element exists before trying to get an instance
        if (!offcanvasElement) return;
        const bsOffcanvas = Offcanvas.getInstance(offcanvasElement);
        if (bsOffcanvas) {
            bsOffcanvas.hide();
        }
    };

    // This function is called when a regular nav link is clicked.
    const handleNavLinkClick = () => {
        hideMenu();
    };

    // This function is called when the logout link is clicked.
    const handleLogoutClick = (e) => {
        e.preventDefault();
        hideMenu();
        onLogoutClick();
    };

    return (
        <nav className="navbar navbar-dark shadow-sm">
            <div className="container-fluid">
                <Link className="navbar-brand" to={userRole === 's3_uploader' ? "/s3_dashboard" : "/"}>
                    <i className="fas fa-train me-2"></i>
                    Wagon Damage Detection
                </Link>

                <button
                    className="navbar-toggler"
                    type="button"
                    data-bs-toggle="offcanvas"
                    data-bs-target="#offcanvasNavbar"
                    aria-controls="offcanvasNavbar"
                >
                    <span className="navbar-toggler-icon"></span>
                </button>

                <div
                    className="offcanvas offcanvas-end"
                    tabIndex="-1"
                    id="offcanvasNavbar"
                    aria-labelledby="offcanvasNavbarLabel"
                >
                    <div className="offcanvas-header">
                        <h5 className="offcanvas-title" id="offcanvasNavbarLabel">Menu</h5>
                        <button type="button" className="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                    </div>
                    {/* FIX: Use flexbox column to structure the offcanvas body */}
                    <div className="offcanvas-body d-flex flex-column">
                        <ul className="navbar-nav justify-content-end flex-grow-1 pe-3">
                            {userRole === 's3_uploader' ? (
                                <li className="nav-item">
                                    <NavLink className="nav-link" to="/s3_dashboard" onClick={handleNavLinkClick}>S3 Upload</NavLink>
                                </li>
                            ) : (
                                <>
                                    <li className="nav-item">
                                        <NavLink className="nav-link" to="/" end onClick={handleNavLinkClick}>Home</NavLink>
                                    </li>
                                    <li className="nav-item">
                                        <NavLink className="nav-link" to="/dashboard" onClick={handleNavLinkClick}>Dashboard</NavLink>
                                    </li>
                                    <li className="nav-item">
                                        <NavLink className="nav-link" to="/upload" onClick={handleNavLinkClick}>Retrieve from S3</NavLink>
                                    </li>
                                </>
                            )}
                        </ul>
                        
                        {/* 2. ADD THE THEME TOGGLER COMPONENT HERE */}
                        <div className="mt-auto">
                           <ThemeToggler />

                           <ul className="navbar-nav justify-content-end pe-3">
                                <li className="nav-item mt-3 border-top pt-3">
                                    <a
                                        href="#"
                                        className="nav-link"
                                        onClick={handleLogoutClick}
                                        title="Logout"
                                    >
                                        <i className="fas fa-sign-out-alt fa-lg"></i>
                                        <span className="ms-2">Logout</span>
                                    </a>
                                </li>
                           </ul>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
