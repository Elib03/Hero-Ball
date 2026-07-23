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

/* ============================== CHARACTER ROSTER ============================== */
const CHARACTERS = [
  { key: 'pyro', name: 'The Pyro', color: '#ff7a1a', portrait: PORTRAITS + 'pyro.png',
    bat: { key: 'fire', label: 'Fire', icon: ICONS + 'fire.png' },
    pitch: { key: 'meteor', label: 'Meteor', icon: ICONS + 'meteor.png' } },
  { key: 'trickster', name: 'The Trickster', color: '#9b59d0', portrait: PORTRAITS + 'trickster.png',
    bat: { key: 'mirrorBall', label: 'Mirror Ball', icon: ICONS + 'mirror_ball.png' },
    pitch: { key: 'ghost', label: 'Ghost Ball', icon: ICONS + 'ghost.png' } },
  { key: 'scientist', name: 'The Scientist', color: '#2b6fe0', portrait: PORTRAITS + 'scientist.png',
    bat: { key: 'timeStop', label: 'Time Stop', icon: ICONS + 'time_stop.png' },
    pitch: { key: 'droneBall', label: 'Drone Ball', icon: ICONS + 'drone_ball.png' } },
  // color is the lighter UI/name-text shade (kept legible on the select
  // screen); the uniform sprite itself is recolored much darker - see
  // recolor.py.
  { key: 'shadow', name: 'The Shadow', color: '#5a5a63', portrait: PORTRAITS + 'shadow.png',
    bat: { key: 'blackoutSwing', label: 'Blackout Swing', icon: ICONS + 'blackout_swing.png' },
    pitch: { key: 'void', label: 'The Void', icon: ICONS + 'void.png' } },
  { key: 'gambler', name: 'The Gambler', color: '#f0c020', portrait: PORTRAITS + 'gambler.png',
    bat: { key: 'gamblerBatting', label: "Gambler's Roll", icon: ICONS + 'dice_batting.png' },
    pitch: { key: 'gamblerPitching', label: "Gambler's Roll", icon: ICONS + 'dice_pitching.png' } },
  { key: 'strategist', name: 'The Strategist', color: '#d626b0', portrait: PORTRAITS + 'strategist.png',
    bat: { key: 'pause', label: 'Pause', icon: ICONS + 'pause.png' },
    pitch: { key: 'spinCycle', label: 'Spin Cycle', icon: ICONS + 'spin_cycle.png' } },
  { key: 'antman', name: 'Antman', color: '#4caf50', portrait: PORTRAITS + 'antman.png',
    bat: { key: 'expandShot', label: 'Ball Expand', icon: ICONS + 'ball_expand.png' },
    pitch: { key: 'ballShrink', label: 'Ball Shrink', icon: ICONS + 'ball_shrink.png' } },
  { key: 'iceman', name: 'Iceman', color: '#8fe0ff', portrait: PORTRAITS + 'iceman.png',
    bat: { key: 'iceShield', label: 'Ice Shield', icon: ICONS + 'ice_shield.png' },
    pitch: { key: 'iceBall', label: 'Ice Ball', icon: ICONS + 'ice_ball.png' } },
  { key: 'oracle', name: 'The Oracle', color: '#2e8b74', portrait: PORTRAITS + 'oracle.png',
    bat: { key: 'futureSight', label: 'Future Sight', icon: ICONS + 'future_sight.png' },
    pitch: { key: 'mirage', label: 'Mirage', icon: ICONS + 'mirage.png' } },
  { key: 'bruiser', name: 'The Bruiser', color: '#d1263f', portrait: PORTRAITS + 'bruiser.png',
    bat: { key: 'guaranteedContact', label: 'Guaranteed Contact', icon: ICONS + 'guaranteed_contact.png' },
    pitch: { key: 'fastballPlus', label: 'Fastball Plus', icon: ICONS + 'fastball_plus.png' } },
];

const KNUCKLE_CHAOS_END_X = 280; // knuckleball bounces chaotically before this x, then corrects into the zone (0-400 units)
const KNUCKLE_ZONE_TARGET_Y = 277; // corrective phase steers toward dead-center of the strike zone (265-290)

const DIFFICULTY_NAMES = ['Easy', 'Normal', 'Hard'];
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

