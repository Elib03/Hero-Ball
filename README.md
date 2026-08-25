# Hero Ball

A browser baseball game built with vanilla JavaScript and HTML canvas - no engine, no build step, no dependencies. Pick a hero, each with their own signature pitching and batting power-up, and play through a fast, arcade-style baseball match.

Play it live: _(add your hosted URL here once your standalone site is up)_

## Features

- **10 playable heroes**, each with a unique pitching power (Ghost Ball, Meteor, Void, Drone Ball, Spin Cycle, Gambler's Roll, Ball Shrink, Ice Ball, FastballPlus, Mirage) and batting power (Fire, Expand Shot, Blackout Swing, Guaranteed Contact, Mirror Ball, Ice Shield, Future Sight, Pause, and more)
- **Solo mode** (Story or Tournament) against CPU opponents, and local **2-player versus** mode
- **Guided first-time tutorial** that teaches aiming, swinging, pitch timing, and power-ups inside a real first match
- **Skill-based pitching**: arm a pitch type, then time a second press against a moving meter for Easy/Normal/Hard results
- **Progression system**: earn coins from wins, unlock new heroes, and upgrade batting/pitching stats between games
- **Rally difficulty**: the CPU's pitching sharpens up the more runs you score in an inning

## Controls

**Batting:** move the mouse (or joystick on mobile) to aim your crosshair over the ball, then click/tap to swing. Press **M** to use your batting power-up.

**Pitching:** press **W / A / S / D** (or arrow keys for Player 2 in versus mode) to choose a pitch, then press the same key again once the timing meter is in the right zone to throw it. Press **Z** to use your pitching power-up.

## Running locally

No build step - just serve the folder over HTTP (opening `index.html` directly won't work due to browser file-access restrictions):

```bash
python -m http.server 8743
```

Then open `http://localhost:8743` in a browser.

## Tech

Plain JavaScript, HTML5 Canvas, and CSS - `game.js` holds all game logic and rendering, `effects.js` handles visual effect assets, and everything runs client-side with no server or framework required.
