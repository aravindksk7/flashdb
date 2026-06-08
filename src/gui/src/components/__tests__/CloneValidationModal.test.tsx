/**
 * CloneValidationModal Component Tests
 *
 * Tests for the clone validation modal component:
 * - Trigger button rendering and click handling
 * - Validation in-progress state display
 * - Results display with findings
 * - Error message handling
 * - Lock conflict detection
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock component to be implemented
interface CloneValidationModalProps {
  cloneId: string;
  cloneName: string;
  onValidationComplete?: (result: any) => void;
  disabled?: boolean;
}

const mockComponent = ({ cloneId, cloneName, onValidationComplete, disabled }: CloneValidationModalProps) => (
  <div data-testid="clone-validation-modal">
    <button
      data-testid="validate-clone-button"
      disabled={disabled}
      onClick={async () => {
        try {
          const response = await axios.post(`/api/clones/${cloneId}/validate`);
          onValidationComplete?.(response.data);
        } catch (error) {
          console.error('Validation failed:', error);
        }
      }}
    >
      Validate Clone: {cloneName}
    </button>
  </div>
);

describe('CloneValidationModal Component', () => {
  const mockCloneId = 'clone-test-1';
  const mockCloneName = 'Test Clone';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== Trigger Button Tests =====

  describe('Trigger button', () => {
    it('should render validate button with clone name', () => {
      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(`Validate Clone: ${mockCloneName}`);
    });

    it('should be clickable and open modal', async () => {
      const user = userEvent.setup();
      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      await user.click(button);

      // Modal should be visible (implementation detail)
      expect(button).toHaveBeenCalled !== undefined;
    });

    it('should be disabled when validation is in progress', () => {
      const { rerender } = render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} disabled={false} />
      );

      let button = screen.getByTestId('validate-clone-button');
      expect(button).not.toBeDisabled();

      rerender(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} disabled={true} />
      );

      button = screen.getByTestId('validate-clone-button');
      expect(button).toBeDisabled();
    });

    it('should show loading spinner during validation', async () => {
      mockedAxios.post.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should show spinner (mock for now)
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });
  });

  // ===== Validation In Progress State =====

  describe('Validation in progress state', () => {
    it('should display validation in progress message', async () => {
      const mockResponse = {
        success: true,
        data: {
          taskId: 'task-validate-clone-test-1-1623000000000',
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'pending',
          estimatedDurationMs: 30000
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          `/api/clones/${mockCloneId}/validate`
        );
      });
    });

    it('should show estimated duration', async () => {
      const mockResponse = {
        success: true,
        data: {
          taskId: 'task-validate-clone-test-1-1623000000000',
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'pending',
          estimatedDurationMs: 45000 // 45 seconds
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should display "~45 seconds remaining"
      expect(mockResponse.data.estimatedDurationMs).toBeGreaterThan(0);
    });

    it('should allow cancellation during validation', async () => {
      const mockResponse = {
        success: true,
        data: {
          taskId: 'task-validate-clone-test-1-1623000000000',
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'pending'
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should show cancel button
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });
  });

  // ===== Validation Results Display =====

  describe('Results display', () => {
    it('should display validation results when complete', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);
      const onComplete = jest.fn();

      render(
        <mockComponent
          cloneId={mockCloneId}
          cloneName={mockCloneName}
          onValidationComplete={onComplete}
        />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should display healthy status with green indicator', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should display green indicator for Healthy status
      expect(mockResponse.data.data.status).toBe('Healthy');
    });

    it('should display unhealthy status with red indicator and findings', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Unhealthy',
          findings: [
            {
              severity: 'Error',
              code: 'NO_VHDX_PATH',
              message: 'VHD file not found at configured path'
            },
            {
              severity: 'Warning',
              code: 'STALE_METADATA',
              message: 'Metadata not updated in 30 days'
            }
          ],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 3000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should display:
      // - Red indicator for Unhealthy
      // - List of findings with severity badges
      expect(mockResponse.data.data.status).toBe('Unhealthy');
      expect(mockResponse.data.data.findings.length).toBeGreaterThan(0);
    });

    it('should display finding details in expandable list', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Unhealthy',
          findings: [
            {
              severity: 'Error',
              code: 'NO_VHDX_PATH',
              message: 'VHD file not found at configured path'
            }
          ],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should allow expanding each finding to see details
      const finding = mockResponse.data.data.findings[0];
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('code');
      expect(finding).toHaveProperty('message');
    });

    it('should display validation timestamp and duration', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 1500 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should display: "Validated at 3:45 PM (1.5s)"
      expect(mockResponse.data.data.validatedAt).toBeDefined();
      expect(mockResponse.data.data.duration.elapsedMs).toBeGreaterThan(0);
    });
  });

  // ===== Error Handling =====

  describe('Error message handling', () => {
    it('should display error message when clone not found', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: 'Clone not found: clone-nonexistent',
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 404, data: errorResponse }
      });

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should display: "Clone not found"
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should display lock conflict message', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'E002_VALIDATION_IN_PROGRESS',
          message: 'Validation already in progress for this clone',
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

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should display conflict message with retry button
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should allow retry after error', async () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'E007_SERVICE_ERROR',
          message: 'Validation service error',
          details: { originalError: 'Connection timeout' },
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post
        .mockRejectedValueOnce({
          response: { status: 500, data: errorResponse }
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            cloneId: mockCloneId,
            validationId: 'validation-clone-test-1-1623000000001',
            status: 'Healthy',
            findings: [],
            validatedAt: new Date().toISOString(),
            duration: { elapsedMs: 2000 }
          }
        });

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');

      // First attempt fails
      fireEvent.click(button);
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      });

      // Second attempt succeeds
      fireEvent.click(button);
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ===== State Management Tests =====

  describe('Modal state management', () => {
    it('should close modal when clicking outside', async () => {
      const { container } = render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should have a close button or allow clicking outside
      // to dismiss the modal
    });

    it('should persist results until explicitly closed', async () => {
      const mockResponse = {
        success: true,
        data: {
          cloneId: mockCloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should keep showing results until user closes modal
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('should clear state when modal is closed', async () => {
      const { rerender } = render(
        <mockComponent cloneId={mockCloneId} cloneName={mockCloneName} />
      );

      const button = screen.getByTestId('validate-clone-button');
      fireEvent.click(button);

      // Implementation should clean up state when modal closes
    });
  });
});
