import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import SqlAdapterStatus from '../components/SqlAdapterStatus';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SqlAdapterStatus Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load and display adapter status', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(screen.getByText('dbatools')).toBeInTheDocument();
      expect(screen.getByText('21.0.2')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    mockedAxios.get.mockImplementationOnce(
      () => new Promise(() => {}) // Never resolves
    );

    render(<SqlAdapterStatus />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display error message on load failure', async () => {
    mockedAxios.get.mockRejectedValueOnce(
      new Error('Network error')
    );

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load SQL adapter status/)).toBeInTheDocument();
    });
  });

  it('should test connectivity with valid server name', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          success: true,
          serverName: 'localhost',
          databaseName: 'master',
          connectionTime: 100,
          dbtoolsVersion: '21.0.2',
          sqlVersion: '2019',
          testTime: new Date().toISOString()
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/localhost/)).toBeInTheDocument();
    });

    const serverInput = screen.getByPlaceholderText(/localhost/) as HTMLInputElement;
    fireEvent.change(serverInput, { target: { value: 'localhost' } });

    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/api/health/sql-adapter/test',
        expect.objectContaining({ serverName: 'localhost' })
      );
    });
  });

  it('should reject connectivity test without server name', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });

    const testButton = screen.getByText('Test Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/Please enter a server name/)).toBeInTheDocument();
    });
  });

  it('should toggle adapter status', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    mockedAxios.put.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: false,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'disconnected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(screen.getByText('Disable Adapter')).toBeInTheDocument();
    });

    const toggleButton = screen.getByText('Disable Adapter');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockedAxios.put).toHaveBeenCalledWith(
        '/api/health/sql-adapter/toggle',
        { enabled: false }
      );
    });
  });

  it('should display test results correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          success: true,
          serverName: 'DEVSERVER',
          databaseName: 'master',
          connectionTime: 250,
          dbtoolsVersion: '21.0.2',
          sqlVersion: '2019',
          testTime: new Date().toISOString()
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      const serverInput = screen.getByPlaceholderText(/localhost/) as HTMLInputElement;
      fireEvent.change(serverInput, { target: { value: 'DEVSERVER' } });
      fireEvent.click(screen.getByText('Test Connection'));
    });

    await waitFor(() => {
      expect(screen.getByText('Test Results')).toBeInTheDocument();
      expect(screen.getByText('DEVSERVER')).toBeInTheDocument();
    });
  });

  it('should display connectivity status with correct color', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(screen.getByText('connected')).toBeInTheDocument();
    });
  });

  it('should auto-refresh status periodically', async () => {
    jest.useFakeTimers();

    mockedAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          version: '21.0.2',
          type: 'dbatools',
          lastHealthCheck: new Date().toISOString(),
          connectivity: 'connected',
          featureFlagStatus: 'enabled'
        }
      }
    });

    render(<SqlAdapterStatus />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(30000); // 30 seconds

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    jest.useRealTimers();
  });
});
