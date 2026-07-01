import i18n from '../i18n/i18n';

// Interface für Benutzer-Erwähnungen
export interface MentionUser {
    id: string;
    displayName: string;
}

const isImageFile = (file: File): boolean => file.type.startsWith('image/');

const VIDEO_MIME_TYPES = new Set([
    'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi',
    'video/msvideo', 'video/webm', 'video/x-matroska',
]);
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv'];

const isVideoFile = (file: File): boolean => {
    if (VIDEO_MIME_TYPES.has(file.type)) return true;
    const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
};

// Converts a raw SharePoint file URL to the SharePoint Stream viewer URL so
// videos open inline instead of triggering a browser download.
// Uses string/regex to avoid dependency on the URL constructor (which may be
// unavailable in certain test environments).
const toVideoStreamUrl = (webUrl: string): string => {
    const match = webUrl.match(/^(https?:\/\/[^/]+)(\/sites\/[^/]+)(\/.*)?$/);
    if (!match) return webUrl;
    const [, origin, sitePath, filePath = ''] = match;
    const fullDecodedPath = decodeURIComponent(sitePath + filePath);
    return `${origin}${sitePath}/_layouts/15/stream.aspx?id=${encodeURIComponent(fullDecodedPath)}`;
};

interface FileEntry {
    file: File;
    oneDriveUrl: string;
};

interface HostedContent {
    "@microsoft.graph.temporaryId": string;
    contentBytes: string;
    contentType: string;
}

// Hilfsfunktion für HTML Escaping (WICHTIG für Namen mit Sonderzeichen)
const escapeHtml = (str: string) => {
    return str.replace(/[&<>"']/g, (m) => {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return m;
        }
    });
};

const buildMessagePayload = (
    customText: string,
    fileEntries: FileEntry[],
    mentionEntities: Array<{
        id: number;
        mentionText: string;
        mentioned: {
            user: {
                id: string;
                displayName: string;
                userIdentityType: string;
            };
        };
    }>,
    mentionsHtml: string
) => {
    const filesHtml = fileEntries.length > 0 ? fileEntries.map((entry, index) => {
        if (isImageFile(entry.file)) {
            return `
                <div style="margin-bottom: 16px;">
                    <a href="${entry.oneDriveUrl}" target="_blank" style="font-size: 12px; color: #5b5fc7; text-decoration: none;">
                        ${(i18n as any).t('postMessage.viewOriginal')}
                    </a>
                </div>`;
        }

        const displayUrl = isVideoFile(entry.file) ? toVideoStreamUrl(entry.oneDriveUrl) : entry.oneDriveUrl;
        return `
            <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #d1d5db; border-radius: 4px;">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(entry.file.name)}</div>
                <a href="${displayUrl}" target="_blank" style="font-size: 12px; color: #5b5fc7; text-decoration: none;">
                    ${(i18n as any).t('postMessage.viewFile')}
                </a>
            </div>`;
    }).join('') : '';

    const textContent = mentionsHtml
        ? `<p>${mentionsHtml} ${escapeHtml(customText || "")}</p>`
        : `<p style="font-size: 14px; font-weight: bold; margin-bottom: 12px;">${escapeHtml(customText || (i18n as any).t('postMessage.newFilesUploaded'))}</p>`;

    return {
        body: {
            contentType: "html",
            content: `
                <div>
                    ${textContent}
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${filesHtml}
                    </div>
                </div>
            `
        },
        hostedContents: [] as HostedContent[],
        mentions: mentionEntities
    };
};

export const postMessageToChannel = async (
    accessToken: string,
    teamId: string,
    channelId: string,
    customText: string,
    imageUrls?: string[],
    files?: File[],
    mentions: MentionUser[] = [],
    options?: { correlationId?: string }
): Promise<void> => {
    const correlationId = options?.correlationId || 'no-correlation';
    const validMentions = mentions.filter(u => u.id && u.displayName);

    const mentionEntities = validMentions.map((user, index) => ({
        id: index,
        mentionText: user.displayName,
        mentioned: {
            user: {
                id: user.id,
                displayName: user.displayName,
                userIdentityType: "aadUser"
            }
        }
    }));

    const mentionsHtml = validMentions.map((user, index) => `<at id="${index}">${escapeHtml(user.displayName)}</at>`).join(' ');
    const fileEntries: FileEntry[] = [];

    if (files && files.length > 0) {
        for (const [index, file] of files.entries()) {
            const oneDriveUrl = (imageUrls && imageUrls[index]) || "#";

            fileEntries.push({
                file,
                oneDriveUrl,
            });
        }
    }

    const messagePayload = buildMessagePayload(
        customText,
        fileEntries,
        mentionEntities,
        mentionsHtml
    );

    const messageResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(messagePayload),
    });
    
    if (!messageResponse.ok) {
        const responseText = await messageResponse.text();
        throw new Error(`[${correlationId}] Failed to post message to channel: ${messageResponse.status} ${responseText}`);
    }
};