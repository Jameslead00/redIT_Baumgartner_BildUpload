import React from 'react';
import i18n from '../i18n/i18n';

// Teams/Graph message payloads with hostedContents fail well below unlimited sizes.
// Keep a conservative safety margin, but large enough that normal image previews still render.
const MAX_MESSAGE_PAYLOAD_BYTES = 3.5 * 1024 * 1024;

// Interface für Benutzer-Erwähnungen
export interface MentionUser {
    id: string;
    displayName: string;
    position?: string;
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

interface HostedContent {
    "@microsoft.graph.temporaryId": string;
    contentBytes: string;
    contentType: string;
}

interface FileEntry {
    file: File;
    oneDriveUrl: string;
    hostedContent: HostedContent | null;
}

interface UploadEntry {
    file: File;
    oneDriveUrl: string;
}

// Füge Interfaces für Adaptive Card-Elemente hinzu
interface AdaptiveCardElement {
    type: string;
}

interface TextBlock extends AdaptiveCardElement {
    type: "TextBlock";
    text: string;
    weight?: string;
    size?: string;
}

interface Image extends AdaptiveCardElement {
    type: "Image";
    url: string;
    size?: string;
    selectAction?: {
        type: "Action.OpenUrl";
        url: string;
    };
}

// Hilfsfunktion, um Bild von URL zu laden und als base64 zu encoden (mit Auth)
const loadImageAsBase64 = async (url: string, accessToken: string): Promise<string> => {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Hilfsfunktion: Bild für Hosted Content vorbereiten (Resize + Raw Base64)
const prepareImageForHostedContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            
            // Max Größe für Display (z.B. 1024px), um Request-Größe klein zu halten (<4MB total)
            const maxDim = 1024; 
            let { width, height } = img;
            
            if (width > height) {
                if (width > maxDim) {
                    height = (height * maxDim) / width;
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width = (width * maxDim) / height;
                    height = maxDim;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Zu Blob und dann Base64 (ohne Prefix)
            canvas.toBlob((blob) => {
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        // Entferne "data:image/jpeg;base64," Prefix
                        resolve(result.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                } else {
                    reject(new Error('Canvas toBlob failed'));
                }
            }, 'image/jpeg', 0.6); // Gute Qualität für Anzeige
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
};

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

export const QUALITY_TEAM_ID = '21e376dd-06ad-4b61-8cf8-37aa8a0cb9fa';

export const shouldMirrorToQualityTeam = (teamId?: string, enabled = false): boolean => {
    return Boolean(enabled && teamId && teamId !== QUALITY_TEAM_ID);
};

export const postMessageToQualityTeamMirror = async (
    accessToken: string,
    customText: string,
    imageUrls: string[] = [],
    files: File[] = [],
    mentions: MentionUser[] = [],
    options?: { correlationId?: string; teamId?: string }
): Promise<void> => {
    const correlationId = options?.correlationId || 'no-correlation';
    const teamId = options?.teamId || QUALITY_TEAM_ID;
    const safeText = customText && customText.trim() ? customText : (i18n as any).t('postMessage.newFilesUploaded');

    const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!channelsResponse.ok) {
        const responseText = await channelsResponse.text();
        throw new Error(`[${correlationId}] Failed to load channels for quality-team mirror: ${channelsResponse.status} ${responseText}`);
    }

    const channelsData = await channelsResponse.json();
    const channels = Array.isArray(channelsData?.value) ? channelsData.value : [];
    const generalChannel = channels.find((channel: any) => (channel.displayName || '').toLowerCase() === 'general');

    if (!generalChannel?.id) {
        throw new Error(`[${correlationId}] Could not find the General channel for quality-team mirror in team ${teamId}`);
    }

    const validMentions = [] as MentionUser[];
    const mentionEntities = [] as Array<{
        id: number;
        mentionText: string;
        mentioned: {
            user: {
                id: string;
                displayName: string;
                userIdentityType: string;
            };
        };
    }>;

    const mentionsHtml = '';
    const validUploads = dedupeUploadEntries(
        files.map((file, index) => ({
            file,
            oneDriveUrl: (imageUrls && imageUrls[index]) || '#',
        }))
    );

    const fileEntries: FileEntry[] = [];
    let omittedImageCount = 0;

    for (const { file, oneDriveUrl } of validUploads) {
        if (!isImageFile(file)) {
            fileEntries.push({
                file,
                oneDriveUrl,
                hostedContent: null,
            });
            continue;
        }

        const contentBytes = await prepareImageForHostedContent(file);
        const candidateEntry: FileEntry = {
            file,
            oneDriveUrl,
            hostedContent: {
                '@microsoft.graph.temporaryId': (fileEntries.filter((entry) => entry.hostedContent).length + 1).toString(),
                contentBytes,
                contentType: file.type || 'image/jpeg',
            },
        };

        const tentativePayload = buildMessagePayload(
            safeText,
            [...fileEntries, candidateEntry],
            mentionEntities,
            mentionsHtml,
            omittedImageCount
        );

        if (getPayloadSize(tentativePayload) <= MAX_MESSAGE_PAYLOAD_BYTES) {
            fileEntries.push(candidateEntry);
        } else {
            omittedImageCount += 1;
        }
    }

    const payload = buildMessagePayload(
        safeText,
        fileEntries,
        mentionEntities,
        mentionsHtml,
        omittedImageCount
    );

    const response = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${generalChannel.id}/messages`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`[${correlationId}] Failed to post quality-team mirror message: ${response.status} ${responseText}`);
    }
};

const toSharePointLibraryFolderUrl = (url: string): string => {
    if (!url || url === '#') return url;

    const normalized = url.split('?')[0].split('#')[0];
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 'https://'.length) {
        return url;
    }

    // Hosted images should link to the containing SharePoint folder/library view
    // instead of direct file URLs to avoid additional media-unfurl behavior.
    return normalized.substring(0, lastSlash);
};

const dedupeUploadEntries = (entries: UploadEntry[]): UploadEntry[] => {
    const seen = new Set<string>();
    const unique: UploadEntry[] = [];

    for (const entry of entries) {
        const signature = [
            entry.file.name,
            entry.file.size,
            entry.file.lastModified,
            entry.oneDriveUrl,
        ].join('|');

        if (seen.has(signature)) {
            continue;
        }

        seen.add(signature);
        unique.push(entry);
    }

    return unique;
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
    mentionsHtml: string,
    omittedImageCount: number
) => {
    const filesHtml = fileEntries.length > 0 ? fileEntries.map((entry, index) => {
        if (entry.hostedContent) {
            const id = entry.hostedContent["@microsoft.graph.temporaryId"];
            return `
                <div style="margin-bottom: 16px;">
                    <img src="../hostedContents/${id}/$value" style="max-width: 100%; width: auto; border-radius: 4px; display: block;" alt="Image ${index + 1}">
                    <div style="margin-top: 4px;">
                        <a href="${toSharePointLibraryFolderUrl(entry.oneDriveUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #5b5fc7; text-decoration: none;">
                            ${(i18n as any).t('postMessage.viewOriginal')}
                        </a>
                    </div>
                </div>`;
        }

        const displayUrl = isVideoFile(entry.file) ? toVideoStreamUrl(entry.oneDriveUrl) : entry.oneDriveUrl;
        return `
            <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #d1d5db; border-radius: 4px;">
                <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">${escapeHtml(entry.file.name)}</div>
                <a href="${displayUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #5b5fc7; text-decoration: none;">
                    ${(i18n as any).t('postMessage.viewFile')}
                </a>
            </div>`;
    }).join('') : '';

    const textContent = mentionsHtml
        ? `<p>${mentionsHtml} ${escapeHtml(customText || "")}</p>`
        : `<p style="font-size: 14px; font-weight: bold; margin-bottom: 12px;">${escapeHtml(customText || (i18n as any).t('postMessage.newFilesUploaded'))}</p>`;

    const omittedImagesHtml = omittedImageCount > 0
        ? `<p style="margin: 12px 0 16px; font-size: 13px; color: #6b7280;">${escapeHtml((i18n as any).t('postMessage.inlineImageLimitNotice', { count: omittedImageCount }))}</p>`
        : '';

    return {
        body: {
            contentType: "html",
            content: `
                <div>
                    ${textContent}
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${filesHtml}
                    </div>
                    ${omittedImagesHtml}
                </div>
            `
        },
        hostedContents: fileEntries
            .filter((entry) => entry.hostedContent)
            .map((entry) => entry.hostedContent),
        mentions: mentionEntities
    };
};

const getPayloadSize = (payload: unknown): number => new Blob([JSON.stringify(payload)]).size;

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
    let omittedImageCount = 0;

    if (files && files.length > 0) {
        const uploads = dedupeUploadEntries(
            files.map((file, index) => ({
                file,
                oneDriveUrl: (imageUrls && imageUrls[index]) || '#',
            }))
        );

        for (const { file, oneDriveUrl } of uploads) {

            if (!isImageFile(file)) {
                fileEntries.push({
                    file,
                    oneDriveUrl,
                    hostedContent: null,
                });
                continue;
            }

            const contentBytes = await prepareImageForHostedContent(file);
            const candidateEntry: FileEntry = {
                file,
                oneDriveUrl,
                hostedContent: {
                    "@microsoft.graph.temporaryId": (fileEntries.filter((entry) => entry.hostedContent).length + 1).toString(),
                    contentBytes,
                    contentType: file.type || "image/jpeg"
                }
            };

            const tentativePayload = buildMessagePayload(
                customText,
                [...fileEntries, candidateEntry],
                mentionEntities,
                mentionsHtml,
                omittedImageCount
            );

            if (getPayloadSize(tentativePayload) <= MAX_MESSAGE_PAYLOAD_BYTES) {
                fileEntries.push(candidateEntry);
            } else {
                omittedImageCount += 1;
            }
        }
    }

    const messagePayload = buildMessagePayload(
        customText,
        fileEntries,
        mentionEntities,
        mentionsHtml,
        omittedImageCount
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