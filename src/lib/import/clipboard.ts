/**
 * Clipboard Paste Helpers for universal product import.
 * Pure browser/DOM utilities with zero server-side or Node dependencies.
 */

export type ClipboardPasteClassification =
  | { kind: "image"; files: File[] }
  | { kind: "url"; url: string }
  | { kind: "ignore" };

/**
 * Checks whether the active DOM element is an editable text field where normal typing/pasting
 * should not be hijacked by the global clipboard listener.
 */
export function isEditablePasteTarget(
  target: EventTarget | null,
  allowedUrlInput?: HTMLInputElement | null,
): boolean {
  if (!target || typeof target !== "object") return false;
  if (allowedUrlInput && target === allowedUrlInput) {
    return false;
  }
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    type?: string;
    readOnly?: boolean;
    disabled?: boolean;
  };
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const inputType = (el.type ?? "text").toLowerCase();
    const nonTextTypes = new Set([
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ]);
    return !nonTextTypes.has(inputType);
  }
  return false;
}

/**
 * Classifies clipboard contents into either pasted image files, a pasted HTTP(S) store URL,
 * or `ignore` for ordinary text.
 */
export function classifyClipboardPaste(input: {
  files?: Iterable<File> | ArrayLike<File> | null;
  text?: string | null;
}): ClipboardPasteClassification {
  if (input.files) {
    const imageFiles = Array.from(input.files).filter((f) =>
      f.type.toLowerCase().startsWith("image/"),
    );
    if (imageFiles.length > 0) {
      return { kind: "image", files: imageFiles };
    }
  }

  const rawText = (input.text ?? "").trim();
  if (!rawText || rawText.length > 2048 || /\s/.test(rawText)) {
    return { kind: "ignore" };
  }

  try {
    const parsed = new URL(rawText);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { kind: "url", url: parsed.toString() };
    }
  } catch {
    // Not a valid URL
  }

  return { kind: "ignore" };
}
