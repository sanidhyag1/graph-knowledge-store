import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import Fuse from "fuse.js";
import { api, type Article, type QuizType } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import RelatedArticles from "./RelatedArticles";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

const ACTIVE_QUIZ_KEY = "active-quiz-id";

const QUIZ_TYPES: { value: QuizType; label: string; icon: React.ReactNode }[] = [
  { value: "mcq", label: "Multiple Choice", icon: <CheckBoxOutlinedIcon fontSize="small" /> },
  { value: "short_answer", label: "Short Answer", icon: <EditNoteOutlinedIcon fontSize="small" /> },
  { value: "flashcard", label: "Flashcards", icon: <StyleOutlinedIcon fontSize="small" /> },
];

export default function ArticleView() {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quizAnchor, setQuizAnchor] = useState<null | HTMLElement>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagType, setTagType] = useState<"topic" | "keyword">("topic");
  const [showTagInput, setShowTagInput] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [allTopics, setAllTopics] = useState<string[]>([]);
  const [allKeywords, setAllKeywords] = useState<string[]>([]);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    api.getArticle(id).then(setArticle).catch(() => navigate("/"));
  }, [id, navigate]);

  useEffect(() => {
    if (article) {
      document.title = article.title;
    }
    return () => {
      document.title = "Knowledge Store";
    };
  }, [article]);

  useEffect(() => {
    api.getArticlesIndex().then((data) => {
      const topicSet = new Set<string>();
      const keywordSet = new Set<string>();
      for (const a of data.articles) {
        for (const t of a.topics) topicSet.add(t);
        for (const k of a.keywords) keywordSet.add(k);
      }
      setAllTopics(Array.from(topicSet).sort());
      setAllKeywords(Array.from(keywordSet).sort());
    });
  }, []);

  const availableSuggestions = useMemo(() => {
    const pool = tagType === "topic" ? allTopics : allKeywords;
    const current = article ? (tagType === "topic" ? article.topics : article.keywords) : [];
    const currentLower = new Set(current.map((s: string) => s.toLowerCase()));
    return pool.filter((s) => !currentLower.has(s.toLowerCase()));
  }, [tagType, allTopics, allKeywords, article]);

  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return availableSuggestions.slice(0, 8);
    const fuse = new Fuse(availableSuggestions, { threshold: 0.4, ignoreLocation: true });
    return fuse.search(tagInput.trim(), { limit: 8 }).map((r) => r.item);
  }, [tagInput, availableSuggestions]);

  async function handleDelete() {
    setConfirmOpen(false);
    await api.deleteArticle(article!.id);
    navigate("/");
  }

  async function handleQuizTypeSelect(quizType: QuizType) {
    setQuizAnchor(null);
    if (!article) return;
    setQuizLoading(true);
    try {
      const res = await api.generateArticleQuiz(article.id, { quiz_type: quizType, num_questions: 10 });
      localStorage.setItem(ACTIVE_QUIZ_KEY, res.quiz_id);
      navigate("/quiz");
    } catch (err) {
      setQuizLoading(false);
    }
  }

  function handleCopyMarkdown() {
    if (!article) return;
    const md = `# ${article.title}\n\n${article.content}`;
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleAddTag(value?: string) {
    const tag = (value || tagInput).trim();
    if (!article || !tag) return;
    try {
      const key = tagType === "topic" ? "add_topics" : "add_keywords";
      const updated = await api.updateArticleTags(article.id, { [key]: [tag] });
      setArticle(updated);
      setTagInput("");
      setShowSuggestions(false);
    } catch {
      enqueueSnackbar("Failed to add tag", { variant: "error" });
    }
  }

  async function handleRemoveTag(tag: string, type: "topic" | "keyword") {
    if (!article) return;
    try {
      const key = type === "topic" ? "remove_topics" : "remove_keywords";
      const updated = await api.updateArticleTags(article.id, { [key]: [tag] });
      setArticle(updated);
    } catch {
      enqueueSnackbar("Failed to remove tag", { variant: "error" });
    }
  }

  if (!article) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1, pr: 2 }}>{article.title}</Typography>
        <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<SchoolOutlinedIcon />}
            onClick={() => navigate(`/study?article=${article.id}`)}
          >
            Study
          </Button>
          <Button
            variant="outlined"
            startIcon={quizLoading ? <CircularProgress size={16} /> : <QuizOutlinedIcon />}
            onClick={(e) => setQuizAnchor(e.currentTarget)}
            disabled={quizLoading}
          >
            Quiz
          </Button>
          <Menu
            anchorEl={quizAnchor}
            open={Boolean(quizAnchor)}
            onClose={() => setQuizAnchor(null)}
          >
            {QUIZ_TYPES.map((qt) => (
              <MenuItem key={qt.value} onClick={() => handleQuizTypeSelect(qt.value)}>
                <ListItemIcon>{qt.icon}</ListItemIcon>
                <ListItemText>{qt.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
          <Button
            variant="outlined"
            startIcon={copied ? <CheckOutlinedIcon /> : <ContentCopyOutlinedIcon />}
            onClick={handleCopyMarkdown}
            color={copied ? "success" : "primary"}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditOutlinedIcon />}
            onClick={() => navigate(`/editor/${article.id}`)}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
          {article.topics.map((t: string) => (
            <Chip
              key={t}
              label={t}
              size="small"
              color="primary"
              variant="outlined"
              clickable
              onClick={() => navigate("/?topic=" + encodeURIComponent(t))}
              onDelete={() => handleRemoveTag(t, "topic")}
            />
          ))}
          {article.keywords.map((k: string) => (
            <Chip
              key={k}
              label={k}
              size="small"
              variant="outlined"
              clickable
              onClick={() => navigate("/?keyword=" + encodeURIComponent(k))}
              onDelete={() => handleRemoveTag(k, "keyword")}
            />
          ))}
          {showTagInput ? (
            <Box ref={tagContainerRef} sx={{ display: "flex", alignItems: "center", gap: 0.5, position: "relative" }}>
              <Box
                component="select"
                value={tagType}
                onChange={(e) => { setTagType(e.target.value as "topic" | "keyword"); setTagInput(""); }}
                style={{
                  fontSize: 12, padding: "2px 4px", borderRadius: 4,
                  border: "1px solid", borderColor: "#ccc", background: "transparent",
                  outline: "none", cursor: "pointer",
                }}
              >
                <option value="topic">Topic</option>
                <option value="keyword">Keyword</option>
              </Box>
              <Box sx={{ position: "relative" }}>
                <Box
                  component="input"
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") handleAddTag();
                    if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
                  }}
                  placeholder="Type or select..."
                  autoFocus
                  style={{
                    fontSize: 12, padding: "2px 6px", borderRadius: 4,
                    border: "1px solid", borderColor: "#ccc", outline: "none", width: 140,
                  }}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <Paper
                    elevation={4}
                    sx={{
                      position: "absolute", zIndex: 20, top: "100%", mt: 0.5,
                      width: 200, overflow: "hidden", borderRadius: 1.5,
                      maxHeight: 200, overflowY: "auto",
                    }}
                  >
                    {suggestions.map((s) => (
                      <Box
                        key={s}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setTagInput(""); handleAddTag(s); }}
                        sx={{
                          px: 1.5, py: 0.75, cursor: "pointer", fontSize: 12,
                          borderBottom: "1px solid", borderColor: "divider",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        {s}
                      </Box>
                    ))}
                  </Paper>
                )}
              </Box>
              <Chip
                label="Add"
                size="small"
                color="primary"
                onClick={() => handleAddTag()}
                disabled={!tagInput.trim()}
                icon={<AddOutlinedIcon />}
              />
              <IconButton size="small" onClick={() => { setShowTagInput(false); setTagInput(""); }}>
                <CloseOutlinedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          ) : (
            <Chip
              label="Add Tag"
              size="small"
              variant="outlined"
              icon={<AddOutlinedIcon />}
              onClick={() => { setShowTagInput(true); setTimeout(() => tagInputRef.current?.focus(), 50); }}
              sx={{ borderStyle: "dashed" }}
            />
          )}
        </Box>
      </Box>

      <Paper elevation={0} sx={{ p: 3, bgcolor: "background.paper", borderRadius: 2 }}>
        <MarkdownPreview content={article.content} />
      </Paper>

      <RelatedArticles articleId={article.id} />

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 3 }}>
        Created {new Date(article.created_at).toLocaleString()} · Updated {new Date(article.updated_at).toLocaleString()}
      </Typography>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete Article?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete &quot;{article.title}&quot;.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
