// Shared enums + limits used across capture/wardrobe/AI views.

export const CATEGORIES = ['top', 'bottom', 'outerwear', 'shoes', 'accessory'];
export const PATTERNS = ['solid', 'patterned'];

// Caps applied to free-text fields before they're written to IndexedDB,
// whether typed by hand or suggested by an AI provider's reply.
export const MAX_SUBCATEGORY_LENGTH = 60;
export const MAX_NOTES_LENGTH = 500;
