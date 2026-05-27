import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Fuse from "fuse.js";
import { useSnackbar } from "notistack";
import {
  api,
  type QuizResponse,
  type QuizType,
  type QuizHistoryItem,
  type ArticleIndexItem,
} from "../api/client";
import QuizRunner, { type QuizAnswer } from "../components/QuizRunner";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Slider from "@mui/material/Slider";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Tooltip from "@mui/material/Tooltip";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import DoneAllOutlinedIcon from "@mui/icons-material/DoneAllOutlined";
import Autocomplete from "@mui/material/Autocomplete";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";

const POLL_INTERVAL_MS = 3000;
const ACTIVE_QUIZ_KEY = "active-quiz-id";

const QUIZ_TYPES: { value: QuizType; label: string; description: string }[] = [
  { value: "mcq", label: "Multiple Choice", description: "4 options, immediate feedback with explanations" },
  { value: "short_answer", label: "Short Answer", description: "Type your answer, compare with model answer" },
  { value: "flashcard", label: "Flashcards", description: "Flip to reveal, self-rate your recall" },
];

function ChipInput({
  label,
  available,
  selected,
  onChange,
}: {
  label: string;
  available: string[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fuseRef = useRef<Fuse<string> | null>(null);

  useEffect(() => {
    fuseRef.current = new Fuse(available, { threshold: 0.4, ignoreLocation: true });
  }, [available]);

  function handleInput(value: string) {
    setQuery(value);
    setShowSuggestions(true);
    const lowerSelected = selected.map((s) => s.toLowerCase());
    if (!fuseRef.current || value.trim().length < 1) {
      setSuggestions(available.filter((a) => !lowerSelected.includes(a.toLowerCase())).slice(0, 8));
      return;
    }
    const matches = fuseRef.current.search(value.trim(), { limit: 8 }).map((r) => r.item);
    setSuggestions(matches.filter((m) => !lowerSelected.includes(m.toLowerCase())));
  }

  function select(item: string) {
    const lowerSelected = selected.map((s) => s.toLowerCase());
    if (!lowerSelected.includes(item.toLowerCase())) {
      onChange([...selected, item]);
    }
    setQuery("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function remove(item: string) {
    onChange(selected.filter((s) => s !== item));
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {label}
        {selected.length > 0 && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            ({selected.length} selected)
          </Typography>
        )}
      </Typography>

      {selected.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
          {selected.map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              onDelete={() => remove(s)}
              color={label === "Topics" ? "primary" : "secondary"}
              variant="outlined"
            />
          ))}
        </Box>
      )}

      <Box sx={{ position: "relative" }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { setShowSuggestions(true); handleInput(query); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={`Search ${label.toLowerCase()}...`}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <Paper
            elevation={4}
            sx={{
              position: "absolute", zIndex: 20, top: "100%", mt: 0.5,
              width: "100%", overflow: "hidden", borderRadius: 2,
              maxHeight: 240, overflowY: "auto",
            }}
          >
            {suggestions.map((s) => (
              <Box
                key={s}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(s)}
                sx={{
                  px: 2, py: 1, cursor: "pointer",
                  borderBottom: "1px solid", borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography variant="body2">{s}</Typography>
              </Box>
            ))}
          </Paper>
        )}
      </Box>
    </Box>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function QuizTypeLabel({ type }: { type: QuizType }) {
  const map: Record<QuizType, string> = { mcq: "Multiple Choice", short_answer: "Short Answer", flashcard: "Flashcards" };
  return <>{map[type]}</>;
}

export default function QuizPage() {
  const [searchParams] = useSearchParams();
  const initialTopics = searchParams.get("topics")?.split(",").filter(Boolean) ||
    (searchParams.get("topic") ? [searchParams.get("topic")!] : []);
  const initialKeywords = searchParams.get("keywords")?.split(",").filter(Boolean) ||
    (searchParams.get("keyword") ? [searchParams.get("keyword")!] : []);

  const [tab, setTab] = useState(0);
  const [sourceType, setSourceType] = useState<"tags" | "articles">("tags");
  const [allArticles, setAllArticles] = useState<ArticleIndexItem[]>([]);
  const [selectedArticles, setSelectedArticles] = useState<ArticleIndexItem[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(initialTopics);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(initialKeywords);
  const [quizType, setQuizType] = useState<QuizType>("mcq");
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [error, setError] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);

  const [, setQuizId] = useState<string | null>(() => localStorage.getItem(ACTIVE_QUIZ_KEY));
  const [status, setStatus] = useState<string | null>(() => localStorage.getItem(ACTIVE_QUIZ_KEY) ? "generating" : null);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reviewQuiz, setReviewQuiz] = useState<QuizResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuizHistoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<"selected" | "all" | null>(null);

  const allSelected = history.length > 0 && selectedIds.size === history.length;

  useEffect(() => {
    api.getArticlesIndex().then((data) => {
      setAllArticles(data.articles);
      const topicSet = new Set<string>();
      const keywordSet = new Set<string>();
      for (const a of data.articles) {
        for (const t of a.topics) topicSet.add(t);
        for (const k of a.keywords) keywordSet.add(k);
      }
      setTopics(Array.from(topicSet).sort());
      setKeywords(Array.from(keywordSet).sort());
      setIndexLoading(false);
    });
  }, []);



  useEffect(() => {
    if (tab === 1) loadHistory();
  }, [tab]);

  function loadHistory() {
    setHistoryLoading(true);
    api.getQuizHistory().then((data) => {
      setHistory(data);
      setHistoryLoading(false);
    }).catch(() => setHistoryLoading(false));
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getQuizStatus(id);
        setStatus(res.status);
        setProgress(res.progress);
        setTotal(res.total);

        if (res.status === "ready") {
          stopPolling();
          localStorage.removeItem(ACTIVE_QUIZ_KEY);
          const fullQuiz = await api.getQuizResult(id);
          setQuiz(fullQuiz);
          setQuizId(null);
          setStatus(null);
          enqueueSnackbar("Your quiz is ready!", { variant: "success", autoHideDuration: 4000 });
        } else if (res.status === "failed") {
          stopPolling();
          localStorage.removeItem(ACTIVE_QUIZ_KEY);
          setError(res.error || "Quiz generation failed");
          setQuizId(null);
          setStatus(null);
        }
      } catch {
        stopPolling();
        localStorage.removeItem(ACTIVE_QUIZ_KEY);
        setError("Lost connection to quiz generator");
        setQuizId(null);
        setStatus(null);
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, enqueueSnackbar]);

  useEffect(() => {
    const savedId = localStorage.getItem(ACTIVE_QUIZ_KEY);
    if (savedId) {
      startPolling(savedId);
    }
  }, [startPolling]);

  async function handleGenerate() {
    if (sourceType === "tags" && !selectedTopics.length && !selectedKeywords.length) {
      setError("Select at least one topic or keyword");
      return;
    }
    if (sourceType === "articles" && !selectedArticles.length) {
      setError("Select at least one article");
      return;
    }
    setError("");
    setQuiz(null);
    setQuizId(null);
    setStatus(null);
    setProgress(0);
    setTotal(0);
    setReviewQuiz(null);

    try {
      const res = await api.generateQuiz({
        topics: sourceType === "tags" ? selectedTopics : [],
        keywords: sourceType === "tags" ? selectedKeywords : [],
        article_ids: sourceType === "articles" ? selectedArticles.map(a => a.id) : [],
        quiz_type: quizType,
        num_questions: numQuestions,
      });
      setQuizId(res.quiz_id);
      setStatus(res.status);
      setProgress(0);
      setTotal(numQuestions);
      localStorage.setItem(ACTIVE_QUIZ_KEY, res.quiz_id);
      startPolling(res.quiz_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start quiz generation");
    }
  }

  async function handleWeakAreas() {
    setError("");
    setQuiz(null);
    setQuizId(null);
    setStatus(null);
    setProgress(0);
    setTotal(0);
    setReviewQuiz(null);

    try {
      const res = await api.generateWeakAreasQuiz("mcq", numQuestions);
      setQuizId(res.quiz_id);
      setStatus(res.status);
      setProgress(0);
      setTotal(numQuestions);
      localStorage.setItem(ACTIVE_QUIZ_KEY, res.quiz_id);
      startPolling(res.quiz_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start weak areas quiz");
    }
  }

  async function handleComplete(answers: QuizAnswer[], score: number) {
    if (!quiz) return;
    try {
      await api.submitQuiz(quiz.quiz_id, { answers, score, total: quiz.questions.length });
      enqueueSnackbar("Quiz results saved!", { variant: "success", autoHideDuration: 3000 });
    } catch {
      enqueueSnackbar("Failed to save quiz results", { variant: "error", autoHideDuration: 3000 });
    }
  }

  function handleRestart() {
    setQuiz(null);
    setQuizId(null);
    setStatus(null);
    setProgress(0);
    setTotal(0);
    setReviewQuiz(null);
    localStorage.removeItem(ACTIVE_QUIZ_KEY);
  }

  async function handleReview(item: QuizHistoryItem) {
    try {
      const data = await api.getQuiz(item.quiz_id);
      setReviewQuiz(data);
      setQuiz(null);
    } catch {
      enqueueSnackbar("Failed to load quiz", { variant: "error" });
    }
  }

  async function handleRetake(item: QuizHistoryItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const res = await api.retakeQuiz(item.quiz_id);
      setQuizId(res.quiz_id);
      setStatus(res.status);
      setProgress(0);
      setTotal(item.num_questions);
      localStorage.setItem(ACTIVE_QUIZ_KEY, res.quiz_id);
      startPolling(res.quiz_id);
      setTab(0);
    } catch {
      enqueueSnackbar("Failed to retake quiz", { variant: "error" });
    }
  }

  async function handleDeleteQuiz() {
    if (!deleteTarget) return;
    try {
      await api.deleteQuiz(deleteTarget.quiz_id);
      setHistory((prev) => prev.filter((h) => h.quiz_id !== deleteTarget.quiz_id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.quiz_id); return n; });
      enqueueSnackbar("Quiz deleted", { variant: "success", autoHideDuration: 2000 });
    } catch {
      enqueueSnackbar("Failed to delete quiz", { variant: "error" });
    }
    setDeleteTarget(null);
  }

  async function handleBulkDelete() {
    try {
      if (bulkDeleteTarget === "all") {
        const res = await api.deleteAllQuizzes();
        enqueueSnackbar(`Deleted ${res.deleted} quiz(zes)`, { variant: "success", autoHideDuration: 2000 });
      } else {
        const ids = Array.from(selectedIds);
        if (!ids.length) return;
        const res = await api.deleteQuizzesBatch(ids);
        enqueueSnackbar(`Deleted ${res.deleted} quiz(zes)`, { variant: "success", autoHideDuration: 2000 });
      }
      setSelectedIds(new Set());
      loadHistory();
    } catch {
      enqueueSnackbar("Failed to delete quizzes", { variant: "error" });
    }
    setBulkDeleteTarget(null);
  }

  const isGenerating = status === "generating" || status === "pending";

  if (quiz) {
    const filterLabel = [
      ...quiz.topics.map((t) => `topic: ${t}`),
      ...quiz.keywords.map((k) => `keyword: ${k}`),
    ].join(", ");
    return (
      <Box sx={{ maxWidth: 720 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {quiz.quiz_type === "mcq" ? "Multiple Choice" : quiz.quiz_type === "short_answer" ? "Short Answer" : "Flashcard"} Quiz
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Based on {quiz.article_count} articles — {filterLabel}
          </Typography>
          {quiz.source_articles && quiz.source_articles.length > 0 && (
            <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              {quiz.source_articles.map((a) => (
                <Chip
                  key={a.id}
                  label={a.title}
                  size="small"
                  variant="outlined"
                  onClick={() => window.open(`/article/${a.id}`, "_blank")}
                  sx={{ cursor: "pointer" }}
                />
              ))}
            </Box>
          )}
        </Box>
        <QuizRunner quiz={quiz} onRestart={handleRestart} onComplete={handleComplete} />
      </Box>
    );
  }

  if (reviewQuiz) {
    return (
      <Box sx={{ maxWidth: 720 }}>
        <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              Quiz Review
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDate(reviewQuiz.completed_at || reviewQuiz.created_at)}
              {reviewQuiz.score !== null && reviewQuiz.score !== undefined && (
                <> — Score: {reviewQuiz.score}/{reviewQuiz.total}</>
              )}
            </Typography>
          </Box>
          <Button onClick={() => setReviewQuiz(null)}>Back to History</Button>
        </Box>
        <QuizRunner
          quiz={reviewQuiz}
          onRestart={() => setReviewQuiz(null)}
          readOnly
          onComplete={async () => {}}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Quiz</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Test your understanding with AI-generated questions from your articles
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab icon={<QuizOutlinedIcon />} iconPosition="start" label="New Quiz" />
          <Tab icon={<HistoryOutlinedIcon />} iconPosition="start" label={`Available Quizzes & History${history.length ? ` (${history.length})` : ""}`} />
        </Tabs>
      </Box>

      {tab === 0 && (
        <>
          {isGenerating && (
            <Paper sx={{ p: 3, borderRadius: 3, mb: 3, textAlign: "center" }}>
              <CircularProgress size={32} sx={{ mb: 2 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Generating quiz questions...
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Question {progress} of {total} ready
              </Typography>
              <Box sx={{ width: "100%", maxWidth: 400, mx: "auto" }}>
                <LinearProgress
                  variant="determinate"
                  value={total > 0 ? (progress / total) * 100 : 0}
                  sx={{ borderRadius: 4, height: 8 }}
                />
              </Box>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5 }}>
                You can navigate away — generation continues in the background.
              </Typography>
            </Paper>
          )}

          <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
              Quiz Source
            </Typography>
            <RadioGroup
              row
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as any)}
              sx={{ mb: 2 }}
            >
              <FormControlLabel value="tags" control={<Radio size="small" />} label={<Typography variant="body2">Topics & Keywords</Typography>} />
              <FormControlLabel value="articles" control={<Radio size="small" />} label={<Typography variant="body2">Select Articles</Typography>} />
            </RadioGroup>

            {sourceType === "tags" && (
              <>
                <Box sx={{ mb: 3 }}>
                  <ChipInput label="Topics" available={topics} selected={selectedTopics} onChange={setSelectedTopics} />
                </Box>
                <ChipInput label="Keywords" available={keywords} selected={selectedKeywords} onChange={setSelectedKeywords} />
                {!selectedTopics.length && !selectedKeywords.length && !indexLoading && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5 }}>
                    Select at least one topic or keyword to generate a quiz
                  </Typography>
                )}
              </>
            )}

            {sourceType === "articles" && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Select Articles
                </Typography>
                <Autocomplete
                  multiple
                  options={allArticles}
                  getOptionLabel={(option) => option.title}
                  value={selectedArticles}
                  onChange={(_, newValue) => setSelectedArticles(newValue)}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  renderInput={(params) => (
                    <TextField {...params} size="small" placeholder="Search articles..." />
                  )}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const { key, ...tagProps } = getTagProps({ index });
                      return <Chip variant="outlined" label={option.title} size="small" key={key} {...tagProps} />;
                    })
                  }
                />
              </Box>
            )}
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Quiz type</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {QUIZ_TYPES.map((qt) => (
                <Paper
                  key={qt.value}
                  variant="outlined"
                  onClick={() => setQuizType(qt.value)}
                  sx={{
                    p: 2, cursor: "pointer", borderRadius: 2,
                    borderColor: quizType === qt.value ? "primary.main" : "divider",
                    bgcolor: quizType === qt.value ? "action.selected" : "transparent",
                    transition: "all 0.15s",
                    "&:hover": { borderColor: "primary.light" },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{qt.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{qt.description}</Typography>
                </Paper>
              ))}
            </Box>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Number of questions: {numQuestions}
            </Typography>
            <Slider
              value={numQuestions}
              onChange={(_, v) => setNumQuestions(v as number)}
              min={3} max={15} step={1}
              marks={[{ value: 3, label: "3" }, { value: 5, label: "5" }, { value: 10, label: "10" }, { value: 15, label: "15" }]}
              valueLabelDisplay="auto"
              sx={{ mt: 1 }}
            />
          </Paper>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Button
            variant="contained"
            size="large"
            fullWidth
            startIcon={isGenerating ? <CircularProgress size={18} color="inherit" /> : <QuizOutlinedIcon />}
            onClick={handleGenerate}
            disabled={isGenerating || (sourceType === "tags" && !selectedTopics.length && !selectedKeywords.length) || (sourceType === "articles" && !selectedArticles.length)}
            sx={{ py: 1.5, borderRadius: 2, mb: 1.5 }}
          >
            {isGenerating ? `Generating (${progress}/${total})...` : "Generate Quiz"}
          </Button>

          <Button
            variant="outlined"
            size="large"
            fullWidth
            startIcon={isGenerating ? <CircularProgress size={18} /> : <SchoolOutlinedIcon />}
            onClick={handleWeakAreas}
            disabled={isGenerating}
            sx={{ py: 1.5, borderRadius: 2 }}
          >
            {isGenerating ? "Generating..." : "Quiz Weak Areas"}
          </Button>
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1, textAlign: "center" }}>
            Generates MCQs focused on flashcard concepts you struggle with most
          </Typography>
        </>
      )}

      {tab === 1 && (
        <>
          {historyLoading && <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress /></Box>}
          {!historyLoading && history.length === 0 && (
            <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
              <Typography color="text.secondary">No quiz history yet. Generate your first quiz!</Typography>
            </Paper>
          )}
          {!historyLoading && history.length > 0 && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<DoneAllOutlinedIcon />}
                  onClick={() => {
                    if (allSelected) setSelectedIds(new Set());
                    else setSelectedIds(new Set(history.map((h) => h.quiz_id)));
                  }}
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
                {selectedIds.size > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlinedIcon />}
                    onClick={() => setBulkDeleteTarget("selected")}
                  >
                    Delete Selected ({selectedIds.size})
                  </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Delete all quizzes">
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteSweepOutlinedIcon />}
                    onClick={() => setBulkDeleteTarget("all")}
                  >
                    Delete All
                  </Button>
                </Tooltip>
              </Box>

              {history.map((item) => {
                const checked = selectedIds.has(item.quiz_id);
                return (
                  <Paper
                    key={item.quiz_id}
                    variant="outlined"
                    sx={{
                      p: 2, mb: 1.5, borderRadius: 2,
                      borderColor: checked ? "primary.main" : undefined,
                      bgcolor: checked ? "action.selected" : undefined,
                      transition: "all 0.15s",
                      "&:hover": { borderColor: "primary.main", boxShadow: 1 },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                      <Checkbox
                        checked={checked}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const n = new Set(prev);
                            if (n.has(item.quiz_id)) n.delete(item.quiz_id);
                            else n.add(item.quiz_id);
                            return n;
                          });
                        }}
                        sx={{ mt: -0.5 }}
                      />
                      <Box
                        sx={{ flex: 1, cursor: "pointer" }}
                        onClick={() => handleReview(item)}
                      >
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              <QuizTypeLabel type={item.quiz_type} />
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                                {item.num_questions} questions — {item.article_count} articles
                              </Typography>
                            </Typography>
                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                              {item.topics[0] === "weak-areas" ? (
                                <Chip label="Weak Areas" size="small" variant="outlined" color="warning" />
                              ) : (
                                <>
                                  {item.topics.slice(0, 3).map((t) => (
                                    <Chip key={t} label={t} size="small" variant="outlined" color="primary" />
                                  ))}
                                  {item.topics.length > 3 && (
                                    <Chip label={`+${item.topics.length - 3}`} size="small" variant="outlined" />
                                  )}
                                </>
                              )}
                            </Box>
                            {item.source_articles && item.source_articles.length > 0 && (
                              <Box sx={{ mt: 1 }}>
                                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                                  {item.source_articles.map((a) => (
                                    <Chip 
                                      key={a.id} 
                                      label={a.title} 
                                      size="small" 
                                      variant="outlined" 
                                      sx={{ maxWidth: 200 }} 
                                      onClick={(e) => { e.stopPropagation(); window.open(`/article/${a.id}`, "_blank"); }}
                                    />
                                  ))}
                                </Box>
                              </Box>
                            )}
                          </Box>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ textAlign: "right" }}>
                              {item.status === "completed" && item.score !== null ? (
                                <Typography variant="h6" sx={{ fontWeight: 700, color: (item.score / item.num_questions) >= 0.8 ? "#4caf50" : (item.score / item.num_questions) >= 0.5 ? "warning.main" : "#ef5350" }}>
                                  {item.score}/{item.total}
                                </Typography>
                              ) : (
                                <Chip label="Not taken" size="small" variant="outlined" color="warning" />
                              )}
                              <Typography variant="caption" color="text.disabled" sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end", mt: 0.5 }}>
                                <AccessTimeOutlinedIcon sx={{ fontSize: 12 }} />
                                {formatDate(item.created_at)}
                              </Typography>
                            </Box>
                            <IconButton
                              size="small"
                              onClick={(e) => handleRetake(item, e)}
                              sx={{ color: "primary.main", "&:hover": { color: "primary.dark", bgcolor: "primary.light", opacity: 0.2 } }}
                            >
                              <Tooltip title="Retake Quiz">
                                <ReplayOutlinedIcon fontSize="small" />
                              </Tooltip>
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                              sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                            >
                              <DeleteOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </>
          )}
        </>
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Quiz?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete this {deleteTarget?.num_questions}-question {deleteTarget?.quiz_type === "mcq" ? "multiple choice" : deleteTarget?.quiz_type === "short_answer" ? "short answer" : "flashcard"} quiz.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleDeleteQuiz} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!bulkDeleteTarget} onClose={() => setBulkDeleteTarget(null)}>
        <DialogTitle>
          {bulkDeleteTarget === "all" ? "Delete All Quizzes?" : `Delete ${selectedIds.size} Selected Quiz(zes)?`}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {bulkDeleteTarget === "all"
              ? "This will permanently delete ALL quizzes. This cannot be undone."
              : `This will permanently delete ${selectedIds.size} selected quiz(zes). This cannot be undone.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleBulkDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
