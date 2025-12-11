# redIT_Baumgartner_BildUpload

Eine moderne, responsive Web-App zur einfachen Erstellung von Posts in Microsoft Teams mit Bild-Uploads. Die App bietet eine elegante Benutzeroberfläche und unterstützt Offline-Funktionalität für nahtlose Nutzung ohne Internetverbindung.

## Features
* Microsoft Teams Integration: Authentifizierung via MSAL, Auswahl von Teams und Kanälen.
* Bild-Upload: Hochladen von Bildern in den OneDrive-Ordner "Bilder" des Teams. Thumbnails werden für schnelle Vorschau generiert.
* Unterordner-Auswahl: Optionales Auswählen eines Unterordners im "Bilder"-Verzeichnis für gezielte Uploads. (Hinweis: Der Ordner "Bilder" und die entsprechenden Unterordner müssen bereits im Kanal existieren).
* Post-Erstellung: Erstellen von Posts mit Text und bis zu 4 Bildern in ausgewählten Kanälen (weitere Bilder werden hochgeladen, aber nicht im Post angezeigt).
* Offline-Modus: Vollständige Vorbereitung von Posts offline, lokale Speicherung mit Dexie, halbautomatische Synchronisation bei Wiederverbindung.
* Caching: Teams und Kanäle werden für Favoriten gecached, um Offline-Zugang zu ermöglichen. Erfolgreich hochgeladene Posts werden automatisch aus dem Cache entfernt.
* Service Worker: Caching für PWA-ähnliche Erfahrung.
* Mobile-Unterstützung: MSAL verwendet Redirect für bessere Kompatibilität auf Mobilgeräten.

## Technologien
* Frontend: React 19.2.1, TypeScript 4.9.4, Material-UI (MUI) — `@mui/material` 5.10.17, `@mui/icons-material` 5.10.16, `@emotion/react` & `@emotion/styled` 11.10.5
* Authentifizierung: Microsoft Authentication Library (MSAL) — `@azure/msal-browser` 4.0.0, `@azure/msal-react` 3.0.0
* API: Microsoft Graph API für Teams, Kanäle, Mitglieder und OneDrive
* Offline-Speicherung: Dexie 4.2.1 (IndexedDB)
* Router: `react-router-dom` 6.7.0
* Build-Tool & Scripts: Create React App (`react-scripts` 5.0.1), npm
* Dev & Test: Jest 29.5.0, `@testing-library/react` 16.3.0, `@testing-library/jest-dom` 6.9.1, `@testing-library/user-event` 14.6.1, MSW 2.12.4, Puppeteer 24.32.1
* PWA & Deploy: Workbox (`workbox-cli` 7.3.0, `workbox-webpack-plugin` 7.3.0), `gh-pages` 6.3.0
* CI/CD: Azure DevOps Pipelines

## Voraussetzungen
* Node.js 18.x oder höher
* npm oder yarn
* Azure AD App-Registrierung (für MSAL)
* Zugriff auf Microsoft Teams und OneDrive im Tenant

## Konfiguration
* **authConfig.ts:** Passe Client-ID, Authority, Redirect-URI und Post-Logout-URI an.
    * Erforderliche Scopes: `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Send`, `Files.ReadWrite`, `Sites.ReadWrite.All`, `TeamMember.Read.All`.
* **db.ts:** Dexie-Datenbank für Offline-Speicherung (Schema v2 inkl. Mentions & Members).
* **styles.css:** Anpassung des Designs.

## Verwendung

**Login:**

1. Klicke auf "Anmelden" und authentifiziere dich mit Microsoft.

**Team und Kanal auswählen:**

2. Wähle ein Team aus der Liste (Favoriten werden inkl. Mitglieder gecached).
3. Wähle einen Kanal.
4. (Optional) Wähle einen Unterordner (Voraussetzung: Der Ordner "Bilder" und die Unterordner müssen bereits existieren).

**Bilder hochladen und Post erstellen:**

4. Wähle Bilder aus.
5. Füge optional Text hinzu.
6. Optional: Erwähne Personen über das Dropdown-Menü (@Name).
7. Klicke "Datei(en) hochladen" – Bilder werden gecached und automatisch hochgeladen/gepostet. Alle Bilder erscheinen direkt im Teams-Post.

## Offline-Modus:

* Bei fehlender Internetverbindung oder nicht eingeloggt: Vollständiges Formular verfügbar.
* Eingaben (inkl. Bilder und Mentions) werden lokal gespeichert.
* Bei Wiederverbindung: Button "Upload (n) cached post(s)" erscheint – klicke zum manuellen Synchronisieren.

**Offline-Funktionalität**

* Speicherung: Posts, Bilder und Metadaten werden in IndexedDB (Dexie) gespeichert.
* Sync: Bei Online/Login werden Bilder zu OneDrive hochgeladen und Posts in Teams erstellt (automatisch für Online, manuell für Offline).
* Caching: Favorisierte Teams, Kanäle und Unterordner sind offline verfügbar. Erfolgreich hochgeladene Posts werden aus dem Cache entfernt.
* Hinweise: App zeigt Warnungen für Offline-Status und erfordert Text für Offline-Speicherung.

## Deployment
**Azure Static Web Apps (empfohlen)**

1. Erstelle eine Static Web App in Azure Portal.
2. Verbinde mit Azure DevOps-Repo.
3. Konfiguriere Build: `npm run build`, Output: `build`.
4. Pipeline in ADO: Verwende die bereitgestellte YAML für automatischen Build und Deploy.

**GitHub Pages (alternativ)**

1. Baue die App: `npm run build`.
2. Pushe build zu einem GitHub-Repo (`gh-pages` Branch).
3. Aktiviere GitHub Pages für den Branch.

## Lizenz
Proprietär – für internen Gebrauch des Clients. Keine Weiterverbreitung ohne Genehmigung.