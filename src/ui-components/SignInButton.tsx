import { useMsal } from "@azure/msal-react";
import Button from "@mui/material/Button";
import { loginRequest } from "../authConfig";

export const SignInButton = () => {
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
                Login
            </Button>
        </div>
    )
};