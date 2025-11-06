// filepath: /workspaces/microsoft-authentication-library-for-js/samples/msal-react-samples/typescript-sample/src/ui-components/ImageUpload.tsx
import React, { useState, useRef } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { TextField, Button, Typography, Box, Alert, Paper, Grid, IconButton, Card, CardMedia, CardContent } from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";

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
    onUploadSuccess: (urls: string[]) => void;
    onCustomTextChange: (text: string) => void;
    customText: string;
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

// Hilfsfunktionen außerhalb der Komponente definieren
const checkFolderExists = async (accessToken: string, siteId: string): Promise<boolean> => {
    const folderPath = "Shared Documents/Bilder";
    
    const checkResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    return checkResponse.ok;
};

const createFolder = async (accessToken: string, siteId: string): Promise<void> => {
    const createResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Shared Documents:/children`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: "Bilder",
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename",
        }),
    });
    
    if (!createResponse.ok) {
        throw new Error("Failed to create Bilder folder");
    }
};

const uploadLargeFile = async (accessToken: string, siteId: string, file: File): Promise<string> => {
    const filePath = `Shared Documents/Bilder/${file.name}`;
    
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

const uploadSmallFile = async (accessToken: string, siteId: string, file: File): Promise<string> => {
    const uploadResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Shared Documents/Bilder/${file.name}:/content`, {
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
    const urlResponse = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/Shared Documents/Bilder/${file.name}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const urlData = await urlResponse.json();
    return urlData.webUrl;
};

const ImageUpload: React.FC<ImageUploadProps> = ({ team, channel, onUploadSuccess, onCustomTextChange, customText }) => {
    const { instance, accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);  // Ändere zu File[]
    const [uploading, setUploading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const newFiles = Array.from(event.target.files);
            setSelectedFiles(prev => [...prev, ...newFiles]);  // Füge neue Dateien hinzu
            event.target.value = "";  // Reset input für nächste Auswahl
        }
    };

    const handleFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleRemoveSelection = () => {
        setSelectedFiles([]);  // Entferne alle
        if (fileInputRef.current) {
            fileInputRef.current.value = "";  // Reset file input
        }
    };

    const uploadImages = async () => {
        if (!account || selectedFiles.length === 0) return;

        // Behalte nur Online-Upload-Logik
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

            // Schritt 2: Überprüfe und erstelle den "Bilder"-Ordner, falls er nicht existiert
            const folderExists = await checkFolderExists(accessToken, siteId);
            if (!folderExists) {
                await createFolder(accessToken, siteId);
            }

            // Schritt 3: Lade Bilder hoch und sammle URLs
            const imageUrls: string[] = [];
            for (const file of selectedFiles) {
                let url: string;
                if (file.size > 4 * 1024 * 1024) {
                    url = await uploadLargeFile(accessToken, siteId, file);
                } else {
                    url = await uploadSmallFile(accessToken, siteId, file);
                }
                imageUrls.push(url);
            }

            // Schritt 4: Erfolgreich hochgeladen - Callback aufrufen
            onUploadSuccess(imageUrls);
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
                                            height="140"
                                            image={URL.createObjectURL(file)}
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
            <Button
                variant="contained"
                color="secondary"
                onClick={uploadImages}
                disabled={!selectedFiles.length || uploading}
                fullWidth
                sx={{ mb: 2 }}
            >
                {uploading ? "Uploading..." : "Datei(en) hochladen"}
            </Button>
            {success && (
                <TextField
                    fullWidth
                    label="Nachricht zum Beitrag hinzufügen (optional)"
                    value={customText}
                    onChange={(e) => onCustomTextChange(e.target.value)}
                    variant="outlined"
                    sx={{ mb: 2 }}
                />
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }}>Error: {error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}
        </Paper>
    );
};

export default ImageUpload;