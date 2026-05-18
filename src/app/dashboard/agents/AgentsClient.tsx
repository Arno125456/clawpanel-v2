'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  RefreshCw, FileText, Radio, LayoutDashboard,
  Loader2, AlertTriangle, Eye, Edit, X, Plus, Star,
  CheckCircle2, Zap, Bot, Sparkles,
  Check, ChevronRight, Search, Cpu, ArrowRight, Send, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────
type AgentRow = {
  id: string
  name?: string
  workspace?: string
  agentDir?: string
  model?: string
  isDefault?: boolean
  bindings?: number
  identityName?: string
  identityEmoji?: string
  routes?: string[]
}

type AgentsListResult = {
  defaultId: string
  agents: AgentRow[]
}

type AgentFileEntry = { name: string; path: string; missing: boolean; content?: string; size?: number }
type AgentsFilesListResult = { agentId: string; workspace: string; files: AgentFileEntry[] }

type ChannelAccountSnapshot = {
  accountId: string
  enabled?: boolean | null
  configured?: boolean | null
  connected?: boolean | null
  running?: boolean | null
}
type ChannelsStatusSnapshot = {
  channelOrder: string[]
  channelLabels: Record<string, string>
  channelAccounts: Record<string, ChannelAccountSnapshot[]>
}

type SkillEntry = { id: string; name: string; description?: string; emoji?: string; enabled?: boolean; source?: string }

type AgentIdentity = { name: string; avatar: string; emoji?: string }
type AgentsPanel = 'overview' | 'files' | 'skills' | 'channels'



// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
function relativeTime(ms: number) {
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function ErrorCard({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{msg}</span>
    </div>
  )
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  )
}


