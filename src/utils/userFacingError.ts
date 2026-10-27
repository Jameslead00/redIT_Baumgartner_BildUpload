type Translate = (key: string, options?: Record<string, unknown>) => string;

type ErrorStep = 'acquireToken' | 'resolveSite' | 'checkFolder' | 'createFolder' | 'uploadFile' | 'postMessage' | 'saveLocal';

const OPERATION_TO_STEP: Record<string, ErrorStep> = {
    acquireToken: 'acquireToken',
    resolveSite: 'resolveSite',
    checkFolder: 'checkFolder',
    checkFolderExists: 'checkFolder',
    createFolder: 'createFolder',
    uploadFile: 'uploadFile',
    uploadSmallFile: 'uploadFile',
    createUploadSession: 'uploadFile',
    uploadLargeFileChunk: 'uploadFile',
    getUploadedFileMetadata: 'uploadFile',
    uploadImages: 'uploadFile',
    postMessage: 'postMessage',
    saveToIndexedDb: 'saveLocal',
    loadCachedImages: 'saveLocal',
};

const AUTH_ERROR_CODES = ['interaction_required', 'login_required', 'consent_required', 'no_account', 'token_renewal', 'monitor_window_timeout', 'invalid_grant'];
const STORAGE_ERROR_NAMES = ['QuotaExceededError', 'OpenFailedError', 'DatabaseClosedError', 'InvalidStateError', 'UnknownError'];

const asRecord = (err: unknown): Record<string, unknown> =>
    err && typeof err === 'object' ? (err as Record<string, unknown>) : {};

const isAuthError = (err: unknown): boolean => {
    const { name, errorCode } = asRecord(err);
    if (typeof name === 'string' && name.endsWith('AuthError')) return true;
    return typeof errorCode === 'string' && AUTH_ERROR_CODES.some(code => errorCode.includes(code));
};

const isNetworkError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    // fetch() rejects with a TypeError on connection failures; message differs per browser.
    return err.name === 'TypeError' && /fetch|network|load failed|connection/i.test(err.message);
};

const isStorageError = (err: unknown): boolean => {
    const { name, inner } = asRecord(err);
    if (typeof name === 'string' && STORAGE_ERROR_NAMES.includes(name)) return true;
    return !!inner && isStorageError(inner);
};

const reasonForStatus = (status: number, t: Translate): string => {
    if (status === 401) return t('error.reason.sessionExpired');
    if (status === 403) return t('error.reason.noPermission');
    if (status === 404) return t('error.reason.notFound');
    if (status === 413) return t('error.reason.tooLarge');
    if (status === 429 || status >= 500) return t('error.reason.serviceUnavailable');
    return t('error.reason.requestRejected', { status });
};

const shortDetail = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);
    const cleaned = raw.replace(/^\[[^\]]+\]\s*/, '').split('\n')[0].trim();
    return cleaned.length > 90 ? `${cleaned.slice(0, 89)}…` : cleaned || 'unknown';
};

/** Builds a short, non-technical message for snackbars/alerts from any upload/sync error. */
export const getUserFacingErrorMessage = (err: unknown, t: Translate, options?: { step?: string }): string => {
    const rec = asRecord(err);
    const isGraph = rec.name === 'GraphOperationError' && typeof rec.status === 'number';

    let step: ErrorStep | undefined;
    if (isGraph && typeof rec.operation === 'string') step = OPERATION_TO_STEP[rec.operation];
    if (!step && typeof rec.step === 'string') step = OPERATION_TO_STEP[rec.step];
    if (!step && options?.step) step = OPERATION_TO_STEP[options.step];
    if (!step && isAuthError(err)) step = 'acquireToken';
    if (!step && isStorageError(err)) step = 'saveLocal';

    let reason: string;
    if (isAuthError(err)) {
        reason = t('error.reason.sessionExpired');
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        reason = t('error.reason.offline');
    } else if (isNetworkError(err)) {
        reason = t('error.reason.network');
    } else if (isStorageError(err)) {
        reason = t('error.reason.storageFull');
    } else if (isGraph) {
        reason = reasonForStatus(rec.status as number, t);
    } else {
        reason = t('error.reason.unexpected', { detail: shortDetail(err) });
    }

    const parts: string[] = [];
    if (step) parts.push(`${t(`error.step.${step}`)}: ${reason}`);
    else parts.push(reason);

    const correlationId = typeof rec.correlationId === 'string' ? rec.correlationId : undefined;
    if (correlationId) parts.push(`(${t('error.ref', { id: correlationId.slice(0, 8) })})`);

    return parts.join(' ');
};
