/**
 * Host Management GUI Integration Tests
 *
 * Tests for Phase 6: Remote Host Handling GUI Components
 * - Host list display
 * - Host registration form
 * - Host validation workflow
 * - Connection testing
 * - Path mapping configuration
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { HostManagement } from '../HostManagement';
import { HostList } from '../HostList';
import { AddHostForm } from '../AddHostForm';
import { HostValidationModal } from '../HostValidationModal';
import { ConnectionTestPanel } from '../ConnectionTestPanel';
import { PathMappingConfigurator } from '../PathMappingConfigurator';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Host Management Integration Tests', () => {
  const mockHosts = [
    {
      id: 'host-1',
      name: 'Production DB',
      fqdn: 'prod-db.example.com',
      accessMethod: 'WinRM' as const,
      validationState: 'Valid' as const,
      lastValidatedAt: new Date().toISOString(),
      pathMappings: {},
      sqlInstances: []
    },
    {
      id: 'host-2',
      name: 'Staging DB',
      fqdn: 'stage-db.example.com',
      accessMethod: 'SSH' as const,
      validationState: 'Invalid' as const,
      lastValidatedAt: new Date(Date.now() - 86400000).toISOString(),
      pathMappings: {},
      sqlInstances: []
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('HostManagement - Main Container', () => {
    it('should render loading state initially', async () => {
      mockedAxios.get.mockReturnValue(new Promise(() => {})); // Never resolves

      render(<HostManagement />);
      expect(screen.getByText(/Loading hosts/i)).toBeInTheDocument();
    });

    it('should load and display hosts', async () => {
      mockedAxios.get.mockResolvedValue({ data: { success: true, data: mockHosts } });

      render(<HostManagement />);

      await waitFor(() => {
        expect(screen.getByText('Production DB')).toBeInTheDocument();
        expect(screen.getByText('Staging DB')).toBeInTheDocument();
      });
    });

    it('should display error message on load failure', async () => {
      mockedAxios.get.mockRejectedValue({
        response: { data: { message: 'Failed to load hosts' } }
      });

      render(<HostManagement />);

      await waitFor(() => {
        expect(screen.getByText(/Failed to load hosts/)).toBeInTheDocument();
      });
    });

    it('should show register host form when button clicked', async () => {
      mockedAxios.get.mockResolvedValue({ data: { success: true, data: [] } });

      render(<HostManagement />);

      await waitFor(() => {
        expect(screen.getByText('+ Register Host')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ Register Host'));

      await waitFor(() => {
        expect(screen.getByText(/Register New Host/)).toBeInTheDocument();
      });
    });

    it('should toggle between list and add views', async () => {
      mockedAxios.get.mockResolvedValue({ data: { success: true, data: mockHosts } });

      render(<HostManagement />);

      await waitFor(() => {
        expect(screen.getByText('Production DB')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('+ Register Host'));

      await waitFor(() => {
        expect(screen.getByText('View Hosts')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View Hosts'));

      await waitFor(() => {
        expect(screen.getByText('+ Register Host')).toBeInTheDocument();
      });
    });
  });

  describe('HostList Component', () => {
    const mockHandlers = {
      onValidate: jest.fn(),
      onTest: jest.fn(),
      onConfigurePaths: jest.fn(),
      onEdit: jest.fn(),
      onDelete: jest.fn()
    };

    it('should display hosts in table format', () => {
      render(
        <HostList hosts={mockHosts} {...mockHandlers} />
      );

      expect(screen.getByText('Production DB')).toBeInTheDocument();
      expect(screen.getByText('prod-db.example.com')).toBeInTheDocument();
      expect(screen.getByText('Staging DB')).toBeInTheDocument();
    });

    it('should show validation status badges', () => {
      render(
        <HostList hosts={mockHosts} {...mockHandlers} />
      );

      expect(screen.getByText('Valid')).toBeInTheDocument();
      expect(screen.getByText('Invalid')).toBeInTheDocument();
    });

    it('should display last validated date', () => {
      render(
        <HostList hosts={mockHosts} {...mockHandlers} />
      );

      // Should show dates
      const lastValidatedCells = screen.getAllByText(/2024|2025|2026/);
      expect(lastValidatedCells.length).toBeGreaterThan(0);
    });

    it('should call action handlers on button click', () => {
      render(
        <HostList hosts={mockHosts} {...mockHandlers} />
      );

      // Find and click validate button (first action button in first row)
      const firstRow = screen.getByText('Production DB').closest('tr');
      if (firstRow) {
        const buttons = within(firstRow!).getAllByRole('button');
        fireEvent.click(buttons[0]); // Validate button
      }

      expect(mockHandlers.onValidate).toBeCalled();
    });

    it('should show empty state when no hosts', () => {
      render(
        <HostList hosts={[]} {...mockHandlers} />
      );

      expect(screen.getByText(/No Hosts Registered/)).toBeInTheDocument();
      expect(screen.getByText(/Register your first remote host/)).toBeInTheDocument();
    });
  });

  describe('AddHostForm Component', () => {
    it('should render form with required fields', () => {
      const mockOnSubmit = jest.fn();
      render(
        <AddHostForm
          onSubmit={mockOnSubmit}
          onCancel={jest.fn()}
        />
      );

      expect(screen.getByLabelText(/Host Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/FQDN/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Access Method/)).toBeInTheDocument();
    });

    it('should validate form on submit', async () => {
      const mockOnSubmit = jest.fn();
      render(
        <AddHostForm
          onSubmit={mockOnSubmit}
          onCancel={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText(/Register Host/));

      await waitFor(() => {
        expect(mockOnSubmit).not.toBeCalled();
        expect(screen.getByText(/Host name is required/)).toBeInTheDocument();
      });
    });

    it('should submit form with valid data', async () => {
      const mockOnSubmit = jest.fn().mockResolvedValue(undefined);
      render(
        <AddHostForm
          onSubmit={mockOnSubmit}
          onCancel={jest.fn()}
        />
      );

      await userEvent.type(
        screen.getByPlaceholderText(/e.g., production-db-01/),
        'test-host'
      );
      await userEvent.type(
        screen.getByPlaceholderText(/e.g., prod-db.company.com/),
        'test.example.com'
      );

      fireEvent.click(screen.getByText(/Register Host/));

      await waitFor(() => {
        expect(mockOnSubmit).toBeCalledWith(
          expect.objectContaining({
            name: 'test-host',
            fqdn: 'test.example.com'
          })
        );
      });
    });

    it('should support all access methods', () => {
      const mockOnSubmit = jest.fn();
      render(
        <AddHostForm
          onSubmit={mockOnSubmit}
          onCancel={jest.fn()}
        />
      );

      const selectElement = screen.getByLabelText(/Access Method/) as HTMLSelectElement;
      expect(selectElement.options).toHaveLength(3);
      expect(selectElement.options[0].value).toBe('Local');
      expect(selectElement.options[1].value).toBe('WinRM');
      expect(selectElement.options[2].value).toBe('SSH');
    });

    it('should populate form with initial data when editing', () => {
      const mockOnSubmit = jest.fn();
      const initialData = mockHosts[0];

      render(
        <AddHostForm
          initialData={initialData}
          onSubmit={mockOnSubmit}
          onCancel={jest.fn()}
          isEditing={true}
        />
      );

      expect(screen.getByDisplayValue('Production DB')).toBeInTheDocument();
      expect(screen.getByDisplayValue('prod-db.example.com')).toBeInTheDocument();
      expect(screen.getByText(/Edit Host/)).toBeInTheDocument();
    });
  });

  describe('HostValidationModal Component', () => {
    const mockValidationResult = {
      hostId: 'host-1',
      isValid: true,
      findings: [
        {
          severity: 'Info' as const,
          code: 'WINRM_AVAILABLE',
          message: 'WinRM is available'
        }
      ],
      capabilities: ['Remoting', 'SQLServer', 'VHD'],
      validatedAt: new Date().toISOString()
    };

    it('should display idle state initially', () => {
      render(
        <HostValidationModal
          hostId="host-1"
          hostName="Test Host"
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      expect(screen.getByText(/Click "Validate" to check/)).toBeInTheDocument();
    });

    it('should trigger validation on button click', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { success: true, data: mockValidationResult }
      });

      render(
        <HostValidationModal
          hostId="host-1"
          hostName="Test Host"
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Validate Host'));

      await waitFor(() => {
        expect(mockedAxios.post).toBeCalledWith(
          '/api/hosts/host-1/validate'
        );
      });
    });

    it('should display validation results', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { success: true, data: mockValidationResult }
      });

      render(
        <HostValidationModal
          hostId="host-1"
          hostName="Test Host"
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Validate Host'));

      await waitFor(() => {
        expect(screen.getByText(/Host is Healthy/)).toBeInTheDocument();
        expect(screen.getByText(/Capabilities:/)).toBeInTheDocument();
      });
    });

    it('should show healthy status for valid hosts', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { success: true, data: mockValidationResult }
      });

      render(
        <HostValidationModal
          hostId="host-1"
          hostName="Test Host"
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Validate Host'));

      await waitFor(() => {
        expect(screen.getByText('✓')).toBeInTheDocument();
      });
    });

    it('should show unhealthy status for invalid hosts', async () => {
      const invalidResult = { ...mockValidationResult, isValid: false };
      mockedAxios.post.mockResolvedValue({
        data: { success: true, data: invalidResult }
      });

      render(
        <HostValidationModal
          hostId="host-1"
          hostName="Test Host"
          isOpen={true}
          onClose={jest.fn()}
        />
      );

      fireEvent.click(screen.getByText('Validate Host'));

      await waitFor(() => {
        expect(screen.getByText(/Host Validation Failed/)).toBeInTheDocument();
      });
    });
  });

  describe('ConnectionTestPanel Component', () => {
    it('should render test form', () => {
      render(
        <ConnectionTestPanel
          isOpen={true}
          onClose={jest.fn()}
          onTestResult={jest.fn()}
        />
      );

      expect(screen.getByLabelText(/FQDN or IP Address/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Access Method/)).toBeInTheDocument();
      expect(screen.getByText(/Test Connection/)).toBeInTheDocument();
    });

    it('should test connection on button click', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          success: true,
          data: {
            isValid: true,
            findings: [],
            capabilities: []
          }
        }
      });

      render(
        <ConnectionTestPanel
          isOpen={true}
          onClose={jest.fn()}
          onTestResult={jest.fn()}
        />
      );

      await userEvent.type(
        screen.getByPlaceholderText(/e.g., server.example.com/),
        'test.example.com'
      );

      fireEvent.click(screen.getByText(/Test Connection/));

      await waitFor(() => {
        expect(mockedAxios.post).toBeCalledWith(
          '/api/hosts/test',
          expect.objectContaining({
            fqdn: 'test.example.com'
          })
        );
      });
    });
  });

  describe('PathMappingConfigurator Component', () => {
    it('should render path mapping form', () => {
      render(
        <PathMappingConfigurator
          isOpen={true}
          host={mockHosts[0]}
          onClose={jest.fn()}
          onSave={jest.fn()}
        />
      );

      expect(screen.getByLabelText(/UNC Path/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Local Path/)).toBeInTheDocument();
    });

    it('should add path mapping', async () => {
      const mockOnSave = jest.fn();
      render(
        <PathMappingConfigurator
          isOpen={true}
          host={mockHosts[0]}
          onClose={jest.fn()}
          onSave={mockOnSave}
        />
      );

      await userEvent.type(
        screen.getByPlaceholderText(/\\\\server\\share/),
        '\\\\server\\share'
      );
      await userEvent.type(
        screen.getByPlaceholderText(/D:\\data/),
        'D:\\data'
      );

      fireEvent.click(screen.getByText(/Add Mapping/));

      await waitFor(() => {
        expect(screen.getByText('\\\\server\\share')).toBeInTheDocument();
      });
    });

    it('should validate UNC path format', async () => {
      render(
        <PathMappingConfigurator
          isOpen={true}
          host={mockHosts[0]}
          onClose={jest.fn()}
          onSave={jest.fn()}
        />
      );

      await userEvent.type(
        screen.getByPlaceholderText(/\\\\server\\share/),
        'invalid-path'
      );
      await userEvent.type(
        screen.getByPlaceholderText(/D:\\data/),
        'D:\\data'
      );

      fireEvent.click(screen.getByText(/Add Mapping/));

      await waitFor(() => {
        expect(screen.getByText(/UNC path must start with/)).toBeInTheDocument();
      });
    });

    it('should save mappings', async () => {
      const mockOnSave = jest.fn();
      render(
        <PathMappingConfigurator
          isOpen={true}
          host={mockHosts[0]}
          onClose={jest.fn()}
          onSave={mockOnSave}
        />
      );

      fireEvent.click(screen.getByText(/Save Mappings/));

      expect(mockOnSave).toBeCalled();
    });
  });

  describe('Workflow Integration', () => {
    it('should complete full registration workflow', async () => {
      mockedAxios.get.mockResolvedValue({ data: { success: true, data: [] } });
      mockedAxios.post.mockResolvedValue({
        data: { success: true, data: { id: 'host-new', name: 'new-host' } }
      });

      render(<HostManagement />);

      // Click register button
      await waitFor(() => {
        expect(screen.getByText('+ Register Host')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('+ Register Host'));

      // Fill form
      await userEvent.type(
        screen.getByPlaceholderText(/e.g., production-db-01/),
        'new-host'
      );
      await userEvent.type(
        screen.getByPlaceholderText(/e.g., prod-db.company.com/),
        'new.example.com'
      );

      // Submit
      fireEvent.click(screen.getByText(/Register Host/));

      // Should refresh hosts list
      await waitFor(() => {
        expect(mockedAxios.get).toBeCalledWith('/api/hosts');
      });
    });
  });
});
