// src/__tests__/App.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";

// Mock the MsalProvider before that module is imported
jest.mock("@azure/msal-react", () => ({
  __esModule: true,
  // Provide a lightweight wrapper that simply renders children
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// mock PageLayout (named export) & TeamsList (default export)
jest.mock("../ui-components/PageLayout", () => ({
  __esModule: true,
  PageLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-pagelayout">{children}</div>
  ),
}));

jest.mock("../ui-components/TeamsList", () => {
  return {
    __esModule: true,
    default: () => <div data-testid="mock-teamslist">TeamsList</div>,
  };
});

// Now we import App (MsalProvider will be mocked as above)
import App from "../App";

describe("App component", () => {
  test("renders header and TeamsList, and sets navigation client on pca", () => {
    // Make a mock `pca` with `setNavigationClient`
    const setNavigationClient = jest.fn();
    const pcaMock = { setNavigationClient } as unknown as any;

    render(
      <MemoryRouter>
        <App pca={pcaMock} />
      </MemoryRouter>
    );

    // Basic layout assertions
    expect(screen.getByText(/Bild Upload/i)).toBeInTheDocument();
    expect(screen.getByText(/Lade Bilder und Beiträge/i)).toBeInTheDocument();

    // Make sure PageLayout & TeamsList placeholders are present
    expect(screen.getByTestId("mock-pagelayout")).toBeInTheDocument();
    expect(screen.getByTestId("mock-teamslist")).toBeInTheDocument();

    // Assert PCA wiring happened (setNavigationClient called)
    expect(setNavigationClient).toHaveBeenCalled();
    // Optionally, verify that it's called with an object having a navigate function
    const calledArg = setNavigationClient.mock.calls[0][0];
    expect(typeof calledArg.navigate).toBe("function");
  });
});