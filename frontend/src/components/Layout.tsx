import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { api } from "../api/client";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Badge from "@mui/material/Badge";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import BookmarkOutlinedIcon from "@mui/icons-material/BookmarkOutlined";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import ScrollButtons from "./ScrollButtons";
import { useThemeMode } from "./MaterialThemeProvider";

const ACTIVE_QUIZ_KEY = "active-quiz-id";

const NAV_ITEMS = [
  { to: "/", label: "Articles", icon: <MenuBookOutlinedIcon />, end: true },
  { to: "/bookmarks", label: "Bookmarks", icon: <BookmarkOutlinedIcon />, end: false },
  { to: "/editor", label: "New Article", icon: <AddBoxOutlinedIcon />, end: false },
  { to: "/search", label: "Search", icon: <SearchOutlinedIcon />, end: false },
  { to: "/graph", label: "Graph", icon: <AccountTreeOutlinedIcon />, end: false },
  { to: "/quiz", label: "Quiz", icon: <QuizOutlinedIcon />, end: false },
  { to: "/study", label: "Study", icon: <SchoolOutlinedIcon />, end: false },
  { to: "/chat", label: "Ask AI", icon: <SmartToyOutlinedIcon />, end: false },
  { to: "/llm-monitor", label: "LLM Monitor", icon: <MonitorHeartOutlinedIcon />, end: false },
  { to: "/obsidian", label: "Obsidian", icon: <FolderSpecialOutlinedIcon />, end: false },
];

const DRAWER_FULL = 240;
const DRAWER_COLLAPSED = 60;

export default function Layout() {
  const { dark, toggleTheme } = useThemeMode();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [studyDue, setStudyDue] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const width = collapsed ? DRAWER_COLLAPSED : DRAWER_FULL;

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    let active = true;

    async function poll() {
      const id = localStorage.getItem(ACTIVE_QUIZ_KEY);
      if (!id) {
        setQuizGenerating(false);
        return;
      }

      try {
        const status = await api.getQuizStatus(id);
        if (!active) return;

        if (status.status === "ready" && notifiedRef.current !== id) {
          notifiedRef.current = id;
          setQuizGenerating(false);
          localStorage.removeItem(ACTIVE_QUIZ_KEY);

          if (!location.pathname.startsWith("/quiz")) {
            enqueueSnackbar("Your quiz is ready!", {
              variant: "success",
              autoHideDuration: 8000,
              action: (key) => (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    closeSnackbar(key);
                    navigate("/quiz");
                  }}
                >
                  Go to Quiz
                </Button>
              ),
            });
          }
        } else if (status.status === "failed") {
          setQuizGenerating(false);
          localStorage.removeItem(ACTIVE_QUIZ_KEY);
        } else if (status.status === "generating") {
          setQuizGenerating(true);
        }
      } catch {
        if (!active) return;
        setQuizGenerating(false);
      }
    }

    poll();
    pollRef.current = setInterval(poll, 5000);

    return () => {
      active = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [location.pathname, enqueueSnackbar, closeSnackbar, navigate]);

  useEffect(() => {
    api.getDueCount().then((res) => setStudyDue(res.due_now + res.new)).catch(() => {});
  }, [location.pathname]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width,
          flexShrink: 0,
          transition: "width 0.2s ease",
          "& .MuiDrawer-paper": {
            width,
            boxSizing: "border-box",
            borderRight: "1px solid",
            borderColor: "divider",
            overflowX: "hidden",
            transition: "width 0.2s ease",
          },
        }}
      >
        <Box sx={{ px: 1.5, pt: 2, pb: 1, display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", minHeight: 48 }}>
          {!collapsed && (
            <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: -0.5, whiteSpace: "nowrap", overflow: "hidden" }}>
              Knowledge Store
            </Typography>
          )}
          <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} arrow placement="right">
            <IconButton size="small" onClick={toggleCollapse} sx={{ color: "text.secondary" }}>
              {collapsed ? <ChevronRightOutlinedIcon fontSize="small" /> : <ChevronLeftOutlinedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>

        <List sx={{ px: 1, pt: 0.5 }}>
          {NAV_ITEMS.map(({ to, label, icon, end }) => {
            const isQuiz = to === "/quiz";
            const isStudy = to === "/study";
            return (
              <ListItem key={to} disablePadding sx={{ mb: 0.5 }}>
                <Tooltip title={collapsed ? label : ""} arrow placement="right">
                  <ListItemButton
                    component={NavLink}
                    to={to}
                    end={end}
                    sx={{
                      borderRadius: 2,
                      py: 1,
                      justifyContent: collapsed ? "center" : "flex-start",
                      px: collapsed ? 0 : 2,
                      "&.active": {
                        bgcolor: "primary.main",
                        color: "#fff",
                        "& .MuiListItemIcon-root": { color: "#fff" },
                        "&:hover": { bgcolor: "primary.dark" },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: collapsed ? 0 : 40, justifyContent: "center" }}>
                      {isQuiz ? (
                        <Badge
                          color="warning"
                          variant="dot"
                          invisible={!quizGenerating}
                          sx={{ "& .MuiBadge-badge": { top: -2, right: -4 } }}
                        >
                          {icon}
                        </Badge>
                      ) : isStudy ? (
                        <Badge
                          color="error"
                          badgeContent={studyDue}
                          invisible={studyDue === 0}
                          sx={{ "& .MuiBadge-badge": { top: -4, right: -8 } }}
                        >
                          {icon}
                        </Badge>
                      ) : icon}
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText primary={label} sx={{ "& .MuiListItemText-primary": { fontWeight: 500, fontSize: "0.9rem" } }} />
                    )}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>

        {!collapsed && (
          <Box sx={{ mt: "auto", px: 1.5, pb: 2, display: "flex", justifyContent: "center" }}>
            <Tooltip title={dark ? "Switch to light mode" : "Switch to dark mode"} arrow>
              <IconButton size="small" onClick={toggleTheme} sx={{ color: "text.secondary" }}>
                {dark ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {collapsed && (
          <Box sx={{ mt: "auto", px: 1.5, pb: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
            <Tooltip title={dark ? "Switch to light mode" : "Switch to dark mode"} arrow placement="right">
              <IconButton size="small" onClick={toggleTheme} sx={{ color: "text.secondary" }}>
                {dark ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Drawer>
      <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: "background.default" }}>
        <Box sx={location.pathname === "/chat" ? { height: "100%" } : { maxWidth: 1200, mx: "auto", p: 3 }}>
          <Outlet />
        </Box>
      </Box>
      <ScrollButtons />
    </Box>
  );
}
