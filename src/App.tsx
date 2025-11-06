import { Routes, Route, useNavigate } from "react-router-dom";
// Material-UI imports
import { Container, Paper, Typography, Box } from "@mui/material";

// MSAL imports
import { MsalProvider } from "@azure/msal-react";
import { IPublicClientApplication } from "@azure/msal-browser";
import { CustomNavigationClient } from "./utils/NavigationClient";

// Sample app imports
import { PageLayout } from "./ui-components/PageLayout";
import { Home } from "./pages/Home";
import { Profile } from "./pages/Profile";
import TeamsList from "./ui-components/TeamsList";
import './styles.css';

type AppProps = {
    pca: IPublicClientApplication;
};

function App({ pca }: AppProps) {
    // The next 3 lines are optional. This is how you configure MSAL to take advantage of the router's navigate functions when MSAL redirects between pages in your app
    const navigate = useNavigate();
    const navigationClient = new CustomNavigationClient(navigate);
    pca.setNavigationClient(navigationClient);

    return (
        <MsalProvider instance={pca}>
            <PageLayout>
                <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
                    <Paper elevation={3} sx={{ p: 3, borderRadius: 2 }}>
                        <Box sx={{ textAlign: 'center', mb: 3 }}>
                            <Typography variant="h4" component="h1" gutterBottom>
                                Bild Upload
                            </Typography>
                            <Typography variant="body1" color="text.secondary">
                                Lade Bilder und Beiträge in Microsoft Teams Kanäle hoch.
                            </Typography>
                        </Box>
                        <Pages />
                    </Paper>
                </Container>
            </PageLayout>
        </MsalProvider>
    );
}

function Pages() {
    return (
        <Routes>
            <Route path="/profile" element={<Profile />} />
            <Route path="/" element={<Home />} />
            <Route path="/teams" element={<TeamsList />} />
        </Routes>
    );
}

export default App;