// All 10 characters fanned out in a staggered strip - a trading-card-spread
// lineup poster - in the gap between the Solo and 2 Player buttons (y 150-250,
// otherwise unused). Alternating vertical offset and a slight alternating
// tilt give the fan/stagger look; a slow float plus a soft pulsing glow in
// each character's own color (rim-light-style, via canvas shadowBlur, which
// hugs the portrait's actual silhouette since the art has a transparent
// background) bring it to life without needing CSS animation.
function drawCharacterShowcase() {
  const n = CHARACTERS.length;
  // Desktop's Solo/2 Player buttons (y:70-150 and y:250-330) leave a clear
  // gap around y=200 for the showcase. Mobile's single Play button (y:150-
  // 240, see PLAY_BUTTON) sits right on top of that same spot, so mobile
  // needs the showcase moved down below the button instead.
  const bandCx = CANVAS_W / 2, bandCy = IS_MOBILE ? toY(300) : toY(200);
  const spacing = Math.min(lenX(38), (CANVAS_W - toX(40)) / n);
  const t = (Date.now() - MENU_LOAD_TIME) / 1000;
  CHARACTERS.forEach((c, i) => {
    const img = menuCharacterImage(c.key);
    if (!img.complete || !img.naturalWidth) return;
    const offsetFromCenter = i - (n - 1) / 2;
    const cx = bandCx + offsetFromCenter * spacing;
    const stagger = (i % 2 === 0) ? -1 : 1;
    const floatY = Math.sin(t * 0.6 + i * 1.3) * toLen(4);
    const cy = bandCy + stagger * toLen(14) + floatY;
    const tilt = stagger * 6;
    const h = toLen(70), w = h * (img.naturalWidth / img.naturalHeight);
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
  screen: 'mode', // mode | characterSolo | characterVersus | mobileCharacterSelect | mobileDifficultySelect | play
  mode: null, // 'solo' | 'versus'
  modeSelectIndex: 0, // 0 = Solo, 1 = 2 Player
  difficultyIndex: 1,
  player1Index: 0,
  player2Index: 0,
  cpuBatterIndex: 0,
  player1Locked: false,
  player2Locked: false,
  // Mobile-only: the character/difficulty select steps are two separate
  // screens with their own confirm button (see mobileCharacterSelect /
  // mobileDifficultySelect) instead of desktop's single combined screen, so
  // difficulty needs its own lock flag alongside player1Locked.
  difficultyLocked: false,
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

  fireTuneActive: false, // debug: live fire-trail alignment tuning (press F)
  fireTuneFrame: 0, // 0 = ready stance, 1-5 = swing frames (matches batterFrameIndex numbering)
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
let crosshairRadius = toLen(11);
let criticalRadius = toLen(3.5);
let critHidden = false;
let crosshairStyle = 'normal'; // normal | blackout

// Mobile digital joystick: dx/dy are the stick's current deflection,
// normalized to -1..1 per axis. touchId identifies which finger owns the
// stick (see the touchstart/touchmove/touchend handlers) so a second finger
// tapping another button doesn't steal or reset it. stepCrosshair() reads
// dx/dy every tick to move the crosshair while touchId isn't null.
const joystick = { touchId: null, dx: 0, dy: 0 };
// 0-400 unit space, left side - y=335 keeps the whole circle's top edge
// (335-35=300) right at the grass line instead of poking above it (grass
// runs y:300-400, see drawField()), matching SWING_BUTTON/POWERUP_BUTTON's
// shared row so all three batting controls line up together.
const JOYSTICK_BASE = { x: 45, y: 335, radius: 35 };

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
    crosshairRadius = toLen(11);
    criticalRadius = toLen(3.5);
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
}

function clearCounts(clearOuts) {
  strikeFills[0] = strikeFills[1] = strikeFills[2] = 'dimgray';
  ballFills[0] = ballFills[1] = ballFills[2] = ballFills[3] = 'dimgray';
  if (clearOuts) outFills[0] = outFills[1] = outFills[2] = 'dimgray';
}

function clearPowerupVisuals() {
  app.batFireVisible = false;
  criticalRadius = toLen(3.5);
  crosshairRadius = toLen(11);
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
}

function recordBaseHit() {
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
  showCallBanner('Out');
  playSound(SOUNDS.out);
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
  for (let i = 0; i < 3; i++) {
    if (outFills[i] === 'dimgray') { outFills[i] = 'gold'; return; }
    if (i === 1) {
      bases[0] = bases[1] = bases[2] = 'grey';
      showCallBanner('Switch Sides!');
      clearCounts(true);
      // Refills every half-inning regardless of inning number - power-ups
      // stay available through extra innings too, not just innings 1-3.
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
    // A full inning just completed (away finished batting) - advance inning number
    inningNumber++;
    if (inningNumber === 2) inningSuffix = 'nd';
    else if (inningNumber === 3) inningSuffix = 'rd';
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
        app.gameOverP1Wins = homeScore > awayScore;
        app.screen = 'gameOver';
        pokiGameplayStop();
      }
    }
  }
}

function assignActiveRoles() {
  if (app.mode === 'solo') {
    if (app.homePitching) { app.activePitcherKey = 'p1'; app.activeBatterKey = 'cpu'; }
    else { app.activePitcherKey = 'cpu'; app.activeBatterKey = 'p1'; }
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
    if (i === 1) { clearCounts(false); recordOut(); return; }
  }
}

function forceWalk() {
  showCallBanner('Walk');
  ballFills[0] = ballFills[1] = ballFills[2] = ballFills[3] = 'dimgray';
  for (let j = 0; j < 3; j++) {
    if (bases[j] === 'grey') { bases[j] = 'gold'; return; }
    if (j === 2) { scoreRun(); return; }
  }
}

function recordBall() {
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
function cpuSwing() {
  app.cpuSwung = true;
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
    // 24.5% overall chance of making contact; of that contact, 70% Single,
    // 20% Double, 10% Home Run. Rolled out of 1000 for exact percentages:
    // 755 whiff / 172 Single / 49 Double / 24 Home Run (172+49+24=245=24.5%).
    const roll = randRange(0, 1000);
    if (roll < 755) { /* whiff - 75.5% */ }
    else if (roll < 927) { ball.xSpeed = -lenX(randRange(10, 20)); ball.ySpeed = -toLen(randRange(7, 12)); } // Single - 17.2%
    else if (roll < 976) { ball.xSpeed = -lenX(randRange(24, 28)); ball.ySpeed = -toLen(randRange(18, 22)); } // Double - 4.9%
    else { ball.xSpeed = -lenX(40); ball.ySpeed = -toLen(20); app.homeRun = true; } // Home Run - 2.4%
  }
}

function cpuPitch() {
  const sets = [
    ['EFastball', 'ECurveball', 'EKnuckleball', 'ERiser'],
    ['Fastball', 'Curveball', 'Knuckleball', 'Riser'],
    ['HFastball', 'HCurveball', 'HKnuckleball', 'HRiser'],
  ];
  const options = sets[app.difficultyIndex];
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
  ensureMusicStarted();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (app.screen === 'mode') { handleModeSelectKey(key); return; }

  if (app.screen === 'characterSolo') {
    handleSoloSelectKey(key);
    return;
  }
  if (app.screen === 'characterVersus') {
    handleVersusSelectKey(key);
    return;
  }
  if (app.screen === 'gameOver') {
    if (key === 'enter') goToCharacterSelectAfterGameOver();
    return;
  }
  if (app.screen === 'play') {
    handleGameplayKey(key);
  }
});

