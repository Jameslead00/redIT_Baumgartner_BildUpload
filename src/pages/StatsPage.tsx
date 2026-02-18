import React, { useEffect, useState, useMemo } from "react";
import {
    Container, Paper, Typography, Box, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Chip
} from "@mui/material";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { LOG_SITE_ID, LOG_LIST_ID } from "../utils/Logger";

// ─── Typen ────────────────────────────────────────────────────────────────────

/** Rohfelder aus der SharePoint-Liste */
interface SPLogFields {
    Title?: string;
    Logtime?: string;
    PhotoCount?: number;
    TotalSizeMB?: number;
    Status?: string;
    ErrorMessage?: string;
}

/** Geparster Log-Eintrag */
interface ParsedLogEntry {
    title: string;
    logtime: Date;
    photoCount: number;
    totalSizeMB: number;
    status: "Success" | "Error";
    errorMessage: string;
}

/** Aggregation pro Monat */
interface MonthlyData {
    label: string;       // z.B. "2025-06"
    uploads: number;
    totalMB: number;
}

/** Success/Fail Aggregation */
interface StatusData {
    name: string;
    value: number;
    percent: string;
}

// ─── Globales AccessToken (ohne Auth-Implementierung) ─────────────────────────

declare global {
    interface Window {
        __ACCESS_TOKEN__?: string;
    }
}

// ─── Farben für PieChart ──────────────────────────────────────────────────────

const PIE_COLORS = ["#4caf50", "#f44336"]; // grün = Success, rot = Error

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Holt alle Items aus der SharePoint-Liste inkl. Pagination (nextLink).
 */
