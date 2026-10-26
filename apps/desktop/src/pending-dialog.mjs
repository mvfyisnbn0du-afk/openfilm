let confirming = false;

/** A cancelled discard restores queue dispatch; hidden macOS windows cannot host a visible sheet. */
export async function confirmPendingDiscard({ window, options, suspend, showMessageBox }) {
  if (confirming) return false;
  confirming = true;
  let discard = false;
  try {
    suspend(true);
    const result = await (window?.isVisible() ? showMessageBox(window, options) : showMessageBox(options));
    discard = result.response === 0;
    return discard;
  } finally {
    confirming = false;
    if (!discard) suspend(false);
  }
}
