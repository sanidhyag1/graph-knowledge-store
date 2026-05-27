import { BrowserRouter, Routes, Route } from "react-router-dom";
import MaterialThemeProvider from "./components/MaterialThemeProvider";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import BookmarksPage from "./pages/BookmarksPage";
import EditorPage from "./pages/EditorPage";
import ArticlePage from "./pages/ArticlePage";
import SearchPage from "./pages/SearchPage";
import QuizPage from "./pages/QuizPage";
import StudyPage from "./pages/StudyPage";
import ChatPage from "./pages/ChatPage";
import LLMDashboardPage from "./pages/LLMDashboardPage";
import ObsidianPage from "./pages/ObsidianPage";

export default function App() {
  return (
    <MaterialThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/article/:id" element={<ArticlePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/llm-monitor" element={<LLMDashboardPage />} />
            <Route path="/obsidian" element={<ObsidianPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MaterialThemeProvider>
  );
}
