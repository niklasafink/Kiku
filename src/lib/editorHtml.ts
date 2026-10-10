// Card text as HTML for the visual editor, and back. The editor works on HTML; cards stay the
// Markdown subset described in richText.ts, so nothing else has to know about the editor.
import { htmlToMarkdown } from "./html";
import { IMAGE_SCHEME, imageMarkup, parseBlocks, type Inline } from "./richText";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Attribute that carries a picture's id through the editor; its src is only a temporary object URL. */
export const IMAGE_ID_ATTRIBUTE = "data-kiku-id";

function inlineHtml(inlines: Inline[], srcOf: (id: string) => string): string {
  return inlines
    .map((inline) => {
      switch (inline.type) {
        case "text":
          return escapeHtml(inline.text).replace(/\n/g, "<br>");
        case "bold":
          return `<strong>${inlineHtml(inline.children, srcOf)}</strong>`;
        case "italic":
          return `<em>${inlineHtml(inline.children, srcOf)}</em>`;
        case "mark":
          return `<mark>${inlineHtml(inline.children, srcOf)}</mark>`;
        case "code":
          return `<code>${escapeHtml(inline.text)}</code>`;
        case "math":
          // Formulas are edited as their source; the preview and the study view typeset them.
          return escapeHtml(inline.display ? `$$${inline.tex}$$` : `$${inline.tex}$`);
        case "image":
          return `<img src="${escapeHtml(srcOf(inline.id))}" alt="${escapeHtml(inline.alt)}" ${IMAGE_ID_ATTRIBUTE}="${escapeHtml(inline.id)}">`;
      }
    })
    .join("");
}

export function markdownToEditorHtml(text: string, srcOf: (id: string) => string): string {
  return parseBlocks(text)
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return `<p>${inlineHtml(block.inlines, srcOf)}</p>`;
        case "heading":
          return `<h${block.level === 3 ? 3 : 2}>${inlineHtml(block.inlines, srcOf)}</h${block.level === 3 ? 3 : 2}>`;
        case "math":
          return `<p>${escapeHtml(`$$${block.tex.replace(/\s*\n\s*/g, " ")}$$`)}</p>`;
        case "list": {
          // Items carry their depth; lists nest by opening and closing as the depth changes.
          const tag = block.ordered ? "ol" : "ul";
          const first = block.ordered ? parseInt(block.items[0].marker, 10) || 1 : 1;
          let html = "";
          let depth = -1;
          for (const item of block.items) {
            if (item.depth > depth) {
              while (depth < item.depth) {
                html += depth === -1 && first !== 1 ? `<${tag} start="${first}">` : `<${tag}>`;
                depth++;
              }
            } else {
              html += "</li>";
              while (depth > item.depth) {
                html += `</${tag}></li>`;
                depth--;
              }
            }
            html += `<li><p>${inlineHtml(item.inlines, srcOf)}</p>`;
          }
          while (depth-- >= 0) html += `</li></${tag}>`;
          return html;
        }
        case "table": {
          const row = (cells: Inline[][], cell: string) =>
            `<tr>${cells.map((c) => `<${cell}><p>${inlineHtml(c, srcOf)}</p></${cell}>`).join("")}</tr>`;
          return `<table><tbody>${row(block.header, "th")}${block.rows.map((r) => row(r, "td")).join("")}</tbody></table>`;
        }
      }
    })
    .join("");
}

export function editorHtmlToMarkdown(html: string): string {
  return htmlToMarkdown(html, (_src, attribute) => {
    const id = attribute(IMAGE_ID_ATTRIBUTE);
    if (!id) return "";
    // The alternative text can carry the boxes of an occlusion card; it must not get lost.
    const alt = (attribute("alt") ?? "").replace(/[\]\n]/g, "");
    return `\n\n${alt ? `![${alt}](${IMAGE_SCHEME}${id})` : imageMarkup(id)}\n\n`;
  });
}
