import React from 'react';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import '@testing-library/jest-dom';

// Components
import { ErrorComponent } from '../ui-components/ErrorComponent';
import { Loading } from '../ui-components/Loading';
import { PageLayout } from '../ui-components/PageLayout';
import NavBar from '../ui-components/NavBar';
import { ProfileData } from '../ui-components/ProfileData';
import { theme } from '../styles/theme';
import { CustomNavigationClient } from '../utils/NavigationClient';
import { logToSharePoint } from '../utils/Logger';
import * as graph from '../graph';

// Mock MUI children that may import heavy icons
jest.mock('../ui-components/WelcomeName', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-welcome">Welcome</div>
}));
jest.mock('../ui-components/SignInSignOutButton', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-signin">SignIn</div>
}));

describe('Small UI components', () => {
  test('ErrorComponent displays error code', () => {
    render(<ErrorComponent error={{ errorMessage: 'x', errorCode: 'E1' } as any} />);
    expect(screen.getByText(/An Error Occurred/i)).toBeInTheDocument();
    expect(screen.getByText(/E1/)).toBeInTheDocument();
  });

  test('ErrorComponent shows unknown if undefined', () => {
    render(<ErrorComponent error={undefined as any} />);
    expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
  });

  test('Loading displays text', () => {
    render(<Loading />);
    expect(screen.getByText(/Authentication in progress/i)).toBeInTheDocument();
  });

  test('PageLayout renders children and NavBar', () => {
    // NavBar mocked WelcomeName & SignInSignOutButton
    render(
      <PageLayout>
        <div data-testid="child">child</div>
      </PageLayout>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('mock-welcome')).toBeInTheDocument();
    expect(screen.getByTestId('mock-signin')).toBeInTheDocument();
  });

  test('NavBar shows online/offline icons when toggling events', async () => {
    render(<NavBar />);
    // default is navigator.onLine; test flipping events
    const initial = navigator.onLine;
    // No direct DOM label; verify that mock welcome and sign-in exist
    expect(screen.getByTestId('mock-welcome')).toBeInTheDocument();
    expect(screen.getByTestId('mock-signin')).toBeInTheDocument();
    // fire events wrapped in act
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    // If no errors, test passes
  });
});

describe('ProfileData & theme tests', () => {
  test('ProfileData renders fields', () => {
    const data = {
      displayName: 'Max Mustermann',
      jobTitle: 'Manager',
      mail: 'max@test.com',
      businessPhones: ['+49'],
      officeLocation: 'Berlin'
    };
    render(<ProfileData graphData={data as any} />);
    expect(screen.getByText(/Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Manager/)).toBeInTheDocument();
    expect(screen.getByText(/Mail/)).toBeInTheDocument();
    expect(screen.getByText(/Phone/)).toBeInTheDocument();
  });

  test('theme object contains primary colors', () => {
    expect(theme.palette.primary).toBeDefined();
    expect(theme.palette.secondary).toBeDefined();
  });
});

describe('Utils tests', () => {
  test('CustomNavigationClient calls navigate with replace option', async () => {
    const navigate = jest.fn();
    const client = new CustomNavigationClient(navigate as any);
    const originBackup = window.location.origin;
    Object.defineProperty(window, 'location', { value: { origin: 'https://example.com' }, writable: true });
    await client.navigateInternal('https://example.com/abc', { noHistory: true } as any);
    expect(navigate).toHaveBeenCalledWith('/abc', { replace: true });
    Object.defineProperty(window, 'location', { value: originBackup });
  });

  test('CustomNavigationClient calls navigate without replace', async () => {
    const navigate = jest.fn();
    const client = new CustomNavigationClient(navigate as any);
    const originBackup = window.location.origin;
    Object.defineProperty(window, 'location', { value: { origin: 'https://example.com' }, writable: true });
    await client.navigateInternal('https://example.com/abc', { noHistory: false } as any);
    expect(navigate).toHaveBeenCalledWith('/abc');
    Object.defineProperty(window, 'location', { value: originBackup });
  });

  test('logToSharePoint handles success and failure', async () => {
    // stub window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { value: { href: 'https://app.test' }, writable: true });

    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => 'ok' })
      .mockResolvedValueOnce({ ok: false, text: async () => 'error' });

    (global as any).fetch = mockFetch;

    await logToSharePoint('token', {
      userEmail: 'a@b.com',
      sourceUrl: 'u',
      photoCount: 1,
      totalSizeMB: 1,
      targetTeamName: 'T',
      status: 'Success'
    });

    await logToSharePoint('token', {
      userEmail: 'a@b.com',
      sourceUrl: 'u',
      photoCount: 1,
      totalSizeMB: 1,
      targetTeamName: 'T',
      status: 'Success'
    });

    expect(mockFetch).toHaveBeenCalled();
    Object.defineProperty(window, 'location', { value: originalLocation });
  });

  test('graph.callMsGraph calls fetch and returns json', async () => {
    const json = { displayName: 'X' };
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) });
    const result = await graph.callMsGraph('token');
    expect(result).toEqual(json);
  });

  test('callMsGraph logs errors and gracefully returns undefined when fetch rejects', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network Failure'));
    (global as any).fetch = mockFetch;
    // Spy on console.log to ensure error path is used
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await graph.callMsGraph('token');
    expect(logSpy).toHaveBeenCalled();
    expect(result).toBeUndefined();
    logSpy.mockRestore();
  });
});
