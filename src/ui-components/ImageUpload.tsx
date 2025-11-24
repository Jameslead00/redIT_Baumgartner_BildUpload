// filepath: /workspaces/microsoft-authentication-library-for-js/samples/msal-react-samples/typescript-sample/src/ui-components/ImageUpload.tsx
import React, { useState, useRef } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { TextField, Button, Typography, Box, Alert, Paper, Grid, IconButton, Card, CardMedia, CardContent } from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";
import { db } from '../db';

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
    onUploadSuccess: (urls: string[], files?: File[], base64Images?: string[]) => void;  // base64Images hinzufügen
    onCustomTextChange: (text: string) => void;
    customText: string;
    onSaveOffline?: (files: File[]) => void;
}

interface FileData {
    name: string;
    type: string;
    size: number;
    data: string;
}

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
export const checkFolderExists = async (accessToken: string, siteId: string, folderPath: string): Promise<boolean> => {
    const checkResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    return checkResponse.ok;
};

export const createFolder = async (accessToken: string, siteId: string, folderPath: string): Promise<void> => {
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
            "@microsoft.graph.conflictBehavior": "rename",
        }),
    });
    
    if (!createResponse.ok) {
        throw new Error(`Failed to create ${folderName} folder`);
    }
};

export const uploadLargeFile = async (accessToken: string, siteId: string, file: File, folderPath: string): Promise<string> => {
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
        throw new Error(`Failed to create upload session for ${file.name}`);
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
            throw new Error(`Failed to upload chunk for ${file.name}`);
        }
        
        uploadedBytes += chunk.size;
    }
    
    // Gib die Web-URL der hochgeladenen Datei zurück
    const finalResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${filePath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const finalData = await finalResponse.json();
    return finalData.webUrl;
};

export const uploadSmallFile = async (accessToken: string, siteId: string, file: File, folderPath: string): Promise<string> => {
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
        throw new Error(`Failed to upload ${file.name}: ${uploadResponse.status} ${errorText}`);
    }
    
    // Hole die Web-URL
    const urlResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}/${file.name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
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
    // Kein Limit mehr – alle Bilder erlauben
    let base64Images = await Promise.all(files.map(file => resizeImage(file, 150, 150, 0.4)));  // Start mit 40% Qualität
    let totalSize = base64Images.reduce((sum, img) => sum + (img.length * 0.75), 0);

    // Reduziere Qualität weiter, wenn über 24 KB
    let quality = 0.4;
    while (totalSize > 24000 && quality > 0.1) {
        quality -= 0.05;  // Kleinere Schritte für feinere Anpassung
        base64Images = await Promise.all(files.map(file => resizeImage(file, 150, 150, quality)));
        totalSize = base64Images.reduce((sum, img) => sum + (img.length * 0.75), 0);
    }

    return base64Images;
};

const ImageUpload: React.FC<ImageUploadProps> = ({ team, channel, onUploadSuccess, onCustomTextChange, customText, onSaveOffline }) => {
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isOnline = navigator.onLine;  // Oder prop übergeben

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const newFiles = Array.from(event.target.files);
            setSelectedFiles(prev => [...prev, ...newFiles]);
            
            // Erzeuge Thumbnails für Vorschau (klein und schnell)
            const generateThumbnails = async () => {
                const newThumbnails = await Promise.all(newFiles.map(file => resizeImage(file, 100, 100, 0.5)));  // Kleine Thumbnails
                setThumbnails(prev => [...prev, ...newThumbnails]);
            };
            generateThumbnails();
            
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
        setSuccess(null);

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
            const folderPath = getFolderPath(channel.displayName);  // Kein await
            console.log('Verwende Ordner-Pfad:', folderPath);

            // Schritt 3: Überprüfe und erstelle den Ordner
            const folderExists = await checkFolderExists(accessToken, siteId, folderPath);
            if (!folderExists) {
                await createFolder(accessToken, siteId, folderPath);
            }

            // Schritt 4: Lade Bilder hoch
            const imageUrls: string[] = [];
            for (const file of selectedFiles) {
                let url: string;
                if (file.size > 4 * 1024 * 1024) {
                    url = await uploadLargeFile(accessToken, siteId, file, folderPath);
                } else {
                    url = await uploadSmallFile(accessToken, siteId, file, folderPath);
                }
                imageUrls.push(url);
            }

            // Schritt 5: Encodiere alle Bilder
            const base64Images = await encodeFilesToBase64(selectedFiles);

            // Schritt 6: Erfolgreich hochgeladen - Callback aufrufen
            onUploadSuccess(imageUrls, selectedFiles, base64Images);  // base64Images übergeben
            setSuccess(`${selectedFiles.length} image(s) uploaded successfully!`);
        } catch (err) {
            if (err instanceof InteractionRequiredAuthError) {
                instance.acquireTokenPopup(request).then(uploadImages);
            } else {
                setError(err instanceof Error ? err.message : "Upload failed");
            }
        } finally {
            setUploading(false);
        }
    };

    const handleUpload = async () => {
        if (isOnline && account) {
            // Online: Speichere wie Offline, dann sync
            if (onSaveOffline) {
                onSaveOffline(selectedFiles);
            }
            setSuccess(`${selectedFiles.length} image(s) saved and will upload automatically!`);
            setSelectedFiles([]);
        } else {
            // Offline: Speichere lokal
            if (onSaveOffline) {
                onSaveOffline(selectedFiles);
            }
            setSuccess(`${selectedFiles.length} image(s) saved offline!`);
            setSelectedFiles([]);
        }
    };

    return (
        <Paper elevation={1} sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
                Bilder hochladen in Ordner "Bilder"
            </Typography>
            <input
                type="file"
                accept="image/*"
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
                    {selectedFiles.length > 0 ? `${selectedFiles.length} Datei(en) ausgewählt` : "Dateien auswählen"}
                </Button>
                {selectedFiles.length > 0 && (
                    <IconButton
                        color="error"
                        onClick={handleRemoveSelection}
                        title="Alle entfernen"
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
                                        <CardMedia
                                            component="img"
                                            height="100"  // Kleiner für Performance
                                            image={thumbnails[index] || ''}  // Verwende thumbnail
                                            alt={file.name}
                                            sx={{ objectFit: 'cover' }}
                                        />
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
                                            title="Entfernen"
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
            {/* TextField immer anzeigen, wenn Dateien ausgewählt */}
            {selectedFiles.length > 0 && (
                <TextField
                    fullWidth
                    label="Nachricht zum Beitrag hinzufügen"
                    value={customText}
                    onChange={(e) => onCustomTextChange(e.target.value)}
                    variant="outlined"
                    sx={{ mb: 2 }}
                />
            )}
            <Button
                variant="contained"
                color="secondary"
                onClick={handleUpload}
                disabled={!selectedFiles.length || uploading || (!isOnline && !customText.trim())}  // Deaktiviere, wenn offline und keine Nachricht
                fullWidth
                sx={{ mb: 2 }}
            >
                {uploading ? "Uploading..." : (isOnline ? "Datei(en) hochladen" : "Offline speichern")}
            </Button>
            {error && <Alert severity="error" sx={{ mt: 2 }}>Error: {error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}
        </Paper>
    );
};

export default ImageUpload;