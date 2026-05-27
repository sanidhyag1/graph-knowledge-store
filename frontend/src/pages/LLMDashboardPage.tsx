import { useEffect, useState } from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Chip from "@mui/material/Chip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import TokenOutlinedIcon from "@mui/icons-material/TokenOutlined";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { api } from "../api/client";
import type { LLMStatsResponse, LLMCallLogListResponse, LLMCallLog } from "../api/client";

function StatCard({ title, value, subtitle, icon, color }: { title: string; value: string | number; subtitle?: string; icon: React.ReactNode; color: string }) {
  return (
    <Card sx={{ flex: "1 1 200px", minWidth: 200 }}>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${color}.lighter`, color: `${color}.main`, display: "flex" }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
        </Box>
      </CardContent>
    </Card>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function LogTableRow({ log }: { log: LLMCallLog }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(log.created_at).toLocaleString()}</TableCell>
        <TableCell><Chip label={log.operation} size="small" variant="outlined" /></TableCell>
        <TableCell sx={{ fontSize: "0.8rem" }}>{log.model}</TableCell>
        <TableCell align="right">{formatMs(log.latency_ms)}</TableCell>
        <TableCell align="right">{log.total_tokens ?? "—"}</TableCell>
        <TableCell>
          {log.success ? (
            <Chip label="OK" size="small" color="success" />
          ) : (
            <Chip label="FAIL" size="small" color="error" />
          )}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1, display: "flex", gap: 4, flexDirection: { xs: "column", md: "row" } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" gutterBottom component="div" sx={{ fontWeight: 600 }}>
                  Input
                </Typography>
                <Box sx={{ bgcolor: "background.default", p: 2, borderRadius: 1, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.85rem", fontFamily: "monospace", border: '1px solid', borderColor: 'divider' }}>
                  {log.input_text || "No input recorded"}
                </Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" gutterBottom component="div" sx={{ fontWeight: 600 }}>
                  Output
                </Typography>
                <Box sx={{ bgcolor: "background.default", p: 2, borderRadius: 1, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap", fontSize: "0.85rem", fontFamily: "monospace", border: '1px solid', borderColor: 'divider' }}>
                  {log.output_text || "No output recorded"}
                </Box>
              </Box>
            </Box>
            {log.error_message && (
              <Box sx={{ margin: 1 }}>
                <Typography variant="subtitle2" color="error" gutterBottom component="div" sx={{ fontWeight: 600 }}>
                  Error Message
                </Typography>
                <Box sx={{ bgcolor: "error.lighter", color: "error.main", p: 2, borderRadius: 1, whiteSpace: "pre-wrap", fontSize: "0.85rem", fontFamily: "monospace" }}>
                  {log.error_message}
                </Box>
              </Box>
            )}
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function LLMDashboardPage() {
  const [stats, setStats] = useState<LLMStatsResponse | null>(null);
  const [logsData, setLogsData] = useState<LLMCallLogListResponse | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [opFilter, setOpFilter] = useState("");

  useEffect(() => {
    api.getLLMStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getLLMLogs(page + 1, rowsPerPage, opFilter ? { operation: opFilter } : undefined)
      .then(setLogsData)
      .catch(() => {});
  }, [page, rowsPerPage, opFilter]);

  const operations = stats?.operations.map((o) => o.operation) || [];

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        LLM Trace
      </Typography>

      {!stats ? (
        <Typography color="text.secondary">Loading stats...</Typography>
      ) : (
        <>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
            <StatCard title="Total Calls" value={stats.total_calls} icon={<TokenOutlinedIcon />} color="primary" />
            <StatCard
              title="Success Rate"
              value={`${stats.success_rate}%`}
              subtitle={`${stats.total_success} ok / ${stats.total_failures} failed`}
              icon={<CheckCircleOutlineOutlinedIcon />}
              color={stats.success_rate >= 95 ? "success" : stats.success_rate >= 80 ? "warning" : "error"}
            />
            <StatCard title="Avg Latency" value={formatMs(stats.avg_latency_ms)} icon={<TimerOutlinedIcon />} color="info" />
            <StatCard title="Total Tokens" value={formatTokens(stats.total_tokens)} subtitle={`${formatTokens(stats.total_prompt_tokens)} prompt / ${formatTokens(stats.total_completion_tokens)} completion`} icon={<TokenOutlinedIcon />} color="secondary" />
          </Box>

          {stats.operations.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>By Operation</Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Operation</TableCell>
                        <TableCell align="right">Calls</TableCell>
                        <TableCell align="right">Success</TableCell>
                        <TableCell align="right">Avg Latency</TableCell>
                        <TableCell align="right">Total Tokens</TableCell>
                        <TableCell align="right">Avg Prompt</TableCell>
                        <TableCell align="right">Avg Completion</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats.operations.map((op) => (
                        <TableRow key={op.operation}>
                          <TableCell><Chip label={op.operation} size="small" variant="outlined" /></TableCell>
                          <TableCell align="right">{op.call_count}</TableCell>
                          <TableCell align="right">{op.success_count} / {op.call_count}</TableCell>
                          <TableCell align="right">{formatMs(op.avg_latency_ms)}</TableCell>
                          <TableCell align="right">{formatTokens(op.total_tokens)}</TableCell>
                          <TableCell align="right">{formatTokens(op.avg_prompt_tokens)}</TableCell>
                          <TableCell align="right">{formatTokens(op.avg_completion_tokens)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {stats.recent_errors.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
                  <ErrorOutlineOutlinedIcon color="error" /> Recent Errors
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Operation</TableCell>
                        <TableCell>Model</TableCell>
                        <TableCell>Latency</TableCell>
                        <TableCell>Error</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats.recent_errors.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{new Date(e.created_at).toLocaleString()}</TableCell>
                          <TableCell><Chip label={e.operation} size="small" color="error" variant="outlined" /></TableCell>
                          <TableCell>{e.model}</TableCell>
                          <TableCell>{formatMs(e.latency_ms)}</TableCell>
                          <TableCell sx={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.error_message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>All Calls</Typography>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Operation</InputLabel>
              <Select value={opFilter} label="Operation" onChange={(e) => { setOpFilter(e.target.value); setPage(0); }}>
                <MenuItem value="">All</MenuItem>
                {operations.map((op) => (
                  <MenuItem key={op} value={op}>{op}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Time</TableCell>
                  <TableCell>Operation</TableCell>
                  <TableCell>Model</TableCell>
                  <TableCell align="right">Latency</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logsData?.logs.map((log) => (
                  <LogTableRow key={log.id} log={log} />
                ))}
                {!logsData?.logs.length && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No LLM calls recorded yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {logsData && (
            <TablePagination
              component="div"
              count={logsData.total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
