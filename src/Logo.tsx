type Props = { height?: number; className?: string };

/** Keepnet wordmark: fish on the line, rod arcing over the name. "Keep" green, "net" copper. */
export default function Logo({ height = 40, className }: Props) {
  return (
    <svg
      className={className}
      height={height}
      viewBox="0 0 520 150"
      role="img"
      aria-label="Keepnet"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Line from hook up to rod tip */}
      <path d="M152 74 C 150 40, 175 34, 230 32 C 300 29, 380 18, 440 16" fill="none" stroke="#014731" strokeWidth="3" strokeLinecap="round" />
      {/* Rod: tapering arc down the right */}
      <path d="M440 16 C 470 14, 488 30, 494 58" fill="none" stroke="#014731" strokeWidth="5" strokeLinecap="round" />
      <path d="M494 58 C 497 72, 498 86, 498 104" fill="none" stroke="#014731" strokeWidth="11" strokeLinecap="round" />
      {/* Rod rings */}
      <circle cx="452" cy="16" r="4" fill="#fff" stroke="#014731" strokeWidth="2.5" />
      <circle cx="475" cy="25" r="4" fill="#fff" stroke="#014731" strokeWidth="2.5" />
      <circle cx="489" cy="40" r="4" fill="#fff" stroke="#014731" strokeWidth="2.5" />

      {/* Hook */}
      <path d="M152 74 v6 a4 4 0 0 1 -8 0" fill="none" stroke="#014731" strokeWidth="2.5" strokeLinecap="round" />

      {/* Fish */}
      <g transform="rotate(-24 110 98)">
        <path d="M64 98 C 84 72, 132 68, 160 96 C 132 122, 84 124, 64 98 Z" fill="#014731" />
        <path d="M70 100 C 96 92, 126 92, 156 97" fill="none" stroke="#F5F3EB" strokeWidth="3" strokeLinecap="round" />
        <path d="M68 98 L 34 78 C 44 92, 44 104, 34 118 Z" fill="#014731" />
      </g>

      {/* Wordmark */}
      <text x="168" y="128" fontFamily="'Nunito', 'Inter', sans-serif" fontWeight="900" fontSize="74" letterSpacing="-1">
        <tspan fill="#014731">Keep</tspan><tspan fill="#C9772B">net</tspan>
      </text>
    </svg>
  );
}
