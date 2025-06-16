import React, { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';
import '../assets/css/theme_toggler.css';

const ThemeToggler = () => {
    const { theme, toggleTheme } = useContext(ThemeContext);

    return (
        <div className="theme-toggler-container nav-item">
            <span className="me-2">{theme === 'light' ? 'Light' : 'Dark'} Mode</span>
            <div className="form-check form-switch">
                <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="themeSwitch"
                    checked={theme === 'dark'}
                    onChange={toggleTheme}
                />
            </div>
        </div>
    );
};

export default ThemeToggler;