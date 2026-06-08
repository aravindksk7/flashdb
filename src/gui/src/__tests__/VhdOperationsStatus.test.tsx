import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import VhdOperationsStatus from '../components/VhdOperationsStatus';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VhdOperationsStatus Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load and display VHD operations status', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: [
            'vhd-parent-chain-validation',
            'vhd-mount-point-tracking'
          ]
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
      expect(screen.getByText('Supported')).toBeInTheDocument();
    });
  });

  it('should display disk space gauge', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      const percentageText = screen.getByText(/51.2%/);
      expect(percentageText).toBeInTheDocument();
    });
  });

  it('should show warning for high disk usage', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 50 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 95,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(screen.getByText(/Critical/i)).toBeInTheDocument();
    });
  });

  it('should show caution for medium disk usage', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 250 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 75.5,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(screen.getByText(/Warning/i)).toBeInTheDocument();
    });
  });

  it('should list capabilities', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: [
            'vhd-parent-chain-validation',
            'vhd-mount-point-tracking',
            'disk-space-monitoring'
          ]
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(
        screen.getByText('vhd-parent-chain-validation')
      ).toBeInTheDocument();
      expect(
        screen.getByText('vhd-mount-point-tracking')
      ).toBeInTheDocument();
      expect(screen.getByText('disk-space-monitoring')).toBeInTheDocument();
    });
  });

  it('should handle disabled status', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: false,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    mockedAxios.get.mockImplementationOnce(
      () => new Promise(() => {}) // Never resolves
    );

    render(<VhdOperationsStatus />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display error message on load failure', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load VHD operations status/)
      ).toBeInTheDocument();
    });
  });

  it('should format byte sizes correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024, // 500 GB
          diskSpaceTotal: 1 * 1024 * 1024 * 1024 * 1024, // 1 TB
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(screen.getByText(/1 TB/)).toBeInTheDocument();
      expect(screen.getByText(/500 GB/)).toBeInTheDocument();
    });
  });

  it('should auto-refresh status periodically', async () => {
    jest.useFakeTimers();

    mockedAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(30000); // 30 seconds

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    jest.useRealTimers();
  });

  it('should fetch from correct endpoint', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          enabled: true,
          diskSpaceAvailable: 500 * 1024 * 1024 * 1024,
          diskSpaceTotal: 1024 * 1024 * 1024 * 1024,
          diskSpacePercentUsed: 51.2,
          lastHealthCheck: new Date().toISOString(),
          chainValidationSupported: true,
          capabilities: []
        }
      }
    });

    render(<VhdOperationsStatus />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/health/vhd-operations');
    });
  });
});
