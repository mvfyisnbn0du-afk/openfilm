/**
 * The Version history panel: a list of versions, as a person knows it from Google Docs or Figma.
 *
 *   Current                   the film as it is now: whether it changed since the last version (and what, in scenes
 *                             and sounds); an optional name and Save version
 *   Today / Yesterday / date  the versions, newest first, each with the film's picture when it was saved; a click
 *                             opens one: Restore this version, Make a copy (a new project from it), ⋯ Rename
 *   Versions keep … files     what a version keeps of the folder, and what it leaves out; each opens to its list
 *
 * Restoring goes back to a version and saves it as the newest; what was there and not saved is saved first, so
 * nothing is lost. Versions saved on their own (Auto versions, in Settings › Advanced) are shown quieter. Data and
 * actions come from `useProjectHistory`.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Clapperboard, Copy, History, Loader2, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react';
import { useLanguage, useT } from '@/i18n';
import { formatBytes } from '@/lib/export-jobs';
import {
  byDay, historyApi, isAutomatic, summaryParts, versionLabel, versionPoster,
  type HistoryFile, type HistoryFiles, type HistoryProgress, type Summary, type Version,
} from '@/lib/project-history';
import { Card, CardActions, CardButton, POPOVER_CHROME } from './Card';
import { ContextMenu, type ContextMenuEntry } from './ContextMenu';
import { Tooltip } from './Tooltip';
import type { ProjectHistory } from './use-project-history';

const PANEL_W = 400;

type Translate = (key: string) => string;

/** How far an action is, in a few words: "Keeping media… 3 of 20". */
function progressText(progress: HistoryProgress, t: Translate): string {
  const key = { scan: 'versions.progressScan', store: 'versions.progressStore', write: 'versions.progressWrite', migrate: 'versions.progressMigrate' }[progress.phase];
  return t(key).replace('{done}', String(progress.done)).replace('{total}', String(progress.total));
}

/** What changed, as a short sentence: "2 scenes added · 1 sound edited". */
function summaryText(summary: Summary, t: Translate): string {
  return summaryParts(summary).map(({ key, n }) => t(`versions.${key}${n === 1 ? 'One' : ''}`).replace('{n}', String(n))).join(' · ');
}

/** Times as the person's language writes them: a clock time, and a day. */
function useTimes() {
  const language = useLanguage();
  return React.useMemo(() => {
    const clock = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' });
    const day = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' });
    const dayYear = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'short', day: 'numeric' });
    return {
      clock: (at: number) => (at > 0 ? clock.format(at) : ''),
      day: (at: number) => (new Date(at).getFullYear() === new Date().getFullYear() ? day : dayYear).format(at),
      when: (at: number) => (at > 0 ? `${(new Date(at).toDateString() === new Date().toDateString() ? clock : dayYear).format(at)}` : ''),
    };
  }, [language]);
}

/** A version's name as shown: its own, else what kind of version it is. */
function labelOf(v: Version, all: readonly Version[], t: Translate, when: (at: number) => string): string {
  const l = versionLabel(v, all);
  if (!l.key) return l.name ?? '';
  return t(l.key).replace('{name}', l.name ?? '').replace('{time}', l.at ? when(l.at) : '');
}

/**
 * The top bar's Version history button. It carries `data-history-trigger`, which the panel's click-outside check
 * recognizes, so clicking it again toggles the panel instead of closing and reopening it.
 */
export function ProjectHistoryButton({ open, onClick, className }: {
  open: boolean;
  onClick: () => void;
  className?: string;
}) {
  const t = useT();
  return (
    <Tooltip label={t('projectMenu.history')} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={t('projectMenu.history')}
        aria-expanded={open}
        data-history-trigger=""
        className={className}
      >
        <History size={16} />
      </button>
    </Tooltip>
  );
}

/** The questions the panel asks, one at a time. */
type Dialog =
  | { kind: 'restore'; version: Version }
  | { kind: 'copy'; version: Version }
  | { kind: 'rename'; version: Version };

