import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import OperationHistory from './OperationHistory';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OperationHistory Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'op1',
            cloneId: 'clone1',
            checkpointId: 'cp1',
            checkpointName: 'Checkpoint 1',
            type: 'create',
            status: 'completed',
            timestamp: new Date(Date.now() - 10000).toISOString(),
            completedAt: new Date().toISOString(),
            message: null,
            source: 'queue'
          },
          {
            id: 'op2',
            cloneId: 'clone1',
            checkpointId: 'cp2',
            checkpointName: 'Checkpoint 2',
            type: 'restore',
            status: 'completed',
            timestamp: new Date(Date.now() - 5000).toISOString(),
            completedAt: new Date().toISOString(),
            message: null,
            source: 'queue'
          }
        ]
      }
    });
  });

  describe('Data Loading', () => {
    it('should load and display all operations from API', async () => {
      const { container } = render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/Checkpoint 1/)).toBeInTheDocument();
        expect(screen.getByText(/Checkpoint 2/)).toBeInTheDocument();
      });

      // Verify API was called with correct endpoint
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/operations?limit=500')
      );
    });

    it('should load clone-specific operations when cloneId is provided', async () => {
      render(<OperationHistory cloneId="clone1" />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('/operations/timeline/clone1')
        );
      });
    });

    it('should handle loading state correctly', () => {
      mockedAxios.get.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          data: { success: true, data: [] }
        }), 1000))
      );

      render(<OperationHistory />);

      expect(screen.getByText(/Loading audit history/)).toBeInTheDocument();
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue({
        response: {
          data: { message: 'Database connection failed' }
        }
      });

      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/Database connection failed/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
      });
    });

    it('should display empty state when no operations exist', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { success: true, data: [] }
      });

      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/No operations recorded yet/)).toBeInTheDocument();
      });
    });

    it('should retry loading on button click', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { data: { message: 'Failed' } }
      });

      const { rerender } = render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
      });

      // Mock success on retry
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: [] }
      });

      await userEvent.click(screen.getByRole('button', { name: /Retry/ }));

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Filtering and Searching', () => {
    it('should filter operations by type', async () => {
      render(<OperationHistory />);

      await waitFor(() => {
        const typeSelect = screen.getByLabelText(/Filter by operation type/);
        expect(typeSelect).toBeInTheDocument();
      });

      const typeSelect = screen.getByLabelText(/Filter by operation type/);
      await userEvent.selectOption(typeSelect, 'create');

      await waitFor(() => {
        expect(screen.getByText(/Checkpoint 1/)).toBeInTheDocument();
        expect(screen.queryByText(/Checkpoint 2/)).not.toBeInTheDocument();
      });
    });

    it('should filter operations by status', async () => {
      render(<OperationHistory />);

      await waitFor(() => {
        const statusSelect = screen.getByLabelText(/Filter by operation status/);
        expect(statusSelect).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText(/Filter by operation status/);
      await userEvent.selectOption(statusSelect, 'completed');

      await waitFor(() => {
        expect(screen.getAllByText(/Completed/).length).toBeGreaterThan(0);
      });
    });

    it('should search operations by checkpoint name', async () => {
      render(<OperationHistory />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/Search operation id/);
        expect(searchInput).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search operation id/);
      await userEvent.type(searchInput, 'Checkpoint 1');

      await waitFor(() => {
        expect(screen.getByText(/Checkpoint 1/)).toBeInTheDocument();
        expect(screen.queryByText(/Checkpoint 2/)).not.toBeInTheDocument();
      });
    });

    it('should show filtered operation count', async () => {
      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/2 of 2 operations/)).toBeInTheDocument();
      });
    });
  });

  describe('Data Display', () => {
    it('should sort operations by timestamp descending (newest first)', async () => {
      const { container } = render(<OperationHistory />);

      await waitFor(() => {
        const items = container.querySelectorAll('.timeline-item');
        expect(items.length).toBe(2);
        // Newest operation (Checkpoint 2) should appear first
        expect(items[0]).toHaveTextContent('Checkpoint 2');
      });
    });

    it('should display operation details correctly', async () => {
      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/Checkpoint Created/)).toBeInTheDocument();
      });

      const timelineContent = screen.getByText(/Checkpoint 1/).closest('.timeline-content');
      expect(timelineContent).toBeInTheDocument();

      const detailRows = timelineContent?.querySelectorAll('.detail-row');
      expect(detailRows?.length).toBeGreaterThan(0);
    });

    it('should show operation type labels', async () => {
      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/Checkpoint Created/)).toBeInTheDocument();
        expect(screen.getByText(/Checkpoint Restored/)).toBeInTheDocument();
      });
    });

    it('should display status with appropriate styling', async () => {
      const { container } = render(<OperationHistory />);

      await waitFor(() => {
        const statusBadges = container.querySelectorAll('.operation-status');
        expect(statusBadges.length).toBeGreaterThan(0);
        expect(statusBadges[0]).toHaveClass('status-completed');
      });
    });
  });

  describe('Responsive Layout', () => {
    it('should render with proper spacing on desktop', async () => {
      const { container } = render(<OperationHistory />);

      await waitFor(() => {
        const history = container.querySelector('.operation-history');
        expect(history).toHaveStyle({ gap: '2rem', padding: '2rem' });
      });
    });

    it('should maintain layout structure with controls visible', async () => {
      render(<OperationHistory searchable={true} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Filter by operation type/)).toBeVisible();
        expect(screen.getByLabelText(/Filter by operation status/)).toBeVisible();
        expect(screen.getByPlaceholderText(/Search operation id/)).toBeVisible();
      });
    });

    it('should hide controls when searchable is false', () => {
      render(<OperationHistory searchable={false} />);

      expect(screen.queryByLabelText(/Filter by operation type/)).not.toBeInTheDocument();
    });
  });

  describe('Auto-refresh', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should auto-refresh operations every 10 seconds', async () => {
      render(<OperationHistory />);

      // Initial load
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      });

      // Fast-forward 10 seconds
      jest.advanceTimersByTime(10000);

      // Should have called API again
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });
    });

    it('should allow manual refresh via ref', async () => {
      const ref = React.createRef<any>();
      render(<OperationHistory ref={ref} />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      });

      // Manually trigger refresh
      await ref.current?.refresh();

      jest.advanceTimersByTime(600); // Debounce time

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle operations with missing optional fields', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          success: true,
          data: [
            {
              id: 'op1',
              cloneId: 'clone1',
              checkpointId: '',
              checkpointName: 'Clone operation',
              type: 'create-clone',
              status: 'completed',
              timestamp: new Date().toISOString(),
              // Missing completedAt, message, etc.
              source: 'queue'
            }
          ]
        }
      });

      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/Clone operation/)).toBeInTheDocument();
      });
    });

    it('should handle malformed timestamps gracefully', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          success: true,
          data: [
            {
              id: 'op1',
              cloneId: 'clone1',
              checkpointId: 'cp1',
              checkpointName: 'Test',
              type: 'create',
              status: 'completed',
              timestamp: 'invalid-date',
              source: 'queue'
            }
          ]
        }
      });

      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/Unknown/)).toBeInTheDocument();
      });
    });

    it('should show "In progress" for operations without completedAt', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          success: true,
          data: [
            {
              id: 'op1',
              cloneId: 'clone1',
              checkpointId: 'cp1',
              checkpointName: 'Running op',
              type: 'create',
              status: 'processing',
              timestamp: new Date().toISOString(),
              completedAt: null,
              source: 'queue'
            }
          ]
        }
      });

      render(<OperationHistory />);

      await waitFor(() => {
        expect(screen.getByText(/In progress/)).toBeInTheDocument();
      });
    });
  });
});
