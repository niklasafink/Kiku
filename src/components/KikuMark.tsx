import { useId, type SVGProps } from "react";

/**
 * The Kiku mark: a bold K whose lower leg is the green check stroke. Same drawing as
 * src/app/icon.svg; the rounded corners are part of the picture, so it needs no wrapper.
 */
export function KikuMark(props: SVGProps<SVGSVGElement>) {
  // Gradient ids must be unique when the mark appears more than once on a page.
  const gradient = useId();
  return (
    <svg viewBox="0 0 512 512" aria-hidden {...props}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6c62ff" />
          <stop offset="1" stopColor="#4a3ee0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill={`url(#${gradient})`} />
      <g strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M168 132v248" stroke="#fff" />
        <path d="M344 132L200 266" stroke="#fff" />
        <path d="M200 266l144 118" stroke="#2fc48d" />
      </g>
    </svg>
  );
}
