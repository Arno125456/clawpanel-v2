'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  KanbanSquare, Plus, X, ChevronDown, Loader2, Trash2,
  ArrowRight, User2, AlertCircle, CheckCircle2, Clock4,
  GripVertical, MoreHorizontal, Edit2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  loadTickets, saveTickets, createTicket, updateTicket,
  moveTicket, deleteTicket, type KanbanStore,
} from '@/lib/kanban/store'
import type { KanbanTicket, TicketStatus, TicketPriority } from '@/lib/kanban/types'

// ── Column config ────────────────────────────────────────────────────────────

const COLS: { id: TicketStatus; label: string; color: string; accent: string; dot: string }[] = [
  {
    id: 'todo',
    label: 'Tasks',
    color: 'text-foreground',
    accent: 'border-t-border',
    dot: 'bg-zinc-400',
  },
  {
    id: 'in-progress',
    label: 'Processing',
    color: 'text-amber-400',
    accent: 'border-t-amber-500',
    dot: 'bg-amber-400',
  },
  {
    id: 'review',
    label: 'Review',
    color: 'text-purple-400',
    accent: 'border-t-purple-500',
    dot: 'bg-purple-400',
  },
  {
    id: 'done',
    label: 'Complete',
    color: 'text-emerald-400',
    accent: 'border-t-emerald-500',
    dot: 'bg-emerald-400',
  },
]

// Map old statuses to the visible 4
const NORMALIZE: Record<string, TicketStatus> = {
  backlog: 'todo',
  todo: 'todo',
  'in-progress': 'in-progress',
  review: 'review',
  done: 'done',
}

// ── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; cls: string }> = {
  low: { label: 'Low', cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
  medium: { label: 'Medium', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  high: { label: 'High', cls: 'bg-red-500/15 text-red-400 border-red-500/20' },
}

// ── Helper ───────────────────────────────────────────────────────────────────

function colTickets(store: KanbanStore, colId: TicketStatus): KanbanTicket[] {
  return Object.values(store)
    .filter(t => NORMALIZE[t.status] === colId)
    .sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 }
      return (prio[a.priority] - prio[b.priority]) || b.updatedAt - a.updatedAt
    })
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

// ── Add/Edit task modal ───────────────────────────────────────────────────────

interface ModalProps {
  initial?: KanbanTicket | null
  defaultStatus?: TicketStatus
  onSave: (data: Omit<KanbanTicket, 'id' | 'createdAt' | 'updatedAt' | 'workState' | 'workStartedAt' | 'workError' | 'workResult'>) => void
  onClose: () => void
}

