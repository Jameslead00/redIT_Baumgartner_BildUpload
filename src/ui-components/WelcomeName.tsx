import { useEffect, useState } from "react";
import { useMsal, useAccount } from "@azure/msal-react";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

const WelcomeName = () => {
    const { t } = useTranslation();
    const { accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const [name, setName] = useState("");

    useEffect(() => {
        if (account && account.name) {
            setName(account.name);
        } else {
            setName("");
        }
    }, [account]);

    if (name) {
        return <Typography variant="h6">{t('welcome.greeting', { name })}</Typography>;
    } else {
        return null;
    }
};

export default WelcomeName;