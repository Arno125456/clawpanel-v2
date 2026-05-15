'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Terminal, ExternalLink, Package, Search, X, RefreshCw, Edit,
  ChevronDown, ChevronRight, Settings2, CheckCircle2, AlertCircle, MinusCircle,
  Copy, Pencil, Trash2
} from 'lucide-react'
import type { Skill } from '@/lib/skills'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ----- types -----------------------------------------------------------------

type StatusFilter = 'all' | 'ready' | 'needs-setup' | 'disabled'

interface SkillWithState extends Skill {
  disabled: boolean
  eligible: boolean
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'needs-setup', label: 'Needs Setup' },
  { id: 'disabled', label: 'Disabled' },
]

// ----- helpers ---------------------------------------------------------------

function skillMatchesStatus(skill: SkillWithState, status: StatusFilter) {
  switch (status) {
    case 'all': return true
    case 'ready': return !skill.disabled && skill.eligible
    case 'needs-setup': return !skill.disabled && !skill.eligible
    case 'disabled': return skill.disabled
  }
}

function StatusDot({ skill }: { skill: SkillWithState }) {
  if (skill.disabled) return <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" />
  if (skill.eligible) return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
  return <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
}

// ----- detail panel ----------------------------------------------------------

function SkillDetailPanel({
  skill,
  onClose,
  onToggle,
  onDuplicate,
  onRename,
  onDelete,
}: {
  skill: SkillWithState
  onClose: () => void
  onToggle: (id: string, nextEnabled: boolean) => void
  onDuplicate: (id: string) => Promise<void>
  onRename: (id: string, newName: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [skillContent, setSkillContent] = useState('')
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(skill.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDuplicate = async () => {
    setIsDuplicating(true)
    try {
      await onDuplicate(skill.id)
    } finally {
      setIsDuplicating(false)
    }
  }

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === skill.name) { setIsRenaming(false); return }
    setIsSaving(true)
    try {
      await onRename(skill.id, trimmed)
      setIsRenaming(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setIsDeleting(true)
    try {
      await onDelete(skill.id)
      onClose()
    } finally {
      setIsDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleEditClick = async () => {
    setIsEditing(true)
    setIsLoadingContent(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}`)
      if (res.ok) {
        const data = await res.json()
        setSkillContent(data.content || '')
      } else {
        console.error('Failed to load skill content')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoadingContent(false)
    }
  }

  const handleSaveContent = async () => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: skillContent })
      })
      if (res.ok) {
        setIsEditing(false)
      } else {
        console.error('Failed to save skill content')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className={cn(
        "fixed right-0 top-0 h-full z-50 bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right-8 duration-300",
        isEditing ? "w-full max-w-2xl" : "w-full max-w-md"
      )}>
        <div className="border-b border-border shrink-0">
          {/* Title row */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2 min-w-0">
              <StatusDot skill={skill} />
              {!isEditing && skill.emoji && <span className="text-lg">{skill.emoji}</span>}
              <h2 className="font-semibold text-base truncate">{isEditing ? `Edit ${skill.name}` : skill.name}</h2>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 shrink-0 ml-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* Action toolbar row */}
          {!isEditing && (
            <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
              <Button
                size="sm" variant="outline"
                onClick={handleDuplicate}
                disabled={isDuplicating}
                className="h-8 gap-1.5 text-xs"
              >
                {isDuplicating
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Copy className="w-3.5 h-3.5" />}
                Duplicate
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => { setIsRenaming(true); setRenameValue(skill.name); setTimeout(() => renameInputRef.current?.focus(), 50) }}
                className="h-8 gap-1.5 text-xs"
              >
                <Pencil className="w-3.5 h-3.5" /> Rename
              </Button>
              <Button size="sm" variant="outline" onClick={handleEditClick} className="h-8 gap-1.5 text-xs">
                <Edit className="w-3.5 h-3.5" /> Edit SKILL.md
              </Button>
              {skill.source !== 'bundled' && (
                <Button
                  size="sm"
                  variant={confirmDelete ? 'destructive' : 'outline'}
                  onClick={handleDelete}
                  disabled={isDeleting}
                  onBlur={() => setConfirmDelete(false)}
                  className="h-8 gap-1.5 text-xs ml-auto"
                >
                  {isDeleting
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                  {confirmDelete ? 'Confirm Delete' : 'Delete'}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col">
          {isEditing ? (
            isLoadingContent ? (
              <div className="flex-1 flex justify-center items-center text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-4">
                <textarea
                  className="flex-1 w-full bg-muted/30 border border-border rounded-md p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  value={skillContent}
                  onChange={(e) => setSkillContent(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</Button>
                  <Button onClick={handleSaveContent} disabled={isSaving}>
                    {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />}
                    Save SKILL.md
                  </Button>
                </div>
              </div>
            )
          ) : (
            <>
              {/* Inline rename input */}
              {isRenaming ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setIsRenaming(false) }}
                    className="flex-1 bg-muted/30 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="New skill name…"
                  />
                  <Button size="sm" onClick={handleRenameSubmit} disabled={isSaving}>
                    {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Save'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsRenaming(false)} disabled={isSaving}>Cancel</Button>
                </div>
              ) : null}

              <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs font-mono">{skill.source}</Badge>
                {skill.eligible ? (
                  <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />eligible
                  </Badge>
                ) : (
                  <Badge className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/20">
                    <AlertCircle className="w-3 h-3 mr-1" />needs setup
                  </Badge>
                )}
                {skill.disabled && (
                  <Badge className="text-xs bg-muted border-border">
                    <MinusCircle className="w-3 h-3 mr-1" />disabled
                  </Badge>
                )}
              </div>

              {skill.requiredBins.length > 0 && (
                <div className="rounded-lg bg-amber-500/8 border border-amber-500/20 p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Required binaries</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {skill.requiredBins.map(bin => (
                      <span key={bin} className="inline-flex items-center gap-1 text-xs font-mono bg-muted px-2 py-0.5 rounded border text-muted-foreground">
                        <Terminal className="w-2.5 h-2.5" />{bin}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {skill.install.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Install options</p>
                  {skill.install.map(opt => (
                    <div key={opt.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Package className="w-3 h-3 shrink-0" />
                      <span className="font-medium">{opt.label}</span>
                      {opt.formula && <code className="bg-muted px-1 rounded font-mono">{opt.formula}</code>}
                      {opt.package && <code className="bg-muted px-1 rounded font-mono">{opt.package}</code>}
                    </div>
                  ))}
                </div>
              )}

              {skill.homepage && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                    API Key
                  </label>
                  <Input
                    type="password"
                    placeholder="sk-••••••••••••••••"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={!apiKey}
                      className="text-xs"
                    >
                      {saved ? 'Saved!' : 'Save key'}
                    </Button>
                    <a
                      href={skill.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Get your key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 py-3 border-t border-border">
                <button
                  onClick={() => onToggle(skill.id, skill.disabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50',
                    skill.disabled ? 'bg-muted' : 'bg-primary'
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    skill.disabled ? 'translate-x-1' : 'translate-x-6'
                  )} />
                </button>
                <span className="text-sm font-medium">
                  {skill.disabled ? 'Disabled' : 'Enabled'}
                </span>
              </div>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="px-6 py-4 border-t border-border shrink-0 space-y-1 text-xs text-muted-foreground bg-muted/30">
            <div><span className="font-semibold">Source:</span> {skill.source}</div>
            <div className="font-mono break-all">{skill.id}</div>
            {skill.homepage && (
              <a href={skill.homepage} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                {skill.homepage} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  )
}

// ----- skill card ------------------------------------------------------------

function SkillCard({
  skill,
  onOpen,
  onToggle,
  onDuplicate,
}: {
  skill: SkillWithState
  onOpen: (id: string) => void
  onToggle: (id: string, nextEnabled: boolean) => void
  onDuplicate: (id: string) => Promise<void>
}) {
  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card flex flex-col cursor-pointer',
        'hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden',
        skill.disabled && 'opacity-60'
      )}
      onClick={() => onOpen(skill.id)}
    >
      {/* accent bar */}
      <div className={cn(
        'h-0.5 w-full',
        skill.disabled
          ? 'bg-muted'
          : skill.eligible
          ? 'bg-gradient-to-r from-emerald-500/70 to-emerald-500/10'
          : 'bg-gradient-to-r from-amber-500/70 to-amber-500/10'
      )} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-muted border">
              {skill.emoji || '🔧'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <StatusDot skill={skill} />
                <h3 className="font-semibold text-sm leading-tight truncate">{skill.name}</h3>
              </div>
              <span className="text-xs text-muted-foreground font-mono truncate block">{skill.id}</span>
            </div>
          </div>

          {/* actions */}
          <div className="flex items-center gap-1.5">
            <button
              title="Duplicate skill"
              onClick={e => { e.stopPropagation(); onDuplicate(skill.id) }}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onToggle(skill.id, skill.disabled) }}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                skill.disabled ? 'bg-muted' : 'bg-primary'
              )}
            >
              <span className={cn(
                'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                skill.disabled ? 'translate-x-0.5' : 'translate-x-[18px]'
              )} />
            </button>
          </div>
        </div>

        {/* description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 flex-1">
          {skill.description}
        </p>

        {/* footer chips */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex flex-wrap gap-1">
            {(skill.source === 'workspace' || skill.source === 'agents-project' || skill.source === 'agents-personal') && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                {skill.source === 'agents-project' ? 'project' : skill.source === 'agents-personal' ? 'personal' : 'custom'}
              </span>
            )}
            {skill.source === 'managed' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-medium">
                managed
              </span>
            )}
            {skill.requiredBins.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                <Terminal className="w-2.5 h-2.5" />
                {skill.requiredBins.length}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 group-hover:text-primary transition-colors">
            <Settings2 className="w-3 h-3" /> config
          </span>
        </div>
      </div>
    </div>
  )
}

// ----- group -----------------------------------------------------------------

function SkillGroup({
  label,
  skills,
  onOpen,
  onToggle,
  onDuplicate,
}: {
  label: string
  skills: SkillWithState[]
  onOpen: (id: string) => void
  onToggle: (id: string, nextEnabled: boolean) => void
  onDuplicate: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {label}
        <span className="text-xs bg-muted border rounded-full px-2 py-0.5 font-normal">{skills.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {skills.map(skill => (
            <SkillCard key={skill.id} skill={skill} onOpen={onOpen} onToggle={onToggle} onDuplicate={onDuplicate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ----- main component --------------------------------------------------------

export default function SkillsClient({ initialSkills }: { initialSkills: Skill[] }) {
  const [skills, setSkills] = useState<SkillWithState[]>(() =>
    initialSkills.map(s => ({
      ...s,
      eligible: s.requiredBins.length === 0,
      // Use real enabled state from OpenClaw config (server-side)
      disabled: !s.enabled,
    }))
  )
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch skills and sync enabled states from server (used by refresh + poll)
  const syncSkills = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch('/api/skills')
      if (res.ok) {
        const data: Skill[] = await res.json()
        setSkills(data.map(s => ({
          ...s,
          eligible: s.requiredBins.length === 0,
          // Always use the server's authoritative enabled state
          disabled: !s.enabled,
        })))
      }
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(() => syncSkills(true), [syncSkills])

  // Poll every 15 seconds to pick up changes made in OpenClaw outside ClawPanel
  useEffect(() => {
    const id = setInterval(() => syncSkills(false), 15_000)
    return () => clearInterval(id)
  }, [syncSkills])

  const handleToggle = useCallback(async (id: string, nextEnabled: boolean) => {
    // Optimistic update
    setSkills(prev => prev.map(s => s.id === id ? { ...s, disabled: !nextEnabled } : s))

    try {
      const res = await fetch('/api/skills/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: nextEnabled ? 'enable' : 'disable',
          skillId: id,
        }),
      })

      if (!res.ok) {
        // Roll back on failure
        setSkills(prev => prev.map(s => s.id === id ? { ...s, disabled: nextEnabled } : s))
        console.error('Failed to toggle skill:', await res.text())
      }
    } catch (err) {
      // Roll back on network error
      setSkills(prev => prev.map(s => s.id === id ? { ...s, disabled: nextEnabled } : s))
      console.error('Error toggling skill:', err)
    }
  }, [])

  const handleDuplicate = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/skills/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate', skillId: id }),
      })
      if (res.ok) {
        await syncSkills(false)
      } else {
        console.error('Failed to duplicate skill:', await res.text())
      }
    } catch (err) {
      console.error('Error duplicating skill:', err)
    }
  }, [syncSkills])

  const handleRename = useCallback(async (id: string, newName: string) => {
    // Optimistic update
    setSkills(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s))
    try {
      const res = await fetch('/api/skills/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', skillId: id, newName }),
      })
      if (!res.ok) {
        // Roll back
        await syncSkills(false)
        console.error('Failed to rename skill:', await res.text())
      }
    } catch (err) {
      await syncSkills(false)
      console.error('Error renaming skill:', err)
    }
  }, [syncSkills])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/skills/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', skillId: id }),
      })
      if (res.ok) {
        setSkills(prev => prev.filter(s => s.id !== id))
      } else {
        console.error('Failed to delete skill:', await res.text())
      }
    } catch (err) {
      console.error('Error deleting skill:', err)
    }
  }, [])

  // counts
  const statusCounts = useMemo<Record<StatusFilter, number>>(() => ({
    all: skills.length,
    ready: skills.filter(s => !s.disabled && s.eligible).length,
    'needs-setup': skills.filter(s => !s.disabled && !s.eligible).length,
    disabled: skills.filter(s => s.disabled).length,
  }), [skills])

  // filter pipeline
  const filtered = useMemo(() => {
    const afterStatus = skills.filter(s => skillMatchesStatus(s, statusFilter))
    const q = filter.trim().toLowerCase()
    return q
      ? afterStatus.filter(s => [s.name, s.description, s.id, s.source].join(' ').toLowerCase().includes(q))
      : afterStatus
  }, [skills, statusFilter, filter])

  // group by source
  const groups = useMemo(() => {
    // All user-owned skill sources grouped together as "Workspace Skills"
    const workspaceSources = new Set(['workspace', 'agents-project', 'agents-personal', 'managed'])
    const workspace = filtered.filter(s => workspaceSources.has(s.source))
    const bundled = filtered.filter(s => s.source === 'bundled')
    const result: { label: string; skills: SkillWithState[] }[] = []
    // Show workspace first (user's own skills), bundled after
    if (workspace.length > 0) result.push({ label: 'Workspace Skills', skills: workspace })
    if (bundled.length > 0) result.push({ label: 'Built-in Skills', skills: bundled })
    return result
  }, [filtered])

  const detailSkill = detailId ? skills.find(s => s.id === detailId) ?? null : null

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Skills</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {skills.length} skill{skills.length !== 1 ? 's' : ''} installed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://clawhub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-3 h-3" /> Browse Skills Store
          </a>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/50 w-fit flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all',
              statusFilter === tab.id
                ? 'bg-background shadow text-foreground border border-border/50'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-semibold',
              statusFilter === tab.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {statusCounts[tab.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search skills…"
            className="pl-9 h-9"
          />
          {filter && (
            <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {filter && (
          <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
        )}
      </div>

      {/* Skill groups / empty states */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center text-muted-foreground">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="w-6 h-6 opacity-50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {skills.length === 0 ? 'No Skills Found' : 'No matching skills'}
          </h3>
          <p className="text-sm max-w-xs">
            {skills.length === 0
              ? <>Make sure <code className="text-xs bg-muted px-1.5 py-0.5 rounded">WORKSPACE_PATH</code> and <code className="text-xs bg-muted px-1.5 py-0.5 rounded">OPENCLAW_BIN</code> are configured.</>
              : 'Try a different search term or change the status filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.length > 0 ? (
            groups.map(group => (
              <SkillGroup
                key={group.label}
                label={group.label}
                skills={group.skills}
                onOpen={setDetailId}
                onToggle={handleToggle}
                onDuplicate={handleDuplicate}
              />
            ))
          ) : (
            /* flat grid (no groups) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(skill => (
                <SkillCard key={skill.id} skill={skill} onOpen={setDetailId} onToggle={handleToggle} onDuplicate={handleDuplicate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail panel */}
      {detailSkill && (
        <SkillDetailPanel
          skill={detailSkill}
          onClose={() => setDetailId(null)}
          onToggle={handleToggle}
          onDuplicate={handleDuplicate}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
