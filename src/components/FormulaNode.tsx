"use client";

import { useRef, useState } from "react";
import { mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type ReactNodeViewProps } from "@tiptap/react";
import { Formula } from "@/components/RichText";
import { MATH_ATTRIBUTE } from "@/lib/editorHtml";
// Layout and fonts of typeset formulas (also loaded by RichText; bundled once).
import "katex/dist/katex.min.css";

/** Source of a formula that was just inserted; the view that shows up with it opens for editing. */
let openOnMount: string | null = null;

/**
 * Inserts a formula at the cursor (replacing the selection) and opens it for editing. A plain
 * function rather than a Tiptap command: a command would need a module augmentation of
 * @tiptap/core, which is not a direct dependency here.
 */
export function insertFormula(editor: Editor, tex: string): void {
  openOnMount = tex;
  editor.chain().focus().insertContent({ type: FormulaNode.name, attrs: { tex, display: false } }).run();
}

/** The source to start editing with, if this view is the one for the formula just inserted. */
function claimFreshlyInserted(tex: string): string | null {
  if (openOnMount === null || openOnMount !== tex) return null;
  openOnMount = null;
  return tex;
}

/**
 * What the card stores cannot hold: `$` ends a formula, and an inline one must fit on one line
 * and touch its delimiters. The same source is shown typeset either way, so nothing is lost.
 */
const clean = (tex: string) => tex.replace(/\$/g, "").replace(/\s*\n\s*/g, " ").trim();

function FormulaView({ node, editor, getPos, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const tex = String(node.attrs.tex);
  const display = Boolean(node.attrs.display);
  // The source being edited; null while the formula is only shown. A view that appears for a
  // formula the toolbar just inserted starts out open.
  const [draft, setDraft] = useState<string | null>(() => claimFreshlyInserted(tex));
  const editing = useRef(draft !== null);

  const open = () => {
    editing.current = true;
    setDraft(tex);
  };

  /** Leaves the editing state. Removing the input fires a blur, which must not finish a second time. */
  const finish = (keep: boolean) => {
    if (!editing.current) return;
    editing.current = false;
    const next = clean(draft ?? "");
    setDraft(null);
    if (!keep) {
      editor.commands.focus();
      return;
    }
    if (!next) {
      deleteNode();
      editor.commands.focus();
      return;
    }
    if (next !== tex) updateAttributes({ tex: next });
    // Back into the text, right behind the formula.
    const pos = getPos();
    if (pos !== undefined) editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
  };

  const Tag = display ? "div" : "span";
  if (draft === null) {
    return (
      <NodeViewWrapper as={Tag} contentEditable={false} className={display ? "block" : "inline"}>
        <Tag
          role="button"
          tabIndex={-1}
          title="Formel bearbeiten"
          onClick={open}
          className={`cursor-pointer rounded-sm px-0.5 ${selected ? "bg-primary/20 ring-2 ring-primary/50" : "hover:bg-base-200"} ${display ? "block" : "inline-block"}`}
        >
          <Formula tex={tex} display={display} />
        </Tag>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as={Tag} contentEditable={false} className={display ? "block" : "inline"}>
      <Tag className={`rounded-field border-2 border-primary bg-base-100 px-2 py-1.5 align-middle ${display ? "block" : "inline-flex flex-col gap-1"}`}>
        <Tag className={`min-h-6 ${display ? "block" : "inline-block"}`}>
          <Formula tex={clean(draft) || "\\;"} display={display} />
        </Tag>
        <span className="flex items-center gap-1">
          <input
            value={draft}
            // The input only exists while editing, so it takes the focus as it appears; the whole source is selected to be replaced by typing.
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finish(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finish(false);
              }
            }}
            aria-label="LaTeX der Formel"
            placeholder="LaTeX, z. B. E = mc^2"
            spellCheck={false}
            autoComplete="off"
            className="input input-sm w-56 max-w-full font-mono text-sm"
          />
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            // Taking the focus would finish the edit; the button only toggles the layout.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => updateAttributes({ display: !display })}
            title={display ? "Als Teil der Zeile zeigen" : "Als eigenen Absatz zeigen"}
          >
            {display ? "Absatz" : "Zeile"}
          </button>
        </span>
      </Tag>
    </NodeViewWrapper>
  );
}

/**
 * A formula in the visual editor, typeset with KaTeX. In the editor's HTML it is an empty
 * <span data-kiku-math="…" data-display="…">, which editorHtml.ts turns into `$…$` or `$$…$$`.
 */
export const FormulaNode = Node.create({
  name: "formula",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      tex: {
        default: "",
        parseHTML: (element) => element.getAttribute(MATH_ATTRIBUTE) ?? "",
        renderHTML: (attributes) => ({ [MATH_ATTRIBUTE]: String(attributes.tex) }),
      },
      display: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-display") === "true",
        renderHTML: (attributes) => ({ "data-display": attributes.display ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${MATH_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaView);
  },
});
