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

export const postMessageToChannel = async (
    accessToken: string,
    teamId: string,
    channelId: string,
    customText: string,
    imageUrls: string[],
    base64Images?: string[]  // Neue Parameter
): Promise<void> => {
    const bodyElements: (TextBlock | Image)[] = [
        {
            type: "TextBlock",
            text: customText || "New images uploaded!",
            weight: "Bolder",
            size: "Medium",
        },
    ];

    // Verwende base64 für Thumbnails, URLs für Links
    imageUrls.forEach((url, index) => {
        const base64 = base64Images?.[index];
        bodyElements.push({
            type: "Image",
            url: base64 || url,
            size: "Large",  // Von "Medium" zu "Large" für maximale Größe
            selectAction: {
                type: "Action.OpenUrl",
                url: url,
            },
        });
    });

    const adaptiveCard = {
        type: "AdaptiveCard",
        version: "1.4",
        body: bodyElements,
    };

    const messageBody = {
        body: {
            contentType: "html",
            content: `<attachment id="adaptiveCard"></attachment>`,
        },
        attachments: [
            {
                id: "adaptiveCard",
                contentType: "application/vnd.microsoft.card.adaptive",
                content: JSON.stringify(adaptiveCard),
            },
        ],
    };

    const messageResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody),
    });
    
    if (!messageResponse.ok) {
        const responseText = await messageResponse.text();
        throw new Error(`Failed to post message to channel: ${messageResponse.status} ${responseText}`);
    }
};