window.addEventListener('keyup', () => {});

// Randomizes which character the select cursor starts on each time the
// character select screen is entered, instead of always landing on
// CHARACTERS[0] (Pyro).
function randomizeCharacterCursor(mode) {
  app.player1Index = randRange(0, CHARACTERS.length);
  if (mode === 'versus') app.player2Index = randRange(0, CHARACTERS.length);
}

function handleModeSelectKey(key) {
  if (key === 'arrowup' || key === 'w') app.modeSelectIndex = 0;
  else if (key === 'arrowdown' || key === 's') app.modeSelectIndex = 1;
  else if (key === 'enter') {
    if (app.modeSelectIndex === 0) { app.mode = 'solo'; app.screen = 'characterSolo'; randomizeCharacterCursor('solo'); }
    else { app.mode = 'versus'; app.screen = 'characterVersus'; randomizeCharacterCursor('versus'); }
  }
}

function goBackToModeSelect() {
  app.screen = 'mode';
  app.player1Locked = false;
  app.player2Locked = false;
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
  app.mirrorBallActive = false;
  app.reverseBall = false;
  app.diceRolling = false;
  stopSound(POWER_SOUNDS.gamblerBatting); // safety net if a mode/match reset happens mid-roll
  stopSound(POWER_SOUNDS.gamblerPitching);
  app.mirageCount = 0;
  app.fireTuneActive = false;
  app.batPowerFull = true;
  app.pitchPowerFull = true;
  crowdSound.pause();
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
function goToCharacterSelectAfterGameOver() {
  app.screen = IS_MOBILE ? 'mobileCharacterSelect' : (app.mode === 'versus' ? 'characterVersus' : 'characterSolo');
  app.player1Locked = false;
  app.player2Locked = false;
  app.difficultyLocked = false;
  app.readyOpacity = 0;
  randomizeCharacterCursor(app.mode);
  resetMatchState();
}

function handleSoloSelectKey(key) {
  if (key === 'escape') { goBackToModeSelect(); return; }
  if (key === 'a') {
    app.player1Locked = false; app.readyOpacity = 0;
    app.player1Index = (app.player1Index + CHARACTERS.length - 1) % CHARACTERS.length;
  } else if (key === 'd') {
    app.player1Locked = false; app.readyOpacity = 0;
    app.player1Index = (app.player1Index + 1) % CHARACTERS.length;
  } else if (key === 'arrowup') {
    app.readyOpacity = 0;
    app.difficultyIndex = (app.difficultyIndex + 1) % 3;
  } else if (key === 'arrowdown') {
    app.readyOpacity = 0;
    app.difficultyIndex = (app.difficultyIndex + 2) % 3;
  } else if (key === 's') {
    app.player1Locked = true;
  } else if (key === 'enter' && app.readyOpacity >= 80) {
    beginGame();
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
  // Solo starts with the human batting (homePitching=false -> assignActiveRoles()
  // gives p1 the batter role, CPU pitches) instead of the old pitch-first
  // default - versus mode is untouched, still p1 pitching/p2 batting first.
  // battingTeamIsHome() (=!homePitching) is derived from this same flag every
  // half-inning via assignActiveRoles(), so p1's runs always land under
  // "P1-Home" regardless of which role they start in - flipping the initial
  // value doesn't break that pairing.
  app.homePitching = app.mode === 'solo' ? false : true;
  assignActiveRoles();
  if (app.mode === 'solo') app.cpuBatterIndex = randRange(0, CHARACTERS.length);
  // Warm both active characters' sprite sets now, before the first
  // drawSprites() call needs them - avoids a blank/undefined-image frame
  // while the lazy loader's first fetch is still in flight.
  getPitcherFrames(pitcherChar().key);
  getBatterFrames(batterChar().key);
  resetBall();
  // startMatch() only ever runs after the player has already interacted with
  // the menu (clicked/tapped Play, pressed Enter, etc.), so the browser's
  // autoplay-needs-a-user-gesture policy is already satisfied here.
  crowdVolume = CROWD_BASE_VOLUME;
  crowdSound.volume = CROWD_BASE_VOLUME;
  crowdSound.currentTime = 0;
  crowdSound.play().catch(() => {});
}

// Poki wants a commercialBreak() right before every gameplayStart() - this
// game has no separate pause/resume menu to hook that into (see
// pokiCommercialBreak()), so "about to start or restart a match" is the
// closest real equivalent. pokiBreakPending guards against the player
// mashing Enter/tap again while a break's still resolving and firing a
// second overlapping one.
function beginGame() {
  if (pokiBreakPending) return;
  pokiCommercialBreak(() => {
    startMatch();
    pokiGameplayStart();
  });
}

/* ============================== INPUT: GAMEPLAY ============================== */
function canStartPitch() {
  // Bug fix (requested): a new pitch may never be started while any powerup
  // animation, the call banner, or a dice roll is still resolving. app.powerUpActive
  // only clears once resetBall() runs at the end of the current play.
  return ball.x === toX(61) && ball.y === toY(250) && !app.callActive && !app.diceRolling
    && !app.isPitching && !app.powerUpActive;
}

function handleGameplayKey(key) {
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
  if (key === 'escape') { openQuitConfirm(); return; }

  // Fire Trail Tune Mode: a debug tool for dialing in the Fire power-up's
  // flame alignment by eye, across all 6 batter sprites. Press F to toggle;
  // while active, 0 previews the ready/idle stance and 1-5 the swing frames,
  // arrow keys nudge the flame's x/y offset, and [ / ] rotate it.
  // FIRE_TRAIL_OFFSETS is read directly by getBatFireTransform() every draw,
  // so adjustments here take effect in real gameplay immediately - nothing
  // needs to be copied anywhere.
  if (key === 'f') {
    app.fireTuneActive = !app.fireTuneActive;
    if (app.fireTuneActive) {
      app.batFireVisible = true;
      app.batterFrameIndex = app.fireTuneFrame;
      app.isBatting = app.fireTuneFrame > 0;
    } else {
      app.isBatting = false;
      app.batFireVisible = false;
      app.batterFrameIndex = 0;
    }
    return;
  }
  if (app.fireTuneActive) {
    const off = FIRE_TRAIL_OFFSETS[app.fireTuneFrame];
    if (key >= '0' && key <= '5') {
      app.fireTuneFrame = Number(key);
      app.batterFrameIndex = app.fireTuneFrame;
      app.isBatting = app.fireTuneFrame > 0;
    } else if (key === 'arrowleft') off.x -= 2;
    else if (key === 'arrowright') off.x += 2;
    else if (key === 'arrowup') off.y -= 2;
    else if (key === 'arrowdown') off.y += 2;
    else if (key === '[') off.rot -= 5;
    else if (key === ']') off.rot += 5;
    return;
  }

  const humanPitching = app.activePitcherKey !== 'cpu';
  const humanBatting = app.activeBatterKey !== 'cpu';
  const usesWasd = app.homePitching; // home side always uses WASD, away side always uses arrows

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
      app.isPitching = true;
      if (app.ballSlow) { app.pitch = 'E' + base; app.ballSlow = false; }
      else if (app.ballFast) { app.pitch = 'H' + base; app.ballFast = false; }
      else app.pitch = base;
    }
  }

  // Bug fix: gamblerBatting's startDiceRoll(true) shares the exact same dice
  // state (diceRolling/diceForBatting/diceCount/etc.) as the pitcher's
  // gamblerPitching - the Z-key path is already protected from this via
  // canStartPitch()'s !app.diceRolling check, but the M-key path had no such
  // guard, so activating Gambler's Roll as the batter while the pitcher's
  // own Gambler's Roll was still resolving would stomp its state mid-roll
  // ("Gambler can overpower other gambler"). Block ALL M-powers (not just
  // gamblerBatting) while any dice roll is in progress, matching the Z-key
  // side's guarantee that no power-up can be activated while another is
  // already resolving.
  if (key === 'm' && humanBatting && app.batPowerFull && !app.diceRolling) {
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

  // Pitching powerups: Z arms the power and, unless it plays out as its own
  // self-contained animation (Ghost/Meteor), immediately delivers the pitch
  // with the modifier attached so there is never a window where a second
  // pitch could be thrown mid-effect (see canStartPitch bug fix above).
  if (key === 'z' && humanPitching && app.pitchPowerFull && canStartPitch() && !ghostBalls[0].visible) {
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
  if (app.screen === 'mode') { handleModeClick(x, y); return; }
  if (app.screen === 'characterSolo' || app.screen === 'characterVersus') {
    if (pointInBackButton(x, y)) goBackToModeSelect();
    return;
  }
  if (app.screen === 'mobileCharacterSelect') { handleMobileCharacterSelectTap(x, y); return; }
  if (app.screen === 'mobileDifficultySelect') { handleMobileDifficultySelectTap(x, y); return; }
  if (app.screen === 'gameOver') {
    if (pointInGameOverButton(x, y)) goToCharacterSelectAfterGameOver();
    return;
  }
  if (app.screen !== 'play') return;
  if (app.showQuitConfirm) {
    if (pointInQuitYesButton(x, y)) quitToModeSelect();
    else if (pointInQuitNoButton(x, y)) closeQuitConfirmAndResume();
    return;
  }
  if (IS_MOBILE) { handleMobilePlayTap(x, y); return; }
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
    // through to the normal tap dispatch below.
    if (app.screen === 'play' && !app.showQuitConfirm && app.activeBatterKey !== 'cpu'
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
      app.mode = 'solo'; app.screen = 'mobileCharacterSelect';
      randomizeCharacterCursor('solo');
    }
    return;
  }
  if (x >= toX(125) && x <= toX(275) && y >= toY(250) && y <= toY(330)) {
    app.modeSelectIndex = 1;
    app.mode = 'versus'; app.screen = 'characterVersus';
    randomizeCharacterCursor('versus');
  } else if (x >= toX(125) && x <= toX(275) && y >= toY(70) && y <= toY(150)) {
    app.modeSelectIndex = 0;
    app.mode = 'solo'; app.screen = 'characterSolo';
    randomizeCharacterCursor('solo');
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

// Shared bottom-left prev/next triangle buttons + bottom-right Confirm
// button used by both mobile select screens (mobileCharacterSelect and
// mobileDifficultySelect) - same layout, same hit-testing, only the action
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
// "Play" box in roughly the same spot the desktop "Solo" box occupies.
const PLAY_BUTTON = { x: 125, y: 150, w: 150, h: 90 };
function pointInPlayButton(x, y) {
  return x >= toX(PLAY_BUTTON.x) && x <= toX(PLAY_BUTTON.x) + lenX(PLAY_BUTTON.w)
    && y >= toY(PLAY_BUTTON.y) && y <= toY(PLAY_BUTTON.y) + toLen(PLAY_BUTTON.h);
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
    text('Tap To Play', CANVAS_W / 2, toY(360), 16, 'white', 0.85, 'center', 700);
    return;
  }

  rect(toX(125), toY(70), lenX(150), toLen(80), 'gold', 1,
    app.modeSelectIndex === 0 ? 'white' : null, 5);
  text('Solo', toX(200), toY(110), 46, '#222', 1, 'center', 900);

  rect(toX(125), toY(250), lenX(150), toLen(80), 'gold', 1,
    app.modeSelectIndex === 1 ? 'white' : null, 5);
  text('2 Player', toX(200), toY(290), 32, '#222', 1, 'center', 900);

  // Cursor: a pointer arrow beside whichever option is currently selected
  const cursorY = app.modeSelectIndex === 0 ? 110 : 290;
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

function drawPortraitCard(cx, cy, w, h, charObj, locked, borderColor) {
  rect(cx - w / 2, cy - h / 2, w, h, 'rgba(255,255,255,0.08)', 1, locked ? (borderColor || 'gold') : null, locked ? 5 : 0);
  const img = portraits[charObj.key];
  if (img.complete && img.naturalWidth) {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight) * 0.95;
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2 + 10, iw, ih);
  }
  text(charObj.name, cx, cy - h / 2 - 18, 22, charObj.color, 1, 'center', 700);
  drawShoulderPowerIcons(cx, cy, w, h, charObj);
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
function drawMobileCharacterSelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  text('Choose Your Character', CANVAS_W / 2, toY(40), 30, 'white', 1, 'center', 900);

  const char = CHARACTERS[app.player1Index];
  drawPortraitCard(CANVAS_W / 2, toY(190), lenX(150), toLen(220), char, false, char.color);

  drawBackButton();
  drawMobileNavButtons();
  drawMobileConfirmButton('Confirm');
  text('◀ / ▶ To Browse', CANVAS_W / 2, toY(300), 16, 'white', 0.85, 'center', 700);
}

function handleMobileCharacterSelectTap(x, y) {
  if (pointInBackButton(x, y)) { goBackToModeSelect(); return; }
  if (pointInMobileNavLeft(x, y)) { app.player1Index = (app.player1Index + CHARACTERS.length - 1) % CHARACTERS.length; return; }
  if (pointInMobileNavRight(x, y)) { app.player1Index = (app.player1Index + 1) % CHARACTERS.length; return; }
  if (pointInMobileConfirm(x, y)) { app.player1Locked = true; app.screen = 'mobileDifficultySelect'; }
}

function drawMobileDifficultySelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  text('CPU Difficulty', CANVAS_W / 2, toY(50), 34, 'white', 1, 'center', 900);

  const diffBoxX = toX(125), diffBoxY = toY(120), diffBoxW = lenX(150), diffBoxH = toLen(110);
  rect(diffBoxX, diffBoxY, diffBoxW, diffBoxH, 'rgba(255,255,255,0.08)', 1, 'white', 3);
  text(DIFFICULTY_NAMES[app.difficultyIndex], diffBoxX + diffBoxW / 2, diffBoxY + diffBoxH / 2, 40,
    DIFFICULTY_COLORS[app.difficultyIndex], 1, 'center', 900);

  drawBackButton();

  if (app.difficultyLocked) {
    if (app.readyOpacity < 80) app.readyOpacity = Math.min(80, app.readyOpacity + 5);
    drawReadyOverlay('Tap Anywhere To Start');
  } else {
    drawMobileNavButtons();
    drawMobileConfirmButton('Confirm');
    text('◀ / ▶ To Change', CANVAS_W / 2, toY(300), 16, 'white', 0.85, 'center', 700);
  }
}

