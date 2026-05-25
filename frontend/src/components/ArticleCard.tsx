import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import BookmarkBorderOutlinedIcon from "@mui/icons-material/BookmarkBorderOutlined";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import { api, type ArticleListItem } from "../api/client";

export default function ArticleCard({ article, bookmarked: initialBookmarked, onBookmarkToggle }: { article: ArticleListItem; bookmarked?: boolean; onBookmarkToggle?: (id: string, bookmarked: boolean) => void }) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bookmarked, setBookmarked] = useState(initialBookmarked ?? false);

  async function handleDelete() {
    setConfirmOpen(false);
    await api.deleteArticle(article.id);
    window.location.reload();
  }

  async function handleToggleBookmark(e: React.MouseEvent) {
    e.stopPropagation();
    const res = await api.toggleBookmark(article.id);
    setBookmarked(res.bookmarked);
    onBookmarkToggle?.(article.id, res.bookmarked);
  }

  return (
    <>
      <Card
        sx={{
          position: "relative",
          transition: "box-shadow 0.2s, transform 0.15s",
          "&:hover": { boxShadow: 4, transform: "translateY(-1px)" },
        }}
      >
        <CardActionArea component={Link} to={`/article/${article.id}`}>
          <CardContent sx={{ pb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} gutterBottom>
              {article.title}
            </Typography>
            {article.summary && (
              <Typography variant="body2" color="text.secondary" sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {article.summary}
              </Typography>
            )}
          </CardContent>
          <Box sx={{ px: 2, pb: 0.5, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {article.topics.slice(0, 4).map((t) => (
              <Chip
                key={t}
                label={t}
                size="small"
                color="primary"
                variant="outlined"
                clickable
                onClick={(e) => { e.stopPropagation(); navigate("/?topic=" + encodeURIComponent(t)); }}
                sx={{ fontSize: "0.7rem" }}
              />
            ))}
          </Box>
          <Box sx={{ px: 2, pt: 0.5, pb: 1 }}>
            <Typography variant="caption" color="text.disabled">
              {new Date(article.updated_at).toLocaleDateString()}
            </Typography>
          </Box>
        </CardActionArea>
        <CardActions sx={{ position: "absolute", top: 4, right: 4, p: 0 }}>
          <IconButton
            size="small"
            onClick={handleToggleBookmark}
            sx={{ opacity: bookmarked ? 1 : 0.3, "&:hover": { opacity: 1, color: "warning.main" }, ...(bookmarked ? { color: "warning.main" } : {}) }}
          >
            {bookmarked ? <BookmarkIcon fontSize="small" /> : <BookmarkBorderOutlinedIcon fontSize="small" />}
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
            sx={{ opacity: 0.3, "&:hover": { opacity: 1, color: "error.main" } }}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </CardActions>
      </Card>

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
    </>
  );
}
