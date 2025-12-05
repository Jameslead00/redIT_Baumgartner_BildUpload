export interface LogEntry {
    userEmail: string;
    sourceUrl: string;
    photoCount: number;
    totalSizeMB: number;
    targetTeamName: string;
    status: 'Success' | 'Error';
    errorMessage?: string;
}

// Konfiguration
const LOG_SITE_ID = "baumgartnerfensterag.sharepoint.com,35792666-559f-437e-9570-c2b56718a6f7,5936e718-30c3-4cec-a27e-3fe2e1cf9514"; 
const LOG_LIST_ID = "46579bc0-c762-4652-bcd8-e7c67eae8799";

export const logToSharePoint = async (accessToken: string, entry: LogEntry) => {
    // Lokale Zeit berechnen (Browser-Zeit)
    const now = new Date();
    // Zeitzonen-Offset abziehen (Offset ist negativ für UTC+1, daher minus mal minus = plus)
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    // Formatieren zu "YYYY-MM-DD HH:mm:ss"
    const localTimeString = localDate.toISOString().slice(0, 19).replace('T', ' ');

    const item = {
        fields: {
            Title: `Upload by ${entry.userEmail}`,
            SourceUrl: window.location.href,
            Logtime: localTimeString,
            PhotoCount: entry.photoCount,
            TotalSizeMB: entry.totalSizeMB,
            TargetTeam: entry.targetTeamName,
            Status: entry.status,
            ErrorMessage: entry.errorMessage || ""
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
            console.error("Logging failed (API Error):", response.status, errText);
        } else {
            console.log("Log entry created successfully.");
        }
    } catch (e) {
        // Fallback: Wenn Logging fehlschlägt, nur Konsole (damit die App nicht abstürzt)
        console.error("Logging failed (Network/Code):", e);
    }
};