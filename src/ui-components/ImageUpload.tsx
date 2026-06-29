import React, { useState, useRef, useEffect } from "react"; // Added useEffect
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { TextField, Button, Typography, Box, Alert, Paper, Grid, IconButton, Card, CardMedia, CardContent, Select, MenuItem, FormControl, InputLabel, SelectChangeEvent, Snackbar } from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";
import { db } from '../db';
import { logToSharePoint } from "../utils/Logger";
import { UploadProgress } from "./UploadProgress";
import { SubFolder } from '../db'; // Import shared interface
import { useTranslation } from "react-i18next";

export interface Team {
    id: string;
    displayName: string;
}

export interface Channel {
    id: string;
    displayName: string;
}

interface ImageUploadProps {
    team: Team;
    channel: Channel;
    onUploadSuccess: (urls: string[], files?: File[], base64Images?: string[]) => void;
    onCustomTextChange: (text: string) => void;
    customText: string;
    // ÄNDERUNG: Callback Signatur erweitert um subFolder
    onSaveOffline?: (files: File[], subFolder: string, onProgress?: (current: number, total: number) => void) => Promise<void> | void;
    cachedSubFolders?: SubFolder[]; // New Prop
    initialSelectedSubFolder?: string; // New prop for testing
}

interface FileData {
    name: string;
    type: string;
    size: number;
    data: string;
}

export interface GraphOperationContext {
    operation: string;
    teamId?: string;
    channelId?: string;
    channelDisplayName?: string;
    folderPath?: string;
    correlationId?: string;
}

export class GraphOperationError extends Error {
    public readonly status: number;
    public readonly statusText: string;
    public readonly responseBody: string;
    public readonly operation: string;
    public readonly folderPath?: string;
    public readonly teamId?: string;
    public readonly channelId?: string;
    public readonly channelDisplayName?: string;
    public readonly correlationId?: string;

    constructor(message: string, params: {
        status: number;
        statusText: string;
        responseBody: string;
        operation: string;
        folderPath?: string;
        teamId?: string;
        channelId?: string;
        channelDisplayName?: string;
        correlationId?: string;
    }) {
        super(message);
        this.name = 'GraphOperationError';
        this.status = params.status;
        this.statusText = params.statusText;
        this.responseBody = params.responseBody;
        this.operation = params.operation;
        this.folderPath = params.folderPath;
        this.teamId = params.teamId;
        this.channelId = params.channelId;
        this.channelDisplayName = params.channelDisplayName;
        this.correlationId = params.correlationId;
    }
}

const safeReadResponseText = async (response: Response): Promise<string> => {
    try {
        return await response.text();
    } catch {
        return '';
    }
};

const toGraphOperationError = async (
    response: Response,
    context: GraphOperationContext,
    fallbackMessage: string
): Promise<GraphOperationError> => {
    const responseBody = await safeReadResponseText(response);
    const message = `${fallbackMessage}: ${response.status} ${response.statusText}`;
    return new GraphOperationError(message, {
        status: response.status,
        statusText: response.statusText,
        responseBody,
        operation: context.operation,
        folderPath: context.folderPath,
        teamId: context.teamId,
        channelId: context.channelId,
        channelDisplayName: context.channelDisplayName,
        correlationId: context.correlationId,
    });
};

export const isGraphOperationError = (err: unknown): err is GraphOperationError => {
    return err instanceof GraphOperationError;
};

export const isImageFile = (file: File): boolean => file.type.startsWith('image/');

export const isPdfFile = (file: File): boolean => file.type === 'application/pdf';

const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
const ALLOWED_VIDEO_MIME_TYPES = new Set([
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/avi',
    'video/msvideo',
    'video/webm',
    'video/x-matroska',
]);

const MAX_VIDEO_FILE_SIZE_MB = 100;
const MAX_VIDEO_FILE_SIZE_BYTES = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;

const getFileExtension = (fileName: string): string => {
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === fileName.length - 1) {
        return '';
    }
    return fileName.substring(dotIndex + 1).toLowerCase();
};

export const isVideoFile = (file: File): boolean => {
    const extension = getFileExtension(file.name);
    return ALLOWED_VIDEO_MIME_TYPES.has(file.type) || ALLOWED_VIDEO_EXTENSIONS.includes(extension);
};

export const isSupportedUploadFile = (file: File): boolean => isImageFile(file) || isPdfFile(file) || isVideoFile(file);

