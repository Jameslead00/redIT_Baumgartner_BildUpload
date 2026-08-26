import { buildEmployeeUsageSummary, parseUserFromTitle } from '../pages/StatsPage';

describe('StatsPage reporting helpers', () => {
  test('parses the employee email from the SharePoint log title', () => {
    expect(parseUserFromTitle('[abc123] Upload by sbaumgartner@baumgartnerfenster.ch')).toBe('sbaumgartner@baumgartnerfenster.ch');
    expect(parseUserFromTitle('Upload by redadmin@baumgartnerfenster.ch')).toBe('redadmin@baumgartnerfenster.ch');
    expect(parseUserFromTitle('something else')).toBe('unknown');
  });

  test('builds employee usage metrics from existing log entries', () => {
    const entries = [
      {
        title: '[abc] Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T10:00:00Z'),
        photoCount: 5,
        totalSizeMB: 12.5,
        status: 'Success' as const,
        errorMessage: ''
      },
      {
        title: '[def] Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-11T11:00:00Z'),
        photoCount: 3,
        totalSizeMB: 8,
        status: 'Error' as const,
        errorMessage: 'message=Upload failed'
      },
      {
        title: 'Upload by redadmin@baumgartnerfenster.ch',
        logtime: new Date('2026-08-12T09:00:00Z'),
        photoCount: 2,
        totalSizeMB: 4,
        status: 'Success' as const,
        errorMessage: ''
      }
    ];

    const summary = buildEmployeeUsageSummary(entries as any);

    expect(summary).toEqual([
      expect.objectContaining({
        user: 'sbaumgartner@baumgartnerfenster.ch',
        uploads: 2,
        successfulUploads: 1,
        failedUploads: 1,
        totalMB: 20.5,
        successRate: 50,
      }),
      expect.objectContaining({
        user: 'redadmin@baumgartnerfenster.ch',
        uploads: 1,
        successfulUploads: 1,
        failedUploads: 0,
        totalMB: 4,
        successRate: 100,
      })
    ]);
  });
});
