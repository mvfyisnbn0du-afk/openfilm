'use client';

/**
 * Opens an attachment to look at it, for both the composer's pending attachments and
 * those in sent messages. A tile only shows that something is there; this shows which one.
 *
 * Uses the shared PreviewFrame shell. Unknown types say they cannot be previewed rather
 * than show a broken preview.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { PREVIEW_BTN, PreviewFrame, previewMediaFit } from './PreviewFrame';
import { POPOVER_CHROME } from './ComposerCard';
import { chatLayer } from '@/lib/chat-layer';
import { previewTop } from '@/lib/preview-top';
import { Tooltip } from './Tooltip';
import { attachmentIcon, attachmentKind } from '@/lib/project-resources';
import { useT } from '@/i18n';
import { prettyJsonSource } from '@/lib/pretty-json';

export interface AttachmentPreviewItem {
  name: string;
  /**
   * How it is sent to the model, not what it is; that comes from the name (see attachmentKind).
   *
   * Images go into the message, everything else only as a path. The preview does not
   * use this to choose a player: an mp4 is a document here.
   */
  kind: 'image' | 'document';
  /** A data URL, or any address the browser can open. */
  url: string;
  mediaType?: string;
  /**
   * Only a thumbnail, not the original.
   *
   * The case for sent messages: the original went to the agent's workspace, and only a
   * copy at most 320px square is kept. It is shown at its own size with a note, not
   * stretched, so it is not mistaken for the original's quality.
   */
  thumbOnly?: boolean;
}

/**
 * An attachment's type icon, the same in the composer, in sent messages and in the
 * assets list (see attachmentIcon in project-resources).
 */
export function AttachmentTypeIcon({
  file,
  size,
  className,
}: {
  file: { name: string; mediaType?: string };
  size: number;
  className?: string;
}) {
  const Icon = attachmentIcon(file);
  return <Icon size={size} className={className} />;
}

/** Extensions shown as plain text. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'srt', 'vtt', 'log',
  'xml', 'yml', 'yaml', 'js', 'ts', 'tsx', 'jsx', 'css', 'html',
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

type Body = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'none';

/**
 * Which player opens the attachment.
 *
 * The kind comes from the name (as in the assets list), then the extension for pdf and
 * plain text. A thumbnail is always an image: the kept copy is a webp even when the
 * original is an `.mp4`, and a `<video>` playing an image shows black.
 */
function bodyOf(item: AttachmentPreviewItem): Body {
  if (item.thumbOnly) return 'image';
  const kind = attachmentKind(item);
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'audio';
  const ext = extensionOf(item.name);
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'none';
}

/**
 * A PDF needs a blob URL.
 *
 * Chrome does not load data: documents in an iframe (nor in top-level navigation): a
 * data URL in `src` shows blank without an error. The same bytes as a blob: URL work.
 */
function useBlobUrl(dataUrl: string, enabled: boolean): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!enabled || !dataUrl.startsWith('data:')) {
      setUrl(enabled ? dataUrl : null);
      return undefined;
    }
    let objectUrl: string | null = null;
    fetch(dataUrl)
      .then((response) => response.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dataUrl, enabled]);
  return url;
}

export function AttachmentPreview({
  item,
  onClose,
}: {
  item: AttachmentPreviewItem;
  onClose: () => void;
}) {
  const t = useT();
  const body = bodyOf(item);
  /* a picture, the original or the thumbnail kept with a sent message: the light viewer */
  if (body === 'image') return <ImageViewer key={item.url} item={item} onClose={onClose} />;
  const Icon = attachmentIcon(item);
  /* Video has its own shape. Audio and documents get a fixed reading area. */
  const onStage = body === 'video';

  return (
    <PreviewFrame
      name={item.name}
      onClose={onClose}
      icon={<Icon size={15} className="shrink-0 text-white/45" />}
      /* Video fits its own shape, so the black backdrop hugs the picture; a light surround
         makes a frame look darker. Text gets a fixed reading area on the paper color, laid
         out from the top left, not centered. */
      fit={onStage}
      bodyClassName={onStage ? 'bg-black' : 'bg-[var(--surface-2)]'}
      actions={
        <Tooltip label={t('assets.download')} side="bottom">
          <a
            href={item.url}
            download={item.name}
            aria-label={t('assets.download')}
            className={`${PREVIEW_BTN} w-8 px-0`}
          >
            <Download size={14} />
          </a>
        </Tooltip>
      }
    >
      <div
        className={`min-h-0 flex-1 overflow-auto ${
          body === 'text' || body === 'pdf' ? 'block' : 'flex items-center justify-center'
        }`}
      >
        <PreviewBody item={item} body={body} />
      </div>
    </PreviewFrame>
  );
}

/**
 * A picture opened to look at it: the window dimmed, the picture at its own size in the middle (at most nine tenths of
 * the window, never enlarged), a × to close; Esc and a click beside it close it too. Downloading it is in its
 * right-click menu. A thumbnail kept with a sent message says so under it, and has no Download: a 320px copy under the
 * original's name would be taken for the original.
 */
