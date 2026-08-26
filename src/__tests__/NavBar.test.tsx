import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import NavBar from '../ui-components/NavBar';

const msalReact = require('@azure/msal-react');

jest.mock('@azure/msal-react', () => ({
  useMsal: jest.fn(),
  useAccount: jest.fn(),
  useIsAuthenticated: jest.fn(),
}));

// Mock child components
jest.mock('../ui-components/WelcomeName', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-welcome">Welcome</div>
}));

jest.mock('../ui-components/SignInSignOutButton', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-signin">SignIn</div>
}));

// Mock MUI Icons to easily verify which one is rendered
jest.mock("@mui/icons-material", () => ({
  Wifi: () => <span data-testid="wifi-icon">WifiIcon</span>,
  WifiOff: () => <span data-testid="wifi-off-icon">WifiOffIcon</span>,
  BarChartOutlined: () => <span data-testid="bar-chart-icon">BarChartIcon</span>
}));

// Mock MUI Tooltip: Wir rendern einfach ein Div mit dem Title-Attribut.
// So können wir prüfen, ob der korrekte Text übergeben wird, ohne Hover-Events simulieren zu müssen.
jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    Tooltip: ({ title, children }: any) => (
      <div data-testid="mock-tooltip" title={title}>
        {children}
      </div>
    ),
  };
});

describe('NavBar', () => {
  beforeEach(() => {
    msalReact.useMsal.mockReturnValue({ accounts: [{ username: 'sbaumgartner@baumgartnerfenster.ch' }] });
    msalReact.useAccount.mockReturnValue({ username: 'sbaumgartner@baumgartnerfenster.ch', name: 'S. Baumgartner' });
    msalReact.useIsAuthenticated.mockReturnValue(true);
  });

  test('renders title and children', () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>
    );
    expect(screen.getByText(/Baumgartner Fenster/i)).toBeInTheDocument();
    expect(screen.getByTestId('mock-welcome')).toBeInTheDocument();
    expect(screen.getByTestId('mock-signin')).toBeInTheDocument();
  });

  test('renders reporting dashboard link for allowlisted users', () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /reporting dashboard/i })).toHaveAttribute('href', '/reporting');
  });

  test('hides the reporting dashboard link for non-allowlisted users', () => {
    msalReact.useMsal.mockReturnValue({ accounts: [{ username: 'someone@example.com' }] });
    msalReact.useAccount.mockReturnValue({ username: 'someone@example.com', name: 'Someone Else' });

    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /reporting dashboard/i })).not.toBeInTheDocument();
  });

  test('updates icon and tooltip on network status change', async () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>
    );
    
    // Initial state (Online by default in JSDOM)
    expect(screen.getByTestId('wifi-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('wifi-off-icon')).not.toBeInTheDocument();
    
    // Verify Tooltip title directly via mock
    expect(screen.getByTestId('mock-tooltip')).toHaveAttribute('title', 'Online');

    // Simulate going Offline
    await act(async () => {
        window.dispatchEvent(new Event('offline'));
    });
    
    expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('wifi-icon')).not.toBeInTheDocument();
    
    // Verify Tooltip title for Offline
    expect(screen.getByTestId('mock-tooltip')).toHaveAttribute('title', 'Offline');

    // Simulate going Online again
    await act(async () => {
        window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('wifi-icon')).toBeInTheDocument();
    expect(screen.getByTestId('mock-tooltip')).toHaveAttribute('title', 'Online');
  });

  test('renders correctly when initially offline', () => {
    const originalOnLine = window.navigator.onLine;
    // Mock navigator.onLine to false
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>
    );
    expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument();
    expect(screen.getByTestId('mock-tooltip')).toHaveAttribute('title', 'Offline');
    
    // Restore navigator.onLine
    Object.defineProperty(window.navigator, 'onLine', { value: originalOnLine, configurable: true });
  });

  test('removes event listeners on unmount', () => {
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>
    );
    
    unmount();
    
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
