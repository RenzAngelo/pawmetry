import { mkdir, readFile, writeFile } from "node:fs/promises";
import { validateAtlas } from "../packages/animation/sprite-atlas.ts";

const cat = new URL("../assets/mascots/cat/", import.meta.url);
const atlas = validateAtlas(JSON.parse(await readFile(new URL("atlas.json", cat), "utf8")), { width: 1024, height: 1280 });
if (!atlas || atlas.frameWidth !== 128 || atlas.frameHeight !== 128 || atlas.facing !== "mirror") throw new Error("Import a validated Cat atlas first.");
const review = new URL("review/", cat);
await mkdir(review, { recursive: true });
await writeFile(new URL("index.html", review), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pawmetry Cat animation review</title>
<style>
:root { color-scheme: dark; font: 15px system-ui; background: #161b1d; color: #edf6f4; }
body { max-width: 1000px; padding: 24px; margin: auto; }
h1, h2 { margin: 0 0 12px; }
a { color: #96e5d3; }
.controls { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-block: 20px; }
button, select { font: inherit; padding: 6px 12px; }
#clips { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
article { border: 1px solid #39514f; border-radius: 10px; padding: 10px; text-align: center; }
article h3 { margin: 0; }
article small { display: block; margin: 3px 0 5px; }
.sprite { width: var(--size, 80px); aspect-ratio: 1; margin: 4px auto; overflow: hidden; position: relative; }
.sprite img { display: block; width: 800%; height: 1000%; image-rendering: pixelated; }
body.left .sprite { transform: scaleX(-1); }
body.guide .sprite::after { content: ''; position: absolute; inset: 87.5% 0 auto; border-top: 1px dotted #24f3ba; }
#contact { margin-top: 32px; }
.contact-row { display: flex; gap: 3px; overflow-x: auto; margin: 5px 0 12px; }
.contact-row .sprite { flex: 0 0 var(--size, 80px); margin: 0; border: 1px solid #3e5d59; }
body.light { background: #e8f3f1; color: #172426; color-scheme: light; }
</style>
<h1>Cat animation review</h1><p><a href="#contact">Jump to the contact sheet</a></p>
<div class="controls">
  <label>Size <select id="size"><option>64</option><option selected>80</option><option>96</option></select> px</label>
  <label><input id="left" type="checkbox"> Face left</label>
  <label><input id="guide" type="checkbox"> Ground guide</label>
  <label><input id="light" type="checkbox"> Light background</label>
  <button id="toggle" aria-pressed="false">Pause loops</button>
</div>
<main id="clips"></main>
<section id="contact"><h2>Contact sheet</h2></section>
<script>
const clips = ${JSON.stringify(Object.entries(atlas.clips))};
const image = (row, frame = 0) => {
  const box = document.createElement('div');
  box.className = 'sprite';
  const picture = new Image();
  picture.alt = '';
  picture.src = '../sprites.png';
  picture.style.transform = position(row, frame);
  box.append(picture);
  return box;
};
const position = (row, frame) => 'translate(' + (-frame * 12.5) + '%, ' + (-row * 10) + '%)';
const animations = [];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
for (const [row, [name, { frames, fps, loop }]] of clips.entries()) {
  const card = document.createElement('article');
  const title = document.createElement('h3'); title.textContent = name;
  const details = document.createElement('small'); details.textContent = frames + ' frames · ' + fps + ' fps';
  const box = image(row);
  card.append(title, box, details);
  document.querySelector('#clips').append(card);
  const keyframes = Array.from({ length: frames + 1 }, (_, i) => ({
    transform: position(row, i < frames ? i : loop ? 0 : frames - 1), easing: 'steps(1, end)'
  }));
  const play = () => box.firstChild.animate(keyframes, { duration: frames * 1000 / fps, iterations: loop ? Infinity : 1, fill: 'forwards' });
  if (loop) {
    const animation = play();
    animations.push(animation);
    if (reduced) animation.pause();
  } else {
    const button = document.createElement('button'); button.textContent = 'Play once';
    let latest;
    button.onclick = () => { latest?.cancel(); latest = play(); };
    card.append(button);
  }
  const label = document.createElement('strong'); label.textContent = name;
  const strip = document.createElement('div'); strip.className = 'contact-row';
  for (let i = 0; i < frames; i++) strip.append(image(row, i));
  document.querySelector('#contact').append(label, strip);
}
for (const name of ['left', 'guide', 'light']) {
  document.querySelector('#' + name).onchange = (event) => document.body.classList.toggle(name, event.target.checked);
}
document.querySelector('#size').onchange = (event) => document.body.style.setProperty('--size', event.target.value + 'px');
let paused = reduced;
const toggle = document.querySelector('#toggle');
const update = () => {
  for (const animation of animations) { if (paused) animation.pause(); else animation.play(); }
  toggle.textContent = paused ? 'Resume loops' : 'Pause loops';
  toggle.setAttribute('aria-pressed', String(paused));
};
toggle.onclick = () => { paused = !paused; update(); };
update();
</script>
</html>`, "utf8");
console.log("Open assets/mascots/cat/review/index.html to compare all ten animations and the contact sheet.");
