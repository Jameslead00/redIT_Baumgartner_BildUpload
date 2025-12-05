import { Configuration, PopupRequest } from "@azure/msal-browser";

// Config object to be passed to Msal on creation
export const msalConfig: Configuration = {
    auth: {
        clientId: "d260df73-58a1-48d2-8dc5-5890dd909b52", //added clientId from Baumgartner Tenant
        authority: "https://login.microsoftonline.com/c46f4107-49a4-46ce-9c24-a793d9c1b61b", //url with Baumgartner Tenant ID
        redirectUri: "https://improved-space-doodle-wr7rpx4qj79rfgxv-3000.app.github.dev/",/* "https://jameslead00.github.io/redIT_Baumgartner_BildUpload/",*/
        postLogoutRedirectUri: "https://jameslead00.github.io/redIT_Baumgartner_BildUpload/",
    },
    system: {
        allowPlatformBroker: false, // Disables WAM Broker
    },
    cache: {
        cacheLocation: "localStorage",  // Tokens werden in localStorage gespeichert (persistent über Sessions hinweg)
        storeAuthStateInCookie: false,  // Optional: Auth-State in Cookies speichern (für Safari-Kompatibilität)
    },
};

// Add here scopes for id token to be used at MS Identity Platform endpoints.
export const loginRequest: PopupRequest = {
    scopes: ["User.Read", "Team.ReadBasic.All", "TeamMember.Read.All", "Channel.ReadBasic.All", "ChannelMessage.Send", "Files.ReadWrite", "Sites.ReadWrite.All"],
};

// Add here the endpoints for MS Graph API services you would like to use.
export const graphConfig = {
    graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
};
