/* =========================================================
   Sivuv Nosaf - page behaviour (vanilla JS, no animation library)
   1. Painted world: generated once, drawn as parallax layers
   2. Pinned scenes: scroll position -> progress -> render(progress)
      - journey: walk to the truck, hand over the box, follow the truck to the centre
      - unbox:   open the box on the sorting table
   3. Inspect steps (scrollytelling)
   4. Sorting station
   5. Summary quiz
   ========================================================= */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a));         // progress inside [a, b]
  const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const DEG = 180 / Math.PI;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  /* Small seeded random generator so the street looks the same on every visit */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  $("#year").textContent = new Date().getFullYear();
  $$("#mainNav .nav-link").forEach((link) => link.addEventListener("click", () => {
    const menu = $("#mainNav");
    if (menu.classList.contains("show") && window.bootstrap) bootstrap.Collapse.getOrCreateInstance(menu).hide();
  }));

  /* =========================================================
     1. THE PAINTED WORLD
     World units: the picture is 800 tall, the sidewalk where people stand is y=700.
     c = camera position along the street. Each layer moves at its own speed.
     ========================================================= */
  const START = 5000;          // camera start (the house is here)
  const ANCHOR = 1000;         // screen x where the family walks
  const LAYERS = [["layerClouds", 0.08], ["layerFar", 0.18], ["layerHills", 0.32], ["layerMid", 0.55], ["layerNear", 1], ["layerFront", 1.35]];
  const layerNodes = LAYERS.map(([id, speed]) => [document.getElementById(id), speed]);
  const reach = (speed) => 1900 + START * speed + 400;   // how far a layer must extend

  function hills(group, o) {
    const r = rng(o.seed), pts = [];
    for (let x = -200; x <= o.max + 200; x += o.step) pts.push([x, o.y - r() * o.amp]);
    let d = `M${pts[0][0]} 820 L${pts[0][0]} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
      d += ` C${mx} ${y0.toFixed(1)} ${mx} ${y1.toFixed(1)} ${x1} ${y1.toFixed(1)}`;
    }
    d += ` L${pts[pts.length - 1][0]} 820Z`;
    el("path", { d, class: o.fill }, group);
    // short brush marks give the flat colour a painted surface
    for (let i = 0, n = Math.floor(o.max / 55); i < n; i++) {
      const x = r() * o.max, y = o.y + 14 + r() * 90;
      el("path", { d: `M${x.toFixed(0)} ${y.toFixed(0)} q18 -12 38 -2`, class: "dab " + o.dab }, group);
    }
  }
  function cloud(group, x, y, s) {
    const g = el("g", { transform: `translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})` }, group);
    el("ellipse", { cx: 0, cy: 14, rx: 98, ry: 16, class: "f-cloud-s" }, g);
    [[-42, 0, 50, 26], [0, -14, 46, 32], [42, -1, 50, 26], [-4, 6, 92, 18]].forEach(([cx, cy, rx, ry]) => el("ellipse", { cx, cy, rx, ry, class: "f-cloud" }, g));
  }
  function tree(group, x, y, s, r) {
    const g = el("g", { transform: `translate(${x.toFixed(0)} ${y}) scale(${s.toFixed(2)})`, class: r() < 0.5 ? "tg1" : "tg2" }, group);
    el("path", { d: "M-6 0 L-3 -64 L3 -64 L6 0Z", class: "f-trunk" }, g);
    if (r() < 0.28) {            // pine
      el("path", { d: "M0 -170 L-44 -92 H44Z M0 -140 L-54 -56 H54Z M0 -108 L-62 -22 H62Z", class: "ta" }, g);
      el("path", { d: "M0 -170 L44 -92 H8Z M0 -140 L54 -56 H10Z M0 -108 L62 -22 H12Z", class: "tb" }, g);
    } else {                      // round canopy
      [[0, -98, 46], [-30, -74, 33], [30, -76, 35]].forEach(([cx, cy, rr]) => el("ellipse", { cx, cy, rx: rr, ry: rr * 0.92, class: "ta" }, g));
      el("ellipse", { cx: 12, cy: -80, rx: 32, ry: 26, class: "tb" }, g);
      el("ellipse", { cx: -16, cy: -112, rx: 18, ry: 11, class: "tc" }, g);
    }
  }
  function farHouse(group, x, y, r) {
    const w = 110 + r() * 70, h = 80 + r() * 60;
    el("rect", { x, y: y - h, width: w, height: h, class: "f-far-house" }, group);
    el("path", { d: `M${x - 10} ${y - h} L${x + w / 2} ${y - h - 46} L${x + w + 10} ${y - h}Z`, class: "f-far-roof" }, group);
    el("rect", { x: x + w * 0.2, y: y - h * 0.65, width: 22, height: 26, class: "f-far-win" }, group);
    el("rect", { x: x + w * 0.62, y: y - h * 0.65, width: 22, height: 26, class: "f-far-win" }, group);
    return w;
  }
  function lamp(group, x) {
    const t = el("g", { transform: `translate(${x} 694)` }, group);
    el("rect", { x: -3.5, y: -200, width: 7, height: 200, class: "f-pole" }, t);
    el("path", { d: "M0 -200 Q-4 -226 -34 -222 L-34 -215 Q-9 -216 -3 -192Z", class: "f-pole" }, t);
    el("rect", { x: -50, y: -224, width: 30, height: 16, rx: 6, class: "f-lamp-glass" }, t);
  }
  function fence(group, x0, x1) {
    const t = el("g", { transform: "translate(0 676)" }, group);
    el("rect", { x: x0, y: -44, width: x1 - x0, height: 6, class: "f-fence" }, t);
    el("rect", { x: x0, y: -20, width: x1 - x0, height: 6, class: "f-fence" }, t);
    for (let x = x0; x < x1; x += 24) el("path", { d: `M${x} 0 V-58 L${x + 6} -68 L${x + 12} -58 V0Z`, class: "f-fence" }, t);
  }
  function bush(group, x, r) {
    const s = 0.8 + r() * 0.6, t = el("g", { transform: `translate(${x} 682) scale(${s.toFixed(2)})` }, group);
    [[-30, -18, 32, 24], [0, -26, 38, 30], [32, -16, 32, 22]].forEach(([cx, cy, rx, ry]) => el("ellipse", { cx, cy, rx, ry, class: "f-bush-a" }, t));
    el("ellipse", { cx: 14, cy: -12, rx: 40, ry: 14, class: "f-bush-b" }, t);
  }
  function buildStreet(group, r) {
    for (let x = 1500; x < 5400; x += 560 + r() * 140) lamp(group, x);
    fence(group, 960, 2300); fence(group, 2760, 3250); fence(group, 3480, 5420);
    for (let x = 1000; x < 5400; x += 260 + r() * 260) if (x < 2300 || x > 2760) bush(group, x, r);
    // mailbox
    const m = el("g", { transform: "translate(3360 694)" }, group);
    el("rect", { x: -3, y: -78, width: 6, height: 78, class: "f-pole" }, m);
    el("path", { d: "M-26 -78 V-104 Q0 -126 26 -104 V-78Z", class: "f-mail" }, m);
    el("path", { d: "M0 -122 Q20 -112 26 -104 V-78 H0Z", class: "f-mail-d" }, m);
    // bus stop sign
    const b = el("g", { transform: "translate(2420 694)" }, group);
    el("rect", { x: -3, y: -190, width: 6, height: 190, class: "f-pole" }, b);
    el("rect", { x: -26, y: -214, width: 52, height: 52, rx: 10, class: "f-awning-a" }, b);
    el("circle", { cy: -188, r: 14, class: "f-cream" }, b);
  }
  function buildRoad(group) {
    for (let x = -500; x < 7000; x += 130) el("rect", { x, y: 760, width: 70, height: 6, rx: 3, class: "f-dash" }, group);
    for (let i = 0; i < 8; i++) el("rect", { x: 2640 + i * 46, y: 713, width: 26, height: 84, class: "f-cross" }, group);   // zebra crossing
  }
  function buildFront(group, r) {
    const max = reach(1.35);
    for (let x = -200; x < max; x += 14 + r() * 14) {
      const h = 28 + r() * 52, lean = (r() - 0.5) * 30;
      el("path", { d: `M${x.toFixed(0)} 806 Q${(x + lean / 2).toFixed(0)} ${(806 - h * 0.6).toFixed(0)} ${(x + lean).toFixed(0)} ${(806 - h).toFixed(0)} Q${(x + lean / 2 + 8).toFixed(0)} ${(806 - h * 0.5).toFixed(0)} ${(x + 12).toFixed(0)} 806Z`, class: r() < 0.5 ? "f-grass1" : "f-grass2" }, group);
      if (r() < 0.05) el("circle", { cx: (x + lean).toFixed(0), cy: (806 - h).toFixed(0), r: 5, class: r() < 0.5 ? "f-flower-a" : "f-flower-b" }, group);
    }
  }
  function buildWorld() {
    const r = rng(11);
    cloudsAndHills(r);
    buildStreet($("#layerStreet"), r);
    buildRoad($("#roadMarks"));
    buildFront($("#layerFront"), r);
  }
  function cloudsAndHills(r) {
    const clouds = $("#layerClouds");
    for (let x = -100; x < reach(0.08); x += 250 + r() * 220) cloud(clouds, x, 60 + r() * 190, 0.8 + r() * 0.9);
    hills($("#layerFar"), { y: 520, amp: 110, step: 280, fill: "f-hill1", dab: "dab1", max: reach(0.18), seed: 3 });
    hills($("#layerHills"), { y: 565, amp: 80, step: 210, fill: "f-hill2", dab: "dab2", max: reach(0.32), seed: 5 });
    const mid = $("#layerMid");
    hills(mid, { y: 600, amp: 50, step: 170, fill: "f-hill3", dab: "dab3", max: reach(0.55), seed: 9 });
    for (let x = 0; x < reach(0.55); x += 70 + r() * 120) {
      if (r() < 0.25) x += farHouse(mid, x, 612, r) + 20;
      else tree(mid, x, 612, 0.8 + r() * 0.55, r);
    }
  }

  /* ---------- people: one builder, two configs, so mother and child match ---------- */
  const PEOPLE = {
    mom: {
      scale: 0.95, leg: 92, legCls: "f-skin", legClsD: "f-skin-d",
      torso: "M-17 -170 Q-26 -140 -36 -92 L36 -92 Q26 -140 17 -170Z", shade: "M2 -170 L17 -170 Q26 -140 36 -92 L2 -92Z",
      torsoCls: "f-dress", shadeCls: "f-dress-d", belt: "M-28 -118 H28 L29 -111 H-29Z",
      head: [-4, -198, 22], hairLong: true, bun: true, shoulder: [-2, -158], arm: 62, armCls: "f-dress-d"
    },
    kid: {
      scale: 0.66, leg: 76, legCls: "f-pants", legClsD: "f-pants-d",
      torso: "M-22 -148 Q-26 -122 -24 -80 L24 -80 Q26 -122 22 -148Z", shade: "M2 -148 L22 -148 Q26 -122 24 -80 L2 -80Z",
      torsoCls: "f-tee", shadeCls: "f-tee-d", belt: null,
      head: [-3, -178, 27], hairLong: false, bun: false, shoulder: [-1, -140], arm: 58, armCls: "f-tee-d"
    }
  };
  function makeLeg(parent, c, back) {
    const hip = el("g", { transform: `translate(0 ${-c.leg})` }, parent), rot = el("g", {}, hip);
    el("path", { d: `M-7 0 L7 0 L5 ${c.leg - 8} L-5 ${c.leg - 8}Z`, class: back ? c.legClsD : c.legCls }, rot);
    el("path", { d: `M-6 ${c.leg - 9} L6 ${c.leg - 9} L8 ${c.leg} L-24 ${c.leg} Q-24 ${c.leg - 6} -6 ${c.leg - 9}Z`, class: "f-shoe" }, rot);
    return rot;
  }
  function makePerson(root, c) {
    const bob = el("g", {}, root);
    const legs = [makeLeg(bob, c, true), makeLeg(bob, c, false)];
    el("path", { d: c.torso, class: c.torsoCls }, bob);
    el("path", { d: c.shade, class: c.shadeCls }, bob);
    if (c.belt) el("path", { d: c.belt, class: c.shadeCls }, bob);
    const [hx, hy, hr] = c.head;
    el("rect", { x: hx - 5, y: hy + hr - 6, width: 10, height: 14, class: "f-skin-d" }, bob);
    el("circle", { cx: hx, cy: hy, r: hr, class: "f-skin" }, bob);
    el("circle", { cx: hx + hr * 0.3, cy: hy + 2, r: hr * 0.2, class: "f-skin-d" }, bob);
    el("path", { d: `M${hx - hr} ${hy} L${hx - hr - 5} ${hy + 7} L${hx - hr + 2} ${hy + 9}Z`, class: "f-skin" }, bob);
    const tail = c.hairLong ? hr * 0.9 : hr * 0.25;
    el("path", { d: `M${hx - hr * 0.92} ${hy - hr * 0.2} A${hr} ${hr} 0 0 1 ${hx + hr} ${hy} L${hx + hr} ${hy + tail} Q${hx + hr * 0.1} ${hy + hr * 0.2} ${hx - hr * 0.2} ${hy - hr * 0.45} Q${hx - hr * 0.7} ${hy - hr * 0.45} ${hx - hr * 0.92} ${hy - hr * 0.2}Z`, class: "f-hair" }, bob);
    if (c.bun) el("circle", { cx: hx + hr * 0.75, cy: hy - hr * 1.0, r: 11, class: "f-hair" }, bob);
    el("circle", { cx: hx - hr * 0.45, cy: hy + 1, r: 2.6, class: "f-eye" }, bob);
    el("path", { d: `M${hx - hr * 0.7} ${hy + hr * 0.5} q4 4 9 0`, class: "f-mouth" }, bob);
    const arm = el("g", { transform: `translate(${c.shoulder[0]} ${c.shoulder[1]})` }, bob), armRot = el("g", {}, arm);
    el("path", { d: `M-6 -3 L6 -3 L5 ${c.arm - 4} L-5 ${c.arm - 4}Z`, class: c.armCls }, armRot);
    el("circle", { cy: c.arm, r: 7, class: "f-skin" }, armRot);
    return { root, bob, legs, armRot, c, bobY: 0 };
  }
  /* Angle (deg) that points a hanging arm from this person's shoulder at a scene point */
  function aimAngle(P, rootX, rootY, tx, ty) {
    const dx = (tx - rootX) / P.c.scale - P.c.shoulder[0];
    const dy = (ty - rootY) / P.c.scale - (P.c.shoulder[1] + P.bobY);
    return Math.atan2(-dx, dy) * DEG;
  }
  function placePerson(P, x, walkPhase, amp, armAngle) {
    const s = P.c.scale, swing = Math.sin(walkPhase) * 26 * amp;
    P.bobY = -Math.abs(Math.sin(walkPhase)) * 5 * amp;
    P.root.setAttribute("transform", `translate(${x.toFixed(1)} 700) scale(${s})`);
    P.bob.setAttribute("transform", `translate(0 ${P.bobY.toFixed(2)})`);
    P.legs[0].setAttribute("transform", `rotate(${(-swing).toFixed(1)})`);
    P.legs[1].setAttribute("transform", `rotate(${swing.toFixed(1)})`);
    P.armRot.setAttribute("transform", `rotate(${armAngle.toFixed(1)})`);
  }

  /* =========================================================
     2a. JOURNEY SCENE
     ========================================================= */
  const world = $("#world"), stage = $("#journeyStage");
  const kid = makePerson($("#kid"), PEOPLE.kid), mom = makePerson($("#mom"), PEOPLE.mom);
  const dom = {
    sun: $("#sun"), truck: $("#truck"), truckBox: $("#truckBox"), carried: $("#boxCarried"), door: $("#doorLeaf"),
    wheelA: $("#truckWheelA"), wheelB: $("#truckWheelB"),
    copy: $("#heroCopy"), hint: $("#hint"), caps: $$(".cap", $("#captions"))
  };
  const view = { x0: 0, w: 1420 };
  const walk = { prevT: 0, amp: 0, cap: -2 };
  const HANDOFF = 1400;                 // camera position where the family meets the truck
  const TRUCK_START = 960 + HANDOFF;    // world x where the truck waits
  const TRUCK_END = 830;                // world x where it stops, just right of the centre's door
  const WHEEL_R = 26, STRIDE = 170;

  function fitJourney(p) {
    const aspect = stage.clientWidth / stage.clientHeight;
    view.w = clamp(800 * aspect, 500, 1800);     // on tall phones the scene is letterboxed into the sky
    let x0 = ANCHOR - view.w * (view.w > 1100 ? 0.62 : view.w > 700 ? 0.6 : 0.5);
    // on narrow screens the camera widens its crop at the end so the door and the truck both fit
    if (view.w < 1000) x0 = lerp(x0, 880 - view.w / 2, easeInOut(seg(p, 0.88, 0.97)));
    world.setAttribute("viewBox", `${x0.toFixed(1)} 0 ${view.w.toFixed(1)} 800`);
    view.x0 = x0;
  }

  function renderJourney(scrollProgress) {
    // Compress the walk while giving the delivery more of the scroll.
    const p = scrollProgress < .43
      ? lerp(0, .58, scrollProgress / .43)
      : lerp(.58, 1, (scrollProgress - .43) / .57);
    // the truck drives from its parking spot to the centre; afterwards the camera follows it
    const drive = easeInOut(seg(p, 0.70, 0.94));
    const truckX = lerp(TRUCK_START, TRUCK_END, drive);
    const c = p < 0.70 ? lerp(START, HANDOFF, easeInOut(seg(p, 0.08, 0.58))) : truckX - 960;   // camera position
    fitJourney(p);

    // parallax: every layer slides at its own speed
    layerNodes.forEach(([g, s]) => g.setAttribute("transform", `translate(${(-c * s).toFixed(1)} 0)`));
    dom.sun.setAttribute("transform", `translate(${(view.x0 + view.w * 0.24).toFixed(0)} ${lerp(260, 190, clamp(1 - c / START)).toFixed(0)})`);

    // people only walk while the scroll moves them; once the box is handed over they stand still
    const travel = START - Math.max(c, HANDOFF);
    walk.amp += (clamp(Math.abs(travel - walk.prevT) / 3) - walk.amp) * 0.25;
    walk.prevT = travel;
    const phaseM = (travel / STRIDE) * 2 * Math.PI, phaseK = phaseM + 1.3;

    // after the handoff the family stays where it stood while the street scrolls on
    const left = Math.max(0, HANDOFF - c), kidX = 920 + left, momX = 1080 + left;

    // arms: reach for the box, hold it, place it on the truck, let go, wave goodbye
    const grab = easeInOut(seg(p, 0.01, 0.07));
    const place = seg(p, 0.58, 0.64);                       // the box hops up and onto the truck bed
    const hop = -Math.sin(Math.PI * place) * 14;
    const release = easeInOut(seg(p, 0.64, 0.68)), wave = easeInOut(seg(p, 0.66, 0.72));
    const flutter = Math.sin(p * 220) * 14, hang = 6;
    const bobBox = (kid.bobY * PEOPLE.kid.scale + mom.bobY * PEOPLE.mom.scale) / 2;
    const kidHeld = lerp(hang, aimAngle(kid, kidX, 700, 958, 612 + bobBox + hop), grab);
    const momHeld = lerp(hang, aimAngle(mom, momX, 700, 1042, 592 + bobBox + hop), grab);
    placePerson(kid, kidX, phaseK, walk.amp, lerp(lerp(kidHeld, hang, release), 160 + flutter, wave));
    placePerson(mom, momX, phaseM, walk.amp, lerp(lerp(momHeld, hang, release), 168 + flutter, wave));

    // the box: carried by the family until it sits on the truck, then it rides along
    const loaded = place >= 1;
    dom.carried.setAttribute("transform", `translate(0 ${(bobBox + hop).toFixed(2)})`);
    dom.carried.style.display = loaded ? "none" : "";
    dom.truckBox.setAttribute("opacity", loaded ? 1 : 0);

    // truck + wheels: rotation = distance driven / radius, with a slight rattle on the road
    const rattle = drive > 0 && drive < 1 ? Math.sin(truckX / 28) * 1.4 : 0;
    dom.truck.setAttribute("transform", `translate(${truckX.toFixed(1)} ${(706 + rattle).toFixed(1)})`);
    const wheelDeg = (truckX / WHEEL_R) * DEG;
    dom.wheelA.setAttribute("transform", `translate(-110 -26) rotate(${wheelDeg.toFixed(1)})`);
    dom.wheelB.setAttribute("transform", `translate(95 -26) rotate(${wheelDeg.toFixed(1)})`);

    // the centre's door swings open as the truck pulls up
    const k = 1 - 0.88 * easeInOut(seg(p, 0.90, 0.96));
    dom.door.setAttribute("transform", `translate(652 0) scale(${k.toFixed(3)} 1) translate(-652 0)`);

    // text overlay
    dom.copy.classList.toggle("is-away", p > 0.06);
    dom.hint.classList.toggle("is-gone", p > 0.01);
    const cap = p < 0.06 ? -1 : p < 0.30 ? 0 : p < 0.56 ? 1 : p < 0.70 ? 2 : 3;
    if (cap !== walk.cap) { dom.caps.forEach((n, i) => n.classList.toggle("is-on", i === cap)); walk.cap = cap; }
    stage.style.setProperty("--p", p.toFixed(4));
  }

  /* =========================================================
     2b. UNBOX SCENE
     ========================================================= */
  const table = $("#table"), unboxStage = $("#unboxStage");
  const UNBOX = [
    { id: "tShirt", to: [215, 392], apex: 170, from: 0.10, dir: -1 },
    { id: "tGame", to: [705, 410], apex: 200, from: 0.26, dir: 1 },
    { id: "tCoat", to: [810, 372], apex: 160, from: 0.42, dir: 1 }
  ].map((o) => Object.assign(o, { node: document.getElementById(o.id) }));
  const tagNodes = $$("#tags .tag"), tagsGroup = $("#tags"), flapL = $("#flapL"), flapR = $("#flapR");
  const unboxLine = $("#unboxLine");
  const BOX_MOUTH = [500, 396];

  function renderUnbox(p) {
    const aspect = unboxStage.clientWidth / unboxStage.clientHeight;
    const vbW = aspect < 0.85 ? 800 : 1000, h = vbW / aspect;       // phones see a tighter crop so items stay big
    table.setAttribute("viewBox", `${500 - vbW / 2} ${(600 - h).toFixed(1)} ${vbW} ${h.toFixed(1)}`);
    const open = easeInOut(seg(p, 0, 0.14));
    flapL.setAttribute("transform", `rotate(${(-open * 118).toFixed(1)} 408 340)`);
    flapR.setAttribute("transform", `rotate(${(open * 118).toFixed(1)} 592 340)`);
    UNBOX.forEach((it) => {
      const u = easeInOut(seg(p, it.from, it.from + 0.28));
      const tx = it.to[0], ty = it.to[1];
      const cx = (BOX_MOUTH[0] + tx) / 2, cy = 2 * it.apex - (BOX_MOUTH[1] + ty) / 2;     // control point so the arc peaks at apex
      const x = (1 - u) * (1 - u) * BOX_MOUTH[0] + 2 * u * (1 - u) * cx + u * u * tx;
      const y = (1 - u) * (1 - u) * BOX_MOUTH[1] + 2 * u * (1 - u) * cy + u * u * ty;
      const sc = lerp(0.45, 1, easeOut(u)), rot = Math.sin(u * Math.PI * 2) * 14 * it.dir;
      it.node.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc.toFixed(3)})`);
      it.tx = tx;
    });
    tagNodes.forEach((t, i) => t.setAttribute("transform", `translate(${UNBOX[i].tx.toFixed(0)} ${492 + (1 - easeOut(seg(p, 0.76 + i * 0.05, 0.9 + i * 0.03))) * -10})`));
    tagsGroup.setAttribute("opacity", seg(p, 0.76, 0.9).toFixed(2));
    unboxLine.textContent = p < 0.2 ? "הקופסה נפתחת על השולחן." : p < 0.75 ? "הפריטים יוצאים אחד אחד." : "בתחנת התרגול כל פריט יגיע לבד על המסוע.";
    unboxStage.style.setProperty("--p", p.toFixed(4));
  }

  /* =========================================================
     2c. PINNED SCENE CONTROLLER
     The pin is a tall box; the stage inside it is sticky. How far we have
     scrolled through the box is the progress, eased a little so it feels smooth.
     ========================================================= */
  function pinScene(pin, stageEl, render, runInScreens) {
    const s = { target: 0, current: 0, raf: 0 };
    const measure = () => pin.style.setProperty("--run", `${(runInScreens * stageEl.clientHeight).toFixed(0)}px`);
    const progress = () => clamp(-pin.getBoundingClientRect().top / Math.max(1, pin.offsetHeight - stageEl.clientHeight));
    const tick = () => {
      s.raf = 0;
      const d = s.target - s.current;
      s.current = Math.abs(d) < 0.0004 ? s.target : s.current + d * 0.16;
      render(s.current);
      if (s.current !== s.target) s.raf = requestAnimationFrame(tick);
    };
    const update = () => { s.target = progress(); if (!s.raf) s.raf = requestAnimationFrame(tick); };
    measure();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", () => { measure(); s.current = s.target = progress(); render(s.current); });
    s.target = s.current = progress();
    render(s.current);
    return s;
  }

  buildWorld();
  if (reduceMotion) {
    // static pictures: no pinning, no motion
    $("#top").classList.add("is-static");
    $("#unbox").classList.add("is-static");
    $("#journeyList").hidden = false;
    renderJourney(0.62);
    renderUnbox(1);
    dom.copy.classList.remove("is-away");
  } else {
    pinScene($("#journeyPin"), stage, renderJourney, 3.8);
    pinScene($("#unboxPin"), unboxStage, renderUnbox, 1.8);
  }

  /* =========================================================
     3. INSPECT STEPS: the step in view drives the coat drawing
     ========================================================= */
  (function initInspectSteps() {
    if (!("IntersectionObserver" in window)) return;
    $$(".inspect-example").forEach(example => {
      const figure = $(".inspect-figure", example), steps = $$(".inspect-step", example);
      $(".inspect-steps", example).classList.add("js-scrolly");
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        steps.forEach(step => step.classList.toggle("is-active", step === entry.target));
        figure.dataset.step = entry.target.dataset.step;
      }), { rootMargin: "-38% 0px -38% 0px" });
      steps.forEach(step => observer.observe(step));
    });
  })();

  /* =========================================================
     4. SORTING STATION
     ========================================================= */
  (function initStation() {
    const stops = $$(".inspection-item"), done = $("#stationDone");
    const cards = stops.map(stop => $(".item-card", stop));
    const template = $("#sortingTemplate");
    const category = {
      give: ["למסירה", "var(--ok)"],
      fix: ["לניקוי או לתיקון", "var(--fix)"],
      reject: ["לארגז הפריטים שאינם מתאימים", "var(--no)"]
    };
    const defaultView = () => ({ yaw: -.28, pitch: .18, zoom: false });
    const travelArt = ["travel-shirt", "travel-coat", "travel-checkers", "travel-memory"];
    const nav = $(".site-nav");
    let frame = 0;

    function arrivalStart(height, stickyTop) {
      const usableHeight = innerHeight - stickyTop;
      return Math.max(stickyTop, innerHeight - Math.min(height * .65, usableHeight * .9));
    }

    function scrollToStation(target) {
      const heading = $("h2, h3", target);
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      const stickyTop = nav.getBoundingClientRect().bottom + 12;
      const machine = $(".sorting-machine", target);
      const top = machine ? arrivalStart(machine.offsetHeight, stickyTop) : stickyTop;
      window.scrollTo({
        top: scrollY + target.getBoundingClientRect().top - top,
        behavior: reduceMotion ? "instant" : "smooth"
      });
    }

    function makeStation(card, index) {
      const stop = stops[index];
      const fragment = template.content.cloneNode(true);
      const ids = new Map();
      $$("[id]", fragment).forEach(node => {
        const original = node.id;
        ids.set(original, node);
        node.id = original + "-" + index;
      });
      $$("use, [fill]", fragment).forEach(node => {
        for (const attribute of ["href", "fill"]) {
          const value = node.getAttribute(attribute);
          if (!value) continue;
          const id = value.match(/^(?:url\()?\#([\w-]+)\)?$/)?.[1];
          if (!ids.has(id)) continue;
          const reference = "#" + ids.get(id).id;
          node.setAttribute(attribute, attribute === "href" ? reference : `url(${reference})`);
        }
      });
      $(".inspection-card-slot", fragment).append(card);
      $(".inspection-kicker", fragment).textContent = `עמדה ${index + 1} מתוך ${cards.length}`;
      stop.append(fragment);

      const machine = ids.get("sortingMachine"), canvas = ids.get("productCanvas");
      const moving = ids.get("movingItem"), crate = ids.get("movingCrate");
      const workbench = $(".sorting-workbench", stop);
      const transit = $(".travel-item", moving);
      $("use", transit).setAttribute("href", "#" + travelArt[index]);
      const entry = ids.get("arrivalPath"), exit = ids.get("departurePath");
      const entryLength = entry.getTotalLength(), exitLength = exit.getTotalLength();
      const controls = $(".inspection-controls", stop), hint = $(".inspection-hint", stop);
      const zoom = $(".model-magnify", stop), next = $(".next-inspection", stop);
      const feedback = $(".item-feedback", card), choices = $$(".choice", card);
      const title = $("h3", card);
      title.tabIndex = -1;
      canvas.setAttribute("aria-label", title.textContent.trim() + " בתלת־ממד");
      const [destination, color] = category[card.dataset.answer];
      crate.style.setProperty("--crate-label", color);
      const [feedbackTitle, feedbackCopy] = ["strong", "span"].map(tag => document.createElement(tag));
      feedback.append(feedbackTitle, feedbackCopy);

      let view = defaultView(), packedAt = null, drag = null;
      let mode = "", viewKey = "", arrived = 0;
      next.textContent = index + 1 < cards.length ? "לעמדה הבאה למטה" : "לסיום המיון";

      function setMode(nextMode) {
        if (mode === nextMode) return;
        mode = nextMode;
        controls.hidden = mode === "packing" || mode === "packed";
        $$("button", controls).forEach(button => { button.disabled = mode !== "ready"; });
        choices.forEach(button => { button.disabled = mode !== "ready"; });
        canvas.tabIndex = mode === "ready" ? 0 : -1;
        canvas.setAttribute("aria-hidden", String(mode !== "ready"));
        moving.classList.toggle("can-inspect", mode === "ready");
        next.hidden = mode !== "packed";
        ids.get("machineCaption").textContent = {
          arrival: "בדרך לעמדה", ready: "בעמדת הבדיקה", packing: "אורזים ומוציאים את הפריט", packed: "יצא " + destination
        }[mode];
        hint.textContent = {
          arrival: "גללו כדי להביא את הפריט לעמדה.",
          ready: "בחרו את הקטגוריה המתאימה כדי להמשיך.",
          packing: "הארגז יוצא מהמסוע.",
          packed: index + 1 < cards.length ? "העמדה הבאה נפתחה. גללו למטה." : "כל ארבעת הפריטים מוינו."
        }[mode];
      }

      function render(now) {
        if (stop.hidden) return false;
        const stickyTop = parseFloat(getComputedStyle(workbench).top) || nav.getBoundingClientRect().bottom;
        const stationBounds = stop.getBoundingClientRect();
        const benchHeight = workbench.getBoundingClientRect().height;
        const run = Math.max(0, stationBounds.height - benchHeight);
        const stationTop = scrollY + stationBounds.top;
        const page = document.scrollingElement;
        // At low zoom the document can end before the bench reaches its sticky limit.
        const arrivalEnd = Math.min(Math.ceil(stationTop - stickyTop + run), page.scrollHeight - page.clientHeight);

        if (mode !== "packed") {
          // Hold at the end of the sticky run. On short screens, let the user
          // reach the controls below the belt once the item is in position.
          const overflow = arrived === 1 ? Math.max(0, benchHeight - (innerHeight - stickyTop)) : 0;
          const limit = arrivalEnd + Math.ceil(overflow);
          if (scrollY > limit) {
            window.scrollTo({ top: limit, behavior: "instant" });
          }
        }

        const bounds = machine.getBoundingClientRect();
        const start = stationTop - arrivalStart(bounds.height, stickyTop);
        const inView = bounds.bottom > stickyTop && bounds.top < innerHeight;
        if (packedAt === null) {
          // Arrival and the end of the sticky run share the same scroll position.
          arrived = reduceMotion || scrollY >= arrivalEnd - 1 ? 1
            : easeInOut(seg(scrollY, start, arrivalEnd));
        }
        const elapsedPacking = packedAt === null ? 0 : now - packedAt;
        const packed = packedAt === null ? 0 : reduceMotion ? 1 : seg(elapsedPacking, 0, 400);
        const outgoing = packedAt === null ? 0 : reduceMotion ? 1 : seg(elapsedPacking, 400, 1440);
        const point = outgoing > 0 ? exit.getPointAtLength(outgoing * exitLength)
          : entry.getPointAtLength(lerp(82, entryLength, arrived));
        moving.style.left = point.x / 5.6 + "%";
        moving.style.top = point.y / 4.2 + "%";
        moving.style.setProperty("--object-scale", lerp(.62, 1, arrived) * (1 - packed * .23));
        moving.style.setProperty("--packing", easeInOut(packed));
        const reveal = seg(arrived, .79, .99);
        transit.style.opacity = 1 - reveal;
        canvas.style.opacity = reveal * (1 - seg(packed, .52, .93));
        crate.style.opacity = seg(packed, 0, .25) * (1 - seg(outgoing, .88, 1));
        ids.get("arrivalRollers").style.strokeDashoffset = -arrived * entryLength;
        ids.get("departureRollers").style.strokeDashoffset = -outgoing * exitLength;
        if (packedAt !== null) {
          if (outgoing === 1 && mode !== "packed") {
            const following = stops[index + 1];
            if (following) following.hidden = false;
            else done.hidden = false;
            setMode("packed");
            if (document.activeElement === feedback) next.focus({ preventScroll: true });
          } else if (outgoing < 1) {
            setMode("packing");
          }
        } else {
          setMode(arrived === 1 ? "ready" : "arrival");
        }

        const key = [view.yaw, view.pitch, view.zoom, canvas.clientWidth, canvas.clientHeight].join("/");
        if (inView && reveal > 0 && packed < 1 && key !== viewKey) {
          window.donationModels.draw(canvas, index, view.yaw, view.pitch, view.zoom ? 1.35 : 1);
          viewKey = key;
        }
        return packedAt !== null && outgoing < 1;
      }

      function rotate(yaw, pitch) {
        if (mode !== "ready") return;
        view.yaw = (view.yaw + yaw) % (Math.PI * 2);
        view.pitch = clamp(view.pitch + pitch, -Math.PI / 2, Math.PI / 2);
        queue();
      }

      canvas.addEventListener("pointerdown", event => {
        if (mode !== "ready" || event.button !== 0 || drag) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener("pointermove", event => {
        if (drag?.id !== event.pointerId) return;
        rotate((event.clientX - drag.x) * .018, (drag.y - event.clientY) * .014);
        drag.x = event.clientX;
        drag.y = event.clientY;
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => {
        canvas.addEventListener(type, event => {
          if (drag?.id === event.pointerId) drag = null;
        });
      });
      canvas.addEventListener("keydown", event => {
        const turns = { ArrowLeft: [-.45,0], ArrowRight: [.45,0], ArrowUp: [0,.35], ArrowDown: [0,-.35] };
        if (!Object.hasOwn(turns, event.key)) return;
        event.preventDefault();
        rotate(...turns[event.key]);
      });
      $$("[data-yaw], [data-pitch]", controls).forEach(button => {
        button.addEventListener("click", () => rotate(
          Number(button.dataset.yaw || 0) / DEG, Number(button.dataset.pitch || 0) / DEG
        ));
      });
      zoom.addEventListener("click", () => {
        view.zoom = !view.zoom;
        zoom.setAttribute("aria-pressed", String(view.zoom));
        zoom.textContent = view.zoom ? "הקטנה" : "הגדלה";
        queue();
      });

      choices.forEach(button => button.addEventListener("click", () => {
        if (mode !== "ready") return;
        choices.forEach(choice => { choice.classList.toggle("is-chosen", choice === button); });
        const choice = button.dataset.choice;
        const correct = choice === card.dataset.answer;
        feedback.dataset.result = correct ? "correct" : "retry";
        feedbackTitle.textContent = correct ? "נכון. הפריט נארז " + destination + "." : "הפריט נשאר בעמדה. נסו שוב.";
        feedbackCopy.textContent = correct ? card.dataset.ok.replace(/^נכון\.\s*/, "") : card.dataset.hint.replace(/^בדקו שוב:\s*/, "");
        if (!correct) return;

        packedAt = performance.now();
        const count = $(`.bin[data-bin="${choice}"] .n`);
        count.textContent = Number(count.textContent) + 1;
        setMode("packing");
        feedback.tabIndex = -1;
        feedback.focus({ preventScroll: true });
        const belt = machine.getBoundingClientRect();
        const exitY = belt.top + belt.height * 248 / 420;
        const headerBottom = nav.getBoundingClientRect().bottom;
        if (exitY < headerBottom + 60 || exitY > innerHeight - 60) {
          window.scrollTo({ top: scrollY + exitY - (headerBottom + innerHeight) / 2, behavior: "instant" });
        }
        queue();
      }));
      next.addEventListener("click", () => {
        const target = stops[index + 1] || done;
        scrollToStation(target);
      });

      return {
        render,
        reset() {
          packedAt = null;
          arrived = 0;
          stop.hidden = index !== 0;
          view = defaultView();
          zoom.setAttribute("aria-pressed", "false");
          zoom.textContent = "הגדלה";
          delete feedback.dataset.result;
          feedbackTitle.textContent = "";
          feedbackCopy.textContent = "";
          choices.forEach(choice => choice.classList.remove("is-chosen"));
        }
      };
    }

    const stations = cards.map(makeStation);
    function render(now) {
      frame = 0;
      const animating = stations.map(station => station.render(now)).some(Boolean);
      if (animating) queue();
    }

    function queue() {
      if (!frame) frame = requestAnimationFrame(render);
    }

    $("#stationReset").addEventListener("click", () => {
      stations.forEach(station => station.reset());
      $$(".bin .n").forEach(count => { count.textContent = "0"; });
      done.hidden = true;
      scrollToStation(stops[0]);
      queue();
    });
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    queue();
  })();

})();
