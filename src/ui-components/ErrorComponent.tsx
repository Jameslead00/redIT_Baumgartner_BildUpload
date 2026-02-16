import { Typography } from "@mui/material";
import { MsalAuthenticationResult } from "@azure/msal-react";
import { useTranslation } from "react-i18next";

export const ErrorComponent: React.FC<MsalAuthenticationResult> = ({error}) => {
    const { t } = useTranslation();
    return <Typography variant="h6">{t('error.occurred')}{error ? error.errorCode : t('error.unknown')}</Typography>;
}