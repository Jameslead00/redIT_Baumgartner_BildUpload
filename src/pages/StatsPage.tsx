import React, { useEffect, useState, useMemo } from "react";
import {
    Container, Paper, Typography, Box, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    CircularProgress, Alert, Chip, TextField, Autocomplete, Button
} from "@mui/material";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
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
    TargetTeam?: string;
}

/** Geparster Log-Eintrag */
interface ParsedLogEntry {
    title: string;
    logtime: Date;
    photoCount: number;
    totalSizeMB: number;
    status: "Success" | "Error";
    errorMessage: string;
    targetTeam: string;
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

interface TeamBreakdownItem {
    team: string;
    count: number;
}

interface EmployeeUsageSummary {
    user: string;
    uploads: number;
    successfulUploads: number;
    failedUploads: number;
    totalMB: number;
    successRate: number;
    lastActivity: Date | null;
    primaryTeam: string;
    teamBreakdown: TeamBreakdownItem[];
}

interface EmployeeTeamHistoryEntry {
    user: string;
    date: string;
    team: string;
    status: "Success" | "Error";
    totalMB: number;
    uploads: number;
    logtime: Date;
}

interface DailyTeamPostEntry {
    date: string;
    [team: string]: string | number;
}

// ─── Farben für PieChart ──────────────────────────────────────────────────────

const PIE_COLORS = ["#4caf50", "#f44336"]; // grün = Success, rot = Error

export function parseUserFromTitle(title?: string): string {
    if (!title) return "unknown";

    const match = title.match(/Upload by\s+([^\s]+)$/i) ?? title.match(/\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/i);
    if (!match) return "unknown";

    const user = match[1]?.trim();
    if (!user) return "unknown";

    return user.toLowerCase();
}

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function buildEmployeeUsageSummary(entries: ParsedLogEntry[]): EmployeeUsageSummary[] {
    const summaryMap = new Map<string, EmployeeUsageSummary>();

    entries.forEach((entry) => {
        const user = parseUserFromTitle(entry.title);
        const current: EmployeeUsageSummary = summaryMap.get(user) ?? {
            user,
            uploads: 0,
            successfulUploads: 0,
            failedUploads: 0,
            totalMB: 0,
            successRate: 0,
            lastActivity: null,
            primaryTeam: "-",
            teamBreakdown: [],
        };

        current.uploads += 1;
        current.totalMB += entry.totalSizeMB;
        current.lastActivity = current.lastActivity && current.lastActivity > entry.logtime ? current.lastActivity : entry.logtime;

        if (entry.status === "Success") {
            current.successfulUploads += 1;
        } else {
            current.failedUploads += 1;
        }

        const team = (entry.targetTeam ?? "Unbekannt").trim() || "Unbekannt";
        const teamBreakdownMap = new Map(current.teamBreakdown.map((item) => [item.team, item.count]));
        teamBreakdownMap.set(team, (teamBreakdownMap.get(team) ?? 0) + 1);
        current.teamBreakdown = Array.from(teamBreakdownMap.entries())
            .map(([teamName, count]) => ({ team: teamName, count }))
            .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));
        current.primaryTeam = current.teamBreakdown[0]?.team ?? "-";

        summaryMap.set(user, current);
    });

    return Array.from(summaryMap.values())
        .map((item) => ({
            ...item,
            successRate: item.uploads === 0 ? 0 : Math.round((item.successfulUploads / item.uploads) * 100),
        }))
        .sort((a, b) => b.uploads - a.uploads || b.totalMB - a.totalMB);
}

export function buildEmployeeTeamHistory(entries: ParsedLogEntry[], selectedUser: string): EmployeeTeamHistoryEntry[] {
    const filteredEntries = entries.filter((entry) => parseUserFromTitle(entry.title) === selectedUser.toLowerCase());

    const historyMap = new Map<string, EmployeeTeamHistoryEntry>();

    filteredEntries.forEach((entry) => {
        const dateKey = toDateKey(entry.logtime);
        const team = (entry.targetTeam ?? "Unbekannt").trim() || "Unbekannt";
        const bundleKey = `${dateKey}::${team}`;
        const current = historyMap.get(bundleKey) ?? {
            user: selectedUser.toLowerCase(),
            date: dateKey,
            team,
            status: entry.status,
            totalMB: 0,
            uploads: 0,
            logtime: entry.logtime,
        };

        current.totalMB += entry.totalSizeMB;
        current.uploads += 1;
        current.status = current.status === "Error" || entry.status === "Error" ? "Error" : "Success";
        current.logtime = current.logtime > entry.logtime ? current.logtime : entry.logtime;
        historyMap.set(bundleKey, current);
    });

    return Array.from(historyMap.values())
        .sort((a, b) => b.logtime.getTime() - a.logtime.getTime());
}

