import { useTheme } from './theme';

type Props = { height?: number; className?: string };

/**
 * Modern Keepnet Brand Logo:
 * Features a minimalist curved fish leaping above a circular keepnet mesh ring
 * with crisp modern typography. Dynamically adapts between light and dark modes.
 */
export default function Logo({ height = 34, className }: Props) {
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
        src={isDark ? '/images/keepnet-logo-dark.jpg' : '/images/keepnet-logo-light.jpg'}
        alt="Keepnet"
        className="keepnet-logo-img"
        style={{
          height: `${height}px`,
          width: 'auto',
          maxHeight: `${height}px`,
          objectFit: 'contain',
          display: 'block',
          borderRadius: '4px',
        }}
      />
    </div>
  );
}
