// src/__tests__/teamsList.test.tsx
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import '@testing-library/jest-dom';
import TeamsList from "../ui-components/TeamsList";

// Mock MSAL (useMsal & useAccount)
jest.mock("@azure/msal-react", () => ({
  useMsal: jest.fn(),
  useAccount: jest.fn(),
}));
import * as msal from "@azure/msal-react";

// Mock ChannelsList child to avoid heavy operations; just render a placeholder
jest.mock("../ui-components/ChannelsList", () => {
  return {
    __esModule: true,
    default: (props: any) => <div data-testid="mock-channels" data-team={props?.team?.id ?? ""} />
  };
});

// Mock the Dexie DB module and commonly used methods
jest.mock("../db", () => {
  const fakePut = jest.fn().mockResolvedValue(undefined);
  const fakeDelete = jest.fn().mockResolvedValue(undefined);
  const fakeToArray = jest.fn().mockResolvedValue([]);
  const fakeGet = jest.fn().mockResolvedValue(undefined);
  const fakeWhere = jest.fn(() => ({
    equals: jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue([])
    }))
  }));

  return {
    __esModule: true,
    db: {
      favoriteTeams: {
        toArray: fakeToArray,
        put: fakePut,
        delete: fakeDelete,
        get: fakeGet,
      },
      posts: {
        toArray: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue(1),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      images: {
        where: fakeWhere
      }
    },
    // export types used by TeamsList runtime (not strictly needed but keeps TypeScript happy)
    Team: undefined as any,
    Channel: undefined as any,
    SubFolder: undefined as any,
  };
});

describe("TeamsList component", () => {
  const teams = [
    { id: "t1", displayName: "Team One" },
    { id: "t2", displayName: "Team Two" },
  ];

  beforeEach(() => {
    // Use clearAllMocks to keep default mock implementations (like db.*.toArray returning [])
    jest.clearAllMocks();

    // Default online
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    (global as any).fetch = jest.fn();

    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn().mockReturnValue('[]'),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    localStorage.clear();
  });

  test("shows offline warning when navigator is offline or no account", async () => {
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: {}, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    render(<TeamsList />);

    // Offline hint should be visible (German text from component)
    await waitFor(() => {
      expect(screen.getByText(/Offline-Modus|Nicht eingeloggt/i)).toBeInTheDocument();
      expect(screen.getByText(/Team auswählen \(Offline gecacht\)/i)).toBeInTheDocument();
    });
  });

  test("fetches joined teams and allows selecting a team (renders ChannelsList)", async () => {
    const fakeMsalInstance = {
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' })
    };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: fakeMsalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "u@test" });

    // Handle the joinedTeams fetch with proper error handling
    (global as any).fetch.mockImplementation((url: string) => {
      if (url.includes("/me/joinedTeams")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: teams })
        });
      } else if (url.includes("/channels")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] })
        });
      }

      // fallback to ok empty for other calls if needed
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    render(<TeamsList />);

    // Wait for teams to load and component to render properly
    await waitFor(() => {
      expect(screen.queryByText(/Loading teams/i)).not.toBeInTheDocument();
    }, { timeout: 5000 });

    // Find the Autocomplete input
    const input = await screen.findByLabelText(/Search teams/i);

    // Better approach for MUI Autocomplete: type and press arrow/enter to select an option
    await userEvent.click(input); // focus
    await userEvent.type(input, 'Team One');

    // arrow down and enter to pick the first suggestion
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // ChannelsList should now be rendered for the selected team
    await waitFor(() => {
      expect(screen.getByTestId("mock-channels")).toBeInTheDocument();
    });
  });

  test("toggling favorite stores in DB and updates localStorage", async () => {
    const fakeMsalInstance = {
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' })
    };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: fakeMsalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "u@test" });

    // Prepare fetch handlers:
    // 1st fetch for joinedTeams
    // 2nd for channels (fav toggle)
    // 3rd for members (fav toggle)
    (global as any).fetch.mockImplementation((url: string) => {
      if (url.includes("/me/joinedTeams")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: teams })
        });
      } else if (url.includes("/channels")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] })
        });
      } else if (url.includes("/members")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: [{ userId: 'u1', displayName: 'Alice' }] })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    // Grab a reference to our mocked DB "put" function
    const dbModule = require("../db");
    const favoritePut = dbModule.db.favoriteTeams.put;
    expect(favoritePut).toBeDefined();

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Search teams/i);
    await userEvent.click(input);

    // Wait for options to appear, then find the desired option
    const optionNode = await screen.findByText(/Team One/i);
    const optionLi = optionNode.closest('[role="option"]');

    // Find the star IconButton within the option li
    const starButton = within(optionLi as HTMLElement).getByRole("button");
    // Click star to favorite
    await userEvent.click(starButton);

    // put should be called in the mocked DB
    await waitFor(() => {
      expect(favoritePut).toHaveBeenCalled();
      // localStorage.setItem should have been called with favoriteTeams includes 't1'
      expect(localStorage.setItem).toHaveBeenCalled();
      const setCallArgs = (localStorage.setItem as jest.Mock).mock.calls[0];
      expect(setCallArgs[0]).toBe('favoriteTeams');
      expect(JSON.parse(setCallArgs[1])).toContain('t1');
    });
  });
});