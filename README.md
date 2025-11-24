# redIT_Baumgartner_BildUpload

Eine moderne, responsive Web-App zur einfachen Erstellung von Posts in Microsoft Teams mit Bild-Uploads. Die App bietet eine elegante Benutzeroberfläche und unterstützt Offline-Funktionalität für nahtlose Nutzung ohne Internetverbindung.

## Features
* **Microsoft Teams Integration:** Authentifizierung via MSAL, Auswahl von Teams und Kanälen.
* **Bild-Upload:** Hochladen von Bildern in den OneDrive-Ordner "Bilder" des Teams.
* **Post-Erstellung:** Erstellen von Posts mit Text, **Benutzer-Erwähnungen (@Mentions)** und Bildern. Dank "Hosted Contents" werden **alle Bilder direkt inline** im Teams-Post angezeigt (kein Limit auf 4 Bilder mehr).
* **Offline-Modus:** Vollständige Vorbereitung von Posts offline, lokale Speicherung mit Dexie, halbautomatische Synchronisation bei Wiederverbindung.
* **Caching:** Teams, Kanäle und Mitglieder werden für Favoriten gecached, um Offline-Zugang und Erwähnungen auch ohne Internet zu ermöglichen. Erfolgreich hochgeladene Posts werden automatisch aus dem Cache entfernt.
* **Service Worker:** Caching für PWA-ähnliche Erfahrung.
* **Mobile-Unterstützung:** MSAL verwendet Redirect für bessere Kompatibilität auf Mobilgeräten.

## Technologien
* Frontend: React 18, TypeScript, Material-UI (MUI)
* Authentifizierung: Microsoft Authentication Library (MSAL) für Azure AD
* API: Microsoft Graph API für Teams, Kanäle, Mitglieder und OneDrive
* Offline-Speicherung: Dexie (IndexedDB)
* Build-Tool: Create React App, npm
* Hosting: Azure Static Web Apps (empfohlen), GitHub Pages (alternativ)
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

* **Speicherung:** Posts, Bilder, Metadaten und Mentions werden in IndexedDB (Dexie) gespeichert.
* **Sync:** Bei Online/Login werden Bilder zu OneDrive hochgeladen und Posts in Teams erstellt (automatisch für Online, manuell für Offline).
* **Caching:** Favorisierte Teams, deren Kanäle und Mitglieder sind offline verfügbar.
* **Hinweise:** App zeigt Warnungen für Offline-Status und erfordert Text für Offline-Speicherung.

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