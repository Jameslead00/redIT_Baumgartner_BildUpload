import React, { useEffect, useState, useMemo, useRef } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { db, Team, Channel, SubFolder } from '../db'; // Import SubFolder
import { logToSharePoint } from "../utils/Logger";
import ChannelsList from "./ChannelsList";
import { postMessageToChannel, MentionUser, postMessageToQualityTeamMirror, QUALITY_TEAM_ID, shouldMirrorToQualityTeam } from "./PostMessage"; // MentionUser importieren
import { Autocomplete, TextField, Button, Typography, Box, Alert, IconButton, Snackbar, Checkbox, FormControlLabel } from "@mui/material";
import { Star, StarBorder } from "@mui/icons-material";
import { checkFolderExists, createFolder, uploadLargeFile, uploadSmallFile, encodeFilesToBase64, getFolderPath, GraphOperationError, isGraphOperationError } from './ImageUpload';
import { useTranslation } from "react-i18next";

const TeamsList: React.FC = () => {
    const { t } = useTranslation();
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
    const [alsoPostToQualityTeam, setAlsoPostToQualityTeam] = useState<boolean>(false);
    const [posting, setPosting] = useState<boolean>(false);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlinePosts, setOfflinePosts] = useState<any[]>([]);
    const [cachedFavorites, setCachedFavorites] = useState<any[]>([]);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [cachedAllTeams, setCachedAllTeams] = useState<any[]>([]);  // Neuer State für alle gecachten Teams
    
    // Neue States für Mentions
    const [teamMembers, setTeamMembers] = useState<MentionUser[]>([]);
    const [selectedMentions, setSelectedMentions] = useState<MentionUser[]>([]);

    // Neue States für Snackbar
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    // Ref, um zu verhindern, dass Sync mehrmals läuft
    const hasSyncedRef = useRef(false);

    const createCorrelationId = (): string => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const getMentionDropdownLabel = (member: MentionUser): string => {
        const position = member.position?.trim() || '';
        return position ? `${member.displayName} (${position})` : member.displayName;
    };

    const enrichMembersWithPositions = async (accessToken: string, members: MentionUser[]): Promise<MentionUser[]> => {
        if (members.length === 0) return members;

        const uniqueIds = Array.from(new Set(members.map((member) => member.id).filter(Boolean)));
        const positionByUserId: Record<string, string> = {};

        for (let start = 0; start < uniqueIds.length; start += 20) {
            const chunk = uniqueIds.slice(start, start + 20);
            const batchRequests = chunk.map((userId, index) => ({
                id: `${index}`,
                method: 'GET',
                url: `/users/${userId}?$select=id,jobTitle`,
            }));

            try {
                const batchResponse = await fetch('https://graph.microsoft.com/v1.0/$batch', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ requests: batchRequests }),
                });

                if (!batchResponse.ok) {
                    continue;
                }

                const batchData = await batchResponse.json();
                const responses = Array.isArray(batchData?.responses) ? batchData.responses : [];

                for (const item of responses) {
                    if (item?.status !== 200 || !item?.body?.id) {
                        const errorCode = item?.body?.error?.code;
                        const errorMessage = item?.body?.error?.message;
                        if (item?.status === 401 || item?.status === 403 || errorCode === 'Authorization_RequestDenied') {
                            console.warn('Positionsdaten konnten aufgrund fehlender Berechtigung nicht geladen werden.', {
                                status: item?.status,
                                code: errorCode,
                                message: errorMessage,
                            });
                        }
                        continue;
                    }
                    const rawPosition = typeof item.body.jobTitle === 'string' ? item.body.jobTitle.trim() : '';
                    if (rawPosition) {
                        positionByUserId[item.body.id] = rawPosition;
                    }
                }
            } catch (err) {
                console.warn('Konnte Positionsdaten für Teammitglieder nicht laden.', err);
            }
        }

        return members.map((member) => ({
            ...member,
            position: positionByUserId[member.id] || member.position,
        }));
    };

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

    // Lade gecachte Teams für Offline
    useEffect(() => {
        const loadCachedAllTeams = async () => {
            const cached = await db.allJoinedTeams.toArray();
            setCachedAllTeams(cached);  // Neuer State: const [cachedAllTeams, setCachedAllTeams] = useState<any[]>([]);
        };
        loadCachedAllTeams();
    }, []);

    // Automatische Synchronisation, wenn online und Posts vorhanden
    useEffect(() => {
        if (isOnline && account && offlinePosts.length > 0 && !hasSyncedRef.current) {
            hasSyncedRef.current = true;
            syncOfflinePosts();
        } else if (!isOnline || !account) {
            hasSyncedRef.current = false; // Reset wenn offline oder nicht eingeloggt
        }
    }, [isOnline, account, offlinePosts.length]);

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
                    
                    // Cache alle Teams
                    for (const team of data.value) {
                        await db.allJoinedTeams.put({
                            id: team.id,
                            displayName: team.displayName,
                            channels: [],  // Wird später gefüllt
                            members: [],
                            channelSubFolders: {},
                        });
                    }
                    
                    // Entferne Teams aus Cache, die nicht mehr beigetreten sind
                    const cachedTeamIds = await db.allJoinedTeams.toCollection().primaryKeys();
                    const currentTeamIds = data.value.map((t: any) => t.id);
                    const toRemove = cachedTeamIds.filter(id => !currentTeamIds.includes(id));
                    for (const id of toRemove) {
                        await db.allJoinedTeams.delete(id);
                    }
                } else {
                    setError(t('teams.fetchTeamsFailure'));
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
                    setError(t('teams.fetchTeamsError'));
                }
            } finally {
                setLoading(false);
            }
        };

        fetchTeams();
        // Entferne loadAndCacheChannelsForFavorites aus useEffect, um Loop zu vermeiden
    }, [instance, account, isOnline]);  // Entferne favorites aus dependencies, um Loop zu vermeiden

    // Neuer useEffect für Kanäle, Mitglieder UND Subfolders Caching
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
                    let channelSubFolders = cachedFav?.channelSubFolders || {}; // Load existing
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
                                const rawMembers = membersData.value
                                    .filter((m: any) => m.userId)
                                    .map((m: any) => ({
                                        id: m.userId,
                                        displayName: m.displayName
                                    }));
                                members = await enrichMembersWithPositions(accessToken, rawMembers);
                                needsUpdate = true;
                            }
                        } catch (err) {
                            console.error(`Fehler beim Laden von Mitgliedern für ${favId}:`, err);
                        }
                    }

                    // 3. Subfolders für jeden Kanal laden (NEW)
                    if (channels) {
                        // Get Site ID first (needed for drive queries)
                        try {
                            const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/groups/${favId}/sites/root`, {
                                headers: { Authorization: `Bearer ${accessToken}` },
                            });
                            if (siteResponse.ok) {
                                const siteData = await siteResponse.json();
                                const siteId = siteData.id;

                                for (const channel of channels) {
                                    // Always try to update, or check if missing
                                    // If we want to refresh cache, we should probably do it.
                                    // For now, let's check if it's missing or empty
                                    
                                    const folderPath = getFolderPath(channel.displayName);
                                    try {
                                        const childrenResponse = await fetch(
                                            `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/children?filter=folder ne null&select=id,name`, 
                                            { headers: { Authorization: `Bearer ${accessToken}` } }
                                        );
                                        
                                        if (childrenResponse.ok) {
                                            const data = await childrenResponse.json();
                                            const items = Array.isArray(data.value) ? data.value : [];
                                            const subs = items.map((item: any) => ({ id: item.id, name: item.name }));
                                            channelSubFolders[channel.id] = subs;
                                            needsUpdate = true;
                                        } else if (childrenResponse.status === 404) {
                                            // Folder doesn't exist -> Empty list
                                            channelSubFolders[channel.id] = [];
                                            needsUpdate = true;
                                        }
                                    } catch (e) {
                                        console.warn(`Could not fetch subfolders for channel ${channel.displayName}`, e);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching site ID for subfolders", e);
                        }
                    }

                    // Wenn Daten aktualisiert wurden, in DB speichern
                    if (needsUpdate && channels) {
                        const newFavData = { 
                            id: favId, 
                            displayName: team.displayName, 
                            channels: channels,
                            members: members || [],
                            channelSubFolders: channelSubFolders // Save subfolders
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

    // Neuer useEffect für Caching von Kanälen/Mitgliedern/Subfolders für ALLE Teams (nicht nur Favoriten)
    useEffect(() => {
        const loadAndCacheAllTeamsDetails = async () => {
            if (!account || !isOnline || teams.length === 0) return;
            const request = { ...loginRequest, account };
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            for (const team of teams) {
                const cachedTeam = await db.allJoinedTeams.get(team.id);
                if (!cachedTeam) continue;  // Sollte nicht passieren
                
                let channels = cachedTeam.channels;
                let members = cachedTeam.members;
                let channelSubFolders = cachedTeam.channelSubFolders || {};
                let needsUpdate = false;

                // Kanäle laden (falls fehlen)
                if (!channels || channels.length === 0) {
                    try {
                        const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });
                        if (channelsResponse.ok) {
                            const channelsData = await channelsResponse.json();
                            channels = channelsData.value;
                            needsUpdate = true;
                        }
                    } catch (err) {
                        console.error(`Fehler beim Laden von Kanälen für ${team.id}:`, err);
                    }
                }

                // Mitglieder laden (falls fehlen)
                if (!members || members.length === 0) {
                    try {
                        const membersResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/members`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });
                        if (membersResponse.ok) {
                            const membersData = await membersResponse.json();
                            const rawMembers = membersData.value
                                .filter((m: any) => m.userId)
                                .map((m: any) => ({
                                    id: m.userId,
                                    displayName: m.displayName
                                }));
                            members = await enrichMembersWithPositions(accessToken, rawMembers);
                            needsUpdate = true;
                        }
                    } catch (err) {
                        console.error(`Fehler beim Laden von Mitgliedern für ${team.id}:`, err);
                    }
                }

                // Subfolders für jeden Kanal laden (falls fehlen)
                if (channels && channels.length > 0) {
                    try {
                        const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/groups/${team.id}/sites/root`, {
                            headers: { Authorization: `Bearer ${accessToken}` },
                        });
                        if (siteResponse.ok) {
                            const siteData = await siteResponse.json();
                            const siteId = siteData.id;

                            for (const channel of channels) {
                                const folderPath = getFolderPath(channel.displayName);
                                try {
                                    const childrenResponse = await fetch(
                                        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/children?filter=folder ne null&select=id,name`, 
                                        { headers: { Authorization: `Bearer ${accessToken}` } }
                                    );
                                    
                                    if (childrenResponse.ok) {
                                        const data = await childrenResponse.json();
                                        const items = Array.isArray(data.value) ? data.value : [];
                                        const subs = items.map((item: any) => ({ id: item.id, name: item.name }));
                                        channelSubFolders[channel.id] = subs;
                                        needsUpdate = true;
                                    } else if (childrenResponse.status === 404) {
                                        channelSubFolders[channel.id] = [];
                                        needsUpdate = true;
                                    }
                                } catch (e) {
                                    console.warn(`Could not fetch subfolders for channel ${channel.displayName}`, e);
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Error fetching site ID for subfolders", e);
                    }
                }

                // Speichere Updates
                if (needsUpdate) {
                    const updatedTeam = { 
                        id: team.id, 
                        displayName: team.displayName, 
                        channels: channels || [],
                        members: members || [],
                        channelSubFolders: channelSubFolders
                    };
                    await db.allJoinedTeams.put(updatedTeam);
                }
            }
        };
        loadAndCacheAllTeamsDetails();
    }, [teams, account, isOnline]);  // Läuft nach teams-Update

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
                            const rawMembers = mData.value
                                .filter((m: any) => m.userId)
                                .map((m: any) => ({ id: m.userId, displayName: m.displayName }));
                            members = await enrichMembersWithPositions(accessToken, rawMembers);
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
        
        // Zuerst in Favoriten suchen (für detailliertere Daten)
        let cachedTeam = cachedFavorites.find(f => f.id === selectedTeam.id);
        
        // Wenn nicht Favorit, in allen gecachten Teams suchen
        if (!cachedTeam) {
            cachedTeam = cachedAllTeams.find(t => t.id === selectedTeam.id);
        }
        
        // Prüfen ob Mitglieder im Cache sind
        if (cachedTeam?.members && cachedTeam.members.length > 0) {
            console.log(`Lade Mitglieder aus Cache für ${selectedTeam.displayName} (${cachedTeam.members.length} Mitglieder)`);
            setTeamMembers(cachedTeam.members);
        } else if (!isOnline) {
            // Offline und kein Cache -> leer
            console.warn("Offline und keine Mitglieder im Cache für dieses Team.");
            setTeamMembers([]);
        }
    }, [selectedTeam, cachedFavorites, cachedAllTeams, isOnline]);  // cachedAllTeams hinzugefügt

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
                        const popupResponse = await instance.acquireTokenPopup(request);
                        accessToken = popupResponse.accessToken;
                    } else {
                        throw err;
                    }
                }
                
                const res = await fetch(`https://graph.microsoft.com/v1.0/teams/${selectedTeam.id}/members`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) {
                        const rawMembers = data.value
                            .filter((m: any) => m.userId && m.displayName)
                            .map((m: any) => ({
                                id: m.userId,
                                displayName: m.displayName
                            }));
                        const members = await enrichMembersWithPositions(accessToken, rawMembers);
                        
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
        setAlsoPostToQualityTeam(false);
        setUploadedFiles([]);
        setSelectedMentions([]); // Reset Mentions
    };

    // Kombiniere online Teams mit gecachten Favoriten für Offline
    const availableTeams = useMemo(() => {
        if (isOnline && teams.length > 0) return sortedTeams;
        // Offline: Sortiere gecachte Teams nach Favoriten (gleiche Logik wie sortedTeams)
        return cachedAllTeams
            .map(fav => ({ id: fav.id, displayName: fav.displayName }))
            .sort((a, b) => {
                const aFav = favorites.has(a.id);
                const bFav = favorites.has(b.id);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return a.displayName.localeCompare(b.displayName);
            });
    }, [isOnline, teams, sortedTeams, cachedAllTeams, favorites]);

    // Füge syncPost Funktion hinzu (falls nicht vorhanden)
    // ÄNDERUNG: Callback Signatur angepasst
    const syncPost = async (post: any, onProgress?: (current: number, total: number) => void) => {
        if (!account || !isOnline) return;
        setPosting(true);
        const correlationId = createCorrelationId();
        let folderPath = '';
        let accessTokenForErrorLog: string | null = null;
        let currentStep = 'init';
        try {
            console.log(`[${correlationId}] Starte Sync für Post:`, post.id);
            const request = { ...loginRequest, account };
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;
            accessTokenForErrorLog = accessToken;

            // Bilder aus Dexie laden
            const images = await db.images.where('postId').equals(post.id).toArray();
            const files = images.map(img => img.file);

            // HINWEIS: encodeFilesToBase64 wird nicht mehr benötigt für den Post

            // Ordner und Site-ID prüfen
            currentStep = 'resolveSite';
            const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/groups/${post.teamId}/sites/root`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!siteResponse.ok) {
                const responseBody = await siteResponse.text();
                throw new GraphOperationError('Failed to resolve SharePoint site', {
                    status: siteResponse.status,
                    statusText: siteResponse.statusText,
                    responseBody,
                    operation: 'resolveSite',
                    teamId: post.teamId,
                    channelId: post.channelId,
                    channelDisplayName: post.channelDisplayName,
                    correlationId,
                });
            }

            const siteData = await siteResponse.json();
            const siteId = siteData.id;
            console.log(`[${correlationId}] Site ID:`, siteId);

            // Bestimme den Ordner-Pfad
            folderPath = getFolderPath(post.channelDisplayName);
            // NEW: Append Subfolder if exists
            if (post.subFolder) {
                folderPath = `${folderPath}/${post.subFolder}`;
            }
            console.log(`[${correlationId}] Verwende Ordner-Pfad:`, folderPath);

            // Ordner prüfen/erstellen
            currentStep = 'checkFolder';
            const folderExists = await checkFolderExists(accessToken, siteId, folderPath, {
                correlationId,
                teamId: post.teamId,
                channelId: post.channelId,
                channelDisplayName: post.channelDisplayName,
            });
            if (!folderExists) {
                currentStep = 'createFolder';
                await createFolder(accessToken, siteId, folderPath, {
                    correlationId,
                    teamId: post.teamId,
                    channelId: post.channelId,
                    channelDisplayName: post.channelDisplayName,
                });
            }

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
                currentStep = 'uploadFile';
                console.log(`[${correlationId}] Lade Bild hoch:`, img.file.name);
                let url: string;
                if (img.file.size > 4 * 1024 * 1024) {
                    url = await uploadLargeFile(accessToken, siteId, img.file, folderPath, {
                        correlationId,
                        teamId: post.teamId,
                        channelId: post.channelId,
                        channelDisplayName: post.channelDisplayName,
                    });
                } else {
                    url = await uploadSmallFile(accessToken, siteId, img.file, folderPath, {
                        correlationId,
                        teamId: post.teamId,
                        channelId: post.channelId,
                        channelDisplayName: post.channelDisplayName,
                    });
                }
                console.log(`[${correlationId}] Hochgeladene URL:`, url);
                uploadedUrls.push(url);
            }
            
            //Mentions aus dem Post-Objekt holen
            const mentions = post.mentions || [];

            // Posten - Jetzt mit files UND mentions
            currentStep = 'postMessage';
            await postMessageToChannel(
                accessToken, 
                post.teamId, 
                post.channelId, 
                post.text, 
                uploadedUrls, 
                files, 
                mentions,
                { correlationId }
            );

            if (shouldMirrorToQualityTeam(post.teamId, post.alsoPostToQualityTeam)) {
                try {
                    await postMessageToQualityTeamMirror(
                        accessToken,
                        post.text,
                        uploadedUrls,
                        files,
                        mentions,
                        { correlationId, teamId: QUALITY_TEAM_ID }
                    );
                } catch (mirrorError) {
                    console.error(`[${correlationId}] Quality-team mirror failed but primary post succeeded:`, mirrorError);
                }
            }

            // LOGGING HINZUFÜGEN (nur bei End-to-End Erfolg)
            currentStep = 'logSuccess';
            const totalSizeMB = files.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
            const teamName = teams.find(t => t.id === post.teamId)?.displayName || post.teamId;
            const successLogResult = await logToSharePoint(accessToken, {
                userEmail: account.username,
                sourceUrl: window.location.href,
                photoCount: files.length,
                totalSizeMB: parseFloat(totalSizeMB.toFixed(2)),
                targetTeamName: teamName,
                status: 'Success',
                correlationId,
                step: currentStep,
                teamId: post.teamId,
                channelId: post.channelId,
                channelDisplayName: post.channelDisplayName,
                folderPath,
                operation: 'syncPost',
            });
            if (!successLogResult.ok) {
                console.error(`[${correlationId}] Logging-Fehler nach erfolgreichem Post:`, successLogResult.status, successLogResult.body);
            }
            
            await db.posts.delete(post.id);
            await db.images.where('postId').equals(post.id).delete();
            console.log(`[${correlationId}] Post synced und gelöscht`);
        } catch (err) {
            const graphErr = isGraphOperationError(err) ? err : null;
            console.error(`[${correlationId}] Sync-Fehler für Post ${post.id}:`, err);

            if (accessTokenForErrorLog) {
                const errorLogResult = await logToSharePoint(accessTokenForErrorLog, {
                    userEmail: account.username,
                    sourceUrl: window.location.href,
                    photoCount: 0,
                    totalSizeMB: 0,
                    targetTeamName: teams.find(t => t.id === post.teamId)?.displayName || post.teamId,
                    status: 'Error',
                    correlationId,
                    step: currentStep,
                    teamId: post.teamId,
                    channelId: post.channelId,
                    channelDisplayName: post.channelDisplayName,
                    folderPath: graphErr?.folderPath || folderPath,
                    operation: graphErr?.operation || 'syncPost',
                    httpStatus: graphErr?.status,
                    httpStatusText: graphErr?.statusText,
                    responseBody: graphErr?.responseBody,
                    errorMessage: err instanceof Error ? err.message : String(err),
                });

                if (!errorLogResult.ok) {
                    console.error(`[${correlationId}] AppLog Error-Write fehlgeschlagen:`, errorLogResult.status, errorLogResult.body);
                }
            } else {
                console.error(`[${correlationId}] AppLog Error-Write übersprungen, da kein Access Token verfügbar ist.`);
            }

            throw err;
        } finally {
            setPosting(false);
        }
    };

    // ÄNDERUNG: Callback Signatur angepasst
    const saveOfflinePost = async (files?: File[], subFolder: string = "", onProgress?: (current: number, total: number) => void) => {
        // ÄNDERUNG: Erlaube leeren Text, wenn Dateien vorhanden sind
        if (!selectedTeam || !selectedChannel || (!customText.trim() && (!files || files.length === 0))) return;
        const post = {
            teamId: selectedTeam.id,
            channelId: selectedChannel.id,
            channelDisplayName: selectedChannel.displayName,
            text: customText,
            imageUrls: [] as string[],
            timestamp: Date.now(),
            mentions: selectedMentions, // Mentions speichern
            subFolder: subFolder, // Subfolder speichern
            alsoPostToQualityTeam,
        };
        const postId = await db.posts.add(post);
        if (files && files.length > 0) {
            for (const file of files) {
                await db.images.add({ postId, file });
            }
        }
        const newPost = { ...post, id: postId };

        // Wenn Online, sync sofort — OHNE den offlinePosts State zu aktualisieren,
        // damit der Auto-Sync useEffect nicht nochmal denselben Post synct.
        const uploaded = isOnline && account;
        if (uploaded) {
            await syncPost(newPost, onProgress);
        } else {
            // Offline: zum State hinzufügen, damit Auto-Sync greift wenn wieder online
            setOfflinePosts([...offlinePosts, newPost]);
        }
        // Feedback via Snackbar anstatt alert
        setSnackbarMessage(t(uploaded ? 'teams.imagesSavedAndUploaded' : 'teams.imagesSavedOffline', { count: files?.length || 0 }));
        setSnackbarOpen(true);
        // Reset alles
        setCustomText('');
        setImageUrls([]);
        setAlsoPostToQualityTeam(false);
        setSelectedChannel(null);
        setSelectedTeam(null);
        setUploadSuccess(false);
        setSelectedMentions([]); // Reset Mentions
    };

    const syncOfflinePosts = async () => {
        if (!account || !isOnline || offlinePosts.length === 0) return;
        setPosting(true);
        console.log('Starte automatische Sync für', offlinePosts.length, 'Posts');
        for (const post of offlinePosts) {
            try {
                const correlationId = createCorrelationId();
                console.log(`[${correlationId}] Sync Post:`, post.id);
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
                console.log(`[${correlationId}] Site ID:`, siteId);

                // Bestimme den Ordner-Pfad
                let folderPath = getFolderPath(post.channelDisplayName);
                // NEW: Append Subfolder if exists
                if (post.subFolder) {
                    folderPath = `${folderPath}/${post.subFolder}`;
                }
                console.log(`[${correlationId}] Verwende Ordner-Pfad:`, folderPath);

                // Ordner prüfen/erstellen
                const folderExists = await checkFolderExists(accessToken, siteId, folderPath, {
                    correlationId,
                    teamId: post.teamId,
                    channelId: post.channelId,
                    channelDisplayName: post.channelDisplayName,
                });
                if (!folderExists) {
                    await createFolder(accessToken, siteId, folderPath, {
                        correlationId,
                        teamId: post.teamId,
                        channelId: post.channelId,
                        channelDisplayName: post.channelDisplayName,
                    });
                }

                // Hochladen
                const uploadedUrls: string[] = [];
                for (const img of images) {
                    console.log(`[${correlationId}] Lade Bild hoch:`, img.file.name);
                    let url: string;
                    if (img.file.size > 4 * 1024 * 1024) {
                        url = await uploadLargeFile(accessToken, siteId, img.file, folderPath, {
                            correlationId,
                            teamId: post.teamId,
                            channelId: post.channelId,
                            channelDisplayName: post.channelDisplayName,
                        });
                    } else {
                        url = await uploadSmallFile(accessToken, siteId, img.file, folderPath, {
                            correlationId,
                            teamId: post.teamId,
                            channelId: post.channelId,
                            channelDisplayName: post.channelDisplayName,
                        });
                    }
                    console.log(`[${correlationId}] Hochgeladene URL:`, url);
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
                    mentions,
                    { correlationId }
                );

                if (shouldMirrorToQualityTeam(post.teamId, post.alsoPostToQualityTeam)) {
                    try {
                        await postMessageToQualityTeamMirror(
                            accessToken,
                            post.text,
                            uploadedUrls,
                            files,
                            mentions,
                            { correlationId, teamId: QUALITY_TEAM_ID }
                        );
                    } catch (mirrorError) {
                        console.error(`[${correlationId}] Quality-team mirror failed during offline sync:`, mirrorError);
                    }
                }
                
                await db.posts.delete(post.id);
                await db.images.where('postId').equals(post.id).delete();
                console.log(`[${correlationId}] Post synced und gelöscht`);
            } catch (err) {
                console.error('Sync-Fehler für Post', post.id, ':', err);
            }
        }
        setOfflinePosts([]);
        setPosting(false);
        // Feedback via Snackbar anstatt alert
        setSnackbarMessage(t('teams.cachedPostsSynced', { count: offlinePosts.length }));
        setSnackbarOpen(true);
    };



   

    if (loading && account && isOnline) return <Typography variant="h6">{t('teams.loadingTeams')}</Typography>;  // Nur laden, wenn account und online
    if (error) return <Alert severity="error">{t('teams.errorPrefix')}{error}</Alert>;

    return (
        <Box sx={{ mt: 3 }}>
            {/* Offline-Hinweis */}
            {(!isOnline || !account) && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    {!isOnline ? t('teams.offlineMode') : t('teams.notLoggedIn')}
                </Alert>
            )}

            <Typography variant="h5" gutterBottom>
                {t('teams.selectTeam')} ({isOnline && account ? t('teams.onlineStatus') : t('teams.offlineCached')})
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
                renderInput={(params) => <TextField {...params} label={t('teams.searchTeams')} variant="outlined" />}
                sx={{ mb: 2 }}
            />
            {selectedTeam && (
                <>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={alsoPostToQualityTeam}
                                onChange={(event) => setAlsoPostToQualityTeam(event.target.checked)}
                            />
                        }
                        label={t('teams.qualityTeamCheckbox')}
                        sx={{ mt: 1, mb: 1 }}
                    />
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
                        // FIX: Pass cachedSubFolders prop
                        cachedSubFolders={cachedFavorites.find(f => f.id === selectedTeam.id)?.channelSubFolders || {}}
                        cachedAllChannels={cachedAllTeams.find(t => t.id === selectedTeam.id)?.channels || []}
                        cachedAllSubFolders={cachedAllTeams.find(t => t.id === selectedTeam.id)?.channelSubFolders || {}}
                        onSaveOffline={saveOfflinePost}
                    />
                    
                    {/* UI für Mentions hinzufügen */}
                    {teamMembers.length > 0 && (
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={teamMembers}
                            getOptionLabel={(option) => option.displayName}
                            value={selectedMentions}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            onChange={(event, newValue) => {
                                setSelectedMentions(newValue);
                            }}
                            renderOption={(props, option, { selected }) => (
                                <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Checkbox checked={selected} tabIndex={-1} disableRipple />
                                    {getMentionDropdownLabel(option)}
                                </Box>
                            )}
                            renderInput={(params) => (
                                <TextField 
                                    {...params} 
                                    label={t('teams.mentionLabel')} 
                                    placeholder={t('teams.mentionPlaceholder')} 
                                    variant="outlined"
                                />
                            )}
                            sx={{ mt: 2 }}
                        />
                    )}
                </>
            )}

            {/* Snackbar für Feedback */}
            <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)}>
                <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default TeamsList;