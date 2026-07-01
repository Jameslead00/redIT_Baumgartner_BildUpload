import { postMessageToChannel } from '../ui-components/PostMessage';

const MAX_MESSAGE_PAYLOAD_BYTES = 3.5 * 1024 * 1024;

describe('postMessageToChannel', () => {
  let originalImage: any;
  let originalCreateObjectURL: any;

  beforeEach(() => {
    (global as any).fetch = jest.fn();
    
    // Save originals
    originalImage = global.Image;
    originalCreateObjectURL = global.URL.createObjectURL;

    // Mock URL.createObjectURL
    global.URL.createObjectURL = jest.fn(() => 'mock-url');

    // Mock Image to simulate loading
    (global as any).Image = class {
      onload: any;
      onerror: any;
      width = 100;
      height = 100;
      set src(_: string) {
        // Simulate async image loading
        setTimeout(() => this.onload && this.onload(), 0);
      }
    };

    // Mock Canvas
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: jest.fn(),
    } as any);
    
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: any) => {
        cb(new Blob(['blob'], { type: 'image/jpeg' }));
    });

    // Mock FileReader
    const mockFileReader = {
      readAsDataURL: jest.fn().mockImplementation(function(this: any) {
          this.result = 'data:image/jpeg;base64,mockbase64content';
          if (this.onload) this.onload();
          if (this.onloadend) this.onloadend();
      }),
      result: '',
      onload: null as any,
      onloadend: null as any,
    };
    jest.spyOn(window, 'FileReader').mockImplementation(() => mockFileReader as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.Image = originalImage;
    global.URL.createObjectURL = originalCreateObjectURL;
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
    expect(Array.isArray(body.mentions)).toBeTruthy();
    expect(body.mentions[0].mentioned.user.id).toBe('u1');
    expect(body.body.content).toContain('Max Mustermann');
    expect(body.body.content).toContain('Hello');
  });

  test('renders mention with position in brackets when position is available', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const mentions = [{ id: 'u2', displayName: 'Anna Muster', position: 'Montage Koordination' }];

    await postMessageToChannel('token123', 'team1', 'chan1', 'Hi', [], [], mentions as any);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.body.content).toContain('Anna Muster (Montage Koordination)');
    expect(body.mentions[0].mentioned.user.displayName).toBe('Anna Muster');
  });

  test('sends payload with hostedContents (images) and mentions', async () => {
    // Mock fetch to collect the POST body
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      if (typeof input === 'string' && input.includes('/messages')) {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const files = [new File(['a'], 'img1.jpg', { type: 'image/jpeg' })];
    const mentions = [{ id: 'u1', displayName: 'Alice' }];
    const imageUrls = ['https://tenant.sharepoint.com/sites/MySite/Shared%20Documents/General/Bilder/img1.jpg'];

    await expect(postMessageToChannel('token', 't1', 'c1', 'Hello', imageUrls, files, mentions)).resolves.toBeUndefined();

    const postCalls = (global as any).fetch.mock.calls.filter((c: any[]) => typeof c[0] === 'string' && c[0].includes('/messages'));
    expect(postCalls.length).toBe(1);
    const body = JSON.parse(postCalls[0][1]?.body);
    
    expect(body.hostedContents).toBeDefined();
    expect(body.hostedContents.length).toBe(1);
    expect(body.hostedContents[0]['@microsoft.graph.temporaryId']).toBe('1');
    expect(body.hostedContents[0].contentBytes).toBe('mockbase64content');
    expect(body.hostedContents[0].contentType).toBe('image/jpeg');

    expect(body.mentions.length).toBe(1);
    expect(body.body.content).toContain('Alice');
    expect(body.body.content).toContain('src="../hostedContents/1/$value"');
    expect(body.body.content).toContain('https://tenant.sharepoint.com/sites/MySite/Shared%20Documents/General/Bilder');
    expect(body.body.content).not.toContain('img1.jpg');
  });

  test('throws on failed message POST', async () => {
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      if (typeof input === 'string' && input.includes('/messages')) {
        return Promise.resolve({ ok: false, status: 500, text: async () => 'error' });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const files = [new File(['a'], 'img1.jpg', { type: 'image/jpeg' })];
    await expect(postMessageToChannel('token', 't1', 'c1', 'Error', ['https://drive/url'], files, [])).rejects.toThrow(/Failed to post message to channel/);
  });

  test('filters invalid mentions and escapes HTML in mentions and customText', async () => {
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      if (typeof input === 'string' && input.includes('/messages')) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const files: File[] = [];
    const mentions = [ { id: '', displayName: '<b>Bad</b>' }, { id: 'u2', displayName: 'Good & <Guy>' } ];
    const customText = '<script>alert("XSS")</script>';

    await expect(postMessageToChannel('token', 't1', 'c1', customText, [], files, mentions as any)).resolves.toBeUndefined();

    const postCalls = (global as any).fetch.mock.calls.filter((c: any[]) => typeof c[0] === 'string' && c[0].includes('/messages'));
    const body = JSON.parse(postCalls[0][1].body);
    
    expect(body.mentions.length).toBe(1);
    expect(body.body.content).toContain('&lt;');
    expect(body.body.content).toContain('&amp;');
    expect(body.body.content).not.toContain('<script>');
    expect(body.body.content).toContain('&lt;script&gt;');
  });

  test('handles empty text and empty files gracefully', async () => {
     const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    await postMessageToChannel('token', 't1', 'c1', '', [], [], []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);
    
    expect(body.body.content).toBeDefined();
    expect(body.hostedContents).toEqual([]);
    expect(body.mentions).toEqual([]);
  });

  // --- Neue Tests für höhere Coverage ---

  test('uses default text when customText is empty and no mentions provided', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    await postMessageToChannel('token', 't1', 'c1', '', [], [], []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);
    
    expect(body.body.content).toContain('Neue Dateien hochgeladen: ');
  });

  test('uses fallback link "#" when imageUrls are missing for files', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const files = [new File(['a'], 'img1.jpg', { type: 'image/jpeg' })];
    // Leeres imageUrls Array
    await postMessageToChannel('token', 't1', 'c1', 'Text', [], files, []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);
    
    // Prüfen ob href="#" gesetzt ist
    expect(body.body.content).toContain('href="#"');
  });

  test('resizes large landscape images correctly', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    // Mock Image mit großen Dimensionen (Landscape)
    (global as any).Image = class {
      onload: any;
      width = 2000; // > 1024
      height = 1000;
      set src(_: string) { setTimeout(() => this.onload && this.onload(), 0); }
    };

    const files = [new File(['a'], 'large.jpg', { type: 'image/jpeg' })];
    await postMessageToChannel('token', 't1', 'c1', 'Text', [], files, []);

    // Wir können nicht direkt prüfen, ob resized wurde, da Canvas gemockt ist,
    // aber wir stellen sicher, dass der Code-Pfad ohne Fehler durchläuft.
    expect(mockFetch).toHaveBeenCalled();
  });

  test('resizes large portrait images correctly', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    // Mock Image mit großen Dimensionen (Portrait)
    (global as any).Image = class {
      onload: any;
      width = 1000;
      height = 2000; // > 1024
      set src(_: string) { setTimeout(() => this.onload && this.onload(), 0); }
    };

    const files = [new File(['a'], 'large-portrait.jpg', { type: 'image/jpeg' })];
    await postMessageToChannel('token', 't1', 'c1', 'Text', [], files, []);

    expect(mockFetch).toHaveBeenCalled();
  });

  test('handles image loading errors gracefully', async () => {
    // Mock Image das Fehler wirft
    (global as any).Image = class {
      onerror: any;
      set src(_: string) { setTimeout(() => this.onerror && this.onerror(new Error('Load failed')), 0); }
    };

    const files = [new File(['a'], 'broken.jpg', { type: 'image/jpeg' })];
    
    // Sollte fehlschlagen, da prepareImageForHostedContent rejected
    await expect(postMessageToChannel('token', 't1', 'c1', 'Text', [], files, []))
        .rejects.toThrow();
  });

  test('posts message without images or files', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    await postMessageToChannel('token', 't1', 'c1', 'Text only post', undefined, undefined, []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);
    
    expect(body.hostedContents).toEqual([]);
    expect(body.mentions).toEqual([]);
    expect(body.body.content).toContain('Text only post');
    expect(body.body.content).not.toContain('src="../hostedContents/');
  });

  test('handles canvas.toBlob failure', async () => {
    // Mock Canvas toBlob failure (callback with null)
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: any) => {
        cb(null); // Simulate failure
    });

    const files = [new File(['a'], 'img.jpg', { type: 'image/jpeg' })];
    
    // FIX: Erwartete Fehlermeldung anpassen
    await expect(postMessageToChannel('token', 't1', 'c1', 'Text', [], files, []))
        .rejects.toThrow('Canvas toBlob failed');
  });

  test('renders video files with SharePoint stream URL instead of raw download URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const files = [new File(['video'], 'clip.mp4', { type: 'video/mp4' })];
    const rawUrl = 'https://tenant.sharepoint.com/sites/MySite/Shared%20Documents/General/Bilder/clip.mp4';
    await postMessageToChannel('token', 't1', 'c1', 'Text', [rawUrl], files, []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.body.content).toContain('/_layouts/15/stream.aspx?id=');
    // Raw download URL must NOT appear as link href
    expect(body.body.content).not.toContain(`href="${rawUrl}"`);
    expect(body.body.content).toContain('clip.mp4');
  });

  test('renders pdf files as links without hosted content', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const files = [new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })];
    await postMessageToChannel('token', 't1', 'c1', 'Text', ['https://drive/pdf'], files, []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.hostedContents).toEqual([]);
    expect(body.body.content).toContain('manual.pdf');
    expect(body.body.content).toContain('https://drive/pdf');
    expect(body.body.content).toContain('Datei öffnen');
  });

  test('renders mixed image and pdf uploads correctly', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const files = [
      new File(['img'], 'img1.jpg', { type: 'image/jpeg' }),
      new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })
    ];

    await postMessageToChannel('token', 't1', 'c1', 'Text', ['https://drive/img', 'https://drive/pdf'], files, []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.hostedContents).toHaveLength(1);
    expect(body.body.content).toContain('src="../hostedContents/1/$value"');
    expect(body.body.content).toContain('manual.pdf');
    expect(body.body.content).toContain('https://drive/pdf');
  });

  test('limits inline images when the message payload would exceed the threshold', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const largeBase64 = 'a'.repeat(2_000_000);
    const oversizedFileReader = {
      readAsDataURL: jest.fn().mockImplementation(function(this: any) {
        this.result = `data:image/jpeg;base64,${largeBase64}`;
        if (this.onload) this.onload();
      }),
      result: '',
      onload: null as any,
      onerror: null as any,
    };

    jest.spyOn(window, 'FileReader').mockImplementation(() => oversizedFileReader as any);

    const files = [
      new File(['a'], 'img1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'img2.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'img3.jpg', { type: 'image/jpeg' })
    ];

    await postMessageToChannel(
      'token',
      't1',
      'c1',
      'Text',
      ['https://drive/1', 'https://drive/2', 'https://drive/3'],
      files,
      []
    );

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.hostedContents).toHaveLength(1);
    expect(body.body.content).toContain('src="../hostedContents/1/$value"');
    expect(body.body.content).toContain('Es befinden sich noch 2 weitere Bilder in diesem Post');
    expect(body.body.content).not.toContain('src="../hostedContents/2/$value"');
    expect(new Blob([JSON.stringify(body)]).size).toBeLessThanOrEqual(MAX_MESSAGE_PAYLOAD_BYTES);
  });

  test('keeps non-image file links even when inline images are limited', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const largeBase64 = 'a'.repeat(2_000_000);
    const oversizedFileReader = {
      readAsDataURL: jest.fn().mockImplementation(function(this: any) {
        this.result = `data:image/jpeg;base64,${largeBase64}`;
        if (this.onload) this.onload();
      }),
      result: '',
      onload: null as any,
      onerror: null as any,
    };

    jest.spyOn(window, 'FileReader').mockImplementation(() => oversizedFileReader as any);

    const files = [
      new File(['a'], 'img1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'img2.jpg', { type: 'image/jpeg' }),
      new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })
    ];

    await postMessageToChannel(
      'token',
      't1',
      'c1',
      'Text',
      ['https://drive/1', 'https://drive/2', 'https://drive/manual'],
      files,
      []
    );

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.hostedContents).toHaveLength(1);
    expect(body.body.content).toContain('manual.pdf');
    expect(body.body.content).toContain('https://drive/manual');
    expect(body.body.content).toContain('Es befinden sich noch 1 weitere Bilder in diesem Post');
  });

  test('deduplicates duplicate file/url pairs before payload creation', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    (global as any).fetch = mockFetch;

    const duplicateFile = new File(['img'], 'dup.jpg', { type: 'image/jpeg' });
    const files = [duplicateFile, duplicateFile];
    const urls = ['https://drive/dup', 'https://drive/dup'];

    await postMessageToChannel('token', 't1', 'c1', 'Text', urls, files, []);

    const options = mockFetch.mock.calls[0][1];
    const body = JSON.parse(options.body);

    expect(body.hostedContents).toHaveLength(1);
    expect(body.body.content).toContain('src="../hostedContents/1/$value"');
    expect(body.body.content).not.toContain('src="../hostedContents/2/$value"');
  });
});
