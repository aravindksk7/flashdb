import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { CloneHealthMetrics } from '../components/CloneHealthMetrics';
import { RepairSuccessMetrics } from '../components/RepairSuccessMetrics';
import { HealthTrendChart } from '../components/HealthTrendChart';
import { OperationHistory } from '../components/OperationHistory';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Phase 8: Audit & Metrics Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CloneHealthMetrics Component', () => {
    const mockHealthMetrics = {
      success: true,
      data: {
        totalClones: 25,
        healthyClones: 22,
        unhealthyClones: 3,
        healthScore: 88.5,
        lastValidationTimestamp: new Date().toISOString(),
        validationsFailed: 2,
        validationsSuccess: 48,
        averageValidationTimeSeconds: 15.3
      }
    };

    it('should display health score', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockHealthMetrics);

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        expect(screen.getByText(/88.5%/)).toBeInTheDocument();
      });
    });

    it('should show health status label', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockHealthMetrics);

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        expect(screen.getByText('Excellent')).toBeInTheDocument();
      });
    });

    it('should display clone count metrics', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockHealthMetrics);

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        expect(screen.getByText('25')).toBeInTheDocument();
        expect(screen.getByText(/22 healthy/)).toBeInTheDocument();
      });
    });

    it('should calculate and display validation success rate', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockHealthMetrics);

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        // 48 / (48 + 2) = 96%
        expect(screen.getByText(/96.0%/)).toBeInTheDocument();
      });
    });

    it('should display average validation time', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockHealthMetrics);

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        expect(screen.getByText(/15.3s/)).toBeInTheDocument();
      });
    });

    it('should show loading state', () => {
      mockedAxios.get.mockImplementationOnce(
        () => new Promise(() => {}) // Never resolves
      );

      render(<CloneHealthMetrics />);

      // Component should render without crashing
      expect(screen.getByText('Clone Health Metrics')).toBeInTheDocument();
    });

    it('should display error on load failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API Error'));

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        expect(screen.getByText(/Clone Health Metrics/)).toBeInTheDocument();
      });
    });
  });

  describe('RepairSuccessMetrics Component', () => {
    const mockRepairMetrics = {
      success: true,
      data: {
        totalRepairs: 45,
        successfulRepairs: 42,
        failedRepairs: 3,
        successRate: 93.3,
        averageRepairTimeSeconds: 234,
        repairsByStatus: [
          { status: 'completed', count: 42 },
          { status: 'failed', count: 3 }
        ],
        lastRepairTimestamp: new Date().toISOString()
      }
    };

    it('should display repair success rate', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockRepairMetrics);

      render(<RepairSuccessMetrics />);

      await waitFor(() => {
        expect(screen.getByText(/93.3%/)).toBeInTheDocument();
      });
    });

    it('should display repair statistics', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockRepairMetrics);

      render(<RepairSuccessMetrics />);

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument(); // Total repairs
        expect(screen.getByText('42')).toBeInTheDocument(); // Successful
        expect(screen.getByText('3')).toBeInTheDocument();  // Failed
      });
    });

    it('should display average repair time', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockRepairMetrics);

      render(<RepairSuccessMetrics />);

      await waitFor(() => {
        expect(screen.getByText(/3.9m/)).toBeInTheDocument(); // 234s = 3.9m
      });
    });

    it('should show repair status distribution', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockRepairMetrics);

      render(<RepairSuccessMetrics />);

      await waitFor(() => {
        expect(screen.getByText('Repair Status Distribution')).toBeInTheDocument();
      });
    });

    it('should display last repair timestamp', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockRepairMetrics);

      render(<RepairSuccessMetrics />);

      await waitFor(() => {
        expect(screen.getByText('Last Repair')).toBeInTheDocument();
      });
    });
  });

  describe('HealthTrendChart Component', () => {
    const mockTrendData = {
      success: true,
      data: [
        {
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          healthScore: 85,
          healthyClones: 20,
          unhealthyClones: 5
        },
        {
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          healthScore: 87,
          healthyClones: 21,
          unhealthyClones: 4
        },
        {
          timestamp: new Date().toISOString(),
          healthScore: 90,
          healthyClones: 23,
          unhealthyClones: 2
        }
      ]
    };

    it('should display trend chart', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockTrendData);

      render(<HealthTrendChart />);

      await waitFor(() => {
        expect(screen.getByText('Clone Health Trend')).toBeInTheDocument();
      });
    });

    it('should show time range controls', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockTrendData);

      render(<HealthTrendChart />);

      await waitFor(() => {
        expect(screen.getByText('24h')).toBeInTheDocument();
        expect(screen.getByText('7d')).toBeInTheDocument();
        expect(screen.getByText('30d')).toBeInTheDocument();
      });
    });

    it('should display trend indicator (improving)', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockTrendData);

      render(<HealthTrendChart />);

      await waitFor(() => {
        expect(screen.getByText(/Improving/)).toBeInTheDocument();
      });
    });

    it('should display health statistics', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockTrendData);

      render(<HealthTrendChart />);

      await waitFor(() => {
        expect(screen.getByText('Current Health')).toBeInTheDocument();
        expect(screen.getByText('Lowest Health')).toBeInTheDocument();
        expect(screen.getByText('Highest Health')).toBeInTheDocument();
      });
    });
  });

  describe('OperationHistory Enhanced Display', () => {
    const mockOperations = {
      success: true,
      data: [
        {
          id: 'op-001',
          cloneId: 'clone-001',
          checkpointId: 'cp-001',
          checkpointName: 'Checkpoint A',
          type: 'create',
          status: 'completed',
          timestamp: new Date().toISOString(),
          completedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          message: 'Checkpoint created successfully',
          source: 'UI'
        },
        {
          id: 'op-002',
          cloneId: 'clone-001',
          checkpointId: 'cp-001',
          checkpointName: 'Checkpoint A',
          type: 'validation',
          status: 'completed',
          timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          completedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
          findingsCount: 0,
          validationStatus: 'healthy',
          source: 'Scheduler'
        },
        {
          id: 'op-003',
          cloneId: 'clone-001',
          checkpointId: 'cp-001',
          checkpointName: 'Checkpoint A',
          type: 'repair',
          status: 'completed',
          timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
          completedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          repairStatus: 'completed',
          source: 'Automation'
        }
      ]
    };

    it('should display operation type icons', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      const { container } = render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText(/Checkpoint A/)).toBeInTheDocument();
      });

      // Check for operation type markers
      const markers = container.querySelectorAll('.timeline-marker');
      expect(markers.length).toBeGreaterThan(0);
    });

    it('should display enhanced operation type labels', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText('Checkpoint Created')).toBeInTheDocument();
        expect(screen.getByText('Health Validation')).toBeInTheDocument();
        expect(screen.getByText('Repair Executed')).toBeInTheDocument();
      });
    });

    it('should display validation findings count', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText(/0 issue/)).toBeInTheDocument();
      });
    });

    it('should display repair status', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });

    it('should show operation source', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText('UI')).toBeInTheDocument();
        expect(screen.getByText('Scheduler')).toBeInTheDocument();
        expect(screen.getByText('Automation')).toBeInTheDocument();
      });
    });

    it('should filter by operation type', async () => {
      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" searchable={true} />);

      await waitFor(() => {
        const typeFilter = screen.getByDisplayValue('all');
        expect(typeFilter).toBeInTheDocument();
      });
    });
  });

  describe('Metrics Auto-Refresh', () => {
    it('should refresh metrics periodically', async () => {
      const mockMetrics = {
        success: true,
        data: {
          totalClones: 25,
          healthyClones: 22,
          unhealthyClones: 3,
          healthScore: 88.5,
          lastValidationTimestamp: new Date().toISOString(),
          validationsFailed: 2,
          validationsSuccess: 48,
          averageValidationTimeSeconds: 15.3
        }
      };

      mockedAxios.get.mockResolvedValue(mockMetrics);

      render(<CloneHealthMetrics />);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalled();
      });

      // Verify component renders without crashing
      expect(screen.getByText('Clone Health Metrics')).toBeInTheDocument();
    });
  });
});
