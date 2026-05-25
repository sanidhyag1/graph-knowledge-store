import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useThemeMode } from "./MaterialThemeProvider";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Tooltip from "@mui/material/Tooltip";
import FunctionsIcon from "@mui/icons-material/Functions";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SaveIcon from "@mui/icons-material/Save";
import { useSnackbar } from "notistack";

export default function ArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { dark } = useThemeMode();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fixEquations, setFixEquations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [fixing, setFixing] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setUploading(true);
        try {
          const result = await api.uploadImage(file);
          const imageMarkdown = `![image](${result.url})`;
          setContent((prev) => {
            const ta = getTextArea();
            if (ta) {
              const pos = ta.selectionStart;
              return prev.substring(0, pos) + imageMarkdown + prev.substring(pos);
            }
            return prev + "\n" + imageMarkdown;
          });
          enqueueSnackbar("Image uploaded", { variant: "success", autoHideDuration: 2000 });
        } catch {
          enqueueSnackbar("Image upload failed", { variant: "error" });
        }
        setUploading(false);
        break;
      }
    }
  }

  if (isEditing && !loaded) {
    (async () => {
      const article = await api.getArticle(id!);
      setTitle(article.title);
      setContent(article.content);
      setLoaded(true);
    })();
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  function getTextArea(): HTMLTextAreaElement | null {
    return document.querySelector("textarea.w-md-editor-text-input") || document.querySelector(".w-md-editor textarea") || null;
  }

  async function handleSave() {
    if (!content.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (isEditing) {
        await api.updateArticle(id!, { title, content, fix_equations: fixEquations || undefined });
        enqueueSnackbar("Article updated", { variant: "success" });
        navigate(`/article/${id}`);
      } else {
        const article = await api.createArticle({ content, fix_equations: fixEquations || undefined });
        enqueueSnackbar("Article created", { variant: "success" });
        navigate(`/article/${article.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const canSave = isEditing
    ? loading || !content.trim() || !title.trim()
    : loading || !content.trim();

  async function handleFixEquation() {
    const ta = getTextArea();
    if (!ta) {
      enqueueSnackbar("Could not find editor textarea", { variant: "error" });
      return;
    }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    if (s === e) {
      enqueueSnackbar("Select an equation in the editor first", { variant: "info", autoHideDuration: 3000 });
      return;
    }
    const selected = content.substring(s, e);
    if (!selected.trim()) return;

    setFixing(true);
    try {
      const res = await api.fixEquation(selected);
      const newContent = content.substring(0, s) + res.fixed + content.substring(e);
      setContent(newContent);
      enqueueSnackbar("Equation fixed", { variant: "success", autoHideDuration: 2000 });
    } catch {
      enqueueSnackbar("Failed to fix equation", { variant: "error" });
    }
    setFixing(false);
  }

  return (
    <Box sx={{ maxWidth: 900 }} data-color-mode={dark ? "dark" : "light"}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {isEditing ? "Edit Article" : "New Article"}
        </Typography>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={canSave}
        >
          {loading ? "Saving..." : "Save"}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {isEditing && (
        <TextField
          fullWidth
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 3 }}
          size="small"
        />
      )}

      {!isEditing && (
        <Alert severity="info" icon={<AutoFixHighIcon />} sx={{ mb: 3 }}>
          Title will be auto-generated from your content
        </Alert>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={fixEquations}
              onChange={(e) => setFixEquations(e.target.checked)}
              icon={<FunctionsIcon />}
              checkedIcon={<FunctionsIcon />}
            />
          }
          label={
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
              Auto-fix equations
              <Typography component="span" variant="caption" color="text.disabled">
                (regex on save)
              </Typography>
            </Box>
          }
        />
        <Tooltip title="Select equation text in the editor, then click this to fix it with LLM">
          <Button
            size="small"
            variant="outlined"
            startIcon={fixing ? <CircularProgress size={14} /> : <FunctionsIcon />}
            onClick={handleFixEquation}
            disabled={fixing}
            sx={{ borderRadius: 2 }}
          >
            {fixing ? "Fixing..." : "Fix Equation (select first)"}
          </Button>
        </Tooltip>
      </Box>

      <div onPaste={handlePaste}>
        <MDEditor value={content} onChange={(v) => setContent(v || "")} height={700} />
        {uploading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">Uploading image...</Typography>
          </Box>
        )}
      </div>
    </Box>
  );
}
