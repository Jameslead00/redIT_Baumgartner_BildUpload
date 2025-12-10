// src/__tests__/welcomeProfile.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import '@testing-library/jest-dom';
import WelcomeName from "../ui-components/WelcomeName";
import { ProfileData } from "../graph";

jest.mock("@azure/msal-react", () => ({
  useMsal: jest.fn(),
  useAccount: jest.fn(),
}));
import * as msal from "@azure/msal-react";

describe("Welcome and Profile components", () => {
  afterEach(() => jest.resetAllMocks());

  test("WelcomeName displays first name if account exists", () => {
    const account = { name: "Max Mustermann" };
    (msal.useMsal as jest.Mock).mockReturnValue({ accounts: [account] });
    (msal.useAccount as jest.Mock).mockReturnValue(account);

    render(<WelcomeName />);
    expect(screen.getByText(/Willkommen Max/i)).toBeInTheDocument();
  });

  test("WelcomeName returns null if no account", () => {
    (msal.useMsal as jest.Mock).mockReturnValue({ accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    render(<WelcomeName />);
    expect(screen.queryByText(/Willkommen/i)).toBeNull();
  });
});