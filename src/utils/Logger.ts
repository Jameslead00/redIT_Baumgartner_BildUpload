export interface LogEntry {
    userEmail: string;
    sourceUrl: string;
    photoCount: number;
    totalSizeMB: number;
    targetTeamName: string;
    status: 'Success' | 'Error';
    errorMessage?: string;
    correlationId?: string;
    step?: string;
    teamId?: string;
    channelId?: string;
    channelDisplayName?: string;
    folderPath?: string;
    operation?: string;
    httpStatus?: number;
    httpStatusText?: string;
    responseBody?: string;
}

export interface LogWriteResult {
    ok: boolean;
    status?: number;
    body?: string;
}

// Konfiguration
export const LOG_SITE_ID = "baumgartnerfensterag.sharepoint.com,35792666-559f-437e-9570-c2b56718a6f7,5936e718-30c3-4cec-a27e-3fe2e1cf9514"; 
export const LOG_LIST_ID = "46579bc0-c762-4652-bcd8-e7c67eae8799";

export const PENDING_LOGS_KEY = 'pendingAppLogs';
const MAX_PENDING_LOGS = 50;
const MAX_RESPONSE_BODY_CHARS = 1500;
const MAX_MESSAGE_CHARS = 4000;
// SharePoint "Single line of text" columns reject anything longer than this.
const SHORT_MESSAGE_CHARS = 255;

const truncate = (value: string, max: number): string =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;

const buildDiagnosticMessage = (entry: LogEntry): string => {
    const parts: string[] = [];

    if (entry.errorMessage) parts.push(`message=${entry.errorMessage}`);
    if (entry.correlationId) parts.push(`correlationId=${entry.correlationId}`);
    if (entry.step) parts.push(`step=${entry.step}`);
    if (entry.operation) parts.push(`operation=${entry.operation}`);
    if (entry.teamId) parts.push(`teamId=${entry.teamId}`);
    if (entry.channelId) parts.push(`channelId=${entry.channelId}`);
    if (entry.channelDisplayName) parts.push(`channelDisplayName=${entry.channelDisplayName}`);
    if (entry.folderPath) parts.push(`folderPath=${entry.folderPath}`);
    if (typeof entry.httpStatus === 'number') parts.push(`httpStatus=${entry.httpStatus}`);
    if (entry.httpStatusText) parts.push(`httpStatusText=${entry.httpStatusText}`);
    if (entry.responseBody) parts.push(`responseBody=${truncate(entry.responseBody, MAX_RESPONSE_BODY_CHARS)}`);

    return truncate(parts.join(' | '), MAX_MESSAGE_CHARS);
};

const readPendingLogs = (): LogEntry[] => {
    try {
        const raw = localStorage.getItem(PENDING_LOGS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e): e is LogEntry => !!e && typeof e === 'object' && typeof e.userEmail === 'string' && typeof e.status === 'string');
    } catch {
        return [];
    }
};

const writePendingLogs = (entries: LogEntry[]): void => {
    try {
        localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(entries.slice(-MAX_PENDING_LOGS)));
    } catch (e) {
        console.error('Pending AppLog konnte nicht lokal gespeichert werden:', e);
    }
};

// Für Fehler, bei denen kein Token verfügbar ist oder der Log-Write fehlschlägt; wird beim nächsten erfolgreichen Log nachgereicht.
export const queuePendingLog = (entry: LogEntry): void => {
    console.warn(`[${entry.correlationId || 'no-correlation'}] AppLog wird lokal zwischengespeichert:`, entry.step, entry.errorMessage);
    writePendingLogs([...readPendingLogs(), { ...entry, errorMessage: `[queued] ${entry.errorMessage || ''}`.trim() }]);
};

const isRetryable = (status?: number): boolean =>
    status === undefined || status === 429 || status >= 500;

const buildItem = (entry: LogEntry, message: string) => {
    const now = new Date();
    // Zeitzonen-Offset abziehen (Offset ist negativ für UTC+1, daher minus mal minus = plus)
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const localTimeString = localDate.toISOString().slice(0, 19).replace('T', ' ');
    return {
        fields: {
            Title: `${entry.correlationId ? `[${entry.correlationId}] ` : ''}Upload by ${entry.userEmail}`,
            SourceUrl: entry.sourceUrl,
            Logtime: localTimeString,
            PhotoCount: entry.photoCount,
            TotalSizeMB: entry.totalSizeMB,
            TargetTeam: entry.targetTeamName,
            Status: entry.status,
            ErrorMessage: message
        }
    };
};

const postItem = async (accessToken: string, item: unknown): Promise<Response> =>
    fetch(`https://graph.microsoft.com/v1.0/sites/${LOG_SITE_ID}/lists/${LOG_LIST_ID}/items`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(item)
    });

const writeLogItem = async (accessToken: string, entry: LogEntry): Promise<LogWriteResult> => {
    const cid = entry.correlationId || 'no-correlation';
    const message = buildDiagnosticMessage(entry);
    try {
        let response = await postItem(accessToken, buildItem(entry, message));

        if (response.status === 400 && message.length > SHORT_MESSAGE_CHARS) {
            console.warn(`[${cid}] Logging rejected (400), retrying with shortened message.`);
            response = await postItem(accessToken, buildItem(entry, truncate(message, SHORT_MESSAGE_CHARS)));
        }

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[${cid}] Logging failed (API Error):`, response.status, errText);
            return { ok: false, status: response.status, body: errText };
        }
        console.log(`[${cid}] Log entry created successfully.`);
        return { ok: true };
    } catch (e) {
        console.error(`[${cid}] Logging failed (Network/Code):`, e);
        return { ok: false, body: e instanceof Error ? e.message : String(e) };
    }
};

export const flushPendingLogs = async (accessToken: string): Promise<void> => {
    const pending = readPendingLogs();
    if (pending.length === 0) return;
    const remaining: LogEntry[] = [];
    for (const entry of pending) {
        const result = await writeLogItem(accessToken, entry);
        if (!result.ok && isRetryable(result.status)) remaining.push(entry);
    }
    writePendingLogs(remaining);
};

export const logToSharePoint = async (accessToken: string, entry: LogEntry): Promise<LogWriteResult> => {
    const result = await writeLogItem(accessToken, entry);
    if (result.ok) {
        flushPendingLogs(accessToken).catch(e => console.error('Flush pending AppLogs failed:', e));
    } else if (isRetryable(result.status)) {
        queuePendingLog(entry);
    }
    return result;
};