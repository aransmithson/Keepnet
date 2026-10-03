type Props = { height?: number; className?: string };

/**
 * Approved Keepnet brand mark:
 * Rounded green/copper wordmark with the fishing line and hook extending from the final "t".
 */
export default function Logo({ height = 34, className }: Props) {
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
        src="/images/keepnet-logo.png"
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
