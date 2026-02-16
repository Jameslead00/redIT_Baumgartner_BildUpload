import React, { useState, useEffect } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Wifi, WifiOff } from "@mui/icons-material";
import { Tooltip, Box, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { useTranslation } from "react-i18next";
import WelcomeName from "./WelcomeName";
import SignInSignOutButton from "./SignInSignOutButton";
import { Link as RouterLink } from "react-router-dom";

const NavBar = () => {
    const { t, i18n } = useTranslation();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

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

    const handleLanguageChange = (_event: React.MouseEvent<HTMLElement>, newLang: string | null) => {
        if (newLang) {
            i18n.changeLanguage(newLang);
            localStorage.setItem('language', newLang);
        }
    };

    return (
        <div style={{ flexGrow: 1 }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography style={{ flexGrow: 1 }}>
                        {t('navbar.appTitle')}
                    </Typography>
                    <ToggleButtonGroup
                        value={i18n.language}
                        exclusive
                        onChange={handleLanguageChange}
                        size="small"
                        sx={{
                            mr: 2,
                            '& .MuiToggleButton-root': {
                                color: 'rgba(255,255,255,0.7)',
                                borderColor: 'rgba(255,255,255,0.3)',
                                px: 1.5,
                                py: 0.5,
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                '&.Mui-selected': {
                                    color: '#fff',
                                    backgroundColor: 'rgba(255,255,255,0.2)',
                                },
                                '&:hover': {
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                },
                            },
                        }}
                        data-testid="language-toggle"
                    >
                        <ToggleButton value="de" data-testid="lang-de">DE</ToggleButton>
                        <ToggleButton value="fr" data-testid="lang-fr">FR</ToggleButton>
                    </ToggleButtonGroup>
                    <WelcomeName />
                    <Box sx={{ mx: 1 }}>
                        <Tooltip title={isOnline ? t('navbar.online') : t('navbar.offline')}>
                            {isOnline ? <Wifi /> : <WifiOff />}
                        </Tooltip>
                    </Box>
                    <SignInSignOutButton />
                </Toolbar>
            </AppBar>
        </div>
    );
};

export default NavBar;