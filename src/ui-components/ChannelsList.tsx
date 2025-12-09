import React, { useEffect, useState } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import ImageUpload from "./ImageUpload";
import { Grid, Card, CardActionArea, CardContent, Typography, Box } from "@mui/material";
import { SubFolder } from '../db'; // Import SubFolder

interface Team {
    id: string;
    displayName: string;
}

interface Channel {
    id: string;
    displayName: string;
}

interface ChannelsListProps {
    team: Team;
    onChannelSelect: (channel: Channel | null) => void;
    onUploadSuccess: (urls: string[], files?: File[], base64Images?: string[]) => void;
    onCustomTextChange: (text: string) => void;
    customText: string;
    isFavorite: boolean;
    cachedChannels?: Channel[];  // Neue Prop für gecachte Kanäle
    onSaveOffline?: (files: File[]) => void;  // Füge onSaveOffline Prop hinzu
    cachedSubFolders?: { [channelId: string]: SubFolder[] }; // New Prop
}

const ChannelsList: React.FC<ChannelsListProps> = ({
    team,
    onChannelSelect,
    onUploadSuccess,
    onCustomTextChange,
    customText,
    isFavorite,
    cachedChannels = [],  // Default leer
    onSaveOffline,
    cachedSubFolders = {}, // Default empty
}) => {
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Online-Status überwachen
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const fetchChannels = async () => {
            if (!account || !isOnline) {
                setChannels(cachedChannels);  // Verwende gecachte Kanäle, wenn offline oder nicht eingeloggt
                setLoading(false);
                return;
            }

            const request = { ...loginRequest, account };

            try {
                const response = await instance.acquireTokenSilent(request);
                const accessToken = response.accessToken;

                const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (graphResponse.ok) {
                    const data = await graphResponse.json();
                    setChannels(data.value);
                } else {
                    setError("Failed to fetch channels");
                }
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    instance.acquireTokenPopup(request).then((response) => {
                        const accessToken = response.accessToken;
                        fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        }).then((res) => res.json()).then((data) => setChannels(data.value));
                    });
                } else {
                    setError("Error fetching channels");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchChannels();
    }, [instance, account, team.id, isOnline, cachedChannels]);

    const handleChannelSelect = (channel: Channel) => {
        setSelectedChannel(channel);
        onChannelSelect(channel);
    };

    if (loading && account && isOnline) return <Typography variant="h6">Loading channels...</Typography>;  // Nur laden, wenn account und online
    if (error) return <Typography variant="h6" color="error">Error: {error}</Typography>;

    return (
        <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
                Kanal auswählen ({isOnline && account ? 'Online' : 'Offline gecacht'})
            </Typography>
            <Grid container spacing={2}>
                {channels.map((channel) => (
                    <Grid item xs={12} sm={6} md={4} key={channel.id}>
                        <Card
                            sx={{
                                cursor: 'pointer',
                                border: selectedChannel?.id === channel.id ? '2px solid #007aff' : '1px solid #ddd',
                                transition: 'all 0.3s ease'
                            }}
                            onClick={() => handleChannelSelect(channel)}
                        >
                            <CardActionArea>
                                <CardContent>
                                    <Box>
                                        <Typography variant="subtitle1" component="div">
                                            {channel.displayName}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid>
                ))}
            </Grid>
            {selectedChannel && (
                <ImageUpload
                    team={team}
                    channel={selectedChannel}
                    onUploadSuccess={onUploadSuccess}
                    onCustomTextChange={onCustomTextChange}
                    customText={customText}
                    onSaveOffline={onSaveOffline}
                    // Pass cached subfolders for this specific channel
                    cachedSubFolders={cachedSubFolders[selectedChannel.id] || []}
                />
            )}
        </Box>
    );
};

export default ChannelsList;