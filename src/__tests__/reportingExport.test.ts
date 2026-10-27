import * as XLSX from 'xlsx';
import {
  buildReportingExportFilename,
  buildReportingExportRows,
  buildReportingWorkbook,
  extractEmailFromTitle,
  LOGTIME_EXCEL_FORMAT,
  REPORTING_EXPORT_HEADERS,
} from '../utils/reportingExport';
import type { ParsedLogEntry } from '../pages/StatsPage';

const entries: ParsedLogEntry[] = [
  {
    title: '[abc123] Upload by SBaumgartner@baumgartnerfenster.ch',
    logtime: new Date(2026, 8, 25, 14, 5, 9),
    photoCount: 5,
    totalSizeMB: 12.3456,
    status: 'Success',
    errorMessage: '',
    targetTeam: 'Team A',
  },
  {
    title: 'something else',
    logtime: new Date(0),
    photoCount: 0,
    totalSizeMB: 0,
    status: 'Error',
    errorMessage: 'message=Upload failed',
    targetTeam: 'Unbekannt',
  },
];

describe('reportingExport', () => {
  test('extracts the e-mail address from the SharePoint title', () => {
    expect(extractEmailFromTitle('[abc123] Upload by sbaumgartner@baumgartnerfenster.ch')).toBe('sbaumgartner@baumgartnerfenster.ch');
    expect(extractEmailFromTitle('no mail here')).toBe('');
    expect(extractEmailFromTitle(undefined)).toBe('');
  });

  test('builds export rows with a separate e-mail column and a Date logtime', () => {
    const rows = buildReportingExportRows(entries);

    expect(rows[0]).toEqual({
      Logtime: entries[0].logtime,
      'E-Mail': 'sbaumgartner@baumgartnerfenster.ch',
      Titel: '[abc123] Upload by SBaumgartner@baumgartnerfenster.ch',
      Fotos: 5,
      MB: 12.35,
      Status: 'Success',
      Fehlermeldung: '',
      Team: 'Team A',
    });
    expect(rows[1].Logtime).toBeNull();
    expect(rows[1]['E-Mail']).toBe('');
  });

  test('writes Logtime as a formatted date-time cell, not a plain number', () => {
    const workbook = buildReportingWorkbook(entries);
    const sheet = workbook.Sheets['Upload-Log'];

    const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0];
    expect(headerRow).toEqual([...REPORTING_EXPORT_HEADERS]);

    const logtimeCell = sheet['A2'];
    expect(logtimeCell.t).toBe('d');
    expect(logtimeCell.z).toBe(LOGTIME_EXCEL_FORMAT);
    expect((logtimeCell.v as Date).getTime()).toBe(entries[0].logtime.getTime());

    // Round-trip through the xlsx writer to make sure Excel gets a date-time, not a serial number
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellDates: true });
    const reread = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: true });
    const rereadCell = reread.Sheets['Upload-Log']['A2'];
    expect(rereadCell.t).toBe('d');
    expect(rereadCell.z).toBe(LOGTIME_EXCEL_FORMAT);
    expect(XLSX.SSF.format(rereadCell.z, rereadCell.v)).toBe('25.09.2026 14:05:09');
    expect(reread.Sheets['Upload-Log']['B2'].v).toBe('sbaumgartner@baumgartnerfenster.ch');
  });

  test('builds a timestamped filename', () => {
    expect(buildReportingExportFilename(new Date(2026, 8, 25, 9, 7))).toBe('upload-log_2026-09-25_0907.xlsx');
  });
});
