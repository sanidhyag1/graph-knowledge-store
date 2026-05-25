import { useCallback, useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { api, type VaultEntry, type TrackedFile, type ObsidianStatus } from "../api/client";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import Link from "@mui/material/Link";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import NavigateNextOutlinedIcon from "@mui/icons-material/NavigateNextOutlined";

function statusChip(status: string) {
  switch (status) {
    case "synced":
      return <Chip label="Synced" size="small" icon={<CheckCircleOutlinedIcon />} color="success" variant="outlined" />;
    case "pending":
      return <Chip label="Pending" size="small" icon={<SyncOutlinedIcon />} color="info" variant="outlined" />;
    case "missing":
      return <Chip label="Missing" size="small" icon={<WarningAmberOutlinedIcon />} color="warning" variant="outlined" />;
    case "error":
      return <Chip label="Error" size="small" icon={<ErrorOutlineOutlinedIcon />} color="error" variant="outlined" />;
    default:
      return <Chip label={status} size="small" variant="outlined" />;
  }
}

export default function ObsidianPage() {
  const { enqueueSnackbar } = useSnackbar();

  const [status, setStatus] = useState<ObsidianStatus | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tracked, setTracked] = useState<TrackedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [attachmentPath, setAttachmentPath] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.obsidianStatus();
      setStatus(s);
      setAttachmentPath(s.attachment_path || "");
    } catch {
      setStatus(null);
    }
  }, []);

  const loadEntries = useCallback(async (path: string) => {
    try {
      const data = await api.obsidianBrowse(path);
      setEntries(data.entries);
      setCurrentPath(data.current_path);
      setSelected(new Set());
    } catch {
      enqueueSnackbar("Failed to browse vault", { variant: "error" });
    }
  }, [enqueueSnackbar]);

  const loadTracked = useCallback(async () => {
    try {
      const data = await api.obsidianTracked();
      setTracked(data.files);
    } catch {
      enqueueSnackbar("Failed to load tracked files", { variant: "error" });
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadEntries(""), loadTracked()]);
      setLoading(false);
    })();
  }, [loadStatus, loadEntries, loadTracked]);

  function navigateTo(path: string) {
    loadEntries(path);
  }

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAllUntracked() {
    const untracked = entries.filter((e) => !e.is_dir && e.name.endsWith(".md") && !e.is_tracked);
    if (untracked.length === selected.size && untracked.every((e) => selected.has(e.path))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(untracked.map((e) => e.path)));
    }
  }

  async function handleTrack() {
    if (selected.size === 0) return;
    setTracking(true);
    try {
      const res = await api.obsidianTrack(Array.from(selected));
      enqueueSnackbar(`Tracked ${res.tracked} file(s)`, { variant: "success" });
      setSelected(new Set());
      await Promise.all([loadEntries(currentPath), loadTracked(), loadStatus()]);
    } catch {
      enqueueSnackbar("Failed to track files", { variant: "error" });
    }
    setTracking(false);
  }

  async function handleUntrack(paths: string[]) {
    try {
      const res = await api.obsidianUntrack(paths);
      enqueueSnackbar(`Untracked ${res.untracked} file(s)`, { variant: "success" });
      await Promise.all([loadEntries(currentPath), loadTracked(), loadStatus()]);
    } catch {
      enqueueSnackbar("Failed to untrack file", { variant: "error" });
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api.obsidianSync();
      const parts: string[] = [];
      if (res.synced) parts.push(`${res.synced} synced`);
      if (res.errors) parts.push(`${res.errors} errors`);
      if (res.missing) parts.push(`${res.missing} missing`);
      enqueueSnackbar(parts.length ? parts.join(", ") : "Everything up to date", {
        variant: res.errors ? "warning" : "success",
      });
      await Promise.all([loadTracked(), loadStatus()]);
    } catch {
      enqueueSnackbar("Sync failed", { variant: "error" });
    }
    setSyncing(false);
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await api.obsidianUpdateSettings({ attachment_path: attachmentPath });
      enqueueSnackbar("Settings saved", { variant: "success" });
      await loadStatus();
    } catch {
      enqueueSnackbar("Failed to save settings", { variant: "error" });
    }
    setSavingSettings(false);
  }

  const breadcrumbParts = currentPath ? currentPath.split("/").filter(Boolean) : [];

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!status?.configured) {
    return (
      <Box sx={{ maxWidth: 700, mx: "auto" }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
          Obsidian Vault
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Obsidian vault is not configured. Set the <strong>OBSIDIAN_VAULT_PATH</strong> environment variable on the server to enable this feature.
        </Alert>
      </Box>
    );
  }

  const untrackedMdFiles = entries.filter((e) => !e.is_dir && e.name.endsWith(".md") && !e.is_tracked);

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Obsidian Vault
      </Typography>

      {/* Settings Section */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: "background.paper", borderRadius: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <SettingsOutlinedIcon sx={{ color: "text.secondary" }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Settings</Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Vault Path</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{status.vault_path}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Sync Interval</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{status.sync_interval_minutes} minutes</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Tracked Files</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{status.tracked_count}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Last Sync</Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : "Never"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
            <TextField
              label="Attachment Path"
              size="small"
              value={attachmentPath}
              onChange={(e) => setAttachmentPath(e.target.value)}
              placeholder="attachments"
              sx={{ width: 200 }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? "Saving..." : "Save"}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Two-Panel Layout */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
        {/* Left Panel — Vault Browser */}
        <Paper elevation={0} sx={{ p: 2.5, bgcolor: "background.paper", borderRadius: 2, minHeight: 400 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Vault Browser</Typography>
            <Button
              size="small"
              variant="contained"
              onClick={handleTrack}
              disabled={selected.size === 0 || tracking}
              startIcon={tracking ? <CircularProgress size={14} /> : undefined}
            >
              {tracking ? "Tracking..." : `Track Selected (${selected.size})`}
            </Button>
          </Box>

          {/* Breadcrumbs */}
          <Breadcrumbs separator={<NavigateNextOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
            <Link
              component="button"
              underline="hover"
              color={currentPath ? "inherit" : "text.primary"}
              sx={{ fontWeight: currentPath ? 400 : 600, fontSize: "0.85rem", cursor: "pointer" }}
              onClick={() => navigateTo("")}
            >
              Vault Root
            </Link>
            {breadcrumbParts.map((part, idx) => {
              const path = breadcrumbParts.slice(0, idx + 1).join("/");
              const isLast = idx === breadcrumbParts.length - 1;
              return (
                <Link
                  key={path}
                  component="button"
                  underline="hover"
                  color={isLast ? "text.primary" : "inherit"}
                  sx={{ fontWeight: isLast ? 600 : 400, fontSize: "0.85rem", cursor: "pointer" }}
                  onClick={() => navigateTo(path)}
                >
                  {part}
                </Link>
              );
            })}
          </Breadcrumbs>

          {/* Select all checkbox */}
          {untrackedMdFiles.length > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", mb: 1, ml: -0.5 }}>
              <Checkbox
                size="small"
                checked={untrackedMdFiles.length > 0 && untrackedMdFiles.every((e) => selected.has(e.path))}
                indeterminate={selected.size > 0 && selected.size < untrackedMdFiles.length}
                onChange={selectAllUntracked}
              />
              <Typography variant="caption" color="text.secondary">
                Select all .md files ({untrackedMdFiles.length})
              </Typography>
            </Box>
          )}

          {/* File List */}
          {entries.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">This folder is empty</Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {entries.map((entry) => (
                <Box
                  key={entry.path}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1.5,
                    cursor: entry.is_dir ? "pointer" : "default",
                    "&:hover": { bgcolor: "action.hover" },
                    transition: "background-color 0.15s",
                  }}
                  onClick={entry.is_dir ? () => navigateTo(entry.path) : undefined}
                >
                  {entry.is_dir ? (
                    <FolderOutlinedIcon sx={{ color: "warning.main", fontSize: 20 }} />
                  ) : entry.is_tracked ? (
                    <Tooltip title="Already tracked" arrow>
                      <CheckCircleOutlinedIcon sx={{ color: "success.main", fontSize: 20 }} />
                    </Tooltip>
                  ) : entry.name.endsWith(".md") ? (
                    <Checkbox
                      size="small"
                      checked={selected.has(entry.path)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(entry.path); }}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ p: 0 }}
                    />
                  ) : (
                    <InsertDriveFileOutlinedIcon sx={{ color: "text.disabled", fontSize: 20 }} />
                  )}
                  <Typography
                    variant="body2"
                    sx={{
                      flex: 1,
                      fontWeight: entry.is_dir ? 500 : 400,
                      color: entry.is_dir ? "text.primary" : entry.name.endsWith(".md") ? "text.primary" : "text.disabled",
                    }}
                  >
                    {entry.name}
                  </Typography>
                  {entry.is_dir && (
                    <NavigateNextOutlinedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        {/* Right Panel — Tracked Files */}
        <Paper elevation={0} sx={{ p: 2.5, bgcolor: "background.paper", borderRadius: 2, minHeight: 400 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Tracked Files ({tracked.length})
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={syncing ? <CircularProgress size={14} /> : <SyncOutlinedIcon />}
              onClick={handleSync}
              disabled={syncing || tracked.length === 0}
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </Button>
          </Box>

          {status.last_sync_at && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
              Last synced: {new Date(status.last_sync_at).toLocaleString()}
            </Typography>
          )}

          {tracked.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                No tracked files yet. Use the vault browser to select and track .md files.
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>File</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Last Sync</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tracked.map((file) => {
                    const filename = file.relative_path.split("/").pop() || file.relative_path;
                    return (
                      <TableRow key={file.id} hover>
                        <TableCell>
                          <Tooltip title={file.relative_path} arrow>
                            <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {filename}
                            </Typography>
                          </Tooltip>
                          <Typography variant="caption" color="text.disabled" sx={{ display: "block", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {file.relative_path}
                          </Typography>
                        </TableCell>
                        <TableCell>{statusChip(file.status)}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {file.last_synced_at ? new Date(file.last_synced_at).toLocaleString() : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                            {file.article_id && (
                              <Tooltip title="View article" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => window.open(`/article/${file.article_id}`, "_blank")}
                                  sx={{ color: "primary.main" }}
                                >
                                  <LinkOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Untrack" arrow>
                              <IconButton
                                size="small"
                                onClick={() => handleUntrack([file.relative_path])}
                                sx={{ color: "error.main", opacity: 0.6, "&:hover": { opacity: 1 } }}
                              >
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
