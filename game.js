'use strict';

/* ============================== CONFIG / TRANSFORM ==============================
   Original CMU Graphics program used a 400x400 canvas. To fill a laptop's 16:9
   screen edge-to-edge (grass and both players spanning the full width, not just
   a centered sub-region) the playfield is stretched non-uniformly: X maps the
   full 0-400 range onto the full 0-1280 canvas width, Y maps it onto the full
   0-720 height. Every position constant below is ported straight from the
   Python source through toX()/toY(), so the whole field layout redistributes
   across the wider canvas automatically with no per-constant changes needed.
   Because X and Y now scale by different factors, horizontal speeds/deltas use
   lenX() and vertical ones use lenY() (aliased as toLen() for brevity) so the
   ball's flight time across the new, wider distance still matches the original
   feel instead of falling short of the batter. */
const CANVAS_W = 1280;
const CANVAS_H = 720;
const SCALE_X = CANVAS_W / 400; // 3.2
const SCALE_Y = CANVAS_H / 400; // 1.8

function toX(x) { return x * SCALE_X; }
function toY(y) { return y * SCALE_Y; }
function lenX(n) { return n * SCALE_X; }
function lenY(n) { return n * SCALE_Y; }
const toLen = lenY;

// Touch devices get an entirely separate menu flow and on-screen control
// scheme (see the 'mobile*' screens and drawMobileControls()) instead of the
// desktop keyboard/mouse UI - desktop behavior is untouched either way. The
// ?mobile=1 / ?mobile=0 URL override exists purely for testing without real
// touch hardware; real players always hit the detection below.
// Deliberately NOT touch-capability based (navigator.maxTouchPoints /
// 'ontouchstart' in window) - that was tried and reverted, because it's
// unreliable in both directions: plenty of desktop/laptop screens report
// touch support even though they're driven by mouse+keyboard (false
// mobile), and a phone browser explicitly requesting the desktop site
// (e.g. Chrome iOS's "Request Desktop Website") can suppress those same
// signals (false desktop). A user-agent check for an actual mobile OS is
// the standard, more reliable signal for "is this really a phone/tablet" -
// and correctly still shows desktop when the browser is deliberately
// pretending to be one, which is what that browser setting is for.
const MOBILE_OVERRIDE = new URLSearchParams(location.search).get('mobile');
const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Windows Phone/i;
const IS_MOBILE = MOBILE_OVERRIDE !== null
  ? MOBILE_OVERRIDE === '1'
  : MOBILE_UA_RE.test(navigator.userAgent);

const ICONS = 'assets/icons/';
const PORTRAITS = 'assets/portraits/';

/* ============================== CHARACTER ROSTER ==============================
   Order matches the Solo-mode unlock progression (see PROGRESSION_ORDER,
   derived directly from this array's order below) - Antman first (unlocked
   by default), Scientist last, everything else in between exactly as
   specified for the progression system. Browsing (A/D, arrow keys) on every
   select screen, and the CPU roster's beat-the-previous-one order, all just
   fall out of this array order for free. */
const CHARACTERS = [
  { key: 'antman', name: 'Antman', color: '#4caf50', portrait: PORTRAITS + 'antman.png',
    bat: { key: 'expandShot', label: 'Ball Expand', icon: ICONS + 'ball_expand.png' },
    pitch: { key: 'ballShrink', label: 'Ball Shrink', icon: ICONS + 'ball_shrink.png' } },
  { key: 'bruiser', name: 'The Bruiser', color: '#d1263f', portrait: PORTRAITS + 'bruiser.png',
    bat: { key: 'guaranteedContact', label: 'Guaranteed Contact', icon: ICONS + 'guaranteed_contact.png' },
    pitch: { key: 'fastballPlus', label: 'Fastball Plus', icon: ICONS + 'fastball_plus.png' } },
  { key: 'iceman', name: 'Iceman', color: '#8fe0ff', portrait: PORTRAITS + 'iceman.png',
    bat: { key: 'iceShield', label: 'Ice Shield', icon: ICONS + 'ice_shield.png' },
    pitch: { key: 'iceBall', label: 'Ice Ball', icon: ICONS + 'ice_ball.png' } },
  { key: 'gambler', name: 'The Gambler', color: '#f0c020', portrait: PORTRAITS + 'gambler.png',
    bat: { key: 'gamblerBatting', label: "Gambler's Roll", icon: ICONS + 'dice_batting.png' },
    pitch: { key: 'gamblerPitching', label: "Gambler's Roll", icon: ICONS + 'dice_pitching.png' } },
  { key: 'trickster', name: 'The Trickster', color: '#9b59d0', portrait: PORTRAITS + 'trickster.png',
    bat: { key: 'mirrorBall', label: 'Mirror Ball', icon: ICONS + 'mirror_ball.png' },
    pitch: { key: 'ghost', label: 'Ghost Ball', icon: ICONS + 'ghost.png' } },
  // color is the lighter UI/name-text shade (kept legible on the select
  // screen); the uniform sprite itself is recolored much darker - see
  // recolor.py.
  { key: 'shadow', name: 'The Shadow', color: '#5a5a63', portrait: PORTRAITS + 'shadow.png',
    bat: { key: 'blackoutSwing', label: 'Blackout Swing', icon: ICONS + 'blackout_swing.png' },
    pitch: { key: 'void', label: 'The Void', icon: ICONS + 'void.png' } },
  { key: 'oracle', name: 'The Oracle', color: '#2e8b74', portrait: PORTRAITS + 'oracle.png',
    bat: { key: 'futureSight', label: 'Future Sight', icon: ICONS + 'future_sight.png' },
    pitch: { key: 'mirage', label: 'Mirage', icon: ICONS + 'mirage.png' } },
  { key: 'pyro', name: 'The Pyro', color: '#ff7a1a', portrait: PORTRAITS + 'pyro.png',
    bat: { key: 'fire', label: 'Fire', icon: ICONS + 'fire.png' },
    pitch: { key: 'meteor', label: 'Meteor', icon: ICONS + 'meteor.png' } },
  { key: 'strategist', name: 'The Strategist', color: '#d626b0', portrait: PORTRAITS + 'strategist.png',
    bat: { key: 'pause', label: 'Pause', icon: ICONS + 'pause.png' },
    pitch: { key: 'spinCycle', label: 'Spin Cycle', icon: ICONS + 'spin_cycle.png' } },
  { key: 'scientist', name: 'The Scientist', color: '#2b6fe0', portrait: PORTRAITS + 'scientist.png',
    bat: { key: 'timeStop', label: 'Time Stop', icon: ICONS + 'time_stop.png' },
    pitch: { key: 'droneBall', label: 'Drone Ball', icon: ICONS + 'drone_ball.png' } },
];

// Solo mode opponent dialogue (requested) - shown via showDialog() with the
// character's own portrait/name in place of Coach's. intro fires at match
// start, win/lose fires right after the 3rd out of the final inning (see
// startMatch()/switchSides()).
const OPPONENT_LINES = {
  pyro: {
    intro: "Hope you brought a fire extinguisher, because you're about to get torched.",
    win: 'Told you. Ashes to ashes.',
    lose: "Impossible... I burn everything I touch!",
  },
  trickster: {
    intro: "Nothing you see out here is real. Not even this smile.",
    win: 'Boo. You never even saw it coming.',
    lose: 'Ah, clever... you saw through the trick. Fine, take it.',
  },
  scientist: {
    intro: "I've calculated this outcome eleven different ways. You lose in all of them.",
    win: 'As predicted. The math never lies.',
    lose: "That's... not in any of my models. Recalculating.",
  },
  shadow: {
    intro: "By the time you realize you can't see, it'll already be over.",
    win: 'Darkness wins. It always does.',
    lose: "Even I didn't see that one coming.",
  },
  gambler: {
    intro: "Life's a gamble, kid. Let's see what you're really made of.",
    win: 'House always wins, baby!',
    lose: 'Ha! Snake eyes. Can\'t complain — I knew the risk.',
  },
  strategist: {
    intro: 'I already know your next three moves. Try to surprise me.',
    win: 'Exactly as planned. You were never in control.',
    lose: '...Interesting. You broke the pattern. Noted for next time.',
  },
  antman: {
    intro: "Big or small, doesn't matter — you're outmatched either way.",
    win: 'Guess size does matter after all.',
    lose: 'Shrinking my ego right along with the ball... nice hit.',
  },
  iceman: {
    intro: "Get comfortable. You're about to be frozen solid.",
    win: 'Cold enough for you? Game over.',
    lose: "Huh. Guess I'm not as cool as I thought.",
  },
  oracle: {
    intro: "I've already seen how this ends. Don't bother trying to change it.",
    win: 'Foreseen. As always.',
    lose: "Strange... the future isn't always written after all.",
  },
  bruiser: {
    intro: 'Step up to the plate, kid! My fastballs don\'t just clear the fence, they leave a crater!',
    win: 'That\'s what raw power does.',
    lose: "Tch. Didn't think you had that kind of strength in you. Respect.",
  },
};

/* ============================== PROGRESSION / UNLOCKS (Solo mode only) ==============================
   Solo mode gates both rosters behind progress instead of leaving every
   character freely selectable: the player unlocks characters by completing
   specific in-game feats (see PLAYER_UNLOCK_CONDITIONS), while the CPU
   roster unlocks strictly in order, one slot at a time, by beating whichever
   CPU character is currently faced (see PROGRESSION_ORDER). CPU difficulty
   is no longer a manual picker - it's derived from the chosen CPU
   character's rank in that same order (characterDifficultyIndex()).
   Versus mode is untouched by any of this - every character stays freely
   selectable there, as today. */
// Derived straight from CHARACTERS' own order (see that array's own comment)
// rather than a second hardcoded list, so the two can never drift apart.
const PROGRESSION_ORDER = CHARACTERS.map(c => c.key);
// 3 easy, 4 medium, 3 hard, indexed by a character's position in PROGRESSION_ORDER.
const CPU_DIFFICULTY_BY_RANK = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2];
// Shown under a locked player character card - see drawPortraitCard()'s
// contentLocked branch. null means "unlocked by default" (never shown locked).
const PLAYER_UNLOCK_CONDITIONS = {
  antman: null,
  bruiser: 'Hit your first home run',
  iceman: 'Strike out 25 batters total',
  gambler: 'Win a game after trailing by 3+ runs',
  trickster: 'Hit a grand slam',
  shadow: 'Win a game without using a single power-up',
  oracle: 'Get a hit off every pitch type in one inning',
  pyro: 'Score 10 runs in a single game',
  strategist: 'Win a game allowing zero hits while pitching',
  scientist: 'Win a game with each of the other 9 characters',
};

function characterName(key) {
  const c = CHARACTERS.find(ch => ch.key === key);
  return c ? c.name : key;
}
// Most locked-card condition text is the static string above, but Iceman's
// is cumulative and worth showing live progress on (e.g. "(9/25)") so the
// player can see how close they are - everything else is either a one-shot
// event or scoped to a single game/inning, where a running counter wouldn't
// mean much.
function playerUnlockConditionText(key) {
  if (key === 'iceman') {
    return 'Strike out 25 batters total (' + Math.min(saveData.stats.totalStrikeouts, 25) + '/25)';
  }
  return PLAYER_UNLOCK_CONDITIONS[key];
}
// A locked CPU card's condition text is dynamic (depends on whichever CPU
// character sits one rank below it), unlike the player's static conditions
// above.
function cpuUnlockConditionText(key) {
  const rank = PROGRESSION_ORDER.indexOf(key);
  if (rank <= 0) return null; // rank 0 (antman) is unlocked by default
  return 'Beat ' + characterName(PROGRESSION_ORDER[rank - 1]) + ' to unlock';
}
function characterDifficultyIndex(key) {
  const rank = PROGRESSION_ORDER.indexOf(key);
  return CPU_DIFFICULTY_BY_RANK[rank] ?? 1;
}

/* ============================== CURRENCY / UPGRADES (Solo mode only) ==============================
   A second, parallel progression track on top of the condition-based unlocks
   above: the player earns Coins by winning solo matches (or watching a
   rewarded ad) and spends them on permanent pitching/batting upgrades and on
   buying locked player characters outright. All tunable - retune freely
   after playtesting. */
const WIN_BASE_COINS = 50;
const WIN_COINS_PER_RUN = 5; // solo win reward = WIN_BASE_COINS + (human's own score) * this
const AD_REWARD_COINS = 40; // flat reward per fully-watched rewarded ad

const PITCH_UPGRADE_COST = [150, 300]; // cost of level 1 and level 2, same for all 4 pitch types AND both the Zone/Speed tracks
// Contact/Power levels are 1-5, not 0-5 - level 1 is the free starting point
// (nothing bought yet), so there are only 4 purchasable steps (1->2, 2->3,
// 3->4, 4->5). Costs here line up with those 4 steps, in order.
const BATTING_UPGRADE_COST = [90, 135, 200, 300];
// crosshairRadius/criticalRadius scale from level 1 (free baseline, same
// radius the game always used) up to level 5, in the same unit-space toLen()
// takes (see baseCrosshairRadius()/baseCriticalRadius() below). Level 5
// Contact is calibrated to match what used to be the old level-2 value
// (toLen(14)) and level 5 Power to the old level-3 value (toLen(5)) - both
// intentionally toned down from the previous 0-5 scale's top end, which ran
// all the way to toLen(18.5)/toLen(6).
const CONTACT_RADIUS_STEP = 0.75; // (14 - 11) / 4 steps
const POWER_RADIUS_STEP = 0.375; // (5 - 3.5) / 4 steps
// Indexed by PROGRESSION_ORDER position; index 0 (antman) is free/unbuyable.
const PLAYER_BUY_COST_BY_RANK = [null, 200, 350, 500, 650, 800, 950, 1100, 1300, 1500];

// Every throw's Easy/Normal/Hard tier now comes from where the pitch-timing
// meter's indicator lands (see the meter-tick code in update() and the WASD
// branch in handleGameplayKey()), not a fixed shop purchase. These two
// tracks instead make that meter itself more forgiving for one pitch type:
// Zone widens the good zone/shrinks the bad zone; Speed slows the sweep down
// (more reaction time). Solo only - versus/CPU/tutorial always use level 0.
const PITCH_ZONE_LEVELS = [
  { good: 0.05, bad: 0.20 }, // level 0: good zone 10% wide, bad 20% off each end
  { good: 0.08, bad: 0.15 }, // level 1: good 16%, bad 15% off each end
  { good: 0.11, bad: 0.10 }, // level 2: good 22%, bad 10% off each end
];
const PITCH_SPEED_LEVELS = [35, 45, 58]; // ticks for the indicator to sweep one-way, by level (40 ticks/sec ~= 0.9s/1.1s/1.5s round trip)
function pitchZoneLevel(baseType) {
  return app.mode === 'solo' ? saveData.pitchUpgrades[baseType.toLowerCase()].zone : 0;
}
function pitchSpeedLevel(baseType) {
  return app.mode === 'solo' ? saveData.pitchUpgrades[baseType.toLowerCase()].speed : 0;
}
// 'good'/'okay'/'bad', read at the exact instant the confirm click/tap lands
// - see confirmArmedPitch(). Good is centered on the meter (pos 0.5); bad is
// the outer edges (widths from PITCH_ZONE_LEVELS, upgraded per pitch type);
// everything left over in between is okay.
function pitchMeterZone(type) {
  const { good, bad } = PITCH_ZONE_LEVELS[pitchZoneLevel(type)];
  const pos = app.pitchMeterPos;
  if (Math.abs(pos - 0.5) <= good) return 'good';
  if (pos <= bad || pos >= 1 - bad) return 'bad';
  return 'okay';
}
function baseCrosshairRadius() {
  return app.mode === 'solo' ? toLen(11 + (saveData.battingUpgrades.contact - 1) * CONTACT_RADIUS_STEP) : toLen(11);
}
function baseCriticalRadius() {
  return app.mode === 'solo' ? toLen(3.5 + (saveData.battingUpgrades.power - 1) * POWER_RADIUS_STEP) : toLen(3.5);
}
function characterBuyCost(key) {
  const rank = PROGRESSION_ORDER.indexOf(key);
  return PLAYER_BUY_COST_BY_RANK[rank] ?? null;
}
// Buys a locked player character outright, bypassing its unlock condition.
// Unlike unlockCharacter()'s other callers, a purchase is announced right on
// the card itself (the silhouette lifts immediately) rather than through the
// post-game unlockReveal screen, so the queued app.newlyUnlocked entry is
// popped back off right away.
function buyPlayerCharacter(key) {
  const cost = characterBuyCost(key);
  if (!cost || isPlayerUnlocked(key) || saveData.coins < cost) return false;
  saveData.coins -= cost;
  unlockCharacter('player', key);
  app.newlyUnlocked.pop();
  persistSaveData();
  return true;
}

const SAVE_KEY = 'heroBallSave';
function defaultSaveData() {
  return {
    version: 1,
    playerUnlocked: { antman: true },
    cpuUnlocked: { antman: true },
    tournamentTrophies: {}, // character key -> true, set by handleTournamentProgression() on a championship run
    // Baby mode (requested): a brand-new player's very first game gets a
    // much slower, near-straight version of every pitch (see cpuPitch()'s
    // babySet) instead of normal CPU pitching, so early batting struggles
    // don't compound with everything else that's new. Covers the whole
    // first game unconditionally, ending permanently once it's over - see
    // evaluateGameEndUnlocks().
    babyModeDone: false,
    stats: {
      everHitHomeRun: false,
      totalStrikeouts: 0,
      winsWithCharacter: {}, // character key -> true, tracked for the 9 non-Scientist characters
    },
    coins: 0,
    // Every pitch's actual Easy/Normal/Hard tier now comes from the live
    // timing meter (see PITCH_ZONE_LEVELS/PITCH_SPEED_LEVELS/handleGameplayKey()),
    // not a fixed purchase - these two tracks per pitch type instead buy a more
    // forgiving meter for that type: zone widens the good/shrinks the bad
    // zone, speed slows the sweep down so there's more time to react. Each 0-2.
    pitchUpgrades: {
      fastball: { zone: 0, speed: 0 }, curveball: { zone: 0, speed: 0 },
      riser: { zone: 0, speed: 0 }, knuckleball: { zone: 0, speed: 0 },
    },
    battingUpgrades: { contact: 1, power: 1 }, // each 1-5 - level 1 is the free starting point, not a purchase
  };
}
// Clamps a saved Contact/Power level into the current 1-5 range - guards
// against an older save's 0 (that scale used to start at 0) ending up below
// the new minimum and producing a negative/undersized radius.
function clampBattingUpgradeLevel(value) {
  return Math.max(1, Math.min(5, Number(value) || 1));
}
// Same idea for the pitch Zone/Speed tracks (0-2 each, see PITCH_ZONE_LEVELS/
// PITCH_SPEED_LEVELS) - guards a saved value that's missing/out of range.
function clampPitchUpgradeLevel(value) {
  return Math.max(0, Math.min(2, Number(value) || 0));
}
// Merges saved data over a fresh set of defaults (rather than trusting the
// saved object's shape completely) so a save from before a future stat gets
// added doesn't come back missing that field and crash the first time it's
// read - and falls back to defaults entirely if the stored value isn't even
// valid JSON.
function loadSaveData() {
  const fresh = defaultSaveData();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw);
    return {
      version: fresh.version,
      playerUnlocked: Object.assign({}, fresh.playerUnlocked, saved.playerUnlocked),
      cpuUnlocked: Object.assign({}, fresh.cpuUnlocked, saved.cpuUnlocked),
      tournamentTrophies: Object.assign({}, fresh.tournamentTrophies, saved.tournamentTrophies),
      // A save from before baby mode existed has no field for it at all -
      // treat that as "already past their first game" (true), not as a
      // brand-new player who'd otherwise get baby mode retroactively applied
      // to a save that's clearly not their first game.
      babyModeDone: saved.babyModeDone === undefined ? true : !!saved.babyModeDone,
      stats: {
        everHitHomeRun: !!(saved.stats && saved.stats.everHitHomeRun),
        totalStrikeouts: (saved.stats && saved.stats.totalStrikeouts) || 0,
        winsWithCharacter: Object.assign({}, saved.stats && saved.stats.winsWithCharacter),
      },
      coins: Math.max(0, Number(saved.coins) || 0),
      // Bug fix (migration): older saves stored a single 0/1/2 tier number per
      // pitch type (the old fixed-tier shop) instead of today's {zone, speed}
      // pair - Object.assign alone would just overwrite the fresh {zone,speed}
      // default with that bare number, breaking every read of .zone/.speed.
      // Carry an old numeric level into the zone track (the closer analog of
      // "pitches came out better") and leave speed at 0, so past purchases
      // still count for something instead of silently vanishing.
      pitchUpgrades: Object.fromEntries(Object.keys(fresh.pitchUpgrades).map(type => {
        const savedVal = saved.pitchUpgrades && saved.pitchUpgrades[type];
        if (typeof savedVal === 'number') return [type, { zone: clampPitchUpgradeLevel(savedVal), speed: 0 }];
        return [type, {
          zone: clampPitchUpgradeLevel(savedVal && savedVal.zone),
          speed: clampPitchUpgradeLevel(savedVal && savedVal.speed),
        }];
      })),
      battingUpgrades: {
        contact: clampBattingUpgradeLevel(saved.battingUpgrades && saved.battingUpgrades.contact),
        power: clampBattingUpgradeLevel(saved.battingUpgrades && saved.battingUpgrades.power),
      },
    };
  } catch (e) {
    return fresh;
  }
}
function persistSaveData() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData)); } catch (e) { /* storage unavailable/full - progress just won't persist this session */ }
}
let saveData = loadSaveData();
function isPlayerUnlocked(key) { return !!saveData.playerUnlocked[key]; }
function isCpuUnlocked(key) { return !!saveData.cpuUnlocked[key]; }
// Flips a character to unlocked (if it wasn't already) and queues it for the
// post-game unlockReveal screen (see app.newlyUnlocked). Callers are
// responsible for calling persistSaveData() afterward - left out here so a
// caller flipping several unlocks in a row (evaluateGameEndUnlocks()) only
// writes to localStorage once.
function unlockCharacter(type, key) {
  const store = type === 'player' ? saveData.playerUnlocked : saveData.cpuUnlocked;
  if (store[key]) return false;
  store[key] = true;
  app.newlyUnlocked.push({ type, key, name: characterName(key) });
  return true;
}

const KNUCKLE_CHAOS_END_X = 280; // knuckleball bounces chaotically before this x, then corrects into the zone (0-400 units)
const KNUCKLE_ZONE_TARGET_Y = 277; // corrective phase steers toward dead-center of the strike zone (265-290)

const DIFFICULTY_COLORS = ['#4dff4d', '#ffe14d', '#ff4d4d'];
const FULL_POWER_STOPS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

/* ============================== ASSETS ============================== */
// Bug fix: local asset files (icons/portraits/effects) get swapped by hand
// during development, but the browser was caching them by URL alone with no
// cache-busting - replacing a PNG on disk didn't show up without a hard
// refresh. Stamp every local asset load with the current time so it's always
// re-fetched fresh. Leave remote (http/https) URLs alone - they're static,
// externally-hosted, and don't need this.
// See effects.js's loadEffectImage() for what window.__pokiAssetsToTrack is for.
window.__pokiAssetsToTrack = window.__pokiAssetsToTrack || [];

function loadImage(src) {
  const img = new Image();
  img.src = /^https?:\/\//.test(src) ? src : src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
  window.__pokiAssetsToTrack.push(img);
  return img;
}

const batIcons = {};
const pitchIcons = {};
const portraits = {};
// Dedicated art for the mode-select screen's fanned-out character lineup
// (drawCharacterShowcase) - separate from the character-select portrait
// cards (drawPortraitCard/assets/portraits/) so each can use different art.
// Falls back to the regular portrait per-character until a menu_characters/
// image with that character's key actually exists.
const MENU_CHARACTERS_DIR = 'assets/menu_characters/';
const menuCharacterImages = {};
CHARACTERS.forEach(c => {
  batIcons[c.key] = loadImage(c.bat.icon);
  pitchIcons[c.key] = loadImage(c.pitch.icon);
  portraits[c.key] = loadImage(c.portrait);
  menuCharacterImages[c.key] = loadImage(MENU_CHARACTERS_DIR + c.key + '.png');
});

function menuCharacterImage(key) {
  const img = menuCharacterImages[key];
  return (img.complete && img.naturalWidth) ? img : portraits[key];
}

// The tutorial's dialogue-box guide - a coach character who "walks in" over
// a dimmed screen whenever there's instructional text to show. See
// drawTutorialOverlay().
const COACH_IMG = loadImage(PORTRAITS + 'coach_tutorial.png');

/* ============================== MENU SCREEN DRESSING ============================== */
// Everything below is purely decorative for the title/mode-select screen:
// a dusk-lit field backdrop, slow-drifting themed particles, a fanned
// lineup of all 10 characters with their own color glow, and a poster-style
// title with a half-fire/half-ice ball icon. Particle drift and the
// showcase's float/pulse are driven by elapsed real time (Date.now()), not
// per-tick state, since update() only runs for the 'play' screen - this way
// they animate smoothly on the menu without needing a step function hooked
// into that loop.
const MENU_LOAD_TIME = Date.now();

// Dusk/golden-hour sky fading into a darker infield, replacing drawStadium()
// (the bright daytime sky used everywhere else) just for this screen.
function drawMenuBackground() {
  // One continuous sky-to-grass gradient instead of a sky gradient plus a
  // separate, hard-edged grass rect painted on top of it - the dark twilight
  // sky now eases into green over a real blend zone rather than cutting
  // straight from purple to solid green. Stops need custom (non-even)
  // positions, so this builds the gradient directly instead of going through
  // the evenly-spaced linearGradient() helper.
  // Green needs to be established by toY(215)/CANVAS_H = 387/720 = 0.5375 -
  // the highest the showcased characters' feet ever reach (see
  // drawCharacterShowcase's bandCy/stagger/float math) - so the blend
  // finishes right around there instead of somewhere arbitrary.
  // Bug fix: this used to have both '#2a1f3d' at 0.35 AND a "lighter" purple
  // '#3d2c52' at 0.45 right after it - since #2a1f3d is actually darker than
  // #3d2c52, brightness dipped down then back up again before ever reaching
  // green, a non-monotonic reversal that reads as a visible dark
  // line/band right at the dip. One dusky-purple stop, single smooth fade
  // down from pink and back up into green, no reversal.
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#ffb347');
  g.addColorStop(0.15, '#c0526e');
  g.addColorStop(0.4, '#3d2c52'); // darkest point of the twilight sky
  g.addColorStop(0.5375, '#2a8a2a'); // grass fully established, at the characters' feet
  g.addColorStop(1, '#123a12'); // dusk-shadow green at the very bottom
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

const MENU_PARTICLE_TYPES = ['ember', 'frost', 'mote'];
const MENU_PARTICLES = (function() {
  const particles = [];
  for (let i = 0; i < 26; i++) {
    particles.push({
      type: MENU_PARTICLE_TYPES[randRange(0, MENU_PARTICLE_TYPES.length)],
      x0: Math.random() * 400,
      y0: Math.random() * 400,
      driftSpeed: 4 + Math.random() * 7, // unscaled units/sec, drifts upward
      swaySpeed: 0.3 + Math.random() * 0.5,
      swayAmount: 4 + Math.random() * 9,
      size: 1.5 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return particles;
})();

// Embers (Fire), frost wisps (Ice Ball/Ice Shield), and faint dice/ghost
// motes (Gambler/Ghost Ball) drifting slowly upward with a gentle side-to-side
// sway - a light callback to the powerup theme without being distracting.
function drawMenuParticles() {
  const t = (Date.now() - MENU_LOAD_TIME) / 1000;
  MENU_PARTICLES.forEach(p => {
    const y = 400 - ((t * p.driftSpeed + (400 - p.y0)) % 400);
    const x = p.x0 + Math.sin(t * p.swaySpeed + p.phase) * p.swayAmount;
    const px = toX(x), py = toY(y);
    ctx.save();
    if (p.type === 'ember') {
      ctx.shadowColor = 'rgba(255,120,0,0.9)';
      ctx.shadowBlur = toLen(p.size * 2.5);
      circle(px, py, toLen(p.size), 'rgba(255,170,60,0.9)', 1);
    } else if (p.type === 'frost') {
      ctx.shadowColor = 'rgba(140,220,255,0.9)';
      ctx.shadowBlur = toLen(p.size * 2.5);
      circle(px, py, toLen(p.size), 'rgba(210,245,255,0.85)', 1);
    } else {
      ctx.shadowColor = 'rgba(200,200,230,0.6)';
      ctx.shadowBlur = toLen(p.size * 2);
      circle(px, py, toLen(p.size), 'rgba(220,220,235,0.5)', 1);
    }
    ctx.restore();
  });
}

// Per-character layout jitter, rolled once at load (not re-rolled every
// frame, so positions stay put across renders instead of jittering) - see
// drawCharacterShowcase(). Kept small/bounded on purpose: each character
// gets its own grid cell there, and jitter must stay well inside that cell's
// slack so bigger portraits still never touch their neighbors.
const SHOWCASE_LAYOUT = CHARACTERS.map(() => ({
  xJitter: (Math.random() - 0.5) * 2, // -1..1
  yJitter: (Math.random() - 0.5) * 2, // -1..1
  tiltJitter: (Math.random() - 0.5) * 2, // -1..1
}));

// All 10 characters laid out in a 2-column grid per side, standing in the
// grass to the left and right of the menu buttons (which occupy the center,
// x:125-275 in 400-unit space - toX(125)=400px to toX(275)=880px on the real
// canvas) rather than crossing behind them. A grid (not a single-file
// column) is what lets each portrait be drawn bigger while guaranteeing its
// cell's neighbors can't overlap it - a single column doesn't have enough
// vertical room in just the grass for 5 same-side portraits at a readable
// size. Small per-character jitter (bounded well inside each cell's slack)
// plus alternating tilt keeps it from reading as a rigid grid. The band
// starts a little above where the grass is fully established (toY(215), see
// drawMenuBackground's own comment) - close enough to still read as
// standing in the grass - and stays short of the canvas bottom. A slow
// float plus a soft pulsing glow in each character's own color (rim-light-
// style, via canvas shadowBlur, which hugs the portrait's actual silhouette
// since the art has a transparent background) bring it to life without
// needing CSS animation.
function drawCharacterShowcase() {
  const half = Math.ceil(CHARACTERS.length / 2); // left group gets the extra character when the roster is odd
  // 3 columns x 2 rows (6 cells for 5 characters, one left empty) rather
  // than 2x3 - portraits are taller than they are wide, so the constraint
  // that actually limits size is vertical room, and 2 rows instead of 3
  // roughly doubles each cell's height for the same total band.
  const cols = 3;
  const rows = Math.ceil(half / cols);
  // Raw canvas pixels (not the 400-unit toX/toLen system - toLen in
  // particular is lenY, the vertical scale factor, so using it for a
  // horizontal span would apply the wrong axis's scale entirely).
  const zoneXLeft = [20, 380];
  const zoneXRight = [CANVAS_W - 380, CANVAS_W - 20];
  const zoneYTop = 345, zoneYBottom = 690;
  const colW = (zoneXLeft[1] - zoneXLeft[0]) / cols;
  const rowH = (zoneYBottom - zoneYTop) / rows;
  const t = (Date.now() - MENU_LOAD_TIME) / 1000;
  CHARACTERS.forEach((c, i) => {
    const img = menuCharacterImage(c.key);
    if (!img.complete || !img.naturalWidth) return;
    const isLeft = i < half;
    const idxInGroup = isLeft ? i : i - half;
    const row = Math.floor(idxInGroup / cols), col = idxInGroup % cols;
    const zoneX = isLeft ? zoneXLeft : zoneXRight;
    // Brick/masonry offset: every odd row is shifted half a column over, so
    // its portraits sit in the horizontal gaps between the row above's
    // portraits instead of stacking directly beneath them.
    const rowXOffset = (row % 2 === 1) ? colW / 2 : 0;
    const cellCx = zoneX[0] + (col + 0.5) * colW + rowXOffset;
    const cellCy = zoneYTop + (row + 0.5) * rowH;
    const layout = SHOWCASE_LAYOUT[i];
    const stagger = (i % 2 === 0) ? -1 : 1;
    const floatY = Math.sin(t * 0.6 + i * 1.3) * toLen(4);
    // Jitter capped at a fraction of each cell's own half-size, so it can
    // never push a portrait into a neighboring cell.
    const cx = cellCx + layout.xJitter * colW * 0.08;
    const cy = cellCy + layout.yJitter * rowH * 0.08 + floatY;
    const tilt = stagger * 5 + layout.tiltJitter * 4;
    // Raw pixels (matching the zone math above), sized to comfortably fill
    // most of a cell's height without touching the next row/column's cell.
    const h = 140, w = h * (img.naturalWidth / img.naturalHeight);
    const glowPulse = 0.6 + 0.4 * Math.sin(t * 1.4 + i * 0.9);
    ctx.save();
    ctx.shadowColor = c.color;
    ctx.shadowBlur = toLen(10 + 8 * glowPulse);
    ctx.translate(cx, cy);
    ctx.rotate(tilt * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
}

// Bold poster-style title with a glowing baseball split clean down the
// middle - fire on the left, ice on the right - as a graphic accent.
function drawTitleLogo() {
  const cx = CANVAS_W / 2, topY = toY(28);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = toLen(6);
  ctx.shadowOffsetY = toLen(2);
  ctx.font = `900 ${toLen(46)}px Orbitron, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = linearGradient(cx - toLen(140), 0, cx + toLen(140), 0, ['#ff8a3d', '#fff3c4', '#7ad7ff']);
  ctx.fillText('HERO BALL', cx, topY);
  ctx.restore();
}

// Per-character pitcher/batter art: assets/sprites/{pitcher,batter}/ holds a
// recolored copy of every pose for every roster key (uniform accent color
// swapped to match CHARACTERS[].color, generated offline from one shared
// source pose set - see recolor.py in the project scratchpad). Position/
// rotation metadata is pose-specific, not character-specific, so it lives in
// its own small arrays and is reused across every character's image set.
const SPRITES_DIR = 'assets/sprites/';
// Roughly where the pitcher stands (PITCHER_FRAME_META's ready-stance x
// below is 32) plus a little breathing room - a rolling Ground Out is
// called once it reaches here (see the ball.y >= toY(300) ground-bounce
// check in update()), not before.
const GROUND_OUT_MOUND_X = 45;
const PITCHER_FRAME_META = [
  { x: 32, y: 250 },
  { x: 27, y: 246 },
  { x: 26, y: 246 },
  { x: 34, y: 254 },
  { x: 37, y: 253 },
];
const BATTER_READY_META = { x: 335, y: 252 };
const BATTER_SWING_META = [
  { x: 334, y: 255, rotate: 0 },
  { x: 329, y: 255, rotate: 0 },
  { x: 329, y: 252, rotate: 0 },
  { x: 338, y: 256, rotate: 3 },
  { x: 334, y: 255, rotate: 0 },
];

// Bug fix (size): these used to eagerly load all 11 sprite images for all
// 10 characters (110 images, ~2.8MB) the instant the script ran, regardless
// of which 2 characters ever actually get picked for a match - unlike
// portraits/icons/menu art, sprites are never shown on the select screens,
// so nothing is lost by only fetching a character's set the first time it's
// actually needed (see getPitcherFrames()/getBatterFrames(), and
// startMatch() which warms both active characters' sets right away).
const pitcherFramesByChar = {};
const batterFramesByChar = {};
function getPitcherFrames(key) {
  if (!pitcherFramesByChar[key]) {
    pitcherFramesByChar[key] = PITCHER_FRAME_META.map((f, i) => ({
      img: loadImage(SPRITES_DIR + 'pitcher/' + key + '_' + (i + 1) + '.png'), x: f.x, y: f.y,
    }));
  }
  return pitcherFramesByChar[key];
}
function getBatterFrames(key) {
  if (!batterFramesByChar[key]) {
    batterFramesByChar[key] = {
      ready: { img: loadImage(SPRITES_DIR + 'batter/' + key + '_ready.png'), x: BATTER_READY_META.x, y: BATTER_READY_META.y },
      swings: BATTER_SWING_META.map((f, i) => ({
        img: loadImage(SPRITES_DIR + 'batter/' + key + '_swing' + (i + 1) + '.png'), x: f.x, y: f.y, rotate: f.rotate,
      })),
    };
  }
  return batterFramesByChar[key];
}

const homeRunSound = document.getElementById('homeRunSound');
window.__pokiAssetsToTrack.push(homeRunSound); // declared directly in index.html, not via loadSound()

/* ============================== AUDIO ============================== */
const AUDIO_DIR = 'assets/audio/';
function loadSound(src, volume) {
  const audio = new Audio(AUDIO_DIR + src);
  audio.preload = 'auto';
  audio.volume = volume === undefined ? 1 : volume;
  window.__pokiAssetsToTrack.push(audio);
  return audio;
}
// One-shot call sounds - restart from 0 every play (same pattern as
// homeRunSound above) so a quick repeat retriggers instead of being a no-op
// on an already-playing clip.
const SOUNDS = {
  batCrack: loadSound('bat_crack.mp3'),
  single: loadSound('single.mp3'),
  double: loadSound('double.mp3'),
  strike: loadSound('strike.mp3'),
  ball: loadSound('ball.mp3'),
  out: loadSound('out.mp3'),
  crowdCheer: loadSound('crowd_cheer.mp3', 0.7),
};

// One sound per power, keyed by the same CHARACTERS[].bat.key/pitch.key
// strings the M/Z-key handlers already switch on below - sourced to
// thematically match each power (e.g. a clock for Time Stop, a slot-machine
// wheel for both of Gambler's Roll variants, a balloon inflating/deflating
// for Ball Expand/Shrink).
const POWER_SOUNDS = {
  fire: loadSound('power_fire.mp3'),
  meteor: loadSound('power_meteor.mp3'),
  mirrorBall: loadSound('power_mirror_ball.mp3'),
  ghost: loadSound('power_ghost_ball.mp3'),
  timeStop: loadSound('power_time_stop.mp3'),
  droneBall: loadSound('power_drone_ball.mp3'),
  blackoutSwing: loadSound('power_blackout_swing.mp3'),
  void: loadSound('power_void.mp3'),
  gamblerBatting: loadSound('power_gamblers_roll.mp3'),
  gamblerPitching: loadSound('power_gamblers_roll.mp3'),
  pause: loadSound('power_pause_power.mp3'),
  spinCycle: loadSound('power_spin_cycle.mp3'),
  expandShot: loadSound('power_ball_expand.mp3'),
  ballShrink: loadSound('power_ball_shrink.mp3'),
  iceShield: loadSound('power_ice_shield.mp3'),
  iceBall: loadSound('power_ice_ball.mp3'),
  futureSight: loadSound('power_future_sight.mp3'),
  mirage: loadSound('power_mirage.mp3'),
  guaranteedContact: loadSound('power_guaranteed_contact.mp3'),
  fastballPlus: loadSound('power_fastball_plus.mp3'),
};

function playSound(audio) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function stopSound(audio) {
  audio.pause();
  audio.currentTime = 0;
}

// Gambler's Roll/Spin Cycle/Drone Ball sounds are tied to how long their
// underlying animation actually runs (the dice rolling, the ball spinning,
// the drone drifting) rather than being one-shot clips fired at activation -
// looped here and started/stopped explicitly at the right animation
// boundaries instead of just playing once on keypress.
POWER_SOUNDS.gamblerBatting.loop = true;
POWER_SOUNDS.gamblerPitching.loop = true;
POWER_SOUNDS.spinCycle.loop = true;
POWER_SOUNDS.droneBall.loop = true;

// Background stadium ambience: loops continuously through a game, ducked to
// a quiet baseline most of the time and briefly boosted louder right after
// every swing (see attemptSwing()), then eased back down tick by tick (see
// stepCrowdVolume(), called from update()) instead of snapping back.
const CROWD_BASE_VOLUME = 0.15;
const CROWD_SWING_VOLUME = 0.6;
const CROWD_DECAY_PER_TICK = 0.01;
const crowdSound = loadSound('crowd_loop.mp3', CROWD_BASE_VOLUME);
crowdSound.loop = true;
let crowdVolume = CROWD_BASE_VOLUME;

function stepCrowdVolume() {
  if (crowdVolume <= CROWD_BASE_VOLUME) return;
  crowdVolume = Math.max(CROWD_BASE_VOLUME, crowdVolume - CROWD_DECAY_PER_TICK);
  crowdSound.volume = crowdVolume;
}

// Background music ("Feel Alive" by Michael Ramir C., via Mixkit) - loops
// continuously for the whole session at normal volume on every menu-ish
// screen, ducked down faint during actual gameplay (see render(), which
// re-checks app.screen every frame and adjusts the volume accordingly - far
// simpler than hooking every individual screen-transition function).
const MUSIC_MENU_VOLUME = 0.5;
const MUSIC_GAME_VOLUME = 0.08;
const musicSound = loadSound('feel_alive.mp3', MUSIC_MENU_VOLUME);
musicSound.loop = true;
let musicStarted = false;
// Browsers block audio autoplay without a user gesture, so this can't just
// run on page load - call it from the first real keydown/mousedown/
// touchstart the page receives (see those listeners below), whichever
// happens first.
function ensureMusicStarted() {
  if (musicStarted) return;
  musicStarted = true;
  musicSound.play().catch(() => { musicStarted = false; });
}

/* ============================== POKI SDK ============================== */
// The game must work identically with no SDK present at all (local dev,
// GitHub Pages, an ad blocker eating the script) - every call below is
// guarded so a missing/failed PokiSDK never breaks actual gameplay.
const pokiSdkAvailable = typeof PokiSDK !== 'undefined';

// Resolves once every asset in the list has either loaded or errored out -
// errors resolve too (rather than reject) so one broken/slow file can't
// wedge the loading screen forever. A snapshot, not a live reference: only
// the assets requested at parse time (icons/portraits/menu art/effects/
// audio) should gate this - character sprites are fetched later, on demand,
// once a match actually starts (see getPitcherFrames()/getBatterFrames()),
// and must not hold up the initial loading signal.
function waitForAssetsLoaded(assets) {
  const pending = assets.map(a => new Promise(resolve => {
    if (a instanceof HTMLImageElement) {
      if (a.complete) { resolve(); return; }
      a.addEventListener('load', resolve, { once: true });
      a.addEventListener('error', resolve, { once: true });
    } else { // HTMLAudioElement
      if (a.readyState >= 3) { resolve(); return; } // HAVE_FUTURE_DATA or better
      a.addEventListener('canplaythrough', resolve, { once: true });
      a.addEventListener('error', resolve, { once: true });
    }
  }));
  // Safety net: don't let the loading screen hang indefinitely if something
  // never fires either event (shouldn't happen for same-origin assets, but
  // this only ever costs an early gameLoadingFinished() if it's hit).
  const timeout = new Promise(resolve => setTimeout(resolve, 15000));
  return Promise.race([Promise.all(pending), timeout]);
}

if (pokiSdkAvailable) {
  PokiSDK.init().then(() => {
    waitForAssetsLoaded(window.__pokiAssetsToTrack.slice()).then(() => {
      PokiSDK.gameLoadingFinished();
    });
  }).catch(() => {});
}

// Tracks whether Poki currently considers the player "in gameplay", so
// gameplayStart()/gameplayStop() never fire twice in a row for the same
// state (Poki explicitly disallows duplicate events).
let pokiGameplayActive = false;
function pokiGameplayStart() {
  if (!pokiSdkAvailable || pokiGameplayActive) return;
  pokiGameplayActive = true;
  PokiSDK.gameplayStart();
}
function pokiGameplayStop() {
  if (!pokiSdkAvailable || !pokiGameplayActive) return;
  pokiGameplayActive = false;
  PokiSDK.gameplayStop();
}

// Requests an ad break right before gameplay (re)starts - the one moment
// this game actually has that matches Poki's "heading back into gameplay"
// timing rule, since there's no separate pause/resume menu to hook into
// (see beginGame()). onDone runs whether or not an ad actually played;
// Poki's own system decides that, not every call results in a visible ad.
let pokiBreakPending = false;
function pokiCommercialBreak(onDone) {
  if (!pokiSdkAvailable) { onDone(); return; }
  pokiBreakPending = true;
  PokiSDK.commercialBreak(() => {
    musicSound.pause();
    crowdSound.pause();
  }).then(() => {
    pokiBreakPending = false;
    if (musicStarted) musicSound.play().catch(() => {});
    onDone();
  });
}

// Same pattern as pokiCommercialBreak() above, but for the "watch an ad for
// Coins" button on the Upgrades screen - a REWARDED ad, which resolves to
// whether the player actually watched it to completion (onResult(false) if
// they skipped early, in which case no reward should be granted). Falls back
// to an instant "success" when the SDK (or its rewardedBreak call) isn't
// available at all, e.g. local dev via `python -m http.server`, so testing
// off-Poki still works.
function pokiRewardedAd(onResult) {
  if (!pokiSdkAvailable || typeof PokiSDK.rewardedBreak !== 'function') { onResult(true); return; }
  pokiBreakPending = true;
  PokiSDK.rewardedBreak(() => {
    musicSound.pause();
    crowdSound.pause();
  }).then(success => {
    pokiBreakPending = false;
    if (musicStarted) musicSound.play().catch(() => {});
    onResult(success);
  });
}
function handleWatchAd() {
  if (pokiBreakPending) return;
  pokiRewardedAd(success => { if (success) { saveData.coins += AD_REWARD_COINS; persistSaveData(); } });
}

// Safety net: every in-game path that ends a match (game over, quitting,
// opening the quit-confirm pause) already calls pokiGameplayStop() itself -
// but a player (or an automated test) can also just close the tab, switch
// away, or navigate off mid-match without ever hitting one of those paths,
// which would leave a gameplayStart() with no matching gameplayStop() ever
// reported. document.hidden fires reliably for all of those cases (tab
// close, tab switch, minimize, mobile app-switch), so it's the standard
// catch-all rather than trying to enumerate every possible exit. Only
// resumes automatically if this handler was the one that stopped it (not
// stepping on the quit-confirm modal's own stop/resume) and the player's
// actually still on the play screen when they come back.
let pokiStoppedForHidden = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (pokiGameplayActive) {
      pokiStoppedForHidden = true;
      pokiGameplayStop();
    }
  } else if (pokiStoppedForHidden) {
    pokiStoppedForHidden = false;
    if (app.screen === 'play' && !app.showQuitConfirm) pokiGameplayStart();
  }
});

/* ============================== CANVAS ============================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

/* ============================== GAME STATE ============================== */
const app = {
  // Session starts on a one-time onboarding prompt (drawOnboardingPrompt()),
  // not directly on 'mode' - asks whether the player already knows the
  // controls (-> straight to the normal main menu) or wants the tutorial
  // first (-> startTutorial()), instead of assuming either way.
  screen: 'onboarding', // onboarding | mode | soloModeSelect | characterSolo | characterVersus | upgrades | mobileCharacterSelect | mobileCpuSelect | mobileUpgrades | play | gameOver | unlockReveal
  onboardingIndex: 0, // 0 = "Show Me The Tutorial", 1 = "I Know The Controls"
  mode: null, // 'solo' | 'versus'
  modeSelectIndex: 0, // 0 = Solo, 1 = 2 Player
  // Solo mode only (requested) - Story is today's single free-play match,
  // Tournament is the 8-character single-elimination bracket (see
  // startTournament()/handleTournamentProgression()). Reset to 'story' once
  // a tournament run ends (win or lose) so a later plain Solo match isn't
  // mistaken for still being mid-bracket.
  soloGameMode: 'story', // 'story' | 'tournament'
  soloModeSelectIndex: 0, // 0 = Story Mode, 1 = Tournament Mode - cursor on the picker screen
  // Set by startTournament() when Tournament Mode is picked; null otherwise.
  // opponents: 7 distinct random CHARACTERS keys (the bracket's other
  // competitors) - opponents[round] is always the player's actual opponent
  // for that round. round: 0/1/2 = quarterfinal/semifinal/final. wins: how
  // many rounds the player has won so far this run (also the reward tier on
  // elimination - see tournamentReward()). totalRuns: runs scored across
  // every match this run, added into the coin reward.
  tournament: null,
  difficultyIndex: 0, // default Easy - Normal was too punishing for a brand-new player's very first match
  player1Index: 0,
  player2Index: 0,
  cpuBatterIndex: 0,
  player1Locked: false,
  player2Locked: false,
  readyOpacity: 0,

  // Escape-to-quit confirmation, shown over the 'play' screen. update()
  // early-returns while this is true (see below), freezing the ball/CPU/
  // every animation exactly like the Pause power-up's own freeze does.
  showQuitConfirm: false,
  // 0 = Yes/Leave, 1 = No/Stay - which button the arrow cursor points at
  // (same up/down-arrow-cursor pattern as modeSelectIndex on the mode-select
  // screen). Defaults to No every time the dialog opens, so an accidental
  // Enter press is the safer "stay" outcome, not "leave".
  quitConfirmIndex: 1,

  // Set right before app.screen becomes 'gameOver' (see switchSides()'
  // game-over branch) - which winner line drawGameOver() shows.
  gameOverP1Wins: false,

  homePitching: true, // true: home team pitching (WASD), away batting. false: reversed (arrows)
  activePitcherKey: null, // which player is pitching right now: 'p1' | 'p2' | 'cpu'
  activeBatterKey: null,

  isPitching: false,
  pitcherFrameIndex: 0,
  pitcherHoldCount: 0,
  isBatting: false,
  batterFrameIndex: 0,
  batterHoldCount: 0,
  spinCount: 0, // ticks since the CPU's last pitch - drives its auto-pitch delay
  firstCpuPitchDone: false, // see CPU_FIRST_PITCH_DELAY_STEPS - never resets once true, for the whole session

  pitch: '',
  checkHit: false,
  // How many more ticks resolveHit() will keep checking for contact before
  // giving up on this swing as a genuine miss - see attemptSwing() (where
  // this starts) and resolveHit() (where it counts down).
  swingContactTicksLeft: 0,
  swung: false,
  cpuSwung: false,
  homeRun: false,
  ballSlow: false,
  ballFast: false,

  // Pitch timing meter (requested): pressing a pitch-type key/button ARMS
  // that type (pitchArmed) instead of throwing it immediately - a meter then
  // sweeps back and forth over the pitcher (see stepPitchMeter()/
  // drawPitchMeterOverlay()) until a click/tap CONFIRMS it (see
  // confirmArmedPitch()), landing in the good/okay/bad zone throws
  // Hard/Normal/Easy. Zone/Speed upgrade levels (PITCH_ZONE_LEVELS/
  // PITCH_SPEED_LEVELS) make the armed type's own meter more forgiving.
  // Active during real gameplay and the tutorial's guided pitching drill
  // (which now teaches this same mechanic) - never during any other
  // tutorial step, and never for an auto-sequence power-up (those throw
  // themselves immediately, nothing to arm or time).
  pitchArmed: null, // null | 'fastball' | 'curveball' | 'riser' | 'knuckleball'
  pitchMeterActive: false,
  pitchMeterPos: 0,
  pitchMeterDir: 1,

  stopTime: false,
  timeStopActive: false,
  mirrorBallActive: false,
  reverseBall: false,
  futureSightCount: 0,
  showFutureSight: false,

  shieldWidth: 0.001,

  mirageCount: 0,
  spinCycleActive: false,
  spinCycleSpeed: 0,
  spinCycleSoundOn: false,
  droneBallActive: false,
  droneCount: 0,
  droneNum: 0,
  batterFrozen: false,
  paused: false,
  powerUpActive: false,
  smallBatActive: false,
  goldenHomeRun: false,
  batterBig: false,
  pitcherSmall: false,
  // Pause power-up animation: a YouTube-style pause/resume sequence - the
  // pause icon flashes, a fake cursor travels over to the ball, grabs it,
  // carries it to the crosshair, lets go, then a resume icon flashes before
  // play continues. See stepPauseAnim()/drawPauseAnim() for the phases.
  pauseAnimActive: false,
  pausePhase: '', // 'flashPause' | 'toBall' | 'grab' | 'toCrosshair' | 'release' | 'flashResume'
  pausePhaseTick: 0,
  pauseFromX: 0, pauseFromY: 0, // the ball's actual contact point
  pauseToX: 0, pauseToY: 0, // the crosshair - where it ends up
  pauseCursorX: 0, pauseCursorY: 0, // the fake cursor's current position
  pauseOutcome: '', // 'critical' | 'normal' | 'miss' - which tier to apply once the animation finishes
  justFinishedPauseAnim: false, // protects the ground-check for one tick right after the animation completes - see stepPauseAnim()

  voidActive: false,
  meteorActive: false,
  meteorX: -200,
  meteorY: -200,
  ghostActive: false,

  diceRolling: false,
  diceCount: 0,
  diceSeed: 0,
  diceFinalFace: 0,
  diceSettling: false,
  diceSettleHoldCount: 0,
  diceCardVisible: false,
  diceExiting: false,
  diceCardX: 0,
  diceCardHoldCount: 0,
  diceOutcomeNumber: '',
  diceOutcomeText: '',
  diceOutcomeFace: 0,
  diceForBatting: false,
  showBallTrail: false,

  callActive: false,
  callText: '',
  callX: CANVAS_W,
  callBannerOpacity: 0,

  batPowerFull: true,
  pitchPowerFull: true,

  batFireVisible: false,

  // Solo-mode progression tracking for the current match only - see
  // evaluateGameEndUnlocks() (checked once the match ends) and the
  // cumulative counters in saveData.stats (persisted across matches).
  // Reset every new match in resetMatchState().
  maxDeficitThisGame: 0, // largest (awayScore - homeScore) seen this game - for "won after trailing by 3+"
  humanUsedPowerThisGame: false, // for "won without using a power-up"
  hitsAllowedByHumanThisGame: 0, // hits the CPU got while the human was pitching - for the no-hitter condition
  lastPitchThrown: '', // stashed by resolveHit() before app.pitch gets cleared - see recordBaseHit()'s pitch-type tracking
  // Oracle's condition is per-inning, not cumulative - reset every time the
  // human's own batting half-inning starts (see assignActiveRoles()), not
  // just once per match.
  pitchTypesHitThisInning: { fastball: false, curveball: false, riser: false, knuckleball: false },
  // Rally difficulty (requested) - runs the human has scored in the current
  // half-inning at bat, same per-half-inning reset point as the field above.
  // Read by cpuPitch() to temporarily bump its pitch tier.
  runsThisHalfInning: 0,
  newlyUnlocked: [], // [{type:'player'|'cpu', key, name}] populated by evaluateGameEndUnlocks(), shown by the unlockReveal screen
  cpuLocked: false, // mirrors player1Locked, but for the CPU character card on the solo/mobileCpuSelect screens
  lastCoinsEarned: 0, // set by evaluateGameEndUnlocks(), shown on drawGameOver()
  upgradeCursorIndex: 0, // selected row on the desktop Upgrades screen

  // Interactive tutorial (see startTutorial()/stepTutorial()/
  // drawTutorialOverlay()). Reuses the real 'play' screen and gameplay code
  // paths throughout - active/practiceStep/dialogLines just gate a handful
  // of surgical hooks (forced CPU behavior, forced pitch selection, progress
  // detection) sprinkled through the normal rules functions, rather than
  // duplicating the whole game loop.
  tutorial: {
    active: false,
    practiceStep: null, // null | 'bat_aim_demo' | 'bat_easy' | 'bat_power_demo' | 'awaiting_pitch_turn' | 'pitch'
    forcedPitch: null, // when set, cpuPitch() throws exactly this pitch instead of rolling one
    forceWhiffCpuBatter: false, // pitching practice: the CPU batter never makes contact
    forceStrikeOnBall: false, // pitching practice: every pitch counts as a Strike, never a Ball
    awaitingContact: false, // batting practice: waiting for the player to make contact
    contactMade: false, // set by resolveHit() once contact happens during awaitingContact
    pitchingStrikeoutDone: false, // set once the scripted pitching drill's strikeout lands
    // Stuck-player safety net (see stepTutorial()) - batting timing is a
    // real skill unlike pitching (any keypress is valid there), so without
    // this a player who doesn't understand the crosshair can whiff the
    // same forced pitch forever with zero feedback.
    battingMissCount: 0, // consecutive whiffs in the current batting drill
    battingHintShown: false, // true once this drill's crosshair-timing hint has fired
    // Guided pitching intro (see beginPitchPractice()/stepTutorial()): walks
    // the player through one plain pitch, points out the pitch menu, then one
    // power-up pitch - via the non-blocking captionText banner rather than a
    // blocking dialogLines box, so gameplay never pauses. null once done,
    // falling through into the ordinary "throw pitches until you strike them
    // out" tail that was already there.
    pitchIntroPhase: null, // null | 'pressW' | 'sawPitches' | 'pressZ' | 'throwPowerPitch' | 'toldOnce'
    introTicks: 0, // drives the timed auto-advance for pitchIntroPhase's two purely-informational beats, and the final "finish the job" caption's auto-clear
    pitchIntroWaitingForResolve: false, // true from the moment a guided pitch launches until it fully resolves (forceStrikeOnBall guarantees that's a Strike) - the "4 pitches"/"once per inning" captions only appear once the preceding pitch has actually landed, not the instant it's thrown
    // Power-up demo (bat_power_demo, see beginPowerUpDemo()): a small step of
    // its own right after the one real batting hit - just needs the player
    // to press M at all, no follow-up swing/contact required.
    powerDrillTicks: 0, // ticks spent waiting for the player to press M during bat_power_demo - stuck-player safety net
    // Typewriter reveal for whichever line is current (see stepTutorial()'s
    // per-tick increment and drawTutorialOverlay()'s partial draw) - how
    // many characters of dialogLines[0] are shown so far. Reset to 0 by
    // showTutorialDialog() and by advanceTutorialDialog() every time the
    // line actually changes.
    // Batting aim demo (bat_aim_demo, see beginBattingAimDemo()): a real
    // pitch is thrown, then frozen mid-flight before it reaches the plate
    // so the player can practice lining the crosshair up with a stationary
    // target before ever having to time a moving one. Uses captionText (a
    // lightweight, non-blocking banner - see drawTutorialOverlay()) instead
    // of the blocking app.dialog box, since the player needs to keep moving
    // the mouse/crosshair while reading it - a real app.dialog entry
    // freezes update() (and therefore the crosshair) entirely.
    awaitingAimFreeze: false, // true from the moment the demo pitch launches until it crosses the freeze point
    aimDemoFrozen: false, // true once the ball has actually stopped mid-flight
    // Bug fix (requested): this used to latch true forever once the
    // crosshair first reached the ball, so a player who then drifted back
    // off it kept seeing "Now click to swing!" - actively misleading, since
    // swinging there would just miss. Now re-checked live every tick (see
    // stepTutorial()) and only stays permanently true once the stuck-player
    // fallback below force-passes it.
    aimDemoOnTarget: false, // true only while the crosshair is CURRENTLY on top of the frozen ball (or the stuck-player fallback fired)
    aimDemoForcedOnTarget: false, // true once the 30s stuck-player fallback has force-passed this step - aimDemoOnTarget then stays true regardless of position
    aimDemoSwung: false, // set by attemptSwing() once the player swings while on-target
    aimDemoTicks: 0, // ticks spent frozen-and-not-yet-on-target - drives the stuck-player nudge/auto-advance below
    aimDemoHintShown: false,
    captionText: '', // shown by drawTutorialOverlay() as a slim top banner while gameplay keeps running underneath
  },
  // Generic speaker dialogue box - the tutorial's Coach lines and solo-mode
  // opponent intro/win/lose lines both go through this same state/rendering
  // (see showDialog()/advanceDialog()/drawDialogOverlay()). Used to live only
  // on app.tutorial (dialogLines/onDialogDone/revealProgress) until dialogue
  // needed to work outside the tutorial too - showTutorialDialog()/
  // advanceTutorialDialog() are now thin wrappers around the functions below.
  dialog: {
    active: false,
    lines: [], // remaining lines of the current speaker's dialogue; drawDialogOverlay() shows lines[0]
    onDone: null, // called once the last line has been advanced past
    revealProgress: 0, // typewriter reveal progress (characters of lines[0] shown so far)
    speakerName: '',
    speakerImg: null,
  },
};

let homeScore = 0, awayScore = 0;
let inningNumber = 1, inningSuffix = 'st';
const outFills = ['dimgray', 'dimgray', 'dimgray'];
const strikeFills = ['dimgray', 'dimgray', 'dimgray'];
const ballFills = ['dimgray', 'dimgray', 'dimgray', 'dimgray'];
const bases = ['grey', 'grey', 'grey']; // [first, second, third]

const ball = {
  x: toX(61), y: toY(250), radius: toLen(2), visible: false,
  accel: -toLen(0.25), ySpeed: 0, xSpeed: 0,
};

const ghostBalls = [
  { x: toX(80), y: toY(255), visible: false, isReal: false },
  { x: toX(80), y: toY(265), visible: false, isReal: false },
  { x: toX(80), y: toY(275), visible: false, isReal: false },
];

let mouseX = -50, mouseY = -50; // raw pointer position, used as-is for menu clicks
// Starts in front of the batter (the strike zone's crossing point, x=325,
// y=265-290 -> center 277 - see the plate-crossing comment near the ball
// physics step) instead of the off-screen corner, so it's already visible
// and useful before the mouse/joystick ever moves - matters most on mobile,
// where the joystick doesn't touch crosshairX/Y at all until first dragged.
let crosshairX = toX(325), crosshairY = toY(277); // smoothed aiming position used in gameplay
let crosshairRadius = baseCrosshairRadius();
let criticalRadius = baseCriticalRadius();
let critHidden = false;
let crosshairStyle = 'normal'; // normal | blackout

// Mobile digital joystick: dx/dy are the stick's current deflection,
// normalized to -1..1 per axis. touchId identifies which finger owns the
// stick (see the touchstart/touchmove/touchend handlers) so a second finger
// tapping another button doesn't steal or reset it. stepCrosshair() reads
// dx/dy every tick to move the crosshair while touchId isn't null.
const joystick = { touchId: null, dx: 0, dy: 0 };
// 0-400 unit space, left side - shares its row center (y=350) with
// SWING_BUTTON/POWERUP_BUTTON below so all three batting controls line up
// together, moved down a bit further into the grass strip (y:300-400, see
// drawField()) than dead-center of it, per request.
const JOYSTICK_BASE = { x: 45, y: 350, radius: 35 };

function resetBall() {
  ball.x = toX(61);
  ball.y = toY(250);
  ball.xSpeed = 0;
  ball.ySpeed = 0;
  ball.accel = -toLen(0.25);
  ball.visible = false;
  ball.radius = toLen(2);
  ball.opacity = 1;
  // Bug fix: app.pitch used to persist here (only resolveHit() ever cleared
  // it, on an actual hit), so after a called Strike/Ball it kept holding the
  // PREVIOUS pitch's name even though the ball was back at rest and no new
  // pitch had been chosen yet. Future Sight's "only show once a pitch is
  // chosen" gate checked truthiness of app.pitch, which this stale leftover
  // value satisfied - so the prediction circle kept showing at the ball's
  // resting spot (right at the pitcher) between pitches.
  app.pitch = '';
  app.homeRun = false;
  app.powerUpActive = false;
  app.timeStopActive = false;
  app.voidActive = false;
  app.meteorActive = false;
  app.ghostActive = false;
  ghostBalls.forEach(g => { g.visible = false; g.isReal = false; g.x = toX(80); });
  app.batterFrozen = false;
  app.pitcherSmall = false;
  // Bug fix: app.showFutureSight used to reset here too, which meant it got
  // wiped after EVERY pitch (strike/ball/hit/out) instead of persisting
  // across the whole at-bat like every other bat power (Guaranteed Contact,
  // Blackout Swing, etc.) - that's why it "disappeared after 1 Mirage ball"
  // (Mirage repeatedly calls resetBall() every re-pitch cycle). It now only
  // clears via clearPowerupVisuals() (contact or inning change). The
  // per-pitch preview-delay counter still resets every pitch, though, so
  // each new pitch gets its own fresh windup preview.
  app.futureSightCount = 0;
  app.spinCycleActive = false;
  app.spinCycleSpeed = 0;
  app.spinCycleSoundOn = false;
  stopSound(POWER_SOUNDS.spinCycle); // in case the pitch is resolved (hit/out) mid-spin, before the sound's own natural stop point
  app.droneBallActive = false;
  app.droneCount = 0;
  stopSound(POWER_SOUNDS.droneBall); // same - covers a mid-flight resolution, not just the drone's own toX(300) exit
  app.showBallTrail = false;
  app.cpuSwung = false;
  app.swung = false;
  app.pitcherHoldCount = 0;
  app.batterHoldCount = 0;
  app.goldenHomeRun = false;
  // Note: crosshair state (radius/criticalRadius/critHidden/crosshairStyle) is
  // deliberately NOT reset here. Guaranteed Contact / Blackout Swing / Expand /
  // Fire must persist across strikes and balls until actual contact happens or
  // the half-inning changes - see clearPowerupVisuals(), which is the only
  // place that resets crosshair state, called from those two events specifically.
  // Small Bat is the one exception: it's a one-pitch-only penalty, so it
  // expires right here, the next time a pitch actually concludes (resetBall()
  // runs at the end of every strike/ball/hit/out).
  if (app.smallBatActive) {
    app.smallBatActive = false;
    crosshairRadius = baseCrosshairRadius();
    criticalRadius = baseCriticalRadius();
  }
  // Tutorial batting drill (bat_easy) repeats the same forced pitch until
  // the player makes contact - wiping the strike/ball/out dots every time a
  // pitch resolves without contact means a called strike/ball can never
  // accumulate into a real strikeout/walk and end the drill (or, now, the
  // whole half-inning - see recordOut()'s tutorial shortcut) early.
  // Reaching here with awaitingContact still true also means this pitch
  // came and went with no contact - i.e. a whiff - see stepTutorial()'s
  // hint/auto-pass safety net.
  if (app.tutorial.active && app.tutorial.awaitingContact) {
    clearCounts(true);
    app.tutorial.battingMissCount++;
  }
}

/* ============================== DRAW HELPERS ============================== */
function rect(x, y, w, h, fill, opacity, border, borderWidth) {
  ctx.save();
  ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = borderWidth || 1; ctx.strokeRect(x, y, w, h); }
  ctx.restore();
}

function circle(cx, cy, r, fill, opacity, border, borderWidth) {
  ctx.save();
  ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(r, 0), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = borderWidth || 1; ctx.stroke(); }
  ctx.restore();
}

function text(str, x, y, size, fill, opacity, align, weight) {
  ctx.save();
  ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  ctx.font = `${weight || 400} ${toLen(size)}px Orbitron, sans-serif`;
  ctx.fillStyle = fill;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  ctx.restore();
}

function textWidth(str, size, weight) {
  ctx.save();
  ctx.font = `${weight || 400} ${toLen(size)}px Orbitron, sans-serif`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

function linearGradient(x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function diamond(cx, cy, size, fill) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - size); ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx, cy + size); ctx.lineTo(cx - size, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawImageRotated(img, cx, cy, w, h, angleDeg, opacity) {
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg || 0) * Math.PI / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawImageTopLeft(img, x, y, w, h, opacity) {
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.save();
  ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

// Draws a trail/comet-style image so that its own embedded ball/rock (at
// relative position anchorRelX/Y within the source art, e.g. 0.5,0.5 would be
// dead center) stays locked exactly on the real ball's position, and so the
// art's own baked-in default heading (defaultHeadingDeg - the direction the
// ball/rock already "points" toward at rotation 0) gets corrected to match
// the ball's true direction of travel. Naively rotating these off-center,
// non-zero-heading assets around the ball's own position (as if they were
// centered and pointed along +x) leaves them both drifting off the ball and
// aimed the wrong way as the rotation changes.
function drawBallTrailImage(img, anchorRelX, anchorRelY, defaultHeadingDeg, w, h, travelAngleDeg, opacity) {
  const drawAngle = travelAngleDeg - defaultHeadingDeg;
  const localOffX = (anchorRelX - 0.5) * w;
  const localOffY = (anchorRelY - 0.5) * h;
  const rad = drawAngle * Math.PI / 180;
  const worldOffX = localOffX * Math.cos(rad) - localOffY * Math.sin(rad);
  const worldOffY = localOffX * Math.sin(rad) + localOffY * Math.cos(rad);
  drawImageRotated(img, ball.x - worldOffX, ball.y - worldOffY, w, h, drawAngle, opacity);
}

function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function randRange(min, maxExclusive) { return min + Math.floor(Math.random() * (maxExclusive - min)); }

/* ============================== STADIUM BACKGROUND ============================== */
function drawStadium() {
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#7ec8e3', '#bfe6f5']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.fillStyle = 'rgba(20,20,30,0.2)';
  for (let i = 0; i < 14; i++) {
    circle(40 + i * (CANVAS_W - 80) / 13, 55 + (i % 2) * 25, 14, 'rgba(20,20,30,0.18)');
  }
  ctx.restore();
}

/* ============================== ANIMATION / CALL BANNER ============================== */
const PITCHER_FRAME_HOLD = 4; // steps each windup frame is held (slowed down from 1)
// Bug fix: batterFrameIndex used to count all the way to 11 with only 5 real
// swing sprites (BATTER_SWING_META), and swingIdx = (frameIndex-1) % 5 wrapped
// around - so the same 5 frames played through, then played through AGAIN,
// making every single swing visibly happen twice. There are only 5 frames, so
// the index now stops after showing each one once.
const BATTER_FRAME_HOLD = 3; // steps each swing frame is held
const BATTER_SWING_FRAME_COUNT = 5;

function playAnimation(kind) {
  if (kind === 'pitcher') {
    app.pitcherHoldCount++;
    if (app.pitcherHoldCount < PITCHER_FRAME_HOLD) return;
    app.pitcherHoldCount = 0;
    app.pitcherFrameIndex++;
    if (app.pitcherFrameIndex >= 5) {
      app.pitcherFrameIndex = 0;
      app.isPitching = false;
      ball.visible = true;
      applyPitchVelocity(app.pitch);
    }
    return;
  }
  if (kind === 'batter') {
    app.batterHoldCount++;
    if (app.batterHoldCount < BATTER_FRAME_HOLD) return;
    app.batterHoldCount = 0;
    app.batterFrameIndex++;
    if (app.batterFrameIndex > BATTER_SWING_FRAME_COUNT) {
      app.batterFrameIndex = 0;
      app.isBatting = false;
    }
    return;
  }
  if (kind === 'dice') return; // handled by dedicated dice stepper
  showCallBanner(kind);
}

// fire_trail.png points straight UP by default (flames licking upward off a
// base at the bottom of the art). The batter has 6 distinct sprites - the
// idle ready stance plus 5 swing frames - and Fire can be visible during
// ANY of them (it's armed well before the pitch and persists through the
// whole at-bat), each holding the bat at a different angle, so the flame
// needs its own x/y offset (added to that sprite's own position) and
// rotation per sprite. Index 0 = ready stance, 1-5 = swing frames - this
// matches app.batterFrameIndex's own numbering exactly. Dialed in via Fire
// Tune Mode (press F in-game): this array IS what real gameplay reads, so
// changes made while tuning apply immediately and permanently (no copying
// values back into code).
const FIRE_TRAIL_OFFSETS = [
  { x: 22, y: 10, rot: 60 }, // 0: ready stance
  { x: 14, y: 12, rot: 0 },
  { x: 6, y: 14, rot: -32 },
  { x: 6, y: 16, rot: -145 },
  { x: 18, y: 12, rot: -25 },
  { x: 22, y: 24, rot: 65 },
];

// Computes the fire trail's world position/rotation fresh from whatever
// sprite is actually on screen RIGHT NOW (ready stance or a specific swing
// frame) - not a value cached earlier and hoped to still match, which is
// exactly the kind of bug that let the trail and the sprite drift out of
// sync before. Frame 0 is the ready stance (BATTER_READY_META); 1-5 are the
// swing frames.
function getBatFireTransform(frameIndex) {
  const f = frameIndex > 0 ? BATTER_SWING_META[frameIndex - 1] : BATTER_READY_META;
  const off = FIRE_TRAIL_OFFSETS[frameIndex];
  return { x: toX(f.x + off.x), y: toY(f.y + off.y), rot: off.rot };
}

function showCallBanner(msg) {
  app.callText = msg.toUpperCase();
  app.callX = CANVAS_W;
  app.callActive = true;
  app.callBannerOpacity = 0.5;
}

function applyPitchVelocity(pitchName) {
  // Values simulation-tuned so a taken pitch resolves to the intended call at
  // the plate. Every pitch is a strike EXCEPT Curveball. Table entries are
  // [xSpeed, -ySpeed0, customAccel?]: the 3rd slot, when present, overrides
  // the default gravity (-0.25) that resetBall() sets, so a pitch can carry
  // its own dedicated arc shape for its whole flight instead of relying on a
  // late per-step break in update().
  // - Curveball family: strong negative accel with a big negative ySpeed0
  //   produces a full "up, then down" arc that ends just past the strike
  //   zone (a Ball) - the one pitch that isn't a guaranteed strike. xSpeed is
  //   deliberately slower than the other pitches so the arc has room to play
  //   out visibly instead of snapping past in a couple of frames.
  // - Riser family: a small positive accel with a small positive ySpeed0
  //   produces the mirror-image arc (dips slightly, then curves back up),
  //   tuned to land back inside the zone (a Strike) instead of past it. Also
  //   slowed down to match Curveball's more visible pace.
  // - Knuckleball family: accel 0 here just gives it a neutral base - its
  //   actual flight is entirely driven by update()'s chaotic-then-corrective
  //   step logic (see KNUCKLE_CHAOS_END_X), not by this table's ySpeed0/accel.
  const table = {
    // Fastball family slowed down (xSpeed reduced ~25%) with ySpeed0 retuned
    // so it still lands dead-center in the zone as a guaranteed strike.
    Fastball: [13, 1.8], Curveball: [10, 5.3, -0.44], Knuckleball: [10, 0, 0], Riser: [10, -3.2, 0.147],
    EFastball: [10, 3], ECurveball: [9, 4, -0.32], EKnuckleball: [8, 0, 0], ERiser: [8, -4, 0.185],
    HFastball: [15, 1.2], HCurveball: [12, 7, -0.68], HKnuckleball: [12, 0, 0], HRiser: [12, -3.6, 0.164],
    FastballPlus: [30, -1.3],
    // Baby mode (requested) - even slower than the E tier (xSpeed 6, vs. 8-10)
    // with movement pared down to near nothing on every type, including
    // Curveball tuned to actually land as a strike here (unlike every other
    // Curveball tier) rather than arc out as a Ball - a first-time player
    // should always get a real, reachable pitch to swing at. Knuckleball's
    // chaos phase is driven separately by update()'s exact-name check
    // (Knuckleball/EKnuckleball/HKnuckleball only), so BKnuckleball never
    // enters it and just flies a plain, predictable line like the others.
    // Bug fix: naively copying the other tiers' ySpeed0/accel (scaled down
    // for the slower xSpeed) badly overshot the zone - at 6 xSpeed the ball
    // takes ~49 ticks to reach the plate, 2-3x any other tier, so the exact
    // same per-tick ySpeed0/accel compounds into a wildly different arrival
    // height than intended - solved (not guessed) against update()'s real
    // per-tick step (`ySpeed -= accel`, note the SUBTRACTION - the opposite
    // sign convention from what the flight-time math naively suggests) to
    // land dead center in the zone at that specific 49-tick flight time -
    // Fastball/Knuckleball perfectly flat (accel 0), Curveball/Riser a
    // barely-visible opposite-direction curve, all four still landing
    // centered as a real, reachable pitch every time.
    BFastball: [6, -0.561, 0], BCurveball: [6, -1.281, 0.03], BKnuckleball: [6, -0.561, 0], BRiser: [6, 0.159, -0.03],
  };
  if (table[pitchName]) {
    ball.xSpeed = lenX(table[pitchName][0]);
    ball.ySpeed = -toLen(table[pitchName][1]);
    if (table[pitchName][2] !== undefined) ball.accel = toLen(table[pitchName][2]);
    if (pitchName === 'FastballPlus') app.showBallTrail = true;
  } else if (pitchName === 'SpinCycle') {
    ball.xSpeed = lenX(10);
    ball.accel = 0;
    app.spinCycleActive = true;
    // Bug fix: app.spinCycleSpeed is left over from the previous throw (it
    // only ever counts up, past the 1000000 exit threshold, and nothing used
    // to reset it here). When Mirror Ball relaunches SpinCycle through this
    // same branch, stepSpinCycle() would see that stale huge value on the
    // very first tick and immediately exit the circular phase again, skipping
    // the actual spin - the relaunch looked like a plain fast pitch instead
    // of "the same power-up" replaying. Reset it so every throw spins fresh.
    app.spinCycleSpeed = 0;
    app.spinCycleSoundOn = false; // sound starts once the ball actually begins spinning, see stepSpinCycle()
  } else if (pitchName === 'DroneBall') {
    ball.xSpeed = lenX(10);
    ball.accel = 0;
    ball.y = toY(275); // clearly mid-zone (265-290), not right on the boundary - must be a strike
    app.droneBallActive = true;
    app.droneNum = randRange(0, 6);
    playSound(POWER_SOUNDS.droneBall); // starts the instant the drone launches, loops for as long as it's moving
  } else if (pitchName === 'Ghost') {
    // Bug fix: Ghost Ball's Z-key arm never went through this function (it
    // materializes instantly with no windup), so this case was missing
    // entirely - after Mirror Ball's bounce-back replays the windup and calls
    // applyPitchVelocity(app.pitch) to launch pitch #2, 'Ghost' matched
    // nothing here and the decoys never reappeared. Now the windup-driven
    // relaunch (the only caller that reaches this branch) re-arms them the
    // same way the original Z-key throw does.
    app.ghostActive = true;
    const n = randRange(0, 3);
    ghostBalls.forEach((g, i) => { g.visible = true; g.isReal = (i === n); g.x = toX(80); });
  } else if (pitchName === 'Meteor') {
    // Same bug/fix as Ghost Ball above, for Meteor's relaunch.
    app.meteorActive = true;
    // Bug fix: starting this far off-screen meant a ~45-tick/1.1s pause
    // between the Z-key press and the meteor actually appearing, since
    // stepMeteor() doesn't set ball.x/y (or move it visibly) until meteorX/Y
    // cross lenX(4)/toLen(33). lenX(70)/toLen(34) is exactly where the old
    // start (-lenX(200)/-toLen(200)) would have first crossed that threshold
    // anyway (45 ticks in, at the same fall rate) - so it now appears
    // instantly at that same spot instead of waiting to get there, and the
    // fall itself (speed, angle, everything after that point) is unchanged.
    app.meteorX = lenX(70);
    app.meteorY = toLen(34);
  }
}

/* ============================== ROSTER HELPERS ============================== */
function pitcherChar() {
  const key = app.activePitcherKey;
  const idx = key === 'p1' ? app.player1Index : key === 'p2' ? app.player2Index : app.cpuBatterIndex;
  return CHARACTERS[idx];
}
function batterChar() {
  const key = app.activeBatterKey;
  const idx = key === 'p1' ? app.player1Index : key === 'p2' ? app.player2Index : app.cpuBatterIndex;
  return CHARACTERS[idx];
}

/* ============================== CORE RULES: HIT / OUT / STRIKE / BALL ============================== */
function battingTeamIsHome() { return !app.homePitching; }

function scoreRun() {
  if (battingTeamIsHome()) homeScore++; else awayScore++;
  // Solo mode: p1 is always awayScore for the whole match (see
  // assignActiveRoles()'s comment - p1 is the away team there, so it bats
  // first) - track the largest deficit the human has faced, for the "won
  // after trailing by 3+" unlock condition (evaluateGameEndUnlocks()).
  if (app.mode === 'solo') {
    app.maxDeficitThisGame = Math.max(app.maxDeficitThisGame, homeScore - awayScore);
    // Rally difficulty (requested): every 7 runs the human scores in a
    // single half-inning at bat, cpuPitch() bumps its pitch tier up by one
    // (capped at Hard) for the rest of that half - see its own comment.
    if (!battingTeamIsHome()) {
      app.runsThisHalfInning++;
      // Rally difficulty applies to baby mode too (requested): scoring 7
      // runs in a half-inning while still in baby mode graduates it into a
      // normal Easy-tier game, permanently (even for a later inning) -
      // "and so on like normal" from there means the existing rally-
      // difficulty step above should then apply exactly as it always does
      // for a non-baby-mode game: another 7 runs bumps to Normal, another 7
      // to Hard, capped. Subtracting the 7 runs "spent" graduating resets
      // this half-inning's own counter to 0 so that formula sees a fresh
      // Easy-tier start instead of counting them a second time (which would
      // jump straight to Normal instead of landing on Easy first).
      if (!saveData.babyModeDone && app.runsThisHalfInning >= 7) {
        saveData.babyModeDone = true;
        persistSaveData();
        app.difficultyIndex = 0; // Easy - the CPU is always Antman (rank 0) during a baby-mode-eligible first game anyway, but make it explicit
        app.runsThisHalfInning -= 7;
      }
    }
  }
}

function clearCounts(clearOuts) {
  strikeFills[0] = strikeFills[1] = strikeFills[2] = 'dimgray';
  ballFills[0] = ballFills[1] = ballFills[2] = ballFills[3] = 'dimgray';
  if (clearOuts) outFills[0] = outFills[1] = outFills[2] = 'dimgray';
}

function clearPowerupVisuals() {
  app.batFireVisible = false;
  criticalRadius = baseCriticalRadius();
  crosshairRadius = baseCrosshairRadius();
  crosshairStyle = 'normal';
  critHidden = false;
  app.paused = false;
  app.showFutureSight = false;
  // Bug fix: shieldWidth was never reset anywhere - once Ice Shield had been
  // armed, it stayed active (until worn down by 3 catches) across every
  // future pitch, at-bat, and inning, even ones with a completely different
  // batter. A stale shield from an earlier turn could then wrongly intercept
  // an unrelated later pitch - e.g. swallowing a Meteor into a Ball instead
  // of letting its guaranteed-strike resolution play out. Clear it at the
  // same contact/inning-change point every other persistent bat power resets.
  app.shieldWidth = 0;
  app.batterBig = false;
  // Bug fix (requested): Mirror Ball/Time Stop are armed on M-press same as
  // every other bat power above, but only actually resolve on a LATER event
  // (an unswung strike reaching the plate, or the ball crossing toX(250) -
  // see resolveUnswungStrike()/the app.stopTime check in update()). If the
  // batter got out or the half-inning ended before that ever happened, these
  // two were never included here, so they silently carried over armed into
  // a future at-bat (even a different batter's) instead of clearing like
  // every other power does at the same contact/inning-change point.
  app.mirrorBallActive = false;
  app.stopTime = false;
}

// Maps a live pitch name (Fastball/EFastball/HFastball/FastballPlus, etc.)
// down to one of the 4 base pitch types for the "hit off every pitch type"
// unlock condition - substring checks absorb every E-/H- difficulty prefix
// and the Plus suffix uniformly. Power pitches with their own custom
// trajectory (Ghost/Meteor/SpinCycle/DroneBall) don't match any of the 4 and
// return null - they aren't one of "fastball/curveball/riser/knuckleball".
function basePitchType(pitchName) {
  if (!pitchName) return null;
  if (pitchName.includes('Fastball')) return 'fastball';
  if (pitchName.includes('Curveball')) return 'curveball';
  if (pitchName.includes('Riser')) return 'riser';
  if (pitchName.includes('Knuckleball')) return 'knuckleball';
  return null;
}

function recordBaseHit() {

  // Solo-mode progression: a "hit" here always means a real Single/Double/
  // Home Run (a Ground Out routes through recordOut() instead, never here).
  if (app.mode === 'solo') {
    if (app.activeBatterKey === 'cpu') {
      // Human is pitching and just allowed a hit - for the no-hitter condition.
      app.hitsAllowedByHumanThisGame++;
    } else {
      // Human is batting. Oracle's condition is scoped to a single inning
      // (see app.pitchTypesHitThisInning's own comment) rather than
      // cumulative across the whole save file.
      const type = basePitchType(app.lastPitchThrown);
      if (type) {
        app.pitchTypesHitThisInning[type] = true;
        const pts = app.pitchTypesHitThisInning;
        if (pts.fastball && pts.curveball && pts.riser && pts.knuckleball) unlockCharacter('player', 'oracle');
      }
      if (app.homeRun) {
        if (!saveData.stats.everHitHomeRun) {
          saveData.stats.everHitHomeRun = true;
          unlockCharacter('player', 'bruiser');
        }
        // Snapshot before the bases-clearing loop below empties them - a
        // grand slam is a Home Run with all 3 bases occupied at contact.
        if (bases.every(b => b === 'gold')) unlockCharacter('player', 'trickster');
      }
      persistSaveData();
    }
  }

  if (app.voidActive) { ball.visible = true; app.voidActive = false; }
  clearPowerupVisuals();

  if (app.homeRun) {
    showCallBanner('Home Run');
    homeRunSound.currentTime = 0;
    homeRunSound.play().catch(() => {});
    clearCounts(false);
    scoreRun();
    // Pause upgrades a would-be Home Run into a golden one worth 3 runs for
    // the batter (instead of 1) - runners already on base still score
    // separately below, same as any other Home Run.
    if (app.goldenHomeRun) { scoreRun(); scoreRun(); }
    for (let i = 0; i < 3; i++) {
      if (bases[i] === 'gold') { scoreRun(); bases[i] = 'grey'; }
    }
  } else if ((ball.xSpeed + ball.ySpeed) < -lenX(25)) {
    showCallBanner('Double');
    playSound(SOUNDS.double);
    if (bases[1] === 'gold') { bases[1] = 'grey'; scoreRun(); }
    if (bases[2] === 'gold') { bases[2] = 'grey'; scoreRun(); }
    if (bases[0] === 'gold') { bases[0] = 'grey'; bases[2] = 'gold'; }
    bases[1] = 'gold';
  } else {
    showCallBanner('Single');
    playSound(SOUNDS.single);
    for (let i = 0; i < 3; i++) {
      if (bases[i] === 'grey') { bases[i] = 'gold'; resetBall(); return; }
      if (i === 2) scoreRun();
    }
  }
  resetBall();
}

function recordOut() {
  // Tutorial pitching drill: the CPU batter is forced to always whiff (see
  // cpuSwing()) and every Ball is redirected into a Strike (see recordBall()),
  // so the only way this ever fires during that drill is the 3rd strike - a
  // genuine strikeout, already clearly signposted by the 3rd "Strike" banner.
  // The tutorial now runs inside the actual first real match rather than a
  // discarded practice bubble (requested), so this out DOES need to count for
  // real (see stepTutorial()'s 'awaiting_pitch_turn' handoff) - only the
  // redundant "Out" banner/sound stacked right on top of that 3rd "Strike"
  // banner gets skipped, same as before.
  const isTutorialPitchDrillOut = app.tutorial.active && app.tutorial.forceStrikeOnBall;
  if (isTutorialPitchDrillOut) {
    app.tutorial.pitchingStrikeoutDone = true;
  } else {
    showCallBanner('Out');
    playSound(SOUNDS.out);
  }
  // Every out ends that batter's plate appearance, including a Ground Out
  // reached via contact (see the ball.y >= toY(300) ground-bounce check in
  // update(), which calls recordOut() directly) - Future Sight must clear
  // here unconditionally rather than only on the 3rd/inning-ending out
  // clearPowerupVisuals() below already handles, otherwise a 1st/2nd-out
  // Ground Out would leave it armed for the next batter's first pitch for
  // free. The other "persists through a strike" powers (Guaranteed Contact,
  // Blackout Swing, etc.) are deliberately left alone here - only Future
  // Sight is meant to be one-pitch-only.
  app.showFutureSight = false;

  // Tutorial's first inning (requested): any single out - the guided
  // strikeout above, or a real one during the batting free-play stretch
  // (see stepTutorial()'s 'awaiting_pitch_turn' check) - ends that half
  // immediately instead of needing all 3, the same shortcut on both sides
  // of the inning for consistency. bat_easy can't actually reach here at
  // all (every miss wipes outFills back to dimgray - see resetBall()), so
  // this only ever fires for the two cases above.
  if (app.tutorial.active) {
    outFills[0] = 'gold';
    bases[0] = bases[1] = bases[2] = 'grey';
    showCallBanner('Switch Sides!');
    clearCounts(true);
    app.batPowerFull = true; app.pitchPowerFull = true;
    clearPowerupVisuals();
    switchSides();
    return;
  }

  for (let i = 0; i < 3; i++) {
    if (outFills[i] === 'dimgray') { outFills[i] = 'gold'; return; }
    if (i === 1) {
      bases[0] = bases[1] = bases[2] = 'grey';
      showCallBanner('Switch Sides!');
      clearCounts(true);
      // Refills every half-inning regardless of inning number - power-ups
      // stay available through extra innings too, not just innings 1-2.
      app.batPowerFull = true; app.pitchPowerFull = true;
      clearPowerupVisuals();
      switchSides();
      return;
    }
  }
}

function switchSides() {
  app.homePitching = !app.homePitching;
  assignActiveRoles();
  if (app.homePitching) {
    // A full inning just completed (away finished batting) - advance inning number.
    // 2 innings total (requested) - game-over now fires once inningNumber
    // would advance past 2, not 3.
    inningNumber++;
    if (inningNumber === 2) inningSuffix = 'nd';
    else {
      if (homeScore === awayScore) {
        inningSuffix = 'th';
        showCallBanner('Extra Innings');
      } else {
        // Show the custom Game Over screen instead of a blocking alert() -
        // capture the winner now, before the player presses "Back To Menu"
        // (see handlePointerDown()/the keydown dispatcher's 'gameOver' case)
        // triggers goToCharacterSelectAfterGameOver(), which resets
        // homeScore/awayScore back to 0.
        // p1 is home in versus but away in solo (see assignActiveRoles()'s
        // comment), so which score means "p1 won" flips by mode.
        app.gameOverP1Wins = app.mode === 'solo' ? awayScore > homeScore : homeScore > awayScore;
        if (app.mode === 'solo') evaluateGameEndUnlocks();
        pokiGameplayStop();
        // Opponent win/lose line (requested) - fires right here, right after
        // the 3rd out of the final inning, rather than after the player
        // later leaves the gameOver screen. The screen stays 'play' (field
        // still visible underneath, same as the tutorial's own dialogue)
        // until the line is dismissed - that dismissal is what actually
        // advances to gameOver.
        const opp = app.mode === 'solo' ? CHARACTERS[app.cpuBatterIndex] : null;
        const oppLines = opp ? OPPONENT_LINES[opp.key] : null;
        if (oppLines) {
          // These are the OPPONENT's own lines - if the human (p1) won, the
          // opponent lost, so gameOverP1Wins=true selects their 'lose' line.
          showDialog(opp.name, portraits[opp.key], [oppLines[app.gameOverP1Wins ? 'lose' : 'win']], () => {
            app.screen = 'gameOver';
          });
        } else {
          app.screen = 'gameOver';
        }
      }
    }
  }
}

// Checked once, right as a solo match ends - covers every unlock condition
// that depends on the game's final win/loss (the ones that can be detected
// mid-game instead - first home run, grand slam, 25th cumulative strikeout,
// all 4 pitch types hit - are already handled where they happen, in
// recordBaseHit()/recordStrike()). Populates app.newlyUnlocked for the
// post-game unlockReveal screen (see goToCharacterSelectAfterGameOver()).
function evaluateGameEndUnlocks() {
  // Reset every call (not just inside the win branch below) so a loss never
  // leaves a stale amount from an earlier win showing on drawGameOver().
  app.lastCoinsEarned = 0;
  // Baby mode (requested) ends once the first game is over, win or lose -
  // it used to also end early the moment the human scored their first run,
  // but that meant batting could suddenly get harder again right when a
  // struggling player was finally feeling good about it. Now it covers the
  // whole first game unconditionally - see cpuPitch()'s babySet.
  if (!saveData.babyModeDone) {
    saveData.babyModeDone = true;
    persistSaveData();
  }
  // Tournament mode (requested) doesn't pay out per-match like a Story win -
  // it pays out once, right here, the moment the run actually ends (a loss,
  // or winning the final) - not later in handleTournamentProgression(),
  // since drawGameOver() (which shows app.lastCoinsEarned) renders before
  // that ever runs. Every match's runs count toward the eventual reward
  // regardless of that match's own outcome.
  if (app.soloGameMode === 'tournament' && app.tournament) {
    app.tournament.totalRuns += awayScore;
    const wonTheFinal = app.gameOverP1Wins && app.tournament.round >= 2;
    if (!app.gameOverP1Wins || wonTheFinal) {
      const coinsEarned = tournamentReward(wonTheFinal ? 3 : app.tournament.wins);
      saveData.coins += coinsEarned;
      app.lastCoinsEarned = coinsEarned;
      if (wonTheFinal) saveData.tournamentTrophies[CHARACTERS[app.player1Index].key] = true;
    }
  }
  if (app.gameOverP1Wins) {
    // Only ever called for solo (see switchSides()'s call site), where p1
    // is the away team - awayScore is the human's own score here.
    if (app.soloGameMode !== 'tournament') {
      const coinsEarned = WIN_BASE_COINS + awayScore * WIN_COINS_PER_RUN;
      saveData.coins += coinsEarned;
      app.lastCoinsEarned = coinsEarned;
    }

    if (awayScore >= 10) unlockCharacter('player', 'pyro');
    if (app.maxDeficitThisGame >= 3) unlockCharacter('player', 'gambler');
    if (!app.humanUsedPowerThisGame) unlockCharacter('player', 'shadow');
    if (app.hitsAllowedByHumanThisGame === 0) unlockCharacter('player', 'strategist');

    const myKey = CHARACTERS[app.player1Index].key;
    if (myKey !== 'scientist') saveData.stats.winsWithCharacter[myKey] = true;
    if (CHARACTERS.filter(c => c.key !== 'scientist').every(c => saveData.stats.winsWithCharacter[c.key])) {
      unlockCharacter('player', 'scientist');
    }

    // CPU roster advances one slot past whichever CPU character was just
    // beaten - Story mode only (requested). Tournament opponents are a
    // random draw shown fully unlocked regardless (see drawSoloSelect()'s
    // isTournament branch) and don't represent real roster progression, so a
    // tournament win shouldn't also advance the normal Story-mode unlock order.
    if (app.soloGameMode !== 'tournament') {
      const cpuKey = CHARACTERS[app.cpuBatterIndex].key;
      const rank = PROGRESSION_ORDER.indexOf(cpuKey);
      if (rank >= 0 && rank + 1 < PROGRESSION_ORDER.length) unlockCharacter('cpu', PROGRESSION_ORDER[rank + 1]);
    }
  }
  persistSaveData();
}

function assignActiveRoles() {
  if (app.mode === 'solo') {
    // p1 is the AWAY team in solo (bats first, correctly in the top of the
    // 1st - see startMatch()'s comment) - cpu is home (pitches first,
    // fields while away bats). battingTeamIsHome()/scoreRun() below follow
    // from this: p1's runs land in awayScore, cpu's in homeScore, for the
    // whole match.
    if (app.homePitching) { app.activePitcherKey = 'cpu'; app.activeBatterKey = 'p1'; }
    else {
      app.activePitcherKey = 'p1'; app.activeBatterKey = 'cpu';
    }
    if (app.activeBatterKey === 'p1') {
      // A fresh half-inning of human batting is starting (called from
      // startMatch() or switchSides(), never mid-turn) - Oracle's "every
      // pitch type in one inning" condition gets a clean slate each time.
      app.pitchTypesHitThisInning = { fastball: false, curveball: false, riser: false, knuckleball: false };
      app.runsThisHalfInning = 0; // rally difficulty (see scoreRun()/cpuPitch()) - fresh count each half-inning
    }
  } else {
    if (app.homePitching) { app.activePitcherKey = 'p1'; app.activeBatterKey = 'p2'; }
    else { app.activePitcherKey = 'p2'; app.activeBatterKey = 'p1'; }
  }
}

function recordStrike() {
  showCallBanner('Strike');
  playSound(SOUNDS.strike);
  if (app.voidActive) { ball.visible = true; app.voidActive = false; }
  app.timeStopActive = false;
  app.meteorActive = false;
  // Future Sight is a one-pitch preview, unlike Guaranteed Contact/Blackout
  // Swing/Expand/Fire (which deliberately persist through a called strike
  // below) - it must go away the instant THIS pitch is done, whether that's
  // a strike or (see recordBall()) a ball. Mirage/Mirror Ball's own internal
  // resetBall() cycling never routes through recordStrike()/recordBall()
  // mid-sequence (see stepMirage()/the reverseBall branch in update()), so
  // this only fires once the pitch has genuinely concluded, not on every
  // one of their same-pitch fake sub-cycles.
  app.showFutureSight = false;
  for (let i = 0; i < 3; i++) {
    if (strikeFills[i] === 'dimgray') { strikeFills[i] = 'gold'; return; }
    if (i === 1) {
      // 3rd strike - a genuine strikeout, distinct from a fielded/ground out
      // (which never calls recordStrike() at all) - the only place this
      // distinction can be made, since recordOut() itself has no idea why
      // it was called. Only counts when the human is the one pitching.
      if (app.mode === 'solo' && app.activePitcherKey !== 'cpu') {
        saveData.stats.totalStrikeouts++;
        if (saveData.stats.totalStrikeouts >= 25) unlockCharacter('player', 'iceman');
        persistSaveData();
      }
      clearCounts(false); recordOut(); return;
    }
  }
}

function forceWalk() {
  showCallBanner('Walk');
  // Bug fix: a walk starts a fresh plate appearance, same as any other
  // concluded at-bat - the strike count needs to reset right along with the
  // ball count instead of carrying over into the next batter's count.
  clearCounts(false);
  for (let j = 0; j < 3; j++) {
    if (bases[j] === 'grey') { bases[j] = 'gold'; return; }
    if (j === 2) { scoreRun(); return; }
  }
}

function recordBall() {
  // Tutorial pitching drill: every pitch must count as a Strike so the
  // player reliably lands a strikeout instead of stalling out on a walk.
  if (app.tutorial.active && app.tutorial.forceStrikeOnBall) { recordStrike(); return; }
  showCallBanner('Ball');
  playSound(SOUNDS.ball);
  if (app.voidActive) { ball.visible = true; app.voidActive = false; }
  app.showFutureSight = false; // one-pitch preview - see recordStrike()'s comment
  for (let i = 0; i < 4; i++) {
    if (ballFills[i] === 'dimgray') { ballFills[i] = 'gold'; return; }
    if (i === 2) { forceWalk(); return; }
  }
}

/* ============================== DICE / GAMBLER MINIGAME ============================== */
const DICE_PIP_LAYOUTS = [
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
];

function drawDiceFace(cx, cy, size, faceIndex) {
  rect(cx - size / 2, cy - size / 2, size, size, 'white', 1, '#333', 2);
  const layout = DICE_PIP_LAYOUTS[faceIndex] || [];
  layout.forEach(([px, py]) => circle(cx + px * size * 0.28, cy + py * size * 0.28, size * 0.09, '#222'));
}

const DICE_ROLL_STEPS = 50; // slowed down (was 20) so the roll reads as a real animation

function startDiceRoll(forBatting) {
  app.diceRolling = true;
  app.diceForBatting = forBatting;
  app.diceCount = 0;
  app.diceSettling = false;
  app.diceSettleHoldCount = 0;
  app.diceExiting = false;
  // Bug fix: the outcome used to be derived from `diceCount * 1738.2 + diceSeed`,
  // but diceCount is always the same fixed value at resolution time, so that term
  // always contributed the exact same constant - the roll was effectively frozen
  // regardless of diceSeed. Roll the real outcome fresh right here, independent of
  // whatever face the spinning animation happens to be cycling through.
  app.diceFinalFace = randRange(0, 6);
  app.diceSeed = randRange(0, 6); // only drives the spinning-face display now
  app.diceCardVisible = false;
  playSound(forBatting ? POWER_SOUNDS.gamblerBatting : POWER_SOUNDS.gamblerPitching);
}

const DICE_SETTLE_HOLD = 25; // ticks the final rolled face freezes on-screen before the card slides in

function stepDiceRoll() {
  if (app.diceCount < DICE_ROLL_STEPS) {
    app.diceCount++;
    if (app.diceCount >= DICE_ROLL_STEPS) {
      // Pause on the final result (frozen, not still cycling) for a beat
      // before the outcome card starts flying in.
      app.diceSettling = true;
      app.diceSettleHoldCount = 0;
      // The dice stop rolling here, so the sound stops here too instead of
      // running through the settle hold/card-slide beats that follow.
      stopSound(app.diceForBatting ? POWER_SOUNDS.gamblerBatting : POWER_SOUNDS.gamblerPitching);
    }
  }
}

const DICE_CARD_START_X = 160; // card starts this far off to the side (unscaled), then flies in

function resolveDiceRoll() {
  const face = app.diceFinalFace;
  app.diceCardVisible = true;
  app.diceCardX = lenX(DICE_CARD_START_X);
  app.diceOutcomeNumber = String(face + 1);
  const pitchOutcomes = ['Automatic Walk', 'Ball Expand', 'Ball Slowdown', 'Better Pitch', 'Ball Shrink', 'Automatic Strikeout'];
  const batOutcomes = ['Automatic Strike', 'Small Bat', 'No Homerun', 'Homerun Boost', 'Big Bat', 'Automatic Homerun'];
  app.diceOutcomeText = app.diceForBatting ? batOutcomes[face] : pitchOutcomes[face];
  app.diceOutcomeFace = face;
}

function finishDiceCardScroll() {
  app.diceRolling = false;
  app.diceCardVisible = false;
  const face = app.diceOutcomeFace;
  if (!app.diceForBatting) {
    const keepRadius = face === 1 ? toLen(5) : face === 4 ? toLen(1.5) : null;
    const keepBallSlow = face === 2, keepBallFast = face === 3;
    if (face === 0) forceWalk();
    else if (face === 5) recordOut();
    resetBall();
    if (keepRadius) ball.radius = keepRadius;
    if (keepBallSlow) app.ballSlow = true;
    if (keepBallFast) app.ballFast = true;
  } else {
    // Bug fix: face 0 and face 5 both conclude the at-bat outright (a called
    // strike / an automatic home run), but neither used to call resetBall(),
    // so the ball's own in-flight state (if any pitch happened to be live)
    // was left dangling and could still resolve its own separate call right
    // after - resetBall() now cleans that up the same way every other
    // play-ending event does. Faces 1-4 only adjust the crosshair for the
    // batter's upcoming/current swing, so they must NOT resetBall() (that
    // would wipe out the very pitch the batter is reacting to).
    if (face === 0) { resetBall(); recordStrike(); }
    // Small Bat is a one-pitch penalty, not a persistent one like Guaranteed
    // Contact/Blackout Swing - smallBatActive gets checked and cleared the
    // next time resetBall() runs (i.e. once the very next pitch concludes).
    else if (face === 1) { crosshairRadius = toLen(8); criticalRadius = toLen(2); app.smallBatActive = true; }
    else if (face === 2) { criticalRadius = toLen(0.01); }
    else if (face === 3) { criticalRadius = toLen(6); }
    else if (face === 4) { crosshairRadius = toLen(17); criticalRadius = toLen(5); }
    else if (face === 5) {
      app.homeRun = true;
      showCallBanner('Home Run');
      homeRunSound.currentTime = 0;
      homeRunSound.play().catch(() => {});
      clearCounts(false);
      scoreRun();
      bases.forEach((b, i) => { if (b === 'gold') scoreRun(); bases[i] = 'grey'; });
      resetBall();
    }
  }
}

/* ============================== CPU AI ============================== */
// Chance (out of 100) the CPU activates its power-up on any single pitch/
// swing attempt while its meter is full - see activatePitchPower()'s call
// in cpuPitch() and activateCpuBatPower()'s call in cpuSwing(). Rolled once
// per attempt rather than once per half-inning, so across the handful of
// pitches/swings in a half-inning it fires "randomly" without being
// deterministic - pitchPowerFull/batPowerFull's existing once-per-half-
// inning refill already caps it at one use.
const CPU_POWER_CHANCE = 30;

// Rolls a 0-1000 contact roll against explicit whiff/single/double slot
// sizes (whatever's left over after whiff+single+double goes to home run) -
// shared by the base CPU swing odds and every activateCpuBatPower() table
// below, so every tier boundary is computed the same way in one place.
function rollContactTier(whiff, single, double) {
  const roll = randRange(0, 1000);
  if (roll < whiff) return 'whiff';
  if (roll < whiff + single) return 'single';
  if (roll < whiff + single + double) return 'double';
  return 'homerun';
}
function applyContactTier(tier) {
  if (tier === 'single') { ball.xSpeed = -lenX(randRange(10, 20)); ball.ySpeed = -toLen(randRange(7, 12)); }
  else if (tier === 'double') { ball.xSpeed = -lenX(randRange(24, 28)); ball.ySpeed = -toLen(randRange(18, 22)); }
  else if (tier === 'homerun') { ball.xSpeed = -lenX(40); ball.ySpeed = -toLen(20); app.homeRun = true; }
}

// CPU batting power-ups: unlike the human M-key powers (which mostly change
// crosshair size/visibility for a real human to aim with), a CPU doesn't
// aim at all - cpuSwing() is a pure dice roll. So instead of reusing the
// M-key handler, each bat power gets its own contact-tier table here. Fire
// and Guaranteed Contact/Expand Shot follow exact behavior specified for
// this feature (see PLAYER_UNLOCK_CONDITIONS' neighboring comment block);
// the remaining power-ups (whose real effect is an aim/timing aid with no
// clean autonomous-roll analog) get a flat, clearly-labeled moderate boost.
function activateCpuBatPower() {
  app.batPowerFull = false;
  const power = batterChar().bat.key;

  if (power === 'gamblerBatting') {
    // Already outcome-random rather than aim-based - reuse the real dice
    // minigame exactly as the human M-key does.
    startDiceRoll(true);
    return;
  }

  playAnimation('batter');
  app.isBatting = true;
  app.swung = true;
  ball.accel = -toLen(0.2);

  let tier;
  if (power === 'guaranteedContact') {
    // "Guaranteed hit... a homerun isn't possible" - no whiff, no HR slot.
    tier = rollContactTier(0, 650, 350);
  } else if (power === 'fire') {
    // "Odds of a hit don't go up... if they do hit it, it'll be a homerun" -
    // same whiff rate as the unmodified base table, all the rest is HR.
    tier = rollContactTier(755, 0, 0);
  } else if (power === 'expandShot') {
    // "Expands the crosshair, likelihood of a hit goes up" - hit rate ~55%
    // vs. the base table's 24.5%.
    tier = rollContactTier(450, 350, 130);
  } else if (power === 'pause') {
    // Real Pause upgrades the outcome by one tier - mirrored directly:
    // whiff becomes a Single, anything that already made contact becomes a
    // Home Run (the further "would-be HR becomes golden" upgrade doesn't
    // apply here - that's an exceedingly rare tier to land on already).
    tier = rollContactTier(755, 172, 49) === 'whiff' ? 'single' : 'homerun';
  } else if (power === 'mirrorBall') {
    // Real Mirror Ball gives an unswung strike a second identical pitch
    // instead of calling it - translated as one extra roll on a whiff.
    tier = rollContactTier(755, 172, 49);
    if (tier === 'whiff') tier = rollContactTier(755, 172, 49);
  } else {
    // timeStop/blackoutSwing/iceShield/futureSight - all 4 are inherently
    // human-aim aids (slow the ball down, enlarge the hitbox, a defensive
    // shield, a pitch preview) with no clean 1:1 autonomous-roll analog -
    // a flat, modest boost stands in for all four.
    tier = rollContactTier(600, 280, 90);
  }
  applyContactTier(tier);
}

// [whiffBoundary, singleBoundary, doubleBoundary] out of 1000, indexed by
// app.difficultyIndex - anything beyond doubleBoundary is a Home Run. Total
// hit rate (1000 - whiffBoundary) is 20% Easy / 24.5% Normal (the original,
// unchanged, rate) / 28% Hard (requested), with the Single/Double/Home Run
// split within that hit rate kept at the original ~70/20/10 proportions for
// all three, just scaled to each difficulty's overall rate.
const CPU_BAT_ODDS_BY_DIFFICULTY = [
  [800, 940, 980], // Easy - 20% hit rate (140 Single / 40 Double / 20 HR)
  [755, 927, 976], // Normal - 24.5% hit rate (172 Single / 49 Double / 24 HR)
  [720, 917, 973], // Hard - 28% hit rate (197 Single / 56 Double / 27 HR)
];

function cpuSwing() {
  app.cpuSwung = true;
  // Tutorial pitching drill: guarantee the strikeout instead of leaving it to
  // the CPU's normal ~24.5% contact odds, which could stall the drill for a
  // long, un-fun stretch of at-bats.
  if (app.tutorial.active && app.tutorial.forceWhiffCpuBatter) return;
  // CPU power-up usage: rolled once per swing attempt while the meter is
  // full (see CPU_POWER_CHANCE) - takes priority over the opposing pitch-
  // power odds-reduction below, same as a human M-key press isn't blocked
  // by an in-flight pitch power either.
  if (app.batPowerFull && randRange(0, 100) < CPU_POWER_CHANCE) {
    activateCpuBatPower();
    return;
  }
  if (app.powerUpActive) {
    // A special pitch effect is in play (disguised/tricky ball), so contact
    // odds drop from 24.5% to exactly 10% - same 70/20/10 Single/Double/Home
    // Run split among that 10%. Rolled out of 1000: 900 whiff / 70 Single /
    // 20 Double / 10 Home Run.
    const roll = randRange(0, 1000);
    if (roll < 900) { /* whiff - 90% */ }
    else if (roll < 970) { ball.xSpeed = -lenX(randRange(10, 20)); ball.ySpeed = -toLen(randRange(7, 12)); } // Single - 7%
    else if (roll < 990) { ball.xSpeed = -lenX(randRange(24, 28)); ball.ySpeed = -toLen(randRange(18, 22)); } // Double - 2%
    else { ball.xSpeed = -lenX(40); ball.ySpeed = -toLen(20); app.homeRun = true; } // Home Run - 1%
  } else if (app.pitch === 'Curveball' && randRange(0, 100) < 10) {
    // CPU lays off 10% of Curveballs - since Curveball is the one pitch that
    // breaks below the zone, not swinging correctly resolves as a Ball.
  } else {
    playAnimation('batter');
    app.isBatting = true;
    app.swung = true;
    ball.accel = -toLen(0.2);
    // Overall contact odds now scale with difficulty (requested) - the
    // Single/Double/Home Run split within that contact rate keeps the
    // original ~70/20/10 proportions (see CPU_BAT_ODDS_BY_DIFFICULTY),
    // just scaled up or down together with the total hit rate.
    let [whiffB, singleB, doubleB] = CPU_BAT_ODDS_BY_DIFFICULTY[app.difficultyIndex];
    // Bug fix (this pitch's actual tier now comes from the timing meter, not
    // a fixed shop level - see PITCH_ZONE_LEVELS/handleGameplayKey() - so this
    // used to read a now-nonexistent flat saveData.pitchUpgrades[type] number.
    // A Hard pitch (good timing) shaves 4 percentage points off the CPU's hit
    // rate (40/1000), Normal (okay timing) shaves 2 (20/1000), Easy (bad
    // timing) shaves none - pulled from the Single tier's width (singleB/
    // doubleB stay put) since a sharper pitch should turn marginal contact
    // into a whiff, not erase a clean double/homer that was already going to
    // happen. Doesn't touch versus mode or any power-pitch (those take the
    // app.powerUpActive branch above, never reach here).
    if (app.mode === 'solo') {
      const pitchType = basePitchType(app.pitch);
      if (pitchType) {
        const tierBonus = app.pitch.startsWith('H') ? 40 : app.pitch.startsWith('E') ? 0 : 20;
        whiffB = Math.min(singleB, whiffB + tierBonus);
      }
    }
    const roll = randRange(0, 1000);
    if (roll < whiffB) { /* whiff */ }
    else if (roll < singleB) { ball.xSpeed = -lenX(randRange(10, 20)); ball.ySpeed = -toLen(randRange(7, 12)); } // Single
    else if (roll < doubleB) { ball.xSpeed = -lenX(randRange(24, 28)); ball.ySpeed = -toLen(randRange(18, 22)); } // Double
    else { ball.xSpeed = -lenX(40); ball.ySpeed = -toLen(20); app.homeRun = true; } // Home Run
  }
}

function cpuPitch() {
  // Tutorial batting drill (bat_easy) scripts an exact pitch instead of the
  // CPU's normal random selection, so the difficulty ramps up exactly the
  // way the drill promises.
  if (app.tutorial.active && app.tutorial.forcedPitch) {
    app.pitch = app.tutorial.forcedPitch;
    app.isPitching = true;
    return;
  }
  // Baby mode (requested): a brand-new player's whole first game (see
  // evaluateGameEndUnlocks()) gets the same 4 pitch types but a much
  // slower, near-straight version of each (see applyPitchVelocity()'s
  // babySet table) instead of the CPU's normal difficulty-tiered pitching -
  // and skips the CPU's own power-up roll entirely, since a power pitch
  // (Ghost/Meteor/Void/...) would undo the whole point by throwing
  // something far less predictable than even a Hard-tier plain pitch.
  if (app.mode === 'solo' && !saveData.babyModeDone) {
    const babySet = ['BFastball', 'BCurveball', 'BKnuckleball', 'BRiser'];
    app.pitch = babySet[randRange(0, babySet.length)];
    app.isPitching = true;
    return;
  }
  // CPU power-up usage: functions identically to the human Z key (see
  // activatePitchPower()) - just rolled randomly instead of key-pressed.
  // Same !ghostBalls[0].visible guard the Z-key handler uses (a narrow race
  // window where a decoy is about to appear but hasn't started tracking yet).
  if (app.pitchPowerFull && !ghostBalls[0].visible && randRange(0, 100) < CPU_POWER_CHANCE) {
    activatePitchPower();
    return;
  }
  const sets = [
    ['EFastball', 'ECurveball', 'EKnuckleball', 'ERiser'],
    ['Fastball', 'Curveball', 'Knuckleball', 'Riser'],
    ['HFastball', 'HCurveball', 'HKnuckleball', 'HRiser'],
  ];
  // Rally difficulty (requested): every 7 runs the human scores in this
  // half-inning bumps the CPU's pitch tier up by one, capped at Hard (index
  // 2) - "if the difficulty can't increase it stays the same." Only reads
  // app.runsThisHalfInning in solo (it's always 0 in versus, a no-op there).
  const boost = app.mode === 'solo' ? Math.floor(app.runsThisHalfInning / 7) : 0;
  const options = sets[Math.min(2, app.difficultyIndex + boost)];
  app.pitch = options[randRange(0, options.length)];
  app.isPitching = true;
}

/* ============================== INPUT: MENUS ============================== */
// Arrow keys and Space default to scrolling the page in every browser -
// harmless on its own (html/body are overflow:hidden here), but Poki embeds
// the game in an iframe on their own page, which is NOT overflow:hidden, so
// an unprevented arrow/space press bubbles up and scrolls Poki's page
// around the game instead. Arrow keys are the game's own pitching/menu
// controls anyway; Space isn't used for anything but still needs blocking.
const SCROLL_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
window.addEventListener('keydown', e => {
  if (SCROLL_KEYS.has(e.key)) e.preventDefault();
  // A commercialBreak() is pending (ad overlay up, or about to be) - the
  // player is still sitting on whatever menu screen they were on
  // underneath it, so without this every key here would keep driving that
  // screen (cycling characters, re-confirming Play, ...) right through the
  // ad. Freeze all input dispatch until the break resolves; preventDefault
  // above still runs so a stray arrow/space press can't scroll the page
  // either.
  if (pokiBreakPending) return;
  ensureMusicStarted();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();

  if (app.screen === 'onboarding') { handleOnboardingKey(key); return; }
  if (app.screen === 'mode') { handleModeSelectKey(key); return; }
  if (app.screen === 'soloModeSelect') { handleSoloModeSelectKey(key); return; }

  if (app.screen === 'characterSolo') {
    handleSoloSelectKey(key);
    return;
  }
  if (app.screen === 'characterVersus') {
    handleVersusSelectKey(key);
    return;
  }
  if (app.screen === 'upgrades') {
    handleUpgradesKey(key);
    return;
  }
  if (app.screen === 'gameOver') {
    if (key === 'enter') goToCharacterSelectAfterGameOver();
    return;
  }
  if (app.screen === 'unlockReveal') {
    if (key === 'enter') dismissUnlockReveal();
    return;
  }
  if (app.screen === 'play') {
    handleGameplayKey(key, e.repeat);
  }
});

window.addEventListener('keyup', () => {});

// Versus mode randomizes which character each cursor starts on, for
// variety. Solo mode always starts both cursors on Antman instead - he's
// the one character guaranteed unlocked on both rosters from the start, so
// a brand-new player never lands on a locked (silhouetted) card by default.
// Bug fix: the CPU cursor used to just carry over whatever it was last set
// to - including a leftover value from startTutorial() (which sets
// app.cpuBatterIndex for its own scripted opponent), since the tutorial
// runs automatically on page load before the player ever reaches this
// screen for real. Explicitly resetting it here every time Solo is entered
// closes that leak.
function randomizeCharacterCursor(mode) {
  const antmanIndex = CHARACTERS.findIndex(c => c.key === 'antman');
  app.player1Index = mode === 'solo' ? antmanIndex : randRange(0, CHARACTERS.length);
  if (mode === 'solo') app.cpuBatterIndex = antmanIndex;
  if (mode === 'versus') app.player2Index = randRange(0, CHARACTERS.length);
}

// The very first screen a session sees (see app.screen's own comment) -
// asks whether the player already knows the controls before they've even
// reached the main menu, rather than assuming either way.
function handleOnboardingKey(key) {
  if (key === 'arrowup' || key === 'arrowdown' || key === 'w' || key === 's') {
    app.onboardingIndex = app.onboardingIndex === 0 ? 1 : 0;
  } else if (key === 'enter') {
    if (app.onboardingIndex === 0) startTutorial();
    else app.screen = 'mode';
  }
}

function handleModeSelectKey(key) {
  // Top-to-bottom order matches drawModeSelect()'s layout exactly, so arrow
  // up always moves the cursor visually up and arrow down always moves it
  // visually down: 0 = Tutorial (top), 1 = Solo (middle), 2 = 2 Player (bottom).
  if (key === 'arrowup' || key === 'w') app.modeSelectIndex = (app.modeSelectIndex + 2) % 3;
  else if (key === 'arrowdown' || key === 's') app.modeSelectIndex = (app.modeSelectIndex + 1) % 3;
  else if (key === 'enter') {
    if (app.modeSelectIndex === 1) { enterSoloMode(); }
    else if (app.modeSelectIndex === 2) { app.mode = 'versus'; app.screen = 'characterVersus'; randomizeCharacterCursor('versus'); }
    else startTutorial();
  }
}

// Every "start a Solo run" entry point (mode-select keyboard/click, mobile
// Play button) funnels through here (requested) - routes to the Story/
// Tournament picker instead of straight to character select, so the choice
// only needs to be made in one place.
function enterSoloMode() {
  app.mode = 'solo';
  app.screen = 'soloModeSelect';
  app.soloModeSelectIndex = 0;
}

const SOLO_MODE_STORY_BTN = { x: 100, y: 150, w: 200, h: 70 };
const SOLO_MODE_TOURNAMENT_BTN = { x: 100, y: 245, w: 200, h: 70 };
function pointInSoloModeStoryBtn(x, y) { return pointInUnitRect(x, y, SOLO_MODE_STORY_BTN); }
function pointInSoloModeTournamentBtn(x, y) { return pointInUnitRect(x, y, SOLO_MODE_TOURNAMENT_BTN); }

function drawSoloModeSelectPrompt() {
  drawMenuBackground();
  drawMenuParticles();
  drawCharacterShowcase();
  drawTitleLogo();

  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.75);

  text('Choose Your Mode', CANVAS_W / 2, toY(110), 30, 'white', 1, 'center', 900);

  const storySelected = !IS_MOBILE && app.soloModeSelectIndex === 0;
  const tourneySelected = !IS_MOBILE && app.soloModeSelectIndex === 1;
  drawOnboardingChoice(SOLO_MODE_STORY_BTN, 'Story Mode', storySelected);
  drawOnboardingChoice(SOLO_MODE_TOURNAMENT_BTN, 'Tournament Mode', tourneySelected);

  if (IS_MOBILE) return;

  const cursorY = app.soloModeSelectIndex === 0 ? SOLO_MODE_STORY_BTN.y + SOLO_MODE_STORY_BTN.h / 2 : SOLO_MODE_TOURNAMENT_BTN.y + SOLO_MODE_TOURNAMENT_BTN.h / 2;
  text('▶', toX(SOLO_MODE_STORY_BTN.x - 10), toY(cursorY), 30, 'white', 1, 'right', 900);
  text('Up / Down · Enter To Select', CANVAS_W / 2, toY(345), 16, 'white', 0.85, 'center', 700);
}
function handleSoloModeSelectKey(key) {
  if (key === 'escape') { app.screen = 'mode'; return; }
  if (key === 'arrowup' || key === 'arrowdown' || key === 'w' || key === 's') {
    app.soloModeSelectIndex = app.soloModeSelectIndex === 0 ? 1 : 0;
  } else if (key === 'enter') {
    if (app.soloModeSelectIndex === 0) pickStoryMode(); else pickTournamentMode();
  }
}
function handleSoloModeSelectClick(x, y) {
  if (pointInSoloModeStoryBtn(x, y)) { pickStoryMode(); return; }
  if (pointInSoloModeTournamentBtn(x, y)) { pickTournamentMode(); return; }
}
function pickStoryMode() {
  app.soloGameMode = 'story';
  app.screen = IS_MOBILE ? 'mobileCharacterSelect' : 'characterSolo';
  randomizeCharacterCursor('solo');
}
function pickTournamentMode() {
  app.soloGameMode = 'tournament';
  startTournament();
  app.screen = IS_MOBILE ? 'mobileCharacterSelect' : 'characterSolo';
  randomizeCharacterCursor('solo');
  // The opponent card is fixed to this round's bracket opponent, not
  // player-browsable (see drawSoloSelect()'s tournament branch) - already
  // "locked" the moment the screen loads.
  app.cpuBatterIndex = CHARACTERS.findIndex(c => c.key === app.tournament.opponents[0]);
  app.cpuLocked = true;
}

// 8-player single-elimination bracket (requested): 7 distinct random
// opponents cover every round the player could reach (quarterfinal/
// semifinal/final - see app.tournament's own comment), pre-shuffled so
// opponents[round] is always already random and distinct without needing to
// simulate the other bracket pairs at all.
function startTournament() {
  const pool = CHARACTERS.map(c => c.key);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randRange(0, i + 1);
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  app.tournament = { opponents: pool.slice(0, 7), round: 0, wins: 0, totalRuns: 0 };
}

// Guards against the round-0 opponent (picked before the player chose their
// own character) landing on the exact character the player just locked in -
// re-rolls just that slot from whoever's left unused. Only round 0 can ever
// collide since every later round's opponent was already fixed at
// generation time, long before this match's specific pairing mattered.
function fixTournamentSelfMatchIfNeeded() {
  if (app.soloGameMode !== 'tournament' || !app.tournament || app.tournament.round !== 0) return;
  const playerKey = CHARACTERS[app.player1Index].key;
  if (app.tournament.opponents[0] !== playerKey) return;
  const used = new Set(app.tournament.opponents);
  used.add(playerKey);
  const pool = CHARACTERS.map(c => c.key).filter(k => !used.has(k));
  if (pool.length === 0) return;
  app.tournament.opponents[0] = pool[randRange(0, pool.length)];
  app.cpuBatterIndex = CHARACTERS.findIndex(c => c.key === app.tournament.opponents[0]);
}

function goBackToModeSelect() {
  app.screen = 'mode';
  app.player1Locked = false;
  app.player2Locked = false;
  app.cpuLocked = false;
  app.readyOpacity = 0;
}

// Shared by quitToModeSelect() (answering "yes" on the Escape quit
// confirmation) and goToCharacterSelectAfterGameOver() (a match actually
// finishing) - both need every piece of match/at-bat state wiped so the
// next game starts clean instead of resuming mid-inning with the old score,
// via the same helpers a normal play already uses between pitches.
function resetMatchState() {
  homeScore = 0; awayScore = 0;
  inningNumber = 1; inningSuffix = 'st';
  bases[0] = bases[1] = bases[2] = 'grey';
  clearCounts(true);
  clearPowerupVisuals();
  resetBall();

  app.isPitching = false;
  app.isBatting = false;
  app.pitcherFrameIndex = 0;
  app.batterFrameIndex = 0;
  app.pauseAnimActive = false;
  app.pitchArmed = null;
  app.reverseBall = false;
  app.diceRolling = false;
  stopSound(POWER_SOUNDS.gamblerBatting); // safety net if a mode/match reset happens mid-roll
  stopSound(POWER_SOUNDS.gamblerPitching);
  app.mirageCount = 0;
  app.batPowerFull = true;
  app.pitchPowerFull = true;
  crowdSound.pause();
  // Every path that ends a match (quitting, game over) or is about to start
  // a fresh one (startTutorial()) funnels through here - always leave the
  // tutorial fully off; startTutorial() re-arms it right after this returns.
  app.tutorial.active = false;
  app.tutorial.practiceStep = null;
  app.dialog.active = false;
  app.dialog.lines = [];
  app.dialog.onDone = null;
  app.dialog.revealProgress = 0;
  app.tutorial.forcedPitch = null;
  app.tutorial.forceWhiffCpuBatter = false;
  app.tutorial.forceStrikeOnBall = false;
  app.tutorial.awaitingContact = false;
  app.tutorial.contactMade = false;
  app.tutorial.pitchingStrikeoutDone = false;
  app.tutorial.awaitingAimFreeze = false;
  app.tutorial.aimDemoFrozen = false;
  app.tutorial.aimDemoOnTarget = false;
  app.tutorial.aimDemoForcedOnTarget = false;
  app.tutorial.aimDemoSwung = false;
  app.tutorial.captionText = '';
  app.tutorial.pitchIntroPhase = null;
  app.tutorial.introTicks = 0;
  app.tutorial.pitchIntroWaitingForResolve = false;
  app.tutorial.powerDrillTicks = 0;

  // Solo-mode progression counters - see their declarations on `app` above.
  app.maxDeficitThisGame = 0;
  app.humanUsedPowerThisGame = false;
  app.hitsAllowedByHumanThisGame = 0;
  app.lastPitchThrown = '';
  app.pitchTypesHitThisInning = { fastball: false, curveball: false, riser: false, knuckleball: false };
  app.runsThisHalfInning = 0;
  app.newlyUnlocked = [];
}

function quitToModeSelect() {
  app.showQuitConfirm = false;
  pokiGameplayStop(); // no-ops if a match wasn't actually in progress
  goBackToModeSelect();
  resetMatchState();
}

// The quit-confirm modal freezes the entire scene while it's up (see
// update()'s early return) - that's exactly Poki's own "pause" example for
// gameplayStop()/gameplayStart(), so opening/backing out of it needs the
// same events as an actual pause menu would. Actually confirming the quit
// (quitToModeSelect(), above) already leaves the play screen entirely, so
// there's no matching "resume" for that path - only backing out without
// quitting counts as an unpause.
function openQuitConfirm() {
  app.showQuitConfirm = true;
  app.quitConfirmIndex = 1;
  pokiGameplayStop();
}
function closeQuitConfirmAndResume() {
  app.showQuitConfirm = false;
  pokiGameplayStart();
}

// A match actually finishing (see switchSides()' game-over branch) goes
// straight back to character select instead of all the way to mode-select -
// same mode (solo/versus), just pick characters again for the rematch.
// This is the one place commercialBreak() fires (see beginGame()'s own
// comment for why it no longer gates match/tutorial start) - right as the
// player leaves a completed game, never before they've played one.
// pokiBreakPending guards against mashing the game-over button firing a
// second overlapping break.
// Both "Back To Menu" entry points (Enter on the gameOver screen, and
// clicking/tapping its button) funnel through here - if the match that just
// ended unlocked anything new (see evaluateGameEndUnlocks()), show that off
// first instead of going straight back to character select.
function goToCharacterSelectAfterGameOver() {
  if (app.newlyUnlocked.length > 0) { app.screen = 'unlockReveal'; return; }
  proceedToCharacterSelectAfterGameOver();
}

// The unlockReveal screen's own "continue" (Enter/tap) calls this directly
// once it's done showing off whatever just unlocked.
function dismissUnlockReveal() {
  app.newlyUnlocked = [];
  proceedToCharacterSelectAfterGameOver();
}

function proceedToCharacterSelectAfterGameOver() {
  if (app.mode === 'solo' && app.soloGameMode === 'tournament') { handleTournamentProgression(); return; }
  if (pokiBreakPending) return;
  pokiCommercialBreak(() => {
    app.screen = IS_MOBILE ? 'mobileCharacterSelect' : (app.mode === 'versus' ? 'characterVersus' : 'characterSolo');
    app.player1Locked = false;
    app.player2Locked = false;
    app.cpuLocked = false;
    app.readyOpacity = 0;
    randomizeCharacterCursor(app.mode);
    resetMatchState();
  });
}

// Coins awarded once a tournament run ends, indexed by how many rounds were
// WON (0 = eliminated round 1, 1 = eliminated round 2/semifinal, 2 =
// eliminated round 3/final = runner-up, 3 = won the final = champion) - see
// the confirmed table from planning. Every tier also adds
// app.tournament.totalRuns * WIN_COINS_PER_RUN on top of this base.
const TOURNAMENT_COINS_BY_WINS = [30, 150, 400, 1000];
function tournamentReward(roundsWon) {
  return TOURNAMENT_COINS_BY_WINS[roundsWon] + app.tournament.totalRuns * WIN_COINS_PER_RUN;
}

// Returns to the normal post-tournament flow: same character-select screen
// a Story match would land on, tournament flag cleared so a later plain Solo
// match isn't mistaken for still being mid-bracket.
function endTournamentRun() {
  app.soloGameMode = 'story';
  app.tournament = null;
  if (pokiBreakPending) return;
  pokiCommercialBreak(() => {
    app.screen = IS_MOBILE ? 'mobileCharacterSelect' : 'characterSolo';
    app.player1Locked = false;
    app.cpuLocked = false;
    app.readyOpacity = 0;
    randomizeCharacterCursor('solo');
    resetMatchState();
  });
}

// Called once the player leaves the gameOver screen after a tournament
// match (see proceedToCharacterSelectAfterGameOver()) - decides whether the
// run just ended (loss, or a won final) or continues into the next round.
// The reward itself (coins/trophy) was already granted back in
// evaluateGameEndUnlocks(), in time to show on the gameOver screen the
// player is now leaving - this only handles routing.
function handleTournamentProgression() {
  if (!app.gameOverP1Wins || app.tournament.round >= 2) { endTournamentRun(); return; }
  app.tournament.wins++;
  // Advanced - same player character carries forward into the next round
  // with no character re-select (requested); the next opponent was already
  // fixed at bracket-generation time (see startTournament()).
  app.tournament.round++;
  app.cpuBatterIndex = CHARACTERS.findIndex(c => c.key === app.tournament.opponents[app.tournament.round]);
  if (pokiBreakPending) return;
  pokiCommercialBreak(() => {
    resetMatchState();
    beginGame();
  });
}

function handleSoloSelectKey(key) {
  if (key === 'escape') { goBackToModeSelect(); return; }
  // Player card: browse with A/D (freely, including locked characters - the
  // whole point of a content-locked card is to be teased while browsing),
  // lock in with S (blocked for a still-locked character - see
  // isPlayerUnlocked()).
  const isTournament = app.soloGameMode === 'tournament';
  if (key === 'a') {
    app.player1Locked = false; app.readyOpacity = 0;
    app.player1Index = (app.player1Index + CHARACTERS.length - 1) % CHARACTERS.length;
  } else if (key === 'd') {
    app.player1Locked = false; app.readyOpacity = 0;
    app.player1Index = (app.player1Index + 1) % CHARACTERS.length;
  } else if (key === 's') {
    if (isPlayerUnlocked(CHARACTERS[app.player1Index].key)) {
      app.player1Locked = true;
      fixTournamentSelfMatchIfNeeded();
    }
  // CPU card: same pattern, mirroring handleVersusSelectKey()'s P2 controls
  // (arrow left/right to browse, arrow down to confirm) since arrows are
  // otherwise unused on this screen. Tournament mode's opponent is fixed
  // (already locked, see pickTournamentMode()) - browsing is disabled so it
  // can't be un-locked and swapped out.
  } else if (key === 'arrowleft' && !isTournament) {
    app.cpuLocked = false; app.readyOpacity = 0;
    app.cpuBatterIndex = (app.cpuBatterIndex + CHARACTERS.length - 1) % CHARACTERS.length;
  } else if (key === 'arrowright' && !isTournament) {
    app.cpuLocked = false; app.readyOpacity = 0;
    app.cpuBatterIndex = (app.cpuBatterIndex + 1) % CHARACTERS.length;
  } else if (key === 'arrowdown' && !isTournament) {
    if (isCpuUnlocked(CHARACTERS[app.cpuBatterIndex].key)) app.cpuLocked = true;
  } else if (key === 'enter' && app.readyOpacity >= 80) {
    beginGame();
  } else if (key === 'b') {
    buyPlayerCharacter(CHARACTERS[app.player1Index].key);
  } else if (key === 'u') {
    app.screen = 'upgrades';
  } else if (key === 't') {
    // TEMPORARY DEBUG (requested): instantly grants a tournament trophy to
    // whichever character is currently browsed/locked in the Player slot, so
    // the portrait-card badge and reveal can be tested without grinding a
    // full bracket. Remove on request.
    saveData.tournamentTrophies[CHARACTERS[app.player1Index].key] = true;
    persistSaveData();
  }
}

function handleVersusSelectKey(key) {
  if (key === 'escape') { goBackToModeSelect(); return; }
  if (key === 'arrowleft') {
    app.player2Locked = false; app.readyOpacity = 0;
    app.player2Index = (app.player2Index + CHARACTERS.length - 1) % CHARACTERS.length;
  } else if (key === 'arrowright') {
    app.player2Locked = false; app.readyOpacity = 0;
    app.player2Index = (app.player2Index + 1) % CHARACTERS.length;
  } else if (key === 'a') {
    app.player1Locked = false; app.readyOpacity = 0;
    app.player1Index = (app.player1Index + CHARACTERS.length - 1) % CHARACTERS.length;
  } else if (key === 'd') {
    app.player1Locked = false; app.readyOpacity = 0;
    app.player1Index = (app.player1Index + 1) % CHARACTERS.length;
  } else if (key === 's') {
    app.player1Locked = true;
  } else if (key === 'arrowdown') {
    app.player2Locked = true;
  } else if (key === 'enter' && app.readyOpacity >= 80) {
    beginGame();
  }
}

function startMatch() {
  app.screen = 'play';
  // Both modes now start homePitching=true - this is what makes the
  // scoreboard's inning arrow (see drawScoreboard(), up for homePitching=
  // true/away-batting, down for homePitching=false/home-batting) correctly
  // read "top of the 1st" on the very first half-inning, and it's also what
  // the inningNumber++ check in switchSides() assumes (it only advances once
  // homePitching returns to true, i.e. once BOTH halves of an inning are
  // done - starting from false used to make that fire a half-inning early).
  // Solo's assignActiveRoles() gives p1 the batter role exactly when
  // homePitching is true (p1 is the AWAY team there, see its own comment),
  // so the human still bats first even though the flag starts true - versus
  // mode is unaffected, still p1 pitching/p2 batting first as before.
  app.homePitching = true;
  assignActiveRoles();
  // The CPU character is now chosen on the solo select screen (app.cpuBatterIndex
  // is already set by then) rather than randomized - difficulty is derived from
  // that choice's rank instead of being a separate manual picker (see
  // characterDifficultyIndex()/PROGRESSION_ORDER).
  if (app.mode === 'solo') {
    app.difficultyIndex = characterDifficultyIndex(CHARACTERS[app.cpuBatterIndex].key);
    // Opponent intro line (requested) - fires once the CPU character for
    // this match is locked in, using the same speaker-agnostic dialogue box
    // as the tutorial's Coach (see app.dialog).
    const opp = CHARACTERS[app.cpuBatterIndex];
    const oppLines = OPPONENT_LINES[opp.key];
    if (oppLines) showDialog(opp.name, portraits[opp.key], [oppLines.intro], null);
  }
  // Warm both active characters' sprite sets now, before the first
  // drawSprites() call needs them - avoids a blank/undefined-image frame
  // while the lazy loader's first fetch is still in flight.
  getPitcherFrames(pitcherChar().key);
  getBatterFrames(batterChar().key);
  resetBall();
  // Bug fix: crosshairRadius/criticalRadius are only ever recomputed from
  // saveData.battingUpgrades inside clearPowerupVisuals()/resetBall()'s
  // smallBatActive branch - neither of which startMatch() calls unconditionally.
  // Buying a Contact/Power upgrade on the select screen then starting a new
  // match left the crosshair at whatever stale radius it happened to have
  // from before (page load, or the previous match's own upgrade levels),
  // only catching up once an out or hit mid-game incidentally triggered one
  // of those two functions. Recompute explicitly here so every match starts
  // with the upgrade levels actually in effect from pitch one.
  crosshairRadius = baseCrosshairRadius();
  criticalRadius = baseCriticalRadius();
  // startMatch() only ever runs after the player has already interacted with
  // the menu (clicked/tapped Play, pressed Enter, etc.), so the browser's
  // autoplay-needs-a-user-gesture policy is already satisfied here.
  crowdVolume = CROWD_BASE_VOLUME;
  crowdSound.volume = CROWD_BASE_VOLUME;
  crowdSound.currentTime = 0;
  crowdSound.play().catch(() => {});
}

// No commercialBreak() here on purpose - showing an ad before a player has
// even seen their first pitch (including a brand-new visitor's very first
// match ever) was hurting early retention. The ad break now happens once,
// after a match actually ends (see goToCharacterSelectAfterGameOver()),
// never before one starts.
function beginGame() {
  startMatch();
  pokiGameplayStart();
}

/* ============================== TUTORIAL ==============================
   A scripted walkthrough that reuses the real 'play' screen and gameplay
   code paths (pitching, batting, CPU AI, scoring) rather than a separate
   mock-up - see the app.tutorial state block for what each flag gates, and
   the surgical hooks in resetBall()/recordBall()/recordOut()/forceWalk()/
   recordBaseHit()/resolveHit()/cpuSwing()/cpuPitch() for how the drills
   force guaranteed outcomes and detect when the player has cleared a step.
   update() calls stepTutorial() every tick and freezes gameplay (exactly
   like the quit-confirm modal already does) while a dialogue line is up. */

// Generic speaker dialogue (see app.dialog's own comment) - shows a portrait
// + name + lines box, advanced one line at a time by any keypress/click (see
// advanceDialog()); onDone runs once the player has clicked/pressed past the
// last line. Used directly for solo-mode opponent intro/win/lose lines, and
// wrapped by showTutorialDialog() below for Coach's own lines.
function showDialog(speakerName, speakerImg, lines, onDone) {
  app.dialog.active = true;
  app.dialog.speakerName = speakerName;
  app.dialog.speakerImg = speakerImg;
  app.dialog.lines = lines.slice();
  app.dialog.onDone = onDone || null;
  app.dialog.revealProgress = 0; // first line starts typing in from scratch
}
function advanceDialog() {
  // The tutorial's first dialogue line is already showing the moment
  // startTutorial() runs (from the Tutorial button on the main menu), before
  // any further input happens, but gameplayStart() itself has to wait for the
  // player's actual first input per Poki's rules - clicking the menu button
  // to get here counts as menu navigation, not gameplay starting yet. Any
  // real interaction with a dialogue box - whether it fills in the
  // currently-typing line or advances past a finished one - IS that first
  // input. Idempotent (no-ops once already active) and harmless for
  // non-tutorial dialogue too (gameplayStart() already fired via beginGame()
  // by the time a real match's opponent dialogue shows).
  pokiGameplayStart();
  const d = app.dialog;
  const fullLen = d.lines[0] ? d.lines[0].length : 0;
  if (d.revealProgress < fullLen) {
    // Still typing in - this press just fills in the rest immediately
    // instead of advancing, so an impatient player never has to sit through
    // the reveal animation to find out it's not done yet.
    d.revealProgress = fullLen;
    return;
  }
  d.lines.shift();
  d.revealProgress = 0; // next line (if any) starts typing in from scratch
  if (d.lines.length === 0) {
    d.active = false;
    const onDone = d.onDone;
    d.onDone = null;
    if (onDone) onDone();
  }
}
// Runs every tick regardless of app.tutorial.active (unlike stepTutorial(),
// which only runs during the tutorial) so a real match's opponent dialogue
// still types in - called from update().
function stepDialogTypewriter() {
  const d = app.dialog;
  if (d.lines.length > 0 && d.revealProgress < d.lines[0].length) {
    d.revealProgress += 1 / TYPEWRITER_TICKS_PER_CHAR;
  }
}

const PITCH_TYPES = ['fastball', 'curveball', 'riser', 'knuckleball'];
// Sweeps the currently-armed pitch type's meter back and forth (see
// handleGameplayKey()'s WASD branch, which arms rather than throws directly)
// until confirmArmedPitch() consumes it. Blocked during the tutorial except
// its own guided pitching drill, which now teaches this same mechanic
// (forceStrikeOnBall guarantees the outcome regardless of tier, so letting
// the real timing meter run here doesn't risk breaking that guarantee).
function stepPitchMeter() {
  const tutorialBlocks = app.tutorial.active && app.tutorial.practiceStep !== 'pitch';
  app.pitchMeterActive = !!app.pitchArmed && !tutorialBlocks;
  if (!app.pitchMeterActive) return;
  app.pitchMeterPos += app.pitchMeterDir / PITCH_SPEED_LEVELS[pitchSpeedLevel(app.pitchArmed)];
  if (app.pitchMeterPos >= 1) { app.pitchMeterPos = 1; app.pitchMeterDir = -1; }
  else if (app.pitchMeterPos <= 0) { app.pitchMeterPos = 0; app.pitchMeterDir = 1; }
}

function showTutorialDialog(lines, onDone) {
  showDialog('COACH', COACH_IMG, lines, onDone);
}
function advanceTutorialDialog() {
  advanceDialog();
}

// Reached via the Tutorial button on the main menu (the tutorial is
// optional, not forced on every page load) or the Enter-key equivalent.
// gameplayStart() deliberately does NOT fire in here, even though the
// tutorial drives the real 'play' screen/gameplay code paths just like an
// actual match: Poki requires it fire on the player's actual first
// gameplay input, not on a menu click. advanceTutorialDialog() (the very
// first thing a player can do once the tutorial screen is up - dismiss/
// advance Coach's line) is where it actually fires.
// The tutorial now runs INSIDE the actual first real match instead of a
// separate practice bubble thrown away afterward (requested) - every guided
// moment below is a real pitch/swing in a real, scoring 2-inning Story-mode
// match, and finishTutorial() just stops guiding rather than resetting
// anything. This is why it reuses startMatch() itself (real difficulty
// derivation, real opponent-intro dialogue plumbing, real crowd sound) rather
// than hand-rolling a parallel setup - see beginBattingAimDemo()/
// beginPitchPractice()/finishTutorial() for how the guidance layers on top.
function startTutorial() {
  app.mode = 'solo';
  app.soloGameMode = 'story';
  // Antman - unlocked by default, so a brand-new player's tutorial uses the
  // exact power-ups (Ball Shrink pitch, Expand Shot bat) they'll actually
  // have available the first time they play for real.
  app.player1Index = CHARACTERS.findIndex(c => c.key === 'antman');
  // Antman (requested) - looked up by key rather than a raw index, so this
  // can't silently start pointing at a different character if CHARACTERS'
  // order ever changes again (it already did once, for the progression
  // system). Same character as the player's own tutorial pick - matches
  // rank 0/Easy either way, so this isn't a difficulty change.
  app.cpuBatterIndex = CHARACTERS.findIndex(c => c.key === 'antman');
  resetMatchState(); // also zeroes out every app.tutorial field - re-armed right below
  app.tutorial.active = true;
  // Real match setup (screen='play', homePitching=true, difficulty derived
  // from Antman's rank - already Easy, sprite warm, resetBall(), crowd
  // sound). homePitching=true gives the human the BATTER role first (see
  // assignActiveRoles()'s own comment) - batting first matches solo's real
  // top-of-1st order, unlike the old pitching-first tutorial. This also
  // queues Antman's own opponent-intro line via showDialog() - immediately
  // overwritten by Coach's greeting below before it's ever shown, so nothing
  // stacks two dialogues in a row at the very start.
  startMatch();

  // Just the opening greeting stays a blocking dialogue line - everything
  // after it (see beginBattingAimDemo()/stepTutorial()) is delivered via the
  // non-blocking caption banner instead, with the coach talking "from the
  // side" while the game keeps running and the player can act immediately.
  showTutorialDialog([
    "Hey, rookie! I'm Coach. Let's get you ready for the big leagues.",
  ], beginBattingAimDemo);
}

function beginPitchPractice() {
  app.tutorial.practiceStep = 'pitch';
  app.tutorial.forceWhiffCpuBatter = true;
  app.tutorial.forceStrikeOnBall = true;
  app.tutorial.pitchIntroPhase = 'pressW';
  app.tutorial.introTicks = 0;
  app.tutorial.pitchIntroWaitingForResolve = false;
  // Merged with the old blocking "nice work, now let's cover pitching"
  // transition dialogue (requested - too much text to click through) - a
  // single non-blocking caption instead, same as everything else in the
  // guided intro below.
  app.tutorial.captionText = IS_MOBILE
    ? 'Nice work! Now pitching - tap Fastball below, then tap again when the bar turns green!'
    : 'Nice work! Now pitching - press W, then click when the bar turns green!';
}

// A real pitch launches like any other, then gets frozen mid-flight (see
// the update() hook keyed off this same threshold) well before it reaches
// the plate - the freeze point sits comfortably right of the pitcher and
// left of the strike zone/plate crossing (toX(355)), giving the player a
// stationary target and plenty of room to move the crosshair onto it.
const AIM_DEMO_FREEZE_X = 300;

function beginBattingAimDemo() {
  app.tutorial.forceWhiffCpuBatter = false;
  app.tutorial.forceStrikeOnBall = false;

  // Already the human-batting/CPU-pitching configuration startMatch() set up
  // (batting comes first now, matching solo's real top-of-1st order) -
  // re-asserted here defensively rather than assumed, since this same setup
  // is shared with beginBattingEasy() below.
  app.homePitching = true;
  assignActiveRoles();
  getPitcherFrames(pitcherChar().key);
  getBatterFrames(batterChar().key);
  clearCounts(true);
  resetBall();

  app.tutorial.practiceStep = 'bat_aim_demo';
  // Baby mode (requested) applies here too - the tutorial only ever runs
  // for a player whose first game isn't over yet, so babyModeDone is
  // normally still false, but a returning player replaying the tutorial
  // from the menu after it's already ended gets the normal E-tier pitch
  // instead. Slow and dead straight either way - see beginBattingEasy()'s
  // own note on why not Knuckleball.
  app.tutorial.forcedPitch = saveData.babyModeDone ? 'EFastball' : 'BFastball';
  app.tutorial.awaitingAimFreeze = true;
  app.tutorial.aimDemoFrozen = false;
  app.tutorial.aimDemoOnTarget = false;
  app.tutorial.aimDemoForcedOnTarget = false;
  app.tutorial.aimDemoSwung = false;
  app.tutorial.aimDemoTicks = 0;
  app.tutorial.aimDemoHintShown = false;
  app.tutorial.captionText = '';
}

function beginBattingEasy() {
  app.tutorial.captionText = '';
  // Switch roles without touching score/innings: now the CPU pitches and the
  // human bats - same as a real solo match's default starting configuration
  // (solo's assignActiveRoles() gives p1 the batter role when homePitching
  // is true - p1 is the away team there, and away bats first).
  app.homePitching = true;
  assignActiveRoles();
  getPitcherFrames(pitcherChar().key);
  getBatterFrames(batterChar().key);
  clearCounts(true);
  resetBall();

  app.tutorial.practiceStep = 'bat_easy';
  // Bug fix: Knuckleball isn't actually a straight line - it's genuinely
  // chaotic, randomly bouncing up/down most of the way to the plate before
  // correcting into the zone (see the chaos-phase step logic gated on
  // KNUCKLE_CHAOS_END_X). EFastball/BFastball are real straight, predictable
  // pitches - the "really easy, straight line" starter this drill promises.
  // Baby mode (requested) applies here too - see beginBattingAimDemo()'s
  // own comment on when it wouldn't (a replayed tutorial after baby mode's
  // already ended).
  app.tutorial.forcedPitch = saveData.babyModeDone ? 'EFastball' : 'BFastball';
  app.tutorial.awaitingContact = true;
  app.tutorial.battingMissCount = 0;
  app.tutorial.battingHintShown = false;
}

// A small step of its own right after the one real batting hit (requested) -
// no separate hit-confirmed drill this time, just requires the player to
// actually press M at all (see stepTutorial()'s bat_power_demo check,
// watching for app.batPowerFull to go false), guided by an arrow the same
// way the pitching intro's Z-key teaching moment is (see
// tutorialArrowTarget()). No pitch is thrown here - Antman's power
// (expandShot) persists once armed until it's actually used, so pressing M
// now just stays armed for whatever real pitch comes next in free play.
function beginPowerUpDemo() {
  app.tutorial.practiceStep = 'bat_power_demo';
  app.tutorial.powerDrillTicks = 0;
  app.tutorial.captionText = IS_MOBILE
    ? 'Tap your power-up icon to use it!'
    : 'Press M to use your power-up!';
}

// Batting guidance is done (one real hit, then the power-up demo above, or
// gave up after 6 misses on the hit itself - see stepTutorial()) - the rest
// of THIS SAME at-bat's top-of-1st plays out for real at full difficulty, no
// more forced pitches/guaranteed contact, until the inning ends and it
// becomes the human's turn to pitch. That "ends" after just ONE real out now
// (requested) rather than a full 3 - see recordOut()'s tutorial shortcut,
// which applies the same way on the pitching side (the guided strikeout
// below is itself that one out). That's the cue to start beginPitchPractice().
function awaitPitchingTurn() {
  app.tutorial.practiceStep = 'awaiting_pitch_turn';
  app.tutorial.forcedPitch = null;
  app.tutorial.awaitingContact = false;
  app.tutorial.battingMissCount = 0;
  app.tutorial.battingHintShown = false;
  app.tutorial.captionText = '';
}

// Ending the tutorial (naturally, or via the batting drills' stuck-player
// fallback - see stepTutorial()) used to dump the player back
// at the main mode-select menu, or (before that) discard a whole separate
// practice match and start a fresh one - either way, real playtime was being
// thrown away right where Poki's retention dashboard shows new players
// dropping off. The tutorial now runs inside the actual first real match
// throughout (see startTutorial()), so finishing it is just switching off
// the guidance hooks - whatever the match's real score/outs/inning currently
// are, it just continues exactly as normal, at full difficulty, same as any
// other match once its tutorial guidance ends.
function finishTutorial() {
  app.showQuitConfirm = false;
  app.tutorial.active = false;
  app.tutorial.practiceStep = null;
  app.tutorial.forcedPitch = null;
  app.tutorial.forceWhiffCpuBatter = false;
  app.tutorial.forceStrikeOnBall = false;
  app.tutorial.awaitingContact = false;
  app.tutorial.captionText = '';
}

// Checked once per tick from update(): watches for the flags the hooks
// above set once a scripted drill's objective has actually been met, and
// advances to the next beat of the script.
const TYPEWRITER_TICKS_PER_CHAR = 1.5; // ~27 chars/sec at 40 ticks/sec

function stepTutorial() {
  const t = app.tutorial;
  if (!t.active) return;
  // Opening a dialog freezes update() (including stepCallBanner()) on the
  // very next tick - if a call banner (e.g. the final "Strike") was still
  // sliding across the screen, it would get stuck mid-animation and only
  // finish once the dialog closes again, reading as the banner popping up
  // out of nowhere right as the text ends. Wait for it to finish first.
  if (app.callActive) return;

  // Guided pitching intro (see beginPitchPractice()): walks the player
  // through one plain pitch, points out the pitch menu, then one power-up
  // pitch - entirely via the non-blocking caption banner, so gameplay never
  // pauses and every prompt can be acted on immediately. Falls through into
  // the ordinary "throw pitches until you strike them out" tail (already
  // below) once pitchIntroPhase goes back to null.
  if (t.practiceStep === 'pitch' && t.pitchIntroPhase) {
    if (t.pitchIntroPhase === 'pressW') {
      // Wait for the ball to actually cross the plate and resolve (forceStrikeOnBall
      // guarantees that's a Strike) before showing the "4 pitches" caption -
      // ball.visible is true for exactly the ball's real flight (set the
      // instant the windup finishes, cleared by resetBall() the instant it
      // crosses toX(355) and gets called). app.isPitching alone isn't late
      // enough for this - it only covers the windup animation itself, going
      // false again the moment the ball actually launches.
      if (ball.visible) {
        t.pitchIntroWaitingForResolve = true;
      } else if (t.pitchIntroWaitingForResolve) {
        t.pitchIntroWaitingForResolve = false;
        t.pitchIntroPhase = 'sawPitches';
        t.introTicks = 0;
        t.captionText = IS_MOBILE
          ? "Nice! You've got 4 pitches total - see your pitch buttons below."
          : "Nice! You've got 4 pitches total - see them in the bottom left.";
      }
    } else if (t.pitchIntroPhase === 'sawPitches') {
      if (++t.introTicks >= 60) { // ~1.5s at 40 ticks/sec
        t.pitchIntroPhase = 'pressZ';
        t.captionText = IS_MOBILE
          ? 'Tap your power-up icon to use your special pitch!'
          : 'Press Z to use your power-up pitch!';
      }
    } else if (t.pitchIntroPhase === 'pressZ') {
      if (!app.pitchPowerFull) { // Z was just pressed - power consumed
        t.pitchIntroPhase = 'throwPowerPitch';
        t.captionText = IS_MOBILE ? 'Now tap a pitch button to throw it!' : 'Now throw your pitch!';
      }
    } else if (t.pitchIntroPhase === 'throwPowerPitch') {
      // Same ball.visible-based wait as the pressW phase above - the "once
      // per inning" caption should only appear once this pitch has actually
      // crossed the plate too.
      if (ball.visible) {
        t.pitchIntroWaitingForResolve = true;
      } else if (t.pitchIntroWaitingForResolve) {
        t.pitchIntroWaitingForResolve = false;
        t.pitchIntroPhase = 'toldOnce';
        t.introTicks = 0;
        t.captionText = 'Careful - power-ups like that only work ONCE per inning!';
      }
    } else if (t.pitchIntroPhase === 'toldOnce') {
      if (++t.introTicks >= 120) {
        t.pitchIntroPhase = null;
        t.introTicks = 0;
        t.captionText = 'Now finish the job - strike them out!';
      }
    }
  }
  // Clear the final "finish the job" nudge after a few seconds instead of
  // leaving it up indefinitely through however many more pitches it takes.
  if (t.practiceStep === 'pitch' && !t.pitchIntroPhase && t.captionText) {
    if (++t.introTicks >= 150) { // ~3.75s
      t.captionText = '';
    }
  }

  if (t.pitchingStrikeoutDone) {
    t.pitchingStrikeoutDone = false;
    t.captionText = '';
    showTutorialDialog([
      "Strikeout! Beautiful pitching, rookie!",
      "That's everything - now get out there and be a Hero!",
    ], finishTutorial);
    return;
  }

  // Batting aim demo: the ball is frozen mid-flight (see the update() hook
  // near AIM_DEMO_FREEZE_X) while this runs every tick regardless of the
  // dialogue-freeze state below, since the crosshair needs to keep moving.
  if (t.aimDemoFrozen && !t.aimDemoForcedOnTarget) {
    const onTargetNow = dist(crosshairX, crosshairY, ball.x, ball.y) <= crosshairRadius;
    if (onTargetNow && !t.aimDemoOnTarget) {
      // Just moved onto the ball.
      t.aimDemoOnTarget = true;
      t.aimDemoTicks = 0;
      t.captionText = IS_MOBILE ? 'Perfect! Now tap SWING!' : 'Perfect! Now click to swing!';
    } else if (!onTargetNow && t.aimDemoOnTarget) {
      // Bug fix (requested): drifted back off the ball after lining up -
      // leaving the "click to swing" caption up here was actively
      // misleading (swinging now would just miss). Go back to telling them
      // to re-aim instead. They've already shown they understand the
      // mechanic once, so skip the patient 10s delay the first attempt
      // gets below - remind them immediately.
      t.aimDemoOnTarget = false;
      t.aimDemoHintShown = true;
      t.captionText = IS_MOBILE
        ? 'Move the joystick so your circle lands right on the ball.'
        : 'Move your mouse so your circle lands right on the ball.';
    } else if (!onTargetNow) {
      t.aimDemoTicks++;
      if (t.aimDemoTicks === 400 && !t.aimDemoHintShown) { // ~10s at 40 ticks/sec
        t.aimDemoHintShown = true;
        t.captionText = IS_MOBILE
          ? 'Move the joystick so your circle lands right on the ball.'
          : 'Move your mouse so your circle lands right on the ball.';
      } else if (t.aimDemoTicks >= 1200) { // ~30s total - never leave a stuck player blocked forever
        t.aimDemoForcedOnTarget = true;
        t.aimDemoOnTarget = true;
        t.captionText = IS_MOBILE ? 'Now tap SWING!' : 'Now click to swing!';
      }
    }
  }

  if (t.aimDemoSwung) {
    t.aimDemoSwung = false;
    t.aimDemoFrozen = false;
    t.captionText = '';
    // Merged into one line (requested - was 2 separate lines/sentences).
    showTutorialDialog([
      "Great job! Aim, then swing right as the ball's inside your crosshair - now let's try it for real!",
    ], beginBattingEasy);
    return;
  }

  // Only one hit-confirmed batting drill now (bat_easy) - contactMade can't
  // fire during bat_power_demo below, since that step never sets
  // awaitingContact at all (see beginPowerUpDemo()).
  // Both batting textboxes are shown back-to-back here, fully, BEFORE the
  // power-up demo starts (requested) - the demo itself has no textbox of
  // its own trailing it (success or stuck-timeout, below), it just quietly
  // hands off to awaitPitchingTurn() once the batting textboxes are done.
  if (t.contactMade) {
    t.contactMade = false;
    showTutorialDialog([
      "Nice contact! You've got the fundamentals down.",
      IS_MOBILE
        ? "Now try your power-up - tap the icon. Keep batting for the rest of this inning - I'll cover pitching once it's your turn."
        : "Now try your power-up - press M. Keep batting for the rest of this inning - I'll cover pitching once it's your turn.",
    ], beginPowerUpDemo);
    return;
  }

  // Power-up demo (bat_power_demo, see beginPowerUpDemo()): completes the
  // instant the player presses M at all - no follow-up swing/contact
  // required (requested), unlike the batting drill above. No textbox here -
  // the batting textboxes already ran in full above, before this step even
  // started, so completion just hands off to free batting directly.
  // Bug fix (requested): practiceStep alone doesn't change until
  // awaitPitchingTurn() actually runs - without clearing it here first, this
  // condition stayed true every single tick, re-triggering itself. Every
  // other one-shot check in this function mutates state immediately for
  // exactly this reason (contactMade/aimDemoSwung/pitchingStrikeoutDone above).
  if (t.practiceStep === 'bat_power_demo' && !app.batPowerFull) {
    t.practiceStep = null;
    awaitPitchingTurn();
    return;
  }

  // Everything below is a stuck-player nudge, not a real drill-progress
  // check - never open one on top of a dialogue that's already up (either
  // one just opened above, or one still being read from an earlier tick).
  // Pitching has no nudge of its own here - the caption banner above already
  // spells out exactly what to press, persistently, for the whole intro.
  if (app.dialog.lines.length > 0) return;

  // Power-up demo's own stuck-player fallback - never leave a player
  // blocked forever if they just never press M (mirrors the aim demo's own
  // 30s forced-pass above). No textbox here either, same reasoning as the
  // success check above. Same one-shot fix as the success case above -
  // clear practiceStep before handing off so this can't re-fire.
  if (t.practiceStep === 'bat_power_demo') {
    if (++t.powerDrillTicks >= 1200) { // ~30s at 40 ticks/sec
      t.practiceStep = null;
      awaitPitchingTurn();
    }
    return;
  }

  // Batting practice: unlike pitching, this genuinely takes some timing/
  // aim to pull off - a few misses in a row means "doesn't understand the
  // mechanic yet," not "unlucky." Explain it once, then stop gating
  // progress on it entirely after enough more attempts either way.
  if (t.awaitingContact && !t.battingHintShown && t.battingMissCount >= 3) {
    t.battingHintShown = true;
    showTutorialDialog([
      IS_MOBILE
        ? "Hint: steer the joystick so your circle lines up with the ball, then hit SWING right as it's inside."
        : "Hint: line your circle up with the ball as it comes in, then click right as it's inside.",
    ], null);
    return;
  }
  if (t.awaitingContact && t.battingMissCount >= 6) {
    t.awaitingContact = false;
    t.battingMissCount = 0;
    t.battingHintShown = false;
    // bat_easy gives up the same way here - a stuck player just keeps
    // batting for real rather than staying blocked forever. Routes through
    // beginPowerUpDemo() (not straight to awaitPitchingTurn()) so they still
    // get the power-up demo, same as a successful contact would - both
    // textboxes shown back-to-back first, same as the contactMade path above.
    showTutorialDialog([
      "No worries - you'll get more chances!",
      IS_MOBILE
        ? "Let's still try your power-up - tap the icon. Keep batting for the rest of this inning - I'll cover pitching once it's your turn."
        : "Let's still try your power-up - press M. Keep batting for the rest of this inning - I'll cover pitching once it's your turn.",
    ], beginPowerUpDemo);
    return;
  }

  // Batting guidance is done (see awaitPitchingTurn()) - the rest of the
  // inning plays out for real and unguided until it's naturally the human's
  // turn to pitch (bottom of the inning - assignActiveRoles() gives p1 the
  // pitcher role there, driven entirely by real outs/switchSides(), nothing
  // scripted). That's the cue to start the guided pitching demo.
  if (t.practiceStep === 'awaiting_pitch_turn' && app.activePitcherKey === 'p1') {
    t.practiceStep = null;
    showTutorialDialog(
      ["Nice work out there! Now let's cover pitching."],
      beginPitchPractice
    );
  }
}

// Splits str into as many lines as fit within maxWidth (measured with the
// same font text() itself uses), respecting any explicit '\n' as a forced
// line break within a paragraph (used to pin specific words to their own
// line - e.g. the pitch-controls dialog forces Curveball/Riser onto a
// second line regardless of how wide the panel is).
function computeWrappedLines(str, maxWidth, size, weight) {
  const lines = [];
  str.split('\n').forEach(paragraph => {
    let line = '';
    paragraph.split(' ').forEach(w => {
      const test = line ? line + ' ' + w : w;
      if (line && textWidth(test, size, weight) > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    lines.push(line);
  });
  return lines;
}

// Bug fix: lineHeight used to be a flat, unscaled pixel value (28) while the
// font itself renders at toLen(size) (text()'s own convention) - for size 20
// that's a ~36px-tall font squeezed into 28px of vertical space, so
// descenders/ascenders on wrapped lines visibly overlapped the line above/
// below (e.g. the "p" in "special" colliding with "ONE" on the next line).
// Deriving lineHeight from the same toLen(size) the font actually renders at
// guarantees enough room between lines no matter the font size used.
// Draws pre-wrapped lines up to revealCount total characters (typewriter
// effect) - takes the already-wrapped array rather than wrapping its own
// copy, so the reveal can never cause a word to jump to a different line
// mid-animation than where it'll actually end up once fully shown.
function wrapTutorialText(lines, x, y, size, weight, revealCount) {
  const lineHeight = toLen(size) * 1.35;
  let remaining = revealCount;
  for (let i = 0; i < lines.length && remaining > 0; i++) {
    text(lines[i].slice(0, remaining), x, y + i * lineHeight, size, 'white', 1, 'left', weight);
    remaining -= lines[i].length + 1; // +1 for the space/break consumed between wrapped lines
  }
}

// The batting aim demo's live instruction (see beginBattingAimDemo()) has to
// coexist with the player actively moving the crosshair, unlike the normal
// dialogue box below (which freezes update() - see stepTutorial()'s comment
// on why it's a separate captionText field, not a dialogLines entry). A
// slim banner keeps the ball/crosshair fully visible and undimmed instead of
// the usual bottom-left coach portrait + big panel, which would sit right on
// top of the play area at this ball height.
// Bug fix: sat right on top of BACK_BUTTON_INGAME/the Skip Tutorial button
// on mobile (both occupy toY(90) to toY(90)+toLen(32)=219.6px) - panelY now
// clears that row instead of overlapping it.
function drawTutorialCaption() {
  const t = app.tutorial;
  if (!t.active || !t.captionText) return;
  const size = 18, weight = 700;
  const panelW = CANVAS_W * 0.62;
  const panelX = (CANVAS_W - panelW) / 2;
  const panelY = 235;
  const wrapped = computeWrappedLines(t.captionText, panelW - 40, size, weight);
  const lineHeight = toLen(size) * 1.3;
  // Bug fix: the last line sits at panelY + 20 + wrapped.length*lineHeight
  // (text() centers vertically on that y), but at size 18 the font itself
  // renders ~toLen(18)=32px tall - the old 34px bottom margin left only 14px
  // below that line's own center, less than half its rendered height, so the
  // text was actually clipping past the box's bottom edge instead of sitting
  // inside it with room to spare.
  const panelH = 50 + wrapped.length * lineHeight;
  rect(panelX, panelY, panelW, panelH, 'rgba(20,20,26,0.92)', 1, 'gold', 3);
  text('COACH', panelX + 20, panelY + 20, 13, 'gold', 1, 'left', 900);
  wrapped.forEach((line, i) => text(line, panelX + 20, panelY + 20 + (i + 1) * lineHeight, size, 'white', 1, 'left', weight));
}

// Points at whichever on-screen control the current tutorial step wants the
// player to use next, alongside the coach's caption explaining why - a
// bouncing arrow above the actual button, not just words. Desktop targets
// are the same key-hint boxes drawPitchMenu()/drawPowerUpUi() already draw;
// mobile targets are drawMobileControls()'s own buttons. Steps with no fixed
// on-screen control on desktop (aiming/swinging - mouse-driven, no dedicated
// button there) return null on desktop but still point at the equivalent
// mobile button.
function tutorialArrowTarget() {
  const t = app.tutorial;
  if (!t.active) return null;
  if (t.practiceStep === 'pitch') {
    if (t.pitchIntroPhase === 'pressW') {
      // Once a type's actually armed (requested: press-then-click), point at
      // the timing meter itself, over the pitcher - same spot on both
      // platforms, since that's where the confirm click/tap needs to land.
      if (app.pitchArmed) return { x: toX(PITCH_METER_OVERLAY.x), y: toY(PITCH_METER_OVERLAY.y) + toLen(PITCH_METER_OVERLAY.h) / 2 };
      return IS_MOBILE
        ? { x: toX(PITCH_BUTTONS[0].x) + lenX(PITCH_BUTTON_SIZE.w) / 2, y: toY(PITCH_BUTTON_SIZE.y) + toLen(PITCH_BUTTON_SIZE.h) / 2 }
        : { x: toX(10) + toLen(10), y: toY(310) + toLen(10) }; // drawPitchMenu()'s W/Fastball row - toLen(10) is half its toLen(20) box
    }
    if (t.pitchIntroPhase === 'pressZ') {
      return IS_MOBILE
        ? { x: toX(POWERUP_BUTTON_PITCHING.x) + toLen(POWERUP_BUTTON_PITCHING.size) / 2, y: toY(POWERUP_BUTTON_PITCHING.y) + toLen(POWERUP_BUTTON_PITCHING.size) / 2 }
        : { x: toX(10) + toLen(12), y: toY(105) + toLen(12) }; // drawPowerUpUi()'s Z box - toLen(12) is half its toLen(24) box
    }
    return null;
  }
  if (t.practiceStep === 'bat_aim_demo') {
    // Points at the frozen ball itself (requested) - on both platforms now.
    // Previously mobile pointed at the joystick instead (a control to use)
    // and desktop showed nothing at all - but the ball's own position on
    // screen is the actual thing a player needs to notice first, not just
    // "here's a control." Once they've actually found it (on target), the
    // crosshair already marks that same spot, so pointing at the ball again
    // would be redundant - mobile switches to the swing button instead;
    // desktop still has nothing to point at there (click works anywhere).
    if (t.aimDemoFrozen && !t.aimDemoOnTarget) {
      return { x: ball.x, y: ball.y };
    }
    if (IS_MOBILE && t.aimDemoFrozen && t.aimDemoOnTarget) {
      return { x: toX(SWING_BUTTON.x) + toLen(SWING_BUTTON.size) / 2, y: toY(SWING_BUTTON.y) + toLen(SWING_BUTTON.size) / 2 };
    }
    return null;
  }
  if (t.practiceStep === 'bat_power_demo' && app.batPowerFull) {
    return IS_MOBILE
      ? { x: toX(POWERUP_BUTTON.x) + toLen(POWERUP_BUTTON.size) / 2, y: toY(POWERUP_BUTTON.y) + toLen(POWERUP_BUTTON.size) / 2 }
      : { x: toX(260) + toLen(12), y: toY(105) + toLen(12) }; // drawPowerUpUi()'s M box
  }
  return null;
}
function drawTutorialArrow(x, y) {
  const bounce = Math.sin(Date.now() / 200) * toLen(4); // gentle idle bounce, same Date.now()-driven style as the menu's decorative animations
  ctx.save();
  ctx.translate(x, y - toLen(30) + bounce);
  ctx.fillStyle = 'gold';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, toLen(15));
  ctx.lineTo(-toLen(9), -toLen(4));
  ctx.lineTo(toLen(9), -toLen(4));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Generic speaker dialogue box (see app.dialog's own comment) - portrait +
// name + typewriter text, used for both Coach's tutorial lines and solo-mode
// opponent intro/win/lose lines.
function drawDialogOverlay() {
  const d = app.dialog;
  if (!d.active || d.lines.length === 0) return;

  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.55);

  const img = d.speakerImg;
  const naturalW = (img && img.naturalWidth) || 832, naturalH = (img && img.naturalHeight) || 1280;
  const coachH = 420;
  const coachW = coachH * (naturalW / naturalH);
  const coachX = 10;
  const coachY = CANVAS_H - coachH + 30; // feet crop slightly off the bottom edge - reads as "walked into frame"
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, coachX, coachY, coachW, coachH);
  }

  const textSize = 20, textWeight = 700;
  const panelX = coachX + coachW - 15;
  const panelW = CANVAS_W - panelX - 40;
  const textTopPad = 68, bottomPad = 44;
  const lineHeight = toLen(textSize) * 1.35;
  // Wrapped once against the FULL line (not however much is revealed so
  // far) so the panel height and each word's line placement stay fixed for
  // the whole reveal instead of resizing/reflowing as text types in.
  const wrappedLines = computeWrappedLines(d.lines[0], panelW - 52, textSize, textWeight);
  const panelH = Math.max(200, textTopPad + wrappedLines.length * lineHeight + bottomPad);
  const panelY = CANVAS_H - panelH - 30;

  rect(panelX, panelY, panelW, panelH, 'rgba(20,20,26,0.95)', 1, 'gold', 3);
  text(d.speakerName.toUpperCase(), panelX + 26, panelY + 30, 16, 'gold', 1, 'left', 900);

  const revealCount = Math.floor(d.revealProgress);
  wrapTutorialText(wrappedLines, panelX + 26, panelY + textTopPad, textSize, textWeight, revealCount);

  const fullyRevealed = revealCount >= d.lines[0].length;
  text(
    fullyRevealed
      ? (IS_MOBILE ? 'Tap to continue ▶' : 'Click or press any key to continue ▶')
      : (IS_MOBILE ? 'Tap to skip ▶' : 'Click or press any key to skip ▶'),
    panelX + panelW - 24, panelY + panelH - 22, 13, '#cccccc', 0.9, 'right', 600);
}

function drawTutorialOverlay() {
  drawTutorialCaption();
  const arrowTarget = tutorialArrowTarget();
  if (arrowTarget) drawTutorialArrow(arrowTarget.x, arrowTarget.y);
  drawDialogOverlay();
}

/* ============================== INPUT: GAMEPLAY ============================== */
function canStartPitch() {
  // Bug fix (requested): a new pitch may never be started while any powerup
  // animation, the call banner, or a dice roll is still resolving. app.powerUpActive
  // only clears once resetBall() runs at the end of the current play.
  return ball.x === toX(61) && ball.y === toY(250) && !app.callActive && !app.diceRolling
    && !app.isPitching && !app.powerUpActive;
}

function handleGameplayKey(key, repeat) {
  // While the quit confirmation is up, it owns all keyboard input - nothing
  // else (swinging, pitching, fire tune mode, ...) should react to a
  // keypress meant to answer the dialog.
  if (app.showQuitConfirm) {
    // Same up/down-arrow-cursor navigation as the mode-select screen -
    // Enter confirms whichever button quitConfirmIndex currently points at.
    // Y/N remain direct shortcuts that don't need the cursor moved first.
    if (key === 'arrowup' || key === 'arrowdown') { app.quitConfirmIndex = app.quitConfirmIndex === 0 ? 1 : 0; return; }
    if (key === 'enter') { if (app.quitConfirmIndex === 0) quitToModeSelect(); else closeQuitConfirmAndResume(); return; }
    if (key === 'y') quitToModeSelect();
    else if (key === 'escape' || key === 'n') closeQuitConfirmAndResume();
    return;
  }
  // While Coach is talking, any key (other than Escape, which still opens
  // the normal quit confirmation) advances to the next line instead of
  // reaching pitching/swinging/fire-tune below. Only a genuine keypress
  // advances it - the browser's own auto-repeat while a key is held would
  // otherwise blow through several lines in one held press.
  if (app.dialog.active && app.dialog.lines.length > 0) {
    if (key === 'escape') { openQuitConfirm(); return; }
    if (!repeat) advanceDialog();
    return;
  }
  if (key === 'escape') { openQuitConfirm(); return; }

  const humanPitching = app.activePitcherKey !== 'cpu';
  const humanBatting = app.activeBatterKey !== 'cpu';
  // Solo only ever has one human, who always uses WASD regardless of home/away.
  // Versus keeps the original home=WASD/away=arrows split (p1 is always home there).
  const usesWasd = app.mode === 'solo' ? true : app.homePitching;

  // Bug fix: this used to be a blanket `if (ghostBalls[0].visible) return;`
  // at the top of the function, which also blocked the M-key entirely - the
  // batter couldn't arm Mirror Ball, Time Stop, or any other power while
  // Ghost Ball's decoys were on screen, making those powers look "broken"
  // against Ghost Ball specifically when really their input was just being
  // swallowed. The guard exists because ghostBalls[0].visible becomes true a
  // full tick before ball.x actually starts tracking the decoys (see
  // stepGhostBalls()), so canStartPitch() can't yet tell a new pitch
  // shouldn't start during that narrow window - but that only matters for
  // the PITCHING keys (WASD/Z), never for the batter's M-key.
  if (humanPitching && canStartPitch() && !ghostBalls[0].visible) {
    let base = null;
    if ((usesWasd && key === 'w') || (!usesWasd && key === 'arrowup')) base = 'Fastball';
    else if ((usesWasd && key === 'a') || (!usesWasd && key === 'arrowleft')) base = 'Knuckleball';
    else if ((usesWasd && key === 's') || (!usesWasd && key === 'arrowdown')) base = 'Curveball';
    else if ((usesWasd && key === 'd') || (!usesWasd && key === 'arrowright')) base = 'Riser';
    if (base) {
      // Gambler's Roll dice outcomes are already a predetermined tier - like
      // every auto-sequence power-up, there's nothing to time, so these
      // throw immediately exactly as before, bypassing the arm/meter/confirm
      // flow below entirely.
      if (app.ballSlow) { app.isPitching = true; app.pitch = 'E' + base; app.ballSlow = false; }
      else if (app.ballFast) { app.isPitching = true; app.pitch = 'H' + base; app.ballFast = false; }
      else {
        // Timing meter (requested): this key ARMS the pitch instead of
        // throwing it - a meter then sweeps over the pitcher until a click/
        // tap CONFIRMS it (see confirmArmedPitch()). Pressing a different
        // pitch key while one's already armed just re-arms to the new type
        // (canStartPitch() stays true throughout - isPitching only becomes
        // true once confirmArmedPitch() actually throws it).
        app.pitchArmed = base.toLowerCase();
        app.pitchMeterPos = 0;
        app.pitchMeterDir = 1;
      }
    }
  }

  // Solo/tutorial (requested): the same single player is always the one
  // pitching AND batting, so there's no need to remember which key belongs
  // to which role - either Z or M activates whichever power-up is currently
  // live. Versus keeps Z strictly for pitching / M strictly for batting,
  // since there both roles are simultaneously "human" (two different
  // players sharing one keyboard) and the keys double as each player's own
  // assigned button.
  const eitherKeyActivatesPower = app.mode === 'solo' || app.tutorial.active;
  const batPowerKeyPressed = key === 'm' || (eitherKeyActivatesPower && key === 'z');
  const pitchPowerKeyPressed = key === 'z' || (eitherKeyActivatesPower && key === 'm');

  // Bug fix: gamblerBatting's startDiceRoll(true) shares the exact same dice
  // state (diceRolling/diceForBatting/diceCount/etc.) as the pitcher's
  // gamblerPitching - the pitch-power path is already protected from this via
  // canStartPitch()'s !app.diceRolling check, but the bat-power path had no
  // such guard, so activating Gambler's Roll as the batter while the
  // pitcher's own Gambler's Roll was still resolving would stomp its state
  // mid-roll ("Gambler can overpower other gambler"). Block ALL bat-powers
  // (not just gamblerBatting) while any dice roll is in progress, matching
  // the pitch-power side's guarantee that no power-up can be activated while
  // another is already resolving.
  if (batPowerKeyPressed && humanBatting && app.batPowerFull && !app.diceRolling) {
    app.humanUsedPowerThisGame = true; // for the "won without using a power-up" unlock condition
    activateBatPower();
  }

  // Pitching powerups: arms the power and, unless it plays out as its own
  // self-contained animation (Ghost/Meteor), immediately delivers the pitch
  // with the modifier attached so there is never a window where a second
  // pitch could be thrown mid-effect (see canStartPitch bug fix above).
  // Bug fix: also blocked while a plain pitch is already armed and awaiting
  // its confirm click (app.pitchArmed) - activating an auto-sequence power
  // then would leave that stale arm/meter dangling into the power's own
  // animation, and a later click would wrongly confirm-throw a second,
  // unrelated pitch on top of it.
  if (pitchPowerKeyPressed && humanPitching && app.pitchPowerFull && canStartPitch() && !ghostBalls[0].visible && !app.pitchArmed) {
    app.humanUsedPowerThisGame = true; // for the "won without using a power-up" unlock condition
    activatePitchPower();
  }
}

// Confirms whichever pitch type is currently armed (see handleGameplayKey()'s
// WASD branch) - reads the timing meter's position at this exact instant to
// pick Hard/Normal/Easy, then actually throws it. Wired to a click/tap (see
// handlePointerDown()/handleMobilePlayTap()), the same way a swing is.
function confirmArmedPitch() {
  const type = app.pitchArmed;
  if (!type) return;
  app.pitchArmed = null;
  const base = type.charAt(0).toUpperCase() + type.slice(1);
  const zone = pitchMeterZone(type);
  app.isPitching = true;
  app.pitch = (zone === 'good' ? 'H' : zone === 'bad' ? 'E' : '') + base;
}

// Activates whichever bat power the current batter holds - extracted out of
// the M-key handler above (mirrors activatePitchPower()) so both the M-key
// and, in solo/tutorial only, the Z-key can trigger it without duplicating
// this branch chain.
function activateBatPower() {
  const power = batterChar().bat.key;
  app.batPowerFull = false;
  // Only Gambler's Roll/Mirror Ball/Future Sight have power-up sounds among
  // the batting powers. Gambler's Roll and Mirror Ball don't play here -
  // their sound is tied to a later animation beat (see startDiceRoll() and
  // resolveUnswungStrike()'s reverseBall branch, respectively) - everything
  // else now activates silently.
  // Fire: the whole crosshair becomes a "critical crosshair" - any contact at
  // all is a Home Run while it's active. Persists until contact or inning change.
  if (power === 'fire') { app.batFireVisible = true; }
  else if (power === 'timeStop') { app.stopTime = true; }
  // Expand/Blackout Swing/Guaranteed Contact persist (no longer reset by
  // resetBall()/recordStrike()) until contact happens or the inning changes,
  // both of which route through clearPowerupVisuals().
  else if (power === 'expandShot') { crosshairRadius = toLen(20); criticalRadius = toLen(6); app.batterBig = true; }
  else if (power === 'gamblerBatting') { startDiceRoll(true); }
  else if (power === 'mirrorBall') { app.mirrorBallActive = true; }
  else if (power === 'iceShield') { app.shieldWidth = lenX(9.001); }
  else if (power === 'futureSight') { app.showFutureSight = true; playSound(POWER_SOUNDS.futureSight); }
  else if (power === 'blackoutSwing') { crosshairRadius = toLen(30); crosshairStyle = 'blackout'; critHidden = true; }
  else if (power === 'pause') { app.paused = true; }
  else if (power === 'guaranteedContact') { critHidden = true; crosshairRadius = toLen(25); }
}

// Activates whichever pitch power the current pitcher holds - extracted out
// of the Z-key handler above so cpuPitch() can trigger the exact same
// effects for a CPU pitcher (see CPU_POWER_CHANCE) instead of duplicating
// this 10-branch chain. Deliberately has no idea whether a human or the CPU
// called it - it only ever reads pitcherChar(), which already resolves to
// whichever side is actually pitching.
function activatePitchPower() {
  const power = pitcherChar().pitch.key;
  app.pitchPowerFull = false;
  // Only Spin Cycle/Drone Ball/Gambler's Roll have power-up sounds among the
  // pitching powers, and none of them play here - Spin Cycle's starts once
  // the ball is actually spinning (stepSpinCycle()), Drone Ball's starts the
  // instant it launches (applyPitchVelocity()), and Gambler's Roll's starts
  // with the dice roll itself (startDiceRoll()). Everything else now
  // activates silently.
  // Void/Ghost/Meteor/SpinCycle/DroneBall/FastballPlus/Mirage/GamblerPitching all
  // launch or play out their own in-flight sequence, so powerUpActive blocks a
  // second pitch from being thrown mid-effect. Ball Shrink and Ice Ball are just
  // instant modifiers now (no auto-pitch) - the pitcher keeps full control and can
  // throw any WASD pitch immediately afterward, so they don't set powerUpActive.
  if (power === 'void') { app.powerUpActive = true; app.voidActive = true; app.pitch = 'Fastball'; app.isPitching = true; }
  else if (power === 'ghost') {
    app.powerUpActive = true;
    app.ghostActive = true;
    app.pitch = 'Ghost'; // lets Future Sight (and anything else keyed off app.pitch) recognize it
    const n = randRange(0, 3);
    ghostBalls.forEach((g, i) => { g.visible = true; g.isReal = (i === n); g.x = toX(80); });
  } else if (power === 'meteor') {
    app.powerUpActive = true;
    app.meteorActive = true; app.meteorX = lenX(70); app.meteorY = toLen(34); // exact old first-visible point - no pause before it appears, same fall after that (see applyPitchVelocity's Meteor case)
    app.pitch = 'Meteor'; // lets Future Sight (and anything else keyed off app.pitch) recognize it
  } else if (power === 'spinCycle') {
    app.powerUpActive = true;
    app.pitch = 'SpinCycle'; app.isPitching = true;
  } else if (power === 'droneBall') {
    app.powerUpActive = true;
    app.pitch = 'DroneBall'; app.isPitching = true;
  } else if (power === 'gamblerPitching') {
    app.powerUpActive = true;
    startDiceRoll(false);
  } else if (power === 'ballShrink') {
    ball.radius = toLen(1); // only shrinks the ball - pitcher still throws normally
    app.pitcherSmall = true; // visual flourish: the pitcher shrinks along with the ball, for this pitch only
  } else if (power === 'fastballPlus') {
    app.powerUpActive = true;
    app.pitch = 'FastballPlus'; app.isPitching = true;
  } else if (power === 'iceBall') {
    app.batterFrozen = true; // only slows the batter's crosshair - pitcher still throws normally
  } else if (power === 'mirage') {
    app.powerUpActive = true;
    app.mirageCount += 1; app.pitch = 'Fastball'; app.isPitching = true;
  }
}

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / r.width, scaleY = CANVAS_H / r.height;
  mouseX = (e.clientX - r.left) * scaleX;
  mouseY = (e.clientY - r.top) * scaleY;
});

// Bug fix: nothing previously stopped a second mousedown from registering
// another full swing (resetting checkHit/isBatting) while the current
// swing's animation was still playing out - a double-fired click (or two
// quick presses) produced two swings/resolutions for what should be one.
// Once a swing is in progress, ignore further attempts until it finishes.
// Shared by the desktop click-to-swing handler and the mobile Swing button.
// A mistimed swing gets this many extra ticks of contact-checking (see
// resolveHit()) before it's judged a genuine miss, instead of only the
// single instant the swing was thrown on - the ball keeps moving each of
// those ticks, so a slightly early/late swing still has a chance to connect.
const SWING_CONTACT_WINDOW = 4;

function attemptSwing() {
  if (app.isBatting) return;
  // Tutorial's batting aim demo: the ball is artificially frozen mid-flight
  // for this step (see beginBattingAimDemo()), so a swing here is never
  // meant to enter the real contact/resolveHit() pipeline - it's a pure
  // "did they swing while on-target" check, picked up by stepTutorial().
  // Swinging before reaching on-target is just silently ignored - no
  // penalty, they simply keep aiming and try again.
  if (app.tutorial.active && app.tutorial.practiceStep === 'bat_aim_demo') {
    if (app.tutorial.aimDemoOnTarget) app.tutorial.aimDemoSwung = true;
    return;
  }
  app.isBatting = true;
  app.checkHit = true;
  app.swingContactTicksLeft = SWING_CONTACT_WINDOW;
  app.swung = true;
  // Crowd gets loud right on the swing itself (hit or miss) - stepCrowdVolume()
  // (called every tick from update()) eases it back down toward the
  // baseline afterward instead of cutting back instantly.
  crowdVolume = CROWD_SWING_VOLUME;
  crowdSound.volume = crowdVolume;
}

// Shared by the mouse and touch input paths (see the touchstart listener
// below) so tapping a button on a touch device and clicking it with a mouse
// (used while testing with ?mobile=1, which has no real touch hardware)
// dispatch through the exact same logic.
function handlePointerDown(x, y) {
  if (pokiBreakPending) return; // don't let a click/tap during an ad break reach whatever screen is underneath it
  if (app.screen === 'onboarding') { handleOnboardingClick(x, y); return; }
  if (app.screen === 'mode') { handleModeClick(x, y); return; }
  if (app.screen === 'soloModeSelect') { handleSoloModeSelectClick(x, y); return; }
  if (app.screen === 'characterSolo') {
    if (pointInBackButton(x, y)) { goBackToModeSelect(); return; }
    if (pointInUnitRect(x, y, UPGRADES_BUTTON)) { app.screen = 'upgrades'; return; }
    return;
  }
  if (app.screen === 'characterVersus') {
    if (pointInBackButton(x, y)) goBackToModeSelect();
    return;
  }
  if (app.screen === 'upgrades') { handleUpgradesClick(x, y); return; }
  if (app.screen === 'mobileCharacterSelect') { handleMobileCharacterSelectTap(x, y); return; }
  if (app.screen === 'mobileCpuSelect') { handleMobileCpuSelectTap(x, y); return; }
  if (app.screen === 'mobileUpgrades') { handleMobileUpgradesTap(x, y); return; }
  if (app.screen === 'gameOver') {
    if (pointInGameOverButton(x, y)) goToCharacterSelectAfterGameOver();
    return;
  }
  if (app.screen === 'unlockReveal') { dismissUnlockReveal(); return; }
  if (app.screen !== 'play') return;
  if (app.showQuitConfirm) {
    if (pointInQuitYesButton(x, y)) quitToModeSelect();
    else if (pointInQuitNoButton(x, y)) closeQuitConfirmAndResume();
    return;
  }
  // Click anywhere to advance the dialogue box - matches the "any key"
  // behavior in handleGameplayKey().
  if (app.dialog.active && app.dialog.lines.length > 0) { advanceDialog(); return; }
  if (IS_MOBILE) { handleMobilePlayTap(x, y); return; }
  // Solo mode (requested): clicking a pitch-menu row (drawPitchMenu()'s W/A/S/D
  // key-hint boxes) arms that pitch type, same as pressing the actual key -
  // not just a visual legend anymore. Versus mode keeps keyboard-only arming.
  if (app.mode === 'solo' && app.activePitcherKey !== 'cpu') {
    const keys = ['w', 'a', 's', 'd'];
    for (let i = 0; i < 4; i++) {
      if (pointInPitchMenuRow(i, x, y)) { handleGameplayKey(keys[i]); return; }
    }
  }
  // Timing meter (requested): any click that isn't one of the pitch-menu
  // rows above (e.g. clicking the meter itself, drawn over the pitcher)
  // confirms whichever type is currently armed.
  if (app.activePitcherKey !== 'cpu' && app.pitchArmed) { confirmArmedPitch(); return; }
  if (app.activeBatterKey === 'cpu') return;
  if (x > toX(250)) attemptSwing();
}

canvas.addEventListener('mousedown', e => { ensureMusicStarted(); handlePointerDown(mouseX, mouseY); });

function touchToCanvasXY(touch) {
  const r = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / r.width, scaleY = CANVAS_H / r.height;
  return { x: (touch.clientX - r.left) * scaleX, y: (touch.clientY - r.top) * scaleY };
}

// A generous hit-region around the joystick's visible base (1.6x its radius)
// so a finger landing just outside the drawn circle still grabs it.
function pointInJoystickZone(x, y) {
  const bx = toX(JOYSTICK_BASE.x), by = toY(JOYSTICK_BASE.y);
  return Math.hypot(x - bx, y - by) <= toLen(JOYSTICK_BASE.radius) * 1.6;
}

function updateJoystickDeflection(x, y) {
  const bx = toX(JOYSTICK_BASE.x), by = toY(JOYSTICK_BASE.y), maxR = toLen(JOYSTICK_BASE.radius);
  let dx = x - bx, dy = y - by;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; }
  joystick.dx = dx / maxR;
  joystick.dy = dy / maxR;
}

// preventDefault (and the {passive:false} needed to allow it) stops the page
// from scrolling/zooming/pull-to-refreshing while dragging the joystick or
// mashing buttons during play.
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  ensureMusicStarted();
  for (const touch of e.changedTouches) {
    const { x, y } = touchToCanvasXY(touch);
    // Only the batting layout has a joystick at all (drawMobileControls) -
    // a touch landing in that zone during any other screen/role just falls
    // through to the normal tap dispatch below. Also excluded while Coach's
    // dialogue box is up: it dims/covers the joystick's usual spot (along
    // with the rest of the screen) and freezes gameplay, so a tap there
    // should dismiss the dialogue (via handlePointerDown()) instead of
    // silently grabbing an invisible, inert joystick.
    if (app.screen === 'play' && !app.showQuitConfirm && app.activeBatterKey !== 'cpu'
        && !(app.dialog.active && app.dialog.lines.length > 0)
        && joystick.touchId === null && pointInJoystickZone(x, y)) {
      joystick.touchId = touch.identifier;
      updateJoystickDeflection(x, y);
    } else {
      handlePointerDown(x, y);
    }
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystick.touchId) {
      const { x, y } = touchToCanvasXY(touch);
      updateJoystickDeflection(x, y);
    }
  }
}, { passive: false });

// Releasing the joystick finger stops crosshair movement (stepCrosshair())
// rather than snapping the knob back to a "centered = still moving" state -
// see stepCrosshair()'s mobile branch.
function releaseJoystickTouch(e) {
  for (const touch of e.changedTouches) {
    if (touch.identifier === joystick.touchId) {
      joystick.touchId = null; joystick.dx = 0; joystick.dy = 0;
    }
  }
}
canvas.addEventListener('touchend', releaseJoystickTouch, { passive: true });
canvas.addEventListener('touchcancel', releaseJoystickTouch, { passive: true });

function handleModeClick(x, y) {
  if (IS_MOBILE) {
    if (pointInPlayButton(x, y)) {
      enterSoloMode();
    } else if (pointInMobileTutorialButton(x, y)) {
      startTutorial();
    }
    return;
  }
  if (x >= toX(125) && x <= toX(275) && y >= toY(250) && y <= toY(330)) {
    app.modeSelectIndex = 2;
    app.mode = 'versus'; app.screen = 'characterVersus';
    randomizeCharacterCursor('versus');
  } else if (x >= toX(125) && x <= toX(275) && y >= toY(160) && y <= toY(240)) {
    app.modeSelectIndex = 1;
    enterSoloMode();
  } else if (x >= toX(125) && x <= toX(275) && y >= toY(70) && y <= toY(150)) {
    app.modeSelectIndex = 0;
    startTutorial();
  }
}

const BACK_BUTTON = { x: 10, y: 10, w: 70, h: 32 };
// In-game only: the top-left BACK_BUTTON spot sits under the scoreboard
// (rect at y:8-83, see drawScoreboard) once gameplay starts, so
// drawMobileControls()/handleMobilePlayTap() use this lower position
// instead - every other screen (no scoreboard) keeps using BACK_BUTTON.
const BACK_BUTTON_INGAME = { x: 10, y: 90, w: 70, h: 32 };
function pointInBackButton(x, y, btn) {
  btn = btn || BACK_BUTTON;
  return x >= toX(btn.x) && x <= toX(btn.x) + lenX(btn.w)
    && y >= toY(btn.y) && y <= toY(btn.y) + toLen(btn.h);
}
function drawBackButton(btn) {
  btn = btn || BACK_BUTTON;
  const bx = toX(btn.x), by = toY(btn.y), bw = lenX(btn.w), bh = toLen(btn.h);
  rect(bx, by, bw, bh, 'rgba(0,0,0,0.5)', 1, 'white', 2);
  text('< Back', bx + bw / 2, by + bh / 2, 16, 'white', 1, 'center', 700);
}

// Generic unit-space rect hit-test/draw pair, used by the Upgrades button and
// the new Upgrades screen's rows - same math as pointInBackButton()/
// drawBackButton() above, just not hardcoded to the Back button's own label.
function pointInUnitRect(x, y, btn) {
  return x >= toX(btn.x) && x <= toX(btn.x) + lenX(btn.w)
    && y >= toY(btn.y) && y <= toY(btn.y) + toLen(btn.h);
}
function drawUnitButton(btn, label, enabled) {
  const bx = toX(btn.x), by = toY(btn.y), bw = lenX(btn.w), bh = toLen(btn.h);
  rect(bx, by, bw, bh, enabled === false ? 'rgba(60,60,60,0.6)' : 'rgba(0,0,0,0.5)', 1, enabled === false ? '#777' : 'white', 2);
  text(label, bx + bw / 2, by + bh / 2, 15, enabled === false ? '#999' : 'white', 1, 'center', 700);
}

// Bottom-center button on the Solo character-select screen, below the
// existing "A/D S To Select" hint row.
const UPGRADES_BUTTON = { x: 150, y: 368, w: 100, h: 28 };
// Mobile: sits in the same bottom row as the nav triangles (x:20-132) and
// Confirm/Buy (x:280-390), filling the empty gap between them (x:132-280)
// rather than needing a whole new row (no vertical room left below y:400).
const MOBILE_UPGRADES_BUTTON = { x: 156, y: 345, w: 100, h: 30 };

// Shared bottom-left prev/next triangle buttons + bottom-right Confirm
// button used by both mobile select screens (mobileCharacterSelect and
// mobileCpuSelect) - same layout, same hit-testing, only the action
// each screen wires them to differs. Sizes use toLen() for both dimensions
// (not lenX() for width) so the buttons render as true squares instead of
// stretching with the canvas's non-uniform X/Y scale - same reasoning as
// drawPitchMenu's boxSize.
const MOBILE_NAV_BTN = { size: 50, y: 335 };
const MOBILE_NAV_LEFT_X = 20;
const MOBILE_NAV_RIGHT_X = 82;
const MOBILE_CONFIRM_BUTTON = { x: 280, y: 335, w: 110, h: 50 };

function pointInMobileNavLeft(x, y) {
  return x >= toX(MOBILE_NAV_LEFT_X) && x <= toX(MOBILE_NAV_LEFT_X) + toLen(MOBILE_NAV_BTN.size)
    && y >= toY(MOBILE_NAV_BTN.y) && y <= toY(MOBILE_NAV_BTN.y) + toLen(MOBILE_NAV_BTN.size);
}
function pointInMobileNavRight(x, y) {
  return x >= toX(MOBILE_NAV_RIGHT_X) && x <= toX(MOBILE_NAV_RIGHT_X) + toLen(MOBILE_NAV_BTN.size)
    && y >= toY(MOBILE_NAV_BTN.y) && y <= toY(MOBILE_NAV_BTN.y) + toLen(MOBILE_NAV_BTN.size);
}
function pointInMobileConfirm(x, y) {
  const b = MOBILE_CONFIRM_BUTTON;
  return x >= toX(b.x) && x <= toX(b.x) + lenX(b.w) && y >= toY(b.y) && y <= toY(b.y) + toLen(b.h);
}
function drawMobileNavButtons() {
  const s = toLen(MOBILE_NAV_BTN.size), by = toY(MOBILE_NAV_BTN.y);
  const lx = toX(MOBILE_NAV_LEFT_X), rx = toX(MOBILE_NAV_RIGHT_X);
  rect(lx, by, s, s, 'rgba(0,0,0,0.5)', 1, 'white', 2);
  drawArrowTriangle(lx + s / 2, by + s / 2, toLen(22), -1, 1);
  rect(rx, by, s, s, 'rgba(0,0,0,0.5)', 1, 'white', 2);
  drawArrowTriangle(rx + s / 2, by + s / 2, toLen(22), 1, 1);
}
function drawMobileConfirmButton(label) {
  const b = MOBILE_CONFIRM_BUTTON;
  const bx = toX(b.x), by = toY(b.y), bw = lenX(b.w), bh = toLen(b.h);
  rect(bx, by, bw, bh, 'gold', 1, 'white', 3);
  text(label || 'Confirm', bx + bw / 2, by + bh / 2, 20, '#222', 1, 'center', 900);
}

// Mobile has no 2-player mode, so the mode-select screen collapses to one
// "Play" box in roughly the same spot the desktop "Solo" box occupies, plus
// a smaller "Tutorial" box below it (Tutorial skips character select
// entirely on both platforms - see startTutorial() - so it doesn't need its
// own mobile character/difficulty flow, just a direct entry point here).
const PLAY_BUTTON = { x: 125, y: 150, w: 150, h: 90 };
const MOBILE_TUTORIAL_BUTTON = { x: 125, y: 250, w: 150, h: 70 };
function pointInPlayButton(x, y) {
  return x >= toX(PLAY_BUTTON.x) && x <= toX(PLAY_BUTTON.x) + lenX(PLAY_BUTTON.w)
    && y >= toY(PLAY_BUTTON.y) && y <= toY(PLAY_BUTTON.y) + toLen(PLAY_BUTTON.h);
}
function pointInMobileTutorialButton(x, y) {
  const b = MOBILE_TUTORIAL_BUTTON;
  return x >= toX(b.x) && x <= toX(b.x) + lenX(b.w) && y >= toY(b.y) && y <= toY(b.y) + toLen(b.h);
}

// Sized wider than the mode-select buttons below (200 vs 150) to comfortably
// fit "Show Me The Tutorial"/"I Know The Controls" without wrapping.
const ONBOARDING_TUTORIAL_BTN = { x: 100, y: 150, w: 200, h: 70 };
const ONBOARDING_SKIP_BTN = { x: 100, y: 245, w: 200, h: 70 };
function pointInOnboardingTutorialBtn(x, y) { return pointInUnitRect(x, y, ONBOARDING_TUTORIAL_BTN); }
function pointInOnboardingSkipBtn(x, y) { return pointInUnitRect(x, y, ONBOARDING_SKIP_BTN); }
function drawOnboardingChoice(btn, label, selected) {
  rect(toX(btn.x), toY(btn.y), lenX(btn.w), toLen(btn.h), 'rgba(20,20,26,0.9)', 1, selected ? 'gold' : 'white', selected ? 3 : 2);
  text(label, toX(btn.x + btn.w / 2), toY(btn.y + btn.h / 2), 20, 'white', 1, 'center', 900);
}

// The very first screen a session sees (app.screen defaults to 'onboarding')
// - asks whether the player already knows the controls before assuming
// either way, rather than forcing everyone through the tutorial or silently
// skipping it. Reuses the same background/showcase/logo as drawModeSelect()
// underneath, then dims the whole thing with a black overlay and draws the
// prompt as a crisp modal on top - same technique drawQuitConfirm() uses -
// rather than more yellow menu-style buttons sitting directly on the scene.
function drawOnboardingPrompt() {
  drawMenuBackground();
  drawMenuParticles();
  drawCharacterShowcase();
  drawTitleLogo();

  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.75);

  text('New to Hero Ball?', CANVAS_W / 2, toY(110), 30, 'white', 1, 'center', 900);

  if (IS_MOBILE) {
    drawOnboardingChoice(ONBOARDING_TUTORIAL_BTN, 'Show Me The Tutorial', false);
    drawOnboardingChoice(ONBOARDING_SKIP_BTN, 'I Know The Controls', false);
    return;
  }

  drawOnboardingChoice(ONBOARDING_TUTORIAL_BTN, 'Show Me The Tutorial', app.onboardingIndex === 0);
  drawOnboardingChoice(ONBOARDING_SKIP_BTN, 'I Know The Controls', app.onboardingIndex === 1);

  const cursorY = app.onboardingIndex === 0 ? ONBOARDING_TUTORIAL_BTN.y + ONBOARDING_TUTORIAL_BTN.h / 2 : ONBOARDING_SKIP_BTN.y + ONBOARDING_SKIP_BTN.h / 2;
  text('▶', toX(ONBOARDING_TUTORIAL_BTN.x - 10), toY(cursorY), 30, 'white', 1, 'right', 900);
  text('Up / Down · Enter To Select', CANVAS_W / 2, toY(345), 16, 'white', 0.85, 'center', 700);
}
function handleOnboardingClick(x, y) {
  if (pointInOnboardingTutorialBtn(x, y)) { startTutorial(); return; }
  if (pointInOnboardingSkipBtn(x, y)) { app.screen = 'mode'; return; }
}

/* ============================== MENU DRAWING ============================== */
function drawModeSelect() {
  drawMenuBackground();
  drawMenuParticles();
  drawCharacterShowcase();
  drawTitleLogo();

  if (IS_MOBILE) {
    rect(toX(PLAY_BUTTON.x), toY(PLAY_BUTTON.y), lenX(PLAY_BUTTON.w), toLen(PLAY_BUTTON.h), 'gold', 1, 'white', 5);
    text('Play', toX(200), toY(PLAY_BUTTON.y + PLAY_BUTTON.h / 2), 46, '#222', 1, 'center', 900);
    const tb = MOBILE_TUTORIAL_BUTTON;
    rect(toX(tb.x), toY(tb.y), lenX(tb.w), toLen(tb.h), 'gold', 1, 'white', 5);
    text('Tutorial', toX(200), toY(tb.y + tb.h / 2), 26, '#222', 1, 'center', 900);
    text('Tap A Mode To Start', CANVAS_W / 2, toY(345), 16, 'white', 0.85, 'center', 700);
    return;
  }

  rect(toX(125), toY(70), lenX(150), toLen(80), 'gold', 1,
    app.modeSelectIndex === 0 ? 'white' : null, 5);
  text('Tutorial', toX(200), toY(110), 30, '#222', 1, 'center', 900);

  rect(toX(125), toY(160), lenX(150), toLen(80), 'gold', 1,
    app.modeSelectIndex === 1 ? 'white' : null, 5);
  text('Solo', toX(200), toY(200), 46, '#222', 1, 'center', 900);

  rect(toX(125), toY(250), lenX(150), toLen(80), 'gold', 1,
    app.modeSelectIndex === 2 ? 'white' : null, 5);
  text('2 Player', toX(200), toY(290), 32, '#222', 1, 'center', 900);

  // Cursor: a pointer arrow beside whichever option is currently selected
  const cursorY = app.modeSelectIndex === 0 ? 110 : app.modeSelectIndex === 1 ? 200 : 290;
  text('▶', toX(115), toY(cursorY), 34, 'white', 1, 'right', 900);
  text('Up / Down · Enter To Select', CANVAS_W / 2, toY(360), 16, 'white', 0.85, 'center', 700);
}

// Shows each character's two power-ups as small circle-outlined badges
// sitting just outside their shoulders on the portrait card - bat power on
// the left, pitch power on the right.
function drawShoulderPowerIcons(cx, cy, w, h, charObj) {
  const iconR = toLen(27);
  const offsetX = w * 0.36;
  const shoulderY = cy - h * 0.05;
  const drawBadge = (x, img) => {
    circle(x, shoulderY, iconR, 'rgba(0,0,0,0.45)', 1, 'white', toLen(2));
    const size = iconR * 1.5;
    drawImageTopLeft(img, x - size / 2, shoulderY - size / 2, size, size);
  };
  drawBadge(cx - offsetX, batIcons[charObj.key]);
  drawBadge(cx + offsetX, pitchIcons[charObj.key]);
}

// Simple hand-drawn padlock glyph, matching the file's existing style of
// vector-drawn UI icons (drawPauseIcon/drawArrowTriangle/drawFakeCursor) -
// no external asset needed.
function drawLockIcon(cx, cy, size) {
  const bodyW = size * 0.72, bodyH = size * 0.56;
  const bodyTop = cy - bodyH * 0.1;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.arc(cx, bodyTop, size * 0.26, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
  rect(cx - bodyW / 2, bodyTop, bodyW, bodyH, 'rgba(25,25,28,0.95)', 1, 'rgba(255,255,255,0.92)', size * 0.05);
  circle(cx, bodyTop + bodyH * 0.42, size * 0.07, 'rgba(255,255,255,0.9)', 1);
}

// Same hand-drawn vector-icon style as drawLockIcon() above - a permanent
// tournament-championship badge (requested), no external asset needed.
function drawTrophyIcon(cx, cy, size) {
  const cupW = size * 0.62, cupH = size * 0.5, cupTop = cy - size * 0.32;
  ctx.save();
  ctx.fillStyle = 'gold';
  ctx.strokeStyle = 'rgba(120,90,0,0.9)';
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx - cupW / 2, cupTop);
  ctx.lineTo(cx + cupW / 2, cupTop);
  ctx.lineTo(cx + cupW * 0.28, cupTop + cupH);
  ctx.lineTo(cx - cupW * 0.28, cupTop + cupH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - cupW / 2 - size * 0.08, cupTop + cupH * 0.28, size * 0.16, Math.PI * 0.3, Math.PI * 1.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + cupW / 2 + size * 0.08, cupTop + cupH * 0.28, size * 0.16, Math.PI * 1.45, Math.PI * 2.7);
  ctx.stroke();
  ctx.restore();
  rect(cx - size * 0.06, cupTop + cupH, size * 0.12, size * 0.16, 'gold', 1);
  rect(cx - size * 0.22, cupTop + cupH + size * 0.16, size * 0.44, size * 0.08, 'gold', 1);
}

// contentLocked/conditionText: the "not yet unlocked" state (Solo mode's
// progression system) - distinct from the `locked` param above, which
// already meant "this player has confirmed their pick" (controls only the
// card's border) before this feature existed and keeps that exact meaning.
// A content-locked card still shows the name and both power-up icons as
// normal (so it reads as a teaser, not a mystery) but silhouettes the
// portrait art itself and overlays a lock icon + the unlock condition.
function drawPortraitCard(cx, cy, w, h, charObj, locked, borderColor, contentLocked, conditionText, buyCost, showTrophy) {
  rect(cx - w / 2, cy - h / 2, w, h, 'rgba(255,255,255,0.08)', 1, locked ? (borderColor || 'gold') : null, locked ? 5 : 0);
  const img = portraits[charObj.key];
  if (img.complete && img.naturalWidth) {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight) * 0.95;
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
    const ix = cx - iw / 2, iy = cy - ih / 2 + 10;
    if (contentLocked) {
      ctx.save();
      ctx.drawImage(img, ix, iy, iw, ih);
      // Silhouettes the portrait by filling FULLY OPAQUE black only where the
      // art's own alpha channel already has pixels (source-atop), so the
      // transparent background around the character stays transparent but
      // every visible pixel of the character itself goes solid black - no
      // hint of the original colors/details should show through.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'black';
      ctx.fillRect(ix, iy, iw, ih);
      ctx.restore();
    } else {
      ctx.drawImage(img, ix, iy, iw, ih);
    }
  }
  if (contentLocked) {
    drawLockIcon(cx, cy + 6, Math.min(w, h) * 0.26);
    // Buy line always reserves its own row at the very bottom of the card;
    // the condition text (which can wrap to 2 lines) sits stacked above it,
    // so the two never collide regardless of how long the condition text is.
    const buyY = cy + h / 2 - 14;
    if (buyCost) {
      const affordable = saveData.coins >= buyCost;
      text('Buy: ' + buyCost + ' coins', cx, buyY, 11, affordable ? '#7CFC00' : '#999', 1, 'center', 700);
    }
    if (conditionText) {
      const lines = computeWrappedLines(conditionText, w - 20, 11, 700);
      const condBottomY = buyCost ? buyY - 15 : buyY;
      const startY = condBottomY - (lines.length - 1) * 13;
      lines.forEach((l, i) => text(l, cx, startY + i * 13, 11, '#e8d68a', 1, 'center', 700));
    }
  }
  text(charObj.name, cx, cy - h / 2 - 18, 22, charObj.color, 1, 'center', 700);
  drawShoulderPowerIcons(cx, cy, w, h, charObj);
  // Permanent tournament-championship badge (requested) - the card's
  // top-right corner is clear of every other element (name sits above the
  // box, shoulder icons hug the center, buy/condition text is bottom-
  // centered) at both desktop and mobile card sizes. It's the PLAYER's own
  // achievement with this character, not the character's in general - the
  // Opponent/CPU card never shows it even if the random opponent happens to
  // be a character the player has already won a tournament with elsewhere
  // (showTrophy defaults true; only the CPU card call sites pass false).
  if (showTrophy !== false && saveData.tournamentTrophies[charObj.key]) {
    drawTrophyIcon(cx + w / 2 - w * 0.12, cy - h / 2 + h * 0.09, Math.min(w, h) * 0.22);
  }
}

function drawReadyOverlay(label) {
  if (app.readyOpacity <= 0) return;
  const op = app.readyOpacity / 100;
  rect(0, toY(80), CANVAS_W, toLen(120), 'gold', 0.8 * op);
  rect(0, toY(255), CANVAS_W, toLen(30), 'gold', 0.8 * op);
  text('READY', CANVAS_W / 2, toY(140), 90, '#8b0000', op, 'center', 900);
  text(label || 'Press Enter To Start', CANVAS_W / 2, toY(270), 28, '#8b0000', op, 'center', 700);
}

// Mobile solo flow: character select, then (separately) difficulty select,
// each its own screen with its own Confirm button - unlike desktop's single
// combined drawSoloSelect() screen. Reuses drawPortraitCard() (already
// generic) and the shared nav/confirm button helpers above.
// Sits just above MOBILE_CONFIRM_BUTTON (y:335-385) - only shown in place of
// Confirm while the browsed character is still locked and buyable.
const MOBILE_BUY_BUTTON = { x: 280, y: 275, w: 110, h: 44 };

function drawMobileCharacterSelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  text('Choose Your Character', CANVAS_W / 2, toY(40), 30, 'white', 1, 'center', 900);

  const char = CHARACTERS[app.player1Index];
  const locked = !isPlayerUnlocked(char.key);
  const cost = characterBuyCost(char.key);
  drawPortraitCard(CANVAS_W / 2, toY(190), lenX(150), toLen(220), char, false, char.color,
    locked, playerUnlockConditionText(char.key), cost);

  drawBackButton();
  text('Coins: ' + saveData.coins, toX(390), toY(20), 16, 'gold', 1, 'right', 700);
  drawMobileNavButtons();
  drawUnitButton(MOBILE_UPGRADES_BUTTON, 'Upgrades');
  if (locked && cost) {
    drawUnitButton(MOBILE_BUY_BUTTON, 'Buy (' + cost + ')', saveData.coins >= cost);
  } else {
    drawMobileConfirmButton('Confirm');
  }
  // Pushed down from the card's own bottom edge (toY(300)) - locked cards now
  // also show a "Buy: N coins" line under the condition text, which crowded
  // this hint when it sat right at the card boundary.
  text('◀ / ▶ To Browse', CANVAS_W / 2, toY(320), 16, 'white', 0.85, 'center', 700);
}

function handleMobileCharacterSelectTap(x, y) {
  if (pointInBackButton(x, y)) { goBackToModeSelect(); return; }
  if (pointInUnitRect(x, y, MOBILE_UPGRADES_BUTTON)) { app.screen = 'mobileUpgrades'; return; }
  if (pointInMobileNavLeft(x, y)) { app.player1Index = (app.player1Index + CHARACTERS.length - 1) % CHARACTERS.length; return; }
  if (pointInMobileNavRight(x, y)) { app.player1Index = (app.player1Index + 1) % CHARACTERS.length; return; }
  const char = CHARACTERS[app.player1Index];
  if (!isPlayerUnlocked(char.key)) {
    if (pointInUnitRect(x, y, MOBILE_BUY_BUTTON)) buyPlayerCharacter(char.key);
    return;
  }
  if (pointInMobileConfirm(x, y)) {
    app.player1Locked = true;
    fixTournamentSelfMatchIfNeeded();
    app.screen = 'mobileCpuSelect';
  }
}

// Second mobile solo step: pick the CPU opponent, same content-locked
// portrait card as the desktop solo screen's right-hand card. Difficulty is
// no longer picked here (or anywhere) - it's derived from the chosen CPU
// character's rank (see characterDifficultyIndex(), used in startMatch()).
function drawMobileCpuSelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  const isTournament = app.soloGameMode === 'tournament';
  const cpu = CHARACTERS[app.cpuBatterIndex];
  text(isTournament ? 'Round ' + (app.tournament.round + 1) + ' of 3' : 'Choose Your Opponent', CANVAS_W / 2, toY(32), 26, 'white', 1, 'center', 900);
  // Tournament opponent is a random draw, not gated by normal CPU
  // progression - always shown fully revealed (see drawSoloSelect()'s own
  // comment on the desktop equivalent of this).
  drawPortraitCard(CANVAS_W / 2, toY(190), lenX(150), toLen(220), cpu, false, cpu.color,
    isTournament ? false : !isCpuUnlocked(cpu.key), isTournament ? null : cpuUnlockConditionText(cpu.key), null, false);

  drawBackButton();

  if (app.cpuLocked) {
    if (app.readyOpacity < 80) app.readyOpacity = Math.min(80, app.readyOpacity + 5);
    drawReadyOverlay('Tap Anywhere To Start');
  } else {
    drawMobileNavButtons();
    drawMobileConfirmButton('Confirm');
    text('◀ / ▶ To Browse', CANVAS_W / 2, toY(300), 16, 'white', 0.85, 'center', 700);
  }
}

function handleMobileCpuSelectTap(x, y) {
  // Once locked, the ready overlay owns the whole screen - any tap starts
  // the game (readyOpacity's fade-in gate matches desktop's own Enter-To-
  // Start behavior, so a stray tap during the fade doesn't skip it).
  if (app.cpuLocked) {
    if (app.readyOpacity >= 80) beginGame();
    return;
  }
  if (pointInBackButton(x, y)) { app.screen = 'mobileCharacterSelect'; app.player1Locked = false; app.readyOpacity = 0; return; }
  if (pointInMobileNavLeft(x, y)) { app.cpuBatterIndex = (app.cpuBatterIndex + CHARACTERS.length - 1) % CHARACTERS.length; return; }
  if (pointInMobileNavRight(x, y)) { app.cpuBatterIndex = (app.cpuBatterIndex + 1) % CHARACTERS.length; return; }
  if (pointInMobileConfirm(x, y) && isCpuUnlocked(CHARACTERS[app.cpuBatterIndex].key)) { app.cpuLocked = true; }
}

function drawSoloSelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  const isTournament = app.soloGameMode === 'tournament';
  const cpu = CHARACTERS[app.cpuBatterIndex];
  text('Player', toX(100), toY(50), 30, 'white', 1, 'center', 900);
  text('Opponent', toX(300), toY(50), 30, 'white', 1, 'center', 900);
  const playerLocked = !isPlayerUnlocked(CHARACTERS[app.player1Index].key);
  text('A / D  ·  S To Select' + (playerLocked ? '  ·  B To Buy' : ''), toX(100), toY(345), 15, 'white', 0.85);
  if (isTournament) {
    text('Round ' + (app.tournament.round + 1) + ' of 3', toX(300), toY(345), 15, 'gold', 1);
  } else {
    text('← / →  ·  Down To Select', toX(300), toY(345), 15, 'white', 0.85);
  }

  const char = CHARACTERS[app.player1Index];
  drawPortraitCard(toX(100), toY(200), lenX(150), toLen(220), char, app.player1Locked, char.color,
    !isPlayerUnlocked(char.key), playerUnlockConditionText(char.key), characterBuyCost(char.key));
  // Tournament opponent is a random draw, not gated by normal CPU
  // progression - always shown fully revealed, never the silhouette/lock
  // treatment isCpuUnlocked() would otherwise apply.
  drawPortraitCard(toX(300), toY(200), lenX(150), toLen(220), cpu, app.cpuLocked, cpu.color,
    isTournament ? false : !isCpuUnlocked(cpu.key), isTournament ? null : cpuUnlockConditionText(cpu.key), null, false);

  drawBackButton();
  text('Coins: ' + saveData.coins, CANVAS_W / 2, toY(UPGRADES_BUTTON.y - 12), 15, 'gold', 1, 'center', 700);
  drawUnitButton(UPGRADES_BUTTON, 'Upgrades');

  if (app.player1Locked && app.cpuLocked) {
    if (app.readyOpacity < 80) app.readyOpacity = Math.min(80, app.readyOpacity + 5);
    drawReadyOverlay();
  }
}

/* ============================== UPGRADES SCREEN (Solo mode only) ==============================
   Reached from the "Upgrades" button on drawSoloSelect()/drawMobileCharacterSelect().
   10 purchasable rows: 4 pitch types x 2 tracks each (Zone/Speed, 0-2 - see
   PITCH_ZONE_LEVELS/PITCH_SPEED_LEVELS for what each level actually buys
   the pitch-timing meter) then Contact/Power (each 1-5, level 1 free) - see
   baseCrosshairRadius()/baseCriticalRadius() for how those affect gameplay. */
const UPGRADE_WATCH_AD_BUTTON = { x: 150, y: 10, w: 100, h: 32 };
const UPGRADE_ROWS = [
  { type: 'pitch', sub: 'zone', key: 'fastball', label: 'Fastball Zone' },
  { type: 'pitch', sub: 'speed', key: 'fastball', label: 'Fastball Timing' },
  { type: 'pitch', sub: 'zone', key: 'curveball', label: 'Curveball Zone' },
  { type: 'pitch', sub: 'speed', key: 'curveball', label: 'Curveball Timing' },
  { type: 'pitch', sub: 'zone', key: 'riser', label: 'Riser Zone' },
  { type: 'pitch', sub: 'speed', key: 'riser', label: 'Riser Timing' },
  { type: 'pitch', sub: 'zone', key: 'knuckleball', label: 'Knuckleball Zone' },
  { type: 'pitch', sub: 'speed', key: 'knuckleball', label: 'Knuckleball Timing' },
  { type: 'batting', key: 'contact', label: 'Contact (bigger hit zone)' },
  { type: 'batting', key: 'power', label: 'Power (bigger critical zone)' },
];
function upgradeRowLevel(row) {
  return row.type === 'pitch' ? saveData.pitchUpgrades[row.key][row.sub] : saveData.battingUpgrades[row.key];
}
function upgradeRowMaxLevel(row) {
  return row.type === 'pitch' ? 2 : 5;
}
function upgradeRowCost(row) {
  const level = upgradeRowLevel(row);
  if (level >= upgradeRowMaxLevel(row)) return null;
  // Pitch levels are 0-indexed (0/1/2), so level itself is the right table
  // index. Batting levels are 1-indexed (1-5, see BATTING_UPGRADE_COST's own
  // comment) - the cost to leave level L sits at table[L-1].
  return row.type === 'pitch' ? PITCH_UPGRADE_COST[level] : BATTING_UPGRADE_COST[level - 1];
}
function upgradeRowStatusText(row) {
  const level = upgradeRowLevel(row);
  if (row.type === 'pitch') return level + '/2';
  return level + '/5';
}
function buyUpgradeRow(index) {
  const row = UPGRADE_ROWS[index];
  const cost = upgradeRowCost(row);
  if (!cost || saveData.coins < cost) return false;
  saveData.coins -= cost;
  if (row.type === 'pitch') saveData.pitchUpgrades[row.key][row.sub]++;
  else saveData.battingUpgrades[row.key]++;
  persistSaveData();
  return true;
}
// Bug fix: 10 rows (up from the original 6, once each pitch type split into
// its own Zone/Speed row) no longer fit the old 38-unit spacing starting at
// y=100 - the last row landed at y=442, well past the 400-unit-tall canvas.
const UPGRADE_ROW_START_Y = 82, UPGRADE_ROW_SPACING = 27;
function upgradeRowButtonRect(index) {
  return { x: 280, y: UPGRADE_ROW_START_Y + index * UPGRADE_ROW_SPACING, w: 90, h: 22 };
}
function drawUpgradesScreen() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  text('Upgrades', CANVAS_W / 2, toY(68), 26, 'white', 1, 'center', 900);
  text('Coins: ' + saveData.coins, toX(390), toY(20), 18, 'gold', 1, 'right', 700);
  drawBackButton();
  drawUnitButton(UPGRADE_WATCH_AD_BUTTON, 'Watch Ad (+' + AD_REWARD_COINS + ')');

  UPGRADE_ROWS.forEach((row, i) => {
    const y = UPGRADE_ROW_START_Y + i * UPGRADE_ROW_SPACING;
    const selected = app.upgradeCursorIndex === i;
    text(row.label, toX(20), toY(y + 13), 13, selected ? 'gold' : 'white', 1, 'left', selected ? 900 : 400);
    text(upgradeRowStatusText(row), toX(230), toY(y + 13), 12, '#ccc', 1, 'left');
    const btn = upgradeRowButtonRect(i);
    const cost = upgradeRowCost(row);
    if (cost === null) {
      drawUnitButton(btn, 'MAX', false);
    } else {
      drawUnitButton(btn, 'Upgrade (' + cost + ')', saveData.coins >= cost);
    }
    if (selected) {
      text('▶', toX(8), toY(y + 13), 14, 'gold', 1, 'center', 900);
    }
  });

  text('Up / Down · Enter To Buy', CANVAS_W / 2, toY(363), 15, 'white', 0.85, 'center', 700);
}
function handleUpgradesKey(key) {
  if (key === 'escape') { app.screen = 'characterSolo'; return; }
  if (key === 'arrowup') { app.upgradeCursorIndex = (app.upgradeCursorIndex + UPGRADE_ROWS.length - 1) % UPGRADE_ROWS.length; }
  else if (key === 'arrowdown') { app.upgradeCursorIndex = (app.upgradeCursorIndex + 1) % UPGRADE_ROWS.length; }
  else if (key === 'enter') { buyUpgradeRow(app.upgradeCursorIndex); }
}
function handleUpgradesClick(x, y) {
  if (pointInBackButton(x, y)) { app.screen = 'characterSolo'; return; }
  if (pointInUnitRect(x, y, UPGRADE_WATCH_AD_BUTTON)) { handleWatchAd(); return; }
  for (let i = 0; i < UPGRADE_ROWS.length; i++) {
    if (pointInUnitRect(x, y, upgradeRowButtonRect(i))) { app.upgradeCursorIndex = i; buyUpgradeRow(i); return; }
  }
}

// Mobile: every row is directly tappable (no cursor, matching how other
// mobile screens use direct-tap buttons instead of desktop's keyboard
// cursor) - same row data/layout helpers as the desktop screen above.
function drawMobileUpgradesScreen() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  text('Upgrades', CANVAS_W / 2, toY(68), 24, 'white', 1, 'center', 900);
  text('Coins: ' + saveData.coins, toX(390), toY(20), 16, 'gold', 1, 'right', 700);
  drawBackButton();
  drawUnitButton(UPGRADE_WATCH_AD_BUTTON, 'Watch Ad (+' + AD_REWARD_COINS + ')');

  UPGRADE_ROWS.forEach((row, i) => {
    const y = UPGRADE_ROW_START_Y + i * UPGRADE_ROW_SPACING;
    text(row.label, toX(20), toY(y + 13), 12, 'white', 1, 'left');
    text(upgradeRowStatusText(row), toX(230), toY(y + 13), 11, '#ccc', 1, 'left');
    const btn = upgradeRowButtonRect(i);
    const cost = upgradeRowCost(row);
    if (cost === null) drawUnitButton(btn, 'MAX', false);
    else drawUnitButton(btn, 'Buy (' + cost + ')', saveData.coins >= cost);
  });
}
function handleMobileUpgradesTap(x, y) {
  if (pointInBackButton(x, y)) { app.screen = 'mobileCharacterSelect'; return; }
  if (pointInUnitRect(x, y, UPGRADE_WATCH_AD_BUTTON)) { handleWatchAd(); return; }
  for (let i = 0; i < UPGRADE_ROWS.length; i++) {
    if (pointInUnitRect(x, y, upgradeRowButtonRect(i))) { buyUpgradeRow(i); return; }
  }
}

function drawVersusSelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);
  ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(CANVAS_W / 2, 0); ctx.lineTo(CANVAS_W / 2, CANVAS_H); ctx.stroke();

  text('Player 1', toX(100), toY(50), 30, 'white', 1, 'center', 900);
  text('Player 2', toX(300), toY(50), 30, 'white', 1, 'center', 900);
  text('A / D  ·  S To Select', toX(100), toY(345), 15, 'white', 0.85);
  text('← / →  ·  Down To Select', toX(300), toY(345), 15, 'white', 0.85);

  const c1 = CHARACTERS[app.player1Index];
  const c2 = CHARACTERS[app.player2Index];
  drawPortraitCard(toX(100), toY(200), lenX(150), toLen(220), c1, app.player1Locked, c1.color);
  drawPortraitCard(toX(300), toY(200), lenX(150), toLen(220), c2, app.player2Locked, c2.color);

  drawBackButton();

  if (app.player1Locked && app.player2Locked) {
    if (app.readyOpacity < 80) app.readyOpacity = Math.min(80, app.readyOpacity + 5);
    drawReadyOverlay();
  }
}

/* ============================== GAMEPLAY DRAWING ============================== */
function drawField() {
  drawStadium();
  rect(toX(0), toY(300), lenX(400), toLen(100), '#2a8a2a');

  ctx.beginPath();
  ctx.moveTo(toX(5), toY(300)); ctx.lineTo(toX(25), toY(293)); ctx.lineTo(toX(65), toY(293)); ctx.lineTo(toX(85), toY(300));
  ctx.closePath(); ctx.fillStyle = 'coral'; ctx.fill();
  rect(toX(42.5), toY(293), lenX(5), toLen(3), 'white');

  ctx.beginPath();
  ctx.moveTo(toX(345), toY(300)); ctx.lineTo(toX(345), toY(305)); ctx.lineTo(toX(355), toY(305)); ctx.lineTo(toX(360), toY(300));
  ctx.closePath(); ctx.fillStyle = 'white'; ctx.fill();
}

function drawScoreboard() {
  rect(toX(5), toY(8), lenX(390), toLen(75), 'black', 1, '#444', 1);
  rect(toX(5), toY(8), lenX(270), toLen(25), '#222', 1, '#444', 2);

  // Content area below the header strip (y 33-83 within the outer box, since
  // the header itself runs y 8-33) is 50 units tall, so its center is y=58 -
  // the score numbers and base triangle both target that so they sit with
  // equal gaps from the header above and the box's bottom edge below.
  // p1 is home in versus but away in solo (see assignActiveRoles()'s
  // comment) - p1's own score/label always sits in the same left/red slot
  // either way, it's just paired with the score variable that's actually
  // tracking p1 for the current mode.
  const soloMode = app.mode === 'solo';
  text(soloMode ? 'P1-Away' : 'P1-Home', toX(50), toY(20), 16, 'red', 1);
  text(String(soloMode ? awayScore : homeScore), toX(50), toY(58), 35, 'red', 1);
  text(soloMode ? 'CPU-Home' : 'P2-Away', toX(150), toY(20), 16, 'rgb(80,150,220)', 1);
  text(String(soloMode ? homeScore : awayScore), toX(150), toY(58), 35, 'rgb(90,160,230)', 1);

  // Inning number + ordinal suffix drawn tight together as one unit
  const inningAnchorX = toX(240);
  text(String(inningNumber), inningAnchorX - lenX(2), toY(20), 15, 'white', 1, 'right');
  text(inningSuffix, inningAnchorX + lenX(2), toY(20), 15, 'white', 1, 'left');
  ctx.save();
  ctx.translate(toX(218), toY(20));
  ctx.rotate((app.homePitching ? 90 : -90) * Math.PI / 180);
  text('<', 0, 0, 20, 'white');
  ctx.restore();

  // Bases: larger, tighter, arranged as a clear upside-down triangle
  // (2nd at the point on top, 1st/3rd forming the base corners below).
  // Bounding box is y 39-77 (apex-radius to base+radius), centered on 58.
  diamond(toX(242.5), toY(49), toLen(10), bases[1]);
  diamond(toX(231), toY(67), toLen(10), bases[2]);
  diamond(toX(254), toY(67), toLen(10), bases[0]);

  text('O', toX(290), toY(20), 18, 'white', 1, 'center', 700);
  text('S', toX(290), toY(43.75), 18, 'white', 1, 'center', 700);
  text('B', toX(290), toY(67.5), 18, 'white', 1, 'center', 700);

  const slotX = [320, 340, 360];
  for (let i = 0; i < 3; i++) circle(toX(slotX[i]), toY(20), toLen(8), outFills[i], 1, '#777', 1);
  for (let i = 0; i < 3; i++) circle(toX(slotX[i]), toY(43.75), toLen(8), strikeFills[i], 1, '#777', 1);
  for (let i = 0; i < 4; i++) circle(toX(i < 3 ? slotX[i] : 380), toY(67.5), toLen(8), ballFills[i], 1, '#777', 1);
}

// Click target for a drawPitchMenu() row (requested - solo mode only, see
// handlePointerDown()): generous enough to cover the key box plus its label,
// not just the small key square itself. Row layout (boxX/y spacing) must
// match drawPitchMenu()'s own math below exactly.
const PITCH_MENU_ROW_W = 130;
function pointInPitchMenuRow(index, x, y) {
  const boxSize = toLen(20);
  const boxX = toX(10), boxY = toY(310 + index * 20);
  return x >= boxX && x <= boxX + lenX(PITCH_MENU_ROW_W) && y >= boxY && y <= boxY + boxSize;
}
// Draws one pitch type's timing meter: a bad|okay|good|okay|bad bar (widths
// from that type's own Zone upgrade level, see PITCH_ZONE_LEVELS) with a
// marker at its current sweep position (see stepPitchMeter()). x/y/w/h are
// already-scaled absolute canvas coordinates, same convention as rect().
const PITCH_METER_ZONE_COLORS = { bad: '#ff4d4d', okay: '#ffe14d', good: '#4dff4d' };
function drawPitchMeterBar(type, x, y, w, h) {
  const { good, bad } = PITCH_ZONE_LEVELS[pitchZoneLevel(type)];
  const goodStart = 0.5 - good, goodEnd = 0.5 + good;
  [
    { from: 0, to: bad, color: PITCH_METER_ZONE_COLORS.bad },
    { from: bad, to: goodStart, color: PITCH_METER_ZONE_COLORS.okay },
    { from: goodStart, to: goodEnd, color: PITCH_METER_ZONE_COLORS.good },
    { from: goodEnd, to: 1 - bad, color: PITCH_METER_ZONE_COLORS.okay },
    { from: 1 - bad, to: 1, color: PITCH_METER_ZONE_COLORS.bad },
  ].forEach(seg => {
    if (seg.to <= seg.from) return;
    rect(x + w * seg.from, y, w * (seg.to - seg.from), h, seg.color, 0.85);
  });
  rect(x, y, w, h, null, 1, 'white', 1);
  const markerX = x + w * app.pitchMeterPos;
  rect(markerX - toLen(1), y - toLen(2), toLen(2), h + toLen(4), 'white');
}

// Meter is drawn once, over the pitcher (requested - not down in the grass
// with the pitch buttons), only while a type is actually armed and awaiting
// its confirm click/tap - see confirmArmedPitch(). Position sits just above
// the pitcher's sprite (PITCHER_FRAME_META's ready stance centers around
// x=32, feet at y~300).
const PITCH_METER_OVERLAY = { x: 32, y: 195, w: 76, h: 16 };
function drawPitchMeterOverlay() {
  if (!app.pitchMeterActive || !app.pitchArmed) return;
  const w = lenX(PITCH_METER_OVERLAY.w), h = toLen(PITCH_METER_OVERLAY.h);
  const x = toX(PITCH_METER_OVERLAY.x) - w / 2, y = toY(PITCH_METER_OVERLAY.y);
  drawPitchMeterBar(app.pitchArmed, x, y, w, h);
}

function drawPitchMenu() {
  // Solo mode has the human as exactly one of pitcher/batter at a time (the
  // other is CPU) - the WASD/arrow pitch-key legend is only relevant while
  // actually pitching, so don't show it while just batting. Versus mode
  // always has a human pitching (just not necessarily the one currently
  // looking at this side of the screen), so it stays shown there.
  if (app.mode === 'solo' && app.activePitcherKey === 'cpu') return;
  const usesWasd = app.mode === 'solo' ? true : app.homePitching;
  const entries = usesWasd
    ? [['W', 'Fastball'], ['A', 'Knuckleball'], ['S', 'Curveball'], ['D', 'Riser']]
    : [['↑', 'Fastball'], ['←', 'Knuckleball'], ['↓', 'Curveball'], ['→', 'Riser']];
  const boxSize = toLen(20); // uniform (not lenX) so the key square stays square, not stretched
  entries.forEach(([label, name], i) => {
    const y = 310 + i * 20;
    const boxX = toX(10), boxY = toY(y);
    rect(boxX, boxY, boxSize, boxSize, 'black', 0.6);
    text(label, boxX + boxSize / 2, boxY + boxSize / 2, 14, 'white', 1, 'center', 700);
    text(name, boxX + boxSize + lenX(8), boxY + boxSize / 2, 15, 'white', 1, 'left');
  });
}

function drawPowerUpUi() {
  const boxSize = toLen(24);
  // The CPU side never actually uses a power-up (cpuPitch/cpuSwing don't
  // invoke the Z/M mechanic), so showing a "Power Up" control for whichever
  // side is CPU-controlled in solo mode is just misleading UI clutter -
  // nobody can press it and nothing will use it. Hide that half entirely.
  if (app.activePitcherKey !== 'cpu') {
    const pBoxX = toX(10), pBoxY = toY(105); // more breathing room below the scoreboard (was 85)
    rect(pBoxX, pBoxY, boxSize, boxSize, 'black', 0.6);
    text('Z', pBoxX + boxSize / 2, pBoxY + boxSize / 2, 15, 'white', 1, 'center', 700);
    const pLabelX = pBoxX + boxSize + lenX(10);
    drawGradientOrPlainLabel('Power Up', pLabelX, pBoxY + toLen(6), app.pitchPowerFull, 'left');
    text('(Pitcher)', pLabelX, pBoxY + toLen(24), 12, 'dimgray', 1, 'left');
    // Icon sits right after whichever label line is wider, instead of a fixed
    // far-off position, so it stays visually attached to the "Power Up" text.
    const pLabelW = Math.max(textWidth('Power Up', 15, 700), textWidth('(Pitcher)', 12, 400));
    const pIcon = pitchIcons[pitcherChar().key];
    drawImageTopLeft(pIcon, pLabelX + pLabelW + lenX(8), pBoxY - toLen(10), toLen(40), toLen(40));
  }

  if (app.activeBatterKey !== 'cpu') {
    const mBoxX = toX(260), mBoxY = toY(105); // matches pBoxY
    rect(mBoxX, mBoxY, boxSize, boxSize, 'black', 0.6);
    text('M', mBoxX + boxSize / 2, mBoxY + boxSize / 2, 15, 'white', 1, 'center', 700);
    const mLabelX = mBoxX + boxSize + lenX(10);
    drawGradientOrPlainLabel('Power Up', mLabelX, mBoxY + toLen(6), app.batPowerFull, 'left');
    text('(Batter)', mLabelX, mBoxY + toLen(24), 12, 'dimgray', 1, 'left');
    const mLabelW = Math.max(textWidth('Power Up', 15, 700), textWidth('(Batter)', 12, 400));
    const bIcon = batIcons[batterChar().key];
    drawImageTopLeft(bIcon, mLabelX + mLabelW + lenX(8), mBoxY - toLen(2), toLen(40), toLen(40));
  }
}

/* ============================== MOBILE IN-GAME CONTROLS ============================== */
// Solo mode always has the human as exactly one of pitcher/batter (the other
// is CPU) - drawMobileControls() picks the matching layout the same way
// drawPitchMenu()/drawPowerUpUi() already do (activePitcherKey/activeBatterKey
// !== 'cpu'), so the two layouts never need to coexist.
// Bigger than before (55 -> 70). All three batting controls share row
// center y=350 (moved down from the grass line at y=300 a bit further into
// the grass strip, y:300-400, per request) rather than sitting right at its
// top edge.
const SWING_BUTTON = { x: 315, y: 315, size: 70 };
const POWERUP_BUTTON = { x: 173, y: 322.5, size: 55 }; // batting layout: bottom-center, between joystick and swing
// Pitching layout: same circular design as the batting one, sitting right
// under the pitcher (PITCHER_FRAME_META centers around x~26-37 -> roughly
// x:26-58 unit-wise once the sprite box is accounted for, feet at y~300).
// y is set so its center lines up with PITCH_BUTTON_SIZE's center (330 +
// 60/2 = 360), so the power-up circle sits in the same row as the 4 pitch
// buttons rather than floating above them.
const POWERUP_BUTTON_PITCHING = { x: 15, y: 332.5, size: 55 };
// Narrower/shifted right of their original spread so the 4 buttons still
// span x:80-390 without overlapping the power-up circle now at x:15-70.
const PITCH_BUTTON_SIZE = { w: 73, y: 330, h: 60 };
const PITCH_BUTTONS = [
  { key: 'w', arrowKey: 'arrowup', label: 'Fastball', type: 'fastball', x: 80 },
  { key: 'a', arrowKey: 'arrowleft', label: 'Knuckleball', type: 'knuckleball', x: 159 },
  { key: 's', arrowKey: 'arrowdown', label: 'Curveball', type: 'curveball', x: 238 },
  { key: 'd', arrowKey: 'arrowright', label: 'Riser', type: 'riser', x: 317 },
];

function drawMobileControls() {
  drawBackButton(BACK_BUTTON_INGAME); // action is overridden to open the quit-confirm modal - see handleMobilePlayTap()

  if (app.activeBatterKey !== 'cpu') {
    drawJoystick();
    drawSwingButton();
    drawPowerupButton(POWERUP_BUTTON, app.batPowerFull, batIcons[batterChar().key]);
  } else if (app.activePitcherKey !== 'cpu') {
    drawPitchButtons();
    drawPowerupButton(POWERUP_BUTTON_PITCHING, app.pitchPowerFull, pitchIcons[pitcherChar().key]);
  }
}

function drawJoystick() {
  const bx = toX(JOYSTICK_BASE.x), by = toY(JOYSTICK_BASE.y), r = toLen(JOYSTICK_BASE.radius);
  circle(bx, by, r, 'rgba(255,255,255,0.15)', 1, 'white', 2);
  const knobR = r * 0.45;
  const kx = bx + joystick.dx * (r - knobR);
  const ky = by + joystick.dy * (r - knobR);
  circle(kx, ky, knobR, 'rgba(255,255,255,0.7)', 1, 'white', 2);
}

function pointInSwingButton(x, y) {
  const s = toLen(SWING_BUTTON.size);
  const cx = toX(SWING_BUTTON.x) + s / 2, cy = toY(SWING_BUTTON.y) + s / 2;
  return Math.hypot(x - cx, y - cy) <= s / 2;
}
function drawSwingButton() {
  const s = toLen(SWING_BUTTON.size);
  const cx = toX(SWING_BUTTON.x) + s / 2, cy = toY(SWING_BUTTON.y) + s / 2;
  const disabled = app.isBatting;
  circle(cx, cy, s / 2, disabled ? 'rgba(120,120,120,0.55)' : 'rgba(220,30,30,0.8)', 1, 'white', 3);
  text('SWING', cx, cy, 14, 'white', 1, 'center', 900);
}

// Same circular design as the Swing button (and the shoulder power badges on
// the character-select portrait card, drawShoulderPowerIcons) - a dark disc
// with the character's power icon inside and a gold/gray ring for whether
// it's available yet.
function pointInPowerupButton(btn, x, y) {
  const s = toLen(btn.size);
  const cx = toX(btn.x) + s / 2, cy = toY(btn.y) + s / 2;
  return Math.hypot(x - cx, y - cy) <= s / 2;
}
function drawPowerupButton(btn, full, icon) {
  const s = toLen(btn.size);
  const cx = toX(btn.x) + s / 2, cy = toY(btn.y) + s / 2;
  circle(cx, cy, s / 2, 'rgba(0,0,0,0.65)', 1, full ? 'gold' : 'dimgray', 3);
  const iconSize = s * 0.62;
  drawImageTopLeft(icon, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

function pointInPitchButton(p, x, y) {
  const bx = toX(p.x), by = toY(PITCH_BUTTON_SIZE.y), bw = lenX(PITCH_BUTTON_SIZE.w), bh = toLen(PITCH_BUTTON_SIZE.h);
  return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
}
function drawPitchButtons() {
  PITCH_BUTTONS.forEach(p => {
    const bx = toX(p.x), by = toY(PITCH_BUTTON_SIZE.y), bw = lenX(PITCH_BUTTON_SIZE.w), bh = toLen(PITCH_BUTTON_SIZE.h);
    rect(bx, by, bw, bh, 'rgba(0,0,0,0.6)', 1, 'white', 2);
    text(p.label, bx + bw / 2, by + toLen(14), 12, 'white', 1, 'center', 700);
    drawPitchPathIcon(bx + toLen(8), by + toLen(24), bw - toLen(16), toLen(28), p.type);
  });
}

// A small trajectory diagram for each pitch button: a line from the button's
// left edge to a baseball glyph on the right, shaped per pitch type -
// Fastball is straight, Riser is one continuous ease-in curve rising from a
// low/flat start to a high finish, Curveball is one continuous ease-in curve
// that stays high through most of the path before breaking sharply down at
// the end, Knuckleball "swivels" through two opposite curves before
// settling at the ball. Riser/Curveball each use a single quadraticCurveTo
// (not two chained segments) - putting the control point at the START
// height keeps the curve flat/slow early and bending increasingly toward
// the end, which reads as a smooth, non-linear ease rather than a straight
// diagonal.
function drawPitchPathIcon(x, y, w, h, type) {
  const y0 = y + h / 2;
  const ballR = h * 0.22;
  const ballX = x + w - ballR;
  // Every pitch's ball lands at the same spot (y0), matching where the
  // batter actually sees it arrive regardless of pitch type - Riser/
  // Curveball get there by starting off that line instead of ending off it:
  // the whole curve is shifted so only the START moves, keeping the same
  // shape/easing as before.
  const ballY = y0;
  let startY = y0;
  if (type === 'riser') startY = y0 + h * 0.4; // starts low, arrives at y0
  else if (type === 'curveball') startY = y0 - h * 0.4; // starts high, arrives at y0

  ctx.save();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, startY);
  if (type === 'fastball') {
    ctx.lineTo(ballX, ballY);
  } else if (type === 'riser') {
    // Starts low/flat, slowly bends upward, finishes at the shared spot.
    ctx.quadraticCurveTo(x + w * 0.55, startY, ballX, ballY);
  } else if (type === 'curveball') {
    // Starts high, stays roughly level, then breaks sharply down to the
    // shared spot.
    ctx.quadraticCurveTo(x + w * 0.65, startY, ballX, ballY);
  } else { // knuckleball - swivels up then down before reaching the ball
    ctx.quadraticCurveTo(x + w * 0.28, y0 - h * 0.5, x + w * 0.5, y0);
    ctx.quadraticCurveTo(x + w * 0.72, y0 + h * 0.5, ballX, y0);
  }
  ctx.stroke();
  ctx.restore();
  circle(ballX, ballY, ballR, 'white', 1, '#999', 1);
}

// Dispatches a tap/click during the 'play' screen on mobile to whichever
// on-screen control it landed on. Pitch/power-up buttons deliberately just
// call handleGameplayKey() with the equivalent key instead of duplicating
// its logic - every guard (canStartPitch(), power-already-used, dice-in-
// progress, etc.) already lives there and applies automatically this way.
function handleMobilePlayTap(x, y) {
  if (pointInBackButton(x, y, BACK_BUTTON_INGAME)) { openQuitConfirm(); return; }

  if (app.activeBatterKey !== 'cpu') {
    if (pointInSwingButton(x, y)) { attemptSwing(); return; }
    if (pointInPowerupButton(POWERUP_BUTTON, x, y)) { handleGameplayKey('m'); return; }
  } else if (app.activePitcherKey !== 'cpu') {
    const usesWasd = app.mode === 'solo' ? true : app.homePitching;
    for (const p of PITCH_BUTTONS) {
      if (pointInPitchButton(p, x, y)) { handleGameplayKey(usesWasd ? p.key : p.arrowKey); return; }
    }
    if (pointInPowerupButton(POWERUP_BUTTON_PITCHING, x, y)) { handleGameplayKey('z'); return; }
    // Timing meter (requested): tapping anywhere else (the meter itself,
    // drawn over the pitcher) confirms whichever type is currently armed.
    if (app.pitchArmed) { confirmArmedPitch(); return; }
  }
}

function drawGradientOrPlainLabel(str, x, y, full, align) {
  ctx.save();
  ctx.font = `700 ${toLen(15)}px Orbitron, sans-serif`;
  ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  if (full) {
    const gradSpan = lenX(38);
    ctx.fillStyle = align === 'left'
      ? linearGradient(x, y, x + gradSpan * 2, y, FULL_POWER_STOPS)
      : linearGradient(x - gradSpan, y, x + gradSpan, y, FULL_POWER_STOPS);
  } else {
    ctx.fillStyle = 'gray';
  }
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Draws an image at its usual position/size, but scaled so it grows/shrinks
// from its feet upward instead of from its geometric center - Ball Expand's
// bigger batter and Ball Shrink's smaller pitcher both stand on the same
// ground line, so scaling from the center made the bigger one sink/clip into
// the ground (it grew downward too) and the smaller one float above it (it
// shrank upward too). Anchoring the bottom edge keeps their feet planted
// exactly where they always stand, growing/shrinking only upward from there.
// Horizontal centering is still fine - there's no equivalent left/right
// anchor concern.
// Bug fix: drawImageRotated's (x, y) is already a CENTER point (unlike
// drawImageTopLeft's, which is a top-left corner) - treating it as top-left
// here and then re-adding half the scaled width/height on top double-offset
// the one rotated swing frame, landing it in the wrong spot on screen.
// Scaling around a center that's already correct needs no position change at
// all - only the top-left case needs to shift.
function drawImageCenteredScale(img, x, y, w, h, scale, rotate, opacity) {
  const w2 = w * scale, h2 = h * scale;
  if (rotate) {
    drawImageRotated(img, x, y, w2, h2, rotate, opacity);
  } else {
    const x2 = x - (w2 - w) / 2, y2 = y - (h2 - h);
    drawImageTopLeft(img, x2, y2, w2, h2, opacity);
  }
}

const BATTER_BIG_SCALE = 1.4;
const PITCHER_SMALL_SCALE = 0.6;

function drawSprites() {
  const pitcherFrames = getPitcherFrames(pitcherChar().key);
  const pFrame = app.isPitching ? pitcherFrames[app.pitcherFrameIndex] : pitcherFrames[0];
  const pScale = app.pitcherSmall ? PITCHER_SMALL_SCALE : 1;
  drawImageCenteredScale(pFrame.img, toX(pFrame.x), toY(pFrame.y), toLen(50), toLen(50), pScale);

  // 0 = ready stance, 1-5 = swing frame - shared with FIRE_TRAIL_OFFSETS'
  // numbering so the fire trail always matches whichever sprite is on screen.
  const activeFrame = (app.isBatting && app.batterFrameIndex > 0) ? app.batterFrameIndex : 0;

  // Fire is drawn BEFORE the batter sprite so the batter renders on top of
  // it (behind, not in front).
  if (app.batFireVisible) {
    const t = getBatFireTransform(activeFrame);
    drawImageRotated(EFFECTS_LIB.fireTrail, t.x, t.y, toLen(30), toLen(30), t.rot);
  }

  const batterFrames = getBatterFrames(batterChar().key);
  const bScale = app.batterBig ? BATTER_BIG_SCALE : 1;
  if (activeFrame > 0) {
    const f = batterFrames.swings[activeFrame - 1];
    if (f.rotate) drawImageCenteredScale(f.img, toX(f.x) + toLen(25), toY(f.y) + toLen(25), toLen(50), toLen(50), bScale, f.rotate);
    else drawImageCenteredScale(f.img, toX(f.x), toY(f.y), toLen(50), toLen(50), bScale);
  } else {
    drawImageCenteredScale(batterFrames.ready.img, toX(batterFrames.ready.x), toY(batterFrames.ready.y), toLen(50), toLen(50), bScale);
  }

  // Ice Ball: a translucent iceberg overlay on top of the batter while their
  // crosshair is frozen/slowed - drawn last (on top) and centered on
  // whichever sprite/frame the batter is currently showing.
  if (app.batterFrozen) {
    const cx = activeFrame > 0 ? toX(BATTER_SWING_META[activeFrame - 1].x) + toLen(25) : toX(BATTER_READY_META.x) + toLen(25);
    const cy = activeFrame > 0 ? toY(BATTER_SWING_META[activeFrame - 1].y) + toLen(25) : toY(BATTER_READY_META.y) + toLen(25);
    drawImageTopLeft(EFFECTS_LIB.iceBallOverlay, cx - toLen(30), cy - toLen(30), toLen(60), toLen(60), 0.6);
  }
}

// Ghost Ball spawns 3 decoy trails. Drawn in its own function so it can be
// called AFTER drawBall() - the real ball must render BEHIND the ghosts, not
// in front of them, so the decoys can actually disguise it.
function drawGhostBalls() {
  ghostBalls.forEach((g, i) => {
    // Bug fix: Future Sight's prediction circle can't be accurate for Ghost
    // Ball - which decoy is real is random each throw, so there's no single
    // spot to point to (see the Ghost entry in FUTURE_SIGHT_SPOTS). Instead
    // of a wrong-looking circle, skip drawing the decoy overlay on the REAL
    // ball when Future Sight is active - the plain ball underneath (drawn
    // earlier in drawGameplay(), before the decoys) shows through undisguised,
    // giving away which one is real instead of guessing where it'll end up.
    if (g.visible && !(app.showFutureSight && g.isReal)) {
      drawImageTopLeft(EFFECTS_LIB.ghostTrails[i], g.x - toLen(7.5), g.y - toLen(7.5), toLen(15), toLen(15));
    }
  });
}

function drawPowerupEffects() {
  // Void: blacks out everything drawn so far (field, scoreboard, sprites) the
  // instant the pitch is released. The ball itself is drawn afterward (see
  // drawGameplay()'s call order) so it "punches through" and stays visible.
  if (app.voidActive && ball.visible) {
    rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.97);
  }

  // The meteor_projectile art is itself a whole shower of small
  // fireball-wrapped baseballs, not a single rock - drawn very big (per
  // request) and centered on the ball's tracked position, the real ball
  // (drawn on top a moment later in drawGameplay()'s order) reads as just
  // one more baseball lost among all the others already baked into the art.
  // Bug fix: ball.x/y don't actually start tracking the incoming meteor until
  // stepMeteor() flips ball.visible on (once the meteor has streaked in from
  // off-screen and reached the pitcher's corner) - drawing it earlier just
  // showed the giant art sitting frozen at the old resting position. Gate it
  // behind ball.visible so it only appears once the ball has actually moved
  // there.
  if (app.meteorActive && ball.visible) {
    const METEOR_SIZE = toLen(160);
    drawImageTopLeft(EFFECTS_LIB.meteorProjectile, ball.x - METEOR_SIZE / 2, ball.y - METEOR_SIZE / 2, METEOR_SIZE, METEOR_SIZE);
  }

  // Drawn before drawBall() in drawGameplay()'s call order (z-order already
  // puts it behind the ball) and now shrunk down with the ball sitting right
  // on top of it, instead of a large drone offset above the ball.
  if (app.droneBallActive) {
    drawImageRotated(EFFECTS_LIB.droneBallProjectile, ball.x, ball.y, toLen(24), toLen(15), 0);
  }

  // Home runs get a trail on contact; Fastball Plus now also gets a persistent
  // trail for its entire flight. Both trail assets have their own "leading
  // point" baked into the art at a specific spot, not centered and not
  // pointing along the +x axis by default, so simply rotating the raw image
  // by the travel angle leaves it both misaligned (drifts off the ball) and
  // pointed the wrong way. drawBallTrailImage() corrects for the art's own
  // default heading and re-centers the rotation so the ball/rock stays
  // locked to the true ball position at every angle.
  if (ball.visible && app.homeRun) {
    const travelAngle = Math.atan2(ball.ySpeed, ball.xSpeed) * 180 / Math.PI;
    // Measured from the art: the rock/head sits at (0.129, 0.783) of the
    // image and its default (unrotated) heading points ~139.75 deg (down-left).
    const w = toLen(90), h = w * (1080 / 1920);
    drawBallTrailImage(EFFECTS_LIB.ballTrail, 0.129, 0.783, 139.75, w, h, travelAngle);
  }
  if (ball.visible && app.showBallTrail) {
    const travelAngle = Math.atan2(ball.ySpeed, ball.xSpeed) * 180 / Math.PI;
    // Measured from the art: the baseball sits at (0.846, 0.49) of the square
    // image, default heading ~-3.36 deg (points almost exactly rightward),
    // and the ball itself spans ~23.4% of the image's width. Scaled so that
    // embedded baseball renders at the same size as the real ball.
    const ballDiameterRel = 0.234;
    const size = (2 * ball.radius) / ballDiameterRel;
    drawBallTrailImage(EFFECTS_LIB.fastballPlusTrail, 0.846, 0.49, -3.36, size, size, travelAngle);
  }

  if (app.shieldWidth > lenX(1)) {
    // Ice Shield used to just be a line that got thinner with each catch -
    // now it swaps between 3 progressively-damaged shield images instead,
    // matching the same 3-catches-before-it-breaks lifecycle (starts at
    // lenX(9.001) =~28.8, drops by lenX(3) =~9.6 per catch, expires below
    // lenX(1) =~3.2). shieldWidth is already in lenX-scaled units, so these
    // thresholds must NOT be wrapped in another lenX() call - that bug (was
    // lenX(19)=60.8 and lenX(9.5)=30.4, both higher than the shield's actual
    // ~28.8 max) meant it always fell through to stage 2 and never rotated.
    const stage = app.shieldWidth > 24 ? 0 : app.shieldWidth > 14.4 ? 1 : 2;
    const w = toLen(20), h = toLen(50);
    drawImageTopLeft(EFFECTS_LIB.iceShieldStages[stage], toX(340) - w / 2, toY(277.5) - h / 2, w, h, 0.9);
  }

  // Bug fix: this used to show as soon as Future Sight was armed, using
  // ball.x/y as a fallback before futureSightX/Y were ever set - which drew
  // the prediction dot sitting at the ball's resting spot before any pitch
  // had even been thrown. Only show it once a pitch actually exists.
  // Ghost Ball is handled separately (see drawGhostBalls()) by revealing the
  // real ball instead of guessing its position with this circle.
  if (app.showFutureSight && app.pitch && app.pitch !== 'Ghost') {
    circle(app.futureSightX || ball.x, app.futureSightY || ball.y, toLen(5), 'red', 0.4);
  }
}

function drawBall() {
  // A Pause-upgraded Home Run (worth 3 runs) turns the ball gold on its way out.
  if (ball.visible) circle(ball.x, ball.y, ball.radius, app.goldenHomeRun ? 'gold' : 'white', ball.opacity !== undefined ? ball.opacity : 1);
}

function drawCrosshair() {
  if (app.activeBatterKey === 'cpu') return;
  if (crosshairStyle === 'blackout') {
    // The viewable "gap" at the center (crosshairRadius - borderWidth/2) must
    // stay smaller than the normal crosshair's radius (toLen(11)) - that's
    // the whole point of Blackout Swing being harder to aim than a normal
    // swing. crosshairRadius is 30 here, so a border of toLen(46) leaves a
    // ~7-unit gap, safely under the normal 11-unit radius, while the
    // hit-test radius (crosshairRadius itself) stays untouched.
    circle(crosshairX, crosshairY, crosshairRadius, null, 0.6, 'black', toLen(46));
  } else if (app.batFireVisible) {
    // Fire: the whole crosshair reads as "critical" - any contact is a Home
    // Run. One color, one opacity, one circle - drawing the inner/outer
    // rings separately (even at the same color) made the overlapping center
    // look more solid than the ring from the alpha blending twice, so there's
    // no functional inner/outer distinction to show anyway (fire treats the
    // whole radius as critical).
    circle(crosshairX, crosshairY, crosshairRadius, 'orangered', 0.4);
  } else {
    circle(crosshairX, crosshairY, crosshairRadius, 'yellow', 0.3);
    if (!critHidden) circle(crosshairX, crosshairY, criticalRadius, 'orange', 0.4);
  }
}

function drawCallBanner() {
  if (!app.callActive) return;
  rect(0, toY(125), CANVAS_W, toLen(100), 'black', app.callBannerOpacity);
  text(app.callText, app.callX, toY(175), 70, 'red', 1, 'left', 900);
}

function drawDiceGame() {
  if (!app.diceRolling) return;
  // Dead center of the canvas - toX(300) was 3/4 of the way across, not
  // centered; toX(200)/toY(200) is the true center of the 0-400 unit field.
  const cx = toX(200), cy = toY(200);
  if (!app.diceCardVisible) {
    // Face changes every few ticks instead of nearly every frame, so the roll
    // reads as a real cycling die instead of a flicker. Once settling, freeze
    // on the actual final result instead of continuing to cycle.
    const face = app.diceSettling ? app.diceFinalFace : Math.floor(app.diceCount / 5) % 6;
    drawDiceFace(cx, cy, toLen(91), face);
  } else {
    const x = cx + app.diceCardX;
    rect(x - toLen(163), cy - toLen(98), toLen(325), toLen(196), 'rgb(245,242,233)');
    rect(x - toLen(163), cy - toLen(91), toLen(325), toLen(13), 'rgb(220,17,17)');
    circle(x - toLen(110), cy, toLen(33), 'rgb(220,17,17)');
    text(app.diceOutcomeNumber, x - toLen(110), cy, 57, 'rgb(245,242,233)');
    // Outcome text starts bigger and scales down only as far as needed so
    // longer phrases (e.g. "Automatic Strikeout") still fit on the card.
    const maxOutcomeWidth = toLen(140);
    let outcomeSize = 30;
    const measuredWidth = textWidth(app.diceOutcomeText, outcomeSize, 400);
    if (measuredWidth > maxOutcomeWidth) outcomeSize = Math.max(14, outcomeSize * maxOutcomeWidth / measuredWidth);
    text(app.diceOutcomeText, x + toLen(46), cy, outcomeSize, 'rgb(220,17,17)');
  }
}

// A fixed-aspect overlay, independent of the field's stretched 400-unit
// grid, so it's laid out in raw canvas pixels rather than toX/lenX/toLen -
// pw < ph on purpose (a "vertical rectangle", taller than wide). Enter/Y and
// Escape/N (see handleGameplayKey) still work as keyboard shortcuts; these
// are the clickable/tappable equivalent for mouse and touch.
// Sizes below were measured against the actual rendered text (text()'s
// toLen() scaling makes fonts render bigger than their raw "size" number
// suggests, even in this raw-pixel-coordinate panel): 'LEAVE GAME?' at
// size 26/900 measures ~367px, 'Yes, Leave' at size 20/900 measures ~211px -
// the old 260px-wide panel and 190px-wide buttons were clipping both.
const QUIT_PANEL = { w: 420, h: 350 };
const QUIT_YES_BTN = { w: 260, h: 65, offsetY: 145 };
const QUIT_NO_BTN = { w: 260, h: 65, offsetY: 225 };

function quitPanelRect() {
  const pw = QUIT_PANEL.w, ph = QUIT_PANEL.h;
  return { px: CANVAS_W / 2 - pw / 2, py: CANVAS_H / 2 - ph / 2, pw, ph };
}
function pointInQuitYesButton(x, y) {
  const { px, py, pw } = quitPanelRect();
  const bx = px + (pw - QUIT_YES_BTN.w) / 2, by = py + QUIT_YES_BTN.offsetY;
  return x >= bx && x <= bx + QUIT_YES_BTN.w && y >= by && y <= by + QUIT_YES_BTN.h;
}
function pointInQuitNoButton(x, y) {
  const { px, py, pw } = quitPanelRect();
  const bx = px + (pw - QUIT_NO_BTN.w) / 2, by = py + QUIT_NO_BTN.offsetY;
  return x >= bx && x <= bx + QUIT_NO_BTN.w && y >= by && y <= by + QUIT_NO_BTN.h;
}

function drawQuitConfirm() {
  if (!app.showQuitConfirm) return;

  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.7);

  const { px, py, pw } = quitPanelRect();
  rect(px, py, pw, QUIT_PANEL.h, 'rgba(20,20,26,0.97)', 1, 'white', 2);

  text('LEAVE GAME?', CANVAS_W / 2, py + 50, 26, 'white', 1, 'center', 900);
  text('Your current match', CANVAS_W / 2, py + 85, 14, '#cccccc', 1, 'center', 400);
  text('will be lost.', CANVAS_W / 2, py + 105, 14, '#cccccc', 1, 'center', 400);

  const yesX = px + (pw - QUIT_YES_BTN.w) / 2, yesY = py + QUIT_YES_BTN.offsetY;
  rect(yesX, yesY, QUIT_YES_BTN.w, QUIT_YES_BTN.h, 'rgba(210,30,30,0.85)', 1, 'white', 2);
  text('Yes, Leave', yesX + QUIT_YES_BTN.w / 2, yesY + QUIT_YES_BTN.h / 2, 20, 'white', 1, 'center', 900);

  const noX = px + (pw - QUIT_NO_BTN.w) / 2, noY = py + QUIT_NO_BTN.offsetY;
  rect(noX, noY, QUIT_NO_BTN.w, QUIT_NO_BTN.h, 'rgba(30,150,30,0.85)', 1, 'white', 2);
  text('No, Stay', noX + QUIT_NO_BTN.w / 2, noY + QUIT_NO_BTN.h / 2, 20, 'white', 1, 'center', 900);

  // Cursor: a pointer arrow beside whichever button quitConfirmIndex
  // currently points at - same pattern as drawModeSelect()'s own '▶'.
  const cursorX = app.quitConfirmIndex === 0 ? yesX : noX;
  const cursorY = app.quitConfirmIndex === 0 ? yesY + QUIT_YES_BTN.h / 2 : noY + QUIT_NO_BTN.h / 2;
  text('▶', cursorX - 15, cursorY, 22, 'white', 1, 'right', 900);
}

// A full standalone screen (not an overlay on top of 'play', unlike
// drawQuitConfirm() - the match is genuinely over by the time this shows,
// see switchSides()' game-over branch) - stays up until the player presses
// the button, instead of auto-navigating away or blocking on a native
// alert(). Raw canvas pixels throughout, same reasoning as
// QUIT_PANEL/quitPanelRect().
// Bug fix: w used to be a hardcoded 260, but 'Back To Menu' at this size/
// weight actually measures ~277px - the text was overflowing its own box
// with no room to spare. Size the box to the text itself (plus real
// padding) instead of a guessed constant.
const GAME_OVER_BTN_H = 65;
const GAME_OVER_BTN_TEXT_SIZE = 20;
function gameOverButtonRect() {
  const w = textWidth('Back To Menu', GAME_OVER_BTN_TEXT_SIZE, 900) + lenX(48);
  return { bx: CANVAS_W / 2 - w / 2, by: CANVAS_H / 2 + 50, bw: w, bh: GAME_OVER_BTN_H };
}
function pointInGameOverButton(x, y) {
  const { bx, by, bw, bh } = gameOverButtonRect();
  return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
}
function drawGameOver() {
  drawStadium();
  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.6);

  text('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 90, 46, 'white', 1, 'center', 900);
  text(app.gameOverP1Wins ? 'P1 WINS!' : (app.mode === 'solo' ? 'CPU WINS!' : 'P2 WINS!'), CANVAS_W / 2, CANVAS_H / 2 - 30, 30, 'gold', 1, 'center', 900);
  // A reward was actually granted (see evaluateGameEndUnlocks()) whenever
  // this is > 0 - true for every Story win, and for Tournament mode only
  // once the run itself ends (eliminated, or champion), never for a
  // mid-run round win that just advances to the next round.
  if (app.mode === 'solo' && app.lastCoinsEarned > 0) {
    text('+' + app.lastCoinsEarned + ' Coins', CANVAS_W / 2, CANVAS_H / 2 + 10, 22, 'gold', 1, 'center', 700);
  }

  const { bx, by, bw, bh } = gameOverButtonRect();
  rect(bx, by, bw, bh, 'rgba(210,30,30,0.85)', 1, 'white', 2);
  text('Back To Menu', CANVAS_W / 2, by + bh / 2, GAME_OVER_BTN_TEXT_SIZE, 'white', 1, 'center', 900);
}

// Shown once, right after a solo match that unlocked something new - before
// the player heads back to character select (see evaluateGameEndUnlocks()/
// goToCharacterSelectAfterGameOver()). Lists every entry in app.newlyUnlocked
// (both freshly-unlocked player characters and CPU roster advancement).
function drawUnlockReveal() {
  drawStadium();
  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.75);

  const count = app.newlyUnlocked.length;
  const plural = count > 1 ? 'S' : '';
  text('NEW UNLOCK' + plural + '!', CANVAS_W / 2, 55, 36, 'gold', 1, 'center', 900);

  // Row height (and everything scaled off it) shrinks to fit however many
  // unlocks landed at once - several win-dependent conditions can plausibly
  // fire from a single game, so this needs to hold up well past the 2-3
  // entries the common case has, not just assume a short list.
  const top = 100, bottom = CANVAS_H - 70;
  const rowH = Math.min(90, (bottom - top) / Math.max(1, count));
  const scale = Math.min(1, rowH / 90);
  const startY = top + rowH / 2;

  app.newlyUnlocked.forEach((u, i) => {
    const cy = startY + i * rowH;
    const c = CHARACTERS.find(ch => ch.key === u.key);
    const cx = CANVAS_W / 2 - 150;
    const r = 35 * scale;
    circle(cx, cy, r, 'rgba(0,0,0,0.4)', 1, c ? c.color : 'gold', 3);
    const img = portraits[u.key];
    if (img && img.complete && img.naturalWidth) {
      const imgScale = Math.min((r * 1.7) / img.naturalWidth, (r * 1.7) / img.naturalHeight);
      const iw = img.naturalWidth * imgScale, ih = img.naturalHeight * imgScale;
      ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
    }
    text(u.name, cx + 75, cy - 10 * scale, Math.max(12, 22 * scale), c ? c.color : 'gold', 1, 'left', 900);
    text(u.type === 'cpu' ? 'New Opponent Available' : 'New Character Unlocked', cx + 75, cy + 14 * scale, Math.max(9, 14 * scale), '#cccccc', 1, 'left', 600);
  });

  text('Tap or press Enter to continue ▶', CANVAS_W / 2, CANVAS_H - 35, 16, 'white', 0.85, 'center', 700);
}

function drawGameplay() {
  drawField();
  drawScoreboard();
  // Desktop's key-hint boxes (WASD/arrows, Z/M) don't mean anything on a
  // touchscreen - drawMobileControls() below is the mobile equivalent.
  if (!IS_MOBILE) { drawPitchMenu(); drawPowerUpUi(); }
  drawSprites();
  drawPitchMeterOverlay(); // over the pitcher (requested) - see confirmArmedPitch()
  drawPowerupEffects();
  drawBall();
  drawGhostBalls(); // ghosts render ON TOP of the real ball so they can disguise it
  drawDiceGame();
  drawCrosshair();
  drawCallBanner();
  drawPauseAnim();
  if (IS_MOBILE) drawMobileControls();
  drawTutorialOverlay(); // Coach's dialogue box, dims the scene while a line is up
  drawQuitConfirm(); // on top of absolutely everything, including Pause's own freeze overlay and Coach
}

// Pause power-up: while the drag animation plays out (see stepPauseAnim()),
// dims the whole scene, shows the Pause icon large in the center, and draws
// a fake cursor + dashed trail dragging the ball from its actual contact
// point over to the crosshair.
// Fade-in/hold/fade-out envelope for the pause/resume icon flashes, given
// progress 0..1 across the flash's own duration - mimics the brief flash
// YouTube shows over the video when you pause/resume it.
function flashOpacity(progress) {
  if (progress < 0.2) return progress / 0.2;
  if (progress < 0.8) return 1;
  return Math.max(0, (1 - progress) / 0.2);
}

function drawPlayTriangle(cx, cy, size, opacity) {
  drawArrowTriangle(cx, cy, size, 1, opacity);
}

// Right-pointing (dir=1) or left-pointing (dir=-1) triangle - used for the
// pause screen's play icon (dir=1, via drawPlayTriangle) and the mobile menu
// screens' prev/next character-or-difficulty nav buttons (either dir).
function drawArrowTriangle(cx, cy, size, dir, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3 * dir, cy - size * 0.5);
  ctx.lineTo(cx - size * 0.3 * dir, cy + size * 0.5);
  ctx.lineTo(cx + size * 0.5 * dir, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Plain two-bar pause glyph (not the power-up's pink icon) - matches the
// simple look of a real video player's pause symbol.
function drawPauseIcon(cx, cy, size, opacity) {
  const barW = size * 0.28, barH = size, gap = size * 0.16;
  const totalW = barW * 2 + gap;
  rect(cx - totalW / 2, cy - barH / 2, barW, barH, 'white', opacity);
  rect(cx - totalW / 2 + barW + gap, cy - barH / 2, barW, barH, 'white', opacity);
}

// Simple mouse-pointer silhouette (tip at the given x/y), scaled up briefly
// during the grab/release phases to sell "grabbing" the ball.
function drawFakeCursor(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const u = toLen(0.6);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16 * u);
  ctx.lineTo(4 * u, 12.5 * u);
  ctx.lineTo(7 * u, 19 * u);
  ctx.lineTo(9.5 * u, 18 * u);
  ctx.lineTo(6.5 * u, 11.5 * u);
  ctx.lineTo(11 * u, 11.5 * u);
  ctx.closePath();
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPauseAnim() {
  if (!app.pauseAnimActive) return;
  // Dims the whole scene throughout every phase - sells "everything is
  // frozen" like a paused video, not just during the icon flashes.
  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.4);

  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
  const iconSize = toLen(40);
  const phase = app.pausePhase;

  if (phase === 'flashPause') {
    const opacity = flashOpacity(app.pausePhaseTick / PAUSE_FLASH_DUR);
    drawPauseIcon(cx, cy, iconSize, opacity);
    return;
  }

  if (phase === 'flashResume') {
    const opacity = flashOpacity(app.pausePhaseTick / PAUSE_RESUME_FLASH_DUR);
    drawPlayTriangle(cx, cy, iconSize, opacity);
    return;
  }

  // toBall / grab / toCrosshair / release: the fake cursor is on screen the
  // whole time, growing briefly during grab/release to read as "grabbing"
  // or "letting go" of the ball.
  const pulseDur = phase === 'grab' ? PAUSE_GRAB_DUR : PAUSE_RELEASE_DUR;
  const isPulsePhase = phase === 'grab' || phase === 'release';
  const scale = isPulsePhase ? 1 + Math.sin(Math.min(1, app.pausePhaseTick / pulseDur) * Math.PI) * 0.3 : 1;
  drawFakeCursor(app.pauseCursorX, app.pauseCursorY, scale);
}

function render() {
  musicSound.volume = app.screen === 'play' ? MUSIC_GAME_VOLUME : MUSIC_MENU_VOLUME;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (app.screen === 'onboarding') drawOnboardingPrompt();
  else if (app.screen === 'mode') drawModeSelect();
  else if (app.screen === 'soloModeSelect') drawSoloModeSelectPrompt();
  else if (app.screen === 'characterSolo') drawSoloSelect();
  else if (app.screen === 'characterVersus') drawVersusSelect();
  else if (app.screen === 'upgrades') drawUpgradesScreen();
  else if (app.screen === 'mobileCharacterSelect') drawMobileCharacterSelect();
  else if (app.screen === 'mobileCpuSelect') drawMobileCpuSelect();
  else if (app.screen === 'mobileUpgrades') drawMobileUpgradesScreen();
  else if (app.screen === 'play') drawGameplay();
  else if (app.screen === 'gameOver') drawGameOver();
  else if (app.screen === 'unlockReveal') drawUnlockReveal();
  drawMenuCursor();
}

// The canvas hides the native cursor everywhere (see style.css's `cursor:
// none`, needed so it doesn't clash with the in-game crosshair) - outside
// actual gameplay there's no crosshair to stand in for it, so menus/gameOver/
// unlockReveal drew with no visible pointer at all. Reuses the same
// hand-drawn arrow drawPauseAnim() already uses for its "grabbing" cursor.
// Mobile has no mouse to speak of, and 'play' already has its own crosshair.
function drawMenuCursor() {
  if (IS_MOBILE || app.screen === 'play') return;
  drawFakeCursor(mouseX, mouseY, 1);
}

/* ============================== HIT RESOLUTION ============================== */
function clearInFlightPowerupTargets() {
  app.meteorActive = false;
  if (app.voidActive) { ball.visible = true; app.voidActive = false; }
  ghostBalls.forEach(g => { g.visible = false; });
  app.ghostActive = false;
}

// Resolves an unswung pitch that just reached the plate as a Strike - unless
// Mirror Ball is active, in which case it bounces back for an identical
// second delivery instead. Bug fix: Ghost Ball and Meteor each have their own
// dedicated "reached the plate" resolution (separate from the generic
// ball.x > toX(355) check below, since they drive the ball's position
// themselves) and used to just unconditionally call resetBall()+recordStrike()
// with no idea Mirror Ball existed - so Mirror Ball silently did nothing
// against them. All three call sites now share this one function.
function resolveUnswungStrike() {
  if (!app.mirrorBallActive) {
    resetBall();
    recordStrike();
  } else {
    app.reverseBall = true;
    app.isPitching = false;
    ball.accel = 0;
    ball.ySpeed = 0;
    ball.xSpeed = 0.00001;
    playSound(POWER_SOUNDS.mirrorBall); // plays once the ball actually starts bouncing back, not at activation
  }
}

function resolveHit() {
  // Bug fix: the mousedown handler sets app.checkHit on any click, with no
  // idea whether there's actually a live ball to swing at - a click that
  // lands after the pitch already resolved (a strike got called, resetBall()
  // ran, ball.visible is now false) used to still run the full distance
  // check below against wherever the now-dead ball happens to be resting,
  // occasionally registering a "hit" (or letting Pause trigger its
  // animation) against a ball that isn't actually in play anymore. Nothing
  // here makes sense without a real, currently-visible ball.
  if (!ball.visible) { app.checkHit = false; return; }

  // Contact is based on crosshair proximity to the ball's center. Landing
  // inside the Critical Crosshair is always a Home Run; Fire turns the whole
  // crosshair into a critical one (any contact = Home Run); otherwise contact
  // within the normal crosshair is tiered by distance into Double/Single/Ground Out.
  const d = dist(crosshairX, crosshairY, ball.x, ball.y);
  const critHit = !critHidden && d <= criticalRadius;
  const normalHit = d <= crosshairRadius;
  const fireHit = app.batFireVisible && normalHit;

  // A mistimed swing gets a few more ticks to actually connect (see
  // SWING_CONTACT_WINDOW/attemptSwing()) instead of being judged a miss from
  // this single instant - the ball keeps moving each of those ticks, so
  // checking again next tick gives a slightly early/late swing a real chance.
  // Skipped when Pause is about to consume the swing outright regardless of
  // precision (its own branch just below always resolves in one tick, same
  // as before this window existed).
  if (!(critHit || fireHit || normalHit) && !(app.paused && ball.x <= toX(355))) {
    app.swingContactTicksLeft--;
    if (app.swingContactTicksLeft > 0) return;
    app.checkHit = false; // window used up with no contact - genuine miss
    return;
  }

  // Bug fix: if the ball has already crossed the plate threshold (ball.x >
  // toX(355)) by the time the swing lands, it's too late to meaningfully
  // "grab" it - the generic strike-check that runs right after resolveHit()
  // returns (see update()) would see the ball still past 355 with app.swung
  // still true and resolve it AGAIN as a Strike/Mirror Ball bounce on the
  // exact same tick, stomping whatever Pause had just set up. Don't start
  // the animation in that case - just let this swing resolve normally below,
  // same as if Pause weren't active at all (see the fallthrough further down
  // - app.paused is deliberately left alone so it stays armed for next time).
  // (ball.visible is already guaranteed true here by the guard at the top of
  // this function, which is what actually stops a late click from triggering
  // this against an already-resolved, no-longer-live ball.)
  if (app.paused && ball.x <= toX(355)) {
    // Pause upgrades whatever WOULD have happened by exactly one tier: a
    // total miss/strike becomes a Single, a normal base hit becomes a Home
    // Run, and a would-be Home Run becomes a special golden Home Run worth 3
    // runs instead of 1 - see stepPauseAnim() for where that's actually
    // applied. Rather than that snapping the ball to the crosshair and
    // resolving instantly, it now plays out as a YouTube-style sequence -
    // pause icon flashes, a fake cursor travels to the ball, grabs it,
    // carries it to the crosshair, lets go, resume icon flashes - see
    // stepPauseAnim()/drawPauseAnim() for the phases. Capture what's needed
    // (contact point, crosshair, which outcome tier applies) and let the
    // phase machine carry out the actual position/velocity change once it
    // finishes - everything else in update() is frozen meanwhile.
    clearInFlightPowerupTargets();
    app.paused = false;
    app.pauseAnimActive = true;
    app.pausePhase = 'flashPause';
    app.pausePhaseTick = 0;
    app.pauseFromX = ball.x;
    app.pauseFromY = ball.y;
    app.pauseOutcome = (critHit || fireHit) ? 'critical' : normalHit ? 'normal' : 'miss';
    if (app.pauseOutcome === 'miss') {
      // A miss was outside the yellow crosshair entirely (d > crosshairRadius)
      // - Pause forgives it into a Single, but the ball should only get
      // dragged as far as the edge of the yellow circle, not all the way to
      // dead center (that's reserved for genuine contact - see below). Land
      // on the boundary point closest to where the ball actually was.
      const dx = ball.x - crosshairX, dy = ball.y - crosshairY;
      const d = Math.hypot(dx, dy) || 1;
      app.pauseToX = crosshairX + (dx / d) * crosshairRadius;
      app.pauseToY = crosshairY + (dy / d) * crosshairRadius;
    } else {
      // Normal/critical contact was already within the crosshair - still
      // goes all the way to dead center, same as before.
      app.pauseToX = crosshairX;
      app.pauseToY = crosshairY;
    }
    ball.xSpeed = 0;
    ball.ySpeed = 0;
    app.checkHit = false;
    return;
  }
  // Bug fix: this used to consume Pause even when it didn't actually trigger
  // (falls through here instead of returning, in the "too late" case above) -
  // the swing "wasted" the power with nothing to show for it. Leave
  // app.paused alone here instead (it's already false in the normal,
  // never-armed case) - if it was true and didn't fire this swing, it stays
  // armed and gets another chance on the batter's next swing.
  if (critHit || fireHit || normalHit) {
    playSound(SOUNDS.batCrack);
    // The crowd doesn't just get louder on contact (that already happens on
    // every swing, hit or miss - see attemptSwing()) - it erupts into an
    // actual cheer layered on top of the ambient loop.
    playSound(SOUNDS.crowdCheer);
    // Stashed before either branch below clears app.pitch to '' - lets
    // recordBaseHit() know what pitch type was actually hit, for the
    // "hit off every pitch type" unlock condition.
    app.lastPitchThrown = app.pitch;
    // Tutorial batting drill (bat_easy) only cares that contact happened at
    // all, not what it turns into (single/double/ground out) - see
    // stepTutorial().
    if (app.tutorial.active && app.tutorial.awaitingContact) {
      app.tutorial.awaitingContact = false;
      app.tutorial.contactMade = true;
    }
  }
  if (critHit || fireHit) {
    ball.accel = -toLen(0.2);
    ball.xSpeed = -lenX(40);
    ball.ySpeed = -toLen(20);
    app.homeRun = true;
    app.pitch = '';
    clearInFlightPowerupTargets();
  } else if (normalHit) {
    clearInFlightPowerupTargets();
    // Distance-tiered contact: closer to center (just outside the critical
    // zone) is a Double, mid-range is a Single. Ground Out used to cover the
    // whole outer 25% of the crosshair regardless of pitch speed, which made
    // it common - it should be rare, only when contact is right at the very
    // edge of the hitbox AND the pitch itself is slow enough that a
    // barely-timed swing doesn't get enough bat behind it. The same
    // edge-of-hitbox contact against a fast pitch still gets a Single - more
    // pace on the pitch means more pace off the bat even on a mistimed swing.
    const ratio = crosshairRadius > 0 ? d / crosshairRadius : 1;
    const pitchIsSlow = Math.abs(ball.xSpeed) < lenX(11);
    ball.accel = -toLen(0.2);
    if (ratio < 0.45) { ball.xSpeed = -lenX(38); ball.ySpeed = -toLen(16); } // Double
    else if (ratio < 0.92 || !pitchIsSlow) { ball.xSpeed = -lenX(20); ball.ySpeed = -toLen(7); } // Single
    else { ball.xSpeed = -lenX(8); ball.ySpeed = toLen(6); } // Ground Out - hitbox edge + slow pitch only
    app.pitch = '';
  }
  app.checkHit = false;
}

// Duration of each phase of Pause's sequence, in ticks (40/sec):
const PAUSE_FLASH_DUR = 15; // pause icon holds
const PAUSE_TO_BALL_DUR = 20; // cursor travels from center to the ball
const PAUSE_GRAB_DUR = 6; // brief pulse - "grabbing" the ball
const PAUSE_TO_CROSSHAIR_DUR = 25; // cursor carries the ball to the crosshair
const PAUSE_RELEASE_DUR = 6; // brief pulse - "letting go"
const PAUSE_RESUME_FLASH_DUR = 15; // resume icon holds, then play continues

function easeOut(t) { return 1 - (1 - t) * (1 - t); }

// Drives Pause's YouTube-style pause/resume sequence, one phase at a time:
// pause icon flashes -> fake cursor travels to the ball -> grabs it -> carries
// it to the crosshair -> lets go -> resume icon flashes -> the outcome tier
// resolveHit() decided on (see the app.paused branch there) finally applies.
// Called every tick while app.pauseAnimActive, from update()'s own
// short-circuit at the top (everything else stays frozen meanwhile).
function stepPauseAnim() {
  if (!app.pauseAnimActive) return;
  app.pausePhaseTick++;

  if (app.pausePhase === 'flashPause') {
    if (app.pausePhaseTick >= PAUSE_FLASH_DUR) {
      app.pausePhase = 'toBall';
      app.pausePhaseTick = 0;
      app.pauseCursorX = CANVAS_W / 2;
      app.pauseCursorY = CANVAS_H / 2;
    }
    return;
  }

  if (app.pausePhase === 'toBall') {
    const t = easeOut(Math.min(1, app.pausePhaseTick / PAUSE_TO_BALL_DUR));
    app.pauseCursorX = CANVAS_W / 2 + (app.pauseFromX - CANVAS_W / 2) * t;
    app.pauseCursorY = CANVAS_H / 2 + (app.pauseFromY - CANVAS_H / 2) * t;
    if (t >= 1) { app.pausePhase = 'grab'; app.pausePhaseTick = 0; }
    return;
  }

  if (app.pausePhase === 'grab') {
    if (app.pausePhaseTick >= PAUSE_GRAB_DUR) { app.pausePhase = 'toCrosshair'; app.pausePhaseTick = 0; }
    return;
  }

  if (app.pausePhase === 'toCrosshair') {
    const t = easeOut(Math.min(1, app.pausePhaseTick / PAUSE_TO_CROSSHAIR_DUR));
    ball.x = app.pauseFromX + (app.pauseToX - app.pauseFromX) * t;
    ball.y = app.pauseFromY + (app.pauseToY - app.pauseFromY) * t;
    app.pauseCursorX = ball.x;
    app.pauseCursorY = ball.y;
    if (t >= 1) {
      ball.x = app.pauseToX;
      ball.y = app.pauseToY;
      app.pausePhase = 'release';
      app.pausePhaseTick = 0;
    }
    return;
  }

  if (app.pausePhase === 'release') {
    if (app.pausePhaseTick >= PAUSE_RELEASE_DUR) { app.pausePhase = 'flashResume'; app.pausePhaseTick = 0; }
    return;
  }

  // flashResume
  if (app.pausePhaseTick < PAUSE_RESUME_FLASH_DUR) return;
  app.pauseAnimActive = false;
  app.pausePhase = '';
  // Bug fix: the ball can land at/below the "ground" threshold (toY(300)) if
  // that's just where the batter aimed, same class of bug the justResolvedHit
  // flag already guards against for a normal hit (the ground-bounce check
  // mistaking a fresh hit's own resting height for having already landed and
  // stopped). Because this completes via update()'s early return rather than
  // in the middle of a normal tick, the usual same-tick flag doesn't cover
  // it - so mark the ONE tick right after completion as protected instead.
  app.justFinishedPauseAnim = true;
  ball.accel = -toLen(0.2);
  app.pitch = '';
  // Every Pause outcome here is contact - even 'miss' got forgiven into a
  // Single rather than a whiff (see the outcome tiers below).
  playSound(SOUNDS.batCrack);
  playSound(SOUNDS.crowdCheer);
  if (app.pauseOutcome === 'critical') {
    app.homeRun = true;
    app.goldenHomeRun = true;
    ball.xSpeed = -lenX(40); ball.ySpeed = -toLen(20);
  } else if (app.pauseOutcome === 'normal') {
    app.homeRun = true;
    ball.xSpeed = -lenX(40); ball.ySpeed = -toLen(20);
  } else {
    // Would-be miss/strike - Single-tier contact instead of a whiff.
    ball.xSpeed = -lenX(20); ball.ySpeed = -toLen(7);
  }
}

/* ============================== PHYSICS / RULES STEP ============================== */
// Bug fix: every entry here was wrong - none of them matched where the pitch
// actually is right before it's judged. Rebuilt by simulating each pitch's
// real flight and recording where it actually is at x=325 - a fixed line in
// front of the batter's sprite (BATTER_READY_META.x = 335), so every circle
// shows up in front of the batter instead of scattered anywhere from 331 to
// 357 (on top of, or past, the batter) depending on how fast that particular
// pitch happens to be.
const FUTURE_SIGHT_SPOTS = {
  Fastball: [325, 268], Curveball: [325, 269], Knuckleball: [325, 271], Riser: [325, 281],
  EFastball: [325, 261], ECurveball: [325, 275], EKnuckleball: [325, 276], ERiser: [325, 278],
  HFastball: [325, 270], HCurveball: [325, 268], HKnuckleball: [325, 268], HRiser: [325, 288],
  FastballPlus: [325, 272], SpinCycle: [325, 273], DroneBall: [325, 275],
  // Meteor is still high up in the air at x=325 (a falling rock, not a real
  // pitch arc) - it only drops to strike-zone height right at the very end of
  // its flight, well past this point, so the circle correctly shows it much
  // higher on screen than every other pitch at this same x.
  Meteor: [325, 226],
  // Ghost Ball's actual y at x=325 varies by design - one of its 3 decoys is
  // secretly the real ball (chosen randomly each throw, see the Z-key ghost
  // arm), and each decoy's own path is at a different y here (~243/~265/~276
  // measured across the 3 slots). This is the average of those - the closest
  // a single fixed spot can get, but it can't be exact for this one.
  Ghost: [325, 262],
};

const GHOST_MAX_Y = toY(298); // clamp: ghosts may never render at/below ground level

function stepGhostBalls() {
  // Bug fix: same Time Stop gap as Drone Ball/SpinCycle - the ghosts' own
  // per-tick movement is set directly here, bypassing the generic
  // ball.xSpeed/ySpeed division entirely, so Time Stop never slowed them.
  const div = app.timeStopActive ? 10 : 1;
  if (ghostBalls[0].visible && ghostBalls[0].x <= toX(355)) {
    ball.visible = true;
    ghostBalls.forEach(g => { g.x += lenX(2.5) / div; });
    if (ghostBalls[0].x < toX(250)) ghostBalls[0].y -= toLen(0.5) / div; else ghostBalls[0].y += toLen(0.7) / div;
    if (ghostBalls[2].x < toX(250)) ghostBalls[2].y += toLen(0.5) / div; else ghostBalls[2].y -= toLen(0.7) / div;
    ghostBalls.forEach(g => { if (g.y > GHOST_MAX_Y) g.y = GHOST_MAX_Y; });
    const real = ghostBalls.find(g => g.isReal);
    if (real) { ball.x = real.x; ball.y = real.y; }
    // Bug fix: Ghost Ball drives the real ball's position directly, right
    // here, rather than through the generic ball.xSpeed physics - so
    // update()'s stepIceShield() call (which runs before this function each
    // tick) always saw last tick's position, one tick stale. Give the shield
    // a look at this tick's freshest position immediately.
    stepIceShield();
    if (!app.ghostActive) return;
  } else if (ghostBalls[0].visible && ghostBalls[0].x > toX(200)) {
    ghostBalls.forEach((g, i) => { g.visible = false; g.isReal = false; g.x = toX(80); g.y = toY(255 + i * 10); });
    app.ghostActive = false;
    if (!app.swung) resolveUnswungStrike();
  }
}

function stepMeteor() {
  if (!app.meteorActive) return;
  if (app.meteorX > lenX(4) && app.meteorY > toLen(33)) {
    ball.x = app.meteorX - lenX(4);
    ball.y = app.meteorY - toLen(33);
    ball.visible = true;
  }
  // Bug fix: Meteor drives the ball's position directly, right here, rather
  // than through the generic ball.xSpeed physics - so update()'s
  // stepIceShield() call (which runs before this function each tick) always
  // saw last tick's position, one tick stale, and could resolve a guaranteed
  // strike below before the shield ever got a fresh look. Give it a look at
  // this tick's freshest position immediately.
  stepIceShield();
  if (!app.meteorActive) return;
  // Bug fix: this used to keep flying the meteor all the way to CANVAS_W before
  // declaring "must be a strike", but the generic plate-crossing check (ball.x >
  // toX(355)) always fired first since ball.x tracks meteorX well before meteorX
  // itself reaches CANVAS_W - so the guaranteed-strike branch below never actually
  // ran. Resolve at the same plate threshold the generic check uses instead.
  if (ball.x < toX(355)) {
    // Bug fix: same Time Stop gap as the other self-driving pitches - the
    // meteor's own advance is set directly, bypassing the generic
    // ball.xSpeed/ySpeed division, so Time Stop never slowed it down.
    const div = app.timeStopActive ? 10 : 1;
    app.meteorX += lenX(6) / div;
    app.meteorY += toLen(5.2) / div;
  } else {
    app.meteorActive = false;
    if (!app.swung) resolveUnswungStrike();
  }
}

function stepSpinCycle() {
  if (!app.spinCycleActive) return;
  // Bug fix: Time Stop only ever divided ball.xSpeed/ySpeed/accel, which
  // SpinCycle (like the other self-driving pitches below) doesn't use for
  // its own motion - it sets ball.x/y directly every tick, so it never
  // visibly slowed down. Check app.timeStopActive directly instead.
  const div = app.timeStopActive ? 20 : 1;
  if (ball.x >= toX(100)) {
    if (!app.spinCycleSoundOn) { app.spinCycleSoundOn = true; playSound(POWER_SOUNDS.spinCycle); }
    ball.x = toX(150) - lenX(50) * Math.cos(app.spinCycleSpeed);
    ball.y = toY(250) + toLen(50) * Math.sin(app.spinCycleSpeed);
    app.spinCycleSpeed += (0.1 + app.spinCycleSpeed * 0.1) / div;
  }
  if (app.spinCycleSpeed > 1000000) {
    app.spinCycleActive = false;
    app.spinCycleSoundOn = false;
    stopSound(POWER_SOUNDS.spinCycle);
    ball.y = toY(270);
    ball.xSpeed = lenX(50) / div;
  }
}

function stepDroneBall() {
  if (!app.droneBallActive || ball.x >= toX(300)) return;
  // Bug fix: Time Stop's generic ball.xSpeed/ySpeed/accel division never
  // touched Drone Ball, since this function overwrites ball.xSpeed directly
  // every tick regardless of whatever Time Stop set it to - so the burst
  // speeds below are scaled directly by app.timeStopActive instead.
  const div = app.timeStopActive ? 10 : 1;
  const gateNearLo = toX(110.9), gateNearHi = toX(112);
  const gateFarLo = toX(170.9) + lenX(20) * app.droneNum;
  const gateFarHi = toX(172) + lenX(20) * app.droneNum;
  if (ball.x > gateNearLo && ball.x < gateNearHi && app.droneCount >= 0 && app.droneCount < 100) {
    ball.xSpeed = 0.0000001;
    app.droneCount++;
    if (app.droneCount > 40) { app.droneCount = -1; ball.xSpeed = lenX(20) / div; }
  } else if (app.droneCount < 0 && app.droneCount > -100 && ball.x > gateFarLo && ball.x < gateFarHi) {
    ball.xSpeed = 0.0000001;
    app.droneCount--;
    if (app.droneCount < -6) { app.droneCount = 100; ball.xSpeed = -lenX(20) / div; }
  } else if (app.droneCount >= 100 && ball.x > gateNearLo && ball.x < gateNearHi) {
    ball.xSpeed = 0.0000001;
    app.droneCount++;
    if (app.droneCount > 130) { ball.xSpeed = lenX(20) / div; app.droneCount = -100; }
  } else if (app.droneCount <= 100 && ball.x > gateFarLo && ball.x < gateFarHi) {
    ball.xSpeed = 0.0000001;
    app.droneCount -= 5;
    if (app.droneCount < -130) {
      if (app.droneNum % 2 === randRange(0, 3)) { app.droneCount = 100; ball.xSpeed = -lenX(20) / div; }
      else { app.droneCount = 0; ball.xSpeed = lenX(30) / div; }
    }
  }
}

const MIRAGE_FADE_START_X = 130; // ball flies clearly visible for a while before the fade begins (0-400 units)

function stepMirage() {
  // Bug fix: this had no idea Mirror Ball's bounce-back could be in progress,
  // so it kept fading and re-cycling the ball purely off ball.x/mirageCount -
  // during the reverse-flight (ball.x drifting slowly back toward the
  // pitcher, still well past the fade-start threshold) it would fade out
  // AGAIN, and since app.swung was already consumed by the first fade, it
  // took the "continue the mirage cycle" branch: calling resetBall() and
  // relaunching mid-reverse, stomping the in-progress bounce-back before it
  // ever reached its own completion point. The ball isn't "in mirage flight"
  // once it's reversing - Mirror Ball owns it until that finishes.
  if (app.reverseBall) return;
  if (!(app.mirageCount > 0 && ball.visible)) return;
  if (ball.x < toX(MIRAGE_FADE_START_X)) return;
  // Doubling the fade rate turned out to be too aggressive (disappeared too
  // fast); dialed back to roughly 1.4x the original pace instead of 2x - a
  // bit later than the original, not as long as the doubled version.
  // Bug fix: Time Stop divided ball.xSpeed/ySpeed/accel but never touched
  // this fade rate, so the ball visually vanished at its normal pace even
  // while its own flight was in slow motion - Time Stop looked like it wasn't
  // affecting Mirage at all. Scale the fade down the same way.
  const fadeDiv = app.timeStopActive ? 15 : 1;
  if (app.pitch === 'Knuckleball') ball.opacity -= 0.05 / fadeDiv;
  else if (app.pitch === 'Curveball') ball.opacity -= 0.086 / fadeDiv;
  else ball.opacity -= 0.098 / fadeDiv;
  if (ball.opacity <= 0.02) {
    ball.opacity = 1;
    // Bug fix: this used to unconditionally reset+re-pitch here regardless
    // of app.swung, meaning a swing-and-miss during a still-fading Mirage
    // ball was silently discarded - no strike recorded, no Mirror Ball
    // bounce-back, nothing; the game just quietly threw another pitch as if
    // the swing never happened. Route through the same mirror-ball-aware
    // resolution every other "reached a conclusion unhit" path uses - it
    // either concludes the play outright (real strike/out) or sets up Mirror
    // Ball's bounce-back itself, so there's nothing left for this function
    // to do afterward either way.
    if (app.swung) {
      resolveUnswungStrike();
      app.swung = false;
      return;
    }
    resetBall();
    // Bug fix: resetBall() clears app.pitch (needed so Future Sight's "only
    // show once a pitch is chosen" gate doesn't see a stale leftover name).
    // But the pitcher's windup-completion logic only throws the next ball by
    // calling applyPitchVelocity(app.pitch) once the windup animation finishes
    // - with app.pitch now blank, that call matched nothing and did nothing,
    // so the ball just sat dead at rest forever. Mirage's whole premise is
    // multiple auto-relaunched fading balls, so it needs its pitch name back
    // before handing off to the windup.
    app.pitch = 'Fastball';
    app.isPitching = true;
    app.mirageCount += randRange(1, 4);
    if (app.mirageCount > 8) app.mirageCount = 0;
    // Bug fix: resetBall() zeroes futureSightCount every pitch by design (so
    // a brand new pitch gets its own fresh windup-freeze preview) - but
    // Mirage calls resetBall() internally on every fade-and-recycle, not just
    // its first throw, so with Future Sight active the windup kept re-freezing
    // before EVERY mirage ball instead of just the first one. Skip the freeze
    // for this relaunch by marking the preview window already elapsed.
    if (app.showFutureSight) app.futureSightCount = 80;
  }
}

function stepIceShield() {
  if (app.shieldWidth <= lenX(1)) return;
  // Bug fix: this used to check only the ball's position AFTER this tick's
  // move (a point check), which worked fine for slow pitches but missed fast
  // ones entirely - SpinCycle's post-spin burst (lenX(50)/tick) and
  // FastballPlus (lenX(30)/tick) both cover far more ground in a single tick
  // than the catch zone is wide, so the ball could jump clean over x=340
  // without ever landing inside the zone on any sampled tick. Use a swept
  // check instead: catch it if the zone falls anywhere between where the
  // ball was and where it ended up this tick, not just its final resting spot.
  const half = app.shieldWidth / 2 + ball.radius;
  const lo = toX(340) - half, hi = toX(340) + half;
  const xLo = Math.min(app.prevBallX, ball.x);
  const xHi = Math.max(app.prevBallX, ball.x);
  // Bug fix: Meteor's own "reached the plate" resolution (see stepMeteor) is
  // a guaranteed strike regardless of height - it's a falling rock, not a
  // real pitch arc, so by the time it's crossing the shield's x-window its y
  // is still well above this band (it only gets there several ticks later,
  // right as it resolves) - the shield could never physically intercept it.
  // Since Meteor's own resolution already treats height as irrelevant, do
  // the same here instead of gating on a height band it never reaches in time.
  const yInBand = app.pitch === 'Meteor' || (ball.y > toY(255) && ball.y < toY(300));
  if (xHi >= lo && xLo <= hi && yInBand) {
    app.shieldWidth -= lenX(3);
    resetBall();
    recordBall();
  }
}

const DICE_CARD_SLIDE_SPEED = lenX(10);
const DICE_CARD_EXIT_X = lenX(DICE_CARD_START_X); // card exits off the opposite side from where it entered

function stepDice() {
  if (!app.diceRolling) return;
  if (app.diceSettling) {
    // Frozen on the final rolled face for a beat before the card slides in.
    app.diceSettleHoldCount++;
    if (app.diceSettleHoldCount > DICE_SETTLE_HOLD) {
      app.diceSettling = false;
      resolveDiceRoll();
    }
  } else if (!app.diceCardVisible) {
    stepDiceRoll();
  } else if (app.diceCardX > 0) {
    // Card flies in from the side once the roll has settled, instead of
    // appearing instantly at its resting position.
    app.diceCardX = Math.max(0, app.diceCardX - DICE_CARD_SLIDE_SPEED);
  } else if (app.diceExiting) {
    // Card flies off screen (the opposite direction it flew in from) instead
    // of just vanishing once its hold time is up.
    app.diceCardX -= DICE_CARD_SLIDE_SPEED;
    if (app.diceCardX < -DICE_CARD_EXIT_X) {
      app.diceExiting = false;
      finishDiceCardScroll();
    }
  } else {
    app.diceCardHoldCount++;
    if (app.diceCardHoldCount > 70) {
      app.diceCardHoldCount = 0;
      app.diceExiting = true;
    }
  }
}

const CPU_PITCH_DELAY_STEPS = 150; // ~3.75s at 40 steps/sec - "a set delay" before the CPU pitches on its own
// A brand-new player's very first pitch faced shouldn't sit through the same
// ~3.75s dead air as every pitch after it - that pause reads fine once
// you're already invested, but as literally the first thing that happens
// after picking a character, it's just a stall. Only this one pitch (ever,
// for the whole session) uses the short delay; app.firstCpuPitchDone flips
// permanently once it actually fires.
const CPU_FIRST_PITCH_DELAY_STEPS = 40; // ~1s

function stepCpu() {
  if (app.mode !== 'solo') return;
  if (app.activeBatterKey === 'cpu' && ball.visible && ball.x > toX(300) && !app.cpuSwung) {
    cpuSwing();
  }
  if (app.activePitcherKey === 'cpu') {
    app.spinCount++;
    const delayThreshold = app.firstCpuPitchDone ? CPU_PITCH_DELAY_STEPS : CPU_FIRST_PITCH_DELAY_STEPS;
    // Bug fix: this used to only check `=== CPU_PITCH_DELAY_STEPS` on the exact
    // step the counter hit the threshold. If canStartPitch() was blocked right
    // then (call banner, dice roll, or other stop-animation in progress), the
    // counter would blow past the threshold and CPU pitching would just stall
    // for a very long time before retrying. Now it keeps retrying every step
    // once the delay has elapsed, so the CPU pitches the instant it's clear to.
    if (app.spinCount >= delayThreshold) {
      if (canStartPitch()) {
        app.spinCount = 0;
        app.firstCpuPitchDone = true;
        cpuPitch();
      }
    }
  }
}

function stepCallBanner() {
  if (!app.callActive) return;
  app.callX -= toLen(10);
  if (app.callX + toLen(200) <= toLen(100)) {
    app.callBannerOpacity = Math.max(0, app.callBannerOpacity - 0.05);
    if (app.callBannerOpacity <= 0) {
      app.callX = CANVAS_W;
      app.callActive = false;
    }
  }
}

// How far the crosshair moves per tick at full joystick deflection. Lowered
// from 6 - full deflection felt too twitchy/sensitive for fine aiming.
const JOYSTICK_SPEED = toLen(3);

function stepCrosshair() {
  // A joystick reports a direction/deflection, not a position to chase, so
  // it drives crosshairX/Y by velocity instead of the mouse's lerp-toward-a-
  // point model below - and unlike that model, mobile must NEVER fall
  // through to it even when the stick isn't currently held: mousemove never
  // fires on a touch device, so mouseX/mouseY sit frozen at their initial
  // off-screen (-50,-50) default, and lerpFactor=1 would snap the crosshair
  // straight there the instant the stick is released. Releasing it should
  // just stop movement in place - no snap - matching typical twin-stick aim.
  if (IS_MOBILE) {
    if (joystick.touchId !== null) {
      const speedMul = app.batterFrozen ? 0.06 : 1; // Ice Ball slows aiming the same way it slows the mouse-chase below
      crosshairX = Math.min(CANVAS_W, Math.max(0, crosshairX + joystick.dx * JOYSTICK_SPEED * speedMul));
      crosshairY = Math.min(CANVAS_H, Math.max(0, crosshairY + joystick.dy * JOYSTICK_SPEED * speedMul));
    }
    return;
  }
  const lerpFactor = app.batterFrozen ? 0.06 : 1;
  crosshairX += (mouseX - crosshairX) * lerpFactor;
  crosshairY += (mouseY - crosshairY) * lerpFactor;
}

function update() {
  if (app.screen !== 'play') return;
  stepCrowdVolume();

  // Escape-to-quit confirmation is up - freeze the entire scene (ball, CPU,
  // any in-flight animation) exactly where it is until the player answers.
  if (app.showQuitConfirm) return;

  // Checks flags set (on a previous tick) by the tutorial's forced-outcome
  // hooks and, if a drill objective was just met, opens Coach's next line -
  // see stepTutorial().
  stepTutorial();
  // Runs even outside the tutorial (unlike stepTutorial() itself) so a real
  // match's opponent dialogue still types in - see stepDialogTypewriter().
  stepDialogTypewriter();
  // The dialogue box freezes the whole scene while it's up, exactly like
  // the quit-confirm modal above - see drawDialogOverlay().
  if (app.dialog.active && app.dialog.lines.length > 0) return;

  // Pause's drag animation freezes everything else while it plays out -
  // only advance the animation itself and skip the rest of this tick.
  if (app.pauseAnimActive) { stepPauseAnim(); return; }

  stepPitchMeter();

  // Bug fix: this used to be nested inside `if (app.isPitching)`, so Future
  // Sight's spot-tracking (and its windup-freeze preview window) only ever
  // ran for pitches that set app.isPitching - Ghost Ball and Meteor drive the
  // ball themselves and never set it, so Future Sight could never track them
  // at all. Spot-tracking now runs independently of isPitching; the windup
  // freeze still only applies to pitches that actually have a windup to freeze.
  if (app.showFutureSight && app.pitch && app.futureSightCount < 80) {
    const spot = FUTURE_SIGHT_SPOTS[app.pitch];
    if (spot) { app.futureSightX = toX(spot[0]); app.futureSightY = toY(spot[1]); }
    app.futureSightCount++;
  }
  if (app.isPitching) {
    if (app.showFutureSight && app.futureSightCount < 80) {
      // windup stays frozen during the preview window
    } else {
      playAnimation('pitcher');
    }
  }

  if (app.isBatting) playAnimation('batter');

  if (ball.xSpeed !== 0) ball.ySpeed -= ball.accel;
  app.prevBallX = ball.x;
  ball.y += ball.ySpeed;
  ball.x += ball.xSpeed;

  // Tutorial's batting aim demo (bat_aim_demo): freeze the ball right where
  // it is, mid-flight, well before it reaches the plate - see
  // beginBattingAimDemo()/AIM_DEMO_FREEZE_X and stepTutorial()'s on-target
  // detection, which keeps running every tick even while frozen.
  if (app.tutorial.active && app.tutorial.awaitingAimFreeze && ball.visible && ball.x >= toX(AIM_DEMO_FREEZE_X)) {
    app.tutorial.awaitingAimFreeze = false;
    app.tutorial.aimDemoFrozen = true;
    ball.xSpeed = 0;
    ball.ySpeed = 0;
    app.tutorial.captionText = IS_MOBILE
      ? 'Move the joystick to line your crosshair up with the ball!'
      : 'Move your mouse to line your crosshair up with the ball!';
  }

  // Bug fix: stepIceShield() used to run at the very bottom of update(),
  // well after the generic plate-crossing check and Ghost Ball/Meteor's own
  // resolution logic. For fast pitches (SpinCycle's post-spin burst,
  // FastballPlus, Meteor) the ball can cross all the way from before the
  // shield's catch-zone to past the plate within a SINGLE tick - the generic
  // check (or Meteor's own) would already resolve the play and reset the
  // ball back to its resting position before stepIceShield() ever got a
  // chance to see it in the catchable zone that same tick. Now it runs
  // immediately after the ball's position updates, before anything else can
  // resolve or reset it.
  stepIceShield();

  // Tracks whether a swing resolved THIS tick, so the ground-bounce check
  // below doesn't immediately re-process the ball a hit just launched - see
  // that check for why this matters. Also true for the one tick right after
  // Pause's drag animation completes (see stepPauseAnim()) - it lands the
  // ball wherever the crosshair was, which the same check could otherwise
  // mistake for having already landed and stopped.
  const justResolvedHit = app.checkHit || app.justFinishedPauseAnim;
  app.justFinishedPauseAnim = false;
  if (app.checkHit) resolveHit();

  // Ghost Ball and Meteor drive the ball's position themselves and guarantee
  // their own "must be a strike" resolution when their sequence completes
  // unhit (see stepGhostBalls/stepMeteor) - they must run and potentially
  // conclude the play BEFORE the generic zone-crossing check below, otherwise
  // that generic check would grade whatever y they happened to be at instead.
  stepGhostBalls();
  stepMeteor();

  if (app.reverseBall) {
    ball.x -= lenX(4);
    if (ball.y > toY(250)) ball.y -= toLen(0.7);
    else if (ball.y < toY(250)) ball.y += toLen(0.7);
    if (ball.x < toX(63)) {
      app.isPitching = true;
      app.mirrorBallActive = false;
      app.reverseBall = false;
      // Bug fix: this used to set -toLen(0.2), the value used elsewhere for
      // post-CONTACT ball flight (resolveHit()/the batter's swing) - copied in
      // by mistake, since a relaunch here is a fresh WINDUP, not a hit.
      // resetBall() (every other fresh pitch's starting point) uses -toLen(0.25)
      // instead, and pitches without their own custom accel in the velocity
      // table (Fastball/EFastball/HFastball) are tuned assuming that baseline.
      // The mismatched -0.2 gave the relaunched pitch a shallower arc that
      // landed above the strike band, so Mirror Ball's "same pitch again"
      // relaunch was quietly getting called a Ball instead of the guaranteed
      // Strike it's supposed to be.
      ball.accel = -toLen(0.25);
      app.swung = false;
      // Bug fix: if the current pitcher's power is Mirage, the pitch Mirror
      // Ball just bounced back could have been the FINAL, already-exhausted
      // cycle (mirageCount had already hit 0, so it was a plain solid
      // Fastball by the time it reached the plate) - relaunching with that
      // same mirageCount of 0 meant the "same power" never actually
      // reactivated, it just stayed a plain ball forever. Force a fresh
      // mirage cycle on relaunch whenever this pitcher throws Mirage, so the
      // fading effect always resumes, matching every other power's relaunch.
      if (pitcherChar().pitch.key === 'mirage' && app.mirageCount <= 0) {
        app.mirageCount = 1;
      }
      // Bug fix: the reverse-flight approaches (61, 250) but the 0.7/step
      // easing on y and the 4/step step on x rarely land it EXACTLY there -
      // any residual drift carried into the second pitch's launch position,
      // so the identical velocity table produced a different trajectory (the
      // ball would end up called a Ball instead of repeating the same call).
      // Snap back to the exact launch spot so pitch #2 is truly identical to #1.
      ball.x = toX(61);
      ball.y = toY(250);
      // Second bug fix: ball.xSpeed was left at the reverse-flight's 0.00001
      // placeholder (never zeroed), which is still "!== 0" - so the general
      // physics line at the top of update() (`if (ball.xSpeed !== 0) ball.ySpeed
      // -= ball.accel`) kept running every tick of the SECOND windup using the
      // accel just set above, making the ball visibly sink before the new
      // pitch even launched. Every other windup has ball.xSpeed exactly 0;
      // this one must too.
      ball.xSpeed = 0;
      ball.ySpeed = 0;
    }
  }

  // Bug fix: Ghost Ball and Meteor drive ball.x themselves in two phases each
  // tick - a movement branch (while ball.x <= 355) and a separate resolve
  // branch (checked again the NEXT tick, once ball.x > 355). Their per-tick
  // step (8 for Ghost, 19.2 for Meteor) means the movement branch itself can
  // push ball.x past 355 on some tick - one tick BEFORE their own resolve
  // branch is checked again and gets a chance to call resolveUnswungStrike().
  // This generic check used to run unconditionally right after them in the
  // same tick, so on that in-between tick it saw ball.x already past the
  // plate with app.ghostActive/meteorActive still true, and resolved the
  // pitch itself (usually as a wrong Ball, since y/swung rarely matched) -
  // pre-empting Ghost Ball/Meteor's own guaranteed-strike resolution by a
  // full tick. Under Mirror Ball this silently cancelled the reverse the
  // instant it was set up (the same tick), which is why it looked like Mirror
  // Ball "didn't work" on them specifically. These two pitches must always
  // resolve through their own step function, never through this generic path -
  // and a ball already mid-reverse has also already been resolved this tick.
  // Bug fix: this also had no idea a swing had just resolved THIS tick (via
  // resolveHit(), above) - if the ball happened to already be past 355 at
  // the moment of contact (a very late swing, or Pause's fallback when it's
  // too late to animate - see resolveHit()), app.swung was still true and
  // this would immediately re-resolve the SAME ball as a Strike/Mirror Ball
  // bounce, stomping the hit that had just been set up a few lines earlier
  // in this same tick. justResolvedHit already exists for exactly this
  // "don't re-litigate what just resolved this tick" purpose (see the
  // ground-check further down) - it applies here too.
  if (!justResolvedHit && !app.reverseBall && !app.ghostActive && !app.meteorActive && ball.x > toX(355)) {
    if ((ball.y > toY(265) && ball.y < toY(290)) || app.swung) {
      resolveUnswungStrike();
      app.swung = false;
    } else {
      resetBall();
      recordBall();
    }
  }

  if (ball.x < toX(0)) {
    clearCounts(false);
    recordBaseHit();
  }

  // Bug fix: Curveball's whole-flight arc (and, in edge cases, Riser/
  // Knuckleball's chaos) can leave ball.y sitting right at/above the ground
  // threshold exactly when a swing connects. resolveHit() doesn't touch
  // ball.y, so without this guard, the SAME tick's ground-bounce check would
  // immediately re-fire right after a hit was resolved - and since every hit
  // tier sets a negative (leftward) ball.xSpeed, `ball.xSpeed < lenX(1)` is
  // always true for a fresh hit, turning what should've been a Double/Single/
  // Home Run into an instant Ground Out. Skip this check entirely on the
  // tick a hit just resolved; it'll correctly re-evaluate next tick if the
  // hit's own trajectory still has the ball low (e.g. a real Ground Out).
  if (!justResolvedHit && ball.y >= toY(300)) {
    ball.y = toY(300);
    ball.ySpeed *= -0.08;
    // Ground Out (requested): the ball should visibly roll all the way back
    // to the pitcher's mound before being ruled out, not just decelerate to
    // a stop wherever it happens to run out of momentum on the infield -
    // contact happens up near home plate (~toX(325)), far short of the mound
    // (~toX(35)), so stopping on speed alone (the old `Math.abs(ball.xSpeed)
    // < lenX(1)` check) always called it out well before it got there.
    // Friction still slows the ball down tick-to-tick for a natural-looking
    // roll, but is floored well above 0 (never allowed to fully stop) so it
    // keeps crawling the rest of the way in instead of stalling short -
    // reaching the mound itself is what actually ends it now.
    if (ball.x <= toX(GROUND_OUT_MOUND_X)) {
      ball.xSpeed = 0;
      // Bug fix: this used to call clearCounts(true) - which also wipes ALL
      // out-dots - unconditionally right after recordOut(), immediately
      // erasing the out dot recordOut() had JUST set for a 1st/2nd out (it
      // only stayed visible once the 3rd out hit, which needs the full reset
      // anyway and already gets it inside recordOut() itself). The new
      // at-bat's strike/ball count should still reset, just not the outs -
      // clearCounts(false) matches exactly what recordStrike()'s own
      // strikeout-to-out path already does.
      clearCounts(false);
      recordOut();
    } else {
      ball.xSpeed += lenX(1.01);
      if (ball.xSpeed > -lenX(3)) ball.xSpeed = -lenX(3);
    }
  }

  // Bug fix: this used to fire on every idle frame whenever ball.xSpeed===0,
  // which is also true during the brief window between arming a pitching
  // powerup (Void/Ghost/Meteor/...) and the pitch actually launching - wiping
  // out the armed powerup before it ever took effect. Guard it so it only
  // treats the ball as "genuinely idle" when no windup or powerup sequence is
  // in flight; genuine conclusions (strike/ball/hit/ghost-and-meteor timeout)
  // already call resetBall() explicitly themselves.
  // Bug fix: Pause's drag animation deliberately holds ball.xSpeed at 0 while
  // it eases the ball across the screen - on the very tick the swing starts
  // it (resolveHit() sets app.pauseAnimActive mid-tick, after this same
  // update() call's own top-of-function short-circuit already ran), this
  // guard would otherwise see "xSpeed 0, not pitching, no other power flag"
  // and immediately resetBall() the ball back to its resting spot before the
  // animation ever got a single frame to show the real contact point.
  // Bug fix: the tutorial's batting aim demo deliberately holds ball.xSpeed
  // at 0 while frozen mid-flight (see the freeze hook above) - without this
  // exclusion, this same guard would see "xSpeed 0, not pitching, no other
  // power flag" on the very next tick and immediately resetBall() the ball
  // back to its resting spot before the player ever got a chance to aim at it.
  const genuinelyIdle = ball.xSpeed === 0 && !app.isPitching && !app.powerUpActive && !app.pauseAnimActive
    && !(app.tutorial.active && app.tutorial.aimDemoFrozen);
  // Second bug fix: once the ball is ALREADY sitting at rest, calling
  // resetBall() again every single idle tick was destructive - resetBall()
  // unconditionally zeroes ball.radius, app.batterFrozen and the swing/pitch
  // hold-counters, so any one-shot instant modifier applied while idle
  // (Ice Ball's freeze, Ball Shrink/Expand's radius change, a gambler radius
  // tweak) got wiped a frame after it was set, and a bat swing taken before
  // a pitch was thrown had its animation hold-counter re-zeroed every tick
  // (batterHoldCount never reached BATTER_FRAME_HOLD, so the swing sprite
  // never advanced). Only run the reset when there's actually something to
  // clean up - the ball flew off-screen or is idle somewhere other than its
  // resting spot - not when it's already sitting exactly at rest.
  const alreadyAtRest = ball.x === toX(61) && ball.y === toY(250) && ball.xSpeed === 0 && ball.ySpeed === 0 && !ball.visible;
  if (!alreadyAtRest && (ball.x < 0 || ball.y > CANVAS_H || genuinelyIdle)) {
    if (ball.xSpeed !== 0 && app.swung) {
      clearPowerupVisuals();
      app.homeRun = false;
    }
    resetBall();
  }

  // Curveball and Riser now carry their whole-flight arc shape from the
  // custom accel set at launch (see applyPitchVelocity) - no per-step break
  // logic needed here anymore.

  // Knuckleball: genuinely chaotic for most of the flight - each step picks a
  // random up/down bounce (clamped to stay on-screen and leave room to
  // recover) so it's hard to track, then once it's closing in on the plate a
  // corrective pull steers it smoothly into the strike zone so it still
  // reliably resolves as a guaranteed strike despite the randomness.
  // Bug fix: nothing ever clears app.pitch back to '' after a play resolves,
  // so it stayed 'Knuckleball' long after the ball was back at rest. Since
  // the "chaos phase" check (ball.x < KNUCKLE_CHAOS_END_X) is also true for
  // the ball's resting x position, this kept firing every idle tick after
  // ANY knuckleball, continuously randomizing ball.y away from its resting
  // spot - which broke canStartPitch()'s exact-position check and
  // permanently blocked every pitch thrown afterward. Gate the whole thing
  // behind ball.visible so it only ever runs while a knuckleball is actually
  // in flight.
  if (ball.visible && (app.pitch === 'Knuckleball' || app.pitch === 'EKnuckleball' || app.pitch === 'HKnuckleball') && !app.reverseBall) {
    const chaosMult = app.timeStopActive ? 1.6 : 1;
    if (ball.x < toX(KNUCKLE_CHAOS_END_X)) {
      ball.ySpeed = (Math.random() < 0.5 ? 1 : -1) * toLen(randRange(3, 7) * chaosMult);
      const nextY = ball.y + ball.ySpeed;
      if (nextY < toY(215)) ball.ySpeed = toY(215) - ball.y;
      else if (nextY > toY(285)) ball.ySpeed = toY(285) - ball.y;
    } else {
      ball.ySpeed = (toY(KNUCKLE_ZONE_TARGET_Y) - ball.y) * 0.35;
    }
  }

  if (app.stopTime && ball.x > toX(250)) {
    app.timeStopActive = true;
    app.stopTime = false;
    ball.xSpeed /= 10;
    if (app.pitch === 'Fastball' || app.pitch === 'EFastball' || app.pitch === 'HFastball' || app.pitch === 'FastballPlus') { ball.ySpeed /= 40; ball.accel /= 40; }
    else if (app.pitch === 'Curveball' || app.pitch === 'ECurveball' || app.pitch === 'HCurveball') { ball.accel /= 100; ball.ySpeed /= 10; }
    else if (app.pitch === 'Riser' || app.pitch === 'ERiser' || app.pitch === 'HRiser') { ball.ySpeed /= 100; ball.accel /= 100; }
    else if (app.pitch === 'Knuckleball' || app.pitch === 'EKnuckleball' || app.pitch === 'HKnuckleball') ball.accel /= 100;
  }

  stepCrosshair();
  stepSpinCycle();
  stepDroneBall();
  stepMirage();
  stepDice();
  stepCpu();
  stepCallBanner();
}

/* ============================== MAIN LOOP ============================== */
const STEP_MS = 1000 / 40; // CMU app.stepsPerSecond = 40
let lastTime = 0, accumulator = 0;

function frame(ts) {
  if (!lastTime) lastTime = ts;
  accumulator += ts - lastTime;
  lastTime = ts;
  if (accumulator > 250) accumulator = 250; // avoid spiral of death after a tab switch
  while (accumulator >= STEP_MS) {
    update();
    accumulator -= STEP_MS;
  }
  render();
  requestAnimationFrame(frame);
}

// app.screen defaults to 'onboarding' (see the app object) - the very first
// thing a page load shows is drawOnboardingPrompt(), not the main menu.
// New players (requested) skip that question entirely and go straight into
// the tutorial instead of being asked - "new" means no save data has ever
// been written yet (see SAVE_KEY/loadSaveData()), the same signal the rest
// of the game already treats as "hasn't played before". Returning players
// (a save already exists) still see the onboarding prompt as before.
if (localStorage.getItem(SAVE_KEY) === null) {
  startTutorial();
}
requestAnimationFrame(frame);
