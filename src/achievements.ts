import type { Catch, Session } from './store';

export type AchievementCategory = 'size' | 'pb' | 'time' | 'catches' | 'species' | 'sessions' | 'social';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'specimen';

export interface SocialStats {
  likesGiven?: number;
  likesReceived?: number;
  sharedCount?: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  tier: BadgeTier;
  icon: string; // emoji or lucide icon name
  flairTitle: string; // title shown on avatar e.g. "Specimen Perch Hunter"
  target: number;
  unit?: string;
  speciesTarget?: string; // for species-specific size milestones
  checkProgress: (catches: Catch[], sessions: Session[], social?: SocialStats) => { current: number; unlocked: boolean };
}

export interface UnlockedAchievement extends AchievementDef {
  unlocked: boolean;
  progress: number; // 0 to 100
  current: number;
}

/** Helper to convert weight to total ounces */
function catchOz(c: Catch): number {
  return (c.weightLb || 0) * 16 + (c.weightOz || 0);
}

/** Helper to convert total ounces to pounds */
function ozToLb(oz: number): number {
  return Math.round((oz / 16) * 10) / 10;
}

/**
 * Historical PB calculation:
 * Iterates chronologically and checks if a catch beat a previously set PB for that species.
 */
export function countBeatenPBs(catches: Catch[]): number {
  const sorted = [...catches].sort(
    (a, b) => new Date(a.caughtAt).getTime() - new Date(b.caughtAt).getTime()
  );
  const currentPBs = new Map<string, number>();
  let count = 0;

  for (const c of sorted) {
    const sp = (c.species || '').toLowerCase().trim();
    if (!sp) continue;
    const weight = catchOz(c);
    if (weight <= 0) continue;

    const prev = currentPBs.get(sp);
    if (prev !== undefined) {
      if (weight > prev) {
        count++;
        currentPBs.set(sp, weight);
      }
    } else {
      // First catch of this species sets the initial baseline, not a "beat"
      currentPBs.set(sp, weight);
    }
  }
  return count;
}

/** Compute total hours on bank */
export function totalBankHours(sessions: Session[]): number {
  return sessions.reduce((total, s) => {
    const start = new Date(s.startedAt).getTime();
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    const hrs = Math.max(0, (end - start) / 3600000);
    return total + hrs;
  }, 0);
}

