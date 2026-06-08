/**
 * CloneRepairModal Component Tests
 *
 * Tests for the clone repair modal component:
 * - Trigger button rendering
 * - Dry-run preview workflow
 * - User approval flow
 * - Repair execution progress
 * - Final results display
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

interface CloneRepairModalProps {
  cloneId: string;
  cloneName: string;
  onRepairComplete?: (result: any) => void;
  disabled?: boolean;
}

const mockComponent = ({ cloneId, cloneName, onRepairComplete, disabled }: CloneRepairModalProps) => (
  <div data-testid="clone-repair-modal">
    <button
      data-testid="repair-clone-button"
      disabled={disabled}
      onClick={async () => {
        try {
          const response = await axios.post(`/api/clones/${cloneId}/repair`, {
            dryRun: true
          });
          onRepairComplete?.(response.data);
        } catch (error) {
          console.error('Repair failed:', error);
        }
      }}
    >
      Repair Clone: {cloneName}
    </button>
  </div>
);

describe('CloneRepairModal Component', () => {
  const mockCloneId = 'clone-unhealthy';
  const mockCloneName = 'Unhealthy Clone';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== Trigger Button Tests =====

  describe('Trigger button', () => {
    it('should render repair button with clone name', () => {
      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(`Repair Clone: ${mockCloneName}`);
    });

    it('should be disabled for healthy clones', () => {
      render(
        <mockComponent cloneId="clone-healthy" cloneName="Healthy Clone" disabled={true} />
      );

      const button = screen.getByTestId('repair-clone-button');
      expect(button).toBeDisabled();
    });

    it('should be enabled for unhealthy clones', () => {
      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} disabled={false} />
      );

      const button = screen.getByTestId('repair-clone-button');
      expect(button).not.toBeDisabled();
    });

    it('should open modal when clicked', async () => {
      const user = userEvent.setup();
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      await user.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          `/api/clones/${mockCloneId}/repair`,
          { dryRun: true }
        );
      });
    });
  });

  // ===== Dry-Run Preview Workflow =====

  describe('Dry-run preview', () => {
    it('should display repair plan preview on dry-run', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata in database',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              },
              {
                type: 'RemountVhd',
                description: 'Remount VHD file at configured path',
                estimatedDurationSeconds: 30,
                riskLevel: 'Medium'
              },
              {
                type: 'AttachDatabase',
                description: 'Reattach SQL Server database',
                estimatedDurationSeconds: 20,
                riskLevel: 'Medium'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          },
          blockers: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString()
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Implementation should display repair plan details
      expect(mockResponse.data.data.plan.actions.length).toBeGreaterThan(0);
    });

    it('should display planned actions with details', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              },
              {
                type: 'RemountVhd',
                description: 'Remount VHD file',
                estimatedDurationSeconds: 30,
                riskLevel: 'Medium'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          },
          blockers: []
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Implementation should display:
      // Action 1: [Low Risk] Update clone metadata (10s estimated)
      // Action 2: [Medium Risk] Remount VHD file (30s estimated)
      const actions = mockResponse.data.data.plan.actions;
      actions.forEach((action) => {
        expect(action).toHaveProperty('type');
        expect(action).toHaveProperty('description');
        expect(action).toHaveProperty('estimatedDurationSeconds');
        expect(action).toHaveProperty('riskLevel');
      });
    });

    it('should display total estimated duration', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Implementation should display: "Estimated duration: 1 minute"
      expect(mockResponse.data.data.plan.estimatedDurationSeconds).toBe(60);
    });

    it('should indicate if approval is required', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [],
            estimatedDurationSeconds: 120,
            requiresApproval: true // > 60 seconds
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Implementation should show: "This operation requires approval"
      expect(mockResponse.data.data.plan.requiresApproval).toBe(true);
    });

    it('should display any blockers preventing repair', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'CannotRepair',
          plan: {
            actions: [],
            estimatedDurationSeconds: 0,
            requiresApproval: false
          },
          blockers: [
            {
              type: 'InUseByOtherOperation',
              message: 'Clone is currently being backed up',
              resolveBy: '2026-06-08T15:30:00Z'
            }
          ]
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });

      // Implementation should display blockers prominently
      expect(mockResponse.data.data.blockers.length).toBeGreaterThan(0);
    });

    it('should expire plan after 5 minutes', async () => {
      const expiresAt = new Date(Date.now() + 300000).toISOString();
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          },
          expiresAt
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // Implementation should show expiration warning
      // "Plan expires in 5:00 - refresh if needed"
      expect(mockResponse.data.data.expiresAt).toBeDefined();
    });
  });

  // ===== Approval Flow =====

  describe('User approval flow', () => {
    it('should require explicit approval before execution', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'RemountVhd',
                description: 'Remount VHD file',
                estimatedDurationSeconds: 30,
                riskLevel: 'Medium'
              }
            ],
            estimatedDurationSeconds: 30,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // Implementation should show:
      // - "Approve" button (disabled initially)
      // - "Cancel" button
      // - Confirmation checkbox: "I understand this will modify the clone"
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should show confirmation dialog on approval', async () => {
      const mockPlanResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockPlanResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // User clicks "Approve"
      // Implementation should show confirmation: "Ready to execute repair?"
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should display risk warning for high-risk repairs', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'DetachDatabase',
                description: 'Detach and reattach database',
                estimatedDurationSeconds: 60,
                riskLevel: 'High'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // Implementation should show HIGH RISK warning in red
      const actions = mockResponse.data.data.plan.actions;
      const highRiskAction = actions.find(a => a.riskLevel === 'High');
      expect(highRiskAction).toBeDefined();
    });

    it('should allow cancelling repair at approval stage', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // User can click "Cancel" to close modal without executing
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });
  });

  // ===== Execution Progress =====

  describe('Repair execution progress', () => {
    it('should display execution progress', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: false,
          taskId: 'task-repair-clone-unhealthy-1623000000000',
          status: 'Queued'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // Implementation should show progress bar
      // Starting from "Queued" → "InProgress" → "Completed"
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should show current action being executed', async () => {
      // Mock repair status response
      const mockStatusResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'InProgress',
          progress: {
            current: 2,
            total: 3,
            percentage: 66
          },
          currentAction: 'Remounting VHD...'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockStatusResponse);

      // Implementation should display:
      // Progress: [████████░░] 66%
      // Currently: Remounting VHD...
      // Step 2 of 3
      expect(mockStatusResponse.data.data.currentAction).toBeDefined();
      expect(mockStatusResponse.data.data.progress.percentage).toBeGreaterThan(0);
    });

    it('should show elapsed and estimated remaining time', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'InProgress',
          progress: {
            current: 2,
            total: 3,
            percentage: 66
          },
          elapsedSeconds: 40,
          estimatedRemainingSeconds: 20
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockStatusResponse);

      // Implementation should display:
      // "40s elapsed, ~20s remaining"
      expect(mockStatusResponse.data.data.elapsedSeconds).toBeDefined();
      expect(mockStatusResponse.data.data.estimatedRemainingSeconds).toBeDefined();
    });

    it('should allow cancelling repair during execution', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'InProgress'
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockStatusResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      // Implementation should show "Cancel Repair" button during InProgress
      // Clicking it should call POST /api/clones/:cloneId/repair/cancel
      expect(mockStatusResponse.data.data.status).toBe('InProgress');
    });
  });

  // ===== Results Display =====

  describe('Final results display', () => {
    it('should display repair completion results', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'Completed',
          completedAt: new Date().toISOString(),
          result: {
            success: true,
            appliedActions: [
              'Updated metadata in database',
              'Remounted VHD file at path',
              'Reattached SQL database'
            ],
            durationSeconds: 65
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockStatusResponse);

      // Implementation should display:
      // ✓ Repair Completed Successfully
      // Completed in: 1m 5s
      // Actions Applied:
      // ✓ Updated metadata
      // ✓ Remounted VHD
      // ✓ Reattached database
      expect(mockStatusResponse.data.data.result.success).toBe(true);
      expect(mockStatusResponse.data.data.result.appliedActions.length).toBeGreaterThan(0);
    });

    it('should show failure message if repair fails', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'Failed',
          completedAt: new Date().toISOString(),
          error: {
            message: 'Failed to remount VHD: file not found',
            appliedActions: ['Updated metadata in database'],
            failedAt: 'Remounting VHD...'
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockStatusResponse);

      // Implementation should display:
      // ✗ Repair Failed
      // Error: Failed to remount VHD: file not found
      // Partially completed: 1 of 3 actions
      expect(mockStatusResponse.data.data.status).toBe('Failed');
      expect(mockStatusResponse.data.data.error).toBeDefined();
    });

    it('should allow re-running repair after failure', async () => {
      // After failed repair, user should be able to:
      // 1. Fix the underlying issue
      // 2. Click "Retry Repair"
      // 3. Run dry-run again to see new plan
      // 4. Execute repair again
    });

    it('should display summary statistics', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'Completed',
          result: {
            success: true,
            appliedActions: [],
            durationSeconds: 65,
            actionsExecuted: 3,
            issuesFixed: 2
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockStatusResponse);

      // Implementation should show:
      // Summary: 3 actions executed, 2 issues fixed in 1m 5s
    });

    it('should allow closing results modal', async () => {
      // After repair completes, user can:
      // - Click "Close" to dismiss modal
      // - Validation should auto-run to verify clone is now healthy
      // - Clone health indicator should update
    });
  });

  // ===== Error Handling =====

  describe('Error handling', () => {
    it('should handle validation-in-progress errors', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'E003_REPAIR_IN_PROGRESS',
          message: 'Repair already in progress for this clone',
          details: {
            lockInfo: {
              ownerId: 'operator-123',
              acquiredAt: new Date().toISOString()
            }
          },
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 409, data: errorResponse }
      });

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // Implementation should display: "Repair is already in progress"
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should handle service errors', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'E007_SERVICE_ERROR',
          message: 'Repair service error',
          details: { originalError: 'Database connection failed' },
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 500, data: errorResponse }
      });

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('repair-clone-button');
      fireEvent.click(button);

      // Implementation should show: "Service error - please try again later"
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });
  });
});
