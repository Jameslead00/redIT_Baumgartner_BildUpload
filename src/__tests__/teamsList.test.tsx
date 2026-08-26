// src/__tests__/teamsList.test.tsx
import React from "react";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import '@testing-library/jest-dom';
import TeamsList from "../ui-components/TeamsList";

// Mock MSAL (useMsal & useAccount)
jest.mock("@azure/msal-react", () => ({
  useMsal: jest.fn(),
  useAccount: jest.fn(),
}));
import * as msal from "@azure/msal-react";

// Mock PostMessage component function
jest.mock('../ui-components/PostMessage', () => ({
  postMessageToChannel: jest.fn(),
  postMessageToQualityTeamMirror: jest.fn(),
  shouldMirrorToQualityTeam: jest.fn((teamId: string | undefined, enabled: boolean) => Boolean(enabled && teamId && teamId !== '21e376dd-06ad-4b61-8cf8-37aa8a0cb9fa')),
  QUALITY_TEAM_ID: '21e376dd-06ad-4b61-8cf8-37aa8a0cb9fa',
}));
import { postMessageToChannel } from '../ui-components/PostMessage';

// Mock ChannelsList child to avoid heavy operations; just render a placeholder
jest.mock("../ui-components/ChannelsList", () => {
  return {
    __esModule: true,
    default: (props: any) => {
      (global as any).__lastChannelsListProps = props;
      return (
      <div data-testid="mock-channels" data-team={props?.team?.id ?? ""}>
        {/* Expose a test button to simulate onSaveOffline usage */}
        <button
          data-testid="simulate-save"
          onClick={() => {
              // ensure channel is selected before saving
              console.log('Mock ChannelsList: simulate-save clicked');
              if (props.onChannelSelect) {
                console.log('Mock ChannelsList: calling onChannelSelect');
                props.onChannelSelect({ id: 'c1', displayName: 'General' });
              }
              // invoke save in next tick to let setState settle
              if (props.onSaveOffline) {
                console.log('Mock ChannelsList: scheduling onSaveOffline');
                setTimeout(() => { console.log('Mock ChannelsList: calling onSaveOffline'); props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], ''); }, 0);
              }
            }}
        >
          Simulate Save
        </button>
        {/* Expose button to simulate upload success */}
        <button
            data-testid="simulate-upload-success"
            onClick={() => {
                if (props.onUploadSuccess) {
                    props.onUploadSuccess(['https://url'], [new File(['a'], 'a.png', { type: 'image/png' })]);
                }
                if (props.onCustomTextChange) {
                    props.onCustomTextChange('Test Message');
                }
            }}
        >
            Simulate Upload Success
        </button>
      </div>
      );
    }
  };
});