export function buildDailyTeamPostChart(entries: ParsedLogEntry[], selectedUser: string, maxVisibleTeams = 5): DailyTeamPostEntry[] {
    if (!selectedUser) return [];

    const filteredEntries = entries.filter((entry) => parseUserFromTitle(entry.title) === selectedUser.toLowerCase());
    const teamCounts = new Map<string, number>();
    filteredEntries.forEach((entry) => {
        const team = (entry.targetTeam ?? "Unbekannt").trim() || "Unbekannt";
        teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
    });

    const orderedTeams = Array.from(teamCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([team]) => team);
    const visibleTeams = orderedTeams.slice(0, maxVisibleTeams);
    const hiddenTeams = orderedTeams.slice(maxVisibleTeams);

    const dateMap = new Map<string, DailyTeamPostEntry>();

    filteredEntries.forEach((entry) => {
        const date = toDateKey(entry.logtime);
        const team = (entry.targetTeam ?? "Unbekannt").trim() || "Unbekannt";
        const day = dateMap.get(date) ?? { date };

        if (visibleTeams.includes(team)) {
            day[team] = ((day[team] as number) ?? 0) + 1;
        } else {
            day.Sonstige = ((day.Sonstige as number) ?? 0) + 1;
        }

        dateMap.set(date, day);
    });

    return Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => {
            const merged: DailyTeamPostEntry = { date };
            visibleTeams.forEach((team) => {
                merged[team] = Number(row[team] ?? 0);
            });
            if (hiddenTeams.length > 0) {
                merged.Sonstige = Number(row.Sonstige ?? 0);
            }
            return merged;
        });
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Holt alle Items aus der SharePoint-Liste inkl. Pagination (nextLink).
 */