const getFilePreviewLabel = (file: File): string => {
    if (isPdfFile(file)) {
        return 'PDF';
    }
    if (isVideoFile(file)) {
        return 'VIDEO';
    }
    return file.name.charAt(0).toUpperCase();
};

// Hilfsfunktion: Base64 zu Blob
const dataURLToBlob = (dataURL: string): Blob => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};

// Neue Hilfsfunktion: Prüfe, ob "General"-Kanal existiert und gib den Pfad zurück
export const getFolderPath = (channelDisplayName: string): string => {
    return `${channelDisplayName}/Bilder`;  // Direkt im Kanal
};

// Hilfsfunktionen außerhalb der Komponente definieren
export const checkFolderExists = async (
    accessToken: string,
    siteId: string,
    folderPath: string,
    context: Omit<GraphOperationContext, 'operation' | 'folderPath'> = {}
): Promise<boolean> => {
    const checkResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (checkResponse.ok) {
        return true;
    }

    if (checkResponse.status === 404) {
        return false;
    }

    throw await toGraphOperationError(
        checkResponse,
        {
            operation: 'checkFolderExists',
            folderPath,
            ...context,
        },
        `Failed to check folder existence for ${folderPath}`
    );
};

export const createFolder = async (
    accessToken: string,
    siteId: string,
    folderPath: string,
    context: Omit<GraphOperationContext, 'operation' | 'folderPath'> = {}
): Promise<void> => {
    const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/'));  // z.B. "Shared Documents/General"
    const folderName = folderPath.split('/').pop()!;  // z.B. "Bilder
    
    const createResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${parentPath}:/children`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: folderName,
            folder: {},
        }),
    });

    if (createResponse.ok) {
        return;
    }

    if (createResponse.status === 409) {
        console.warn(`[${context.correlationId || 'no-correlation'}] Folder already exists during createFolder: ${folderPath}`);
        return;
    }
    
    throw await toGraphOperationError(
        createResponse,
        {
            operation: 'createFolder',
            folderPath,
            ...context,
        },
        `Failed to create ${folderName} folder`
    );
};

export const uploadLargeFile = async (
    accessToken: string,
    siteId: string,
    file: File,
    folderPath: string,
    context: Omit<GraphOperationContext, 'operation' | 'folderPath'> = {}
): Promise<string> => {
    const filePath = `${folderPath}/${file.name}`;
    
    // Erstelle Upload-Session
    const sessionResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}:/createUploadSession`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
    });
    
    if (!sessionResponse.ok) {
        throw await toGraphOperationError(
            sessionResponse,
            {
                operation: 'createUploadSession',
                folderPath,
                ...context,
            },
            `Failed to create upload session for ${file.name}`
        );
    }
    
    const sessionData = await sessionResponse.json();
    const uploadUrl = sessionData.uploadUrl;
    
    // Lade in Chunks hoch (320KB Chunks)
    const chunkSize = 327680; // 320KB
    let uploadedBytes = 0;
    
    while (uploadedBytes < file.size) {
        const chunk = file.slice(uploadedBytes, uploadedBytes + chunkSize);
        const endByte = Math.min(uploadedBytes + chunk.size - 1, file.size - 1);
        
        const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                "Content-Length": chunk.size.toString(),
                "Content-Range": `bytes ${uploadedBytes}-${endByte}/${file.size}`,
            },
            body: chunk,
        });
        
        if (!uploadResponse.ok) {
            throw await toGraphOperationError(
                uploadResponse,
                {
                    operation: 'uploadLargeFileChunk',
                    folderPath,
                    ...context,
                },
                `Failed to upload chunk for ${file.name}`
            );
        }
        
        uploadedBytes += chunk.size;
    }
    
    // Gib die Web-URL der hochgeladenen Datei zurück
    const finalResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!finalResponse.ok) {
        throw await toGraphOperationError(
            finalResponse,
            {
                operation: 'getUploadedFileMetadata',
                folderPath,
                ...context,
            },
            `Failed to retrieve uploaded file metadata for ${file.name}`
        );
    }

    const finalData = await finalResponse.json();
    return finalData.webUrl;
};