async function fetchAllLogItems(accessToken: string): Promise<SPLogFields[]> {
    const fields = "Logtime,TotalSizeMB,Status,PhotoCount,Title,ErrorMessage";
    let url: string | null =
        `https://graph.microsoft.com/v1.0/sites/${LOG_SITE_ID}/lists/${LOG_LIST_ID}/items?expand=fields(select=${fields})&$top=200`;

    const allItems: SPLogFields[] = [];

    while (url) {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Graph API ${res.status}: ${errText}`);
        }

        const json = await res.json();
        const items: { fields?: SPLogFields }[] = json.value ?? [];
        items.forEach((item) => {
            if (item.fields) allItems.push(item.fields);
        });

        // Pagination: nächste Seite holen
        url = json["@odata.nextLink"] ?? null;
    }

    return allItems;
}

/**
 * Parst Logtime im Format "YYYY-MM-DD HH:mm:ss" zu Date.
 */
function parseLogtime(raw?: string): Date {
    if (!raw) return new Date(0);
    // Sicherstellen, dass "YYYY-MM-DD HH:mm:ss" korrekt geparst wird
    return new Date(raw.replace(" ", "T"));
}

/**
 * Erzeugt Monatslabel "YYYY-MM" aus Date.
 */
function toMonthKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

const StatsPage: React.FC = () => {
    const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // AccessToken aus globalem Window-Objekt lesen
    const accessToken = window.__ACCESS_TOKEN__;

    useEffect(() => {
        if (!accessToken) {
            setLoading(false);
            return undefined;
        }

        let cancelled = false;

        (async () => {
            try {
                const raw = await fetchAllLogItems(accessToken);
                if (cancelled) return;

                const parsed: ParsedLogEntry[] = raw.map((f) => ({
                    title: f.Title ?? "–",
                    logtime: parseLogtime(f.Logtime),
                    photoCount: f.PhotoCount ?? 0,
                    totalSizeMB: f.TotalSizeMB ?? 0,
                    status: f.Status === "Error" ? "Error" : "Success",
                    errorMessage: f.ErrorMessage ?? ""
                }));

                // Nach Datum absteigend sortieren
                parsed.sort((a, b) => b.logtime.getTime() - a.logtime.getTime());
                setEntries(parsed);
            } catch (err: unknown) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [accessToken]);

    // ── Aggregationen ─────────────────────────────────────────────────────────

    /** Uploads pro Monat + MB pro Monat */
    const monthlyData: MonthlyData[] = useMemo(() => {
        const map = new Map<string, { uploads: number; totalMB: number }>();
        entries.forEach((e) => {
            const key = toMonthKey(e.logtime);
            const existing = map.get(key) ?? { uploads: 0, totalMB: 0 };
            existing.uploads += 1;
            existing.totalMB += e.totalSizeMB;
            map.set(key, existing);
        });
        // Chronologisch sortieren
        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, v]) => ({
                label,
                uploads: v.uploads,
                totalMB: Math.round(v.totalMB * 100) / 100
            }));
    }, [entries]);

    /** Success vs Fail Counts + Prozent */
    const statusData: StatusData[] = useMemo(() => {
        const total = entries.length;
        if (total === 0) return [];
        const successCount = entries.filter((e) => e.status === "Success").length;
        const errorCount = total - successCount;
        return [
            { name: "Success", value: successCount, percent: ((successCount / total) * 100).toFixed(1) },
            { name: "Error", value: errorCount, percent: ((errorCount / total) * 100).toFixed(1) }
        ];
    }, [entries]);

    /** Gesamtsummen */
    const totalUploads = entries.length;
    const totalMB = useMemo(
        () => Math.round(entries.reduce((sum, e) => sum + e.totalSizeMB, 0) * 100) / 100,
        [entries]
    );

    /** Letzte 10 Einträge */
    const recentEntries = useMemo(() => entries.slice(0, 10), [entries]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (!accessToken) {
        return (
            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Alert severity="warning">
                    Kein AccessToken vorhanden. Bitte setze <code>window.__ACCESS_TOKEN__</code> mit einem gültigen
                    Microsoft Graph Token, bevor du diese Seite öffnest.
                </Alert>
            </Container>
        );
    }

    if (loading) {
        return (
            <Container maxWidth="md" sx={{ mt: 4, textAlign: "center" }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Lade Log-Daten…</Typography>
            </Container>
        );
    }

    if (error) {
        return (
            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Alert severity="error">Fehler beim Laden der Daten: {error}</Alert>
            </Container>
        );
    }

    if (entries.length === 0) {
        return (
            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Alert severity="info">Keine Log-Einträge vorhanden.</Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom>
                Upload-Statistiken
            </Typography>

            {/* ── Gesamtsummen ──────────────────────────────────────────── */}
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 160, textAlign: "center" }}>
                    <Typography variant="h5">{totalUploads}</Typography>
                    <Typography variant="body2" color="text.secondary">Uploads gesamt</Typography>
                </Paper>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 160, textAlign: "center" }}>
                    <Typography variant="h5">{totalMB} MB</Typography>
                    <Typography variant="body2" color="text.secondary">Datenvolumen gesamt</Typography>
                </Paper>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 160, textAlign: "center" }}>
                    <Typography variant="h5">
                        {statusData.find((s) => s.name === "Success")?.percent ?? 0}%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Erfolgsrate</Typography>
                </Paper>
            </Box>

            {/* ── Charts Row ───────────────────────────────────────────── */}
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 4 }}>
                {/* Uploads pro Monat (BarChart) */}
                <Paper elevation={2} sx={{ p: 2, flex: 2, minWidth: 320 }}>
                    <Typography variant="h6" gutterBottom>Uploads pro Monat</Typography>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="uploads" name="Uploads" fill="#1976d2" />
                        </BarChart>
                    </ResponsiveContainer>
                </Paper>

                {/* MB pro Monat (LineChart) */}
                <Paper elevation={2} sx={{ p: 2, flex: 2, minWidth: 320 }}>
                    <Typography variant="h6" gutterBottom>Datenvolumen pro Monat (MB)</Typography>
                    <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="totalMB" name="MB" stroke="#ff9800" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </Paper>

                {/* Success vs Fail (PieChart) */}
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 260, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <Typography variant="h6" gutterBottom>Erfolg vs. Fehler</Typography>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={statusData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label={({ name, percent }) => `${name} ${percent}%`}
                            >
                                {statusData.map((_entry, idx) => (
                                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </Paper>
            </Box>

            {/* ── Letzte 10 Einträge ───────────────────────────────────── */}
            <Paper elevation={2} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Letzte 10 Uploads</Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Datum</TableCell>
                                <TableCell>Benutzer</TableCell>
                                <TableCell align="right">Fotos</TableCell>
                                <TableCell align="right">MB</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {recentEntries.map((entry, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>
                                        {entry.logtime.toLocaleDateString("de-CH")}{" "}
                                        {entry.logtime.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                                    </TableCell>
                                    <TableCell>{entry.title}</TableCell>
                                    <TableCell align="right">{entry.photoCount}</TableCell>
                                    <TableCell align="right">{entry.totalSizeMB.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={entry.status}
                                            size="small"
                                            color={entry.status === "Success" ? "success" : "error"}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Container>
    );
};

export default StatsPage;
