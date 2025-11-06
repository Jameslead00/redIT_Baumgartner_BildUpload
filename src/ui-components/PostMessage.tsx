export const postMessageToChannel = async (
    accessToken: string,
    teamId: string,
    channelId: string,
    customText: string,
    imageUrls: string[]
): Promise<void> => {
    const adaptiveCard = {
        type: "AdaptiveCard",
        version: "1.2",
        body: [
            {
                type: "TextBlock",
                text: customText || "New images uploaded!",
                weight: "Bolder",
                size: "Medium",
            },
            {
                type: "ImageSet",
                imageSize: "Large",  // Setzt die Grösse für alle Bilder im Set auf Large
                images: imageUrls.map((url) => ({
                    type: "Image",
                    url: url,
                    selectAction: {
                        type: "Action.OpenUrl",
                        url: url,  // Klickbar zur Vorschau in SharePoint
                    },
                })),
            },
        ],
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