// src/__tests__/channelsList.test.tsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import '@testing-library/jest-dom';
import ChannelsList from "../ui-components/ChannelsList";

jest.mock("@azure/msal-react", () => ({
  useMsal: jest.fn(),
  useAccount: jest.fn(),
}));
import * as msal from "@azure/msal-react";

jest.mock("../ui-components/ImageUpload", () => {
  return () => <div data-testid="mock-imageupload">ImageUpload</div>;
});

describe("ChannelsList component", () => {
  const team = { id: "t1", displayName: "Team A" };
  const onChannelSelect = jest.fn();
  const onUploadSuccess = jest.fn();
  const onCustomTextChange = jest.fn();

  beforeEach(() => {
    // reset navigator to default online true at start of each test
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    (global as any).fetch = jest.fn();
    jest.resetAllMocks();
  });

  test("fetches channels when online and displays them", async () => {
    const channels = [{ id: "c1", displayName: "General" }, { id: "c2", displayName: "Team" }];
    const msalInstance = { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: "mock" }) };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: msalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "user@test" });

    // Response for channels fetch
    (global as any).fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ value: channels })
    });

    render(
      <ChannelsList
        team={team}
        onChannelSelect={onChannelSelect}
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={onCustomTextChange}
        customText=""
        isFavorite={false}
        cachedChannels={[]}
        cachedSubFolders={{}}
      />
    );

    // Wait for channels to render
    await waitFor(() => {
      expect(screen.getByText(/General/i)).toBeInTheDocument();
      expect(screen.getByText(/Team/i)).toBeInTheDocument();
    });

    // Click General Channel
    await userEvent.click(screen.getByText(/General/i));
    expect(onChannelSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", displayName: "General" }));
  });

  test("uses cached channels when offline or no account", async () => {
    // offline
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    (msal.useMsal as jest.Mock).mockReturnValue({ instance: {}, accounts: [] });
    (msal.useAccount as jest.Mock).mockReturnValue(null);

    const cached = [{ id: "c10", displayName: "Cached" }];
    render(
      <ChannelsList
        team={team}
        onChannelSelect={onChannelSelect}
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={onCustomTextChange}
        customText=""
        isFavorite={false}
        cachedChannels={cached}
        cachedSubFolders={{}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Offline gecacht/i)).toBeInTheDocument();
      expect(screen.getByText(/Cached/i)).toBeInTheDocument();
    });
  });

  test("shows error when fetch fails", async () => {
    const msalInstance = { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: "mock" }) };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: msalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "user@test" });

    // Fetch returns not ok
    (global as any).fetch.mockResolvedValueOnce({ ok: false });

    render(
      <ChannelsList
        team={team}
        onChannelSelect={onChannelSelect}
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={onCustomTextChange}
        customText=""
        isFavorite={false}
        cachedChannels={[]}
        cachedSubFolders={{}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Error:/i)).toBeInTheDocument();
      expect(screen.getByText(/Failed to fetch channels/i)).toBeInTheDocument();
    });
  });
});