export function ProjectHistoryControls({
  projectId,
  projectName,
  history,
  open,
  anchor,
  onClose,
  onOpenProject,
}: {
  projectId: string;
  /** the project's name: a copy is named after it */
  projectName: string;
  history: ProjectHistory;
  open: boolean;
  /**
   * The bottom-right corner (viewport px) of what opened it — the top bar's right cluster, `{ x: rect.right,
   * y: rect.bottom + 4 }`. The panel hangs from it leftward. Without it: the top right of the window.
   */
  anchor?: { x: number; y: number } | null;
  onClose: () => void;
  /** a copy was made: open it */
  onOpenProject: (id: string) => void;
}) {
  const t = useT();
  const times = useTimes();
  const { state, busy, progress } = history;
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [name, setName] = React.useState('');
  const [dialog, setDialog] = React.useState<Dialog | null>(null);
  const [openRow, setOpenRow] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const dialogRef = React.useRef(dialog);
  dialogRef.current = dialog;

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      /* a question is answered first; it is not a click away from the panel */
      if (dialogRef.current) return;
      const target = event.target as Element;
      if (panelRef.current?.contains(target)) return;
      /* its menus are drawn outside it */
      if (target.closest?.('[role="menu"]')) return;
      /* the button that opens it toggles it itself; closing here first would let its click reopen it */
      if (target.closest?.('[data-history-trigger]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !dialogRef.current) onClose(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  /* loaded again on opening: versions may have been saved while it was closed */
  const { refresh } = history;
  React.useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  React.useEffect(() => { if (!open) { setOpenRow(null); setNotice(null); } }, [open]);
  /* the film's picture now, drawn again whenever the history is read again (a change, an action) */
  const nowKey = React.useMemo(() => `${state?.status.head ?? ''}:${Date.now()}`, [state]);

  if (!open) return null;

  const now = Date.now();
  const status = state?.status ?? null;
  const versions = state?.versions ?? [];
  const changes = status?.changes ?? null;
  const saved = versions.length > 0;
  const label = (v: Version) => labelOf(v, versions, t, times.when);
  /* in a question, a version without a name of its own is told by when it was saved too */
  const asked = (v: Version) => (v.name && v.kind !== 'parked' ? label(v) : `${label(v)}, ${times.when(v.at)}`);

  const doSave = async () => {
    if (await history.save(name.trim())) { setName(''); setNotice(null); }
  };
  const doRestore = async (version: Version) => {
    setDialog(null);
    const result = await history.restore(version.commit);
    if (result.ok) {
      setOpenRow(null);
      setNotice(result.body.missing?.length ? t('versions.missing') : t('versions.restored').replace('{name}', label(version)));
    }
  };
  const doCopy = async (version: Version, projectNameTyped: string) => {
    setDialog(null);
    const result = await history.copy(version.commit, projectNameTyped);
    if (result.ok) onOpenProject(result.body.project.id);
  };
  const doRename = async (version: Version, typed: string) => {
    setDialog(null);
    await history.rename(version.commit, typed);
  };

  return (
    <>
      {createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('versions.title')}
          className="fixed z-[110] flex flex-col overflow-hidden"
          style={{
            ...POPOVER_CHROME,
            right: anchor ? Math.max(window.innerWidth - anchor.x, 12) : 12,
            top: anchor ? anchor.y : 40,
            width: PANEL_W,
            animation: 'openfilm-rise 0.14s ease-out both',
            maxHeight: `calc(100vh - ${(anchor ? anchor.y : 40) + 12}px)`,
          }}
        >
          <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">{t('versions.title')}</span>
            {busy ? <Loader2 size={13} className="animate-spin text-[var(--text-faint)]" aria-label={t('versions.working')} /> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('versions.close')}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-faint)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
          {progress ? (
            <div role="status" className="shrink-0 px-4 pb-2">
              <div className="truncate text-[11.5px] text-[var(--text-muted)]">{progressText(progress, t)}</div>
              <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150" style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} />
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {notice ? (
              <p role="status" className="mb-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-dim)]">{notice}</p>
            ) : null}

            {state === null ? (
              <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-[var(--text-faint)]" /></div>
            ) : (
              <>
                {/* the film now, and saving it */}
                <section aria-label={t('versions.current')} className="mb-2 rounded-xl border border-[var(--border)] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Thumb src={`/api/projects/${encodeURIComponent(projectId)}/media?path=film.html&what=poster&v=${encodeURIComponent(nowKey)}`} size="large" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-[var(--text)]">{t('versions.current')}</div>
                      <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]">
                        {!saved ? t('versions.firstHint') : changes ? (
                          <>
                            <span className="mr-1.5 inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent)] align-[1px]" aria-hidden />
                            {`${t('versions.edited')} · ${summaryText(changes.summary, t)}`}
                          </>
                        ) : t('versions.upToDate')}
                      </div>
                    </div>
                  </div>
                  <form className="mt-2.5 flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void doSave(); }}>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={200}
                      aria-label={t('versions.namePlaceholder')}
                      placeholder={t('versions.namePlaceholder')}
                      disabled={busy !== null}
                      className="h-8 min-w-0 flex-1 rounded-lg bg-[var(--surface-2)] px-2.5 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-1 focus:ring-[var(--border-strong)]"
                      onKeyDown={(event) => event.stopPropagation()}
                    />
                    <CardButton type="submit" weight="primary" disabled={busy !== null || (saved && !changes && !name.trim())}>
                      {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : null}
                      {t('versions.save')}
                    </CardButton>
                  </form>
                </section>

                {byDay(versions, now).map((group) => (
                  <section key={String(group.day)} aria-label={group.day === 'today' ? t('versions.today') : group.day === 'yesterday' ? t('versions.yesterday') : times.day(group.day)}>
                    <div className="px-1.5 pb-1 pt-2.5 text-[11px] font-medium text-[var(--text-faint)]">
                      {group.day === 'today' ? t('versions.today') : group.day === 'yesterday' ? t('versions.yesterday') : times.day(group.day)}
                    </div>
                    <ol>
                      {group.versions.map((v) => (
                        <VersionRow
                          key={v.commit}
                          projectId={projectId}
                          version={v}
                          label={label(v)}
                          time={times.clock(v.at)}
                          open={openRow === v.commit}
                          busy={busy !== null}
                          t={t}
                          onToggle={() => setOpenRow((cur) => (cur === v.commit ? null : v.commit))}
                          onRestore={() => setDialog({ kind: 'restore', version: v })}
                          onCopy={() => setDialog({ kind: 'copy', version: v })}
                          onRename={() => setDialog({ kind: 'rename', version: v })}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
                {state.more ? (
                  <button
                    type="button"
                    onClick={() => void history.showMore()}
                    className="mt-1 w-full rounded-lg px-2 py-1.5 text-[12px] text-[var(--text-muted)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  >
                    {t('versions.showMore')}
                  </button>
                ) : null}
              </>
            )}

            {status?.files ? <FilesHeld projectId={projectId} files={status.files} t={t} /> : null}
          </div>
        </div>,
        document.body,
      )}
      <Questions
        dialog={dialog}
        label={dialog ? asked(dialog.version) : ''}
        copyName={dialog ? t('versions.copyDefault').replace('{project}', projectName).replace('{name}', asked(dialog.version)) : ''}
        unsaved={Boolean(changes)}
        t={t}
        onCancel={() => setDialog(null)}
        onRestore={(v) => void doRestore(v)}
        onCopy={(v, typed) => void doCopy(v, typed)}
        onRename={(v, typed) => void doRename(v, typed)}
      />
    </>
  );
}

/**
 * What a version keeps of the folder, and the other files it leaves out (media the film does not use, tool folders).
 * Each opens to its list, loaded when opened.
 */
function FilesHeld({ projectId, files, t }: { projectId: string; files: HistoryFiles; t: Translate }) {
  const [open, setOpen] = React.useState<'held' | 'ignored' | null>(null);
  const [lists, setLists] = React.useState<{ held: HistoryFile[]; ignored: HistoryFile[] } | null>(null);
  const toggle = (which: 'held' | 'ignored') => {
    const next = open === which ? null : which;
    setOpen(next);
    if (next) void historyApi.files(projectId).then((l) => { if (l) setLists(l); });
  };
  const row = (which: 'held' | 'ignored', label: string) => (
    <button
      type="button"
      onClick={() => toggle(which)}
      aria-expanded={open === which}
      className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11.5px] text-[var(--text-faint)] transition hover:text-[var(--text-dim)]"
    >
      {open === which ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
  const n = (key: string, count: number) => t(count === 1 ? `${key}One` : key).replace('{n}', count.toLocaleString());
  const list = open && lists ? lists[open] : null;
  return (
    <div className="mt-3 border-t border-[var(--border)] pt-2">
      {row('held', n('versions.heldFiles', files.held).replace('{size}', formatBytes(files.heldBytes)))}
      {files.ignored ? row('ignored', n('versions.ignoredFiles', files.ignored)) : null}
      {open ? (
        list ? (
          <ul className="mt-1 max-h-[180px] overflow-y-auto rounded-lg bg-[var(--surface-2)] px-2 py-1.5">
            {list.map((f) => (
              <li key={f.path} className="flex items-center gap-2 py-[1px] text-[11px] text-[var(--text-muted)]" title={f.path}>
                <span className="min-w-0 flex-1 truncate">{f.path}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex justify-center py-2"><Loader2 size={13} className="animate-spin text-[var(--text-faint)]" /></div>
        )
      ) : null}
    </div>
  );
}

/** The film's picture at a version (or now): a placeholder until there is one. */
function Thumb({ src, size = 'small' }: { src: string | null; size?: 'small' | 'large' | 'full' }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  const box = size === 'full' ? 'aspect-video w-full' : size === 'large' ? 'h-[45px] w-[80px]' : 'h-[34px] w-[60px]';
  if (!src || failed) {
    return (
      <span className={`${box} flex shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--text-faint)]`}>
        <Clapperboard size={size === 'small' ? 13 : 16} />
      </span>
    );
  }
  return <img src={src} alt="" onError={() => setFailed(true)} className={`${box} shrink-0 rounded-md bg-black object-cover`} />;
}

function VersionRow({ projectId, version, label, time, open, busy, t, onToggle, onRestore, onCopy, onRename }: {
  projectId: string;
  version: Version;
  label: string;
  time: string;
  open: boolean;
  busy: boolean;
  t: Translate;
  onToggle: () => void;
  onRestore: () => void;
  onCopy: () => void;
  onRename: () => void;
}) {
  const [anchor, setAnchor] = React.useState<{ x: number; y: number; top: number } | null>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const quiet = isAutomatic(version);
  const menu: ContextMenuEntry[] = [{ id: 'rename', icon: <Pencil size={14} />, label: t('versions.rename'), onSelect: onRename }];
  return (
    <li className={`mb-0.5 rounded-lg transition ${open ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2.5 px-2 py-1.5 text-left"
      >
        <Thumb src={versionPoster(projectId, version.commit)} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[12.5px] leading-snug ${quiet ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>{label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--text-faint)]">{summaryText(version.summary, t)}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-faint)]">{time}</span>
      </button>
      {open ? (
        <div className="grid gap-2 px-2 pb-2.5 pt-0.5">
          <Thumb src={versionPoster(projectId, version.commit)} size="full" />
          <div className="flex items-center gap-2">
            <CardButton weight="primary" disabled={busy} onClick={onRestore}><RotateCcw size={12} />{t('versions.restore')}</CardButton>
            <CardButton weight="secondary" disabled={busy} onClick={onCopy}><Copy size={12} />{t('versions.copy')}</CardButton>
            <button
              ref={button}
              type="button"
              disabled={busy}
              aria-label={t('versions.moreActions')}
              aria-haspopup="menu"
              aria-expanded={anchor != null}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setAnchor((cur) => (cur ? null : { x: box.right, y: box.bottom + 4, top: box.top - 4 }));
              }}
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-faint)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <MoreHorizontal size={14} />
            </button>
            {anchor ? <ContextMenu x={anchor.x} y={anchor.y} flipTo={anchor.top} align="end" trigger={button} onClose={() => setAnchor(null)} items={menu} /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Every question the panel asks, as one dialog whose words and choices follow what is asked. */
function Questions({ dialog, label, copyName, unsaved, t, onCancel, onRestore, onCopy, onRename }: {
  dialog: Dialog | null;
  label: string;
  copyName: string;
  unsaved: boolean;
  t: Translate;
  onCancel: () => void;
  onRestore: (v: Version) => void;
  onCopy: (v: Version, name: string) => void;
  onRename: (v: Version, name: string) => void;
}) {
  const [value, setValue] = React.useState('');
  /* each question starts with its own default text */
  React.useEffect(() => {
    if (!dialog) return;
    setValue(dialog.kind === 'copy' ? copyName : dialog.kind === 'rename' ? dialog.version.name : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);
  if (!dialog) return null;
  const cancel = { label: t('versions.cancel'), weight: 'quiet' as const, onClick: onCancel };
  const typed = value.trim();
  switch (dialog.kind) {
    case 'restore':
      return (
        <Ask title={t('versions.restoreTitle').replace('{name}', label)} body={t(unsaved ? 'versions.restoreBody' : 'versions.restoreSavedBody')} onCancel={onCancel}
          actions={[cancel, { label: t('versions.restoreConfirm'), weight: 'primary', onClick: () => onRestore(dialog.version) }]} />
      );
    case 'copy':
      return (
        <Ask title={t('versions.copyTitle').replace('{name}', label)} body={t('versions.copyBody')}
          input={{ value, onChange: setValue, placeholder: t('versions.copyName') }} onCancel={onCancel}
          actions={[cancel, { label: t('versions.copyConfirm'), weight: 'primary', disabled: !typed, onClick: () => onCopy(dialog.version, typed) }]} />
      );
    case 'rename':
      return (
        <Ask title={t('versions.renameTitle')} input={{ value, onChange: setValue, placeholder: t('versions.versionName') }} onCancel={onCancel}
          actions={[cancel, { label: t('versions.renameConfirm'), weight: 'primary', disabled: !typed, onClick: () => onRename(dialog.version, typed) }]} />
      );
    default:
      return null;
  }
}

/** A question in the middle of the window: a few words, maybe a field, and its choices (the last one is the default). */
function Ask({ title, body, input, actions, onCancel }: {
  title: string;
  body?: string;
  input?: { value: string; onChange: (value: string) => void; placeholder: string };
  actions: Array<{ label: string; weight: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; onClick: () => void }>;
  onCancel: () => void;
}) {
  const field = React.useRef<HTMLInputElement>(null);
  const last = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    (input ? field.current : last.current)?.focus();
    if (input) field.current?.select();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const main = actions[actions.length - 1];
  return createPortal(
    <div
      className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      style={{ animation: 'openfilm-rise 0.16s ease-out both' }}
      onClick={onCancel}
    >
      <div className="w-full max-w-[440px]" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <Card title={title} body={body} onClose={onCancel}>
          {input ? (
            <form
              className="mt-2.5"
              onSubmit={(e) => { e.preventDefault(); if (main && !main.disabled) main.onClick(); }}
            >
              <input
                ref={field}
                value={input.value}
                onChange={(e) => input.onChange(e.target.value)}
                placeholder={input.placeholder}
                maxLength={200}
                onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}
                className="h-8 w-full rounded-lg bg-[var(--surface-2)] px-2.5 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-1 focus:ring-[var(--border-strong)]"
              />
            </form>
          ) : null}
          <CardActions className="flex-wrap">
            {actions.map((a, i) => (
              <CardButton key={a.label} ref={i === actions.length - 1 ? last : undefined} weight={a.weight} disabled={a.disabled} onClick={a.onClick}>
                {a.label}
              </CardButton>
            ))}
          </CardActions>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