// ─────────────────────────────────────────────────────
// Agent Card
// ─────────────────────────────────────────────────────
function AgentCard({
  agent, defaultId, isSelected, onSelect,
}: {
  agent: AgentRow
  defaultId: string
  isSelected: boolean
  onSelect: () => void
}) {
  const isDefault = agent.id === defaultId
  const emoji = agent.identityEmoji || '🤖'
  const name = agent.identityName || agent.name || agent.id

  return (
    <div
      className={cn(
        'bg-card/80 backdrop-blur-xl border border-white/20 shadow-xl dark:border-white/10 dark:bg-card/60 relative rounded-2xl p-5 cursor-pointer transition-all duration-300 group hover:-translate-y-1 hover:shadow-2xl',
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
          : 'hover:border-primary/40 hover:bg-white/40 dark:hover:bg-slate-900/40'
      )}
      onClick={onSelect}
    >
      {/* Default badge */}
      {isDefault && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
          <Star className="w-2.5 h-2.5 fill-current" /> Default
        </div>
      )}

      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-violet-500/10 border border-primary/20 flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform duration-300 shadow-inner">
          {emoji}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{name}</div>
          <div className="text-[11px] font-mono text-muted-foreground truncate">{agent.id}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-1.5 text-xs">
          <>
              <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', (agent.bindings || 0) > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
              <span className={cn('text-xs', (agent.bindings || 0) > 0 ? 'text-emerald-500' : 'text-muted-foreground')}>
                {(agent.bindings || 0) > 0 ? `${agent.bindings} channel${(agent.bindings || 0) > 1 ? 's' : ''} connected` : 'No channel'}
              </span>
            </>
        </div>
        {agent.workspace && (
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {agent.workspace.replace(/^\/home\/[^/]+/, '~')}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={isSelected ? 'default' : 'outline'}
          className="h-7 text-xs flex-1"
          onClick={e => { e.stopPropagation(); onSelect() }}
        >
          {isSelected ? <><Check className="w-3 h-3 mr-1" />Selected</> : <>Inspect<ChevronRight className="w-3 h-3 ml-1" /></>}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Create Agent Wizard
// ─────────────────────────────────────────────────────
// Quick emoji suggestions per role type
const EMOJI_SUGGESTIONS: Record<string, string[]> = {
  seo:     ['🔍','📈','🏆','📊','🎯'],
  sales:   ['💼','🤝','💰','📞','🚀'],
  content: ['✍️','📝','🖊️','📰','💡'],
  data:    ['📊','🔢','🧮','📉','⚙️'],
  email:   ['📧','📬','✉️','📨','💌'],
  social:  ['📱','🌐','💬','🔗','📣'],
  default: ['🤖','⚡','🧠','🦾','🌟'],
}

function getEmojiSuggestions(name: string, description: string): string[] {
  const text = (name + ' ' + description).toLowerCase()
  for (const [key, emojis] of Object.entries(EMOJI_SUGGESTIONS)) {
    if (text.includes(key)) return emojis
  }
  return EMOJI_SUGGESTIONS.default
}

// STEP LABELS
const STEPS = [
  { id: 1, label: 'Identity', icon: Bot },
  { id: 2, label: 'Skills',   icon: Zap },
  { id: 3, label: 'Deploy',   icon: Sparkles },
]

function CreateAgentWizard({
  skills,
  onClose,
  onCreated,
}: {
  skills: SkillEntry[]
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep]               = useState<1|2|3>(1)
  const [name, setName]               = useState('')
  const [emoji, setEmoji]             = useState('🤖')
  const [description, setDescription] = useState('')
  const [model, setModel]             = useState('')
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramAllowFrom, setTelegramAllowFrom] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [skillSearch, setSkillSearch] = useState('')
  const [skillSource, setSkillSource] = useState<'all'|'workspace'|'bundled'>('all')
  const [creating, setCreating]       = useState(false)
  const [error, setError]             = useState<string|null>(null)
  const [deployed, setDeployed]       = useState(false)

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const agentId = slugify(name) || 'new-agent'

  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filteredSkills = useMemo(() => {
    let list = skills
    if (skillSource === 'workspace') list = list.filter(s => s.source !== 'bundled')
    if (skillSource === 'bundled')   list = list.filter(s => s.source === 'bundled')
    const q = skillSearch.trim().toLowerCase()
    if (q) list = list.filter(s => (s.name + s.id + (s.description ?? '')).toLowerCase().includes(q))
    return list
  }, [skills, skillSearch, skillSource])

  const emojiSuggestions = useMemo(() => getEmojiSuggestions(name, description), [name, description])

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agentId, name, emoji, description,
          model: model.trim() || undefined,
          skills: Array.from(selectedSkills),
          telegramToken: telegramToken.trim() || undefined,
          telegramAllowFrom: telegramAllowFrom.trim() || undefined,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setDeployed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent')
    } finally {
      setCreating(false)
    }
  }

  const canNext1 = name.trim().length >= 2 && description.trim().length >= 10

  // ── Deployed success screen ────────────────────────────────────────────────
  if (deployed) {
    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl border border-border/50 flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in zoom-in-95 duration-200 my-auto">
          {/* Green accent top bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-400" />
          <div className="px-8 py-10 flex flex-col items-center text-center gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-4xl shadow-xl">{emoji}</div>
              <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-emerald-500 uppercase tracking-widest mb-1">Agent Live</p>
              <p className="text-2xl font-bold tracking-tight">{name}</p>
              <p className="text-xs font-mono text-muted-foreground mt-1 bg-muted/40 px-2 py-0.5 rounded inline-block">{agentId}</p>
            </div>
            {description && <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>}
            {selectedSkills.size > 0 ? (
              <div className="w-full rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{selectedSkills.size} skill{selectedSkills.size !== 1 ? 's' : ''} assigned</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {Array.from(selectedSkills).map(s => (
                    <span key={s} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium border border-primary/20">{s}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Inherits all global skills</p>
            )}
            <Button className="w-full gap-2 h-10 rounded-xl" onClick={onCreated}>
              <ArrowRight className="w-4 h-4" />Open Agent
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card rounded-3xl border border-border/80 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col my-auto" style={{ maxHeight: '92vh' }}>

        {/* Progress bar */}
        <div className="h-0.5 w-full bg-border/50">
          <div className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-primary" />
              </div>
              <h2 className="font-bold text-base tracking-tight">New Agent</h2>
            </div>
            {/* Step indicators */}
            <div className="flex items-center gap-3">
              {STEPS.map((s, i) => {
                const active = step === s.id
                const done   = step > s.id
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all border',
                        active ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30' :
                        done   ? 'bg-emerald-500 text-white border-emerald-500' :
                                 'bg-muted/50 text-muted-foreground border-border'
                      )}>
                        {done ? <Check className="w-3 h-3" /> : s.id}
                      </div>
                      <span className={cn('text-xs font-medium transition-colors hidden sm:block',
                        active ? 'text-foreground' : done ? 'text-emerald-500' : 'text-muted-foreground'
                      )}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={cn('w-8 h-px', step > s.id ? 'bg-emerald-500/50' : 'bg-border')} />}
                  </div>
                )
              })}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body: form left + preview right ── */}
        <div className="flex flex-1 min-h-0">

          {/* Left: form area */}
          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* ──── STEP 1: Identity ───────────────── */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-bold mb-0.5 tracking-tight">Identity & Persona</p>
                  <p className="text-xs text-muted-foreground">Define your agent's name and role. The description becomes its core SOUL — be specific.</p>
                </div>

                {/* Emoji + name row */}
                <div className="flex gap-4">
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-muted/60 to-muted/20 border border-border flex items-center justify-center text-3xl shadow-inner">
                      {emoji}
                    </div>
                    <input
                      type="text"
                      value={emoji}
                      onChange={e => setEmoji(e.target.value)}
                      className="w-16 text-center text-xs bg-muted/20 border border-border rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      maxLength={2}
                      placeholder="emoji"
                    />
                  </div>
                  <div className="flex-1 space-y-2.5">
                    <div className="relative">
                      <input
                        autoFocus
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Agent name (e.g. SEO Bot, Sales Agent)"
                        className="w-full h-11 px-4 text-sm bg-muted/20 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                      />
                    </div>
                    {name && (
                      <div className="flex items-center gap-1.5 px-1 animate-in fade-in slide-in-from-top-1">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">System ID:</span>
                        <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {agentId}
                        </code>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          (Used in openclaw.json & folder name)
                        </span>
                      </div>
                    )}
                    {/* Quick emoji row */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Suggested:</span>
                      {emojiSuggestions.map(e => (
                        <button key={e} onClick={() => setEmoji(e)}
                          className={cn('text-lg w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 border',
                            emoji === e ? 'bg-primary/10 ring-2 ring-primary/30 border-primary/30' : 'hover:bg-muted/60 border-transparent'
                          )}>{e}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Role & Responsibilities</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={`Describe what this agent does and what it should NOT do.\n\nExample: "You are a focused SEO specialist. Your responsibilities are keyword research, analyzing competitor content, and writing high-ranking blog posts. Do not take on sales or administrative tasks."`}
                    className="w-full h-32 px-4 py-3 text-sm bg-muted/20 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">{description.length} chars · min 10</p>
                    {description.length >= 10 && <p className="text-[10px] text-emerald-500 font-semibold">✓ Ready</p>}
                  </div>
                </div>

                {/* Model */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">
                    Model override <span className="font-normal text-muted-foreground/70">(optional — leave blank to use gateway default)</span>
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="e.g. openrouter/moonshotai/kimi-k2"
                    className="w-full h-10 px-4 text-xs font-mono bg-muted/20 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            )}

            {/* ──── STEP 2: Skills ─────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-1">Skill Allowlist</p>
                  <p className="text-xs text-muted-foreground">Select which skills this agent can use. Leaving all unselected means it inherits the global skill set. Fewer skills = more focused agent.</p>
                </div>

                {/* Search + source filter */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      value={skillSearch}
                      onChange={e => setSkillSearch(e.target.value)}
                      placeholder="Search skills…"
                      className="w-full h-9 pl-9 pr-3 text-xs bg-muted/20 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    {skillSearch && (
                      <button onClick={() => setSkillSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
                    {(['all','workspace','bundled'] as const).map(src => (
                      <button key={src} onClick={() => setSkillSource(src)}
                        className={cn('px-2.5 py-1 text-[11px] font-medium rounded-md transition-all capitalize',
                          skillSource === src ? 'bg-background shadow text-foreground border border-border/50' : 'text-muted-foreground hover:text-foreground'
                        )}>{src}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Count */}
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">{filteredSkills.length} shown · {selectedSkills.size} selected</p>
                  {selectedSkills.size > 0 && (
                    <button onClick={() => setSelectedSkills(new Set())} className="text-[11px] text-muted-foreground hover:text-destructive transition-colors">Clear all</button>
                  )}
                </div>

                {/* Skill list */}
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {filteredSkills.length === 0 && (
                    <p className="text-xs text-muted-foreground py-6 text-center">No skills found.</p>
                  )}
                  {filteredSkills.map(skill => {
                    const selected = selectedSkills.has(skill.id)
                    const isWorkspace = skill.source !== 'bundled'
                    return (
                      <button
                        key={skill.id}
                        onClick={() => toggleSkill(skill.id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border group',
                          selected
                            ? 'bg-primary/8 border-primary/30 text-foreground shadow-sm'
                            : 'bg-muted/10 border-transparent hover:border-border/60 hover:bg-muted/25 text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {/* checkbox */}
                        <div className={cn(
                          'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all',
                          selected ? 'bg-primary border-primary' : 'border-border group-hover:border-primary/50'
                        )}>
                          {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        {/* emoji */}
                        <span className="text-base shrink-0 w-6">{skill.emoji || '🔧'}</span>
                        {/* info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">{skill.name || skill.id}</span>
                            {isWorkspace && (
                              <span className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium border border-emerald-500/20">custom</span>
                            )}
                          </div>
                          {skill.description && (
                            <div className="text-[10px] text-muted-foreground truncate mt-0.5">{skill.description}</div>
                          )}
                        </div>
                        {/* source dot */}
                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', isWorkspace ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ──── STEP 3: Review ─────────────────── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-1">Review & Deploy</p>
                  <p className="text-xs text-muted-foreground">Check the configuration below. Once deployed, the agent is registered in openclaw.json and the gateway reloads.</p>
                </div>

                <div className="space-y-3">
                  {/* Identity row */}
                  <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Identity</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border flex items-center justify-center text-xl">{emoji}</div>
                      <div>
                        <p className="font-semibold text-sm">{name}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{agentId}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                    {model && (
                      <p className="text-[11px] font-mono text-muted-foreground">
                        <span className="text-muted-foreground/60">model:</span> {model}
                      </p>
                    )}
                  </div>

                  {/* Skills row */}
                  <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {selectedSkills.size > 0 ? `Skill allowlist · ${selectedSkills.size}` : 'Skills'}
                    </p>
                    {selectedSkills.size === 0 ? (
                      <p className="text-xs text-muted-foreground">No restriction — agent inherits all global skills.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(selectedSkills).map(s => (
                          <span key={s} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium border border-primary/20">{s}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Written to <code className="bg-muted/50 px-1 rounded">agents.list[].skills</code> in openclaw.json.
                      Adjust anytime via OpenClaw UI → Agents → Skills tab.
                    </p>
                  </div>

                  {/* Channel row */}
                  <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✈️</span>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Dedicated Telegram Bot</p>
                      <span className="ml-auto text-[10px] text-muted-foreground">optional</span>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={telegramToken}
                        onChange={e => setTelegramToken(e.target.value)}
                        placeholder="Bot Token from BotFather (e.g. 123456:ABC-DEF...)"
                        className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <input
                        type="text"
                        value={telegramAllowFrom}
                        onChange={e => setTelegramAllowFrom(e.target.value)}
                        placeholder="Employee Telegram User ID (numeric) — enables DM allowlist"
                        disabled={!telegramToken.trim()}
                        className="w-full h-9 px-3 text-xs font-mono bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className={cn('text-[10px]',
                      telegramToken.trim() && telegramAllowFrom.trim() ? 'text-emerald-500' :
                      telegramToken.trim() ? 'text-amber-500' : 'text-muted-foreground'
                    )}>
                      {telegramToken.trim() && telegramAllowFrom.trim()
                        ? '🔒 DM allowlist enabled — only this user can message the bot.'
                        : telegramToken.trim()
                        ? '⚠️ No User ID — bot will use pairing mode.'
                        : 'Leave empty to skip. Configure anytime in Channels tab.'}
                    </p>
                  </div>
                </div>

                {error && <ErrorCard msg={error} />}
              </div>
            )}
          </div>

          {/* Right: live preview */}
          <div className="w-60 shrink-0 border-l border-border/60 bg-muted/10 p-5 flex flex-col gap-4 overflow-y-auto">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Live Preview</p>

            {/* Agent card preview */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-muted/60 to-muted/20 border border-border flex items-center justify-center text-xl shrink-0">
                  {emoji}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-xs truncate">{name || <span className="text-muted-foreground font-normal">Agent name</span>}</p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{agentId}</p>
                </div>
              </div>
              {description && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-4 border-t border-border/50 pt-2.5">{description}</p>
              )}
              {selectedSkills.size > 0 && (
                <div className="pt-1 border-t border-border/50">
                  <p className="text-[9px] text-muted-foreground mb-1.5 uppercase tracking-wide font-bold">Skills · {selectedSkills.size}</p>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(selectedSkills).slice(0, 5).map(s => (
                      <span key={s} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium border border-primary/20">{s}</span>
                    ))}
                    {selectedSkills.size > 5 && (
                      <span className="text-[9px] text-muted-foreground">+{selectedSkills.size - 5}</span>
                    )}
                  </div>
                </div>
              )}
              {model && (
                <div className="pt-1 border-t border-border/50">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide font-bold mb-0.5">Model</p>
                  <p className="text-[9px] text-muted-foreground font-mono truncate">{model}</p>
                </div>
              )}
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              {[
                { label: 'Name', ok: name.length >= 2 },
                { label: 'Description', ok: description.length >= 10 },
                { label: selectedSkills.size > 0 ? `${selectedSkills.size} skills` : 'All skills (no limit)', ok: true },
                { label: 'Telegram', ok: !!telegramToken.trim(), optional: true },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={cn('w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all',
                    item.ok ? 'bg-emerald-500 border-emerald-500' : item.optional ? 'border-border bg-transparent' : 'border-muted-foreground/40'
                  )}>
                    {item.ok && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={cn('text-[10px] transition-colors', item.ok ? 'text-foreground' : 'text-muted-foreground')}>{item.label}</span>
                  {item.optional && !item.ok && <span className="text-[9px] text-muted-foreground/50 ml-auto">optional</span>}
                </div>
              ))}
            </div>

            {/* JSON preview */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-[10px] font-mono text-slate-300 space-y-0.5 leading-relaxed mt-auto shadow-inner">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">openclaw.json</p>
              <p><span className="text-sky-400">"id"</span>{': '}<span className="text-amber-300">"{agentId}"</span></p>
              {model && <p><span className="text-sky-400">"model"</span>{': ...'}</p>}
              {selectedSkills.size > 0 && (
                <p><span className="text-sky-400">"skills"</span>{': ['}<span className="text-emerald-400">{selectedSkills.size}</span>{']'}</p>
              )}
              {telegramToken.trim() && <p><span className="text-sky-400">"telegram"</span>{': {...}'}</p>}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-7 py-4 border-t border-border/60 bg-muted/5 shrink-0">
          <Button variant="ghost" size="sm" className="h-9 px-4 rounded-xl text-muted-foreground hover:text-foreground"
            onClick={() => step > 1 ? setStep(s => (s - 1) as 1|2|3) : onClose()}>
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1">Step {step} of {STEPS.length}</span>
            {step === 2 && (
              <Button variant="ghost" size="sm" className="h-9 px-4 rounded-xl text-muted-foreground" onClick={() => setStep(3)}>Skip</Button>
            )}
            {step < 3 ? (
              <Button size="sm" disabled={step === 1 && !canNext1}
                onClick={() => setStep(s => (s + 1) as 1|2|3)}
                className="h-9 px-5 rounded-xl gap-1.5 font-medium">
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleCreate} disabled={creating}
                className="h-9 px-5 rounded-xl gap-1.5 font-medium bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm" id="wizard-deploy-btn">
                {creating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deploying…</>
                  : <><Sparkles className="w-3.5 h-3.5" />Deploy Agent</>}
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}

// ─────────────────────────────────────────────────────
// Overview panel
// ─────────────────────────────────────────────────────
function OverviewPanel({ agent, defaultId, identity, identityLoading, onGoFiles, onDeleted }: {
  agent: AgentRow
  defaultId: string
  identity: AgentIdentity | null
  identityLoading: boolean
  onGoFiles: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  const isMain = agent.id === 'main' || agent.id === defaultId

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to permanently delete the agent "${agent.id}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onDeleted()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete agent')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Info grid */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div><h3 className="font-semibold text-base">Overview</h3><p className="text-xs text-muted-foreground mt-0.5">Workspace paths and identity metadata.</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'Workspace', value: (<button onClick={onGoFiles} className="font-mono text-xs text-primary hover:underline text-left break-all">{agent.workspace || 'default'}</button>) },
            { label: 'Current Model', value: <span className="font-mono text-xs">{agent.model || <span className="text-muted-foreground">not set</span>}</span> },
            { label: 'Agent ID', value: <span className="font-mono text-xs">{agent.id}</span> },
            { label: 'Identity Name', value: <span className="text-xs font-semibold">{identity?.name || agent.identityName || '—'}</span> },
            { label: 'Default Agent', value: <span className="text-xs">{agent.id === defaultId ? '⭐ Yes' : 'No'}</span> },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-muted/30 border border-border/60 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
              {value}
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-base text-destructive">Danger Zone</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Permanent destructive actions.</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm text-foreground">Delete Agent</div>
            <div className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              {isMain ? 'The main orchestrator agent cannot be deleted.' : 'Permanently remove this agent and all of its files from the workspace.'}
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isMain || deleting}
            className="gap-1.5"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Agent'}
          </Button>
        </div>  
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────
// Files panel
// ─────────────────────────────────────────────────────
function FilesPanel({ agent, isActive }: { agent: AgentRow; isActive: boolean }) {
  const [hasViewed, setHasViewed] = useState(false)
  const [filesList, setFilesList] = useState<AgentsFilesListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'error'>('idle')
  const [preview, setPreview] = useState(true)

  useEffect(() => {
    if (isActive && !hasViewed) setHasViewed(true)
  }, [isActive, hasViewed])

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const q = agent.workspace ? `?workspace=${encodeURIComponent(agent.workspace)}` : ''
      const res = await fetch(`/api/agents/${agent.id}/files${q}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as AgentsFilesListResult
      setFilesList(data)
      // Pre-populate contents from the inline data — no individual file fetches needed
      const inlineContents: Record<string, string> = {}
      for (const f of data.files) {
        if (f.content !== undefined) inlineContents[f.name] = f.content
      }
      setContents(inlineContents)
      if (data.files.length > 0) setActiveFile(prev => prev ?? data.files[0].name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
    } finally { setLoading(false) }
  }, [agent.id, agent.workspace])

  useEffect(() => {
    if (hasViewed) loadFiles()
  }, [agent.id, hasViewed]) // eslint-disable-line

  const files = filesList?.files ?? []
  const currentContent = activeFile ? (contents[activeFile] ?? '') : ''
  const currentDraft = activeFile ? (drafts[activeFile] ?? currentContent) : ''
  const isDirty = activeFile ? currentDraft !== currentContent : false
  const isLoadingActive = loading && activeFile ? (contents[activeFile] === undefined) : false

  const handleSave = async () => {
    if (!activeFile) return
    setSaving(true)
    try {
      const q = agent.workspace ? `?workspace=${encodeURIComponent(agent.workspace)}` : ''
      const res = await fetch(`/api/agents/${agent.id}/files/${encodeURIComponent(activeFile)}${q}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentDraft }),
      })
      if (!res.ok) throw new Error()
      setContents(prev => ({ ...prev, [activeFile]: currentDraft }))
      setDrafts(prev => { const n = { ...prev }; delete n[activeFile]; return n })
      setSaveFeedback('saved'); setTimeout(() => setSaveFeedback('idle'), 2500)
    } catch {
      setSaveFeedback('error'); setTimeout(() => setSaveFeedback('idle'), 3000)
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div><h3 className="font-semibold text-base">Core Files</h3><p className="text-xs text-muted-foreground mt-0.5">Bootstrap persona, identity, and tool guidance.</p></div>
        <Button size="sm" variant="outline" onClick={loadFiles} disabled={loading} className="gap-1.5 h-8">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />{loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>
      {filesList && <p className="text-xs font-mono text-muted-foreground">Workspace: {filesList.workspace}</p>}
      {error && <ErrorCard msg={error} />}
      {files.length > 0 && (
        <>
          <div className="flex gap-1 flex-wrap border-b border-border pb-0">
            {files.map(file => {
              const label = file.name.replace(/\.md$/i, '')
              const isActive = activeFile === file.name
              return (
                <button key={file.name} onClick={() => { setActiveFile(file.name); setPreview(true) }}
                  className={cn('px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                    file.missing && 'opacity-60'
                  )}>
                  {label}{file.missing && <span className="ml-1 text-[9px] bg-amber-500/20 text-amber-600 px-1 rounded">missing</span>}
                </button>
              )
            })}
          </div>
          {activeFile && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <code className="text-[11px] text-muted-foreground font-mono">{files.find(f => f.name === activeFile)?.path}</code>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs transition-all', saveFeedback === 'saved' ? 'text-emerald-500' : saveFeedback === 'error' ? 'text-destructive' : 'text-transparent')}>
                    {saveFeedback === 'saved' ? '✓ Saved' : saveFeedback === 'error' ? '⚠ Error' : '·'}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setPreview(v => !v)}>
                    {preview ? <Edit className="w-3 h-3" /> : <Eye className="w-3 h-3" />}{preview ? 'Edit' : 'Preview'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!isDirty}
                    onClick={() => setDrafts(prev => { const n = { ...prev }; delete n[activeFile!]; return n })}>Reset</Button>
                  <Button size="sm" className="h-7 text-xs gap-1" disabled={saving || !isDirty} onClick={handleSave}>
                    {saving && <Loader2 className="w-3 h-3 animate-spin" />}Save
                  </Button>
                </div>
              </div>
              {isLoadingActive ? (
                <div className="border border-border rounded-lg p-4 min-h-[360px] animate-pulse bg-muted/20 flex flex-col gap-3">
                  <div className="w-1/3 h-5 bg-muted rounded"></div>
                  <div className="w-3/4 h-4 bg-muted rounded opacity-70"></div>
                  <div className="w-2/3 h-4 bg-muted rounded opacity-70"></div>
                </div>
              ) : preview
                ? <div className="border border-border rounded-lg p-4 min-h-[360px] prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap font-mono">{currentDraft || <span className="text-muted-foreground italic">Empty file</span>}</div>
                : <textarea className="w-full min-h-[360px] bg-muted/20 border border-border rounded-lg p-4 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y leading-relaxed"
                    value={currentDraft} onChange={e => setDrafts(prev => ({ ...prev, [activeFile!]: e.target.value }))}
                    spellCheck={false} placeholder={files.find(f => f.name === activeFile)?.missing ? 'File missing — saving will create it.' : ''} />
              }
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Channels panel
// ─────────────────────────────────────────────────────
type TelegramChannelConfig = {
  botToken: string
  dmPolicy: 'pairing' | 'allowlist' | 'open' | 'disabled'
  allowFrom: string[]
  enabled: boolean
}

function ChannelsPanel({ agentId, isActive }: { agentId: string; isActive: boolean }) {
  const [hasViewed, setHasViewed] = useState(false)


  const [tgConfig, setTgConfig]     = useState<TelegramChannelConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  // Edit state
  const [botToken, setBotToken]     = useState('')
  const [allowFrom, setAllowFrom]   = useState<string[]>([])  // array of IDs
  const [allowFromInput, setAllowFromInput] = useState('')     // current text field value
  const [enabled, setEnabled]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [removing, setRemoving]     = useState(false)
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(null)

  useEffect(() => {
    if (isActive && !hasViewed) setHasViewed(true)
  }, [isActive, hasViewed])

  // No-op kept for TelegramAccountsCard onReload prop
  const loadStatus = useCallback(() => {}, [])

  const loadConfig = useCallback(async () => {
    setConfigLoading(true); setConfigError(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/channel-config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { telegram: TelegramChannelConfig | null; accountId?: string }
      setTgConfig(data.telegram)
      setResolvedAccountId(data.accountId ?? null)
      if (data.telegram) {
        setBotToken(data.telegram.botToken)
        setAllowFrom(data.telegram.allowFrom)
        setEnabled(data.telegram.enabled)
      } else {
        setBotToken(''); setAllowFrom([]); setEnabled(true)
      }
      setAllowFromInput('')
      setDirty(false)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Failed to load config')
    } finally { setConfigLoading(false) }
  }, [agentId])

  useEffect(() => {
    if (hasViewed) { loadConfig() }
  }, [hasViewed, loadConfig])

  // Tag-input helpers
  const commitAllowFromInput = () => {
    const val = allowFromInput.trim()
    if (!val) return
    // Support comma-separated paste
    const ids = val.split(',').map(s => s.trim()).filter(Boolean)
    const next = [...new Set([...allowFrom, ...ids])]
    setAllowFrom(next)
    setAllowFromInput('')
    setDirty(true)
  }

  const handleAllowFromKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitAllowFromInput()
    } else if (e.key === 'Backspace' && !allowFromInput && allowFrom.length > 0) {
      setAllowFrom(prev => prev.slice(0, -1))
      setDirty(true)
    }
  }

  const removeAllowFromId = (id: string) => {
    setAllowFrom(prev => prev.filter(v => v !== id))
    setDirty(true)
  }

  const handleSave = async () => {
    // Commit any typed-but-not-yet-entered ID
    const pending = allowFromInput.trim()
      ? [...new Set([...allowFrom, ...allowFromInput.split(',').map(s => s.trim()).filter(Boolean)])]
      : allowFrom
    setSaving(true); setConfigError(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/channel-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram: { botToken, allowFrom: pending, enabled, accountId: resolvedAccountId ?? undefined } }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      await loadConfig()
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const handleRemove = async () => {
    if (!confirm('Remove this agent\'s dedicated Telegram bot? The bot token and routing binding will be deleted from config.')) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/channel-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram: { botToken: '', allowFrom: [], enabled: false } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await loadConfig()
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : 'Remove failed')
    } finally { setRemoving(false) }
  }


  const dmPolicyBadge = (policy: string) => {
    if (policy === 'allowlist') return <span className="text-[10px] bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">🔒 Allowlist</span>
    if (policy === 'pairing')   return <span className="text-[10px] bg-amber-500/15 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">🔑 Pairing</span>
    if (policy === 'open')      return <span className="text-[10px] bg-blue-500/15 text-blue-500 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">🌐 Open</span>
    return <span className="text-[10px] bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full font-semibold">{policy}</span>
  }

  return (
    <div className="space-y-5">

      {/* ── Per-agent Telegram config ── */}
      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              <div className="bg-sky-500/10 p-1 rounded-md">
                <Send className="w-3.5 h-3.5 text-sky-500 -ml-0.5 mt-0.5" />
              </div>
              Telegram
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assign a dedicated bot token and control who can DM this agent.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={loadConfig} disabled={configLoading} className="gap-1.5 h-8">
            <RefreshCw className={cn('w-3.5 h-3.5', configLoading && 'animate-spin')} />
            {configLoading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {/* Setup Guide */}
        <div className="bg-sky-500/5 border border-sky-500/20 rounded-lg p-3.5 text-sm space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-sky-600 dark:text-sky-400">
            <Info className="w-4 h-4" />
            How to set up a new Telegram bot
          </div>
          <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1.5 ml-1">
            <li>Open Telegram and message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">@BotFather</a></li>
            <li>Send the <code className="bg-muted px-1 py-0.5 rounded">/newbot</code> command and follow the prompts to choose a name and username.</li>
            <li>BotFather will give you a <strong>HTTP API Token</strong>. Copy and paste it into the field below.</li>
            <li>Add the <strong>numeric User IDs</strong> of the employees who should have access into the DM Allowlist.</li>
          </ol>
        </div>

        {/* Loading skeleton */}
        {configLoading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-5 w-32 bg-muted/60 rounded-full" />
            <div className="space-y-1.5">
              <div className="h-3 w-20 bg-muted/40 rounded" />
              <div className="h-9 bg-muted/30 rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-28 bg-muted/40 rounded" />
              <div className="h-9 bg-muted/30 rounded-lg" />
            </div>
          </div>
        )}

        {/* Current status badge */}
        {tgConfig && !configLoading && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold',
              tgConfig.enabled
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-muted/50 text-muted-foreground border-border'
            )}>
              {tgConfig.enabled ? '● Active' : '○ Disabled'}
            </span>
            {dmPolicyBadge(tgConfig.dmPolicy)}
            {tgConfig.allowFrom.length > 0 && tgConfig.allowFrom.map(uid => (
              <span key={uid} className="text-[10px] font-mono bg-muted/50 px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                {uid}
              </span>
            ))}
          </div>
        )}
        {!tgConfig && !configLoading && (
          <div className="rounded-lg bg-muted/30 border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            No dedicated Telegram bot configured for this agent. Fill in the fields below to assign one.
          </div>
        )}

        {configError && <ErrorCard msg={configError} />}

        {/* Fields — only render once config has loaded */}
        {!configLoading && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bot Token</label>
            <input
              type="text"
              value={botToken}
              onChange={e => { setBotToken(e.target.value); setDirty(true) }}
              placeholder="e.g. 123456789:AABBccDD... (from BotFather)"
              className="w-full h-9 px-3 text-xs font-mono bg-muted/20 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* DM Allowlist – multi-ID tag input */}
          {!configLoading && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                DM Allowlist — Telegram User IDs
                <span className="ml-1.5 font-normal text-muted-foreground/70">(numeric — leave empty for pairing mode)</span>
              </label>
              {/* Tag container */}
              <div
                className={cn(
                  'flex flex-wrap gap-1.5 min-h-[38px] px-2.5 py-1.5 bg-muted/20 border border-border rounded-lg transition-colors',
                  !botToken.trim() && 'opacity-40 pointer-events-none',
                  'focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50'
                )}
                onClick={() => {
                  const input = document.getElementById(`allowfrom-input-${agentId}`) as HTMLInputElement | null
                  input?.focus()
                }}
              >
                {allowFrom.map(uid => (
                  <span key={uid} className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono px-2 py-0.5 rounded-full">
                    {uid}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); removeAllowFromId(uid) }}
                      className="hover:text-destructive transition-colors leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id={`allowfrom-input-${agentId}`}
                  type="text"
                  value={allowFromInput}
                  onChange={e => setAllowFromInput(e.target.value)}
                  onKeyDown={handleAllowFromKeyDown}
                  onBlur={commitAllowFromInput}
                  placeholder={allowFrom.length === 0 ? 'Type an ID and press Enter or comma…' : 'Add another ID…'}
                  disabled={!botToken.trim()}
                  className="flex-1 min-w-[140px] bg-transparent text-xs font-mono focus:outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <p className={cn('text-[10px]',
                botToken.trim() && allowFrom.length > 0
                  ? 'text-emerald-500'
                  : botToken.trim()
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
              )}>
                {botToken.trim() && allowFrom.length > 0
                  ? `🔒 DM allowlist — ${allowFrom.length} user${allowFrom.length > 1 ? 's' : ''} can message this bot.`
                  : botToken.trim()
                  ? '⚠️ No IDs set — bot will block chat and send callers their User ID (pairing mode).'
                  : 'Enter a bot token first.'}
              </p>
            </div>
          )}

          {/* Enabled toggle */}
          {botToken.trim() && (
            <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/60 bg-muted/10">
              <div>
                <p className="text-xs font-medium">Bot Enabled</p>
                <p className="text-[10px] text-muted-foreground">Disable to pause this bot without deleting its config.</p>
              </div>
              <button
                onClick={() => { setEnabled(v => !v); setDirty(true) }}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50',
                  enabled ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                  enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          )}
        </div>
        )} {/* end !configLoading fields */}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {tgConfig && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5"
              onClick={handleRemove}
              disabled={removing || saving}
            >
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Remove Bot
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-500">✓ Saved & gateway reloaded</span>}
            <Button
              size="sm"
              className={cn('h-8 text-xs gap-1.5', saved && 'bg-emerald-600 hover:bg-emerald-700')}
              onClick={handleSave}
              disabled={saving || !dirty || !botToken.trim()}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save & Reload'}
            </Button>
          </div>
        </div>

        {/* Info note */}
        <div className="rounded-lg bg-muted/20 border border-border/50 px-3 py-2.5 text-[10px] text-muted-foreground space-y-1">
          <p><span className="font-semibold text-foreground/70">No allowlist (pairing mode):</span> the bot blocks chat and replies to every new user with their Telegram User ID. Paste that ID into the field above and save to grant them access.</p>
          <p><span className="font-semibold text-foreground/70">Allowlist mode:</span> only the listed IDs can chat. Everyone else is blocked and told their User ID.</p>
        </div>
      </div>

      {/* ── All Telegram accounts (cleanup) ── */}
      <TelegramAccountsCard onReload={loadStatus} />

    </div>
  )
}

function TelegramAccountsCard({ onReload }: { onReload: () => void }) {
  const [accounts, setAccounts] = useState<Array<{ key: string; agentId: string | null; botToken: string; dmPolicy: string }>>([])
  const [removing, setRemoving] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents/telegram-accounts')
      if (res.ok) setAccounts(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // Stagger load to avoid maxing out HTTP connection pool on initial dashboard load
    const t = setTimeout(load, 800)
    return () => clearTimeout(t)
  }, [load])

  const remove = async (accountId: string) => {
    setRemoving(accountId)
    setConfirmKey(null)
    try {
      await fetch(`/api/agents/telegram-account?accountId=${encodeURIComponent(accountId)}`, { method: 'DELETE' })
      await load()
      onReload()
    } finally { setRemoving(null) }
  }

  if (loading) return null
  if (accounts.length === 0) return null

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-base">Configured Telegram Accounts</h3>
        <p className="text-xs text-muted-foreground mt-0.5">All bot accounts in openclaw.json. Remove stale or orphaned entries here.</p>
      </div>
      <div className="space-y-2">
        {accounts.map(acc => (
          <div key={acc.key} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-border/50 bg-muted/10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold">{acc.key}</span>
                {acc.agentId
                  ? <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full">→ {acc.agentId}</span>
                  : <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-full">orphaned</span>
                }
                <span className="text-[10px] text-muted-foreground">{acc.dmPolicy}</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{acc.botToken.slice(0, 20)}…</p>
            </div>

            {/* Two-step confirm */}
            <div className="shrink-0 flex items-center gap-1.5">
              {confirmKey === acc.key ? (
                <>
                  <span className="text-xs text-muted-foreground">Remove this bot?</span>
                  <button
                    onClick={() => remove(acc.key)}
                    disabled={!!removing}
                    className="h-7 px-3 text-xs font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-40 flex items-center gap-1"
                  >
                    {removing === acc.key ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Yes, remove
                  </button>
                  <button
                    onClick={() => setConfirmKey(null)}
                    className="h-7 px-3 text-xs text-muted-foreground border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmKey(acc.key)}
                  disabled={!!removing}
                  className="h-7 px-3 text-xs text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────
// Skills panel
// ─────────────────────────────────────────────────────
type AgentSkillEntry = {
  id: string
  name: string
  description?: string
  emoji?: string
  source?: string
  eligible?: boolean
  requiredBins?: string[]
}

function SkillsPanel({ agentId, isActive }: { agentId: string; isActive: boolean }) {
  const [hasViewed, setHasViewed]       = useState(false)
  const [allSkills, setAllSkills]       = useState<AgentSkillEntry[]>([])
  const [allowlist, setAllowlist]       = useState<Set<string> | null>(null) // null = unrestricted
  const [pending, setPending]           = useState<Set<string>>(new Set())
  const [loading, setLoading]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [saved, setSaved]               = useState(false)
  const [search, setSearch]             = useState('')
  const [dirty, setDirty]               = useState(false)

  useEffect(() => { if (isActive && !hasViewed) setHasViewed(true) }, [isActive, hasViewed])

  // Load skills for this agent
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      // All global skills
      const skillsRes = await fetch('/api/skills')
      const skillsData = skillsRes.ok ? await skillsRes.json() as AgentSkillEntry[] : []
      setAllSkills(skillsData)

      // Agent-specific allowlist from openclaw.json
      const agentRes = await fetch(`/api/agents/${agentId}`)
      if (agentRes.ok) {
        const agentData = await agentRes.json() as { skills?: string[] }
        if (Array.isArray(agentData.skills)) {
          const s = new Set(agentData.skills)
          setAllowlist(s)
          setPending(new Set(s))
        } else {
          setAllowlist(null)     // no restriction
          setPending(new Set())
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }, [agentId])

  useEffect(() => { if (hasViewed) load() }, [hasViewed, load])

  const isCustom = allowlist !== null
  const effectiveEnabled = (id: string) => isCustom ? pending.has(id) : true

  const toggle = (id: string) => {
    setPending(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setDirty(true)
  }

  const enableAll  = () => {
    const all = new Set(allSkills.map(s => s.id))
    setPending(all)
    setAllowlist(all)   // enter custom mode so effectiveEnabled reflects pending
    setDirty(true)
  }
  const disableAll = () => {
    setPending(new Set())
    setAllowlist(new Set())  // enter custom mode with nothing enabled
    setDirty(true)
  }

  const save = async () => {
    setSaving(true); setError(null)
    try {
      // null  = inherit all (no allowlist — removes skills field from config)
      // []    = custom allowlist with nothing enabled (disables all skills)
      // [...] = custom allowlist with specific skills
      const skills: string[] | null = allowlist !== null
        ? Array.from(pending)   // in custom mode: send [] or [...]
        : null                   // still inheriting: send null
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAllowlist(skills !== null ? new Set(skills) : null)
      setDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q
      ? allSkills.filter(s => (s.name + s.id + (s.description ?? '')).toLowerCase().includes(q))
      : allSkills
  }, [allSkills, search])

  const workspaceSkills = filtered.filter(s => s.source !== 'bundled')
  const bundledSkills   = filtered.filter(s => s.source === 'bundled')

  const enabledCount = isCustom
    ? allSkills.filter(s => pending.has(s.id)).length
    : allSkills.length

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-base">Skills</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per-agent skill allowlist and workspace skills. {enabledCount}/{allSkills.length}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={enableAll}>Enable All</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={disableAll}>Disable All</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />Refresh
          </Button>
          <Button
            size="sm"
            className={cn('h-8 gap-1.5 text-xs', saved && 'bg-emerald-600 hover:bg-emerald-700')}
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Allowlist notice */}
      {isCustom ? (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-xs text-primary">
          This agent uses a custom skill allowlist ({enabledCount} of {allSkills.length} enabled).
        </div>
      ) : (
        <div className="rounded-lg bg-muted/50 border border-border px-4 py-2.5 text-xs text-muted-foreground">
          This agent inherits all global skills. Select skills below and save to create a custom allowlist.
        </div>
      )}

      {error && <ErrorCard msg={error} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter skills…"
          className="w-full h-9 pl-9 pr-3 text-xs bg-muted/20 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading && !allSkills.length && <LoadingCard label="Loading skills…" />}

      {/* Skill groups */}
      {([{ label: 'Workspace Skills', skills: workspaceSkills }, { label: 'Built-in Skills', skills: bundledSkills }] as const).map(group => {
        if (group.skills.length === 0) return null
        return (
          <div key={group.label} className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
              {group.label} <span className="font-normal">· {group.skills.length}</span>
            </p>
            {group.skills.map(skill => {
              const enabled = effectiveEnabled(skill.id)
              const isWs    = skill.source !== 'bundled'
              return (
                <div
                  key={skill.id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors',
                    enabled
                      ? 'bg-card border-border/60'
                      : 'bg-muted/20 border-transparent opacity-60'
                  )}
                >
                  {/* Status dot */}
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    enabled
                      ? (skill.eligible !== false ? 'bg-emerald-500' : 'bg-amber-500')
                      : 'bg-muted-foreground/40'
                  )} />
                  {/* Emoji */}
                  <span className="text-sm shrink-0 w-5">{skill.emoji || '🔧'}</span>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">{skill.name || skill.id}</span>
                      {isWs && (
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">custom</span>
                      )}
                      {!isCustom && (
                        <span className="text-[9px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded font-medium">inherited</span>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{skill.description}</p>
                    )}
                    {skill.requiredBins && skill.requiredBins.length > 0 && (
                      <p className="text-[10px] text-amber-500 mt-0.5">Missing: {skill.requiredBins.join(', ')}</p>
                    )}
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => toggle(skill.id)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50',
                      enabled ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                      enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {!loading && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">No matching skills.</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────
const TABS: Array<{ id: AgentsPanel; label: string; icon: React.ReactNode }> = [
  { id: 'overview',  label: 'Overview',  icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'files',     label: 'Files',     icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'skills',    label: 'Skills',    icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'channels',  label: 'Channels',  icon: <Radio className="w-3.5 h-3.5" /> },
]

export default function AgentsClient() {
  const [result, setResult] = useState<AgentsListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, _setSelectedId] = useState<string | null>(null)
  const [panel, _setPanel] = useState<AgentsPanel>('overview')

  // Setup persistence
  useEffect(() => {
    const id = sessionStorage.getItem('clawpanel_agent_id')
    const p = sessionStorage.getItem('clawpanel_agent_panel') as AgentsPanel
    if (id) _setSelectedId(id)
    if (p) _setPanel(p)
  }, [])

  const setSelectedId = (id: string | null) => {
    _setSelectedId(id)
    if (id) sessionStorage.setItem('clawpanel_agent_id', id)
    else sessionStorage.removeItem('clawpanel_agent_id')
  }

  const setPanel = (p: AgentsPanel) => {
    _setPanel(p)
    sessionStorage.setItem('clawpanel_agent_panel', p)
  }

  const [identity, setIdentity] = useState<AgentIdentity | null>(null)
  const [identityLoading, setIdentityLoading] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [skills, setSkills] = useState<SkillEntry[]>([])

  const loadAgents = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/agents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as AgentsListResult
      setResult(data)
      const cached = sessionStorage.getItem('clawpanel_agent_id')
      if (!selectedId && !cached && data.agents.length > 0) {
        setSelectedId(data.defaultId ?? data.agents[0].id)
      } else if (cached && !selectedId) {
        // Just in case the effect hasn't run yet or we want to eagerly set it
        _setSelectedId(cached) 
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents')
    } finally { setLoading(false) }
  }, [selectedId])

  useEffect(() => { loadAgents() }, []) // eslint-disable-line

  // Load skills for the wizard (lazy load to save HTTP connections)
  useEffect(() => {
    if (!showWizard || skills.length > 0) return
    fetch('/api/skills').then(r => r.ok ? r.json() : null).then(data => {
      if (Array.isArray(data?.skills)) setSkills(data.skills)
      else if (Array.isArray(data)) setSkills(data)
    }).catch(() => {})
  }, [showWizard]) // eslint-disable-line

  // Channel status dots removed — /api/agents/channels probe was too slow

  const agents = result?.agents ?? []
  const defaultId = result?.defaultId ?? ''
  const selectedAgent = selectedId ? agents.find(a => a.id === selectedId) ?? null : null

  // Load identity when agent changes
  useEffect(() => {
    if (!selectedAgent) return
    setIdentity(null); setIdentityLoading(true)
    const q = selectedAgent.workspace ? `?workspace=${encodeURIComponent(selectedAgent.workspace)}` : ''
    fetch(`/api/agents/${selectedAgent.id}/identity${q}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setIdentity(d as AgentIdentity | null))
      .catch(() => setIdentity(null))
      .finally(() => setIdentityLoading(false))
  }, [selectedAgent?.id]) // eslint-disable-line


  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 pt-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-violet-500 pb-1">Agents</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">Manage your agent roster and workspace configurations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadAgents} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />{loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button size="sm" onClick={() => setShowWizard(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />New Agent
          </Button>
        </div>
      </div>

      {error && <ErrorCard msg={error} />}

      {/* Agent Roster Grid */}
      {loading && agents.length === 0
        ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border bg-card p-4 animate-pulse h-44 shadow-sm">
                <div className="flex gap-3 mb-3"><div className="w-10 h-10 bg-muted/60 rounded-xl" /><div className="flex-1 space-y-2"><div className="h-3 bg-muted/60 rounded w-2/3" /><div className="h-2 bg-muted/40 rounded w-1/2" /></div></div>
                <div className="space-y-2"><div className="h-2 bg-muted/40 rounded" /><div className="h-2 bg-muted/40 rounded w-3/4" /></div>
              </div>
            ))}
          </div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                defaultId={defaultId}
                isSelected={selectedId === agent.id}
                onSelect={() => { setSelectedId(agent.id); setPanel('overview') }}
              />
            ))}
            {/* Empty state */}
            {agents.length === 0 && !loading && (
              <div className="col-span-3 rounded-xl border border-dashed border-border bg-muted/10 p-12 text-center">
                <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No agents found.</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowWizard(true)}>
                  <Plus className="w-3.5 h-3.5" />Create First Agent
                </Button>
              </div>
            )}
          </div>
      }

      {/* Detail panel */}
      {selectedAgent && (
        <div key={selectedAgent.id} className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-base">{selectedAgent.identityEmoji || '🤖'}</span>
            <h2 className="font-semibold text-lg">{selectedAgent.identityName || selectedAgent.name || selectedAgent.id}</h2>
            {selectedAgent.id === defaultId && (
              <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 fill-current" />Default
              </span>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 border-b border-border overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setPanel(tab.id)}
                className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                  panel === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          <div className={panel === 'overview' ? 'block' : 'hidden'}>
            <OverviewPanel
              key={selectedAgent.id}
              agent={selectedAgent}
              defaultId={defaultId}
              identity={identity}
              identityLoading={identityLoading}
              onGoFiles={() => setPanel('files')}
              onDeleted={() => {
                setSelectedId(null)
                loadAgents()
              }}
            />
          </div>
          <div className={panel === 'files' ? 'block' : 'hidden'}>
            <FilesPanel key={selectedAgent.id} agent={selectedAgent} isActive={panel === 'files'} />
          </div>
          <div className={panel === 'skills' ? 'block' : 'hidden'}>
            <SkillsPanel key={selectedAgent.id} agentId={selectedAgent.id} isActive={panel === 'skills'} />
          </div>
          <div className={panel === 'channels' ? 'block' : 'hidden'}>
            <ChannelsPanel key={selectedAgent.id} agentId={selectedAgent.id} isActive={panel === 'channels'} />
          </div>
        </div>
      )}

      {/* Create Agent Wizard */}
      {showWizard && (
        <CreateAgentWizard
          skills={skills}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); loadAgents() }}
        />
      )}
    </div>
  )
}
