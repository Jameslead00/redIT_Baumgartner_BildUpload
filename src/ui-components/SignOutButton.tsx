import { useMsal } from "@azure/msal-react";
import IconButton from '@mui/material/IconButton';
import AccountCircle from "@mui/icons-material/AccountCircle";

export const SignOutButton = () => {
    const { instance } = useMsal();

    const handleLogout = () => {
        instance.logoutPopup({
            mainWindowRedirectUri: "/"
        });
    }

    return (
        <div>
            <IconButton
                onClick={handleLogout}
                color="inherit"
            >
                <AccountCircle />
            </IconButton>
        </div>
    )
};