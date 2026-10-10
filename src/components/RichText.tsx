"use client";

import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { imageUrl } from "@/lib/images";
// Layout and fonts of typeset formulas.
import "katex/dist/katex.min.css";
import { parseOcclusion, type Occlusion } from "@/lib/occlusion";
import { imageRefs, parseBlocks, type Inline } from "@/lib/richText";

/**
 * Where pictures come from when the cards are not the viewer's own (a shared deck): a URL that
 * the picture's id is appended to. Without it, pictures are read from this device and the account.
 */
export const ImageBase = createContext<string | null>(null);

/** A picture stored for a card. Shows a placeholder while loading and when it cannot be found. */
export function CardImage({ id, alt, className = "" }: { id: string; alt?: string; className?: string }) {
  const base = useContext(ImageBase);
  const [url, setUrl] = useState<string | null | undefined>(base ? `${base}${id}` : undefined);
  useEffect(() => {
    if (base) return;
    let active = true;
    void imageUrl(id).then((found) => {
      if (active) setUrl(found);
    });
    return () => {
      active = false;
    };
  }, [id, base]);

  if (url) {
    // Object URL of a locally stored picture; nothing for next/image to optimise.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt || "Bild der Karte"} className={`max-h-[28rem] max-w-full rounded-field ${className}`} />;
  }
  return (
    <span
      className={`inline-flex h-24 w-36 items-center justify-center rounded-field bg-base-200 text-xs opacity-70 ${url === undefined ? "skeleton" : ""} ${className}`}
    >
      {url === null && (
        <>
          <ImageOff className="mr-1.5 size-4" aria-hidden /> Bild fehlt
        </>
      )}
    </span>
  );
}

/**
 * A picture with parts covered. The box that is asked for stands out; on the solution side it
 * is uncovered and framed, so the eye finds the spot the answer belongs to.
 */
export function OccludedImage({ id, occlusion }: { id: string; occlusion: Occlusion }) {
  return (
    <span className="relative my-1 inline-block max-w-full align-top">
      <CardImage id={id} alt="Bild mit abgedeckten Stellen" className="block" />
      {occlusion.boxes.map((box, i) => {
        const asked = i === occlusion.asked;
        const tone =
          asked && occlusion.revealed
            ? "border-success bg-transparent"
            : asked
              ? "border-primary bg-primary text-primary-content"
              : "border-base-content/20 bg-base-300";
        return (
          <span
            key={i}
            className={`absolute grid place-items-center rounded-[4px] border-2 text-sm font-black ${tone}`}
            style={{ left: `${box.x / 10}%`, top: `${box.y / 10}%`, width: `${box.w / 10}%`, height: `${box.h / 10}%` }}
            aria-hidden
          >
            {asked && !occlusion.revealed && "?"}
          </span>
        );
      })}
    </span>
  );
}

type Katex = typeof import("katex").default;
let katex: Promise<Katex> | undefined;

/** A formula, typeset once the renderer has loaded; until then (and if it cannot be read) its source. */
export function Formula({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    // Loaded on first use: most cards have no formulas.
    katex ??= import("katex").then((module) => module.default);
    void katex.then((renderer) => {
      if (!active) return;
      try {
        setHtml(renderer.renderToString(tex, { displayMode: display, throwOnError: true, output: "htmlAndMathml" }));
      } catch {
        setHtml(null);
      }
    });
    return () => {
      active = false;
    };
  }, [tex, display]);

  const Tag = display ? "div" : "span";
  if (html === null) return <Tag className={`font-mono text-[0.92em] ${display ? "overflow-x-auto" : ""}`}>{tex}</Tag>;
  // KaTeX escapes its input and is not asked to trust it, so the markup it returns is safe to insert.
  return <Tag className={display ? "overflow-x-auto py-1" : ""} dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderInline(inlines: Inline[]): ReactNode {
  return inlines.map((inline, i) => {
    switch (inline.type) {
      case "text":
        return <Fragment key={i}>{inline.text}</Fragment>;
      case "bold":
        return <strong key={i}>{renderInline(inline.children)}</strong>;
      case "italic":
        return <em key={i}>{renderInline(inline.children)}</em>;
      case "mark":
        return (
          <mark key={i} className="rounded-sm bg-warning/40 px-0.5 text-inherit">
            {renderInline(inline.children)}
          </mark>
        );
      case "code":
        return (
          <code key={i} className="rounded-sm bg-base-200 px-1 py-0.5 font-mono text-[0.92em]">
            {inline.text}
          </code>
        );
      case "math":
        return <Formula key={i} tex={inline.tex} display={inline.display} />;
      case "image": {
        const occlusion = parseOcclusion(inline.alt);
        if (occlusion) return <OccludedImage key={i} id={inline.id} occlusion={occlusion} />;
        return <CardImage key={i} id={inline.id} alt={inline.alt} className="my-1 block" />;
      }
    }
  });
}

const HEADING = { 1: "text-xl font-black", 2: "text-lg font-extrabold", 3: "font-extrabold" } as const;
const INDENT = ["", "ml-5", "ml-10", "ml-[3.75rem]"];

/** Renders a card text: formatting, lists, tables and pictures. Plain text looks as it always did. */
export function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 break-words ${className}`}>
      {parseBlocks(text).map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={i} className="whitespace-pre-wrap">
                {renderInline(block.inlines)}
              </p>
            );
          case "heading":
            return (
              <p key={i} role="heading" aria-level={block.level + 2} className={HEADING[block.level]}>
                {renderInline(block.inlines)}
              </p>
            );
          case "list":
            return (
              <ul key={i} className="flex flex-col gap-1">
                {block.items.map((item, j) => (
                  <li key={j} className={`flex gap-2 ${INDENT[item.depth]}`}>
                    <span className="shrink-0 font-bold tabular-nums opacity-60" aria-hidden={!block.ordered}>
                      {item.marker}
                    </span>
                    <span className="min-w-0">{renderInline(item.inlines)}</span>
                  </li>
                ))}
              </ul>
            );
          case "math":
            return <Formula key={i} tex={block.tex} display />;
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="table-sm table w-auto border-2 border-base-300 font-normal">
                  <thead>
                    <tr>
                      {block.header.map((cell, c) => (
                        <th key={c} className="bg-base-200 text-base-content">
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} className="align-top">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

/** Only the pictures of a text, e.g. below a graded solution, which is shown as plain text. */
export function CardImages({ text, className = "" }: { text: string; className?: string }) {
  const images = imageRefs(text);
  if (images.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {images.map((image, i) => {
        const occlusion = parseOcclusion(image.alt);
        return occlusion ? (
          <OccludedImage key={`${image.id}-${i}`} id={image.id} occlusion={occlusion} />
        ) : (
          <CardImage key={`${image.id}-${i}`} id={image.id} />
        );
      })}
    </div>
  );
}
