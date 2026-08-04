export const infoProps = (title, body, examples = []) => ({
  title,
  "data-info-title": title,
  "data-info": body,
  ...(examples.length ? { "data-info-examples": JSON.stringify(examples) } : {}),
});
