"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  Mail,
  Clock,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowRight,
  Loader2,
  CircleDot,
  CalendarClock,
  Search,
  CheckCircle,
  Briefcase,
  PlayCircle,
  ListTodo,
  Power
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EmailPageData, EmailProject } from "@/app/api/email/route";

function timeSince(dateStr: string | number | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  } catch {
    return String(dateStr);
  }
}

export default function EmailClient({ initial }: { initial: EmailPageData }) {
  const [data, setData] = useState<EmailPageData>(initial);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/email", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json: EmailPageData = await res.json();
      startTransition(() => setData(json));
    } catch (err) {
      if (!silent)
        showToast(err instanceof Error ? err.message : "Failed to refresh", "err");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
    const id = setInterval(() => refresh(true), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function doAction(
    action: 'run-cron' | 'enable-cron' | 'disable-cron',
    cronId: string
  ) {
    setActionLoading(action);
    try {
      const res = await fetch("/api/email/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cronId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Action failed");
      
      showToast(
        action === 'run-cron' ? "Cron triggered successfully" :
        action === 'enable-cron' ? "Cron enabled" : "Cron disabled",
        "ok"
      );
      setTimeout(() => refresh(true), 1200);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Action failed", "err");
    } finally {
      setActionLoading(null);
    }
  }

  const { cron, projects, activeProjects, completedProjects, totalProjects } = data;

  const filteredProjects = projects.filter(
    (p) =>
      !search ||
      p.subject.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 md:p-8 pt-6 min-h-0">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium transition-all duration-300 ${
            toast.type === "ok"
              ? "bg-emerald-950 border-emerald-700 text-emerald-300"
              : "bg-red-950 border-red-700 text-red-300"
          }`}
        >
          {toast.type === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Email Request Monitoring
          </h2>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            agent@tbs-marketing.com
            <span className="mx-1 text-border">·</span>
            Processed by OpenClaw
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh(false)}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Requests",
            value: totalProjects,
            icon: Briefcase,
            color: "text-blue-400",
            bg: "bg-blue-500/10",
          },
          {
            label: "In Progress",
            value: activeProjects,
            icon: PlayCircle,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
          },
          {
            label: "Completed",
            value: completedProjects,
            icon: CheckCircle,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
          },
          {
            label: "Email Cron",
            value: cron ? (cron.enabled ? "Active" : "Disabled") : "Not Found",
            icon: CircleDot,
            color: cron?.enabled ? "text-violet-400" : "text-muted-foreground",
            bg: cron?.enabled ? "bg-violet-500/10" : "bg-muted/50",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border bg-card p-4 flex items-center gap-3 shadow-sm"
          >
            <div className={`${s.bg} p-2.5 rounded-lg`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
              <p className={`text-xl font-bold ${s.color} truncate mt-0.5`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main Content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">

        {/* ── Email Projects Panel ── */}
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="p-4 border-b flex items-center gap-3 bg-muted/20 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-4 py-1.5 text-sm bg-background border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                placeholder="Search requests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Project List */}
          <div className="flex flex-col flex-1 overflow-y-auto">
            {filteredProjects.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center min-h-[300px]">
                <Mail className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">
                  {search ? "No requests match your search" : "No email requests processed yet"}
                </p>
                {!search && (
                  <p className="text-xs text-muted-foreground/60 max-w-sm mt-1">
                    Send an email to <span className="font-mono text-primary/70">agent@tbs-marketing.com</span> with a task to see it appear here.
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredProjects.map((project) => (
                  <div key={project.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm truncate text-foreground">{project.subject}</h4>
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                            project.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' :
                            project.status === 'in-progress' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {project.status.replace('-', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {project.description}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {timeSince(project.createdAt)}
                        </span>
                        {project.subTaskCount > 0 && (
                          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">
                            <ListTodo className="w-3.5 h-3.5" />
                            {project.subTaskCount} Tasks
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="flex flex-col gap-6">

          {/* Info Card */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm space-y-3 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 text-primary">
              <Mail className="w-4 h-4" />
              How it works
            </h3>
            <ol className="list-decimal list-outside ml-4 space-y-2 text-muted-foreground">
              <li>
                Forward or send an email to <span className="font-mono text-primary/70">agent@tbs-marketing.com</span>
              </li>
              <li>
                The OpenClaw cron checks the inbox every few minutes
              </li>
              <li>
                The agent parses the email, extracts any attachments, and creates a project here
              </li>
              <li>
                Sub-agents are assigned to complete the required tasks
              </li>
              <li>
                Once done, the agent replies to your original email with the result
              </li>
            </ol>
            <div className="mt-4 pt-4 border-t border-primary/10 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-medium">{cron?.agentId ?? "clawbot"}</span>
            </div>
          </div>

          {/* Cron Card */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm text-foreground">Automated Agent</span>
              </div>
              {cron && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    cron.enabled
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      : "text-muted-foreground bg-muted border-border"
                  }`}
                >
                  {cron.enabled ? "Active" : "Disabled"}
                </span>
              )}
            </div>

            <div className="p-4 space-y-4 flex-1">
              {cron ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1.5">
                      Schedule
                    </p>
                    <div className="flex items-center justify-between bg-muted/50 rounded-lg p-2.5 border">
                      <span className="font-mono text-sm text-foreground">{cron.schedule}</span>
                      <span className="text-xs text-muted-foreground font-medium">{cron.scheduleDescription}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
                        Last Run
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cron.lastError ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                          }`}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {cron.lastRun ? timeSince(cron.lastRun) : "Never"}
                        </span>
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
                        Next Run
                      </p>
                      <span className="text-xs font-medium text-foreground">
                        {cron.nextRun ? timeSince(cron.nextRun) : "—"}
                      </span>
                    </div>
                  </div>

                  {cron.lastError && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 mt-1">
                      <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">Error</p>
                      <p className="text-xs text-red-300/80 font-mono break-all leading-relaxed">
                        {cron.lastError.length > 150 ? cron.lastError.slice(0, 150) + "..." : cron.lastError}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center flex flex-col items-center justify-center">
                  <CalendarClock className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">
                    No active cron job found
                  </p>
                  <p className="text-xs text-muted-foreground max-w-[200px] mt-1.5">
                    Create an email processing cron job using the OpenClaw CLI
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="border-t p-3 flex gap-2 bg-muted/10 shrink-0">
              <Button
                variant="default"
                size="sm"
                className="flex-1 gap-2 bg-primary hover:bg-primary/90 shadow-sm"
                disabled={!cron || actionLoading === "run-cron"}
                onClick={() => cron && doAction("run-cron", cron.id)}
              >
                {actionLoading === "run-cron" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run Now
              </Button>
              
              {cron && (
                <Button
                  variant="outline"
                  size="sm"
                  className={`flex-1 gap-2 border shadow-sm ${cron.enabled ? 'hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30' : 'hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30'}`}
                  disabled={actionLoading === "enable-cron" || actionLoading === "disable-cron"}
                  onClick={() => doAction(cron.enabled ? "disable-cron" : "enable-cron", cron.id)}
                >
                  {actionLoading === "enable-cron" || actionLoading === "disable-cron" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Power className={`w-3.5 h-3.5 ${cron.enabled ? 'text-red-400' : 'text-emerald-400'}`} />
                  )}
                  {cron.enabled ? "Disable" : "Enable"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="h-2" />
    </div>
  );
}
