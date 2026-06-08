import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { ContractComplianceDashboard } from './ContractComplianceDashboard';

jest.mock('axios');
jest.mock('./ConsoleIcon', () => ({
  ConsoleIcon: ({ name }: any) => <span data-testid={`icon-${name}`}></span>
}));

const mockComplianceData = {
  success: true,
  data: {
    overallCompliance: 'compliant',
    compliancePercentage: 98.5,
    testsPassing: 47,
    testsFailing: 0,
    testsWarning: 1,
    contractTests: [
      {
        name: 'Clone creation response time SLA',
        status: 'passing',
        message: 'Average response time 2.3s (SLA: <5s)',
        lastChecked: new Date().toISOString()
      }
    ],
    contractViolations: [],
    lastComplianceCheck: new Date().toISOString(),
    nextScheduledCheck: new Date(Date.now() + 5 * 60000).toISOString()
  }
};

describe('ContractComplianceDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    (axios.get as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<ContractComplianceDashboard />);
    expect(screen.getByText(/Contract Compliance/i)).toBeInTheDocument();
  });

  it('should render compliance status after loading', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockComplianceData);

    render(<ContractComplianceDashboard />);

    await waitFor(() => {
      expect(screen.getByText('COMPLIANT')).toBeInTheDocument();
    });
  });

  it('should display compliance percentage', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockComplianceData);

    render(<ContractComplianceDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/98.5%/)).toBeInTheDocument();
    });
  });

  it('should display test counts', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockComplianceData);

    render(<ContractComplianceDashboard />);

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument(); // testsPassing
      expect(screen.getByText('0')).toBeInTheDocument(); // testsFailing
      expect(screen.getByText('1')).toBeInTheDocument(); // testsWarning
    });
  });

  it('should display contract tests', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockComplianceData);

    render(<ContractComplianceDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Clone creation response time SLA')).toBeInTheDocument();
      expect(screen.getByText('PASSING')).toBeInTheDocument();
    });
  });

  it('should handle error state', async () => {
    const errorMessage = 'Failed to load compliance status';
    (axios.get as jest.Mock).mockRejectedValue(new Error(errorMessage));

    render(<ContractComplianceDashboard />);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    });
  });

  it('should display violations when present', async () => {
    const dataWithViolations = {
      ...mockComplianceData,
      data: {
        ...mockComplianceData.data,
        contractViolations: ['SLA breach detected', 'Data integrity issue']
      }
    };

    (axios.get as jest.Mock).mockResolvedValue(dataWithViolations);

    render(<ContractComplianceDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Contract Violations')).toBeInTheDocument();
      expect(screen.getByText('SLA breach detected')).toBeInTheDocument();
      expect(screen.getByText('Data integrity issue')).toBeInTheDocument();
    });
  });
});
