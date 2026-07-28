export const sourceDiagnostic = (source, message, severity = "error") => {
  const text = String(source || "");
  const firstLineEnd = text.indexOf("\n");
  return {
    from: 0,
    to: Math.max(0, firstLineEnd === -1 ? Math.min(text.length, 1) : firstLineEnd),
    severity,
    message: String(message || "Invalid source"),
  };
};

export const validateJavascriptEditorSource = (
  source,
  { expression = false, label = "JavaScript" } = {},
) => {
  const text = String(source || "");
  if (!text.trim()) return [sourceDiagnostic(text, `${label} source is required.`)];
  try {
    if (expression) {
      new Function(`return (${text})`);
    } else {
      new Function(text);
    }
    return [];
  } catch (error) {
    return [sourceDiagnostic(
      text,
      `${label} does not compile: ${error?.message || "syntax error"}`,
    )];
  }
};
