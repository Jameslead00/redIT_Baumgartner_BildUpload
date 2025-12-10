import { postMessageToChannel } from '../ui-components/PostMessage';

describe('postMessageToChannel', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('posts message with mentions and without files', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;
    const accessToken = 'token123';
    const teamId = 'team1';
    const channelId = 'chan1';
    const customText = 'Hello';
    const imageUrls: string[] = [];
    const files: File[] = [];
    const mentions = [{ id: 'u1', displayName: 'Max Mustermann' }];

    await postMessageToChannel(accessToken, teamId, channelId, customText, imageUrls, files, mentions as any);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = (mockFetch.mock.calls[0][0] as string);
    const options = mockFetch.mock.calls[0][1];
    expect(calledUrl).toContain(`/teams/${teamId}/channels/${channelId}/messages`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Bearer ${accessToken}`);

    const body = JSON.parse(options.body);
    // mentionsArray created with id and mentionText
    expect(Array.isArray(body.mentions)).toBeTruthy();
    expect(body.mentions[0].mentioned.user.id).toBe('u1');

    // html content includes the mention text
    expect(body.body.content).toContain('Max Mustermann');
    // ensure HTML escaping works for a custom text that contains special chars
    // to ensure escapeHtml used for customText
    const jsonText = JSON.parse(options.body);
    expect(jsonText.body.content).toContain('Hello');
  });

  test('throws error when post fails', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, text: async () => 'Server error' });
    (global as any).fetch = mockFetch;

    await expect(
      postMessageToChannel('t', 'team', 'chan', 'txt', [], [], [])
    ).rejects.toThrow(/Failed to post message/);
  });

  test('filters invalid mentions and escapes customText', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;
    const accessToken = 'token123';
    const teamId = 'team1';
    const channelId = 'chan1';
    const customText = '<script>alert("XSS")</script>';
    const imageUrls: string[] = [];
    const files: File[] = [];
    // include an invalid mention (missing id) and a valid mention
    const mentions = [{ id: '', displayName: 'NoId' }, { id: 'u2', displayName: 'Alice & Bob' }];

    await postMessageToChannel(accessToken, teamId, channelId, customText, imageUrls, files, mentions as any);
    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);
    // should only include the valid mention
    expect(body.mentions.length).toBe(1);
    // html content should escape < and & properly
    expect(body.body.content).not.toContain('<script>');
    expect(body.body.content).toContain('&amp;');
  });
});
