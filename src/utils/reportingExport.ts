import * as XLSX from "xlsx";
import { parseUserFromTitle } from "../pages/StatsPage";
import type { ParsedLogEntry } from "../pages/StatsPage";

export const REPORTING_EXPORT_HEADERS = [
    "Logtime",
    "E-Mail",
    "Titel",
    "Fotos",
    "MB",
    "Status",
    "Fehlermeldung",
    "Team",
] as const;

export type ReportingExportRow = {
    Logtime: Date | null;
    "E-Mail": string;
    Titel: string;
    Fotos: number;
    MB: number;
    Status: string;
    Fehlermeldung: string;
    Team: string;
};

// Excel number format so Logtime shows as date-time instead of a serial number (dots escaped, otherwise read as fractional seconds)
export const LOGTIME_EXCEL_FORMAT = "dd\\.mm\\.yyyy hh:mm:ss";

export function extractEmailFromTitle(title?: string): string {
    const user = parseUserFromTitle(title);
    return user === "unknown" ? "" : user;
}

export function buildReportingExportRows(entries: ParsedLogEntry[]): ReportingExportRow[] {
    return entries.map((entry) => ({
        Logtime: entry.logtime.getTime() > 0 ? entry.logtime : null,
        "E-Mail": extractEmailFromTitle(entry.title),
        Titel: entry.title,
        Fotos: entry.photoCount,
        MB: Math.round(entry.totalSizeMB * 100) / 100,
        Status: entry.status,
        Fehlermeldung: entry.errorMessage,
        Team: entry.targetTeam,
    }));
}

export function buildReportingWorkbook(entries: ParsedLogEntry[]): XLSX.WorkBook {
    const rows = buildReportingExportRows(entries);
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [...REPORTING_EXPORT_HEADERS], cellDates: true });

    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: 0 });
        const cell = sheet[address];
        if (cell && cell.t === "d") {
            cell.z = LOGTIME_EXCEL_FORMAT;
        }
    }

    sheet["!cols"] = [
        { wch: 20 }, // Logtime
        { wch: 36 }, // E-Mail
        { wch: 60 }, // Titel
        { wch: 8 },  // Fotos
        { wch: 10 }, // MB
        { wch: 10 }, // Status
        { wch: 80 }, // Fehlermeldung
        { wch: 30 }, // Team
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Upload-Log");
    return workbook;
}

export function buildReportingExportFilename(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `upload-log_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
}

export function downloadReportingXlsx(entries: ParsedLogEntry[]): void {
    const workbook = buildReportingWorkbook(entries);
    XLSX.writeFile(workbook, buildReportingExportFilename(), { cellDates: true });
}
