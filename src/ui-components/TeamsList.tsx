import React, { useEffect, useState, useMemo } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { db, Team, Channel } from '../db';
import { logToSharePoint } from "../utils/Logger";
import ChannelsList from "./ChannelsList";
import { postMessageToChannel, MentionUser } from "./PostMessage"; // MentionUser importieren
import { Autocomplete, TextField, Button, Typography, Box, Alert, IconButton } from "@mui/material";
import { Star, StarBorder } from "@mui/icons-material";
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
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    
    // Neue States für Mentions
    const [teamMembers, setTeamMembers] = useState<MentionUser[]>([]);
    const [selectedMentions, setSelectedMentions] = useState<MentionUser[]>([]);

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

    // Neuer useEffect für Kanäle- UND Mitglieder-Caching, nur wenn nötig
    useEffect(() => {
        const loadAndCacheDataForFavorites = async () => {
            if (!account || !isOnline || favorites.size === 0) return;
            const request = { ...loginRequest, account };
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            for (const favId of favorites) {
                const team = teams.find(t => t.id === favId) || cachedFavorites.find(f => f.id === favId);
                const cachedFav = cachedFavorites.find(f => f.id === favId);
                
                if (team) {
                    let channels = cachedFav?.channels;
                    let members = cachedFav?.members;
                    let needsUpdate = false;

                    // 1. Kanäle laden falls fehlen
                    if (!channels) {
                        try {
                            const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${favId}/channels`, {
                                headers: { Authorization: `Bearer ${accessToken}` },
                            });
                            if (channelsResponse.ok) {
                                const channelsData = await channelsResponse.json();
                                channels = channelsData.value;
                                needsUpdate = true;
                            }
                        } catch (err) {
                            console.error(`Fehler beim Laden von Kanälen für ${favId}:`, err);
                        }
                    }

                    // 2. Mitglieder laden falls fehlen (NEU)
                    if (!members) {
                        try {
                            const membersResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${favId}/members`, {
                                headers: { Authorization: `Bearer ${accessToken}` },
                            });
                            if (membersResponse.ok) {
                                const membersData = await membersResponse.json();
                                members = membersData.value
                                    .filter((m: any) => m.userId)
                                    .map((m: any) => ({
                                        id: m.userId,
                                        displayName: m.displayName
                                    }));
                                needsUpdate = true;
                            }
                        } catch (err) {
                            console.error(`Fehler beim Laden von Mitgliedern für ${favId}:`, err);
                        }
                    }

                    // Wenn Daten aktualisiert wurden, in DB speichern
                    if (needsUpdate && channels) {
                        const newFavData = { 
                            id: favId, 
                            displayName: team.displayName, 
                            channels: channels,
                            members: members || [] 
                        };
                        await db.favoriteTeams.put(newFavData);
                        
                        // State aktualisieren
                        setCachedFavorites(prev => {
                            const idx = prev.findIndex(f => f.id === favId);
                            if (idx >= 0) {
                                const newArr = [...prev];
                                newArr[idx] = newFavData;
                                return newArr;
                            }
                            return [...prev, newFavData];
                        });
                    }
                }
            }
        };

        loadAndCacheDataForFavorites();
    }, [favorites, account, isOnline, teams]); // cachedFavorites aus Deps entfernt um Loop zu vermeiden

    const toggleFavorite = async (teamId: string) => {
        const newFavorites = new Set(favorites);
        if (newFavorites.has(teamId)) {
            newFavorites.delete(teamId);
            await db.favoriteTeams.delete(teamId);  // Aus Cache entfernen
        } else {
            newFavorites.add(teamId);
            // Cache Team, Kanäle und Mitglieder (nur online)
            if (isOnline && account) {
                const team = teams.find(t => t.id === teamId);
                if (team) {
                    const request = { ...loginRequest, account };
                    const response = await instance.acquireTokenSilent(request);
                    const accessToken = response.accessToken;
                    
                    // Kanäle laden
                    const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/channels`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    const channelsData = await channelsResponse.json();

                    // Mitglieder laden (NEU)
                    let members: MentionUser[] = [];
                    try {
                        const membersResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/members`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });
                        if (membersResponse.ok) {
                            const mData = await membersResponse.json();
                            members = mData.value.filter((m:any) => m.userId).map((m:any) => ({ id: m.userId, displayName: m.displayName }));
                        }
                    } catch (e) { console.error("Failed to fetch members for fav", e); }

                    const favData = { 
                        id: teamId, 
                        displayName: team.displayName, 
                        channels: channelsData.value,
                        members: members
                    };
                    await db.favoriteTeams.put(favData);
                    
                    // Cache State sofort aktualisieren
                    setCachedFavorites(prev => [...prev.filter(f => f.id !== teamId), favData]);
                }
            }
        }
        setFavorites(newFavorites);
        localStorage.setItem('favoriteTeams', JSON.stringify([...newFavorites]));
    };

    // Mitglieder laden: Teil 1 - Aus Cache (reagiert auf Cache-Updates)
    useEffect(() => {
        if (!selectedTeam) {
            setTeamMembers([]);
            return;
        }
        
        // Wir suchen im State 'cachedFavorites'
        const cachedTeam = cachedFavorites.find(f => f.id === selectedTeam.id);
        
        // Prüfen ob Mitglieder im Cache sind
        if (cachedTeam?.members && cachedTeam.members.length > 0) {
            console.log(`Lade Mitglieder aus Cache für ${selectedTeam.displayName} (${cachedTeam.members.length} Mitglieder)`);
            setTeamMembers(cachedTeam.members);
        } else if (!isOnline) {
            // Offline und kein Cache -> leer
            console.warn("Offline und keine Mitglieder im Cache für dieses Team.");
            setTeamMembers([]);
        }
    }, [selectedTeam, cachedFavorites, isOnline]);

    // Mitglieder laden: Teil 2 - Von API (reagiert NICHT auf cachedFavorites -> verhindert Loop)
    useEffect(() => {
        let isMounted = true;

        const fetchMembersAPI = async () => {
            if (!selectedTeam || !account || !isOnline) return;
            
            console.log(`Lade Mitglieder für Team (API): ${selectedTeam.displayName}`);

            const request = { ...loginRequest, account };

            try {
                let accessToken;
                try {
                    const response = await instance.acquireTokenSilent(request);
                    accessToken = response.accessToken;
                } catch (err) {
                    if (err instanceof InteractionRequiredAuthError) {
                        return; 
                    }
                    throw err;
                }
                
                const res = await fetch(`https://graph.microsoft.com/v1.0/teams/${selectedTeam.id}/members`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) {
                        const members = data.value
                            .filter((m: any) => m.userId && m.displayName)
                            .map((m: any) => ({
                                id: m.userId,
                                displayName: m.displayName
                            }));
                        
                        setTeamMembers(members);

                        // Cache aktualisieren, falls es ein Favorit ist
                        if (favorites.has(selectedTeam.id)) {
                             const currentFav = await db.favoriteTeams.get(selectedTeam.id);
                             if (currentFav) {
                                 const updatedFav = { ...currentFav, members };
                                 await db.favoriteTeams.put(updatedFav);
                                 // Dies triggert Effect 1, aber nicht diesen Effect 2!
                                 setCachedFavorites(prev => prev.map(f => f.id === selectedTeam.id ? updatedFav : f));
                             }
                        }
                    }
                }
            } catch (e) {
                console.error("Fehler beim Laden der Mitglieder", e);
            }
        };
        
        fetchMembersAPI();

        return () => { isMounted = false; };
    }, [selectedTeam, account, isOnline, instance, favorites]); // WICHTIG: cachedFavorites entfernt!

    const handleTeamSelect = (event: any, value: Team | null) => {
        setSelectedTeam(value);
        setUploadSuccess(false);
        setCustomText("");
        setImageUrls([]);
        setUploadedFiles([]);
        setSelectedMentions([]); // Reset Mentions
    };

    // Kombiniere online Teams mit gecachten Favoriten für Offline
    const availableTeams = useMemo(() => {
        if (isOnline && teams.length > 0) return sortedTeams;
        return cachedFavorites.map(fav => ({ id: fav.id, displayName: fav.displayName }));  // Offline: Nur gecachte
    }, [isOnline, teams, sortedTeams, cachedFavorites]);

    // Füge syncPost Funktion hinzu (falls nicht vorhanden)
    // ÄNDERUNG: Callback Signatur angepasst
    const syncPost = async (post: any, onProgress?: (current: number, total: number) => void) => {
        if (!account || !isOnline) return;
        setPosting(true);
        try {
            console.log('Starte Sync für Post:', post.id);
            const request = { ...loginRequest, account };
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            // Bilder aus Dexie laden
            const images = await db.images.where('postId').equals(post.id).toArray();
            const files = images.map(img => img.file);

            // HINWEIS: encodeFilesToBase64 wird nicht mehr benötigt für den Post

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
            const totalFiles = images.length;

            // Initialisierung entfernen wir hier, da sie gleich im Loop passiert
            // if (onProgress) onProgress(0, totalFiles); 

            for (let i = 0; i < totalFiles; i++) {
                // ÄNDERUNG: Progress VOR dem Upload aktualisieren
                // Damit steht da "Uploading image 1 of 4" während Bild 1 lädt
                if (onProgress) {
                    onProgress(i + 1, totalFiles);
                }

                const img = images[i];
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

            // LOGGING HINZUFÜGEN
            try {
                const totalSizeMB = files.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
                // Versuche Team-Namen zu finden oder nutze ID
                const teamName = teams.find(t => t.id === post.teamId)?.displayName || post.teamId;
                
                await logToSharePoint(accessToken, {
                    userEmail: account.username,
                    sourceUrl: `Team: ${teamName} / Channel: ${post.channelDisplayName} (Sync)`,
                    photoCount: files.length,
                    totalSizeMB: parseFloat(totalSizeMB.toFixed(2)),
                    targetTeamName: teamName,
                    status: 'Success'
                });
            } catch (logErr) {
                console.error("Logging-Fehler:", logErr);
            }
            
            //Mentions aus dem Post-Objekt holen
            const mentions = post.mentions || [];

            // Posten - Jetzt mit files UND mentions
            await postMessageToChannel(
                accessToken, 
                post.teamId, 
                post.channelId, 
                post.text, 
                uploadedUrls, 
                files, 
                mentions
            );
            
            await db.posts.delete(post.id);
            await db.images.where('postId').equals(post.id).delete();
            console.log('Post synced und gelöscht');
        } catch (err) {
            console.error('Sync-Fehler für Post', post.id, ':', err);
        }
        setPosting(false);
    };

    // ÄNDERUNG: Callback Signatur angepasst
    const saveOfflinePost = async (files?: File[], onProgress?: (current: number, total: number) => void) => {
        // ÄNDERUNG: Erlaube leeren Text, wenn Dateien vorhanden sind
        if (!selectedTeam || !selectedChannel || (!customText.trim() && (!files || files.length === 0))) return;
        const post = {
            teamId: selectedTeam.id,
            channelId: selectedChannel.id,
            channelDisplayName: selectedChannel.displayName,
            text: customText,
            imageUrls: [] as string[],
            timestamp: Date.now(),
            mentions: selectedMentions // Mentions speichern
        };
        const postId = await db.posts.add(post);
        if (files && files.length > 0) {
            for (const file of files) {
                await db.images.add({ postId, file });
            }
        }
        const newPost = { ...post, id: postId };
        setOfflinePosts([...offlinePosts, newPost]);

        // Neu: Wenn Online, sync nur diesen Post automatisch (ohne await)
        if (isOnline && account) {
            await syncPost(newPost, onProgress);
        }
        alert(`${files?.length || 0} image(s) saved ${isOnline ? 'and uploaded' : 'offline'}!`);
        window.location.reload();  // Seite neu laden, um State zu resetten
        // Reset alles
        setCustomText('');
        setImageUrls([]);
        setSelectedChannel(null);
        setSelectedTeam(null);
        setUploadSuccess(false);
        setSelectedMentions([]); // Reset Mentions
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

                // HINWEIS: encodeFilesToBase64 entfernt

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

                // HIER: Mentions aus dem Post-Objekt holen
                const mentions = post.mentions || [];

                // Posten - Jetzt mit files UND mentions
                await postMessageToChannel(
                    accessToken, 
                    post.teamId, 
                    post.channelId, 
                    post.text, 
                    uploadedUrls, 
                    files, 
                    mentions // <--- HIER übergeben
                );
                
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
        // ÄNDERUNG: Erlaube leeren Text, wenn Bilder vorhanden sind
        if (!account || !selectedTeam || !selectedChannel || (!customText && imageUrls.length === 0)) return;

        setPosting(true);

        const request = { ...loginRequest, account };

        try {
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            // Hier uploadedFiles und selectedMentions übergeben
            await postMessageToChannel(accessToken, selectedTeam.id, selectedChannel!.id, customText, imageUrls, uploadedFiles, selectedMentions);

            alert("Beitrag erfolgreich in den Kanal gepostet!");
            setUploadSuccess(false);
            setCustomText("");
            setImageUrls([]);
            setUploadedFiles([]);
            setSelectedMentions([]); // Reset Mentions
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
                <>
                    <ChannelsList
                        team={selectedTeam}
                        onChannelSelect={setSelectedChannel}
                        onUploadSuccess={(urls: string[], files?: File[], base64Images?: string[]) => {
                            setImageUrls(urls);
                            setUploadSuccess(true);
                            // Files speichern für den Post
                            setUploadedFiles(files || []);
                        }}
                        onCustomTextChange={setCustomText}
                        customText={customText}
                        isFavorite={favorites.has(selectedTeam.id)}
                        cachedChannels={cachedFavorites.find(f => f.id === selectedTeam.id)?.channels || []}
                        onSaveOffline={saveOfflinePost}
                    />
                    
                    {/* UI für Mentions hinzufügen */}
                    {isOnline && (
                        <Autocomplete
                            multiple
                            options={teamMembers}
                            getOptionLabel={(option) => option.displayName}
                            value={selectedMentions}
                            onChange={(event, newValue) => {
                                setSelectedMentions(newValue);
                            }}
                            renderInput={(params) => (
                                <TextField 
                                    {...params} 
                                    label="Personen erwähnen (@)" 
                                    placeholder="Namen eingeben..." 
                                    variant="outlined"
                                />
                            )}
                            sx={{ mt: 2 }}
                        />
                    )}
                </>
            )}
            {/* ÄNDERUNG: Button anzeigen auch ohne Text, wenn Upload erfolgreich war */}
            {uploadSuccess && (customText.trim() || imageUrls.length > 0) && isOnline && account && (
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