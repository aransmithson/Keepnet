import { useTheme } from './theme';

type Props = { height?: number; className?: string };

/**
 * Modern Keepnet Brand Logo:
 * Features a minimalist curved fish leaping above a circular keepnet mesh ring,
 * with the net handle extending horizontally to form an underline beneath the "Keepnet" text.
 * Dynamically adapts between light and dark modes with transparent background.
 */
export default function Logo({ height = 44, className }: Props) {
  const theme = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      className={`keepnet-logo-wrap ${className ?? ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height,
      }}
    >
      <img
        src={isDark ? '/images/keepnet-logo-dark.png' : '/images/keepnet-logo-light.png'}
        alt="Keepnet"
        className="keepnet-logo-img"
        style={{
          height: `${height}px`,
          width: 'auto',
          maxHeight: `${height}px`,
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  );
}
