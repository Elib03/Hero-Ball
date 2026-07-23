'use strict';

/* ==============================================================================
   POWER-UP EFFECT ASSETS
   Dedicated home for every IN-PLAY power-up visual (the animated effect that
   plays out on the field), as opposed to the small select-icons in
   assets/icons/ (shown in the Z/M power-up UI) or the character art in
   assets/portraits/. Loaded as a separate file/module so effect art can be
   swapped independently of the select-icon set.
   Load this file BEFORE game.js - it exposes everything on window.EFFECTS_LIB.
   ============================================================================== */

const EFFECTS_DIR = 'assets/effects/';

// Every asset created here at parse time gets pushed onto this shared list
// (game.js's loadImage()/loadSound() append to the same one) so
// PokiSDK.gameLoadingFinished() can wait for the actual initial batch to
// finish downloading instead of firing the instant the SDK itself is ready
// - see game.js's POKI SDK section. Assets requested later on demand
// (character sprites, fetched once a match actually starts) are never in
// this array at the time that wait runs, so they don't hold it up.
window.__pokiAssetsToTrack = window.__pokiAssetsToTrack || [];

// Bug fix: same as game.js's loadImage() - local effect assets swapped by
// hand on disk weren't showing up without a hard refresh since the browser
// cached them by URL alone. Cache-bust local files; leave remote URLs as-is.
function loadEffectImage(src) {
  const img = new Image();
  img.src = /^https?:\/\//.test(src) ? src : src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
  window.__pokiAssetsToTrack.push(img);
  return img;
}

const EFFECTS_LIB = {
  // Ghost Ball spawns 3 decoy trails; each slot can point to distinct art once
  // available; for now all 3 fall back to the same placeholder trail image.
  ghostTrails: [
    loadEffectImage(EFFECTS_DIR + 'ghost_trail.png'),
    loadEffectImage(EFFECTS_DIR + 'ghost_trail.png'),
    loadEffectImage(EFFECTS_DIR + 'ghost_trail.png'),
  ],
  meteorProjectile: loadEffectImage(EFFECTS_DIR + 'meteor_projectile.png'),
  droneBallProjectile: loadEffectImage(EFFECTS_DIR + 'drone_ball.png'),
  ballTrail: loadEffectImage(EFFECTS_DIR + 'ball_trail.png'),
  fastballPlusTrail: loadEffectImage(EFFECTS_DIR + 'fastball_plus_trail.png'),
  fireTrail: loadEffectImage(EFFECTS_DIR + 'fire_trail.png'),
  // Translucent overlay drawn on top of the batter while Ice Ball is active.
  iceBallOverlay: loadEffectImage(EFFECTS_DIR + 'ice_ball_overlay.png'),
  // Ice Shield's 3 progressive damage stages, swapped in as it takes hits
  // (fresh -> cracked -> heavily damaged) instead of just a shrinking line.
  iceShieldStages: [
    loadEffectImage(EFFECTS_DIR + 'ice_shield_1.png'),
    loadEffectImage(EFFECTS_DIR + 'ice_shield_2.png'),
    loadEffectImage(EFFECTS_DIR + 'ice_shield_3.png'),
  ],
};

window.EFFECTS_LIB = EFFECTS_LIB;
