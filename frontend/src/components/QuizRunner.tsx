import { useRef, useState } from "react";
import {
  type QuizResponse,
  type McqQuestion,
  type ShortAnswerQuestion,
  type FlashcardItem,
} from "../api/client";
import LatexText from "./LatexText";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import LinearProgress from "@mui/material/LinearProgress";
import CircularProgress from "@mui/material/CircularProgress";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import EmojiObjectsOutlinedIcon from "@mui/icons-material/EmojiObjectsOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

export interface QuizAnswer {
  [key: string]: unknown;
}

interface Props {
  quiz: QuizResponse;
  onRestart: () => void;
  onComplete?: (answers: QuizAnswer[], score: number) => Promise<void>;
  readOnly?: boolean;
}

export default function QuizRunner({ quiz, onRestart, onComplete, readOnly }: Props) {
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const scoreRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  function handleFinish(finalScore: number, finalAnswers: QuizAnswer[]) {
    if (onCompleteRef.current) {
      setSaving(true);
      onCompleteRef.current(finalAnswers, finalScore)
        .catch(() => {})
        .finally(() => {
          setSaving(false);
          setFinished(true);
        });
    } else {
      setFinished(true);
    }
  }

  if (!quiz.questions || quiz.questions.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
        <Typography variant="h6" color="error" sx={{ fontWeight: 600, mb: 1 }}>
          No Questions Available
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This quiz failed to generate questions. Please delete it and try again.
        </Typography>
        <Button variant="outlined" onClick={onRestart}>
          Go Back
        </Button>
      </Paper>
    );
  }

  if (quiz.quiz_type === "mcq") {
    return (
      <McqRunner
        questions={quiz.questions as McqQuestion[]}
        current={current}
        score={score}
        answers={answers}
        readOnly={readOnly}
        savedAnswers={(quiz.answers || []) as QuizAnswer[]}
        onNext={(ans) => {
          const newAnswers = [...answers, ans];
          setAnswers(newAnswers);
          if (current + 1 >= (quiz.questions as McqQuestion[]).length) {
            handleFinish(scoreRef.current, newAnswers);
          } else {
            setCurrent(current + 1);
          }
        }}
        onCorrect={() => {
          scoreRef.current += 1;
          setScore((s) => s + 1);
        }}
        finished={finished}
        saving={saving}
        onRestart={onRestart}
      />
    );
  }

  if (quiz.quiz_type === "short_answer") {
    return (
      <ShortAnswerRunner
        questions={quiz.questions as ShortAnswerQuestion[]}
        current={current}
        score={score}
        answers={answers}
        readOnly={readOnly}
        savedAnswers={(quiz.answers || []) as QuizAnswer[]}
        onNext={(ans) => {
          const newAnswers = [...answers, ans];
          setAnswers(newAnswers);
          if (current + 1 >= (quiz.questions as ShortAnswerQuestion[]).length) {
            handleFinish(scoreRef.current, newAnswers);
          } else {
            setCurrent(current + 1);
          }
        }}
        onCorrect={() => {
          scoreRef.current += 1;
          setScore((s) => s + 1);
        }}
        finished={finished}
        saving={saving}
        onRestart={onRestart}
      />
    );
  }

  return (
    <FlashcardRunner
      items={quiz.questions as FlashcardItem[]}
      current={current}
      score={score}
      answers={answers}
      readOnly={readOnly}
      savedAnswers={(quiz.answers || []) as QuizAnswer[]}
      onNext={(ans) => {
        const newAnswers = [...answers, ans];
        setAnswers(newAnswers);
        if (current + 1 >= (quiz.questions as FlashcardItem[]).length) {
          handleFinish(scoreRef.current, newAnswers);
        } else {
          setCurrent(current + 1);
        }
      }}
      onGotIt={() => {
        scoreRef.current += 1;
        setScore((s) => s + 1);
      }}
      finished={finished}
      saving={saving}
      onRestart={onRestart}
    />
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Question {current + 1} of {total}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(((current) / total) * 100)}%
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={(current / total) * 100} sx={{ borderRadius: 4, height: 6 }} />
    </Box>
  );
}