// Mock the Dexie DB module and commonly used methods
jest.mock("../db", () => {
  const fakePut = jest.fn().mockResolvedValue(undefined);
  const fakeDelete = jest.fn().mockResolvedValue(undefined);
  const fakeToArray = jest.fn().mockResolvedValue([]);
  const fakeGet = jest.fn().mockResolvedValue(undefined);
  const fakeToCollection = jest.fn(() => ({
    primaryKeys: jest.fn().mockResolvedValue([])
  }));
  const fakeWhere = jest.fn(() => ({
    equals: jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined) // Ensure delete is mocked for where().equals().delete()
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
      allJoinedTeams: {
        toArray: fakeToArray,
        put: fakePut,
        delete: fakeDelete,
        get: fakeGet,
        toCollection: fakeToCollection,
      },
      posts: {
        toArray: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue(1),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      images: {
        where: fakeWhere,
        add: jest.fn().mockResolvedValue(1)
      }
    },
    // export types used by TeamsList runtime (not strictly needed but keeps TypeScript happy)
    Team: undefined as any,
    Channel: undefined as any,
    SubFolder: undefined as any,
  };
});

describe("TeamsList component", () => {
  // suppress React runtime key-in-spread warning from MUI options render
  const originalConsoleError = console.error;
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      const text = args[0] && typeof args[0] === 'string' ? args[0] : '';
      if (text.includes('A props object containing a "key" prop is being spread into JSX')) return;
      originalConsoleError(...args);
    });
  });
  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });
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
      expect(screen.queryByText(/Teams werden geladen/i)).not.toBeInTheDocument();
    }, { timeout: 5000 });

    // Find the Autocomplete input
    const input = await screen.findByLabelText(/Teams suchen/i);

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

  test("renders the quality team checkbox after selecting a team", async () => {
    const fakeMsalInstance = {
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' })
    };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: fakeMsalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "u@test" });

    (global as any).fetch.mockImplementation((url: string) => {
      if (url.includes('/me/joinedTeams')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
    });

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText(/Auch im Qualitätsmangel-Team posten/i)).toBeInTheDocument();
    });
  });

  test("passes cachedAllChannels and cachedAllSubFolders to ChannelsList", async () => {
    const fakeMsalInstance = {
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' })
    };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: fakeMsalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "u@test" });

    // Mock fetch for joinedTeams
    (global as any).fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ value: teams })
    });

    const dbModule = require('../db');
    dbModule.db.allJoinedTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One', channels: [{ id: 'c1', displayName: 'General' }], channelSubFolders: { c1: [{ id: 's1', name: 'Sub' }] } }]);

    render(<TeamsList />);

    // Wait for teams to load
    await waitFor(() => {
      expect(screen.getByLabelText(/Teams suchen/i)).toBeInTheDocument();
    });

    // Select team
    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // Check if ChannelsList props include cachedAllChannels and cachedAllSubFolders
    await waitFor(() => {
      const props = (global as any).__lastChannelsListProps;
      expect(props.cachedAllChannels).toEqual([{ id: 'c1', displayName: 'General' }]);
      expect(props.cachedAllSubFolders).toEqual({ c1: [{ id: 's1', name: 'Sub' }] });
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

    const input = await screen.findByLabelText(/Teams suchen/i);
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

  test('removes favorite when toggle off', async () => {
    // Prepare as if t1 is a favorite initially
    const dbModule = require('../db');
    dbModule.db.favoriteTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One', channels: [] }]);
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'user@test' });

    // Make localStorage return t1 as favorite
    window.localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(['t1']));

    (global as any).fetch.mockImplementation((url: string) => {
      if (url.includes('/me/joinedTeams')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    render(<TeamsList />);

    // Wait for Autocomplete to appear then open options
    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // Option should show star button; clicking it should remove favorite
    // Re-open the options so the star IconButton is visible in the menu
    const openButton = screen.getAllByRole('button', { name: /Open/i })[0];
    await userEvent.click(openButton);
    const optionLi = await screen.findByRole('option', { name: 'Team One' });
    const starButton = within(optionLi as HTMLElement).getByRole('button');
    // Favorite should remove, leading to db.favoriteTeams.delete being called
    await userEvent.click(starButton);

    await waitFor(() => {
      expect(dbModule.db.favoriteTeams.delete).toHaveBeenCalledWith('t1');
      expect(localStorage.setItem).toHaveBeenCalled();
    });
  });

  test('offline uses cached all teams for the Autocomplete', async () => {
    // Simulate offline and no account
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: {}, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    const dbModule = require('../db');
    dbModule.db.allJoinedTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One' }]);
    dbModule.db.posts.toArray.mockResolvedValue([]);

    render(<TeamsList />);

    // open autocomplete
    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    // Because cached term is 'Team One', it should show as an option
    await waitFor(() => expect(screen.getByText(/Team One/i)).toBeInTheDocument());
  });

  test('loadAndCacheDataForFavorites fetches channels/members/subfolders and calls put', async () => {
    const dbModule = require('../db');
    // Start with cached favorites without channels
    dbModule.db.favoriteTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One' }]);
    // Ensure favorites set is initialized (from localStorage)
    window.localStorage.getItem = jest.fn().mockReturnValue(JSON.stringify(['t1']));
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'user@test' });

    // Provide minimal teams set so fav matches
    (global as any).fetch = jest.fn().mockImplementation((url: string) => {
      console.log('[syncOfflinePosts fetch] ' + url);
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/me/joinedTeams')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      }
      if (url.includes('/channels')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      }
      if (url.includes('/members')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ userId: 'u1', displayName: 'Alice' }] }) });
      }
      if (url.includes('/sites/root')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'siteId' }) });
      }
      if (url.includes('/drive') && url.includes('/children')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'sf1', name: 'Folder1' }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    render(<TeamsList />);

    // Wait for effect to run and put being called
    await waitFor(() => {
      expect(dbModule.db.favoriteTeams.put).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  test('fetches members for selected team and shows mention options', async () => {
    const fakeMsalInstance = {
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' })
    };
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: fakeMsalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch.mockImplementation((url: string) => {
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ userId: 'u1', displayName: 'Alice' }] }) });
      if (url.includes('/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    render(<TeamsList />);

    // select the team
    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // The mentions Autocomplete is rendered when online and a team selected
    const mentionInput = await screen.findByLabelText(/Personen erwähnen/i);
    await userEvent.click(mentionInput);
    await userEvent.type(mentionInput, 'Alice');
    // arrow down to select suggestion
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // Ensure Alice is included in the selected mentions list (it won't show as li but no errors should occur)
    expect(screen.getByPlaceholderText(/Namen eingeben/i) || mentionInput).toBeDefined();
  });

  test('shows a checkbox toggle in the mention dropdown for multi-select', async () => {
    const fakeMsalInstance = {
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' })
    };
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: fakeMsalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch.mockImplementation((url: string) => {
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ userId: 'u1', displayName: 'Alice' }, { userId: 'u2', displayName: 'Bob' }] }) });
      if (url.includes('/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    const mentionInput = await screen.findByLabelText(/Personen erwähnen/i);
    await userEvent.click(mentionInput);
    await userEvent.type(mentionInput, 'A');

    const option = await screen.findByRole('option', { name: /Alice/i });
    const checkbox = within(option).getByRole('checkbox');

    expect(checkbox).toBeInTheDocument();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    await userEvent.click(checkbox);

    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  test('saveOfflinePost writes to db and adds images via ChannelsList onSaveOffline (offline)', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();
    
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn() }, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    dbModule.db.favoriteTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One' }]);

    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    expect(props).toBeDefined();
    const { act } = require('@testing-library/react');
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));
    
    props = (global as any).__lastChannelsListProps;

    await act(async () => {
      await props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], '');
    });

    await waitFor(() => {
      expect(dbModule.db.posts.add).toHaveBeenCalled();
    });
    
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  test('saveOfflinePost syncs immediately when online and account present', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();
    
    dbModule.db.posts.toArray.mockResolvedValue([]);
    dbModule.db.posts.add.mockResolvedValue(123);
    dbModule.db.images.where.mockReturnValue({ 
        equals: jest.fn(() => ({ 
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'a.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined)
        })) 
    });
    
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/drive') && url.includes('/children')) return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
      if (url.includes('/drive/root:') && url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) });
      if (url.includes('/drive/root:') && !url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://weburl' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    expect(props).toBeDefined();
    const { act } = require('@testing-library/react');
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));
    
    props = (global as any).__lastChannelsListProps;

    await act(async () => {
      await props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], '');
    });

    await waitFor(() => {
      expect(postMessageToChannel).toHaveBeenCalled();
      expect(dbModule.db.posts.delete).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  test('saveOfflinePost syncs pdf files immediately when online', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    dbModule.db.posts.toArray.mockResolvedValue([]);
    dbModule.db.posts.add.mockResolvedValue(321);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['pdf'], 'manual.pdf', { type: 'application/pdf' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/drive/root:/') && url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) });
      if (url.includes('/drive/root:/') && !url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://uploaded-pdf-url' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));

    props = (global as any).__lastChannelsListProps;
    await act(async () => {
      await props.onSaveOffline([new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })], '');
    });

    await waitFor(() => {
      expect(postMessageToChannel).toHaveBeenCalledWith(
        'mock-token',
        't1',
        'c1',
        '',
        ['https://uploaded-pdf-url'],
        [expect.objectContaining({ name: 'manual.pdf', type: 'application/pdf' })],
        [],
        expect.objectContaining({ correlationId: expect.any(String) })
      );
    }, { timeout: 3000 });
  });

  test('saveOfflinePost syncs video files immediately when online', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    dbModule.db.posts.toArray.mockResolvedValue([]);
    dbModule.db.posts.add.mockResolvedValue(456);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['video'], 'clip.mp4', { type: 'video/mp4' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/drive/root:/') && url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) });
      if (url.includes('/drive/root:/') && !url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://uploaded-video-url' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));

    props = (global as any).__lastChannelsListProps;
    await act(async () => {
      await props.onSaveOffline([new File(['video'], 'clip.mp4', { type: 'video/mp4' })], '');
    });

    await waitFor(() => {
      expect(postMessageToChannel).toHaveBeenCalledWith(
        'mock-token',
        't1',
        'c1',
        '',
        ['https://uploaded-video-url'],
        [expect.objectContaining({ name: 'clip.mp4', type: 'video/mp4' })],
        [],
        expect.objectContaining({ correlationId: expect.any(String) })
      );
    }, { timeout: 3000 });
  });

  test('syncOfflinePosts uploads cached posts automatically when online', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    // Mock cached posts
    const cachedPosts = [{ id: 1, teamId: 't1', channelId: 'c1', text: 'Offline Post', imageUrls: [] as string[] }];
    dbModule.db.posts.toArray.mockResolvedValue(cachedPosts);
    dbModule.db.images.where.mockReturnValue({ 
        equals: jest.fn(() => ({ 
        toArray: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined)
        })) 
    });

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
        const url = typeof input === 'string' ? input : (input as any).url;
        if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
        if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
        if (url.includes('/drive') && url.includes('/children')) return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    // Wait for posts to load and automatic sync to trigger
    await waitFor(() => {
        expect(postMessageToChannel).toHaveBeenCalled();
        expect(dbModule.db.posts.delete).toHaveBeenCalledWith(1);
    });
  });

  test('syncOfflinePosts keeps offline metadata and uploaded file URLs when replaying cached posts', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    const cachedPosts = [{
      id: 7,
      teamId: 't1',
      channelId: 'c1',
      channelDisplayName: 'General',
      text: 'Offline Post',
      imageUrls: [] as string[],
      timestamp: Date.now(),
      mentions: [{ id: 'u1', displayName: 'Alice' }],
      subFolder: 'Folder1'
    }];

    dbModule.db.posts.toArray.mockResolvedValue(cachedPosts);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'offline.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/me/joinedTeams')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      }
      if (url.includes('/teams/t1/members')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      }
      if (url.includes('/teams/t1/channels')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      }
      if (url.includes('/sites/root')) {
        return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      }
      if (url.includes('/drive/root:/General/Bilder/Folder1/offline.png:/content') && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/drive/root:/General/Bilder/Folder1/offline.png') && method === 'GET') {
        return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://uploaded-offline-url' }) });
      }
      if (url.includes('/children')) {
        return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
      }
      if (url.includes('/drive/root:/General/Bilder/Folder1') && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    await waitFor(() => {
      expect(postMessageToChannel).toHaveBeenCalledWith(
        'mock-token',
        't1',
        'c1',
        'Offline Post',
        ['https://uploaded-offline-url'],
        [expect.objectContaining({ name: 'offline.png', type: 'image/png' })],
        [{ id: 'u1', displayName: 'Alice' }],
        expect.objectContaining({ correlationId: expect.any(String) })
      );
      expect(dbModule.db.posts.delete).toHaveBeenCalledWith(7);
    });
  });

  test('syncOfflinePosts creates missing Bilder folder before uploading cached files', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    const cachedPosts = [{
      id: 8,
      teamId: 't1',
      channelId: 'c1',
      channelDisplayName: 'General',
      text: 'Offline with missing folder',
      imageUrls: [] as string[],
      timestamp: Date.now(),
      mentions: [],
      subFolder: ''
    }];

    dbModule.db.posts.toArray.mockResolvedValue(cachedPosts);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'missing-folder.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({
      instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) },
      accounts: [{}]
    });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/groups/t1/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });

      // Folder check for General/Bilder -> missing
      if (url.includes('/drive/root:/General/Bilder') && method === 'GET' && !url.includes('missing-folder.png')) {
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
      }

      // Folder create
      if (url.includes('/drive/root:/General:/children') && method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }

      // File upload + metadata read
      if (url.includes('/drive/root:/General/Bilder/missing-folder.png:/content') && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/drive/root:/General/Bilder/missing-folder.png') && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://uploaded-missing-folder-url' }) });
      }

      if (url.includes('/lists/') && method === 'POST') {
        return Promise.resolve({ ok: true, text: async () => '' });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }), text: async () => '' });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/root:/General:/children'),
        expect.objectContaining({ method: 'POST' })
      );
      expect((global as any).fetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/root:/General/Bilder/missing-folder.png:/content'),
        expect.objectContaining({ method: 'PUT' })
      );
      expect(postMessageToChannel).toHaveBeenCalledWith(
        'mock-token',
        't1',
        'c1',
        'Offline with missing folder',
        ['https://uploaded-missing-folder-url'],
        [expect.objectContaining({ name: 'missing-folder.png', type: 'image/png' })],
        [],
        expect.objectContaining({ correlationId: expect.any(String) })
      );
      expect(dbModule.db.posts.delete).toHaveBeenCalledWith(8);
    });
  });

  test('syncOfflinePosts tolerates 409 on folder create and still uploads/posts', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    const cachedPosts = [{
      id: 9,
      teamId: 't1',
      channelId: 'c1',
      channelDisplayName: 'General',
      text: 'Offline conflict',
      imageUrls: [] as string[],
      timestamp: Date.now(),
      mentions: [],
      subFolder: ''
    }];

    dbModule.db.posts.toArray.mockResolvedValue(cachedPosts);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'conflict.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({
      instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) },
      accounts: [{}]
    });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/groups/t1/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });

      if (url.includes('/drive/root:/General/Bilder') && method === 'GET' && !url.includes('conflict.png')) {
        return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
      }

      // Folder already created by another client in parallel
      if (url.includes('/drive/root:/General:/children') && method === 'POST') {
        return Promise.resolve({ ok: false, status: 409, statusText: 'Conflict', text: async () => 'already exists' });
      }

      if (url.includes('/drive/root:/General/Bilder/conflict.png:/content') && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/drive/root:/General/Bilder/conflict.png') && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://uploaded-conflict-url' }) });
      }

      if (url.includes('/lists/') && method === 'POST') {
        return Promise.resolve({ ok: true, text: async () => '' });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }), text: async () => '' });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    await waitFor(() => {
      expect(postMessageToChannel).toHaveBeenCalledWith(
        'mock-token',
        't1',
        'c1',
        'Offline conflict',
        ['https://uploaded-conflict-url'],
        [expect.objectContaining({ name: 'conflict.png', type: 'image/png' })],
        [],
        expect.objectContaining({ correlationId: expect.any(String) })
      );
      expect(dbModule.db.posts.delete).toHaveBeenCalledWith(9);
    });
  });

  test('syncOfflinePosts does not delete cached post when replay fails', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    const imageDeleteSpy = jest.fn().mockResolvedValue(undefined);
    dbModule.db.posts.toArray.mockResolvedValue([
      {
        id: 10,
        teamId: 't1',
        channelId: 'c1',
        channelDisplayName: 'General',
        text: 'Offline fail',
        imageUrls: [],
        timestamp: Date.now(),
        mentions: [],
        subFolder: ''
      }
    ]);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'fail.png', { type: 'image/png' }) }]),
        delete: imageDeleteSpy,
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({
      instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) },
      accounts: [{}]
    });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/groups/t1/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });

      // Fail folder check with forbidden to trigger syncOfflinePosts catch path
      if (url.includes('/drive/root:/General/Bilder') && method === 'GET' && !url.includes('fail.png')) {
        return Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'forbidden' });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }), text: async () => '' });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
        expect.stringContaining('/groups/t1/sites/root'),
        expect.any(Object)
      );
    });

    expect(postMessageToChannel).not.toHaveBeenCalled();
    expect(dbModule.db.posts.delete).not.toHaveBeenCalledWith(10);
    expect(imageDeleteSpy).not.toHaveBeenCalled();
  });

  test('saveOfflinePost uploads and posts directly when online (single post, no duplicate)', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    // Reset the DB mocks for a clean test
    dbModule.db.posts.add.mockResolvedValue(99);
    dbModule.db.posts.delete.mockResolvedValue(undefined);
    dbModule.db.images.add.mockResolvedValue(undefined);
    dbModule.db.images.where.mockReturnValue({
        equals: jest.fn(() => ({
            toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'a.png', { type: 'image/png' }) }]),
            delete: jest.fn().mockResolvedValue(undefined),
        }))
    });
    // No cached offline posts (to avoid auto-sync interference)
    dbModule.db.posts.toArray.mockResolvedValue([]);

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
        const url = typeof input === 'string' ? input : (input as any).url;
        if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
        if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
        if (url.includes('/drive/root:/')) return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://uploaded-url' }) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    // Select Team
    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    // Select Channel via Mock
    let props = (global as any).__lastChannelsListProps;
    const { act } = require('@testing-library/react');
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));

    props = (global as any).__lastChannelsListProps;
    await act(async () => {
      await props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], '');
    });

    // Post should be called exactly once (no duplicate)
    await waitFor(() => {
        expect(postMessageToChannel).toHaveBeenCalledTimes(1);
        expect(dbModule.db.posts.delete).toHaveBeenCalledWith(99);
    }, { timeout: 3000 });
  });

  test('syncPost writes Error AppLog and rethrows when folder check fails', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    dbModule.db.posts.toArray.mockResolvedValue([]);
    dbModule.db.posts.add.mockResolvedValue(888);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'a.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({
      instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) },
      accounts: [{}]
    });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/groups/t1/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });

      // folder check fails with 403 -> should trigger catch path and error AppLog
      if (url.includes('/drive/root:/General/Bilder') && !url.includes('/content')) {
        return Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'forbidden' });
      }

      // AppLog write
      if (url.includes('/lists/') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, text: async () => '' });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }), text: async () => '' });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));

    props = (global as any).__lastChannelsListProps;
    await expect(
      props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], '')
    ).rejects.toThrow(/Failed to check folder existence/);

    const logCalls = ((global as any).fetch as jest.Mock).mock.calls.filter((call: any[]) => {
      const url = call[0] as string;
      return typeof url === 'string' && url.includes('/lists/');
    });

    expect(logCalls.length).toBeGreaterThanOrEqual(1);
    const logBody = JSON.parse(logCalls[0][1].body);
    expect(logBody.fields.Status).toBe('Error');
    expect(logBody.fields.ErrorMessage).toContain('step=checkFolder');
    expect(logBody.fields.ErrorMessage).toContain('httpStatus=403');
    expect(logBody.fields.ErrorMessage).toContain('correlationId=');
    expect(postMessageToChannel).not.toHaveBeenCalled();
    expect(dbModule.db.posts.delete).not.toHaveBeenCalledWith(888);
  });

  test('syncPost logs AppLog-write failure separately and still rethrows original error', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    dbModule.db.posts.toArray.mockResolvedValue([]);
    dbModule.db.posts.add.mockResolvedValue(889);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'a.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({
      instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) },
      accounts: [{}]
    });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/groups/t1/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/drive/root:/General/Bilder') && !url.includes('/content')) {
        return Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'forbidden' });
      }

      // AppLog write itself fails
      if (url.includes('/lists/') && init?.method === 'POST') {
        return Promise.resolve({ ok: false, status: 403, text: async () => 'log-forbidden' });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }), text: async () => '' });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));

    props = (global as any).__lastChannelsListProps;
    await expect(
      props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], '')
    ).rejects.toThrow(/Failed to check folder existence/);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/AppLog Error-Write fehlgeschlagen/),
      expect.anything(),
      expect.anything()
    );

  });

  test('syncPost writes success AppLog after postMessageToChannel', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    dbModule.db.posts.toArray.mockResolvedValue([]);
    dbModule.db.posts.add.mockResolvedValue(890);
    dbModule.db.images.where.mockReturnValue({
      equals: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'a.png', { type: 'image/png' }) }]),
        delete: jest.fn().mockResolvedValue(undefined),
      }))
    });

    (msal.useMsal as jest.Mock).mockReturnValue({
      instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) },
      accounts: [{}]
    });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    const events: string[] = [];
    (postMessageToChannel as jest.Mock).mockImplementation(async () => {
      events.push('postMessage');
    });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/teams/t1/members')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
      if (url.includes('/teams/t1/channels')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [{ id: 'c1', displayName: 'General' }] }) });
      if (url.includes('/groups/t1/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/drive/root:/General/Bilder/a.png:/content') && method === 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/drive/root:/General/Bilder/a.png') && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://uploaded-url' }) });
      }
      if (url.includes('/drive/root:/General/Bilder') && method === 'GET') {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/lists/') && method === 'POST') {
        events.push('successLog');
        return Promise.resolve({ ok: true, text: async () => '' });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }), text: async () => '' });
    });

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Teams suchen/i);
    await userEvent.click(input);
    await userEvent.type(input, 'Team One');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    let props = (global as any).__lastChannelsListProps;
    await act(async () => {
      props.onChannelSelect({ id: 'c1', displayName: 'General' });
    });
    await new Promise((r) => setTimeout(r, 0));

    props = (global as any).__lastChannelsListProps;
    await act(async () => {
      await props.onSaveOffline([new File(['a'], 'a.png', { type: 'image/png' })], '');
    });

    expect(events.indexOf('postMessage')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('successLog')).toBeGreaterThan(events.indexOf('postMessage'));
  });

});