/**
 * Master Registry of Keepnet Gamified Achievements.
 * Researched UK average fish weights vs specimen thresholds:
 * - Carp: avg ~8-12lb | 10lb (Double) | 20lb (Twenty) | 30lb (Thirty) | 40lb (Monster)
 * - Pike: avg ~6-9lb | 10lb (Hunter) | 20lb (Twenty) | 30lb (Monster)
 * - Perch: avg ~8oz-1lb | 1lb (Stripey) | 2lb (Specimen) | 3lb (Monster)
 * - Chub: avg ~2lb | 3lb (Chevin) | 4lb (Specimen) | 5lb (Trophy)
 * - Barbel: avg ~4lb | 5lb (River) | 8lb (Specimen) | 10lb (Double-figure)
 * - Tench: avg ~3lb | 4lb (Doctor) | 6lb (Specimen) | 8lb (Monster)
 * - Bream: avg ~3lb | 4lb (Slab) | 6lb (Specimen) | 8lb (Barn Door)
 * - Trout: avg ~1.5lb | 2lb (Stalker) | 4lb (Specimen) | 6lb (Trophy)
 * - Grayling: avg ~12oz | 1lb (Lady of Stream) | 2lb (Specimen)
 * - Roach: avg ~6oz | 1lb (Pounder) | 2lb (Specimen Roach)
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Fish Sizes & Specimen Weights ---
  {
    id: 'size_carp_10',
    title: 'Double-Figure Carp',
    description: 'Land a Common, Mirror, or Leather Carp weighing 10 lb or more.',
    category: 'size',
    tier: 'bronze',
    icon: '🐟',
    flairTitle: 'Double-Figure Carp Club',
    target: 10 * 16,
    unit: 'lb',
    speciesTarget: 'Carp',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches
          .filter((c) => c.species.toLowerCase().includes('carp') && !c.species.toLowerCase().includes('crucian'))
          .map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 10 * 16 };
    },
  },
  {
    id: 'size_carp_20',
    title: 'Twenty Club Carp',
    description: 'Catch a specimen Carp of 20 lb or greater.',
    category: 'size',
    tier: 'silver',
    icon: '🏆',
    flairTitle: 'Twenty Club Carp Specimen',
    target: 20 * 16,
    unit: 'lb',
    speciesTarget: 'Carp',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches
          .filter((c) => c.species.toLowerCase().includes('carp') && !c.species.toLowerCase().includes('crucian'))
          .map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 20 * 16 };
    },
  },
  {
    id: 'size_carp_30',
    title: 'Thirty Specimen Carp',
    description: 'Bank a massive 30 lb+ specimen UK Carp.',
    category: 'size',
    tier: 'gold',
    icon: '👑',
    flairTitle: '30lb+ Monster Carp Hunter',
    target: 30 * 16,
    unit: 'lb',
    speciesTarget: 'Carp',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches
          .filter((c) => c.species.toLowerCase().includes('carp') && !c.species.toLowerCase().includes('crucian'))
          .map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 30 * 16 };
    },
  },
  {
    id: 'size_pike_10',
    title: 'Pike Hunter',
    description: 'Catch a Northern Pike weighing 10 lb or more.',
    category: 'size',
    tier: 'bronze',
    icon: '🐊',
    flairTitle: 'Double-Figure Pike Hunter',
    target: 10 * 16,
    unit: 'lb',
    speciesTarget: 'Pike',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('pike')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 10 * 16 };
    },
  },
  {
    id: 'size_pike_20',
    title: 'Twenty-Pound Pike',
    description: 'Land a specimen Northern Pike weighing 20 lb or more.',
    category: 'size',
    tier: 'gold',
    icon: '⚡',
    flairTitle: '20lb+ Specimen Pike Master',
    target: 20 * 16,
    unit: 'lb',
    speciesTarget: 'Pike',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('pike')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 20 * 16 };
    },
  },
  {
    id: 'size_perch_1',
    title: 'Pounder Stripey',
    description: 'Catch a British Perch weighing 1 lb or more.',
    category: 'size',
    tier: 'bronze',
    icon: '🎯',
    flairTitle: 'Pounder Perch Stalker',
    target: 1 * 16,
    unit: 'lb',
    speciesTarget: 'Perch',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('perch')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 1 * 16 };
    },
  },
  {
    id: 'size_perch_2',
    title: 'Specimen 2lb+ Perch',
    description: 'Land a specimen Perch weighing 2 lb or more (true UK trophy).',
    category: 'size',
    tier: 'silver',
    icon: '🔥',
    flairTitle: 'Specimen Perch Hunter',
    target: 2 * 16,
    unit: 'lb',
    speciesTarget: 'Perch',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('perch')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 2 * 16 };
    },
  },
  {
    id: 'size_perch_3',
    title: 'Monster 3lb+ Perch',
    description: 'Land a legendary 3 lb+ stripey monster.',
    category: 'size',
    tier: 'specimen',
    icon: '⭐',
    flairTitle: '3lb+ Monster Perch Master',
    target: 3 * 16,
    unit: 'lb',
    speciesTarget: 'Perch',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('perch')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 3 * 16 };
    },
  },
  {
    id: 'size_barbel_6',
    title: 'River Torpedo Barbel',
    description: 'Land a hard-fighting river Barbel of 6 lb or more.',
    category: 'size',
    tier: 'silver',
    icon: '🌊',
    flairTitle: 'River Barbel Battler',
    target: 6 * 16,
    unit: 'lb',
    speciesTarget: 'Barbel',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('barbel')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 6 * 16 };
    },
  },
  {
    id: 'size_barbel_10',
    title: 'Double-Figure Barbel',
    description: 'Catch an elite 10 lb+ double-figure river Barbel.',
    category: 'size',
    tier: 'gold',
    icon: '🔱',
    flairTitle: 'Double-Figure Barbel King',
    target: 10 * 16,
    unit: 'lb',
    speciesTarget: 'Barbel',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('barbel')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 10 * 16 };
    },
  },
  {
    id: 'size_chub_4',
    title: 'Specimen Chub',
    description: 'Land a specimen river Chub of 4 lb or more.',
    category: 'size',
    tier: 'silver',
    icon: '🍃',
    flairTitle: 'Specimen Chub Stalker',
    target: 4 * 16,
    unit: 'lb',
    speciesTarget: 'Chub',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('chub')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 4 * 16 };
    },
  },
  {
    id: 'size_tench_5',
    title: 'Doctor Fish Tench',
    description: 'Catch a traditional English Tench of 5 lb or more.',
    category: 'size',
    tier: 'silver',
    icon: '🍀',
    flairTitle: 'Specimen Tench Angler',
    target: 5 * 16,
    unit: 'lb',
    speciesTarget: 'Tench',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('tench')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 5 * 16 };
    },
  },
  {
    id: 'size_bream_5',
    title: 'Bronze Slab Bream',
    description: 'Catch a heavyweight Bream slab of 5 lb or more.',
    category: 'size',
    tier: 'bronze',
    icon: '🛡️',
    flairTitle: 'Bronze Slab Hunter',
    target: 5 * 16,
    unit: 'lb',
    speciesTarget: 'Bream',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('bream')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 5 * 16 };
    },
  },
  {
    id: 'size_trout_3',
    title: 'Specimen Trout',
    description: 'Catch a Brown or Rainbow Trout weighing 3 lb or more.',
    category: 'size',
    tier: 'bronze',
    icon: '🪶',
    flairTitle: 'River Trout Stalker',
    target: 3 * 16,
    unit: 'lb',
    speciesTarget: 'Trout',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('trout')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 3 * 16 };
    },
  },
  {
    id: 'size_grayling_1_5',
    title: 'Lady of the Stream',
    description: 'Catch a magnificent specimen Grayling of 1.5 lb or more.',
    category: 'size',
    tier: 'silver',
    icon: '✨',
    flairTitle: 'Lady of the Stream Specimen',
    target: 1.5 * 16,
    unit: 'lb',
    speciesTarget: 'Grayling',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase().includes('grayling')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 1.5 * 16 };
    },
  },
  {
    id: 'size_roach_1',
    title: 'Pounder Redfin Roach',
    description: 'Land a pristine British Roach weighing 1 lb or more.',
    category: 'size',
    tier: 'silver',
    icon: '🪙',
    flairTitle: 'Pounder Redfin Roach',
    target: 1 * 16,
    unit: 'lb',
    speciesTarget: 'Roach',
    checkProgress: (catches) => {
      const best = Math.max(
        0,
        ...catches.filter((c) => c.species.toLowerCase() === 'roach' || c.species.toLowerCase().includes('roach')).map(catchOz)
      );
      return { current: ozToLb(best), unlocked: best >= 1 * 16 };
    },
  },

  // --- Beating Personal Bests (PB) ---
  {
    id: 'pb_first',
    title: 'First Personal Best',
    description: 'Log your very first catch to establish your first baseline PB.',
    category: 'pb',
    tier: 'bronze',
    icon: '🏅',
    flairTitle: 'Personal Best Setter',
    target: 1,
    checkProgress: (catches) => ({
      current: Math.min(1, catches.length),
      unlocked: catches.length >= 1,
    }),
  },
  {
    id: 'pb_smasher_1',
    title: 'PB Smasher',
    description: 'Beat your previously recorded personal best for any species.',
    category: 'pb',
    tier: 'silver',
    icon: '💥',
    flairTitle: 'PB Breaker',
    target: 1,
    checkProgress: (catches) => {
      const beaten = countBeatenPBs(catches);
      return { current: beaten, unlocked: beaten >= 1 };
    },
  },
  {
    id: 'pb_smasher_3',
    title: 'Triple Record Breaker',
    description: 'Smash your personal bests 3 times across your journal.',
    category: 'pb',
    tier: 'gold',
    icon: '🚀',
    flairTitle: 'Triple PB Smasher',
    target: 3,
    checkProgress: (catches) => {
      const beaten = countBeatenPBs(catches);
      return { current: beaten, unlocked: beaten >= 3 };
    },
  },
  {
    id: 'pb_smasher_5',
    title: 'Master of PBs',
    description: 'Beat your personal bests 5 times through skill and dedication.',
    category: 'pb',
    tier: 'specimen',
    icon: '👑',
    flairTitle: 'Master of Personal Bests',
    target: 5,
    checkProgress: (catches) => {
      const beaten = countBeatenPBs(catches);
      return { current: beaten, unlocked: beaten >= 5 };
    },
  },

  // --- Bankside Hours Logged ---
  {
    id: 'hours_5',
    title: 'First Casts',
    description: 'Log 5 hours of bankside angling sessions.',
    category: 'time',
    tier: 'bronze',
    icon: '⏱️',
    flairTitle: 'Bankside Starter',
    target: 5,
    unit: 'hrs',
    checkProgress: (_, sessions) => {
      const hrs = Math.round(totalBankHours(sessions));
      return { current: hrs, unlocked: hrs >= 5 };
    },
  },
  {
    id: 'hours_25',
    title: 'Bankside Regular',
    description: 'Log 25 hours on the water.',
    category: 'time',
    tier: 'silver',
    icon: '🌅',
    flairTitle: 'Dedicated Bankside Angler',
    target: 25,
    unit: 'hrs',
    checkProgress: (_, sessions) => {
      const hrs = Math.round(totalBankHours(sessions));
      return { current: hrs, unlocked: hrs >= 25 };
    },
  },
  {
    id: 'hours_50',
    title: 'Dawn to Dusk',
    description: 'Accumulate 50 hours of bankside fishing logs.',
    category: 'time',
    tier: 'gold',
    icon: '⏳',
    flairTitle: '50-Hour Water Veteran',
    target: 50,
    unit: 'hrs',
    checkProgress: (_, sessions) => {
      const hrs = Math.round(totalBankHours(sessions));
      return { current: hrs, unlocked: hrs >= 50 };
    },
  },
  {
    id: 'hours_100',
    title: 'Century on the Bank',
    description: 'Spend 100 hours enjoying the rivers, lakes, and canals.',
    category: 'time',
    tier: 'specimen',
    icon: '🏆',
    flairTitle: '100-Hour Bankside Legend',
    target: 100,
    unit: 'hrs',
    checkProgress: (_, sessions) => {
      const hrs = Math.round(totalBankHours(sessions));
      return { current: hrs, unlocked: hrs >= 100 };
    },
  },

  // --- Total Catches Logged ---
  {
    id: 'catches_1',
    title: 'First in the Net',
    description: 'Log your very first fish catch in your Keepnet journal.',
    category: 'catches',
    tier: 'bronze',
    icon: '🎣',
    flairTitle: 'First Catch Logged',
    target: 1,
    unit: 'fish',
    checkProgress: (catches) => ({
      current: catches.length,
      unlocked: catches.length >= 1,
    }),
  },
  {
    id: 'catches_10',
    title: 'Net Filler',
    description: 'Log 10 fish in your angling journal.',
    category: 'catches',
    tier: 'bronze',
    icon: '🧺',
    flairTitle: 'Net Filler Club',
    target: 10,
    unit: 'fish',
    checkProgress: (catches) => ({
      current: catches.length,
      unlocked: catches.length >= 10,
    }),
  },
  {
    id: 'catches_25',
    title: 'Silver Keepnet',
    description: 'Log 25 catches across your angling adventures.',
    category: 'catches',
    tier: 'silver',
    icon: '🥈',
    flairTitle: 'Silver Keepnet Angler',
    target: 25,
    unit: 'fish',
    checkProgress: (catches) => ({
      current: catches.length,
      unlocked: catches.length >= 25,
    }),
  },
  {
    id: 'catches_50',
    title: 'Fifty Club',
    description: 'Log 50 fish caught.',
    category: 'catches',
    tier: 'gold',
    icon: '🥇',
    flairTitle: '50-Fish Club',
    target: 50,
    unit: 'fish',
    checkProgress: (catches) => ({
      current: catches.length,
      unlocked: catches.length >= 50,
    }),
  },
  {
    id: 'catches_100',
    title: 'Century of Fish',
    description: 'Log 100 fish in your Keepnet journal.',
    category: 'catches',
    tier: 'specimen',
    icon: '💎',
    flairTitle: 'Century Catch Master',
    target: 100,
    unit: 'fish',
    checkProgress: (catches) => ({
      current: catches.length,
      unlocked: catches.length >= 100,
    }),
  },

  // --- Species Diversity ---
  {
    id: 'species_2',
    title: 'Pair of Species',
    description: 'Catch and log at least 2 distinct species of fish.',
    category: 'species',
    tier: 'bronze',
    icon: '🌱',
    flairTitle: 'Species Explorer',
    target: 2,
    unit: 'species',
    checkProgress: (catches) => {
      const sp = new Set(catches.map((c) => c.species.toLowerCase().trim()).filter(Boolean));
      return { current: sp.size, unlocked: sp.size >= 2 };
    },
  },
  {
    id: 'species_4',
    title: 'Species Hunter',
    description: 'Catch and log 4 different fish species.',
    category: 'species',
    tier: 'silver',
    icon: '🧭',
    flairTitle: 'Species Hunter',
    target: 4,
    unit: 'species',
    checkProgress: (catches) => {
      const sp = new Set(catches.map((c) => c.species.toLowerCase().trim()).filter(Boolean));
      return { current: sp.size, unlocked: sp.size >= 4 };
    },
  },
  {
    id: 'species_6',
    title: 'All-Round Angler',
    description: 'Land 6 different species (coarse, predator, game, or specimen).',
    category: 'species',
    tier: 'gold',
    icon: '🗺️',
    flairTitle: 'All-Round Master Angler',
    target: 6,
    unit: 'species',
    checkProgress: (catches) => {
      const sp = new Set(catches.map((c) => c.species.toLowerCase().trim()).filter(Boolean));
      return { current: sp.size, unlocked: sp.size >= 6 };
    },
  },
  {
    id: 'species_10',
    title: 'UK Grand Slam',
    description: 'Catch 10 different species across British waters.',
    category: 'species',
    tier: 'specimen',
    icon: '👑',
    flairTitle: 'UK Grand Slam Legend',
    target: 10,
    unit: 'species',
    checkProgress: (catches) => {
      const sp = new Set(catches.map((c) => c.species.toLowerCase().trim()).filter(Boolean));
      return { current: sp.size, unlocked: sp.size >= 10 };
    },
  },

  // --- Sessions Logged ---
  {
    id: 'sessions_1',
    title: 'Maiden Session',
    description: 'Complete your first fishing session.',
    category: 'sessions',
    tier: 'bronze',
    icon: '📌',
    flairTitle: 'Keepnet Angler',
    target: 1,
    unit: 'session',
    checkProgress: (_, sessions) => ({
      current: sessions.length,
      unlocked: sessions.length >= 1,
    }),
  },
  {
    id: 'sessions_5',
    title: 'Bankside Habit',
    description: 'Log 5 complete fishing sessions.',
    category: 'sessions',
    tier: 'silver',
    icon: '🗓️',
    flairTitle: 'Dedicated Session Angler',
    target: 5,
    unit: 'sessions',
    checkProgress: (_, sessions) => ({
      current: sessions.length,
      unlocked: sessions.length >= 5,
    }),
  },
  {
    id: 'sessions_15',
    title: 'Waterfront Veteran',
    description: 'Log 15 fishing sessions across seasons and swims.',
    category: 'sessions',
    tier: 'gold',
    icon: '🎖️',
    flairTitle: 'Waterfront Veteran',
    target: 15,
    unit: 'sessions',
    checkProgress: (_, sessions) => ({
      current: sessions.length,
      unlocked: sessions.length >= 15,
    }),
  },

  // --- Community, Social & Catch Report Likes ---
  {
    id: 'social_like_1',
    title: 'First Tight Lines',
    description: 'Give your first like or reaction to a fellow angler’s catch report.',
    category: 'social',
    tier: 'bronze',
    icon: '❤️',
    flairTitle: 'Friendly Angler',
    target: 1,
    unit: 'like',
    checkProgress: (_, __, social) => ({
      current: social?.likesGiven || 0,
      unlocked: (social?.likesGiven || 0) >= 1,
    }),
  },
  {
    id: 'social_like_5',
    title: 'River Encourager',
    description: 'Give 5 likes to fellow anglers to cheer on their bankside successes.',
    category: 'social',
    tier: 'bronze',
    icon: '👏',
    flairTitle: 'River Encourager',
    target: 5,
    unit: 'likes',
    checkProgress: (_, __, social) => ({
      current: social?.likesGiven || 0,
      unlocked: (social?.likesGiven || 0) >= 5,
    }),
  },
  {
    id: 'social_like_15',
    title: 'Bankside Supporter',
    description: 'Give 15 likes across community catch reports to show support.',
    category: 'social',
    tier: 'silver',
    icon: '🤝',
    flairTitle: 'Bankside Supporter',
    target: 15,
    unit: 'likes',
    checkProgress: (_, __, social) => ({
      current: social?.likesGiven || 0,
      unlocked: (social?.likesGiven || 0) >= 15,
    }),
  },
  {
    id: 'social_like_30',
    title: 'Community Pillar',
    description: 'Award 30 likes celebrating other anglers’ catches and specimens.',
    category: 'social',
    tier: 'gold',
    icon: '🌟',
    flairTitle: 'Community Pillar',
    target: 30,
    unit: 'likes',
    checkProgress: (_, __, social) => ({
      current: social?.likesGiven || 0,
      unlocked: (social?.likesGiven || 0) >= 30,
    }),
  },
  {
    id: 'social_like_50',
    title: 'The Respect of the Bank',
    description: 'Award 50 likes to community catches, embodying true bankside camaraderie.',
    category: 'social',
    tier: 'specimen',
    icon: '👑',
    flairTitle: 'Bankside Legend',
    target: 50,
    unit: 'likes',
    checkProgress: (_, __, social) => ({
      current: social?.likesGiven || 0,
      unlocked: (social?.likesGiven || 0) >= 50,
    }),
  },
  {
    id: 'social_share_1',
    title: 'Public Catch Reporter',
    description: 'Share your first catch report publicly to the Discover map and community.',
    category: 'social',
    tier: 'bronze',
    icon: '📣',
    flairTitle: 'Catch Reporter',
    target: 1,
    unit: 'report',
    checkProgress: (catches, _, social) => {
      const shared = (social && typeof social.sharedCount === 'number')
        ? social.sharedCount
        : catches.filter((c) => c.isShared).length;
      return { current: shared, unlocked: shared >= 1 };
    },
  },
  {
    id: 'social_share_5',
    title: 'Waterfront Correspondent',
    description: 'Share 5 catch reports publicly to inspire fellow anglers.',
    category: 'social',
    tier: 'silver',
    icon: '📰',
    flairTitle: 'Waterfront Correspondent',
    target: 5,
    unit: 'reports',
    checkProgress: (catches, _, social) => {
      const shared = (social && typeof social.sharedCount === 'number')
        ? social.sharedCount
        : catches.filter((c) => c.isShared).length;
      return { current: shared, unlocked: shared >= 5 };
    },
  },
  {
    id: 'social_received_1',
    title: 'Catch of the Swim',
    description: 'Receive your first like on a shared catch report from the community.',
    category: 'social',
    tier: 'bronze',
    icon: '🔥',
    flairTitle: 'Admired Angler',
    target: 1,
    unit: 'like',
    checkProgress: (_, __, social) => ({
      current: social?.likesReceived || 0,
      unlocked: (social?.likesReceived || 0) >= 1,
    }),
  },
  {
    id: 'social_received_10',
    title: 'Respected Angler',
    description: 'Accumulate 10 total likes across your shared catch reports.',
    category: 'social',
    tier: 'silver',
    icon: '✨',
    flairTitle: 'Respected Angler',
    target: 10,
    unit: 'likes',
    checkProgress: (_, __, social) => ({
      current: social?.likesReceived || 0,
      unlocked: (social?.likesReceived || 0) >= 10,
    }),
  },
  {
    id: 'social_received_25',
    title: 'Specimen Sensation',
    description: 'Accumulate 25 total likes across your shared catch reports.',
    category: 'social',
    tier: 'gold',
    icon: '💎',
    flairTitle: 'Specimen Sensation',
    target: 25,
    unit: 'likes',
    checkProgress: (_, __, social) => ({
      current: social?.likesReceived || 0,
      unlocked: (social?.likesReceived || 0) >= 25,
    }),
  },
];

/** Evaluate all achievements against active journal state and social interactions */
export function evaluateAchievements(
  catches: Catch[],
  sessions: Session[],
  social?: SocialStats
): UnlockedAchievement[] {
  return ACHIEVEMENTS.map((def) => {
    const { current, unlocked } = def.checkProgress(catches, sessions, social);
    const currentInTargetUnits = def.category === 'size' && def.unit === 'lb' ? current * 16 : current;
    const progress = Math.min(100, Math.round((currentInTargetUnits / def.target) * 100));
    return {
      ...def,
      current,
      unlocked,
      progress,
    };
  });
}

/** Get the currently equipped achievement badge for the user avatar */
export function getEquippedAchievement(equippedId?: string | null, unlockedList?: UnlockedAchievement[]): UnlockedAchievement | undefined {
  if (!unlockedList || unlockedList.length === 0) return undefined;
  if (equippedId) {
    const found = unlockedList.find((a) => a.id === equippedId && a.unlocked);
    if (found) return found;
  }
  // Default to highest tier unlocked achievement
  const tierOrder: Record<BadgeTier, number> = { specimen: 4, gold: 3, silver: 2, bronze: 1 };
  const unlockedOnly = unlockedList.filter((a) => a.unlocked);
  if (unlockedOnly.length === 0) return undefined;

  return unlockedOnly.sort((a, b) => tierOrder[b.tier] - tierOrder[a.tier])[0];
}
