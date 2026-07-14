// File/camera picker handling via a hidden <input type="file" capture>.
// No native camera viewfinder — delegates to the OS picker.

let hiddenInput = null;

function getHiddenInput() {
  if (hiddenInput) return hiddenInput;
  hiddenInput = document.createElement('input');
  hiddenInput.type = 'file';
  hiddenInput.accept = 'image/*';
  hiddenInput.setAttribute('capture', 'environment');
  hiddenInput.style.display = 'none';
  document.body.appendChild(hiddenInput);
  return hiddenInput;
}

/**
 * Opens the OS file/camera picker and resolves with the selected File,
 * or null if the user cancels (best-effort — 'cancel' isn't universally
 * fired, so this relies on the change event only firing on a real pick).
 */
export function pickImage() {
  return new Promise((resolve) => {
    const input = getHiddenInput();
    const onChange = () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.value = '';
      input.removeEventListener('change', onChange);
      resolve(file);
    };
    input.addEventListener('change', onChange);
    input.click();
  });
}
