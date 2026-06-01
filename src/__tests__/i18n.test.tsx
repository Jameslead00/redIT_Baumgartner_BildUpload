// src/__tests__/i18n.test.tsx
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import i18n from "../i18n/i18n";
import de from "../i18n/de.json";
import fr from "../i18n/fr.json";

// ── Helpers ──────────────────────────────────────────────────────

/** Reset i18n to German before every test */
beforeEach(async () => {
  await i18n.changeLanguage("de");
  localStorage.clear();
});

// ── 1. Translation file completeness ────────────────────────────

/** Collect all leaf keys from a nested object (e.g. "app.title") */
function collectKeys(obj: Record<string, any>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? collectKeys(value, fullKey)
      : [fullKey];
  });
}

describe("Translation file completeness", () => {
  const deKeys = collectKeys(de).sort();
  const frKeys = collectKeys(fr).sort();

  test("German and French files have the same keys", () => {
    expect(deKeys).toEqual(frKeys);
  });

  test("No empty translation values in German file", () => {
    deKeys.forEach((key) => {
      expect(i18n.t(key, { lng: "de" })).not.toBe("");
    });
  });

  test("No empty translation values in French file", () => {
    frKeys.forEach((key) => {
      expect(i18n.t(key, { lng: "fr" })).not.toBe("");
    });
  });
});

// ── 2. i18n configuration ───────────────────────────────────────

describe("i18n configuration", () => {
  test("default language is German", () => {
    expect(i18n.language).toBe("de");
  });

  test("fallback language is German", () => {
    expect(i18n.options.fallbackLng).toContain("de");
  });

  test("supports exactly two languages: de and fr", () => {
    const langs = Object.keys(i18n.options.resources ?? {});
    expect(langs.sort()).toEqual(["de", "fr"]);
  });
});

// ── 3. Language switching ───────────────────────────────────────

describe("Language switching", () => {
  test("switching to French changes translations", async () => {
    expect(i18n.t("app.title")).toBe("Datei Upload");
    await i18n.changeLanguage("fr");
    expect(i18n.t("app.title")).toBe("Téléchargement de fichiers");
  });

  test("switching back to German restores translations", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("auth.login")).toBe("Connexion");
    await i18n.changeLanguage("de");
    expect(i18n.t("auth.login")).toBe("Anmelden");
  });

  test("interpolation works in both languages", async () => {
    expect(i18n.t("welcome.greeting", { name: "Max" })).toBe("Willkommen Max");
    await i18n.changeLanguage("fr");
    expect(i18n.t("welcome.greeting", { name: "Max" })).toBe("Bienvenue Max");
  });

  test("interpolation with count works correctly", async () => {
    expect(i18n.t("upload.filesSelected", { count: 3 })).toBe("3 Datei(en) ausgewählt");
    await i18n.changeLanguage("fr");
    expect(i18n.t("upload.filesSelected", { count: 3 })).toBe("3 fichier(s) sélectionné(s)");
  });
});

// ── 4. NavBar language toggle integration ───────────────────────

// Mock child components so NavBar renders cleanly
jest.mock("../ui-components/WelcomeName", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-welcome">Welcome</div>,
}));

jest.mock("../ui-components/SignInSignOutButton", () => ({
  __esModule: true,
  default: () => <div data-testid="mock-signin">SignIn</div>,
}));

jest.mock("@mui/icons-material", () => ({
  Wifi: () => <span data-testid="wifi-icon">WifiIcon</span>,
  WifiOff: () => <span data-testid="wifi-off-icon">WifiOffIcon</span>,
}));

// Lazy‑import NavBar AFTER mocks are declared
import NavBar from "../ui-components/NavBar";

describe("NavBar language toggle", () => {
  test("renders DE and FR toggle buttons", () => {
    render(<NavBar />);
    expect(screen.getByTestId("language-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("lang-de")).toBeInTheDocument();
    expect(screen.getByTestId("lang-fr")).toBeInTheDocument();
  });

  test("DE is selected by default", () => {
    render(<NavBar />);
    const deBtn = screen.getByTestId("lang-de");
    expect(deBtn).toHaveClass("Mui-selected");
  });

  test("clicking FR switches language to French", async () => {
    render(<NavBar />);
    const frBtn = screen.getByTestId("lang-fr");
    await userEvent.click(frBtn);

    expect(i18n.language).toBe("fr");
    expect(localStorage.getItem("language")).toBe("fr");
  });

  test("clicking DE switches language back to German", async () => {
    await i18n.changeLanguage("fr");
    render(<NavBar />);
    const deBtn = screen.getByTestId("lang-de");
    await userEvent.click(deBtn);

    expect(i18n.language).toBe("de");
    expect(localStorage.getItem("language")).toBe("de");
  });
});

// ── 5. Spot‑check component translations ───────────────────────

describe("Key translations spot-check", () => {
  const spotChecks: [string, string, string][] = [
    // [key, expected DE, expected FR]
    ["navbar.appTitle", "Baumgartner Fenster", "Baumgartner Fenster"],
    ["navbar.online", "Online", "online"],
    ["navbar.offline", "Offline", "offline"],
    ["auth.login", "Anmelden", "Connexion"],
    ["auth.authInProgress", "Authentifizierung läuft...", "Authentification en cours..."],
    ["teams.selectTeam", "Team auswählen", "Sélectionner une team"],
    ["channels.selectChannel", "Kanal auswählen", "Sélectionner un canal"],
    ["upload.title", "Bilder, PDFs und Videos in Ordner \"Bilder\" hochladen", "Télécharger des images, des PDF et des vidéos dans le dossier \"Bilder\""],
    ["error.occurred", "Ein Fehler ist aufgetreten: ", "Une erreur s'est produite : "],
    ["error.unknown", "Unbekannter Fehler", "Erreur inconnue"],
  ];

  test.each(spotChecks)(
    "key '%s' → DE: '%s', FR: '%s'",
    async (key, expectedDE, expectedFR) => {
      expect(i18n.t(key, { lng: "de" })).toBe(expectedDE);
      expect(i18n.t(key, { lng: "fr" })).toBe(expectedFR);
    }
  );
});
