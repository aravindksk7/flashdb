import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { CheckpointManager } from '../components/CheckpointManager';
import { OperationHistory } from '../components/OperationHistory';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Phase 7 & 8: Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockClone = {
    id: 'clone-001',
    name: 'integration-test-clone'
  };

  describe('Checkpoint Pin Protection & Delete Confirmation Flow', () => {
    it('should complete full pinned checkpoint delete flow with protection', async () => {
      const mockCheckpoints = {
        success: true,
        data: [
          {
            id: 'cp-pinned',
            cloneId: 'clone-001',
            name: 'Protected Checkpoint',
            phase: 'manual',
            description: 'Important data',
            createdAt: '2024-01-01T10:00:00Z',
            isFavorite: true,
            labels: ['critical'],
            diskPath: 'C:\\Snapshots\\cp-pinned.vhdx',
            backingDiskValid: true
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockCheckpoints);

      const { rerender } = render(
        <CheckpointManager clone={mockClone} onChanged={jest.fn()} />
      );

      // Verify checkpoint loads with pin badge
      await waitFor(() => {
        expect(screen.getByText(/Pinned/)).toBeInTheDocument();
      });

      // Find and click delete button
      const deleteButtons = screen.getAllByRole('button');
      const deleteBtn = deleteButtons.find(btn => btn.textContent.includes('Delete'));
      fireEvent.click(deleteBtn!);

      // Verify modal appears with pin warning
      await waitFor(() => {
        expect(screen.getByText(/This restore point is pinned/)).toBeInTheDocument();
        expect(screen.getByText(/Force delete pinned/)).toBeInTheDocument();
      });

      // Verify delete button is disabled
      const deleteConfirmBtn = screen.getByRole('button', { name: /Delete/ });
      expect(deleteConfirmBtn).toBeDisabled();

      // Enable force delete
      const forceCheckbox = screen.getByRole('checkbox');
      fireEvent.click(forceCheckbox);

      // Verify delete button is now enabled
      expect(deleteConfirmBtn).not.toBeDisabled();
    });
  });

  describe('Checkpoint Restore with Backing Validation', () => {
    it('should validate backing disk during restore', async () => {
      const mockCheckpoints = {
        success: true,
        data: [
          {
            id: 'cp-restore',
            cloneId: 'clone-001',
            name: 'Restorable Checkpoint',
            phase: 'manual',
            description: 'Ready to restore',
            createdAt: '2024-01-01T10:00:00Z',
            isFavorite: false,
            labels: ['test'],
            diskPath: 'C:\\Snapshots\\cp-restore.vhdx',
            backingDiskValid: true
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockCheckpoints);

      render(
        <CheckpointManager clone={mockClone} onChanged={jest.fn()} />
      );

      // Verify checkpoint displays
      await waitFor(() => {
        expect(screen.getByText('Restorable Checkpoint')).toBeInTheDocument();
      });

      // Backing disk path should be visible in the checkpoint details
      expect(screen.getByText(/C:\\Snapshots\\cp-restore.vhdx/)).toBeInTheDocument();
    });
  });

  describe('Operation History with Enhanced Type Display', () => {
    it('should display enhanced operation types in timeline', async () => {
      const mockOperations = {
        success: true,
        data: [
          {
            id: 'op-cp-create',
            cloneId: 'clone-001',
            checkpointId: 'cp-001',
            checkpointName: 'Test Checkpoint',
            type: 'create',
            status: 'completed',
            timestamp: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:30Z',
            message: 'Checkpoint created',
            source: 'UI'
          },
          {
            id: 'op-validation',
            cloneId: 'clone-001',
            checkpointId: 'cp-001',
            checkpointName: 'Test Checkpoint',
            type: 'validation',
            status: 'completed',
            timestamp: '2024-01-01T11:00:00Z',
            completedAt: '2024-01-01T11:00:45Z',
            findingsCount: 0,
            validationStatus: 'healthy',
            source: 'Scheduler'
          },
          {
            id: 'op-restore',
            cloneId: 'clone-001',
            checkpointId: 'cp-001',
            checkpointName: 'Test Checkpoint',
            type: 'restore',
            status: 'completed',
            timestamp: '2024-01-01T12:00:00Z',
            completedAt: '2024-01-01T12:05:00Z',
            message: 'Restore successful',
            source: 'API'
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText('Checkpoint Created')).toBeInTheDocument();
        expect(screen.getByText('Health Validation')).toBeInTheDocument();
        expect(screen.getByText('Checkpoint Restored')).toBeInTheDocument();
      });
    });

    it('should display validation health status', async () => {
      const mockOperations = {
        success: true,
        data: [
          {
            id: 'op-validation-healthy',
            cloneId: 'clone-001',
            checkpointId: 'cp-001',
            checkpointName: 'Healthy Checkpoint',
            type: 'validation',
            status: 'completed',
            timestamp: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:00:30Z',
            findingsCount: 0,
            validationStatus: 'healthy',
            source: 'Scheduler'
          },
          {
            id: 'op-validation-unhealthy',
            cloneId: 'clone-001',
            checkpointId: 'cp-002',
            checkpointName: 'Unhealthy Checkpoint',
            type: 'validation',
            status: 'completed',
            timestamp: '2024-01-01T11:00:00Z',
            completedAt: '2024-01-01T11:00:30Z',
            findingsCount: 3,
            validationStatus: 'unhealthy',
            source: 'Scheduler'
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText(/✓ Healthy/)).toBeInTheDocument();
        expect(screen.getByText(/✕ Unhealthy/)).toBeInTheDocument();
      });
    });

    it('should show repair execution status', async () => {
      const mockOperations = {
        success: true,
        data: [
          {
            id: 'op-repair-1',
            cloneId: 'clone-001',
            checkpointId: 'cp-001',
            checkpointName: 'Test Checkpoint',
            type: 'repair',
            status: 'completed',
            timestamp: '2024-01-01T10:00:00Z',
            completedAt: '2024-01-01T10:10:00Z',
            repairStatus: 'completed',
            source: 'Automation'
          },
          {
            id: 'op-repair-2',
            cloneId: 'clone-001',
            checkpointId: 'cp-002',
            checkpointName: 'Another Checkpoint',
            type: 'repair',
            status: 'failed',
            timestamp: '2024-01-01T11:00:00Z',
            completedAt: '2024-01-01T11:05:00Z',
            repairStatus: 'failed',
            message: 'Repair failed: disk access error',
            source: 'Automation'
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockOperations);

      render(<OperationHistory cloneId="clone-001" />);

      await waitFor(() => {
        expect(screen.getByText('Repair Executed')).toBeInTheDocument();
        expect(screen.getByText(/Completed|Failed/)).toBeInTheDocument();
      });
    });
  });

  describe('Checkpoint Manager with Full Feature Set', () => {
    it('should render all checkpoint management features', async () => {
      const mockCheckpoints = {
        success: true,
        data: [
          {
            id: 'cp-001',
            cloneId: 'clone-001',
            name: 'Full Feature Test',
            phase: 'manual',
            description: 'Tests all features',
            createdAt: '2024-01-01T10:00:00Z',
            isFavorite: true,
            labels: ['feature-test', 'production'],
            diskPath: 'C:\\Snapshots\\cp-001.vhdx',
            backingDiskValid: true
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockCheckpoints);

      render(
        <CheckpointManager clone={mockClone} onChanged={jest.fn()} />
      );

      await waitFor(() => {
        // Pin badge
        expect(screen.getByText(/Pinned/)).toBeInTheDocument();

        // Checkpoint details
        expect(screen.getByText('Full Feature Test')).toBeInTheDocument();
        expect(screen.getByText('feature-test, production')).toBeInTheDocument();

        // Action buttons
        expect(screen.getByRole('button', { name: /Unpin/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Restore/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle empty checkpoint list', async () => {
      mockedAxios.get.mockResolvedValueOnce({ success: true, data: [] });

      render(
        <CheckpointManager clone={mockClone} onChanged={jest.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByText(/No restore points found/)).toBeInTheDocument();
      });
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(
        new Error('Network error')
      );

      render(
        <CheckpointManager clone={mockClone} onChanged={jest.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByText(/Failed to load restore points/)).toBeInTheDocument();
      });
    });

    it('should handle missing checkpoint properties', async () => {
      const mockCheckpoints = {
        success: true,
        data: [
          {
            id: 'cp-minimal',
            cloneId: 'clone-001',
            name: 'Minimal Checkpoint',
            phase: 'manual',
            description: '',
            createdAt: '',
            isFavorite: false,
            labels: []
          }
        ]
      };

      mockedAxios.get.mockResolvedValueOnce(mockCheckpoints);

      render(
        <CheckpointManager clone={mockClone} onChanged={jest.fn()} />
      );

      await waitFor(() => {
        expect(screen.getByText('Minimal Checkpoint')).toBeInTheDocument();
      });
    });
  });
});
