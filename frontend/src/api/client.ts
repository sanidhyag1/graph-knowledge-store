const API_BASE = "/api";

export interface Article {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
  keywords: string[];
  entities: { name: string; type: string }[];
  enrichment_status: string;
  created_at: string;
  updated_at: string;
  source: string;  // "manual" | "obsidian"
  obsidian_file_path: string | null;
}

export interface ArticleListItem {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  enrichment_status: string;
  created_at: string;
  updated_at: string;
  source: string;
}

export interface ArticleListResponse {
  articles: ArticleListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ArticleIndexItem {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  keywords: string[];
}

export interface SearchResult {
  article: ArticleListItem;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface GraphNode {
  id: string;
  label: string;
  name?: string;
  title?: string;
  type?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface SubgraphResponse {
  article_id: string;
  subgraph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

export interface GraphNeighbor {
  id: string;
  title: string;
  shared_nodes: number;
  connection_type: string;
}

export interface GraphStats {
  articles: number;
  topics: number;
  keywords: number;
  entities: number;
}

export type QuizType = "mcq" | "short_answer" | "flashcard";

export interface FlashcardData {
  id: string;
  article_id: string;
  front: string;
  back: string;
  hint: string | null;
  state: "new" | "learning" | "review" | "relearning";
  due: string | null;
  interval: number;
  ease_factor: number;
  step: number;
  repetitions: number;
  lapses: number;
  last_review: string | null;
  last_rating: number | null;
  created_at: string;
}

export interface DeckInfo {
  article_id: string;
  title: string;
  total: number;
  new: number;
  learning: number;
  review: number;
  relearning: number;
  mature: number;
  due_now: number;
}

export interface StudyStats {
  total_cards: number;
  new_cards: number;
  learning: number;
  review: number;
  relearning: number;
  due_now: number;
  reviews_today: number;
  correct_today: number;
  retention_rate: number;
  streak_days: number;
}

export interface McqOption {
  label: string;
  text: string;
}

export interface McqQuestion {
  question: string;
  options: McqOption[];
  correct_index: number;
  explanation: string;
}

export interface ShortAnswerQuestion {
  question: string;
  model_answer: string;
  key_points: string[];
}

export interface FlashcardItem {
  front: string;
  back: string;
  hint: string;
}

export interface SourceArticle {
  id: string;
  title: string;
}

export interface QuizResponse {
  quiz_id: string;
  quiz_type: QuizType;
  topics: string[];
  keywords: string[];
  article_count: number;
  questions: McqQuestion[] | ShortAnswerQuestion[] | FlashcardItem[];
  answers: Record<string, unknown>[] | null;
  score: number | null;
  total: number | null;
  status: string;
  source_articles?: SourceArticle[] | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface QuizGenerateResponse {
  quiz_id: string;
  status: string;
}

export interface QuizStatusResponse {
  quiz_id: string;
  status: string;
  progress: number;
  total: number;
  quiz_type: QuizType;
  topics: string[];
  keywords: string[];
  article_count: number;
  questions: McqQuestion[] | ShortAnswerQuestion[] | FlashcardItem[];
  source_articles?: SourceArticle[] | null;
  error: string | null;
}

export interface QuizHistoryItem {
  quiz_id: string;
  quiz_type: QuizType;
  topics: string[];
  keywords: string[];
  score: number | null;
  total: number | null;
  num_questions: number;
  article_count: number;
  status: string;
  source_articles?: SourceArticle[] | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface QuizActiveResponse {
  quiz_id: string;
  quiz_type: QuizType;
  topics: string[];
  keywords: string[];
  progress: number;
  total: number;
}

export interface ChatSessionResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: { id: string; title: string; score: number }[] | null;
  created_at: string;
}

export interface AskResponse {
  answer: string;
  sources: { id: string; title: string; score: number }[];
}

export interface BookmarkArticleItem {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  enrichment_status: string;
  created_at: string;
  updated_at: string;
  source: string;
  bookmarked_at: string;
}

export interface BookmarkListResponse {
  articles: BookmarkArticleItem[];
  total: number;
  page: number;
  limit: number;
}

export interface LLMCallLog {
  id: string;
  operation: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  latency_ms: number;
  success: boolean;
  error_message: string | null;
  input_chars: number | null;
  output_chars: number | null;
  num_ctx: number | null;
  temperature: number | null;
  article_id: string | null;
  created_at: string;
}

export interface LLMCallLogListResponse {
  logs: LLMCallLog[];
  total: number;
  page: number;
  limit: number;
}

export interface LLMOperationStats {
  operation: string;
  call_count: number;
  success_count: number;
  avg_latency_ms: number;
  total_tokens: number;
  avg_prompt_tokens: number;
  avg_completion_tokens: number;
}

export interface LLMStatsResponse {
  total_calls: number;
  total_success: number;
  total_failures: number;
  success_rate: number;
  avg_latency_ms: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  operations: LLMOperationStats[];
  recent_errors: LLMCallLog[];
}

export interface VaultEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_tracked: boolean;
}

export interface TrackedFile {
  id: string;
  relative_path: string;
  article_id: string | null;
  file_hash: string | null;
  last_synced_at: string | null;
  status: string;
}

export interface ObsidianStatus {
  configured: boolean;
  vault_path: string;
  sync_interval_minutes: number;
  last_sync_at: string | null;
  tracked_count: number;
  attachment_path: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listArticles: (page = 1, limit = 10, filters?: { topic?: string; keyword?: string }) => {
    let path = `/articles?page=${page}&limit=${limit}`;
    if (filters?.topic) path += `&topic=${encodeURIComponent(filters.topic)}`;
    if (filters?.keyword) path += `&keyword=${encodeURIComponent(filters.keyword)}`;
    return request<ArticleListResponse>(path);
  },

  getArticlesIndex: () =>
    request<{ articles: ArticleIndexItem[] }>("/articles/index"),

  getArticle: (id: string) => request<Article>(`/articles/${id}`),

  createArticle: (data: { title?: string; content: string; fix_equations?: boolean }) =>
    request<Article>("/articles", { method: "POST", body: JSON.stringify(data) }),

  updateArticle: (id: string, data: { title?: string; content?: string; fix_equations?: boolean }) =>
    request<Article>(`/articles/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteArticle: (id: string) =>
    request<void>(`/articles/${id}`, { method: "DELETE" }),

  updateArticleTags: (id: string, data: { add_topics?: string[]; remove_topics?: string[]; add_keywords?: string[]; remove_keywords?: string[] }) =>
    request<Article>(`/articles/${id}/tags`, { method: "PATCH", body: JSON.stringify(data) }),

  fixEquation: (text: string) =>
    request<{ fixed: string }>("/llm/fix-equation", { method: "POST", body: JSON.stringify({ text }) }),

  search: (q: string, limit = 10, mode = "semantic") =>
    request<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=${mode}`),

  getFullGraph: () =>
    request<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/graph/full"),

  getSubgraph: (articleId: string, depth = 2) =>
    request<SubgraphResponse>(`/graph/article/${articleId}/subgraph?depth=${depth}`),

  getNeighbors: (articleId: string, limit = 10) =>
    request<{ article_id: string; neighbors: GraphNeighbor[] }>(`/graph/article/${articleId}/neighbors?limit=${limit}`),

  getGraphStats: () => request<GraphStats>("/graph/stats"),

  generateQuiz: (data: { topics?: string[]; keywords?: string[]; quiz_type: QuizType; num_questions: number }) =>
    request<QuizGenerateResponse>("/quiz/generate", { method: "POST", body: JSON.stringify(data) }),

  generateArticleQuiz: (articleId: string, data: { quiz_type: QuizType; num_questions: number }) =>
    request<QuizGenerateResponse>(`/quiz/generate/article/${articleId}`, { method: "POST", body: JSON.stringify(data) }),

  generateWeakAreasQuiz: (quizType: string, numQuestions = 5) =>
    request<QuizGenerateResponse>("/quiz/generate/weak", { method: "POST", body: JSON.stringify({ quiz_type: quizType, num_questions: numQuestions }) }),

  getQuizStatus: (quizId: string) =>
    request<QuizStatusResponse>(`/quiz/status/${quizId}`),

  getQuizResult: (quizId: string) =>
    request<QuizResponse>(`/quiz/result/${quizId}`),

  getQuiz: (quizId: string) =>
    request<QuizResponse>(`/quiz/${quizId}`),

  submitQuiz: (quizId: string, data: { answers: Record<string, unknown>[]; score: number; total: number }) =>
    request<QuizResponse>(`/quiz/${quizId}/submit`, { method: "POST", body: JSON.stringify(data) }),

  getQuizHistory: (limit = 20, offset = 0) =>
    request<QuizHistoryItem[]>(`/quiz/history/list?limit=${limit}&offset=${offset}`),

  getActiveQuiz: () =>
    request<QuizActiveResponse | null>("/quiz/active/now"),

  deleteQuiz: (quizId: string) =>
    request<void>(`/quiz/${quizId}`, { method: "DELETE" }),

  deleteQuizzesBatch: (quizIds: string[]) =>
    request<{ deleted: number }>("/quiz/delete/batch", { method: "POST", body: JSON.stringify({ quiz_ids: quizIds }) }),

  deleteAllQuizzes: () =>
    request<{ deleted: number }>("/quiz/delete/all", { method: "DELETE" }),

  getLLMStats: (fromDate?: string, toDate?: string) => {
    let path = "/llm-logs/stats";
    const params: string[] = [];
    if (fromDate) params.push(`from=${fromDate}`);
    if (toDate) params.push(`to=${toDate}`);
    if (params.length) path += "?" + params.join("&");
    return request<LLMStatsResponse>(path);
  },

  getLLMLogs: (page = 1, limit = 25, filters?: { operation?: string; success?: boolean; from?: string; to?: string }) => {
    let path = `/llm-logs?page=${page}&limit=${limit}`;
    if (filters?.operation) path += `&operation=${filters.operation}`;
    if (filters?.success !== undefined) path += `&success=${filters.success}`;
    if (filters?.from) path += `&from=${filters.from}`;
    if (filters?.to) path += `&to=${filters.to}`;
    return request<LLMCallLogListResponse>(path);
  },

  askRAG: (query: string, sessionId?: string) =>
    request<AskResponse>("/rag/ask", { method: "POST", body: JSON.stringify({ query, session_id: sessionId }) }),

  createChatSession: () =>
    request<ChatSessionResponse>("/rag/sessions", { method: "POST" }),

  listChatSessions: (limit = 50) =>
    request<ChatSessionResponse[]>(`/rag/sessions?limit=${limit}`),

  getChatMessages: (sessionId: string) =>
    request<ChatMessageResponse[]>(`/rag/sessions/${sessionId}/messages`),

  deleteChatSession: (sessionId: string) =>
    request<void>(`/rag/sessions/${sessionId}`, { method: "DELETE" }),

  streamRAG: async function* (
    query: string,
    sessionId?: string,
  ): AsyncGenerator<{ type: "chunk"; content: string } | { type: "sources"; sources: { id: string; title: string; score: number }[] }> {
    const res = await fetch(`${API_BASE}/rag/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, session_id: sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch { /* skip malformed */ }
      }
    }
  },

  getStudyStats: () =>
    request<StudyStats>("/study/stats"),

  getDueCards: (limit = 50) =>
    request<FlashcardData[]>(`/study/due?limit=${limit}`),

  getNewCards: () =>
    request<FlashcardData[]>("/study/new"),

  submitReview: (cardId: string, rating: number) =>
    request<FlashcardData>(`/study/review/${cardId}`, { method: "POST", body: JSON.stringify({ rating }) }),

  getDecks: () =>
    request<DeckInfo[]>("/study/decks"),

  getDeckCards: (articleId: string) =>
    request<FlashcardData[]>(`/study/deck/${articleId}`),

  generateFlashcards: (articleId: string) =>
    request<{ generated: number }>(`/study/generate/${articleId}`, { method: "POST" }),

  generateMoreFlashcards: (articleId: string, n = 5) =>
    request<{ generated: number }>(`/study/generate-more/${articleId}?n=${n}`, { method: "POST" }),

  generateAllMissingFlashcards: () =>
    request<{ generated: number; errors: number; articles_processed: number }>("/study/generate-all-missing", { method: "POST" }),

  getDueCount: () =>
    request<{ due_now: number; new: number }>("/study/due-count"),

  toggleBookmark: (articleId: string) =>
    request<{ bookmarked: boolean }>(`/bookmarks/${articleId}`, { method: "POST" }),

  listBookmarks: (page = 1, limit = 10) =>
    request<BookmarkListResponse>(`/bookmarks?page=${page}&limit=${limit}`),

  getBookmarkIds: () =>
    request<{ ids: string[] }>("/bookmarks/ids"),

  // Obsidian
  obsidianStatus: () => request<ObsidianStatus>("/obsidian/status"),
  obsidianBrowse: (path = "") => request<{ entries: VaultEntry[]; current_path: string }>(`/obsidian/browse?path=${encodeURIComponent(path)}`),
  obsidianTracked: () => request<{ files: TrackedFile[] }>("/obsidian/tracked"),
  obsidianTrack: (paths: string[]) => request<{ tracked: number }>("/obsidian/track", { method: "POST", body: JSON.stringify({ paths }) }),
  obsidianUntrack: (paths: string[]) => request<{ untracked: number }>("/obsidian/untrack", { method: "POST", body: JSON.stringify({ paths }) }),
  obsidianSync: () => request<{ synced: number; errors: number; missing: number }>("/obsidian/sync", { method: "POST" }),
  obsidianUpdateSettings: (data: { attachment_path: string }) => request<{ attachment_path: string }>("/obsidian/settings", { method: "POST", body: JSON.stringify(data) }),

  uploadImage: async (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/uploads`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },
};