function handleMobileDifficultySelectTap(x, y) {
  // Once locked, the ready overlay owns the whole screen - any tap starts
  // the game (readyOpacity's fade-in gate matches desktop's own Enter-To-
  // Start behavior, so a stray tap during the fade doesn't skip it).
  if (app.difficultyLocked) {
    if (app.readyOpacity >= 80) beginGame();
    return;
  }
  if (pointInBackButton(x, y)) { app.screen = 'mobileCharacterSelect'; app.player1Locked = false; app.readyOpacity = 0; return; }
  if (pointInMobileNavLeft(x, y)) { app.difficultyIndex = (app.difficultyIndex + 2) % 3; return; }
  if (pointInMobileNavRight(x, y)) { app.difficultyIndex = (app.difficultyIndex + 1) % 3; return; }
  if (pointInMobileConfirm(x, y)) { app.difficultyLocked = true; }
}

function drawSoloSelect() {
  drawStadium();
  ctx.fillStyle = linearGradient(0, 0, 0, CANVAS_H, ['#8b5a2b', '#cd853f']);
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  rect(0, 0, CANVAS_W, CANVAS_H, null, 1, 'black', 2);

  text('Player', toX(100), toY(50), 34, 'white', 1, 'center', 900);
  text('A / D To Browse   ·   S To Select', toX(100), toY(345), 16, 'white', 0.85);

  const char = CHARACTERS[app.player1Index];
  drawPortraitCard(toX(100), toY(200), lenX(150), toLen(220), char, app.player1Locked, char.color);

  const diffBoxX = toX(225), diffBoxY = toY(140), diffBoxW = lenX(150), diffBoxH = toLen(110);
  rect(diffBoxX, diffBoxY, diffBoxW, diffBoxH, 'rgba(255,255,255,0.08)');
  text('CPU Difficulty', diffBoxX + diffBoxW / 2, diffBoxY + toLen(24), 22, 'white', 1, 'center', 900);
  text(DIFFICULTY_NAMES[app.difficultyIndex], diffBoxX + diffBoxW / 2, diffBoxY + toLen(60), 32, DIFFICULTY_COLORS[app.difficultyIndex], 1, 'center', 900);
  text('Up / Down To Change', diffBoxX + diffBoxW / 2, diffBoxY + toLen(93), 13, 'white', 0.8);

  drawBackButton();

  if (app.player1Locked) {
    if (app.readyOpacity < 80) app.readyOpacity = Math.min(80, app.readyOpacity + 5);
    drawReadyOverlay();
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
  text('P1-Home', toX(50), toY(20), 16, 'red', 1);
  text(String(homeScore), toX(50), toY(58), 35, 'red', 1);
  text('P2-Away', toX(150), toY(20), 16, 'rgb(80,150,220)', 1);
  text(String(awayScore), toX(150), toY(58), 35, 'rgb(90,160,230)', 1);

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

function drawPitchMenu() {
  const entries = app.homePitching
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
// center y=335 - low enough that none of their top edges cross above the
// grass line (y=300, see drawField()), but still in the upper half of the
// grass strip (y:300-400) rather than sitting near the bottom.
const SWING_BUTTON = { x: 315, y: 300, size: 70 };
const POWERUP_BUTTON = { x: 173, y: 307.5, size: 55 }; // batting layout: bottom-center, between joystick and swing
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
    for (const p of PITCH_BUTTONS) {
      if (pointInPitchButton(p, x, y)) { handleGameplayKey(app.homePitching ? p.key : p.arrowKey); return; }
    }
    if (pointInPowerupButton(POWERUP_BUTTON_PITCHING, x, y)) { handleGameplayKey('z'); return; }
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

// A small "Click To Swing" label under the batter, sitting halfway up the
// grass strip (grass runs y 300-400, see drawField()) - only meaningful for
// a human-controlled batter, so that's the only thing gating it. Stays up
// through the swing animation too, same as the crosshair.
function drawSwingHint() {
  if (app.activeBatterKey === 'cpu') return;
  if (IS_MOBILE) return; // the on-screen Swing button (drawMobileControls) replaces this hint

  const label = 'Click To Swing';
  const size = 13;
  const cx = toX(BATTER_READY_META.x) + toLen(25);
  const cy = toY(350);
  const w = textWidth(label, size, 700) + lenX(16);
  const h = toLen(20);
  rect(cx - w / 2, cy - h / 2, w, h, 'black', 0.55);
  text(label, cx, cy, size, 'white', 0.9, 'center', 700);
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

function drawFireTuneOverlay() {
  if (!app.fireTuneActive) return;
  const off = FIRE_TRAIL_OFFSETS[app.fireTuneFrame];
  const frameLabel = app.fireTuneFrame === 0 ? 'Ready Stance' : `Swing Frame ${app.fireTuneFrame}/5`;
  const bx = toX(60), by = toY(140), bw = lenX(280), bh = toLen(75);
  rect(bx, by, bw, bh, 'rgba(0,0,0,0.8)', 1, 'yellow', 2);
  text(`FIRE TUNE - ${frameLabel}`, bx + bw / 2, by + toLen(18), 16, 'yellow', 1, 'center', 700);
  text(`x:${off.x}  y:${off.y}  rot:${off.rot}`, bx + bw / 2, by + toLen(38), 16, 'white', 1, 'center', 700);
  text('0-5 pick frame (0=ready) | arrows nudge x/y | [ ] rotate | F to exit', bx + bw / 2, by + toLen(58), 11, 'white', 0.85, 'center');
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
const GAME_OVER_BTN = { w: 260, h: 65 };
function gameOverButtonRect() {
  return { bx: CANVAS_W / 2 - GAME_OVER_BTN.w / 2, by: CANVAS_H / 2 + 50, bw: GAME_OVER_BTN.w, bh: GAME_OVER_BTN.h };
}
function pointInGameOverButton(x, y) {
  const { bx, by, bw, bh } = gameOverButtonRect();
  return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
}
function drawGameOver() {
  drawStadium();
  rect(0, 0, CANVAS_W, CANVAS_H, 'black', 0.6);

  text('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 90, 46, 'white', 1, 'center', 900);
  text(app.gameOverP1Wins ? 'P1 WINS!' : 'P2 WINS!', CANVAS_W / 2, CANVAS_H / 2 - 30, 30, 'gold', 1, 'center', 900);

  const { bx, by, bw, bh } = gameOverButtonRect();
  rect(bx, by, bw, bh, 'rgba(210,30,30,0.85)', 1, 'white', 2);
  text('Back To Menu', CANVAS_W / 2, by + bh / 2, 20, 'white', 1, 'center', 900);
}

function drawGameplay() {
  drawField();
  drawScoreboard();
  // Desktop's key-hint boxes (WASD/arrows, Z/M) don't mean anything on a
  // touchscreen - drawMobileControls() below is the mobile equivalent.
  if (!IS_MOBILE) { drawPitchMenu(); drawPowerUpUi(); }
  drawSprites();
  drawPowerupEffects();
  drawBall();
  drawGhostBalls(); // ghosts render ON TOP of the real ball so they can disguise it
  drawDiceGame();
  drawCrosshair();
  drawSwingHint();
  drawCallBanner();
  drawFireTuneOverlay();
  drawPauseAnim();
  if (IS_MOBILE) drawMobileControls();
  drawQuitConfirm(); // on top of absolutely everything, including Pause's own freeze overlay
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
  if (app.screen === 'mode') drawModeSelect();
  else if (app.screen === 'characterSolo') drawSoloSelect();
  else if (app.screen === 'characterVersus') drawVersusSelect();
  else if (app.screen === 'mobileCharacterSelect') drawMobileCharacterSelect();
  else if (app.screen === 'mobileDifficultySelect') drawMobileDifficultySelect();
  else if (app.screen === 'play') drawGameplay();
  else if (app.screen === 'gameOver') drawGameOver();
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

function stepCpu() {
  if (app.mode !== 'solo') return;
  if (app.activeBatterKey === 'cpu' && ball.visible && ball.x > toX(300) && !app.cpuSwung) {
    cpuSwing();
  }
  if (app.activePitcherKey === 'cpu') {
    app.spinCount++;
    // Bug fix: this used to only check `=== CPU_PITCH_DELAY_STEPS` on the exact
    // step the counter hit the threshold. If canStartPitch() was blocked right
    // then (call banner, dice roll, or other stop-animation in progress), the
    // counter would blow past the threshold and CPU pitching would just stall
    // for a very long time before retrying. Now it keeps retrying every step
    // once the delay has elapsed, so the CPU pitches the instant it's clear to.
    if (app.spinCount >= CPU_PITCH_DELAY_STEPS) {
      if (canStartPitch()) {
        app.spinCount = 0;
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

  // Pause's drag animation freezes everything else while it plays out -
  // only advance the animation itself and skip the rest of this tick.
  if (app.pauseAnimActive) { stepPauseAnim(); return; }

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

  // Fire Tune Mode freezes on whichever frame is selected - don't let the
  // normal swing animation advance past it.
  if (app.isBatting && !app.fireTuneActive) playAnimation('batter');

  if (ball.xSpeed !== 0) ball.ySpeed -= ball.accel;
  app.prevBallX = ball.x;
  ball.y += ball.ySpeed;
  ball.x += ball.xSpeed;

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
    if (ball.xSpeed < lenX(1)) {
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
  const genuinelyIdle = ball.xSpeed === 0 && !app.isPitching && !app.powerUpActive && !app.pauseAnimActive;
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

requestAnimationFrame(frame);
