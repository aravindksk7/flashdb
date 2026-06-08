import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import DiskSpaceMonitor from '../components/DiskSpaceMonitor';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DiskSpaceMonitor Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockDiskData = {
    success: true,
    data: {
      locations: [
        {
          path: 'C:\\ClonePool',
          total: 1024 * 1024 * 1024 * 1024,
          used: 524 * 1024 * 1024 * 1024,
          available: 500 * 1024 * 1024 * 1024,
          percentUsed: 51.2,
          warning: false
        },
        {
          path: 'D:\\Clones',
          total: 2 * 1024 * 1024 * 1024 * 1024,
          used: 1638 * 1024 * 1024 * 1024,
          available: 410 * 1024 * 1024 * 1024,
          percentUsed: 80,
          warning: true
        }
      ],
      lastCheck: new Date().toISOString()
    }
  };

  it('should load and display disk space information', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText('C:\\ClonePool')).toBeInTheDocument();
      expect(screen.getByText('D:\\Clones')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    mockedAxios.get.mockImplementationOnce(
      () => new Promise(() => {}) // Never resolves
    );

    render(<DiskSpaceMonitor />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display error message on load failure', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load disk space info/)
      ).toBeInTheDocument();
    });
  });

  it('should display health status for each location', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  it('should show critical status for high usage', async () => {
    const criticalData = {
      ...mockDiskData,
      data: {
        ...mockDiskData.data,
        locations: [
          {
            path: 'C:\\Critical',
            total: 1024 * 1024 * 1024 * 1024,
            used: 950 * 1024 * 1024 * 1024,
            available: 74 * 1024 * 1024 * 1024,
            percentUsed: 92.8,
            warning: true
          }
        ]
      }
    };

    mockedAxios.get.mockResolvedValueOnce(criticalData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  it('should format byte sizes correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/1 TB/)).toBeInTheDocument();
      expect(screen.getByText(/512 GB/)).toBeInTheDocument();
    });
  });

  it('should display percentage used for each location', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/51.2% used/)).toBeInTheDocument();
      expect(screen.getByText(/80% used/)).toBeInTheDocument();
    });
  });

  it('should display warning message for high usage locations', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText(/Consider freeing disk space/)).toBeInTheDocument();
    });
  });

  it('should show critical warning for critical usage', async () => {
    const criticalData = {
      ...mockDiskData,
      data: {
        ...mockDiskData.data,
        locations: [
          {
            path: 'C:\\Critical',
            total: 1024 * 1024 * 1024 * 1024,
            used: 950 * 1024 * 1024 * 1024,
            available: 74 * 1024 * 1024 * 1024,
            percentUsed: 92.8,
            warning: true
          }
        ]
      }
    };

    mockedAxios.get.mockResolvedValueOnce(criticalData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(
        screen.getByText(/Disk space is critically low/)
      ).toBeInTheDocument();
    });
  });

  it('should display summary statistics', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // 2 total locations
    });
  });

  it('should allow manual refresh', async () => {
    mockedAxios.get.mockResolvedValue(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText('C:\\ClonePool')).toBeInTheDocument();
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
  });

  it('should auto-refresh disk space periodically', async () => {
    jest.useFakeTimers();

    mockedAxios.get.mockResolvedValue(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(60000); // 60 seconds

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    jest.useRealTimers();
  });

  it('should fetch from correct endpoint', async () => {
    mockedAxios.get.mockResolvedValueOnce(mockDiskData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/health/disk-space');
    });
  });

  it('should handle multiple locations with different statuses', async () => {
    const multiLocationData = {
      success: true,
      data: {
        locations: [
          {
            path: 'C:\\Healthy',
            total: 1000,
            used: 300,
            available: 700,
            percentUsed: 30,
            warning: false
          },
          {
            path: 'D:\\Warning',
            total: 1000,
            used: 800,
            available: 200,
            percentUsed: 80,
            warning: true
          },
          {
            path: 'E:\\Critical',
            total: 1000,
            used: 950,
            available: 50,
            percentUsed: 95,
            warning: true
          }
        ],
        lastCheck: new Date().toISOString()
      }
    };

    mockedAxios.get.mockResolvedValueOnce(multiLocationData);

    render(<DiskSpaceMonitor />);

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
      expect(screen.getByText('Warning')).toBeInTheDocument();
      expect(screen.getAllByText('Critical')[0]).toBeInTheDocument();
    });
  });
});
