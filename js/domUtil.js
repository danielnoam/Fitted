// Shared DOM helpers used across the ui/ views.

/** Escapes a string for safe interpolation into an innerHTML template. */
export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

/**
 * Revokes each thumbnail <img>'s blob: object URL once it has finished
 * loading (or failed to). URL.createObjectURL blobs are never garbage
 * collected on their own, so without this, re-rendering the wardrobe grid,
 * match list, or chat thread repeatedly leaks memory for the life of the
 * page. Call this right after assigning innerHTML on any container that may
 * include a blob: image src.
 */
export function revokeBlobImagesOnLoad(root) {
  root.querySelectorAll('img[src^="blob:"]').forEach((img) => {
    const revoke = () => URL.revokeObjectURL(img.src);
    img.addEventListener('load', revoke, { once: true });
    img.addEventListener('error', revoke, { once: true });
  });
}

/** Shows a brief self-dismissing toast message at the bottom of the screen. */
export function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}
