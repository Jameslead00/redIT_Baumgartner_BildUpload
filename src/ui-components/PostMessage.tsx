import React from 'react';

// Interface für Benutzer-Erwähnungen
export interface MentionUser {
    id: string;
    displayName: string;
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
            }, 'image/jpeg', 0.8); // Gute Qualität für Anzeige
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

export const postMessageToChannel = async (
    accessToken: string,
    teamId: string,
    channelId: string,
    customText: string,
    imageUrls: string[],
    files: File[],
    mentions: MentionUser[] = [] 
): Promise<void> => {
    
    // 1. Hosted Contents vorbereiten
    const hostedContents = await Promise.all(files.map(async (file, index) => {
        const contentBytes = await prepareImageForHostedContent(file);
        return {
            "@microsoft.graph.temporaryId": (index + 1).toString(),
            "contentBytes": contentBytes,
            "contentType": "image/jpeg"
        };
    }));

    // 2. Mentions vorbereiten
    // WICHTIG: Filtere ungültige User ohne ID heraus, um Fehler zu vermeiden
    const validMentions = mentions.filter(u => u.id && u.displayName);

    const mentionEntities = validMentions.map((user, index) => ({
        id: index, // ID muss mit dem id im <at> Tag übereinstimmen (Integer im JSON)
        mentionText: user.displayName, // Plain Text im JSON
        mentioned: {
            user: {
                id: user.id,
                displayName: user.displayName,
                userIdentityType: "aadUser"
            }
        }
    }));

    // HTML für Mentions erstellen (z.B. "<at id="0">Max Mustermann</at>")
    // WICHTIG: escapeHtml nutzen, damit Sonderzeichen das Tag nicht brechen
    const mentionsHtml = validMentions.map((user, index) => `<at id="${index}">${escapeHtml(user.displayName)}</at>`).join(' ');

    // 3. HTML Body erstellen
    const imagesHtml = hostedContents.map((hc, index) => {
        const id = hc["@microsoft.graph.temporaryId"];
        const oneDriveUrl = imageUrls[index] || "#";
        return `
            <div style="margin-bottom: 16px;">
                <img src="../hostedContents/${id}/$value" style="max-width: 100%; width: auto; border-radius: 4px; display: block;" alt="Image ${index + 1}">
                <div style="margin-top: 4px;">
                    <a href="${oneDriveUrl}" target="_blank" style="font-size: 12px; color: #5b5fc7; text-decoration: none;">
                        Original anzeigen ↗
                    </a>
                </div>
            </div>`;
    }).join('');

    // Text zusammenbauen: Mentions vor dem eigentlichen Text
    // Wir nutzen <p> für den Text-Block
    const textContent = mentionsHtml 
        ? `<p>${mentionsHtml} ${escapeHtml(customText || "")}</p>` 
        : `<p style="font-size: 14px; font-weight: bold; margin-bottom: 12px;">${escapeHtml(customText || "New images uploaded!")}</p>`;

    const messagePayload = {
        body: {
            contentType: "html",
            content: `
                <div>
                    ${textContent}
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${imagesHtml}
                    </div>
                </div>
            `
        },
        hostedContents: hostedContents,
        mentions: mentionEntities // Mentions zur Payload hinzufügen
    };

    // 4. Senden
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
        throw new Error(`Failed to post message to channel: ${messageResponse.status} ${responseText}`);
    }
};