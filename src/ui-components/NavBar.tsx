import React, { useState, useEffect } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Wifi, WifiOff } from "@mui/icons-material";
import { Tooltip, Box } from "@mui/material";
import WelcomeName from "./WelcomeName";
import SignInSignOutButton from "./SignInSignOutButton";
import { Link as RouterLink } from "react-router-dom";

const NavBar = () => {
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

    return (
        <div style={{ flexGrow: 1 }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography style={{ flexGrow: 1 }}>
                        Baumgartner Fenster
                    </Typography>
                    <WelcomeName />
                    <Box sx={{ mx: 1 }}>
                        <Tooltip title={isOnline ? "Online" : "Offline"}>
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