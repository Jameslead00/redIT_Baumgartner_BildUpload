import React, { useEffect, useState, useMemo } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import ChannelsList from "./ChannelsList";
import { postMessageToChannel } from "./PostMessage";
import { Autocomplete, TextField, Button, Typography, Box, Alert, IconButton } from "@mui/material";
import { Star, StarBorder } from "@mui/icons-material";
import { db, OfflineDB, FavoriteTeam, OfflinePost, Team, Channel } from '../db';
import { checkFolderExists, createFolder, uploadLargeFile, uploadSmallFile, encodeFilesToBase64, getFolderPath } from './ImageUpload';

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
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlinePosts, setOfflinePosts] = useState<any[]>([]);
    const [cachedFavorites, setCachedFavorites] = useState<any[]>([]);
    const [base64Images, setBase64Images] = useState<string[]>([]);  // Neue State für base64 Bilder

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

     // Sortiere Teams: Favoriten zuerst
    const sortedTeams = useMemo(() => {
        return [...teams].sort((a, b) => {
            const aFav = favorites.has(a.id);
            const bFav = favorites.has(b.id);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return a.displayName.localeCompare(b.displayName);
        });
    }, [teams, favorites]);

    // Lade gecachte Favoriten und Offline-Posts
    useEffect(() => {
        const loadCachedData = async () => {
            const cached = await db.favoriteTeams.toArray();
            setCachedFavorites(cached);
            const posts = await db.posts.toArray();
            setOfflinePosts(posts);
        };
        loadCachedData();
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('favoriteTeams');
        setFavorites(stored ? new Set(JSON.parse(stored)) : new Set());
    }, []);

    useEffect(() => {
        const fetchTeams = async () => {
            if (!account || !isOnline) {
                setLoading(false);  // Setze loading auf false, wenn kein account oder offline
                return;
            }

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
        // Entferne loadAndCacheChannelsForFavorites aus useEffect, um Loop zu vermeiden
    }, [instance, account, isOnline]);  // Entferne favorites aus dependencies, um Loop zu vermeiden

    // Neuer useEffect für Kanäle-Caching, nur wenn nötig
    useEffect(() => {
        const loadAndCacheChannelsForFavorites = async () => {
            if (!account || !isOnline || favorites.size === 0) return;
            const request = { ...loginRequest, account };
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            for (const favId of favorites) {
                const team = teams.find(t => t.id === favId) || cachedFavorites.find(f => f.id === favId);
                if (team && !cachedFavorites.find(f => f.id === favId)?.channels) {  // Nur laden, wenn nicht bereits gecached
                    try {
                        const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${favId}/channels`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });
                        const channelsData = await channelsResponse.json();
                        await db.favoriteTeams.put({ id: favId, displayName: team.displayName, channels: channelsData.value });
                        setCachedFavorites(prev => prev.map(f => f.id === favId ? { ...f, channels: channelsData.value } : f));
                    } catch (err) {
                        console.error(`Fehler beim Laden von Kanälen für ${favId}:`, err);
                    }
                }
            }
        };

        loadAndCacheChannelsForFavorites();
    }, [favorites, account, isOnline, teams]);  // Füge teams hinzu, aber vermeide Loop durch Bedingung

    const toggleFavorite = async (teamId: string) => {
        const newFavorites = new Set(favorites);
        if (newFavorites.has(teamId)) {
            newFavorites.delete(teamId);
            await db.favoriteTeams.delete(teamId);  // Aus Cache entfernen
        } else {
            newFavorites.add(teamId);
            // Cache Team und Kanäle (nur online)
            if (isOnline && account) {
                const team = teams.find(t => t.id === teamId);
                if (team) {
                    // Kanäle laden und cachen
                    const request = { ...loginRequest, account };
                    const response = await instance.acquireTokenSilent(request);
                    const accessToken = response.accessToken;
                    const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    const channelsData = await channelsResponse.json();
                    await db.favoriteTeams.put({ id: teamId, displayName: team.displayName, channels: channelsData.value });
                }
            }
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

    // Kombiniere online Teams mit gecachten Favoriten für Offline
    const availableTeams = useMemo(() => {
        if (isOnline && teams.length > 0) return sortedTeams;
        return cachedFavorites.map(fav => ({ id: fav.id, displayName: fav.displayName }));  // Offline: Nur gecachte
    }, [isOnline, teams, sortedTeams, cachedFavorites]);

    const saveOfflinePost = async (files?: File[]) => {
        if (!selectedTeam || !selectedChannel || !customText.trim()) return;
        const post = {
            teamId: selectedTeam.id,
            channelId: selectedChannel.id,
            channelDisplayName: selectedChannel.displayName,  // Neu hinzufügen
            text: customText,
            imageUrls: [] as string[],
            timestamp: Date.now()
        };
        const postId = await db.posts.add(post);
        console.log('Offline Post gespeichert:', postId, post);
        // Speichere Dateien
        if (files && files.length > 0) {
            console.log('Speichere Bilder:', files.length);
            for (const file of files) {
                await db.images.add({ postId, file });
                console.log('Bild gespeichert:', file.name);
            }
        } else {
            console.log('Keine Bilder zum Speichern');
        }
        setOfflinePosts([...offlinePosts, { ...post, id: postId }]);
        alert('Offline gespeichert!');
        // Reset alles
        setCustomText('');
        setImageUrls([]);
        setSelectedChannel(null);
        setSelectedTeam(null);
        setUploadSuccess(false);
    };

    const syncOfflinePosts = async () => {
        if (!account || !isOnline || offlinePosts.length === 0) return;
        setPosting(true);
        console.log('Starte Sync für', offlinePosts.length, 'Posts');
        for (const post of offlinePosts) {
            try {
                console.log('Sync Post:', post.id);
                const request = { ...loginRequest, account };
                const response = await instance.acquireTokenSilent(request);
                const accessToken = response.accessToken;

                // Bilder aus Dexie laden
                const images = await db.images.where('postId').equals(post.id).toArray();
                const files = images.map(img => img.file);

                // Erzeuge base64Images für Thumbnails
                const base64Images = await encodeFilesToBase64(files);

                // Ordner und Site-ID prüfen
                const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/groups/${post.teamId}/sites/root`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                const siteData = await siteResponse.json();
                const siteId = siteData.id;
                console.log('Site ID:', siteId);

                // Bestimme den Ordner-Pfad
                const folderPath = getFolderPath(post.channelDisplayName);
                console.log('Verwende Ordner-Pfad:', folderPath);

                // Ordner prüfen/erstellen
                const folderExists = await checkFolderExists(accessToken, siteId, folderPath);
                if (!folderExists) await createFolder(accessToken, siteId, folderPath);

                // Hochladen
                const uploadedUrls: string[] = [];
                for (const img of images) {
                    console.log('Lade Bild hoch:', img.file.name);
                    let url: string;
                    if (img.file.size > 4 * 1024 * 1024) {
                        url = await uploadLargeFile(accessToken, siteId, img.file, folderPath);
                    } else {
                        url = await uploadSmallFile(accessToken, siteId, img.file, folderPath);
                    }
                    console.log('Hochgeladene URL:', url);
                    uploadedUrls.push(url);
                }

                console.log('Poste Nachricht mit URLs:', uploadedUrls);
                // Posten
                await postMessageToChannel(accessToken, post.teamId, post.channelId, post.text, uploadedUrls, base64Images);
                await db.posts.delete(post.id);
                await db.images.where('postId').equals(post.id).delete();
                console.log('Post synced und gelöscht');
            } catch (err) {
                console.error('Sync-Fehler für Post', post.id, ':', err);
            }
        }
        setOfflinePosts([]);
        setPosting(false);
        alert('Alle cached Posts hochgeladen!');
    };

    const handlePostToChannel = async () => {
        if (!account || !selectedTeam || !selectedChannel || !customText || imageUrls.length === 0) return;

        setPosting(true);

        const request = { ...loginRequest, account };

        try {
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            await postMessageToChannel(accessToken, selectedTeam.id, selectedChannel!.id, customText, imageUrls, base64Images);  // base64Images übergeben

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

   

    if (loading && account && isOnline) return <Typography variant="h6">Loading teams...</Typography>;  // Nur laden, wenn account und online
    if (error) return <Alert severity="error">Error: {error}</Alert>;

    return (
        <Box sx={{ mt: 3 }}>
            {/* Offline-Hinweis */}
            {(!isOnline || !account) && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {!isOnline ? 'Offline-Modus: Eingaben werden lokal gespeichert.' : 'Nicht eingeloggt: Eingaben werden lokal gespeichert.'}
                </Alert>
            )}

            <Typography variant="h5" gutterBottom>
                Team auswählen ({isOnline && account ? 'Online' : 'Offline gecacht'})
            </Typography>
            <Autocomplete
                options={availableTeams}  // Zeigt gecachte Teams, wenn nicht eingeloggt
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
                    onUploadSuccess={(urls: string[], files?: File[], base64Images?: string[]) => {
                        setImageUrls(urls);
                        setUploadSuccess(true);
                        // base64Images speichern oder übergeben
                        setBase64Images(base64Images || []);  // Neue State hinzufügen
                    }}
                    onCustomTextChange={setCustomText}
                    customText={customText}
                    isFavorite={favorites.has(selectedTeam.id)}
                    cachedChannels={cachedFavorites.find(f => f.id === selectedTeam.id)?.channels || []}
                    onSaveOffline={saveOfflinePost}  // Übergebe saveOfflinePost
                />
            )}
            {uploadSuccess && customText.trim() && isOnline && account && (
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
            {/* Sync-Button immer anzeigen, wenn Posts vorhanden und online/account */}
            {offlinePosts.length > 0 && isOnline && account && (
                <Button onClick={syncOfflinePosts} variant="contained" sx={{ mt: 2 }} disabled={posting}>
                    Upload ({offlinePosts.length}) cached post(s)
                </Button>
            )}
        </Box>
    );
};

export default TeamsList;