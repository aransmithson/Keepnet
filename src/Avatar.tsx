import { User } from 'lucide-react';

/** Public identity only: never substitute a different angler's photograph. */
export default function Avatar({ name, photo, size = 36, className = '', label }: {
  name?: string; photo?: string; size?: number; className?: string; label?: string;
}) {
  const publicName = name?.trim();
  const initials = publicName?.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={`angler-avatar ${className}`} role="img" aria-label={label || publicName || 'Angler'} style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * .36)) }}>
    {photo ? <img src={photo} alt="" /> : initials ? <span aria-hidden="true">{initials}</span> : <User size={Math.round(size * .5)} aria-hidden="true" />}
  </span>;
}
