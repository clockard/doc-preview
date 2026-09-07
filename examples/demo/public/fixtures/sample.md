# Markdown fixture

Rendered with **react-markdown**, GFM enabled, and `rehype-sanitize` guarding
against untrusted HTML.

## Formatting

*Emphasis*, **strong**, ~~struck through~~, `inline code`, and a [link](https://example.com).

> A blockquote, for the vertical rhythm.

## Table

| Format | Library | Fidelity |
| ------ | ------- | -------: |
| PDF    | pdfjs-dist | High |
| DOCX   | docx-preview | High |
| XLSX   | exceljs | High |
| PPTX   | pptxtojson | ~80% |

## Task list

- [x] Detect the format from bytes
- [x] Sanitize untrusted markup
- [ ] Ship it

## Code

```ts
const kind = await resolveKind({ mimeType, url, data })
```

## Injection check

The next line is raw HTML and must render inert, not execute:

<img src=x onerror="alert('xss')">
