import { Routes, Route, useNavigate } from "react-router-dom";
// Material-UI imports
import { Container, Paper, Typography, Box } from "@mui/material";
import { useTranslation } from "react-i18next";

// MSAL imports
import { MsalProvider } from "@azure/msal-react";
import { IPublicClientApplication } from "@azure/msal-browser";
import { CustomNavigationClient } from "./utils/NavigationClient";

// Sample app imports
import { PageLayout } from "./ui-components/PageLayout";
import TeamsList from "./ui-components/TeamsList";
import ReportingDashboardPage from "./pages/ReportingDashboardPage";
import './styles.css';

type AppProps = {
    pca: IPublicClientApplication;
};

function App({ pca }: AppProps) {
    const { t } = useTranslation();
    // The next 3 lines are optional. This is how you configure MSAL to take advantage of the router's navigate functions when MSAL redirects between pages in your app
    const navigate = useNavigate();
    const navigationClient = new CustomNavigationClient(navigate);
    pca.setNavigationClient(navigationClient);

    return (
        <MsalProvider instance={pca}>
            <PageLayout>
                <Routes>
                    <Route path="/reporting" element={<ReportingDashboardPage />} />
                    <Route path="*" element={
                        <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
                            <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
                                <Box sx={{ textAlign: 'center', mb: 3 }}>
                                    <Typography variant="h4" component="h1" gutterBottom>
                                        {t('app.title')}
                                    </Typography>
                                    <Typography variant="body1" color="text.secondary">
                                        {t('app.description')}
                                    </Typography>
                                </Box>
                                <TeamsList />
                            </Paper>
                        </Container>
                    } />
                </Routes>
            </PageLayout>
        </MsalProvider>
    );
}

export default App;