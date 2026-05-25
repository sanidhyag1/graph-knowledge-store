import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, type ArticleListItem } from "../api/client";
import ArticleCard from "../components/ArticleCard";
import PaginationControls from "../components/PaginationControls";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";

const DEFAULT_PAGE_SIZE = 10;

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const topic = searchParams.get("topic") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPage(1);
  }, [topic, keyword, pageSize]);

  useEffect(() => {
    api.listArticles(page, pageSize, { topic, keyword }).then((res) => {
      setArticles(res.articles);
      setTotal(res.total);
    });
    api.getBookmarkIds().then((res) => setBookmarkIds(new Set(res.ids)));
  }, [page, pageSize, topic, keyword]);

  function clearFilter() {
    setSearchParams({});
  }

  const title = topic
    ? `Articles tagged "${topic}"`
    : keyword
    ? `Articles with keyword "${keyword}"`
    : "Articles";

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{total} total</Typography>
      </Box>

      {(topic || keyword) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Chip
            label={topic ? `Topic: ${topic}` : `Keyword: ${keyword}`}
            color="primary"
            size="small"
            onDelete={clearFilter}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<QuizOutlinedIcon />}
            onClick={() => navigate(`/quiz?${topic ? `topics=${encodeURIComponent(topic)}` : `keywords=${encodeURIComponent(keyword!)}`}`)}
            sx={{ ml: 0.5 }}
          >
            Take Quiz
          </Button>
          <IconButton size="small" onClick={clearFilter}>
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {articles.length === 0 ? (
        <Typography color="text.secondary">
          {topic || keyword ? "No articles match this filter." : "No articles yet. Create your first one!"}
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} bookmarked={bookmarkIds.has(a.id)} />
          ))}
        </Box>
      )}

      <PaginationControls
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </Box>
  );
}
