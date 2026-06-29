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
    if (entry.responseBody) parts.push(`responseBody=${entry.responseBody}`);

    return parts.join(' | ');
};

export const logToSharePoint = async (accessToken: string, entry: LogEntry): Promise<LogWriteResult> => {
    // Lokale Zeit berechnen (Browser-Zeit)
    const now = new Date();
    // Zeitzonen-Offset abziehen (Offset ist negativ für UTC+1, daher minus mal minus = plus)
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    // Formatieren zu "YYYY-MM-DD HH:mm:ss"
    const localTimeString = localDate.toISOString().slice(0, 19).replace('T', ' ');

    const item = {
        fields: {
            Title: `${entry.correlationId ? `[${entry.correlationId}] ` : ''}Upload by ${entry.userEmail}`,
            SourceUrl: entry.sourceUrl,
            Logtime: localTimeString,
            PhotoCount: entry.photoCount,
            TotalSizeMB: entry.totalSizeMB,
            TargetTeam: entry.targetTeamName,
            Status: entry.status,
            ErrorMessage: buildDiagnosticMessage(entry)
        }
    };

    try {
        const response = await fetch(`https://graph.microsoft.com/v1.0/sites/${LOG_SITE_ID}/lists/${LOG_LIST_ID}/items`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(item)
        });
        
        if (!response.ok) {
            const errText = await response.text();
            console.error(`[${entry.correlationId || 'no-correlation'}] Logging failed (API Error):`, response.status, errText);
            return {
                ok: false,
                status: response.status,
                body: errText,
            };
        } else {
            console.log(`[${entry.correlationId || 'no-correlation'}] Log entry created successfully.`);
            return { ok: true };
        }
    } catch (e) {
        // Fallback: Wenn Logging fehlschlägt, nur Konsole (damit die App nicht abstürzt)
        console.error(`[${entry.correlationId || 'no-correlation'}] Logging failed (Network/Code):`, e);
        return {
            ok: false,
            body: e instanceof Error ? e.message : String(e),
        };
    }
};