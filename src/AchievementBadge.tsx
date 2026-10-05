import { Award, CalendarDays, Clock, Crown, Fish, Heart, MapPin, MessageCircle, Target, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { UnlockedAchievement } from './achievements';
import { createElement } from 'react';
import './AchievementsPage.css';

function iconFor(item: UnlockedAchievement): LucideIcon {
  if (item.tier === 'specimen') return Crown;
  if (item.category === 'social') return item.id.includes('share') ? MessageCircle : item.id.includes('received') ? Users : Heart;
  if (item.category === 'species') return Target;
  if (item.category === 'sessions') return item.target === 1 ? MapPin : CalendarDays;
  if (item.category === 'time') return Clock;
  if (item.category === 'pb') return Award;
  return item.category === 'catches' && item.target >= 10 ? Trophy : Fish;
}

export default function AchievementBadge({ item, selected = false, size, className = '' }: {
  item: UnlockedAchievement; selected?: boolean; size?: number; className?: string;
}) {
  return <span className={`angler-medallion tier-${item.tier} ${item.unlocked ? 'earned' : 'unearned'} ${selected ? 'selected' : ''} ${className}`} aria-hidden="true" style={size ? { width: size, height: size } : undefined}>
    {createElement(iconFor(item), { strokeWidth: 1.65 })}
  </span>;
}
