import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A React-controlled logout modal.
 * @param {object} props - The component props.
 * @param {boolean} props.isOpen - Whether the modal should be open.
 * @param {function} props.onClose - Function to call to close the modal.
 */
const LogoutModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        onClose(); // Close the modal
        navigate('/login');
    };

    // If the modal is not open, render nothing.
    if (!isOpen) {
        return null;
    }

    // When open, render the modal and a backdrop.
    return (
        <>
            <div className="modal-backdrop fade show"></div>
            <div
                className="modal fade show"
                style={{ display: 'block' }}
                id="logoutModal"
                tabIndex="-1"
                aria-labelledby="logoutModalLabel"
                aria-modal="true"
                role="dialog"
            >
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title" id="logoutModalLabel">Confirm Logout</h5>
                            <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
                        </div>
                        <div className="modal-body">
                            Are you sure you want to log out?
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={handleLogout}>Logout</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default LogoutModal;