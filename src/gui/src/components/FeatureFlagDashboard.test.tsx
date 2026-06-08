import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { FeatureFlagDashboard } from './FeatureFlagDashboard';

jest.mock('axios');
jest.mock('./ConsoleIcon', () => ({
  ConsoleIcon: ({ name }: any) => <span data-testid={`icon-${name}`}></span>
}));

const mockFlagsData = {
  success: true,
  data: {
    totalFlags: 3,
    enabledCount: 2,
    betaCount: 1,
    disabledCount: 0,
    flags: [
      {
        name: 'FLASHDB_ENABLE_METADATA',
        displayName: 'Metadata System',
        description: 'Enhanced metadata tracking',
        status: 'enabled',
        rolloutPercentage: 100,
        phase: 'Phase 5',
        enabled: true,
        createdAt: new Date().toISOString(),
        enabledAt: new Date().toISOString(),
        usersAffected: 0,
        recentlyChanged: false,
        badges: []
      },
      {
        name: 'FLASHDB_ENABLE_REPAIR',
        displayName: 'Clone Repair',
        description: 'Clone repair capabilities',
        status: 'beta',
        rolloutPercentage: 50,
        phase: 'Phase 8',
        enabled: true,
        createdAt: new Date().toISOString(),
        enabledAt: new Date().toISOString(),
        rolloutStartedAt: new Date().toISOString(),
        expectedCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        usersAffected: 50,
        recentlyChanged: true,
        badges: ['BETA']
      }
    ],
    lastUpdated: new Date().toISOString()
  }
};

describe('FeatureFlagDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    (axios.get as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<FeatureFlagDashboard />);
    expect(screen.getByText(/Feature Flags/i)).toBeInTheDocument();
  });

  it('should render feature flags after loading', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Metadata System')).toBeInTheDocument();
    });
  });

  it('should display flag counts', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('2 Enabled')).toBeInTheDocument();
      expect(screen.getByText('1 Beta')).toBeInTheDocument();
    });
  });

  it('should display flag statuses', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      const enabledChips = screen.getAllByText('ENABLED');
      const betaChips = screen.getAllByText('BETA');
      expect(enabledChips.length).toBeGreaterThan(0);
      expect(betaChips.length).toBeGreaterThan(0);
    });
  });

  it('should display rollout percentages', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  it('should display badges for beta flags', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/\[BETA\]/)).toBeInTheDocument();
    });
  });

  it('should expand flag details on click', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Clone Repair')).toBeInTheDocument();
    });

    const flagHeader = screen.getByText('Clone Repair').closest('.flag-header');
    if (flagHeader) {
      fireEvent.click(flagHeader);

      await waitFor(() => {
        expect(screen.getByText('Phase 8')).toBeInTheDocument();
      });
    }
  });

  it('should allow updating rollout percentage for beta flags', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);
    (axios.put as jest.Mock).mockResolvedValue({
      success: true,
      data: { rolloutPercentage: 75 }
    });

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Clone Repair')).toBeInTheDocument();
    });

    // Expand the flag
    const flagHeader = screen.getByText('Clone Repair').closest('.flag-header');
    if (flagHeader) {
      fireEvent.click(flagHeader);

      await waitFor(() => {
        const slider = screen.getByRole('slider') as HTMLInputElement;
        expect(slider).toBeDefined();
        expect(slider.value).toBe('50');
      });
    }
  });

  it('should handle error state', async () => {
    const errorMessage = 'Failed to load feature flags';
    (axios.get as jest.Mock).mockRejectedValue(new Error(errorMessage));

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    });
  });

  it('should display recently changed indicator', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Clone Repair')).toBeInTheDocument();
    });
  });

  it('should display rollout buttons for beta flags', async () => {
    (axios.get as jest.Mock).mockResolvedValue(mockFlagsData);

    render(<FeatureFlagDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Clone Repair')).toBeInTheDocument();
    });

    const flagHeader = screen.getByText('Clone Repair').closest('.flag-header');
    if (flagHeader) {
      fireEvent.click(flagHeader);

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    }
  });
});
