import React from 'react';
import { Box, LinearProgress, Typography } from "@mui/material";

interface UploadProgressProps {
    uploading: boolean;
    progress: number;
    currentFile: number;
    totalFiles: number;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ uploading, progress, currentFile, totalFiles }) => {
    if (!uploading) return null;

    return (
        <Box sx={{ width: '100%', mb: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 0.5 }}>
                {`Uploading image ${currentFile} of ${totalFiles}`}
            </Typography>
        </Box>
    );
};