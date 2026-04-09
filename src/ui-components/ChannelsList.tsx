import React, { useEffect, useMemo, useState } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import ImageUpload from "./ImageUpload";
import { Grid, Card, CardActionArea, CardContent, Typography, Box } from "@mui/material";
import { SubFolder } from '../db'; // Import SubFolder
import { useTranslation } from "react-i18next";

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
    onSaveOffline?: (files: File[], subFolder: string, onProgress?: (current: number, total: number) => void) => Promise<void> | void;
    cachedSubFolders?: { [channelId: string]: SubFolder[] }; // New Prop
    cachedAllChannels?: Channel[]; // Neue Prop für alle gecachten Kanäle
    cachedAllSubFolders?: { [channelId: string]: SubFolder[] }; // Neue Prop für alle gecachten Subfolders
}

const EMPTY_CHANNELS: Channel[] = [];

const ChannelsList: React.FC<ChannelsListProps> = ({
    team,
    onChannelSelect,
    onUploadSuccess,
    onCustomTextChange,
    customText,
    isFavorite,
    cachedChannels = EMPTY_CHANNELS,
    onSaveOffline,
    cachedSubFolders = {}, // Default empty
    cachedAllChannels = EMPTY_CHANNELS,
    cachedAllSubFolders = {}, // Neue Prop
}) => {
    const { t } = useTranslation();
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const cachedChannelsKey = useMemo(() => cachedChannels.map((channel) => channel.id).join(','), [cachedChannels]);
    const cachedAllChannelsKey = useMemo(() => cachedAllChannels.map((channel) => channel.id).join(','), [cachedAllChannels]);
    const fallbackChannels = useMemo(
        () => (cachedChannels.length > 0 ? cachedChannels : cachedAllChannels),
        [cachedChannelsKey, cachedAllChannelsKey, cachedChannels, cachedAllChannels]
    );
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
            setError(null);
            setLoading(true);

            if (!account || !isOnline) {
                setChannels(fallbackChannels);
                setLoading(false);
                return;
            }

            const request = { ...loginRequest, account };

            const useFallbackOrError = (message: string) => {
                if (fallbackChannels.length > 0) {
                    setChannels(fallbackChannels);
                    setError(null);
                    return;
                }

                setChannels([]);
                setError(message);
            };

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
                    useFallbackOrError(t('channels.fetchChannelsFailure'));
                }
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    try {
                        const response = await instance.acquireTokenPopup(request);
                        const accessToken = response.accessToken;
                        const popupResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });

                        if (popupResponse.ok) {
                            const data = await popupResponse.json();
                            setChannels(data.value);
                        } else {
                            useFallbackOrError(t('channels.fetchChannelsFailure'));
                        }
                    } catch {
                        useFallbackOrError(t('channels.fetchChannelsError'));
                    }
                } else {
                    useFallbackOrError(t('channels.fetchChannelsError'));
                }
            } finally {
                setLoading(false);
            }
        };

        fetchChannels();
    }, [instance, account, team.id, isOnline, cachedChannelsKey, cachedAllChannelsKey]);

    const handleChannelSelect = (channel: Channel) => {
        setSelectedChannel(channel);
        onChannelSelect(channel);
    };

    if (loading && account && isOnline) return <Typography variant="h6">{t('channels.loadingChannels')}</Typography>;  // Nur laden, wenn account und online
    if (error) return <Typography variant="h6" color="error">{t('teams.errorPrefix')}{error}</Typography>;

    return (
        <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
                {t('channels.selectChannel')} ({isOnline && account ? t('teams.onlineStatus') : t('teams.offlineCached')})
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