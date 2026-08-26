import React, { useState, useEffect } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { Wifi, WifiOff, BarChartOutlined } from "@mui/icons-material";
import { Tooltip, Box, ToggleButtonGroup, ToggleButton, Button } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useMsal, useAccount, useIsAuthenticated } from "@azure/msal-react";
import WelcomeName from "./WelcomeName";
import SignInSignOutButton from "./SignInSignOutButton";
import { Link as RouterLink } from "react-router-dom";
import { isReportingUserAllowed } from "../utils/reportingAccess";

const NavBar = () => {
    const { t, i18n } = useTranslation();
    const { accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const isAuthenticated = useIsAuthenticated();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const canAccessReporting = isAuthenticated && isReportingUserAllowed(account ?? accounts[0] ?? null);

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
                <Toolbar sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 64 }}>
                    <Typography sx={{ minWidth: 180, fontWeight: 600 }}>
                        {t('navbar.appTitle')}
                    </Typography>

                    <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                        {canAccessReporting && (
                            <Button
                                component={RouterLink}
                                to="/reporting"
                                color="inherit"
                                variant="outlined"
                                startIcon={<BarChartOutlined />}
                                sx={{
                                    borderColor: 'rgba(255,255,255,0.45)',
                                    color: '#fff',
                                    minWidth: 200,
                                    whiteSpace: 'nowrap',
                                    mx: 'auto',
                                    '&:hover': {
                                        backgroundColor: 'rgba(255,255,255,0.08)',
                                    },
                                }}
                            >
                                Reporting Dashboard
                            </Button>
                        )}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, minWidth: 180 }}>
                        <ToggleButtonGroup
                            value={i18n.language}
                            exclusive
                            onChange={handleLanguageChange}
                            size="small"
                            sx={{
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
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Tooltip title={isOnline ? t('navbar.online') : t('navbar.offline')}>
                                {isOnline ? <Wifi /> : <WifiOff />}
                            </Tooltip>
                        </Box>
                        <SignInSignOutButton />
                    </Box>
                </Toolbar>
            </AppBar>
        </div>
    );
};

export default NavBar;