function ImageViewer({ item, onClose }: { item: AttachmentPreviewItem; onClose: () => void }) {
  const t = useT();
  /** where its right-click menu is open, or null */
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const menuRef = React.useRef(menu);
  menuRef.current = menu;
  React.useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.focus({ preventScroll: true });
    /* Esc closes the menu first, then the picture; nothing under it takes the key */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (menuRef.current) setMenu(null);
      else closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={item.name}
      className="fixed inset-0 z-[10100] flex flex-col items-center justify-center gap-3 bg-black/75 outline-none"
      style={{ paddingTop: previewTop(navigator.platform), WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={() => (menu ? setMenu(null) : onClose())}
      onContextMenu={(event) => { event.preventDefault(); setMenu(null); }}>
      <button type="button" onClick={onClose} aria-label={t('assets.close')}
        className="absolute right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 transition hover:bg-black/60 hover:text-white"
        /* below the window's own buttons, which Windows draws over the top right (preview-top) */
        style={{ top: previewTop(navigator.platform) }}>
        <X size={16} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={item.name} draggable={false}
        className="block max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
        onClick={(event) => { event.stopPropagation(); setMenu(null); }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenu(item.thumbOnly ? null : { x: event.clientX, y: event.clientY });
        }} />
      {item.thumbOnly ? <p className="max-w-[90vw] text-center text-[11.5px] text-white/60">{t('composer.thumbOnly')}</p> : null}
      {menu ? (
        <div role="menu" className="fixed min-w-[140px] p-1" style={{ ...POPOVER_CHROME, left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}>
          <a role="menuitem" href={item.url} download={item.name} onClick={() => setMenu(null)}
            className="flex h-7 items-center gap-2 rounded-[6px] px-2 text-[13px] text-[var(--text)] hover:bg-[var(--bg-hover)]">
            <Download size={13} />{t('assets.download')}
          </a>
        </div>
      ) : null}
    </div>,
    chatLayer(),
  );
}

function PreviewBody({ item, body }: { item: AttachmentPreviewItem; body: Body }) {
  const t = useT();
  const pdfUrl = useBlobUrl(item.url, body === 'pdf');

  if (body === 'video') return <VideoPreview item={item} />;
  if (body === 'audio') return <AudioPreview item={item} />;
  if (body === 'pdf') {
    if (!pdfUrl) return <div className="h-full" />;
    return <iframe src={pdfUrl} title={item.name} className="h-full w-full" />;
  }
  if (body === 'text') return <TextPreview dataUrl={item.url} name={item.name} />;

  /* No preview, but still the type's icon, so a .zip and an .xlsx look different. */
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)]">
        <AttachmentTypeIcon file={item} size={30} className="text-[var(--text-faint)]" />
      </div>
      <p className="text-[12.5px] text-[var(--text-muted)]">{t('assets.noPreview')}</p>
    </div>
  );
}

/**
 * A video.
 *
 * The size is measured, not passed in: an attachment is only a URL, so its orientation
 * is known once the metadata arrives.
 *
 * Until then it reserves 16:9. Before metadata a `<video>` reports 300×150, and the box
 * fits it, so it would flash small and then jump. Most videos are 16:9; a vertical one
 * reflows once, while still black.
 */
function VideoPreview({ item }: { item: AttachmentPreviewItem }) {
  const t = useT();
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return <p className="p-10 text-[12.5px] text-white/60">{t('assets.previewFailed')}</p>;
  }
  return (
    <video
      src={item.url}
      controls
      playsInline
      preload="metadata"
      style={previewMediaFit(size?.w ?? 16, size?.h ?? 9)}
      onLoadedMetadata={(event) => {
        const el = event.currentTarget;
        if (el.videoWidth > 0 && el.videoHeight > 0) {
          setSize({ w: el.videoWidth, h: el.videoHeight });
        }
      }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Audio: no picture, so an icon and a player on the paper color.
 */
function AudioPreview({ item }: { item: AttachmentPreviewItem }) {
  const t = useT();
  const Icon = attachmentIcon(item);
  const [failed, setFailed] = React.useState(false);

  return (
    <div className="flex w-full flex-col items-center gap-5 p-10">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)]">
        <Icon size={30} className="text-[var(--text-faint)]" />
      </div>
      {failed ? (
        <p className="text-[12.5px] text-[var(--text-muted)]">{t('assets.previewFailed')}</p>
      ) : (
        <audio src={item.url} controls preload="metadata" className="w-full max-w-[480px]" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function TextPreview({ dataUrl, name }: { dataUrl: string; name: string }) {
  const t = useT();
  const [text, setText] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setText(null);
    setFailed(false);
    // fetch decodes data URLs too: base64 and UTF-8 handled by the browser; atob would break non-ASCII text.
    fetch(dataUrl)
      .then((response) => response.text())
      .then((body) => {
        if (alive) setText(prettyJsonSource(name, body));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [dataUrl, name]);

  if (failed) {
    return <p className="p-10 text-[12.5px] text-[var(--text-muted)]">{t('assets.previewFailed')}</p>;
  }
  if (text === null) return <div className="h-[200px]" />;
  return (
    <pre className="w-full whitespace-pre-wrap break-words p-5 font-mono text-[12px] leading-relaxed text-[var(--text)]">
      {text}
    </pre>
  );
}
