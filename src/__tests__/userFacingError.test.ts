import { getUserFacingErrorMessage } from '../utils/userFacingError';
import { GraphOperationError } from '../ui-components/ImageUpload';
import i18n from '../i18n/i18n';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

describe('getUserFacingErrorMessage', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('de');
        Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    });

    test('maps 403 graph errors to a permission message with step and reference', () => {
        const err = new GraphOperationError('Failed', {
            status: 403, statusText: 'Forbidden', responseBody: 'x',
            operation: 'checkFolderExists', correlationId: 'abcdef12-3456',
        });
        const msg = getUserFacingErrorMessage(err, t);
        expect(msg).toContain('Beim Prüfen des Zielordners');
        expect(msg).toContain('Keine Berechtigung');
        expect(msg).toContain('Ref: abcdef12');
        expect(msg).not.toContain('Forbidden');
    });

    test('maps 5xx to service unavailable', () => {
        const err = new GraphOperationError('Failed', { status: 503, statusText: '', responseBody: '', operation: 'postMessage' });
        expect(getUserFacingErrorMessage(err, t)).toContain('überlastet');
    });

    test('maps MSAL auth errors to session expired', () => {
        const err = Object.assign(new Error('x'), { name: 'InteractionRequiredAuthError', errorCode: 'interaction_required' });
        const msg = getUserFacingErrorMessage(err, t);
        expect(msg).toContain('Bei der Anmeldung');
        expect(msg).toContain('abgelaufen');
    });

    test('maps fetch TypeError to network message', () => {
        expect(getUserFacingErrorMessage(new TypeError('Failed to fetch'), t)).toContain('Verbindung');
    });

    test('maps IndexedDB quota errors to storage message', () => {
        const err = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
        expect(getUserFacingErrorMessage(err, t)).toContain('Speicherplatz');
    });

    test('uses the explicit step for unknown errors and strips correlation prefix', () => {
        const msg = getUserFacingErrorMessage(new Error('[cid-1] Something odd'), t, { step: 'uploadFile' });
        expect(msg).toContain('Beim Hochladen der Dateien');
        expect(msg).toContain('Something odd');
        expect(msg).not.toContain('[cid-1]');
    });
});