async function fetchAllLogItems(accessToken: string): Promise<SPLogFields[]> {
    const fields = "Logtime,TotalSizeMB,Status,PhotoCount,Title,ErrorMessage,TargetTeam";
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
    const { instance, accounts } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const [entries, setEntries] = useState<ParsedLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [selectedEmployee, setSelectedEmployee] = useState("");

    useEffect(() => {
        if (!isAuthenticated || accounts.length === 0) {
            setLoading(false);
            return undefined;
        }

        let cancelled = false;

        (async () => {
            try {
                // Token automatisch via MSAL holen (gleicher Mechanismus wie restliche App)
                const account = accounts[0];
                const response = await instance.acquireTokenSilent({
                    ...loginRequest,
                    account
                });
                const accessToken = response.accessToken;

                const raw = await fetchAllLogItems(accessToken);
                if (cancelled) return;

                const parsed: ParsedLogEntry[] = raw.map((f) => ({
                    title: f.Title ?? "–",
                    logtime: parseLogtime(f.Logtime),
                    photoCount: f.PhotoCount ?? 0,
                    totalSizeMB: f.TotalSizeMB ?? 0,
                    status: f.Status === "Error" ? "Error" : "Success",
                    errorMessage: f.ErrorMessage ?? "",
                    targetTeam: f.TargetTeam ?? "Unbekannt"
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
    }, [isAuthenticated, accounts, instance]);

    // ── Aggregationen ─────────────────────────────────────────────────────────

    const employeeUsage = useMemo(() => buildEmployeeUsageSummary(entries), [entries]);
    const employeeOptions = useMemo(() => employeeUsage.map((row) => row.user), [employeeUsage]);
    const currentEntries = useMemo(() => {
        if (!selectedEmployee) return entries;
        return entries.filter((entry) => parseUserFromTitle(entry.title) === selectedEmployee.toLowerCase());
    }, [entries, selectedEmployee]);

    /** Uploads pro Monat + MB pro Monat */
    const monthlyData: MonthlyData[] = useMemo(() => {
        const map = new Map<string, { uploads: number; totalMB: number }>();
        currentEntries.forEach((e) => {
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
    }, [currentEntries]);

    /** Success vs Fail Counts + Prozent */
    const statusData: StatusData[] = useMemo(() => {
        const total = currentEntries.length;
        if (total === 0) return [];
        const successCount = currentEntries.filter((e) => e.status === "Success").length;
        const errorCount = total - successCount;
        return [
            { name: "Success", value: successCount, percent: ((successCount / total) * 100).toFixed(1) },
            { name: "Error", value: errorCount, percent: ((errorCount / total) * 100).toFixed(1) }
        ];
    }, [currentEntries]);
    const selectedEmployeeSummary = useMemo(
        () => employeeUsage.find((row) => row.user === selectedEmployee.toLowerCase()) ?? null,
        [employeeUsage, selectedEmployee]
    );
    const selectedEmployeeHistory = useMemo(
        () => (selectedEmployee ? buildEmployeeTeamHistory(entries, selectedEmployee.toLowerCase()) : []),
        [entries, selectedEmployee]
    );
    const dailyTeamPostChart = useMemo(
        () => (selectedEmployee ? buildDailyTeamPostChart(entries, selectedEmployee.toLowerCase()) : []),
        [entries, selectedEmployee]
    );
    const teamKeys = useMemo(() => {
        const set = new Set<string>();
        dailyTeamPostChart.forEach((day) => {
            Object.keys(day).forEach((key) => {
                if (key !== "date") set.add(key);
            });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [dailyTeamPostChart]);
    const showTeamLegend = teamKeys.length <= 5;

    /** Gesamtsummen */
    const totalUploads = currentEntries.length;
    const totalMB = useMemo(
        () => Math.round(currentEntries.reduce((sum, e) => sum + e.totalSizeMB, 0) * 100) / 100,
        [currentEntries]
    );

    /** Letzte 10 Einträge */
    const recentEntries = useMemo(() => currentEntries.slice(0, 10), [currentEntries]);

    const filteredEmployeeUsage = useMemo(() => {
        const query = employeeSearch.trim().toLowerCase();
        const base = selectedEmployee ? employeeUsage.filter((row) => row.user === selectedEmployee.toLowerCase()) : employeeUsage;
        if (!query) return base;
        return base.filter((row) => row.user.toLowerCase().includes(query));
    }, [employeeSearch, employeeUsage, selectedEmployee]);
    const activeUsers = selectedEmployee ? 1 : employeeUsage.length;
    const successfulUploads = currentEntries.filter((entry) => entry.status === "Success").length;
    const failedUploads = currentEntries.filter((entry) => entry.status === "Error").length;
    const employeeLeader = selectedEmployeeSummary ?? employeeUsage[0] ?? null;

    // ── Render ────────────────────────────────────────────────────────────────

    if (!isAuthenticated) {
        return (
            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Alert severity="warning">
                    Bitte melde dich zuerst an, um die Statistiken zu sehen.
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
            {selectedEmployee && selectedEmployeeSummary && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    Gefiltert auf Mitarbeiter: {selectedEmployeeSummary.user} · {selectedEmployeeSummary.uploads} Uploads
                </Alert>
            )}

            {/* ── Gesamtsummen ──────────────────────────────────────────── */}
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 160, textAlign: "center" }}>
                    <Typography variant="h5">{totalUploads}</Typography>
                    <Typography variant="body2" color="text.secondary">Uploads gesamt</Typography>
                </Paper>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 160, textAlign: "center" }}>
                    <Typography variant="h5">{activeUsers}</Typography>
                    <Typography variant="body2" color="text.secondary">Aktive Nutzer</Typography>
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

            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 4 }}>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 200 }}>
                    <Typography variant="h6" gutterBottom>Top Nutzer</Typography>
                    <Typography variant="body2" color="text.secondary">Leader</Typography>
                    <Typography variant="h5">{employeeLeader?.user ?? "-"}</Typography>
                    <Typography variant="body2">{employeeLeader?.uploads ?? 0} Uploads · {employeeLeader?.totalMB ?? 0} MB</Typography>
                </Paper>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 200 }}>
                    <Typography variant="h6" gutterBottom>Erfolgsquote</Typography>
                    <Typography variant="h5">{successfulUploads}</Typography>
                    <Typography variant="body2" color="text.secondary">Erfolgreiche Uploads</Typography>
                </Paper>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 200 }}>
                    <Typography variant="h6" gutterBottom>Fehler</Typography>
                    <Typography variant="h5">{failedUploads}</Typography>
                    <Typography variant="body2" color="text.secondary">Fehlgeschlagene Uploads</Typography>
                </Paper>
            </Box>

            <Paper elevation={2} sx={{ p: 2, mb: 4 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <Typography variant="h6" sx={{ mb: 0 }}>Mitarbeiter filtern</Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                            setSelectedEmployee("");
                            setEmployeeSearch("");
                        }}
                        sx={{ minWidth: "auto" }}
                    >
                        Zurücksetzen
                    </Button>
                </Box>
                <Autocomplete
                    options={employeeOptions}
                    freeSolo
                    value={selectedEmployee || null}
                    inputValue={employeeSearch}
                    onInputChange={(_event, newInputValue) => {
                        setEmployeeSearch(newInputValue);
                        if (!newInputValue) {
                            setSelectedEmployee("");
                        }
                    }}
                    onChange={(_event, newValue) => {
                        const nextValue = typeof newValue === "string" ? newValue : newValue ?? "";
                        setSelectedEmployee(nextValue.toLowerCase());
                        setEmployeeSearch(nextValue);
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            size="small"
                            label="Mitarbeiter auswählen"
                            placeholder="Name oder E-Mail eingeben"
                            sx={{ mt: 2 }}
                        />
                    )}
                    sx={{ mt: 1 }}
                />
            </Paper>

            {/* ── Charts Row ───────────────────────────────────────────── */}
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 4 }}>
                {selectedEmployee && dailyTeamPostChart.length > 0 && (
                    <Paper elevation={3} sx={{ p: 2, flex: 1, minWidth: 420, width: "100%" }}>
                        <Typography variant="h6" gutterBottom>Posts pro Tag nach Team</Typography>
                        <ResponsiveContainer width="100%" height={360}>
                            <BarChart data={dailyTeamPostChart}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                {showTeamLegend && <Legend />}
                                {teamKeys.map((team, index) => (
                                    <Bar
                                        key={team}
                                        dataKey={team}
                                        name={team}
                                        fill={['#1976d2', '#2e7d32', '#ed6c02', '#9c27b0', '#d32f2f'][index % 5]}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                )}
            </Box>

            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 4 }}>
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

            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 4 }}>
                <Paper elevation={2} sx={{ p: 2, flex: 1, minWidth: 260 }}>
                    <Typography variant="h6" gutterBottom>Top 5 Mitarbeiter</Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Mitarbeiter</TableCell>
                                <TableCell align="right">Uploads</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {employeeUsage.slice(0, 5).map((row) => (
                                <TableRow key={row.user}>
                                    <TableCell>{row.user}</TableCell>
                                    <TableCell align="right">{row.uploads}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            </Box>

            <Paper elevation={2} sx={{ p: 2, mb: 4 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
                    <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>Mitarbeiter-Übersicht</Typography>
                </Box>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Mitarbeiter</TableCell>
                                <TableCell>Hauptteam</TableCell>
                                <TableCell align="right">Uploads</TableCell>
                                <TableCell align="right">Erfolgreich</TableCell>
                                <TableCell align="right">Fehler</TableCell>
                                <TableCell align="right">Erfolgsrate</TableCell>
                                <TableCell align="right">MB</TableCell>
                                <TableCell>Letzte Aktivität</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredEmployeeUsage.map((row) => (
                                <TableRow key={row.user}>
                                    <TableCell>{row.user}</TableCell>
                                    <TableCell>{row.primaryTeam}</TableCell>
                                    <TableCell align="right">{row.uploads}</TableCell>
                                    <TableCell align="right">{row.successfulUploads}</TableCell>
                                    <TableCell align="right">{row.failedUploads}</TableCell>
                                    <TableCell align="right">{row.successRate}%</TableCell>
                                    <TableCell align="right">{row.totalMB.toFixed(1)}</TableCell>
                                    <TableCell>
                                        {row.lastActivity ? row.lastActivity.toLocaleDateString("de-CH") : "-"}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {selectedEmployeeHistory.length > 0 && (
                <Paper elevation={2} sx={{ p: 2, mb: 4 }}>
                    <Typography variant="h6" gutterBottom>Team-/Datumsverlauf für {selectedEmployee}</Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Datum</TableCell>
                                    <TableCell>Team</TableCell>
                                    <TableCell align="right">Anzahl Posts</TableCell>
                                    <TableCell align="right">MB</TableCell>
                                    <TableCell>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {selectedEmployeeHistory.map((item) => (
                                    <TableRow key={`${item.user}-${item.date}-${item.team}`}>
                                        <TableCell>{item.date}</TableCell>
                                        <TableCell>{item.team}</TableCell>
                                        <TableCell align="right">{item.uploads}</TableCell>
                                        <TableCell align="right">{item.totalMB.toFixed(1)}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={item.status}
                                                size="small"
                                                color={item.status === "Success" ? "success" : "error"}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

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
