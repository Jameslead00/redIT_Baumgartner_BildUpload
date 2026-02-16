import { useMsal } from "@azure/msal-react";
import Button from "@mui/material/Button";
import { loginRequest } from "../authConfig";
import { useTranslation } from "react-i18next";

export const SignInButton = () => {
    const { t } = useTranslation();
    const { instance } = useMsal();

    const handleLogin = () => {
        instance.loginPopup(loginRequest);
    }

    return (
        <div>
            <Button
                onClick={handleLogin}
                color="inherit"
            >
                {t('auth.login')}
            </Button>
        </div>
    )
};