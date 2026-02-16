import React from 'react';
import { Box, LinearProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface UploadProgressProps {
    uploading: boolean;
    progress: number;
    currentFile: number;
    totalFiles: number;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ uploading, progress, currentFile, totalFiles }) => {
    const { t } = useTranslation();
    if (!uploading) return null;

    return (
        <Box sx={{ width: '100%', mb: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 0.5 }}>
                {t('upload.uploadingImage', { current: currentFile, total: totalFiles })}
            </Typography>
        </Box>
    );
};