function TaskModal({ initial, defaultStatus = 'todo', onSave, onClose }: ModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc, setDesc] = useState(initial?.description ?? '')
  const [status, setStatus] = useState<TicketStatus>(initial?.status
    ? (NORMALIZE[initial.status] as TicketStatus ?? 'todo')
    : defaultStatus)
  const [priority, setPriority] = useState<TicketPriority>(initial?.priority ?? 'medium')
  const [assignee, setAssignee] = useState(initial?.assigneeId ?? '')
  const overlayRef = useRef<HTMLDivElement>(null)

  const inputCls = 'w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      description: desc.trim(),
      status,
      priority,
      assigneeId: assignee.trim() || null,
      assigneeRole: null,
    })
    onClose()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <h3 className="font-semibold text-base flex items-center gap-2">
            {initial ? <Edit2 className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
            {initial ? 'Edit Task' : 'New Task'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                className={inputCls}
                placeholder="What needs to be done?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground min-h-[72px] resize-y"
                placeholder="Optional details…"
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Column</label>
                <select
                  className={`${inputCls} appearance-none cursor-pointer`}
                  value={status}
                  onChange={e => setStatus(e.target.value as TicketStatus)}
                >
                  {COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                <select
                  className={`${inputCls} appearance-none cursor-pointer`}
                  value={priority}
                  onChange={e => setPriority(e.target.value as TicketPriority)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Assign to agent (optional)
              </label>
              <input
                className={inputCls}
                placeholder="e.g. vera, clawbot"
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-2 border-t border-border mt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!title.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              {initial ? 'Save Changes' : 'Add Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  ticket,
  colIds,
  onMove,
  onEdit,
  onDelete,
}: {
  ticket: KanbanTicket
  colIds: TicketStatus[]
  onMove: (id: string, to: TicketStatus) => void
  onEdit: (t: KanbanTicket) => void
  onDelete: (id: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const normalised = NORMALIZE[ticket.status] as TicketStatus
  const currentIdx = colIds.indexOf(normalised)
  const prevCol = currentIdx > 0 ? colIds[currentIdx - 1] : null
  const nextCol = currentIdx < colIds.length - 1 ? colIds[currentIdx + 1] : null

  const pc = PRIORITY_CONFIG[ticket.priority]

  return (
    <div className="group relative rounded-xl border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-150 overflow-hidden">
      {/* priority accent line */}
      <div className={`h-0.5 w-full ${
        ticket.priority === 'high' ? 'bg-red-500' :
        ticket.priority === 'medium' ? 'bg-blue-500' : 'bg-zinc-600'
      }`} />

      <div className="p-3.5">
        <div className="flex items-start gap-2">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 mt-0.5 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm leading-snug text-foreground">{ticket.title}</p>
            {ticket.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ticket.description}</p>
            )}
          </div>

          {/* Context menu */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 w-40 bg-popover border border-border rounded-xl shadow-xl py-1 text-sm">
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-xs"
                  onClick={() => { onEdit(ticket); setMenuOpen(false) }}
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                {prevCol && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-xs"
                    onClick={() => { onMove(ticket.id, prevCol); setMenuOpen(false) }}
                  >
                    <ArrowRight className="w-3 h-3 rotate-180" />
                    Move ← {COLS.find(c => c.id === prevCol)?.label}
                  </button>
                )}
                {nextCol && (
                  <button
                    className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-xs"
                    onClick={() => { onMove(ticket.id, nextCol); setMenuOpen(false) }}
                  >
                    <ArrowRight className="w-3 h-3" />
                    Move → {COLS.find(c => c.id === nextCol)?.label}
                  </button>
                )}
                <div className="border-t border-border my-1" />
                <button
                  className="w-full text-left px-3 py-1.5 hover:bg-red-500/10 text-red-400 flex items-center gap-2 text-xs"
                  onClick={() => { onDelete(ticket.id); setMenuOpen(false) }}
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wider ${pc.cls}`}>
            {pc.label}
          </span>
          {ticket.assigneeId && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted border rounded-full px-1.5 py-0.5">
              <User2 className="w-2.5 h-2.5" />
              {ticket.assigneeId}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
            <Clock4 className="w-2.5 h-2.5" />
            {timeAgo(ticket.updatedAt || ticket.createdAt)}
          </span>
        </div>

        {/* Move buttons (quick actions below card) */}
        <div className="flex gap-1.5 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {prevCol && (
            <button
              onClick={() => onMove(ticket.id, prevCol)}
              className="flex-1 text-[10px] py-1 rounded-md border border-border hover:bg-muted text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground transition-colors"
            >
              <ArrowRight className="w-3 h-3 rotate-180" />
              {COLS.find(c => c.id === prevCol)?.label}
            </button>
          )}
          {nextCol && (
            <button
              onClick={() => onMove(ticket.id, nextCol)}
              className="flex-1 text-[10px] py-1 rounded-md border border-border hover:bg-muted text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground transition-colors"
            >
              {COLS.find(c => c.id === nextCol)?.label}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({
  col,
  tickets,
  colIds,
  onAddInCol,
  onMove,
  onEdit,
  onDelete,
}: {
  col: typeof COLS[number]
  tickets: KanbanTicket[]
  colIds: TicketStatus[]
  onAddInCol: (s: TicketStatus) => void
  onMove: (id: string, to: TicketStatus) => void
  onEdit: (t: KanbanTicket) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className={`rounded-xl border bg-card shadow-sm flex flex-col min-h-[500px] overflow-hidden border-t-2 ${col.accent}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${col.dot}`} />
          <h3 className={`font-semibold text-sm ${col.color}`}>{col.label}</h3>
          <span className="text-xs bg-muted border rounded-full px-2 py-0.5 text-muted-foreground tabular-nums">
            {tickets.length}
          </span>
        </div>
        <button
          onClick={() => onAddInCol(col.id)}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={`Add to ${col.label}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40">
            <KanbanSquare className="w-6 h-6 mb-1" />
            <p className="text-xs">No tasks</p>
          </div>
        ) : (
          tickets.map(t => (
            <TaskCard
              key={t.id}
              ticket={t}
              colIds={colIds}
              onMove={onMove}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      {/* Add button at bottom */}
      <div className="p-3 border-t shrink-0">
        <button
          onClick={() => onAddInCol(col.id)}
          className="w-full rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/30 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add task
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

/** Merge server store into local store (server wins for shared tickets) */
function mergeStores(local: KanbanStore, server: KanbanStore): KanbanStore {
  const merged = { ...local }
  for (const [id, sTicket] of Object.entries(server)) {
    const lTicket = merged[id]
    if (!lTicket || (sTicket.updatedAt || 0) > (lTicket.updatedAt || 0)) {
      merged[id] = sTicket
    }
  }
  return merged
}

/** Push the current store to the server so email-created tickets persist */
async function pushToServer(store: KanbanStore): Promise<void> {
  try {
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(store),
    })
  } catch {
    // Best-effort, don't block UI
  }
}

export default function KanbanPage() {
  const [store, setStore] = useState<KanbanStore>({})
  const [mounted, setMounted] = useState(false)
  const [modal, setModal] = useState<{
    editing?: KanbanTicket | null
    defaultStatus?: TicketStatus
  } | null>(null)

  const colIds = COLS.map(c => c.id)

  // Load on mount: merge localStorage + server store
  useEffect(() => {
    const local = loadTickets()
    setStore(local)
    setMounted(true)

    // Fetch server store and merge (picks up email-created tickets)
    fetch('/api/kanban')
      .then(r => r.json())
      .then((serverStore: KanbanStore) => {
        if (serverStore && typeof serverStore === 'object' && Object.keys(serverStore).length > 0) {
          setStore(prev => {
            const merged = mergeStores(prev, serverStore)
            saveTickets(merged)
            return merged
          })
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  // Poll server every 3s for new tickets created by the email processor or agent progress
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      fetch('/api/kanban')
        .then(r => r.json())
        .then((serverStore: KanbanStore) => {
          if (serverStore && typeof serverStore === 'object') {
            setStore(prev => {
              const merged = mergeStores(prev, serverStore)
              saveTickets(merged)
              return merged
            })
          }
        })
        .catch(() => { /* ignore */ })
    }, 3000)
    return () => clearInterval(id)
  }, [mounted])

  // Persist on every change (both localStorage and server)
  const updateStore = useCallback((next: KanbanStore) => {
    setStore(next)
    saveTickets(next)
    pushToServer(next)
  }, [])

  const handleAdd = useCallback((data: Omit<KanbanTicket, 'id' | 'createdAt' | 'updatedAt' | 'workState' | 'workStartedAt' | 'workError' | 'workResult'>) => {
    setStore(prev => {
      const next = createTicket(prev, data)
      saveTickets(next)
      pushToServer(next)
      return next
    })
  }, [])

  const handleEdit = useCallback((t: KanbanTicket, data: Omit<KanbanTicket, 'id' | 'createdAt' | 'updatedAt' | 'workState' | 'workStartedAt' | 'workError' | 'workResult'>) => {
    setStore(prev => {
      const next = updateTicket(prev, t.id, data)
      saveTickets(next)
      pushToServer(next)
      return next
    })
  }, [])

  const handleMove = useCallback((id: string, to: TicketStatus) => {
    setStore(prev => {
      const next = moveTicket(prev, id, to)
      saveTickets(next)
      pushToServer(next)
      return next
    })
  }, [])

  const handleDelete = useCallback((id: string) => {
    setStore(prev => {
      const next = deleteTicket(prev, id)
      saveTickets(next)
      fetch(`/api/kanban/ticket/${id}`, { method: 'DELETE' }).catch(() => {})
      pushToServer(next)
      return next
    })
  }, [])

  const totalTasks = Object.keys(store).length
  const doneTasks = Object.values(store).filter(t => t.status === 'done').length
  const highPriority = Object.values(store).filter(t => t.priority === 'high' && t.status !== 'done').length

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 pt-6 gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Kanban Board
          </h2>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-3">
            <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''} total</span>
            {doneTasks > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {doneTasks} complete
              </span>
            )}
            {highPriority > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {highPriority} high priority
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setModal({ defaultStatus: 'todo' })} className="gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          Add Task
        </Button>
      </div>

      {/* Board */}
      {!mounted ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-1 min-h-0">
          {COLS.map(col => (
            <Column
              key={col.id}
              col={col}
              tickets={colTickets(store, col.id)}
              colIds={colIds}
              onAddInCol={(s) => setModal({ defaultStatus: s })}
              onMove={handleMove}
              onEdit={(t) => setModal({ editing: t })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <TaskModal
          initial={modal.editing ?? null}
          defaultStatus={modal.defaultStatus}
          onSave={(data) => {
            if (modal.editing) {
              handleEdit(modal.editing, data)
            } else {
              handleAdd(data)
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
