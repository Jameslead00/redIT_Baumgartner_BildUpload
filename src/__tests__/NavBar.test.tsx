import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NavBar from '../ui-components/NavBar';

jest.mock('../ui-components/WelcomeName', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-welcome">Welcome</div>
}));

jest.mock('../ui-components/SignInSignOutButton', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-signin">SignIn</div>
}));

describe('NavBar', () => {
  test('renders title and children', () => {
    render(<NavBar />);
    expect(screen.getByText(/Baumgartner Fenster/i)).toBeInTheDocument();
    expect(screen.getByTestId('mock-welcome')).toBeInTheDocument();
    expect(screen.getByTestId('mock-signin')).toBeInTheDocument();
  });

  test('toggles online/offline listeners without throwing', () => {
    render(<NavBar />);
    expect(screen.getByText(/Baumgartner Fenster/i)).toBeInTheDocument();
    // dispatch offline and online events, ensure no errors
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
});
