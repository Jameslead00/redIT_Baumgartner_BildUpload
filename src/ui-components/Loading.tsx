import { Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

export const Loading = () => {
    const { t } = useTranslation();
    return <Typography variant="h6">{t('auth.authInProgress')}</Typography>
}