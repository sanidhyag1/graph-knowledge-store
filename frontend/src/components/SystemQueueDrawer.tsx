import React, { useEffect, useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  CircularProgress,
  Divider,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { useSnackbar } from "notistack";

import { api, type Job } from "../api/client";

interface SystemQueueDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function SystemQueueDrawer({ open, onClose }: SystemQueueDrawerProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  const fetchJobs = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.listJobs();
      setJobs(data);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll for jobs when open
  useEffect(() => {
    if (!open) return;

    fetchJobs(true);
    const interval = setInterval(() => fetchJobs(false), 4000);

    return () => clearInterval(interval);
  }, [open]);

  const handleCancelJob = async (jobId: string) => {
    try {
      await api.cancelJob(jobId);
      enqueueSnackbar("Job cancelled successfully", { variant: "success" });
      fetchJobs(false);
    } catch (err: any) {
      enqueueSnackbar(err.message || "Failed to cancel job", { variant: "error" });
    }
  };

  const getJobTypeLabel = (type: string) => {
    switch (type) {
      case "enrich_article":
        return "Enrich Article";
      case "generate_quiz":
        return "Generate Quiz";
      case "generate_weak_areas_quiz":
        return "Weak Areas Quiz";
      default:
        return type;
    }
  };

  const formatDuration = (job: Job) => {
    if (!job.started_at) return "";
    const start = new Date(job.started_at).getTime();
    const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": { width: { xs: "100%", sm: 400 }, p: 0 },
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Background Jobs
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "text.secondary" }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
        {loading && jobs.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={30} />
          </Box>
        ) : jobs.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No active or recent background jobs.
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {jobs.map((job, idx) => {
              const isPending = job.status === "pending";
              const isProcessing = job.status === "processing";
              const isCompleted = job.status === "completed";
              const isFailed = job.status === "failed";

              return (
                <React.Fragment key={job.id}>
                  {idx > 0 && <Divider sx={{ my: 1.5 }} />}
                  <ListItem
                    disablePadding
                    alignItems="flex-start"
                    secondaryAction={
                      isPending && (
                        <Tooltip title="Cancel pending job" arrow>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={() => handleCancelJob(job.id)}
                            sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
                          >
                            <CancelOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )
                    }
                  >
                    {/* Status Icon */}
                    <Box sx={{ mr: 2, mt: 0.5, display: "flex", alignItems: "center" }}>
                      {isProcessing && (
                        <Tooltip title="Processing task..." arrow>
                          <CircularProgress size={20} color="primary" />
                        </Tooltip>
                      )}
                      {isPending && (
                        <Tooltip title="Pending queue..." arrow>
                          <HourglassEmptyIcon sx={{ color: "text.disabled", fontSize: 20 }} />
                        </Tooltip>
                      )}
                      {isCompleted && (
                        <Tooltip title="Completed successfully" arrow>
                          <CheckCircleOutlineIcon sx={{ color: "success.main", fontSize: 20 }} />
                        </Tooltip>
                      )}
                      {isFailed && (
                        <Tooltip title="Task failed. Hover/click error below." arrow>
                          <ErrorOutlineIcon sx={{ color: "error.main", fontSize: 20 }} />
                        </Tooltip>
                      )}
                    </Box>

                    {/* Job Information */}
                    <ListItemText
                      primary={
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "text.primary" }}>
                          {getJobTypeLabel(job.job_type)}
                        </Typography>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          {job.target_label && (
                            <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 500, mb: 0.25 }}>
                              {job.target_label}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: "text.disabled", display: "block" }}>
                            {isPending && `Enqueued at ${formatTime(job.created_at)}`}
                            {isProcessing && `Running • ${formatTime(job.started_at!)} (${formatDuration(job)})`}
                            {isCompleted && `Finished at ${formatTime(job.completed_at!)} • took ${formatDuration(job)}`}
                            {isFailed && `Failed at ${formatTime(job.completed_at!)} • ran for ${formatDuration(job)}`}
                          </Typography>
                          
                          {/* Error message */}
                          {isFailed && job.error && (
                            <Alert severity="error" variant="outlined" sx={{ py: 0, px: 1, mt: 1, fontSize: "0.75rem", "& .MuiAlert-icon": { display: "none" } }}>
                              {job.error}
                            </Alert>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
