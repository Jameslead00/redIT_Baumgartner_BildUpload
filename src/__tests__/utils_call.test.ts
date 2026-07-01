import { callMsGraph as callMsGraphUtil } from '../utils/MsGraphApiCall';
import { callMsGraph as callMsGraphGraph } from '../graph';
import { postMessageToChannel } from '../ui-components/PostMessage';

describe('MsGraphApiCall utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('callMsGraph throws when no active account', async () => {
    // Provide a fake module with msalInstance
    jest.mock('../index', () => ({ msalInstance: { getActiveAccount: (): null => null } }));
    // Need to re-require module to use mocked msalInstance
    const path = require.resolve('../utils/MsGraphApiCall');
    jest.resetModules();
    const { callMsGraph } = require('../utils/MsGraphApiCall');
    await expect(callMsGraph()).rejects.toThrow('No active account');
  });

  test('callMsGraph calls fetch when account present', async () => {
    jest.resetModules();
    // Mock msalInstance with active account and acquireTokenSilent
    const msalMock = {
      getActiveAccount: jest.fn().mockReturnValue({ username: 'test' }),
      acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'abc' })
    };
    jest.mock('../index', () => ({ msalInstance: msalMock }));
    jest.resetModules();
    const { callMsGraph } = require('../utils/MsGraphApiCall');

    const json = { displayName: 'X' };
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(json) });
    const result = await callMsGraph();
    expect(result).toEqual(json);
    expect(msalMock.acquireTokenSilent).toHaveBeenCalled();
  });
});

describe('PostMessage posting', () => {
  beforeEach(() => jest.clearAllMocks());

  test('escapeHtml is used in mentions and handles text', async () => {
    const token = 'token';
    const teamId = 't';
    const channelId = 'c';
    const customText = 'This & that <tom>';
    const imageUrls: string[] = [];
    const files: File[] = [];
    const mentions = [{ id: 'u1', displayName: 'M & <a>' }];

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await postMessageToChannel(token, teamId, channelId, customText, imageUrls, files, mentions as any);

    expect((global as any).fetch).toHaveBeenCalled();
    const fetchCall = (global as any).fetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    // mentions should be present
    expect(body.mentions).toBeDefined();
    expect(body.mentions[0].mentioned.user.id).toBe('u1');
    // content should contain escaped mention text
    expect(body.body.content).toContain('&amp;');
    expect(body.body.content).toContain('&lt;');
  });

  test('postMessageToChannel sends default text when customText empty', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await postMessageToChannel('token', 't', 'c', '', [], [], []);
    expect((global as any).fetch).toHaveBeenCalled();
    const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(body.body.content).toContain('Neue Dateien hochgeladen');
  });

  test('postMessageToChannel renders image files as links without hostedContents', async () => {
    const token = 'token';
    const teamId = 't';
    const channelId = 'c';
    const customText = 'hello';
    const imageUrl = 'https://example.com/image.png';
    const files: any[] = [new File([new ArrayBuffer(10)], 'pic.jpg', { type: 'image/jpeg' })];

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await postMessageToChannel(token, teamId, channelId, customText, [imageUrl], files as any, [] as any);
    expect((global as any).fetch).toHaveBeenCalled();

    const body = JSON.parse((global as any).fetch.mock.calls[0][1].body);
    expect(body.hostedContents).toEqual([]);
    expect(body.body.content).toContain('href="https://example.com/image.png"');
  });

  test('postMessageToChannel throws when message POST fails', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' });
    await expect(postMessageToChannel('token', 't', 'c', '', [], [], [])).rejects.toThrow();
  });
});
