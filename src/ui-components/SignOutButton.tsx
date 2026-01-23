import { useMsal } from "@azure/msal-react";
import IconButton from '@mui/material/IconButton';
import Logout from "@mui/icons-material/Logout";

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
                <Logout />
            </IconButton>
        </div>
    )
};