export const uploadSmallFile = async (
    accessToken: string,
    siteId: string,
    file: File,
    folderPath: string,
    context: Omit<GraphOperationContext, 'operation' | 'folderPath'> = {}
): Promise<string> => {
    const uploadResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}/${file.name}:/content`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": file.type,
        },
        body: file,
    });
    
    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new GraphOperationError(`Failed to upload ${file.name}: ${uploadResponse.status} ${uploadResponse.statusText}`, {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            responseBody: errorText,
            operation: 'uploadSmallFile',
            folderPath,
            teamId: context.teamId,
            channelId: context.channelId,
            channelDisplayName: context.channelDisplayName,
            correlationId: context.correlationId,
        });
    }
    
    // Hole die Web-URL
    const urlResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}/${file.name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!urlResponse.ok) {
        throw await toGraphOperationError(
            urlResponse,
            {
                operation: 'getUploadedFileMetadata',
                folderPath,
                ...context,
            },
            `Failed to retrieve uploaded file metadata for ${file.name}`
        );
    }

    const urlData = await urlResponse.json();
    return urlData.webUrl;
};

// Neue Hilfsfunktion: Bild skalieren und zu base64 encodieren
// Exportieren, damit andere Komponenten sie nutzen können
export const resizeImage = (file: File, maxWidth: number = 200, maxHeight: number = 200, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            
            // Berechne neue Größe, behalte Aspect Ratio
            let { width, height } = img;
            if (width > height) {
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Zu base64 konvertieren (JPEG für kleinere Größe)
            canvas.toBlob((blob) => {
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                } else {
                    reject(new Error('Canvas toBlob failed'));
                }
            }, 'image/jpeg', quality);  // Verwende quality
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
};

// Neue Hilfsfunktion: Mehrere Dateien zu base64 encodieren
export const encodeFilesToBase64 = async (files: File[]): Promise<string[]> => {
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) {
        return [];
    }

    let base64Images = await Promise.all(imageFiles.map(file => resizeImage(file, 150, 150, 0.4)));  // Start mit 40% Qualität
    let totalSize = base64Images.reduce((sum, img) => sum + (img.length * 0.75), 0);

    // Reduziere Qualität weiter, wenn über 24 KB
    let quality = 0.4;
    while (totalSize > 24000 && quality > 0.1) {
        quality -= 0.05;  // Kleinere Schritte für feinere Anpassung
        base64Images = await Promise.all(imageFiles.map(file => resizeImage(file, 150, 150, quality)));
        totalSize = base64Images.reduce((sum, img) => sum + (img.length * 0.75), 0);
    }

    return base64Images;
};

const generateFilePreview = async (file: File): Promise<string> => {
    if (!isImageFile(file)) {
        return '';
    }

    return resizeImage(file, 100, 100, 0.5);
};

const ImageUpload: React.FC<ImageUploadProps> = ({ 
    team, 
    channel, 
    onUploadSuccess, 
    onCustomTextChange, 
    customText, 
    onSaveOffline,
    cachedSubFolders = [], // Default empty
    initialSelectedSubFolder = "" // New prop for testing
}) => {
    const { t } = useTranslation();
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    // Snackbar state for unified feedback
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [progressData, setProgressData] = useState<{ current: number; total: number; percent: number }>({ current: 0, total: 0, percent: 0 });
    
    // NEW: State for Subfolders
    const [subFolders, setSubFolders] = useState<SubFolder[]>([]);
    const [selectedSubFolder, setSelectedSubFolder] = useState<string>(initialSelectedSubFolder); // Use initial value
    const [loadingFolders, setLoadingFolders] = useState<boolean>(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isOnline = navigator.onLine;

    // NEW: Fetch Subfolders when Channel changes
    useEffect(() => {
        const fetchSubFolders = async () => {
            setSubFolders([]);
            // Removed setSelectedSubFolder(""); to keep initial value

            // Offline or no account: Use cached subfolders
            if (!account || !isOnline) {
                if (cachedSubFolders && cachedSubFolders.length > 0) {
                    setSubFolders(cachedSubFolders);
                } else {
                    setSubFolders([]);
                }
                setLoadingFolders(false);
                return;
            }
            
            setLoadingFolders(true);

            const request = { ...loginRequest, account };

            try {
                const response = await instance.acquireTokenSilent(request);
                const accessToken = response.accessToken;

                // 1. Get Site ID
                const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/groups/${team.id}/sites/root`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (!siteResponse.ok) throw new Error("Failed to get site ID");
                const siteData = await siteResponse.json();
                const siteId = siteData.id;

                // 2. Get Path to "Bilder"
                const folderPath = getFolderPath(channel.displayName); // e.g., "General/Bilder"

                // 3. List Children of "Bilder"
                const childrenResponse = await fetch(
                    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/children?filter=folder ne null&select=id,name`, 
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );

                if (childrenResponse.ok) {
                    const data = await childrenResponse.json();
                    const items = Array.isArray(data.value) ? data.value : [];
                    setSubFolders(items.map((item: any) => ({ id: item.id, name: item.name })));
                } else if (childrenResponse.status === 404) {
                    // "Bilder" folder doesn't exist yet, which is fine.
                    console.log("Bilder folder does not exist yet.");
                    setSubFolders([]); // Explicitly set to empty
                }
            } catch (err) {
                console.error("Error fetching subfolders:", err);
                setSubFolders([]); // Set to empty on error
            } finally {
                setLoadingFolders(false);
            }
        };

        fetchSubFolders();
    }, [team.id, channel.displayName, account, isOnline, instance, cachedSubFolders]); // Add cachedSubFolders to deps

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const incomingFiles = Array.from(event.target.files).filter(isSupportedUploadFile);
            const oversizedVideos = incomingFiles.filter((file) => isVideoFile(file) && file.size > MAX_VIDEO_FILE_SIZE_BYTES);
            const newFiles = incomingFiles.filter((file) => !oversizedVideos.includes(file));

            if (oversizedVideos.length > 0) {
                setSnackbarMessage(t('upload.videoTooLarge', { count: oversizedVideos.length, maxSizeMB: MAX_VIDEO_FILE_SIZE_MB }));
                setSnackbarSeverity('error');
                setSnackbarOpen(true);
            }

            if (newFiles.length === 0) {
                event.target.value = "";
                return;
            }

            setSelectedFiles(prev => [...prev, ...newFiles]);
            
            const generateThumbnails = async () => {
                const newThumbnails = await Promise.all(newFiles.map(file => generateFilePreview(file)));
                setThumbnails(prev => [...prev, ...newThumbnails]);
            };
            void generateThumbnails();
            
            event.target.value = "";  // Reset input
        }
    };

    const handleFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleRemoveSelection = () => {
        setSelectedFiles([]);
        setThumbnails([]);  // Thumbnails zurücksetzen
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const uploadImages = async () => {
        if (!account || selectedFiles.length === 0) return;

        setUploading(true);
        setError(null);
        const correlationId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const request = { ...loginRequest, account };

        try {
            const response = await instance.acquireTokenSilent(request);
            const accessToken = response.accessToken;

            // Schritt 1: Hole SharePoint Site-ID
            const siteResponse = await fetch(`https://graph.microsoft.com/v1.0/groups/${team.id}/sites/root`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!siteResponse.ok) throw new Error("Failed to get site ID");
            const siteData = await siteResponse.json();
            const siteId = siteData.id;

            // Schritt 2: Bestimme den Ordner-Pfad
            let folderPath = getFolderPath(channel.displayName);
            
            // NEW: Append Subfolder if selected
            if (selectedSubFolder) {
                folderPath = `${folderPath}/${selectedSubFolder}`;
            }
            
            console.log(`[${correlationId}] Verwende Ordner-Pfad:`, folderPath);

            // Schritt 3: Überprüfe und erstelle den Ordner
            // Note: If subfolder is selected, we assume it exists (as per requirement), 
            // but checkFolderExists/createFolder handles the recursive creation if needed or we can rely on it existing.
            // The current createFolder implementation might fail if parent doesn't exist, 
            // but since "Bilder" is parent and we check it, it should be fine.
            const folderExists = await checkFolderExists(accessToken, siteId, folderPath, {
                correlationId,
                teamId: team.id,
                channelId: channel.id,
                channelDisplayName: channel.displayName,
            });
            if (!folderExists) {
                await createFolder(accessToken, siteId, folderPath, {
                    correlationId,
                    teamId: team.id,
                    channelId: channel.id,
                    channelDisplayName: channel.displayName,
                });
            }

            // Schritt 4: Lade Bilder hoch
            const imageUrls: string[] = [];
            for (const file of selectedFiles) {
                let url: string;
                if (file.size > 4 * 1024 * 1024) {
                    url = await uploadLargeFile(accessToken, siteId, file, folderPath, {
                        correlationId,
                        teamId: team.id,
                        channelId: channel.id,
                        channelDisplayName: channel.displayName,
                    });
                } else {
                    url = await uploadSmallFile(accessToken, siteId, file, folderPath, {
                        correlationId,
                        teamId: team.id,
                        channelId: channel.id,
                        channelDisplayName: channel.displayName,
                    });
                }
                imageUrls.push(url);
            }

            // LOGGING HINZUFÜGEN
            try {
                const totalSizeMB = selectedFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024);
                await logToSharePoint(accessToken, {
                    userEmail: account.username,
                    // NEW: Log the specific subfolder in sourceUrl
                    sourceUrl: window.location.href,
                    photoCount: selectedFiles.length,
                    totalSizeMB: parseFloat(totalSizeMB.toFixed(2)),
                    targetTeamName: team.displayName,
                    status: 'Success',
                    correlationId,
                    step: 'directUpload',
                    teamId: team.id,
                    channelId: channel.id,
                    channelDisplayName: channel.displayName,
                    folderPath,
                    operation: 'uploadImages',
                });
            } catch (logErr) {
                console.error(`[${correlationId}] Logging failed but upload was successful`, logErr);
            }

            // Schritt 5: Encodiere alle Bilder
            const base64Images = await encodeFilesToBase64(selectedFiles);
            // Schritt 6: Erfolgreich hochgeladen - Callback aufrufen
            onUploadSuccess(imageUrls, selectedFiles, base64Images);  // base64Images übergeben
            // Zeige Snackbar anstatt Inline-Alert
            setSnackbarMessage(t('upload.uploadSuccess', { count: selectedFiles.length }));
            setSnackbarSeverity('success');
            setSnackbarOpen(true);
        } catch (err) {
            // LOGGING ERROR (Optional, aber hilfreich)
            if (account) {
                // Wir versuchen einen Error-Log zu senden, falls möglich (braucht Token)
                // Da wir hier im catch sind, ist accessToken evtl. nicht verfügbar,
                // daher lassen wir es hier weg um "minimal" zu bleiben und keine neuen Fehler zu riskieren.
            }

            if (err instanceof InteractionRequiredAuthError) {
                // Optional: handle interaction required (e.g., trigger login)
            } else {
                const msg = err instanceof Error ? err.message : t('upload.uploadFailed');
                if (isGraphOperationError(err)) {
                    console.error(`[${correlationId}] Upload Graph-Fehler`, {
                        operation: err.operation,
                        status: err.status,
                        statusText: err.statusText,
                        responseBody: err.responseBody,
                        teamId: err.teamId,
                        channelId: err.channelId,
                        channelDisplayName: err.channelDisplayName,
                        folderPath: err.folderPath,
                    });
                } else {
                    console.error(`[${correlationId}] Upload-Fehler`, err);
                }
                setError(msg);
                setSnackbarMessage(msg);
                setSnackbarSeverity('error');
                setSnackbarOpen(true);
            }
        } finally {
            setUploading(false);
        }
    };

    const handleUpload = async () => {
        if (isOnline && account) {
            if (onSaveOffline) {
                setUploading(true);
                setProgressData({ current: 0, total: selectedFiles.length, percent: 0 });
                try {
                    await onSaveOffline(selectedFiles, selectedSubFolder, (current, total) => {
                        const percent = Math.round(((current - 1) / total) * 100);
                        setProgressData({ current, total, percent });
                    });
                    // Erfolgreich: lokale State zurücksetzen
                    setSelectedFiles([]);
                    setThumbnails([]);
                } catch (e) {
                    console.error(e);
                    setSnackbarMessage(t('upload.uploadFailed'));
                    setSnackbarSeverity('error');
                    setSnackbarOpen(true);
                } finally {
                    setUploading(false);
                }
            } else {
                await uploadImages();
            }
        } else {
            if (onSaveOffline) {
                // Pass selectedSubFolder
                await onSaveOffline(selectedFiles, selectedSubFolder);
            }
            setSnackbarMessage(t('upload.savedOffline', { count: selectedFiles.length }));
            setSnackbarSeverity('success');
            setSnackbarOpen(true);
            setSelectedFiles([]);
            setThumbnails([]);
        }
    };

    return (
        <Paper elevation={1} sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
                {t('upload.title')}
            </Typography>
            
            {/* FIX: Show if online (even if empty, to show "None found") OR if we have cached subfolders */}
            {(isOnline || subFolders.length > 0) && (
                <FormControl fullWidth variant="outlined" sx={{ mb: 2 }} disabled={loadingFolders || (subFolders.length === 0 && !isOnline)}>
                    <InputLabel id="subfolder-select-label">{t('upload.subfolderLabel')}</InputLabel>
                    <Select
                        labelId="subfolder-select-label"
                        value={selectedSubFolder}
                        onChange={(e: SelectChangeEvent) => setSelectedSubFolder(e.target.value as string)}
                        label={t('upload.subfolderLabel')}
                    >
                        <MenuItem value="">
                            <em>{t('upload.noSubfolder')}</em>
                        </MenuItem>
                        {subFolders.map((folder) => (
                            <MenuItem key={folder.id} value={folder.name}>
                                {folder.name}
                            </MenuItem>
                        ))}
                    </Select>
                    {subFolders.length === 0 && !loadingFolders && (
                        <Typography variant="caption" color="textSecondary" sx={{ ml: 1, mt: 0.5 }}>
                            {isOnline ? t('upload.noSubfoldersFound') : t('upload.noSubfoldersCached')}
                        </Typography>
                    )}
                </FormControl>
            )}

            <input
                type="file"
                accept="image/*,application/pdf,.mp4,.mov,.avi,.webm,.mkv"
                multiple
                onChange={handleFileChange}
                ref={fileInputRef}
                style={{ display: 'none' }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleFileSelect}
                    sx={{ flexGrow: 1, mr: 1 }}
                >
                    {selectedFiles.length > 0 ? t('upload.filesSelected', { count: selectedFiles.length }) : t('upload.selectFiles')}
                </Button>
                {selectedFiles.length > 0 && (
                    <IconButton
                        color="error"
                        onClick={handleRemoveSelection}
                        title={t('upload.removeAll')}
                    >
                        <DeleteIcon />
                    </IconButton>
                )}
            </Box>
            {selectedFiles.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Grid container spacing={2}>
                        {selectedFiles.map((file, index) => (
                            <Grid item xs={6} sm={4} md={3} key={index}>
                                <Card>
                                    <Box sx={{ position: 'relative' }}>
                                        {thumbnails[index] ? (
                                            <CardMedia
                                                component="img"
                                                height="100"
                                                image={thumbnails[index]}
                                                alt={file.name}
                                                sx={{ objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <Box
                                                sx={{
                                                    height: 100,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: '#f4f4f4',
                                                    color: '#d32f2f',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.08em'
                                                }}
                                            >
                                                {getFilePreviewLabel(file)}
                                            </Box>
                                        )}
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => handleRemoveFile(index)}
                                            sx={{
                                                position: 'absolute',
                                                top: 8,
                                                right: 8,
                                                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                                '&:hover': { backgroundColor: 'rgba(255, 255, 255, 1)' }
                                            }}
                                            title={t('upload.remove')}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                    <CardContent sx={{ p: 1 }}>
                                        <Typography variant="body2" noWrap>
                                            {file.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {(file.size / 1024 / 1024).toFixed(2)} MB
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}
            {/* TextField immer anzeigen, auch ohne Dateien */}
            <TextField
                fullWidth
                label={t('upload.messageLabel')}
                value={customText}
                onChange={(e) => onCustomTextChange(e.target.value)}
                variant="outlined"
                sx={{ mb: 2 }}
            />

            {/* NEU: Progress Komponente einbinden */}
            <UploadProgress 
                uploading={uploading} 
                progress={progressData.percent} 
                currentFile={progressData.current}
                totalFiles={progressData.total}
            />

            <Button
                variant="contained"
                color="secondary"
                onClick={handleUpload}
                disabled={uploading || ((isOnline && selectedFiles.length === 0 && !customText.trim()) || (!isOnline && !customText.trim() && !selectedFiles.length))}
                fullWidth
                sx={{ mb: 2 }}
            >
                {uploading ? t('upload.uploading', { current: progressData.current, total: progressData.total }) : (isOnline ? t('upload.uploadButton') : t('upload.saveOffline'))}
                </Button>
                <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={() => setSnackbarOpen(false)}>
                    <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: '100%' }}>
                        {snackbarMessage}
                    </Alert>
                </Snackbar>
        </Paper>
    );
};

export default ImageUpload;