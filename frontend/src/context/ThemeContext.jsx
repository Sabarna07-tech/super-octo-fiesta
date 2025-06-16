import React, { createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Default to 'dark' mode as that's the current style
    const [theme, setTheme] = useState('dark'); 

    useEffect(() => {
        // Apply the theme class to the body
        document.body.className = ''; // Clear existing classes
        document.body.classList.add(`${theme}-mode`);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};