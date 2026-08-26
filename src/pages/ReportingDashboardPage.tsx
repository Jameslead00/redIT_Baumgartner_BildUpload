import React from "react";
import { Alert, Container } from "@mui/material";
import { Navigate } from "react-router-dom";
import { useMsal, useAccount, useIsAuthenticated } from "@azure/msal-react";
import StatsPage from "./StatsPage";
import { isReportingUserAllowed } from "../utils/reportingAccess";

const ReportingDashboardPage: React.FC = () => {
    const { accounts } = useMsal();
    const account = useAccount(accounts[0] || {});
    const isAuthenticated = useIsAuthenticated();

    if (!isAuthenticated) {
        return (
            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Alert severity="warning">Bitte melde dich zuerst an, um das Reporting Dashboard zu öffnen.</Alert>
            </Container>
        );
    }

    if (!isReportingUserAllowed(account ?? accounts[0] ?? null)) {
        return <Navigate to="/" replace />;
    }

    return <StatsPage />;
};

export default ReportingDashboardPage;
