import React, { createContext, useState, useRef, useEffect, useContext } from 'react';
import { getTaskStatus, processS3Videos, cancelTask as apiCancelTask } from '../api/apiService';
import { toast } from 'react-toastify';

export const TaskContext = createContext();

export const useTask = () => useContext(TaskContext);

export const TaskProvider = ({ children }) => {
    const [taskId, setTaskId] = useState(null);
    const [taskState, setTaskState] = useState('IDLE'); // IDLE, PROCESSING, SUCCESS, FAILURE
    const [taskProgress, setTaskProgress] = useState(0);
    const [taskStatusText, setTaskStatusText] = useState('');
    const [taskResult, setTaskResult] = useState(null);
    const [error, setError] = useState(null);
    const pollIntervalRef = useRef(null);

    const clearTask = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        setTaskId(null);
        setTaskState('IDLE');
        setTaskProgress(0);
        setTaskStatusText('');
        setTaskResult(null);
        setError(null);
    };

    const cancelTask = async () => {
        if (!taskId) {
            toast.warn("No active task to cancel.");
            return;
        }

        try {
            const response = await apiCancelTask(taskId);
            if (response.success) {
                toast.info("Task cancellation requested successfully.");
            } else {
                toast.error(response.error || "Failed to send cancellation request.");
            }
        } catch (err) {
            toast.error("An error occurred while trying to cancel the task.");
        } finally {
            clearTask(); // Reset the UI state regardless
        }
    };

    const pollTaskStatus = (id) => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
        }
        
        pollIntervalRef.current = setInterval(async () => {
            try {
                const data = await getTaskStatus(id);
                
                setTaskProgress(data.progress || 0);
                setTaskStatusText(data.status_text || 'Processing...');

                if (data.state === 'SUCCESS') {
                    setTaskState('SUCCESS');
                    setTaskResult(data.result);
                    clearInterval(pollIntervalRef.current);
                } else if (data.state === 'FAILURE' || data.state === 'REVOKED') {
                    setTaskState('FAILURE');
                    setError(data.error || 'Task failed or was cancelled.');
                    clearInterval(pollIntervalRef.current);
                }
            } catch (err) {
                setError('Failed to get task status.');
                setTaskState('FAILURE');
                clearInterval(pollIntervalRef.current);
            }
        }, 2000);
    };

    const startS3FrameExtraction = async (videoKey) => {
        clearTask();
        setTaskState('PROCESSING');
        try {
            const response = await processS3Videos(videoKey);
            if (response.success) {
                setTaskId(response.task_id);
                pollTaskStatus(response.task_id);
            } else {
                setTaskState('FAILURE');
                setError(response.error || 'Failed to start task.');
            }
        } catch (err) {
            setTaskState('FAILURE');
            setError(err.message || 'An error occurred while starting the task.');
        }
    };
    
    const value = {
        taskId,
        taskState,
        taskProgress,
        taskStatusText,
        taskResult,
        error,
        startS3FrameExtraction,
        clearTask,
        cancelTask
    };

    return (
        <TaskContext.Provider value={value}>
            {children}
        </TaskContext.Provider>
    );
};