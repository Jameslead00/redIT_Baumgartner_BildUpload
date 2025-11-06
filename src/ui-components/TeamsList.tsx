import React, { useEffect, useState, useMemo } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import ChannelsList from "./ChannelsList";
import { postMessageToChannel } from "./PostMessage";
import { Autocomplete, TextField, Button, Typography, Box, Alert, IconButton } from "@mui/material";
import { Star, StarBorder } from "@mui/icons-material";

interface Team {
    id: string;
    displayName: string;
}

interface Channel {
    id: string;
    displayName: string;
}

const TeamsList: React.FC = () => {
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
    const [customText, setCustomText] = useState<string>("");
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [posting, setPosting] = useState<boolean>(false);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());

    useEffect(() => {
        const stored = localStorage.getItem('favoriteTeams');
        setFavorites(stored ? new Set(JSON.parse(stored)) : new Set());
    }, []);

    useEffect(() => {
        const fetchTeams = async () => {
            if (!account) return;

            const request = { ...loginRequest, account };

            try {
                const response = await instance.acquireTokenSilent(request);
                const accessToken = response.accessToken;

                const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });

                if (graphResponse.ok) {
                    const data = await graphResponse.json();
                    setTeams(data.value);
                } else {
                    setError("Failed to fetch teams");
                }
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    instance.acquireTokenPopup(request).then((response) => {
                        const accessToken = response.accessToken;
                        fetch("https://graph.microsoft.com/v1.0/me/joinedTeams", {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        }).then((res) => res.json()).then((data) => setTeams(data.value));
                    });
                } else {
                    setError("Error fetching teams");
                }
            } finally {
                setLoading(false);
            }
        };

        fetchTeams();
    }, [instance, account, favorites]);

    const toggleFavorite = (teamId: string) => {
        const newFavorites = new Set(favorites);
        if (newFavorites.has(teamId)) {
            newFavorites.delete(teamId);
        } else {
            newFavorites.add(teamId);
        }
        setFavorites(newFavorites);
        localStorage.setItem('favoriteTeams', JSON.stringify([...newFavorites]));
    };

    const handleTeamSelect = (event: any, value: Team | null) => {
        setSelectedTeam(value);
        setUploadSuccess(false);
        setCustomText("");
        setImageUrls([]);
    };

    const handlePostToChannel = async () => {
        if (!account || !selectedTeam || !selectedChannel || !customText || imageUrls.length === 0) return;

        setPosting(true);

        const request = { ...loginRequest, account };

        try {
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            await postMessageToChannel(accessToken, selectedTeam.id, selectedChannel.id, customText, imageUrls);

            alert("Beitrag erfolgreich in den Kanal gepostet!");
            setUploadSuccess(false);
            setCustomText("");
            setImageUrls([]);
        } catch (err) {
            alert("Fehler beim Posten: " + (err instanceof Error ? err.message : "Unbekannter Fehler"));
        } finally {
            setPosting(false);
        }
    };

    // Sortiere Teams: Favoriten zuerst
    const sortedTeams = useMemo(() => {
        return [...teams].sort((a, b) => {
            const aFav = favorites.has(a.id);
            const bFav = favorites.has(b.id);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return a.displayName.localeCompare(b.displayName);  // Alphabetisch, wenn beide Favorit oder beide nicht
        });
    }, [teams, favorites]);

    if (loading) return <Typography variant="h6">Loading teams...</Typography>;
    if (error) return <Alert severity="error">Error: {error}</Alert>;

    return (
        <Box sx={{ mt: 3 }}>
            <Typography variant="h5" gutterBottom>
                Team auswählen
            </Typography>
            <Autocomplete
                options={sortedTeams}  // Verwende sortierte Liste
                getOptionLabel={(option) => option.displayName}
                value={selectedTeam}
                onChange={handleTeamSelect}
                renderOption={(props, option) => (
                    <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleFavorite(option.id); }}>
                            {favorites.has(option.id) ? <Star color="primary" /> : <StarBorder />}
                        </IconButton>
                        {option.displayName}
                    </Box>
                )}
                renderInput={(params) => <TextField {...params} label="Search teams" variant="outlined" />}
                sx={{ mb: 2 }}
            />
            {selectedTeam && (
                <ChannelsList
                    team={selectedTeam}
                    onChannelSelect={setSelectedChannel}
                    onUploadSuccess={(urls: string[]) => {
                        setImageUrls(urls);
                        setUploadSuccess(true);
                    }}
                    onCustomTextChange={setCustomText}
                    customText={customText}
                    isFavorite={favorites.has(selectedTeam.id)}
                />
            )}
            {uploadSuccess && customText.trim() && (
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handlePostToChannel}
                    disabled={posting}
                    sx={{ mt: 2 }}
                >
                    {posting ? "Posting..." : "Beitrag in Kanal posten"}
                </Button>
            )}
        </Box>
    );
};

export default TeamsList;