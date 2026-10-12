/**
 * The media pane's top bar at the pane's width: the fullest form that fits, worked out from what its words measure in
 * the person's language and font, not from guessed widths. As the pane narrows, the search's hint shortens ("Search
 * media" → "Search"), then Upload loses its word, then the search becomes a button that opens over the bar. The
 * square buttons (view, filter, sort, new folder, close) always stay.
 */

/** What the words measure, in px, at the bar's type. */
export interface BarWords {
  /** The search's hint, whole and short. */
  hint: number;
  shortHint: number;
  /** Upload's word. */
  upload: number;
}

export interface BarLayout {
  /** The search as a field (else a button). */
  field: boolean;
  /** The field's hint whole (else short). */
  wholeHint: boolean;
  /** Upload with its word (else its icon). */
  uploadWord: boolean;
  /** Tighter padding and gaps: the narrowest form. */
  tight: boolean;
}

/** A square button. */
export const BAR_BUTTON = 28;
/* the search field around its hint: padding 8 + icon 13 + gap 6 + padding 8, and room for the caret */
const FIELD_CHROME = 39;
/* the clear button, while something is typed */
const CLEAR = 18;
/* Upload around its word: padding 10 + icon 13 + gap 6 + padding 10 */
const UPLOAD_CHROME = 39;

/** The fullest bar that fits `width` px, with `buttons` square buttons after Upload; `typed`: the search has text. */
export function barLayout(width: number, words: BarWords, buttons: number, typed: boolean): BarLayout {
  const forms: BarLayout[] = [
    { field: true, wholeHint: true, uploadWord: true, tight: false },
    { field: true, wholeHint: false, uploadWord: true, tight: false },
    { field: true, wholeHint: true, uploadWord: false, tight: false },
    { field: true, wholeHint: false, uploadWord: false, tight: false },
  ];
  for (const form of forms) if (barWidth(form, words, buttons, typed) <= width) return form;
  return { field: false, wholeHint: false, uploadWord: false, tight: true };
}

/** What a form of the bar needs, padding and gaps included. */
export function barWidth(form: BarLayout, words: BarWords, buttons: number, typed: boolean): number {
  const pad = form.tight ? 16 : 20;
  const gap = form.tight ? 2 : 4;
  const search = form.field ? FIELD_CHROME + (form.wholeHint ? words.hint : words.shortHint) + (typed ? CLEAR : 0) : BAR_BUTTON;
  const upload = form.uploadWord ? UPLOAD_CHROME + words.upload : BAR_BUTTON;
  return Math.ceil(pad + search + upload + buttons * BAR_BUTTON + (buttons + 1) * gap);
}
