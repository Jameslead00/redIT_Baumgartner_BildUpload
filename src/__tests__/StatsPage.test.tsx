import {
  buildDailyTeamPersonChart,
  buildDailyTeamPostChart,
  buildEmployeeTeamHistory,
  buildEmployeeUsageSummary,
  parseUserFromTitle,
} from '../pages/StatsPage';

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
        errorMessage: '',
        targetTeam: 'Team A'
      },
      {
        title: '[def] Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-11T11:00:00Z'),
        photoCount: 3,
        totalSizeMB: 8,
        status: 'Error' as const,
        errorMessage: 'message=Upload failed',
        targetTeam: 'Team B'
      },
      {
        title: 'Upload by redadmin@baumgartnerfenster.ch',
        logtime: new Date('2026-08-12T09:00:00Z'),
        photoCount: 2,
        totalSizeMB: 4,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team A'
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

  test('builds a per-date team history for a selected employee', () => {
    const entries = [
      {
        title: 'Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T08:00:00Z'),
        photoCount: 5,
        totalSizeMB: 12.5,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team A'
      },
      {
        title: 'Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-11T08:00:00Z'),
        photoCount: 2,
        totalSizeMB: 4,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team B'
      },
      {
        title: 'Upload by redadmin@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T09:00:00Z'),
        photoCount: 1,
        totalSizeMB: 3,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team A'
      }
    ];

    const history = buildEmployeeTeamHistory(entries as any, 'sbaumgartner@baumgartnerfenster.ch');

    expect(history).toEqual([
      expect.objectContaining({ user: 'sbaumgartner@baumgartnerfenster.ch', team: 'Team B', date: '2026-08-11' }),
      expect.objectContaining({ user: 'sbaumgartner@baumgartnerfenster.ch', team: 'Team A', date: '2026-08-10' })
    ]);
  });

  test('counts distinct posts by day and team for one employee', () => {
    const entries = [
      {
        title: 'Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T08:00:00Z'),
        photoCount: 12,
        totalSizeMB: 22,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team A'
      },
      {
        title: 'Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T09:00:00Z'),
        photoCount: 4,
        totalSizeMB: 8,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team B'
      },
      {
        title: 'Upload by sbaumgartner@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T10:00:00Z'),
        photoCount: 7,
        totalSizeMB: 14,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team A'
      },
      {
        title: 'Upload by redadmin@baumgartnerfenster.ch',
        logtime: new Date('2026-08-10T11:00:00Z'),
        photoCount: 2,
        totalSizeMB: 4,
        status: 'Success' as const,
        errorMessage: '',
        targetTeam: 'Team A'
      }
    ];

    const chartData = buildDailyTeamPostChart(entries as any, 'sbaumgartner@baumgartnerfenster.ch');

    expect(chartData).toEqual([
      expect.objectContaining({
        date: '2026-08-10',
        'Team A': 2,
        'Team B': 1
      })
    ]);
  });

  test('groups extra teams into a compact Other bucket for the chart', () => {
    const entries = [
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-10T08:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team A' },
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-10T09:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team B' },
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-10T10:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team C' },
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-11T10:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team D' },
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-11T11:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team E' },
    ];

    const chartData = buildDailyTeamPostChart(entries as any, 'sbaumgartner@baumgartnerfenster.ch', 2);

    expect(chartData).toEqual([
      expect.objectContaining({ date: '2026-08-10', 'Team A': 1, 'Team B': 1, Sonstige: 1 }),
      expect.objectContaining({ date: '2026-08-11', Sonstige: 2 })
    ]);
  });

  test('builds a per-date employee chart when a team is selected', () => {
    const entries = [
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-10T08:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team A' },
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-10T09:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team A' },
      { title: 'Upload by redadmin@baumgartnerfenster.ch', logtime: new Date('2026-08-10T10:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team A' },
      { title: 'Upload by redadmin@baumgartnerfenster.ch', logtime: new Date('2026-08-11T10:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team B' },
      { title: 'Upload by sbaumgartner@baumgartnerfenster.ch', logtime: new Date('2026-08-11T11:00:00Z'), photoCount: 1, totalSizeMB: 1, status: 'Success' as const, errorMessage: '', targetTeam: 'Team B' },
    ];

    const chartData = buildDailyTeamPersonChart(entries as any, 'Team A');

    expect(chartData).toEqual([
      expect.objectContaining({ date: '2026-08-10', 'sbaumgartner@baumgartnerfenster.ch': 2, 'redadmin@baumgartnerfenster.ch': 1 }),
    ]);
  });
});
