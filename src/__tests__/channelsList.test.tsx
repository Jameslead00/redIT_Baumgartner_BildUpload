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
  return (props: any) => (
    <div data-testid="mock-imageupload" data-cached-subfolders={JSON.stringify(props.cachedSubFolders || [])}>
      ImageUpload
    </div>
  );
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
        cachedAllChannels={[]}
        cachedAllSubFolders={{}}
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
        cachedAllChannels={cached}
        cachedAllSubFolders={{}}
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
        cachedAllChannels={[]}
        cachedAllSubFolders={{}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Fehler/i)).toBeInTheDocument();
      expect(screen.getByText(/Kanäle konnten nicht geladen werden/i)).toBeInTheDocument();
    });
  });

  test("uses cached channels as fallback when online fetch fails", async () => {
    const msalInstance = { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: "mock" }) };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: msalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "user@test" });

    (global as any).fetch.mockResolvedValueOnce({ ok: false });

    render(
      <ChannelsList
        team={team}
        onChannelSelect={onChannelSelect}
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={onCustomTextChange}
        customText=""
        isFavorite={true}
        cachedChannels={[{ id: "c-cache", displayName: "Cached General" }]}
        cachedSubFolders={{}}
        cachedAllChannels={[]}
        cachedAllSubFolders={{}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Cached General/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Kanäle konnten nicht geladen werden/i)).not.toBeInTheDocument();
  });

  test("falls back to popup request and renders channels", async () => {
    const msalInstance = {
      acquireTokenSilent: jest.fn().mockRejectedValue(new (require('@azure/msal-browser').InteractionRequiredAuthError)('interaction_required', 'interaction required')),
      acquireTokenPopup: jest.fn().mockResolvedValue({ accessToken: "popup-token" })
    };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: msalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "user@test" });

    (global as any).fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ value: [{ id: "c-popup", displayName: "Popup Channel" }] })
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
        cachedAllChannels={[]}
        cachedAllSubFolders={{}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Popup Channel/i)).toBeInTheDocument();
    });

    expect(msalInstance.acquireTokenPopup).toHaveBeenCalled();
  });

  test("does not reload channels when only customText changes and caches are empty", async () => {
    const channels = [{ id: "c1", displayName: "General" }];
    const msalInstance = { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: "mock" }) };

    (msal.useMsal as jest.Mock).mockReturnValue({ instance: msalInstance, accounts: [{}] });
    (msal.useAccount as jest.Mock).mockReturnValue({ name: "User", username: "user@test" });

    (global as any).fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ value: channels })
    });

    const { rerender } = render(
      <ChannelsList
        team={team}
        onChannelSelect={onChannelSelect}
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={onCustomTextChange}
        customText=""
        isFavorite={false}
        cachedChannels={[]}
        cachedSubFolders={{}}
        cachedAllChannels={[]}
        cachedAllSubFolders={{}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/General/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(/General/i));
    expect(screen.getByTestId('mock-imageupload')).toBeInTheDocument();

    rerender(
      <ChannelsList
        team={team}
        onChannelSelect={onChannelSelect}
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={onCustomTextChange}
        customText="a"
        isFavorite={false}
        cachedChannels={[]}
        cachedSubFolders={{}}
        cachedAllChannels={[]}
        cachedAllSubFolders={{}}
      />
    );

    expect(screen.queryByText(/Kanäle werden geladen/i)).not.toBeInTheDocument();
    expect(screen.getByText(/General/i)).toBeInTheDocument();
    expect(screen.getByTestId('mock-imageupload')).toBeInTheDocument();
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });
});