import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type BookmarkArticleItem } from "../api/client";
import ArticleCard from "../components/ArticleCard";
import PaginationControls from "../components/PaginationControls";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

const DEFAULT_PAGE_SIZE = 10;

export default function BookmarksPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<BookmarkArticleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    api.listBookmarks(page, pageSize).then((res) => {
      setArticles(res.articles);
      setTotal(res.total);
    });
  }, [page, pageSize]);

  function handleBookmarkToggle(id: string, bookmarked: boolean) {
    if (!bookmarked) {
      setArticles((prev) => prev.filter((a) => a.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    }
  }

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Bookmarks</Typography>
        <Typography variant="body2" color="text.secondary">{total} saved</Typography>
      </Box>

      {articles.length === 0 ? (
        <Typography color="text.secondary">No bookmarks yet. Bookmark articles to find them here later.</Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {articles.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              bookmarked={true}
              onBookmarkToggle={handleBookmarkToggle}
            />
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
