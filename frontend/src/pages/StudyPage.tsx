import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { api, type FlashcardData, type DeckInfo, type StudyStats, type Job } from "../api/client";
import LatexText from "../components/LatexText";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";

type View = "overview" | "session" | "summary";

function getNextInterval(card: FlashcardData, rating: number): string {
  const ease = card.ease_factor;
  const interval = card.interval;
  if (card.state === "new") {
    if (rating === 1) return "1m";
    if (rating === 2) return "10m";
    if (rating === 3) return "1d";
    return "4d";
  }
  if (card.state === "learning" || card.state === "relearning") {
    if (rating === 1) return "1m";
    return "1d";
  }
  if (rating === 1) return "10m";
  if (rating === 2) {
    const d = Math.max(1, Math.round(interval * 1.2));
    return d < 1 ? `${Math.round(d * 24)}h` : `${d}d`;
  }
  if (rating === 3) {
    const d = Math.max(1, Math.round(interval * ease));
    return d < 1 ? `${Math.round(d * 24)}h` : `${d}d`;
  }
  const d = Math.max(1, Math.round(interval * ease * 1.3));
  return d < 1 ? `${Math.round(d * 24)}h` : `${d}d`;
}

export default function StudyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const articleFilter = searchParams.get("article");

  const [view, setView] = useState<View>("overview");
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dueCards, setDueCards] = useState<FlashcardData[]>([]);
  const [newCards, setNewCards] = useState<FlashcardData[]>([]);
  const [queue, setQueue] = useState<FlashcardData[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingDeck, setGeneratingDeck] = useState<string | null>(null);
  const [activeFlashcardJobs, setActiveFlashcardJobs] = useState<Set<string>>(new Set());
  const { enqueueSnackbar } = useSnackbar();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, jobs] = await Promise.all([
        api.getStudyStats(),
        api.getDecks(),
        api.listJobs(),
      ]);
      setStats(s);
      setDecks(d);
      // Compute which articles have an active flashcard job
      const active = new Set<string>();
      for (const job of jobs as Job[]) {
        if (
          (job.job_type === "generate_flashcards" || job.job_type === "generate_flashcards_more") &&
          (job.status === "pending" || job.status === "processing")
        ) {
          active.add(job.target_id);
        }
      }
      setActiveFlashcardJobs(active);
    } catch {
      enqueueSnackbar("Failed to load study data", { variant: "error" });
    }
    setLoading(false);
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (articleFilter) {
      startDeckStudy(articleFilter);
    }
  }, [articleFilter]);

  async function startStudy() {
    try {
      const [due, newC] = await Promise.all([api.getDueCards(), api.getNewCards()]);
      setDueCards(due);
      setNewCards(newC);
      const all = [...due, ...newC];
      if (all.length === 0) {
        enqueueSnackbar("No cards to review right now!", { variant: "info" });
        return;
      }
      setQueue(all);
      setCurrentIdx(0);
      setFlipped(false);
      setReviewed(0);
      setCorrect(0);
      setView("session");
    } catch {
      enqueueSnackbar("Failed to load cards", { variant: "error" });
    }
  }

  async function startDeckStudy(articleId: string) {
    try {
      const cards = await api.getDeckCards(articleId);
      const dueNow = cards.filter((c) => c.state !== "new" && new Date(c.due!) <= new Date());
      const newOnes = cards.filter((c) => c.state === "new");
      const all = [...dueNow, ...newOnes];
      if (all.length === 0) {
        enqueueSnackbar("No cards due for this article", { variant: "info" });
        return;
      }
      setQueue(all);
      setCurrentIdx(0);
      setFlipped(false);
      setReviewed(0);
      setCorrect(0);
      setView("session");
    } catch {
      enqueueSnackbar("Failed to load cards", { variant: "error" });
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    try {
      const res = await api.generateAllMissingFlashcards();
      if (res.queued > 0) {
        enqueueSnackbar(
          `Queued flashcard generation for ${res.queued} article(s) — check the background jobs panel`,
          { variant: "info", autoHideDuration: 6000 }
        );
      } else {
        enqueueSnackbar("All articles already have flashcards or jobs in progress", { variant: "success" });
      }
      loadData();
    } catch {
      enqueueSnackbar("Failed to queue flashcard generation", { variant: "error" });
    }
    setGeneratingAll(false);
  }

  async function handleGenerateDeck(articleId: string) {
    setGeneratingDeck(articleId);
    try {
      const res = await api.generateFlashcards(articleId);
      if (res.queued) {
        enqueueSnackbar("Flashcard generation queued — check the background jobs panel", { variant: "info" });
        // Optimistically mark this article as having an active job
        setActiveFlashcardJobs((prev) => new Set([...prev, articleId]));
      } else {
        enqueueSnackbar(res.message, { variant: "warning" });
      }
      loadData();
    } catch {
      enqueueSnackbar("Failed to queue flashcard generation", { variant: "error" });
    }
    setGeneratingDeck(null);
  }

  async function handleRate(rating: number) {
    const card = queue[currentIdx];
    if (!card || submitting) return;
    setSubmitting(true);
    try {
      const updated = await api.submitReview(card.id, rating);
      setQueue((prev) => {
        const next = [...prev];
        next[currentIdx] = updated;
        return next;
      });
      setReviewed((r) => r + 1);
      if (rating >= 3) setCorrect((c) => c + 1);

      if (rating === 1 && (updated.state === "learning" || updated.state === "relearning")) {
        const reinsertAt = Math.min(currentIdx + 4, queue.length);
        setQueue((prev) => {
          const without = [...prev];
          without.splice(currentIdx, 1);
          without.splice(reinsertAt, 0, updated);
          return without;
        });
      } else {
        setCurrentIdx((i) => i + 1);
      }
      setFlipped(false);

      if (currentIdx + 1 >= queue.length && rating !== 1) {
        setView("summary");
      }
    } catch {
      enqueueSnackbar("Failed to submit review", { variant: "error" });
    }
    setSubmitting(false);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (view !== "session" || submitting) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      }
      if (!flipped) return;
      if (e.key === "1") handleRate(1);
      else if (e.key === "2") handleRate(2);
      else if (e.key === "3") handleRate(3);
      else if (e.key === "4") handleRate(4);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [view, flipped, currentIdx, queue, submitting]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (view === "session") {
    const card = queue[currentIdx];
    if (!card) {
      setView("summary");
      return null;
    }

    return (
      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton onClick={() => setView("overview")} size="small">
              <ArrowBackOutlinedIcon />
            </IconButton>
            <Typography variant="subtitle2" color="text.secondary">
              Card {currentIdx + 1} of {queue.length}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Chip label={`${dueCards.length} due`} size="small" variant="outlined" color="warning" />
            <Chip label={`${newCards.length} new`} size="small" variant="outlined" color="info" />
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={((currentIdx) / queue.length) * 100}
          sx={{ mb: 3, borderRadius: 4, height: 6 }}
        />

        <Paper
          onClick={() => !flipped && setFlipped(true)}
          sx={{
            p: 4,
            borderRadius: 3,
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            cursor: flipped ? "default" : "pointer",
            transition: "all 0.2s",
            border: "2px solid",
            borderColor: flipped ? "primary.main" : "divider",
            "&:hover": flipped ? {} : { borderColor: "primary.light", boxShadow: 2 },
            mb: 3,
          }}
        >
          <Typography variant="caption" color="text.disabled" sx={{ mb: 1, textAlign: "center" }}>
            {flipped ? "ANSWER" : "QUESTION — click or press Space to reveal"}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600, textAlign: "center", mb: flipped ? 2 : 0 }}>
            <LatexText text={flipped ? card.back : card.front} />
          </Typography>
          {!flipped && card.hint && (
            <Typography variant="body2" color="text.disabled" sx={{ mt: 2, textAlign: "center", fontStyle: "italic" }}>
              Hint: <LatexText text={card.hint} />
            </Typography>
          )}
        </Paper>

        {flipped && (
          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              { rating: 1, label: "Again", color: "#ef5350", key: "1" },
              { rating: 2, label: "Hard", color: "#ff9800", key: "2" },
              { rating: 3, label: "Good", color: "#4caf50", key: "3" },
              { rating: 4, label: "Easy", color: "#2196f3", key: "4" },
            ].map(({ rating, label, color, key }) => (
              <Button
                key={rating}
                variant="outlined"
                onClick={() => handleRate(rating)}
                disabled={submitting}
                sx={{
                  borderColor: color,
                  color,
                  minWidth: 100,
                  "&:hover": { borderColor: color, bgcolor: `${color}14` },
                }}
              >
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
                  <Typography variant="caption" sx={{ display: "block" }}>
                    {getNextInterval(card, rating)} (press {key})
                  </Typography>
                </Box>
              </Button>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  if (view === "summary") {
    const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    return (
      <Box sx={{ maxWidth: 640, mx: "auto" }}>
        <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            {pct >= 80 ? "Excellent!" : pct >= 50 ? "Good session!" : "Keep practicing!"}
          </Typography>
          <Typography variant="h2" sx={{ fontWeight: 700, color: "primary.main", my: 2 }}>
            {correct}/{reviewed}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            You reviewed {reviewed} cards with {pct}% accuracy
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, justifyContent: "center" }}>
            <Button variant="outlined" onClick={() => { setView("overview"); loadData(); }}>
              Back to Overview
            </Button>
            <Button variant="contained" onClick={startStudy} startIcon={<SchoolOutlinedIcon />}>
              Study More
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: "auto" }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Study</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Spaced repetition for long-term retention
      </Typography>

      {stats && (
        <Box sx={{ display: "flex", gap: 1.5, mb: 3, flexWrap: "wrap" }}>
          {stats.due_now > 0 && (
            <Paper sx={{ p: 2, borderRadius: 2, flex: "1 1 140px", minWidth: 140, textAlign: "center", bgcolor: "rgba(255,152,0,0.08)", border: "1px solid rgba(255,152,0,0.3)" }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: "#ff9800" }}>{stats.due_now}</Typography>
              <Typography variant="caption" color="text.secondary">Due Now</Typography>
            </Paper>
          )}
          {stats.new_cards > 0 && (
            <Paper sx={{ p: 2, borderRadius: 2, flex: "1 1 140px", minWidth: 140, textAlign: "center", bgcolor: "rgba(33,150,243,0.08)", border: "1px solid rgba(33,150,243,0.3)" }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: "#2196f3" }}>{stats.new_cards}</Typography>
              <Typography variant="caption" color="text.secondary">New Cards</Typography>
            </Paper>
          )}
          <Paper sx={{ p: 2, borderRadius: 2, flex: "1 1 140px", minWidth: 140, textAlign: "center" }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total_cards}</Typography>
            <Typography variant="caption" color="text.secondary">Total Cards</Typography>
          </Paper>
          {stats.streak_days > 0 && (
            <Paper sx={{ p: 2, borderRadius: 2, flex: "1 1 140px", minWidth: 140, textAlign: "center", bgcolor: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.3)" }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: "#4caf50" }}>{stats.streak_days}</Typography>
              <Typography variant="caption" color="text.secondary">Day Streak</Typography>
            </Paper>
          )}
          {stats.reviews_today > 0 && (
            <Paper sx={{ p: 2, borderRadius: 2, flex: "1 1 140px", minWidth: 140, textAlign: "center" }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.retention_rate}%</Typography>
              <Typography variant="caption" color="text.secondary">Retention Today</Typography>
            </Paper>
          )}
        </Box>
      )}

      {stats && (stats.due_now > 0 || stats.new_cards > 0) && (
        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<SchoolOutlinedIcon />}
          onClick={startStudy}
          sx={{ mb: 1.5, py: 1.5, borderRadius: 2 }}
        >
          Start Study Session ({stats.due_now} due + {stats.new_cards} new)
        </Button>
      )}

      {stats && stats.total_cards > 0 && (
        <Button
          variant="outlined"
          size="large"
          fullWidth
          startIcon={<QuizOutlinedIcon />}
          onClick={() => navigate("/quiz")}
          sx={{ mb: 3, py: 1.5, borderRadius: 2 }}
        >
          Quiz Weak Areas
        </Button>
      )}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Article Decks</Typography>
        {decks.some((d) => d.total === 0) && (
          <Button
            size="small"
            variant="outlined"
            startIcon={generatingAll ? <CircularProgress size={14} /> : <SchoolOutlinedIcon />}
            onClick={handleGenerateAll}
            disabled={generatingAll}
          >
            {generatingAll ? "Queuing..." : "Generate All Missing"}
          </Button>
        )}
      </Box>

      {decks.length === 0 && (
        <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
          <Typography color="text.secondary">
            No articles yet. Add articles and flashcards will be auto-generated.
          </Typography>
        </Paper>
      )}

      {decks.map((deck) => (
        <Paper
          key={deck.article_id}
          variant="outlined"
          sx={{ p: 2, mb: 1.5, borderRadius: 2, transition: "all 0.15s", "&:hover": { borderColor: "primary.main", boxShadow: 1 } }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ flex: 1, mr: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                {deck.title}
              </Typography>
              {deck.total > 0 ? (
                <>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
                    {deck.new > 0 && <Chip label={`${deck.new} new`} size="small" variant="outlined" color="info" />}
                    {deck.learning > 0 && <Chip label={`${deck.learning} learning`} size="small" variant="outlined" color="warning" />}
                    {deck.review > 0 && <Chip label={`${deck.review} review`} size="small" variant="outlined" color="primary" />}
                    {deck.mature > 0 && <Chip label={`${deck.mature} mature`} size="small" variant="outlined" color="success" />}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={(deck.mature / deck.total) * 100}
                      sx={{ flex: 1, borderRadius: 2, height: 6 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {Math.round((deck.mature / deck.total) * 100)}% mastered
                    </Typography>
                  </Box>
                </>
              ) : (
                <Typography variant="caption" color="text.disabled">No flashcards yet</Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              {deck.total === 0 ? (
                <>
                  {activeFlashcardJobs.has(deck.article_id) ? (
                    <Tooltip title="Generation in progress — check the background jobs panel" arrow>
                      <span>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled
                          startIcon={<CircularProgress size={14} />}
                        >
                          In Progress...
                        </Button>
                      </span>
                    </Tooltip>
                  ) : (
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={generatingDeck === deck.article_id}
                      startIcon={generatingDeck === deck.article_id ? <CircularProgress size={14} /> : <SchoolOutlinedIcon />}
                      onClick={() => handleGenerateDeck(deck.article_id)}
                    >
                      {generatingDeck === deck.article_id ? "Queuing..." : "Generate"}
                    </Button>
                  )}
                </>
              ) : deck.due_now > 0 ? (
                <Button variant="contained" size="small" onClick={() => startDeckStudy(deck.article_id)}>
                  Study ({deck.due_now} due)
                </Button>
              ) : deck.new > 0 ? (
                <Button variant="outlined" size="small" onClick={() => startDeckStudy(deck.article_id)}>
                  Learn New ({deck.new})
                </Button>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  All caught up!
                </Typography>
              )}
              {deck.total > 0 && (
                <Tooltip title={activeFlashcardJobs.has(deck.article_id) ? "Generation in progress" : "Regenerate flashcards"}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => handleGenerateDeck(deck.article_id)}
                      disabled={activeFlashcardJobs.has(deck.article_id)}
                      sx={{ color: activeFlashcardJobs.has(deck.article_id) ? "text.disabled" : "text.disabled", "&:hover": { color: activeFlashcardJobs.has(deck.article_id) ? "text.disabled" : "primary.main" } }}
                    >
                      {activeFlashcardJobs.has(deck.article_id) ? <CircularProgress size={16} /> : <RefreshOutlinedIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
