# Published scene references

The static Underscores app can open a scene from a URL without embedding media
or relying on a compressed hash. Add a `scene` query parameter to the app URL:

```text
https://languel.github.io/paideia/static/underscores/?scene=../../coursework/26sp/dda367/board/26sp-dda367-w01.scene.json
```

The value is resolved relative to the Underscores page, so a relative path is
usually the best choice when the Quartz site and the app share an origin. An
absolute `https://` URL also works when the host returns a permissive CORS
header. The loader accepts:

- a raw Excalidraw JSON document (`.json` or `.excalidraw`), or
- Markdown containing a fenced JSON block with an Excalidraw document.

The document needs an `elements` array. `type: "excalidraw"` is recommended;
the loader supplies it when it is omitted. Underscores metadata may be carried
in the normal top-level `underscores` envelope and object `customData` fields.
Remote scene references are media-free by design: the top-level Excalidraw
`files` map is discarded, while authored media URLs and file names remain so
the source catalog can show missing files and offer relinking.

The rendered Quartz HTML page is not itself a scene source. Quartz should
publish either the raw Markdown or, preferably, a sidecar JSON file next to the
page. The sidecar should be a standard Excalidraw document and must not contain
large binary `files` data. For the board page in this workspace, the preferred
asset is:

```text
coursework/26sp/dda367/board/26sp-dda367-w01.scene.json
```

If a raw Markdown source is published instead, keep the scene in a fenced block
such as:

````markdown
```excalidraw
{"type":"excalidraw","elements":[],"appState":{},"underscores":{}}
```
````

The query loader fetches with credentials omitted, enforces an HTTP(S) URL and
a 20 MB source limit, then passes the normalized document through the ordinary
scene importer. A failed fetch or a Markdown page without a scene document is
reported in the app status rather than silently replacing the current scene.