function ScoreCard({
  score,
  total,
  onRestart,
  readOnly,
  saving,
}: {
  score: number;
  total: number;
  onRestart: () => void;
  readOnly?: boolean;
  saving?: boolean;
}) {
  if (saving) {
    return (
      <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
        <CircularProgress size={32} sx={{ mb: 2 }} />
        <Typography variant="subtitle1" color="text.secondary">
          Saving your results...
        </Typography>
      </Paper>
    );
  }
  const pct = Math.round((score / total) * 100);
  return (
    <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        {pct >= 80 ? "Excellent!" : pct >= 50 ? "Good effort!" : "Keep practicing!"}
      </Typography>
      <Typography variant="h2" sx={{ fontWeight: 700, color: "primary.main", my: 2 }}>
        {score}/{total}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        You scored {pct}% — {score} correct out of {total} questions
      </Typography>
      {!readOnly && (
        <Button variant="contained" startIcon={<RestartAltIcon />} onClick={onRestart} size="large">
          Try Again
        </Button>
      )}
    </Paper>
  );
}

function McqRunner({
  questions,
  current,
  score,
  answers,
  readOnly,
  savedAnswers,
  onNext,
  onCorrect,
  finished,
  saving,
  onRestart,
}: {
  questions: McqQuestion[];
  current: number;
  score: number;
  answers: QuizAnswer[];
  readOnly?: boolean;
  savedAnswers: QuizAnswer[];
  onNext: (answer: QuizAnswer) => void;
  onCorrect: () => void;
  finished: boolean;
  saving?: boolean;
  onRestart: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  if (finished || saving) return <ScoreCard score={score} total={questions.length} onRestart={onRestart} readOnly={readOnly} saving={saving} />;

  const q = questions[current];
  const savedAnswer = savedAnswers[current] as { selected_index: number } | undefined;
  const isReview = readOnly && savedAnswer;
  const activeSelected = isReview ? savedAnswer.selected_index : selected;
  const correctIdx = typeof q.correct_index === "number" ? q.correct_index : parseInt(String(q.correct_index || "0"), 10) || 0;
  const isCorrect = activeSelected === correctIdx;

  if (isReview && activeSelected !== null && activeSelected !== undefined) {
    const answer: QuizAnswer = { selected_index: activeSelected, correct: isCorrect };
    if (current >= answers.length) {
      return (
        <Box>
          <ProgressBar current={current} total={questions.length} />
          <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}><LatexText text={q.question} /></Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {(q.options || []).map((opt, i) => {
                let borderColor = "divider";
                let bgColor = "transparent";
                if (i === correctIdx) { borderColor = "#4caf50"; bgColor = "rgba(76,175,80,0.08)"; }
                else if (i === activeSelected) { borderColor = "#ef5350"; bgColor = "rgba(239,83,80,0.08)"; }
                return (
                  <Paper key={opt.label} variant="outlined" sx={{ p: 1.5, borderColor, backgroundColor: bgColor, borderRadius: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Chip label={opt.label} size="small" sx={{ fontWeight: 600, minWidth: 28 }} />
                      <Typography variant="body2"><LatexText text={opt.text} /></Typography>
                      {i === correctIdx && <CheckCircleOutlineOutlinedIcon sx={{ ml: "auto", color: "#4caf50", fontSize: 20 }} />}
                      {i === activeSelected && !isCorrect && i !== correctIdx && <CancelOutlinedIcon sx={{ ml: "auto", color: "#ef5350", fontSize: 20 }} />}
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Paper>
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: isCorrect ? "rgba(76,175,80,0.06)" : "rgba(239,83,80,0.06)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              {isCorrect ? <CheckCircleOutlineOutlinedIcon sx={{ color: "#4caf50" }} /> : <CancelOutlinedIcon sx={{ color: "#ef5350" }} />}
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isCorrect ? "#4caf50" : "#ef5350" }}>
                {isCorrect ? "Correct!" : "Incorrect"}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary"><LatexText text={q.explanation} /></Typography>
          </Paper>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={() => onNext(answer)}>
              {current + 1 >= questions.length ? "See Results" : "Next Question"}
            </Button>
          </Box>
        </Box>
      );
    }
  }

  return (
    <Box>
      <ProgressBar current={current} total={questions.length} />
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}><LatexText text={q.question} /></Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {(q.options || []).map((opt, i) => {
            let borderColor = "divider";
            let bgColor = "transparent";
            if (selected !== null) {
              if (i === correctIdx) { borderColor = "#4caf50"; bgColor = "rgba(76,175,80,0.08)"; }
              else if (i === selected && !isCorrect) { borderColor = "#ef5350"; bgColor = "rgba(239,83,80,0.08)"; }
            }
            return (
              <Paper
                key={opt.label}
                variant="outlined"
                onClick={() => selected === null && setSelected(i)}
                sx={{
                  p: 1.5, cursor: selected === null ? "pointer" : "default",
                  borderColor, backgroundColor: bgColor,
                  transition: "all 0.15s",
                  "&:hover": selected === null ? { borderColor: "primary.main", bgcolor: "action.hover" } : {},
                  borderRadius: 2,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Chip label={opt.label} size="small" sx={{ fontWeight: 600, minWidth: 28 }} />
                  <Typography variant="body2"><LatexText text={opt.text} /></Typography>
                  {selected !== null && i === correctIdx && <CheckCircleOutlineOutlinedIcon sx={{ ml: "auto", color: "#4caf50", fontSize: 20 }} />}
                  {selected !== null && i === selected && !isCorrect && i !== correctIdx && <CancelOutlinedIcon sx={{ ml: "auto", color: "#ef5350", fontSize: 20 }} />}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Paper>

      {selected !== null && (
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: isCorrect ? "rgba(76,175,80,0.06)" : "rgba(239,83,80,0.06)" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            {isCorrect ? <CheckCircleOutlineOutlinedIcon sx={{ color: "#4caf50" }} /> : <CancelOutlinedIcon sx={{ color: "#ef5350" }} />}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isCorrect ? "#4caf50" : "#ef5350" }}>
              {isCorrect ? "Correct!" : "Incorrect"}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary"><LatexText text={q.explanation} /></Typography>
        </Paper>
      )}

      {selected !== null && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            onClick={() => {
              const answer: QuizAnswer = { selected_index: selected, correct: isCorrect };
              if (isCorrect) onCorrect();
              setSelected(null);
              onNext(answer);
            }}
          >
            {current + 1 >= questions.length ? "See Results" : "Next Question"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function ShortAnswerRunner({
  questions,
  current,
  score,
  answers,
  readOnly,
  savedAnswers,
  onNext,
  onCorrect,
  finished,
  saving,
  onRestart,
}: {
  questions: ShortAnswerQuestion[];
  current: number;
  score: number;
  answers: QuizAnswer[];
  readOnly?: boolean;
  savedAnswers: QuizAnswer[];
  onNext: (answer: QuizAnswer) => void;
  onCorrect: () => void;
  finished: boolean;
  saving?: boolean;
  onRestart: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [selfScored, setSelfScored] = useState(false);

  if (finished || saving) return <ScoreCard score={score} total={questions.length} onRestart={onRestart} readOnly={readOnly} saving={saving} />;

  const q = questions[current];
  const saved = savedAnswers[current] as { answer: string; self_scored: boolean } | undefined;

  if (readOnly && saved) {
    const isCorrect = saved.self_scored;
    const reviewAnswer: QuizAnswer = { answer: saved.answer, self_scored: saved.self_scored };
    if (current >= answers.length) {
      return (
        <Box>
          <ProgressBar current={current} total={questions.length} />
          <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}><LatexText text={q.question} /></Typography>
            <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Your answer:</Typography>
              <Typography variant="body2">{saved.answer}</Typography>
            </Paper>
          </Paper>
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2, border: "1px solid", borderColor: "primary.light" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: "primary.main" }}>Model Answer</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}><LatexText text={q.model_answer} /></Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>Key Points:</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {(q.key_points || []).map((pt, i) => (
                <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
                  <EmojiObjectsOutlinedIcon sx={{ fontSize: 16, mt: 0.25, color: "warning.main" }} />
                  <Typography variant="body2" color="text.secondary"><LatexText text={pt} /></Typography>
                </Box>
              ))}
            </Box>
          </Paper>
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: isCorrect ? "rgba(76,175,80,0.06)" : "rgba(239,83,80,0.06)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isCorrect ? <CheckCircleOutlineOutlinedIcon sx={{ color: "#4caf50" }} /> : <CancelOutlinedIcon sx={{ color: "#ef5350" }} />}
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isCorrect ? "#4caf50" : "#ef5350" }}>
                {isCorrect ? "Self-scored: Got it" : "Self-scored: Missed it"}
              </Typography>
            </Box>
          </Paper>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={() => onNext(reviewAnswer)}>
              {current + 1 >= questions.length ? "See Results" : "Next Question"}
            </Button>
          </Box>
        </Box>
      );
    }
  }

  return (
    <Box>
      <ProgressBar current={current} total={questions.length} />
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}><LatexText text={q.question} /></Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          disabled={revealed}
          sx={{ mb: 2 }}
        />
        {!revealed && (
          <Button variant="contained" onClick={() => setRevealed(true)} disabled={!answer.trim()}>
            Submit Answer
          </Button>
        )}
      </Paper>

      {revealed && (
        <>
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2, border: "1px solid", borderColor: "primary.light" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: "primary.main" }}>
              Model Answer
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}><LatexText text={q.model_answer} /></Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Key Points:
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {(q.key_points || []).map((pt, i) => (
                <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
                  <EmojiObjectsOutlinedIcon sx={{ fontSize: 16, mt: 0.25, color: "warning.main" }} />
                  <Typography variant="body2" color="text.secondary"><LatexText text={pt} /></Typography>
                </Box>
              ))}
            </Box>
          </Paper>

          {!selfScored && (
            <Paper sx={{ p: 2, mb: 2, borderRadius: 2, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Did you cover the key points?
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircleOutlineOutlinedIcon />}
                  onClick={() => { onCorrect(); setSelfScored(true); }}
                >
                  I Got It
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => setSelfScored(true)}
                >
                  Missed It
                </Button>
              </Box>
            </Paper>
          )}

          {selfScored && (
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="contained"
                onClick={() => {
                  const ans: QuizAnswer = { answer, self_scored: selfScored };
                  onNext(ans);
                  setAnswer("");
                  setRevealed(false);
                  setSelfScored(false);
                }}
              >
                {current + 1 >= questions.length ? "See Results" : "Next Question"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function FlashcardRunner({
  items,
  current,
  score,
  answers,
  readOnly,
  savedAnswers,
  onNext,
  onGotIt,
  finished,
  saving,
  onRestart,
}: {
  items: FlashcardItem[];
  current: number;
  score: number;
  answers: QuizAnswer[];
  readOnly?: boolean;
  savedAnswers: QuizAnswer[];
  onNext: (answer: QuizAnswer) => void;
  onGotIt: () => void;
  finished: boolean;
  saving?: boolean;
  onRestart: () => void;
}) {
  const [flipped, setFlipped] = useState(false);

  if (finished || saving) return <ScoreCard score={score} total={items.length} onRestart={onRestart} readOnly={readOnly} saving={saving} />;

  const card = items[current];
  const saved = savedAnswers[current] as { got_it: boolean } | undefined;

  if (readOnly && saved) {
    const isCorrect = saved.got_it;
    const reviewAnswer: QuizAnswer = { got_it: saved.got_it };
    if (current >= answers.length) {
      return (
        <Box>
          <ProgressBar current={current} total={items.length} />
          <Paper
            sx={{
              p: 4, borderRadius: 3, minHeight: 220,
              display: "flex", flexDirection: "column", justifyContent: "center",
              border: "2px solid", borderColor: "primary.main",
              mb: 2,
            }}
          >
            <Typography variant="caption" color="text.disabled" sx={{ mb: 1, textAlign: "center" }}>QUESTION</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600, textAlign: "center", mb: 2 }}><LatexText text={card.front} /></Typography>
            <Typography variant="caption" color="text.disabled" sx={{ mb: 1, textAlign: "center" }}>ANSWER</Typography>
            <Typography variant="body1" sx={{ textAlign: "center" }}><LatexText text={card.back} /></Typography>
          </Paper>
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: isCorrect ? "rgba(76,175,80,0.06)" : "rgba(239,83,80,0.06)" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isCorrect ? <CheckCircleOutlineOutlinedIcon sx={{ color: "#4caf50" }} /> : <CancelOutlinedIcon sx={{ color: "#ef5350" }} />}
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isCorrect ? "#4caf50" : "#ef5350" }}>
                {isCorrect ? "Got it" : "Missed it"}
              </Typography>
            </Box>
          </Paper>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="contained" onClick={() => onNext(reviewAnswer)}>
              {current + 1 >= items.length ? "See Results" : "Next Card"}
            </Button>
          </Box>
        </Box>
      );
    }
  }

  return (
    <Box>
      <ProgressBar current={current} total={items.length} />
      <Paper
        onClick={() => !flipped && setFlipped(true)}
        sx={{
          p: 4,
          borderRadius: 3,
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          cursor: flipped ? "default" : "pointer",
          transition: "all 0.2s",
          border: "2px solid",
          borderColor: flipped ? "primary.main" : "divider",
          "&:hover": flipped ? {} : { borderColor: "primary.light", boxShadow: 2 },
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ mb: 1, textAlign: "center" }}>
          {flipped ? "ANSWER" : "QUESTION — click to reveal"}
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
        <Box sx={{ display: "flex", justifyContent: "center", gap: 1.5, mt: 2 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelOutlinedIcon />}
            onClick={() => {
              const ans: QuizAnswer = { got_it: false };
              setFlipped(false);
              onNext(ans);
            }}
          >
            Missed It
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleOutlineOutlinedIcon />}
            onClick={() => {
              const ans: QuizAnswer = { got_it: true };
              onGotIt();
              setFlipped(false);
              onNext(ans);
            }}
          >
            Got It
          </Button>
        </Box>
      )}
    </Box>
  );
}
