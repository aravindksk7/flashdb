import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { ReleaseGateDashboard } from './ReleaseGateDashboard';

jest.mock('axios');
jest.mock('./ConsoleIcon', () => ({
  ConsoleIcon: ({ name }: any) => <span data-testid={`icon-${name}`}></span>
}));

const mockGatesData = {
  success: true,
  data: {
    totalGates: 4,
    openGates: 2,
    blockedGates: 1,
    closedGates: 1,
    overallStatus: 'on-track',
    gates: [
      {
        id: 'gate-1',
        name: 'Phase 5 Validation Gate',
        status: 'closed',
        blockingFactors: [],
        checklist: [
          { name: 'Metadata system operational', completed: true },
          { name: 'State management tested', completed: true }
        ],
        checklistProgress: 100,
        timeline: {
          planned: '2026-06-05',
          status: 'completed'
        },
        dependencies: [],
        owner: 'Architecture Team',
        priority: 'critical'
      }
    ],
    summary: 'Release on track',
    lastUpdated: new Date().toISOString()
  }
};

describe('ReleaseGateDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    (axios.get as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<ReleaseGateDashboard />);
    expect(screen.getByText(/Release Gates/i)).toBeInTheDocument();
  });

  it('should render gates status after loading', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockGatesData);

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('ON-TRACK')).toBeInTheDocument();
    });
  });

  it('should display gate counts', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockGatesData);

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument(); // closedGates
      expect(screen.getByText('2')).toBeInTheDocument(); // openGates
    });
  });

  it('should display release gate details', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockGatesData);

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Phase 5 Validation Gate')).toBeInTheDocument();
      expect(screen.getByText('CLOSED')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    });
  });

  it('should expand gate details on click', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockGatesData);

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Phase 5 Validation Gate')).toBeInTheDocument();
    });

    const gateHeader = screen.getByText('Phase 5 Validation Gate').closest('.gate-header');
    if (gateHeader) {
      fireEvent.click(gateHeader);

      await waitFor(() => {
        expect(screen.getByText('Architecture Team')).toBeInTheDocument();
      });
    }
  });

  it('should display blocking factors for blocked gates', async () => {
    const dataWithBlockedGate = {
      ...mockGatesData,
      data: {
        ...mockGatesData.data,
        gates: [
          {
            ...mockGatesData.data.gates[0],
            status: 'blocked',
            blockingFactors: ['Missing dependency', 'Tests not passing']
          }
        ]
      }
    };

    (axios.get as jest.Mock).mockResolvedValue(dataWithBlockedGate);

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    });

    const gateHeader = screen.getByText(mockGatesData.data.gates[0].name).closest('.gate-header');
    if (gateHeader) {
      fireEvent.click(gateHeader);

      await waitFor(() => {
        expect(screen.getByText('Blocking Factors')).toBeInTheDocument();
      });
    }
  });

  it('should handle error state', async () => {
    const errorMessage = 'Failed to load release gates';
    (axios.get as jest.Mock).mockRejectedValue(new Error(errorMessage));

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    });
  });

  it('should display progress bar with correct percentage', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockGatesData);

    render(<ReleaseGateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });
});
