import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = '/api';

interface AsyncOperationPollerProps {
  taskId: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  pollInterval?: number; // milliseconds
}

interface TaskStatus {
  taskId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  result?: any;
  error?: string;
}

export const AsyncOperationPoller: React.FC<AsyncOperationPollerProps> = ({
  taskId,
  onComplete,
  onError,
  pollInterval = 1000
}) => {
  const [taskStatus, setTaskStatus] = useState<TaskStatus>({
    taskId,
    status: 'pending'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pollTask = async () => {
      try {
        const response = await axios.get(`${API_BASE}/queue/tasks/${taskId}`);

        if (response.status === 202) {
          // Still processing (202 Accepted)
          const data = response.data;
          setTaskStatus({
            taskId,
            status: data.status || 'in-progress',
            progress: data.progress,
            message: data.message
          });
          setLoading(true);
        } else if (response.status === 200) {
          // Completed (200 OK)
          const data = response.data;
          const finalStatus: TaskStatus = {
            taskId,
            status: data.status === 'error' || data.status === 'failed' ? 'failed' : 'completed',
            result: data.result,
            error: data.error,
            message: data.message
          };

          setTaskStatus(finalStatus);
          setLoading(false);

          if (finalStatus.status === 'completed' && onComplete) {
            onComplete(finalStatus.result);
          } else if (finalStatus.status === 'failed') {
            const errorMsg = finalStatus.error || 'Task failed';
            setError(errorMsg);
            if (onError) onError(errorMsg);
          }

          return; // Stop polling
        }
      } catch (err: any) {
        const errorMsg = err.message || 'Failed to poll task status';
        setError(errorMsg);
        setLoading(false);

        if (onError) onError(errorMsg);
        return; // Stop polling
      }
    };

    // Initial poll
    pollTask();

    // Set up interval for continued polling
    const interval = setInterval(pollTask, pollInterval);

    return () => clearInterval(interval);
  }, [taskId, pollInterval, onComplete, onError]);

  if (error) {
    return (
      <div
        style={{
          padding: '16px',
          backgroundColor: '#fff1f0',
          border: '1px solid #ffccc7',
          borderRadius: '4px',
          color: '#f5222d'
        }}
      >
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (loading) {
    const progress = taskStatus.progress || 0;

    return (
      <div
        style={{
          border: '1px solid #e8e8e8',
          borderRadius: '8px',
          padding: '16px',
          backgroundColor: '#fafafa'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Processing Task</span>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {taskStatus.status === 'in-progress' ? 'In Progress' : 'Pending'}
          </span>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            backgroundColor: '#e8e8e8',
            borderRadius: '4px',
            height: '8px',
            overflow: 'hidden',
            marginBottom: '12px'
          }}
        >
          <div
            style={{
              backgroundColor: '#1890ff',
              height: '100%',
              width: `${Math.min(progress, 100)}%`,
              transition: 'width 0.3s ease'
            }}
          />
        </div>

        {/* Progress Text */}
        <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', marginBottom: '8px' }}>
          {progress}%
        </div>

        {/* Message */}
        {taskStatus.message && (
          <div
            style={{
              fontSize: '12px',
              color: '#666',
              padding: '8px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              marginBottom: '8px',
              textAlign: 'center'
            }}
          >
            {taskStatus.message}
          </div>
        )}

        {/* Task ID */}
        <div
          style={{
            fontSize: '11px',
            color: '#999',
            fontFamily: 'monospace',
            wordBreak: 'break-all'
          }}
        >
          Task ID: {taskId}
        </div>
      </div>
    );
  }

  // Completed
  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#f6ffed',
        border: '1px solid #b7eb8f',
        borderRadius: '4px',
        color: '#52c41a'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '18px' }}>✓</span>
        <strong>Task Completed Successfully</strong>
      </div>

      {taskStatus.message && (
        <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
          {taskStatus.message}
        </div>
      )}

      {taskStatus.result && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: '#fff',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'monospace',
            maxHeight: '200px',
            overflow: 'auto'
          }}
        >
          <strong>Result:</strong>
          <pre style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(taskStatus.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default AsyncOperationPoller;
