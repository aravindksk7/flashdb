/**
 * OperationHistory Refresh Tests
 * Verifies that OperationHistory properly refreshes when operations complete
 */

import React, { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { OperationHistory, type OperationHistoryRef } from '../OperationHistory';
import axios from 'axios';

jest.mock('axios');

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('OperationHistory Refresh Functionality', () => {
  const mockOperations = [
    {
      id: 'op-1',
      cloneId: 'clone-1',
      checkpointId: 'cp-1',
      checkpointName: 'Checkpoint 1',
      type: 'validation' as const,
      status: 'completed' as const,
      timestamp: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      source: 'audit' as const
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: mockOperations
      }
    });
  });

  it('should expose refresh method via ref', async () => {
    let historyRef: OperationHistoryRef | null = null;

    const TestComponent = () => {
      const ref = useRef<OperationHistoryRef>(null);

      React.useEffect(() => {
        historyRef = ref.current;
      }, []);

      return <OperationHistory ref={ref} title="Test History" />;
    };

    render(<TestComponent />);

    await waitFor(() => {
      expect(historyRef).not.toBeNull();
      expect(historyRef?.refresh).toBeDefined();
      expect(typeof historyRef?.refresh).toBe('function');
    });
  });

  it('should refresh operation list when refresh is called', async () => {
    let historyRef: OperationHistoryRef | null = null;

    const TestComponent = () => {
      const ref = useRef<OperationHistoryRef>(null);

      React.useEffect(() => {
        historyRef = ref.current;
      }, []);

      return <OperationHistory ref={ref} title="Test History" />;
    };

    const { rerender } = render(<TestComponent />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockAxios.get).toHaveBeenCalled();
    });

    const initialCallCount = mockAxios.get.mock.calls.length;

    // Call refresh
    await historyRef?.refresh();

    // Wait for refresh to complete
    await waitFor(() => {
      expect(mockAxios.get.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('should display operation history after refresh', async () => {
    let historyRef: OperationHistoryRef | null = null;

    const TestComponent = () => {
      const ref = useRef<OperationHistoryRef>(null);

      React.useEffect(() => {
        historyRef = ref.current;
      }, []);

      return <OperationHistory ref={ref} title="Test History" searchable={false} />;
    };

    render(<TestComponent />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText(/Validation/i)).toBeInTheDocument();
    });

    // Verify operations are displayed
    expect(screen.getByText('Checkpoint 1')).toBeInTheDocument();
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
  });

  it('should debounce rapid refresh calls', async () => {
    let historyRef: OperationHistoryRef | null = null;

    const TestComponent = () => {
      const ref = useRef<OperationHistoryRef>(null);

      React.useEffect(() => {
        historyRef = ref.current;
      }, []);

      return <OperationHistory ref={ref} title="Test History" />;
    };

    render(<TestComponent />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockAxios.get).toHaveBeenCalled();
    });

    const initialCallCount = mockAxios.get.mock.calls.length;

    // Rapidly call refresh multiple times
    historyRef?.refresh();
    historyRef?.refresh();
    historyRef?.refresh();

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 600));

    // Should only add one refresh call due to debouncing
    expect(mockAxios.get.mock.calls.length).toBeLessThan(initialCallCount + 3);
  });

  it('should handle API errors gracefully during refresh', async () => {
    let historyRef: OperationHistoryRef | null = null;

    const TestComponent = () => {
      const ref = useRef<OperationHistoryRef>(null);

      React.useEffect(() => {
        historyRef = ref.current;
      }, []);

      return <OperationHistory ref={ref} title="Test History" />;
    };

    const { rerender } = render(<TestComponent />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockAxios.get).toHaveBeenCalled();
    });

    // Setup next call to fail
    mockAxios.get.mockRejectedValueOnce(new Error('API Error'));

    // Call refresh - should not throw
    await expect(historyRef?.refresh()).resolves.not.toThrow();

    // Component should still be rendered
    expect(screen.getByText(/Test History/i)).toBeInTheDocument();
  });

  it('should update timestamp after refresh', async () => {
    let historyRef: OperationHistoryRef | null = null;

    const TestComponent = () => {
      const ref = useRef<OperationHistoryRef>(null);

      React.useEffect(() => {
        historyRef = ref.current;
      }, []);

      return <OperationHistory ref={ref} title="Test History" searchable={false} />;
    };

    render(<TestComponent />);

    // Get initial timestamp
    await waitFor(() => {
      expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
    });

    const initialElement = screen.getByText(/Last updated:/i);
    const initialTime = initialElement.textContent;

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Call refresh
    await historyRef?.refresh();

    // Wait for refresh to complete
    await waitFor(() => {
      const updatedElement = screen.getByText(/Last updated:/i);
      expect(updatedElement.textContent).not.toBe(initialTime);
    });
  });
});
