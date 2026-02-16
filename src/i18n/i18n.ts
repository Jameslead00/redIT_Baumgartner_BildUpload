import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import fr from './fr.json';

// Gespeicherte Sprache aus localStorage laden oder Standard 'de'
let savedLanguage = 'de';
try {
    if (typeof window !== 'undefined' && window.localStorage) {
        savedLanguage = localStorage.getItem('language') || 'de';
    }
} catch {
    // localStorage might not be available in tests
}

i18n
    .use(initReactI18next)
    .init({
        resources: {
            de: { translation: de },
            fr: { translation: fr },
        },
        lng: savedLanguage,
        fallbackLng: 'de',
        interpolation: {
            escapeValue: false, // React schützt bereits vor XSS
        },
    });

export default i18n;
