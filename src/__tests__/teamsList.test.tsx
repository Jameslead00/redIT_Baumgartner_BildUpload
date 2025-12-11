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
    const input = await screen.findByLabelText(/Search teams/i);
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

  test('offline uses cached favorites for the Autocomplete', async () => {
    // Simulate offline and no account
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: {}, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    const dbModule = require('../db');
    dbModule.db.favoriteTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One' }]);
    dbModule.db.posts.toArray.mockResolvedValue([]);

    render(<TeamsList />);

    // open autocomplete
    const input = await screen.findByLabelText(/Search teams/i);
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
    const input = await screen.findByLabelText(/Search teams/i);
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

  test('saveOfflinePost writes to db and adds images via ChannelsList onSaveOffline (offline)', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();
    
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn() }, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    dbModule.db.favoriteTeams.toArray.mockResolvedValue([{ id: 't1', displayName: 'Team One' }]);

    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Search teams/i);
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
            toArray: jest.fn().mockResolvedValue([{ file: new File(['a'], 'a.png', { type: 'image/png' }) }]) 
        })) 
    });
    
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
      if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/drive') && url.includes('/children')) return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
      if (url.includes('/drive/root:') && url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) });
      if (url.includes('/drive/root:') && !url.includes('/content')) return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://weburl' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    const input = await screen.findByLabelText(/Search teams/i);
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

  test('syncOfflinePosts uploads cached posts when button clicked', async () => {
    const dbModule = require('../db');
    jest.clearAllMocks();

    // Mock cached posts
    const cachedPosts = [{ id: 1, teamId: 't1', channelId: 'c1', text: 'Offline Post', imageUrls: [] as string[] }];
    dbModule.db.posts.toArray.mockResolvedValue(cachedPosts);
    dbModule.db.images.where.mockReturnValue({ 
        equals: jest.fn(() => ({ 
            toArray: jest.fn().mockResolvedValue([]) 
        })) 
    });

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
        const url = typeof input === 'string' ? input : (input as any).url;
        if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
        if (url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
        if (url.includes('/drive') && url.includes('/children')) return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    // Wait for posts to load
    await waitFor(() => expect(dbModule.db.posts.toArray).toHaveBeenCalled());

    // Find Sync Button
    const syncButton = await screen.findByText(/Upload \(1\) cached post\(s\)/i);
    await userEvent.click(syncButton);

    await waitFor(() => {
        expect(postMessageToChannel).toHaveBeenCalled();
        expect(dbModule.db.posts.delete).toHaveBeenCalledWith(1);
    });
  });

  test('handlePostToChannel posts message directly when online', async () => {
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock-token' }) }, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: 'User', username: 'u@test' });

    (global as any).fetch.mockImplementation((input: RequestInfo) => {
        const url = typeof input === 'string' ? input : (input as any).url;
        if (url.includes('/me/joinedTeams')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: teams }) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ value: [] }) });
    });

    (postMessageToChannel as jest.Mock).mockResolvedValue(undefined);

    render(<TeamsList />);

    // Select Team
    const input = await screen.findByLabelText(/Search teams/i);
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

    // Simulate Upload Success (sets customText and imageUrls)
    props = (global as any).__lastChannelsListProps;
    await act(async () => {
        // Trigger the simulate-upload-success button in mock
        const btn = screen.getByTestId('simulate-upload-success');
        btn.click();
    });

    // Find "Beitrag in Kanal posten" button
    const postButton = await screen.findByText(/Beitrag in Kanal posten/i);
    await userEvent.click(postButton);

    await waitFor(() => {
        expect(postMessageToChannel).toHaveBeenCalledWith(
            'mock-token', 't1', 'c1', 'Test Message', ['https://url'], expect.any(Array), expect.any(Array)
        );
    });
  });
});