import React, { useEffect, useState } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import ImageUpload from "./ImageUpload";
import { Grid, Card, CardContent, CardActionArea, Typography, Box, Alert } from "@mui/material";
import { Folder as FolderIcon } from "@mui/icons-material";

interface Team {
    id: string;
    displayName: string;
}

interface Channel {
    id: string;
    displayName: string;
    teamId?: string;
}

interface ChannelsListProps {
    team: Team;
    onChannelSelect: (channel: Channel) => void;
    onUploadSuccess: (urls: string[]) => void;
    onCustomTextChange: (text: string) => void;
    customText: string;
    isFavorite: boolean;
}

const ChannelsList: React.FC<ChannelsListProps> = ({ team, onChannelSelect, onUploadSuccess, onCustomTextChange, customText, isFavorite }) => {
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

    useEffect(() => {
        const fetchChannels = async () => {
            if (!account) return;

            const request = {
                ...loginRequest,
                account: account,
            };

            try {
                const response = await instance.acquireTokenSilent(request);
                const accessToken = response.accessToken;

                const graphResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });

                if (graphResponse.ok) {
                    const data = await graphResponse.json();
                    setChannels(data.value);
                    // Automatisch den einzigen Kanal auswählen, wenn es nur einen gibt
                    if (data.value.length === 1) {
                        handleChannelSelect(data.value[0]);
                    }
                } else {
                    setError("Failed to fetch channels");
                }
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    instance.acquireTokenPopup(request).then((response) => {
                        const accessToken = response.accessToken;
                        fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                            },
                        }).then((res) => res.json()).then((data) => {
                            setChannels(data.value);
                            // Automatisch den einzigen Kanal auswählen, wenn es nur einen gibt
                            if (data.value.length === 1) {
                                handleChannelSelect(data.value[0]);
                            }
                        });
                    });
                } else {
                    setError("Error fetching channels");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchChannels();
    }, [instance, account, team.id, isFavorite]);

    const handleChannelSelect = (channel: Channel) => {
        setSelectedChannel(channel);
        onChannelSelect(channel);
    };

    if (loading) return <Typography variant="h6">Loading channels...</Typography>;
    if (error) return <Alert severity="error">Error: {error}</Alert>;

    return (
        <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
                Kanal auswählen
            </Typography>
            <Grid container spacing={2}>
                {channels.map((channel) => (
                    <Grid item xs={12} sm={6} md={4} key={channel.id}>
                        <Card
                            sx={{
                                cursor: 'pointer',
                                border: selectedChannel?.id === channel.id ? '2px solid #1976d2' : '1px solid #e0e0e0',
                                '&:hover': { boxShadow: 3 }
                            }}
                            onClick={() => handleChannelSelect(channel)}
                        >
                            <CardActionArea>
                                <CardContent sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
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
                />
            )}
        </Box>
    );
};

export default ChannelsList;