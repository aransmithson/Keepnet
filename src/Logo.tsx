type Props = { height?: number; className?: string };

/**
 * Minimalist, elegant Keepnet brand mark.
 * "Keep" in heritage forest green (#014731) and "net" in warm copper (#C9772B).
 */
export default function Logo({ height = 32, className }: Props) {
  return (
    <svg
      className={className}
      height={height}
      viewBox="0 0 215 42"
      role="img"
      aria-label="Keepnet"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      {/* Minimalist Fish & Water Ripple Icon */}
      <g transform="translate(4, 5)">
        {/* Fish silhouette */}
        <path d="M 4 15 C 11 6, 23 6, 30 15 C 23 24, 11 24, 4 15 Z" fill="#014731" />
        <path d="M 4 15 L -2 9 L -2 21 Z" fill="#014731" />
        <circle cx="23" cy="14" r="1.8" fill="#F5F3EB" />
        {/* Copper water ripple */}
        <path d="M 2 25 C 12 28, 20 25, 30 28" fill="none" stroke="#C9772B" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* Elegant Editorial Wordmark */}
      <text
        x="48"
        y="28"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize="28"
        letterSpacing="-0.3"
      >
        <tspan fill="#014731">Keep</tspan>
        <tspan fill="#C9772B">net</tspan>
      </text>
    </svg>
  );
}
