// src/__tests__/authButtons.test.tsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import '@testing-library/jest-dom';
import { SignInButton } from "../ui-components/SignInButton";
import { SignOutButton } from "../ui-components/SignOutButton";
import SignInSignOutButton from "../ui-components/SignInSignOutButton";

jest.mock("@azure/msal-react", () => ({
  useMsal: jest.fn(),
  useAccount: jest.fn(),
  useIsAuthenticated: jest.fn(),
}));

import * as msal from "@azure/msal-react";

describe("Auth button components", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test("SignInButton directly calls loginPopup", async () => {
    const loginPopup = jest.fn();

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { loginPopup }, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);
    (msal.useIsAuthenticated as jest.Mock).mockReturnValue(false);

    render(<SignInButton />);

    const loginBtn = screen.getByText(/Login/i);
    expect(loginBtn).toBeInTheDocument();

    await userEvent.click(loginBtn);
    expect(loginPopup).toHaveBeenCalled();
  });

  test("SignOutButton directly calls logoutPopup", async () => {
    const logoutPopup = jest.fn();

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { logoutPopup }, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "Test User", username: "test@domain" });
    (msal.useIsAuthenticated as jest.Mock).mockReturnValue(true);

    render(<SignOutButton />);

    // The IconButton has no label; just find the button and click
    const btn = screen.getByRole("button");
    await userEvent.click(btn);

    expect(logoutPopup).toHaveBeenCalled();
  });

  test("SignInSignOutButton renders SignIn or SignOut depending on auth state and inProgress", async () => {
    const loginPopup = jest.fn();
    const loginRedirect = jest.fn();
    const logoutPopup = jest.fn();
    const logoutRedirect = jest.fn();

    // render SignOut when authenticated
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { loginPopup, loginRedirect, logoutPopup, logoutRedirect }, accounts: [], inProgress: undefined });
    (msal.useIsAuthenticated as jest.Mock).mockReturnValue(true);
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'A B' });

    const { rerender } = render(<SignInSignOutButton />);
    // SignOutButton renders - there's a button
    expect(screen.getByRole("button")).toBeInTheDocument();

    // Now simulate not authenticated and not inProgress
    (msal.useIsAuthenticated as jest.Mock).mockReturnValue(false);
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { loginPopup, loginRedirect }, accounts: [], inProgress: undefined });

    rerender(<SignInSignOutButton />);
    // Should show SignIn button now
    expect(screen.getByText(/Login/i)).toBeInTheDocument();

    // Simulate inProgress equal to Startup -> should return null
    (msal.useIsAuthenticated as jest.Mock).mockReturnValue(false);
    (msal.useAccount as jest.Mock).mockReturnValue(null);
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { }, accounts: [], inProgress: "startup" });
    rerender(<SignInSignOutButton />);
    // Login should not be present
    await waitFor(() => {
      expect(screen.queryByText(/Login/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).toBeNull(); // no sign in/out button
    });
  });
});