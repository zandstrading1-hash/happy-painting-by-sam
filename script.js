/* =========================================================
   HAPPY PAINTING BY SAM: motion + interactions
   Vanilla JS, no dependencies.
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const root = document.documentElement;
  const body = document.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const desktop = matchMedia('(min-width: 901px)');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = t => -(Math.cos(Math.PI * t) - 1) / 2;

  let vw = innerWidth;
  let vh = innerHeight;

  /* ---------------------------------------------------------
     Drips (footer)
     --------------------------------------------------------- */
  function buildDrips(svg, o) {
    if (!svg) return;
    const W = Math.max(320, Math.round(svg.getBoundingClientRect().width || vw));
    const H = Math.round(svg.getBoundingClientRect().height || 120);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let s = o.seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const b = o.base;
    let d = `M0 ${b} `;
    for (let x = 0; x < W; x += 50) d += `Q${x + 25} ${b + 2 + rnd() * 9} ${x + 50} ${b} `;
    d += `V-2 H0Z`;
    let out = `<path d="${d}"/>`;
    const n = Math.round((W / 1400) * o.count) + 3;
    for (let i = 0; i < n; i++) {
      const x = (i + .15 + rnd() * .7) * (W / n);
      const r = o.minW / 2 + rnd() * (o.maxW - o.minW) / 2;
      const nk = r * .62;
      const L = o.minL + rnd() * (o.maxL - o.minL);
      const p = `M${x - nk - 7} ${b - 1}Q${x - nk} ${b} ${x - nk} ${b + 6}C${x - nk} ${b + L * .55} ${x - r} ${b + L * .62} ${x - r} ${b + L - r}A${r} ${r} 0 0 0 ${x + r} ${b + L - r}C${x + r} ${b + L * .62} ${x + nk} ${b + L * .55} ${x + nk} ${b + 6}Q${x + nk} ${b} ${x + nk + 7} ${b - 1}Z`;
      out += `<path class="d" d="${p}" style="--t:${(3 + rnd() * 4).toFixed(2)}s;--dl:${(-rnd() * 5).toFixed(2)}s;--grow:${(1.4 + rnd() * 1.8).toFixed(2)}"/>`;
    }
    svg.innerHTML = out;
  }
  const footDrips = $('.drips--foot');
  buildDrips(footDrips, { seed: 7, base: 12, count: 16, minW: 12, maxW: 30, minL: 24, maxL: 112 });

  /* ---------------------------------------------------------
     Split headings into words
     --------------------------------------------------------- */
  $$('.split').forEach(el => {
    let i = 0;
    const walk = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  });

  /* stagger groups */
  [['.tiles', '.tile'], ['.direct', '.direct-card']].forEach(([g, c]) => {
    $$(g).forEach(group => $$(c, group).forEach((el, i) => el.style.setProperty('--d', `${(i % 3) * 0.1}s`)));
  });
  $$('.shot').forEach((el, i) => el.style.setProperty('--d', `${(i % 3) * 0.09}s`));
  $$('.map .pin').forEach((el, i) => el.style.setProperty('--d', `${i * 0.18}s`));
  $$('.map .pin').forEach((el, i) => { el.style.transitionDelay = `${0.3 + i * 0.12}s`; });

  /* ---------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal, .shot, .map-wrap').forEach(el => io.observe(el));

  /* ---------------------------------------------------------
     Hero paint canvas: autonomous brush strokes + mouse painting
     --------------------------------------------------------- */
  const heroPaint = (() => {
    const cvs = $('.hero-paint');
    if (!cvs || !cvs.getContext) return null;
    const ctx = cvs.getContext('2d');
    const hero = $('.hero');
    const INK = '#0a0b0d';
    const PALETTE = ['#f28a2e', '#1fa3ad', '#f6f1e8', '#46cdd5', '#ffc94a', '#f28a2e', '#0e6c76', '#1fa3ad'];
    let W = 0, H = 0, dpr = 1;
    let strokes = [];
    let painted = 0, pIdx = 0, last = 0, raf = 0;
    let running = false, visible = true;
    let mouseStroke = null, lastMouse = 0, mouseColor = PALETTE[0];

    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const shade = (rgb, d) => `rgb(${rgb.map(v => Math.round(clamp(v + d, 0, 255))).join(',')})`;

    function resize() {
      const r = cvs.getBoundingClientRect();
      const nw = Math.round(r.width), nh = Math.round(r.height);
      if (W && nw === W && Math.abs(nh - H) < 140) return;
      let snap = null;
      if (W && H) {
        snap = document.createElement('canvas');
        snap.width = cvs.width; snap.height = cvs.height;
        snap.getContext('2d').drawImage(cvs, 0, 0);
      }
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = nw; H = nh;
      cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
      if (snap) ctx.drawImage(snap, 0, 0, snap.width / dpr, snap.height / dpr);
      ctx.lineCap = 'round';
    }

    class Stroke {
      constructor(color, width, maxLen, dry = 0.62) {
        const rgb = hexRgb(color);
        const n = Math.max(12, Math.round(width / 1.8));
        this.b = Array.from({ length: n }, (_, i) => ({
          o: (i / (n - 1) - 0.5) * width + (Math.random() - 0.5) * 2.5,
          a: 0.55 + Math.random() * 0.45,
          life: dry + Math.random() * 0.5,
          lw: 1.7 + Math.random() * 2.8,
          c: shade(rgb, (Math.random() - 0.5) * (color === INK ? 10 : 48)),
        }));
        this.maxLen = maxLen; this.len = 0; this.prev = null; this.pn = null; this.done = false;
      }
      to(x, y) {
        if (this.done) return;
        const p = this.prev;
        if (!p) { this.prev = { x, y }; return; }
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
        if (d < 0.7) return;
        const n = { x: -dy / d, y: dx / d };
        const pn = this.pn || n;
        const k0 = Math.min(1, this.len / 46 + 0.3);
        this.len += d;
        const k1 = Math.min(1, this.len / 46 + 0.3);
        const t = this.len / this.maxLen;
        for (const b of this.b) {
          if (t > b.life) continue;
          ctx.globalAlpha = b.a * (1 - Math.pow(t / b.life, 3));
          ctx.strokeStyle = b.c;
          ctx.lineWidth = b.lw;
          ctx.beginPath();
          ctx.moveTo(p.x + pn.x * b.o * k0, p.y + pn.y * b.o * k0);
          ctx.lineTo(x + n.x * b.o * k1, y + n.y * b.o * k1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        this.prev = { x, y }; this.pn = n;
        if (t > 1.6) this.done = true;
      }
    }

    function pick() {
      painted++;
      if (painted > 6 && Math.random() < 0.34) return INK;
      return PALETTE[pIdx++ % PALETTE.length];
    }

    function auto(o = {}) {
      const color = o.color || pick();
      const small = W < 700;
      const width = o.width || (small ? 46 + Math.random() * 60 : 70 + Math.random() * 120) * (color === INK ? 1.5 : 1);
      const fromLeft = o.fromLeft ?? Math.random() < 0.5;
      const y0 = o.y != null ? o.y * H : H * (0.08 + Math.random() * 0.84);
      const x0 = fromLeft ? -40 : W + 40;
      const len = (o.len || 0.6 + Math.random() * 0.6) * W;
      const ang = (Math.random() - 0.5) * 0.55 + (fromLeft ? 0 : Math.PI);
      const amp = 16 + Math.random() * 54, freq = 0.6 + Math.random() * 1.3, ph = Math.random() * 6;
      const s = new Stroke(color, width, len * 0.95, color === INK ? 0.9 : 0.6);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      s.path = t => {
        const dist = t * len;
        const off = Math.sin(t * Math.PI * freq + ph) * amp;
        return [x0 + ca * dist - sa * off, y0 + sa * dist + ca * off];
      };
      s.t = 0;
      s.speed = o.speed || 1300 + Math.random() * 900;
      s.dur = len / s.speed;
      s.delay = o.delay || 0;
      strokes.push(s);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      for (const s of strokes) {
        if (s.delay > 0) { s.delay -= dt; continue; }
        const p0 = s.t;
        s.t = Math.min(1, s.t + dt / s.dur);
        const steps = Math.max(1, Math.ceil(((s.t - p0) * s.dur * s.speed) / 8));
        for (let i = 1; i <= steps; i++) {
          const [x, y] = s.path(p0 + ((s.t - p0) * i) / steps);
          s.to(x, y);
        }
        if (s.t >= 1) s.done = true;
      }
      strokes = strokes.filter(s => !s.done);
      if (!strokes.length) pause();
    }

    function play() {
      if (running || !visible || document.hidden) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function pause() { running = false; cancelAnimationFrame(raf); }

    function start() {
      resize();
      if (reduce) {
        // a single still composition, no animation
        [['#f28a2e', .62, true], ['#1fa3ad', .36, false], ['#f6f1e8', .8, true]].forEach(([c, y, l]) => {
          auto({ color: c, y, fromLeft: l, len: 1.1, width: 120 });
          const s = strokes[strokes.length - 1];
          for (let i = 0; i <= 200; i++) { const [x, yy] = s.path(i / 200); s.to(x, yy); }
        });
        strokes = [];
        return;
      }
      const small = W < 700;
      auto({ color: '#f28a2e', y: small ? 0.56 : 0.64, fromLeft: true, len: 1.15, width: small ? 110 : 190, speed: 2100 });
      auto({ color: '#1fa3ad', y: small ? 0.3 : 0.34, fromLeft: false, len: 1.1, width: small ? 90 : 150, speed: 1900, delay: 0.25 });
      auto({ color: '#f6f1e8', y: 0.84, fromLeft: true, len: 0.9, width: small ? 30 : 46, speed: 2300, delay: 0.55 });
      auto({ color: '#ffc94a', y: 0.14, fromLeft: true, len: 0.8, width: small ? 40 : 64, speed: 2000, delay: 0.85 });
      painted = 4;
      play();
    }

    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && strokes.length) play(); else pause();
    }).observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (strokes.length) play(); });

    if (fine && !reduce) {
      hero.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const r = cvs.getBoundingClientRect();
        const now = performance.now();
        if (!mouseStroke || mouseStroke.done || now - lastMouse > 220) {
          mouseColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];
          mouseStroke = new Stroke(mouseColor, 34 + Math.random() * 26, 1300, 0.7);
          root.style.setProperty('--paint', mouseColor);
        }
        lastMouse = now;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        (evs.length ? evs : [e]).forEach(ev => mouseStroke.to(ev.clientX - r.left, ev.clientY - r.top));
      }, { passive: true });
    }

    return { start, resize: () => { W && resize(); } };
  })();

  /* ---------------------------------------------------------
     Page ready (once fonts are in, so the headline wipe uses them)
     --------------------------------------------------------- */
  let started = false;
  function ready() {
    if (started) return;
    started = true;
    body.classList.add('is-ready');
    heroPaint && heroPaint.start();
  }
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 800))]).then(ready);

  /* ---------------------------------------------------------
     Header + mobile menu
     --------------------------------------------------------- */
  const header = $('.header');
  const burger = $('.burger');
  const menu = $('#menu');
  const setMenu = open => {
    body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', String(!open));
    root.style.overflow = open ? 'hidden' : '';
  };
  if (burger && menu) {
    burger.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
    addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('menu-open')) setMenu(false); });
  }

  /* fit the hero badge text exactly around its circle */
  const fitBadge = () => {
    const t = $('.badge-ring text');
    if (!t || !t.getComputedTextLength) return;
    t.style.letterSpacing = '0px';
    const extra = (2 * Math.PI * 78 - t.getComputedTextLength()) / t.textContent.length;
    t.style.letterSpacing = `${extra.toFixed(2)}px`;
  };
  fitBadge();

  /* ---------------------------------------------------------
     Service panels (home)
     --------------------------------------------------------- */
  const panels = $$('.svc');
  const measurePanels = () => panels.forEach(p => {
    const b = $('.svc-body', p);
    if (b) p.style.setProperty('--bh', `${b.offsetHeight}px`);
  });
  const openPanel = p => panels.forEach(x => x.classList.toggle('is-open', x === p));
  let hoverT = 0;
  panels.forEach(p => {
    p.addEventListener('mouseenter', () => {
      if (!desktop.matches) return;
      clearTimeout(hoverT);
      hoverT = setTimeout(() => openPanel(p), 70);
    });
    p.addEventListener('mouseleave', () => clearTimeout(hoverT));
    p.addEventListener('focusin', () => desktop.matches && openPanel(p));
    p.addEventListener('click', () => desktop.matches && openPanel(p));
  });
  measurePanels();

  /* ---------------------------------------------------------
     Colour Lab
     --------------------------------------------------------- */
  (() => {
    const room = $('.room');
    if (!room) return;
    const wallBase = $('#wallBase', room);
    const wallNew = $('#wallNew', room);
    const rcs = $$('.rc', room);
    const rollerG = $('#labRoller', room);
    const lab = room.closest('.lab');
    const sws = $$('.sw', lab);
    const stage = $('.lab-stage', lab);
    const cta = $('.lab-cta', lab);
    const nameEl = $('.lab-name', lab), hexEl = $('.lab-hex', lab), chip = $('.lab-chip', lab), status = $('.lab-status', lab);
    const COLS = 6, WH = 470, CW = 167;
    let busy = false, queued = null, touched = false;

    const setStatus = (t, cls) => { status.textContent = t; status.className = `lab-status ${cls || ''}`; };

    function roll(color) {
      if (busy) { queued = color; return; }
      busy = true;
      wallNew.setAttribute('fill', color);
      room.style.setProperty('--roll', color);
      rcs.forEach(r => { r.setAttribute('y', 0); r.setAttribute('height', 0); });
      setStatus('Rolling…', 'is-busy');
      const dur = reduce ? 1 : 1800;
      const t0 = performance.now();
      rollerG.setAttribute('opacity', reduce ? 0 : 1);
      const step = now => {
        const t = clamp((now - t0) / dur);
        const f = Math.min(t * COLS, COLS - 1e-6);
        const i = Math.floor(f);
        const e = easeInOut(f - i);
        rcs.forEach((r, k) => {
          if (k < i) { r.setAttribute('y', 0); r.setAttribute('height', WH); }
          else if (k > i) r.setAttribute('height', 0);
        });
        const down = i % 2 === 0;
        const h = t >= 1 ? WH : e * WH;
        rcs[i].setAttribute('height', h);
        rcs[i].setAttribute('y', down ? 0 : WH - h);
        const ry = clamp(down ? h : WH - h, 22, WH - 22);
        rollerG.setAttribute('transform', `translate(${i * CW + CW / 2} ${ry}) rotate(${Math.sin(now / 90) * 1.5})`);
        if (t < 1) requestAnimationFrame(step);
        else {
          wallBase.setAttribute('fill', color);
          rcs.forEach(r => r.setAttribute('height', 0));
          rollerG.setAttribute('opacity', 0);
          setStatus('Fresh coat ✓', 'is-done');
          busy = false;
          if (queued) { const q = queued; queued = null; roll(q); }
        }
      };
      requestAnimationFrame(step);
    }

    function select(btn, user = true) {
      if (user) touched = true;
      sws.forEach(x => x.setAttribute('aria-checked', String(x === btn)));
      const c = getComputedStyle(btn).getPropertyValue('--c').trim();
      nameEl.textContent = btn.dataset.name;
      hexEl.textContent = c.toUpperCase();
      chip.style.setProperty('--c', c);
      if (cta && touched) cta.href = `contact.html?type=Interior&colour=${encodeURIComponent(btn.dataset.name)}`;
      roll(c);
    }
    sws.forEach(x => x.addEventListener('click', () => select(x)));
    stage.addEventListener('click', () => {
      const i = sws.findIndex(x => x.getAttribute('aria-checked') === 'true');
      select(sws[(i + 1) % sws.length]);
    });
    $$('.tt', lab).forEach(b => b.addEventListener('click', () => {
      $$('.tt', lab).forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      room.style.setProperty('--trim', b.dataset.trim);
    }));

    // one demo roll the first time the room is on screen
    new IntersectionObserver(([e], obs) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      setTimeout(() => { if (!touched) select(sws[0], false); }, 700);
    }, { threshold: 0.45 }).observe(stage);
  })();

  /* ---------------------------------------------------------
     Paint your own room (colour lab page)
     Fills the tapped wall and repaints it, keeping the photo's
     light and shadow. Brush and eraser for touch-ups. All in
     the browser: the photo is never uploaded.
     --------------------------------------------------------- */
  (() => {
    const sec = $('.myroom');
    if (!sec) return;
    const cv = $('.mr-canvas', sec), ctx = cv.getContext('2d', { willReadFrequently: true });
    const empty = $('.mr-empty', sec), note = $('.mr-note', sec);
    const sws = $$('.sw', sec);
    const custom = $('.mr-custom', sec), customIn = $('input', custom);
    const nameEl = $('.mr-name', sec), hexEl = $('.mr-hex', sec), status = $('.mr-status', sec);
    const modeBs = $$('.mr-modes .tt', sec);
    const spread = $('.mr-spread', sec), tolIn = $('.mr-tol', sec);
    const sizeWrap = $('.mr-size', sec), sizeIn = $('input', sizeWrap);
    const undoB = $('.mr-undo', sec), beforeB = $('.mr-before', sec), resetB = $('.mr-reset', sec), saveB = $('.mr-save', sec);
    const cta = $('.mr-cta', sec), uploadTxt = $('.mr-upload-txt', sec);
    const MAX = 1400;

    let W = 0, H = 0, orig = null, out = null;
    let Y, sY, sCb, sCr, G;        // luma, blurred luma/chroma for matching, edge strength
    let layer = null;              // per pixel: index into layers, -1 = unpainted
    let layers = [];               // { hex, meanY }
    let history = [];              // { idx, prev, added }
    let selected = -1, last = null, mode = 'fill', stroke = null, frame = 0;
    let cur = { name: 'Happy Teal', hex: '#1fa3ad' };

    const setStatus = (t, cls) => { status.textContent = t; status.className = `lab-status mr-status ${cls || ''}`; };
    const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

    function showColour() {
      nameEl.textContent = cur.name;
      hexEl.textContent = cur.hex.toUpperCase();
      custom.style.setProperty('--c', cur.hex);
      const pick = sws.some(s => s.dataset.name === cur.name) ? cur.name : `${cur.name} ${cur.hex.toUpperCase()}`;
      cta.href = `contact.html?type=Interior&colour=${encodeURIComponent(pick)}`;
    }

    function setColour(name, hex) {
      cur = { name, hex };
      showColour();
      if (selected >= 0 && mode === 'fill') { layers[selected].hex = hex; render(); setStatus('Repainted ✓', 'is-done'); }
    }

    function blur(src, rad = 1) {
      const a = new Float32Array(src.length), b = new Float32Array(src.length), k = 2 * rad + 1;
      for (let y = 0; y < H; y++) {
        const r = y * W;
        for (let x = 0; x < W; x++) {
          let s = 0;
          for (let o = -rad; o <= rad; o++) s += src[r + clamp(x + o, 0, W - 1)];
          a[r + x] = s / k;
        }
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0;
        for (let o = -rad; o <= rad; o++) s += a[clamp(y + o, 0, H - 1) * W + x];
        b[y * W + x] = s / k;
      }
      return b;
    }

    function load(file) {
      if (!file || !/^image\//.test(file.type)) { setStatus('Use a photo', 'is-busy'); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        W = cv.width = Math.round(img.naturalWidth * s);
        H = cv.height = Math.round(img.naturalHeight * s);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        orig = ctx.getImageData(0, 0, W, H);
        out = new ImageData(new Uint8ClampedArray(orig.data), W, H);
        const n = W * H, d = orig.data;
        Y = new Float32Array(n); const Cb = new Float32Array(n), Cr = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
          Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
          Cb[i] = 0.564 * (b - Y[i]);
          Cr[i] = 0.713 * (r - Y[i]);
        }
        sY = blur(Y); sCb = blur(Cb); sCr = blur(Cr);
        // edge strength measured over +-2px on a smoother copy: lighting changes slowly and
        // JPEG noise averages out, while corners and trim still change within a few pixels
        const gY = blur(blur(Y, 2), 2), gCb = blur(blur(Cb, 2), 2), gCr = blur(blur(Cr, 2), 2);
        G = new Float32Array(n).fill(255);
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
          const i = y * W + x, a = i - 2, b = i + 2, u = i - 2 * W, d = i + 2 * W;
          G[i] = Math.abs(gY[b] - gY[a]) + Math.abs(gY[d] - gY[u]) + 1.5 * (Math.abs(gCb[b] - gCb[a]) + Math.abs(gCb[d] - gCb[u]) + Math.abs(gCr[b] - gCr[a]) + Math.abs(gCr[d] - gCr[u]));
        }
        layer = new Int16Array(n).fill(-1);
        layers = []; history = []; selected = -1; last = null;
        cv.hidden = false; empty.hidden = true; note.hidden = false;
        uploadTxt.textContent = 'Use a different photo';
        [beforeB, saveB].forEach(b => { b.disabled = false; });
        syncButtons();
        setStatus(mode === 'fill' ? 'Tap a wall' : 'Paint with your finger');
      };
      img.onerror = () => { URL.revokeObjectURL(url); setStatus('Can’t read that photo', 'is-busy'); };
      img.src = url;
    }

    // grow a region from (x, y), stopping at sharp edges. Shading across one wall can vary as much
    // as two walls differ from each other, so the seed colour is only a loose limit.
    function region(x, y, tol) {
      const n = W * H, seed = y * W + x;
      let mY = 0, mCb = 0, mCr = 0, k = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const j = clamp(y + dy, 0, H - 1) * W + clamp(x + dx, 0, W - 1);
        mY += sY[j]; mCb += sCb[j]; mCr += sCr[j]; k++;
      }
      mY /= k; mCb /= k; mCr /= k;
      const edge = 2 + tol * 0.2, lum = 0.9 + tol / 40, c2 = (tol * 0.6) ** 2, lmY = Math.log(mY + 4);
      const inR = new Uint8Array(n), q = new Int32Array(n);
      let head = 0, tail = 0;
      inR[seed] = 1; q[tail++] = seed;
      while (head < tail) {
        const c = q[head++], cx = c % W;
        const nb = [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, c >= W ? c - W : -1, c < n - W ? c + W : -1];
        for (const j of nb) {
          if (j < 0 || inR[j]) continue;
          if (G[j] > edge) continue;
          const b = sCb[j] - mCb, r = sCr[j] - mCr;
          if (b * b + r * r > c2 || Math.abs(Math.log(sY[j] + 4) - lmY) > lum) continue;
          inR[j] = 1; q[tail++] = j;
        }
      }
      // edges are measured over a few pixels, so the fill stops short of trim and corners.
      // creep up to 3px further into pixels that still match the wall colour.
      for (let pass = 0; pass < 3; pass++) {
        const grow = [];
        for (let k = 0; k < tail; k++) {
          const c = q[k], cx = c % W;
          const nb = [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, c >= W ? c - W : -1, c < n - W ? c + W : -1];
          for (const j of nb) {
            if (j < 0 || inR[j]) continue;
            const b = sCb[j] - sCb[c], r = sCr[j] - sCr[c];
            if (b * b + r * r > c2 / 4 || Math.abs(Math.log(sY[j] + 4) - Math.log(sY[c] + 4)) > 0.18) continue;
            inR[j] = 2; grow.push(j);
          }
        }
        grow.forEach(j => { q[tail++] = j; });
      }
      // fill pinholes left by texture and noise
      const add = [];
      for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) {
        const i = yy * W + xx;
        if (inR[i]) continue;
        const s = inR[i - 1] + inR[i + 1] + inR[i - W] + inR[i + W] + inR[i - W - 1] + inR[i - W + 1] + inR[i + W - 1] + inR[i + W + 1];
        if (s >= 5) add.push(i);
      }
      add.forEach(i => { inR[i] = 1; });
      const idx = new Uint32Array(tail + add.length);
      idx.set(q.subarray(0, tail)); idx.set(add, tail);
      return idx;
    }

    // a new coat. Patches in a colour already on the walls share its light reference, so a
    // shadowed corner filled with a second tap matches the rest of the wall.
    function newLayer(hex, idx) {
      const same = layers.find(l => l.hex === hex);
      let meanY = same && same.meanY;
      if (!meanY) {
        let s = 0;
        for (const i of idx) s += Y[i];
        meanY = s / idx.length || 1;
      }
      layers.push({ hex, meanY });
      return layers.length - 1;
    }

    function paint(x, y, li) {
      const idx = region(x, y, +tolIn.value);
      let added = false;
      if (li == null) { li = newLayer(cur.hex, idx); added = true; }
      const prev = new Int16Array(idx.length);
      idx.forEach((i, k) => { prev[k] = layer[i]; layer[i] = li; });
      history.push({ idx, prev, added });
      selected = li;
      last = { x, y, li, added };
      render();
      syncButtons();
      const small = idx.length < W * H * 0.004;
      setStatus(small ? 'Small spot: try more spread' : 'Painted ✓', small ? 'is-busy' : 'is-done');
    }

    function undo() {
      const h = history.pop();
      if (!h) return;
      for (let k = h.idx.length - 1; k >= 0; k--) layer[h.idx[k]] = h.prev[k];
      if (h.added) layers.pop();
      selected = Math.min(selected, layers.length - 1);
      last = null;
      render();
      syncButtons();
      setStatus(history.length ? 'Undone' : 'Tap a wall');
    }

    function render() {
      const o = orig.data, d = out.data;
      const rgbs = layers.map(l => rgbOf(l.hex));
      d.set(o);
      for (let i = 0, n = W * H; i < n; i++) {
        const li = layer[i];
        if (li < 0) continue;
        const L = layers[li], rgb = rgbs[li];
        let f = Math.pow(Y[i] / L.meanY, 0.8);
        f = f < 0.3 ? 0.3 : f > 1.6 ? 1.6 : f;
        const x = i % W;
        const edge = (x > 0 && layer[i - 1] !== li) || (x < W - 1 && layer[i + 1] !== li) || (i >= W && layer[i - W] !== li) || (i < n - W && layer[i + W] !== li);
        const p = i * 4;
        for (let c = 0; c < 3; c++) {
          let v = rgb[c] * f;
          if (f > 1) v += (255 - v) * (f - 1) * 0.35;
          d[p + c] = edge ? (v + o[p + c]) / 2 : v;
        }
      }
      ctx.putImageData(out, 0, 0);
    }

    function syncButtons() {
      undoB.disabled = !history.length;
      resetB.disabled = !history.length;
    }

    const toPx = e => {
      const r = cv.getBoundingClientRect();
      return [clamp(Math.floor((e.clientX - r.left) * W / r.width), 0, W - 1), clamp(Math.floor((e.clientY - r.top) * H / r.height), 0, H - 1)];
    };

    $$('.mr-file', sec).forEach(f => f.addEventListener('change', () => { load(f.files[0]); f.value = ''; }));

    cv.addEventListener('click', e => {
      if (!orig || mode !== 'fill') return;
      const [x, y] = toPx(e);
      const hit = layer[y * W + x];
      if (hit >= 0) {
        selected = hit;
        layers[hit].hex = cur.hex;
        render();
        setStatus('Repainted ✓', 'is-done');
        return;
      }
      paint(x, y);
    });

    // brush + eraser: one undo step per stroke
    function stamp(x, y) {
      const r = Math.max(2, Math.round(Math.max(W, H) * sizeIn.value / 1000));
      if (stroke.li == null) {
        const idx = [];
        for (let yy = Math.max(0, y - r * 3); yy <= Math.min(H - 1, y + r * 3); yy++)
          for (let xx = Math.max(0, x - r * 3); xx <= Math.min(W - 1, x + r * 3); xx++) idx.push(yy * W + xx);
        stroke.li = newLayer(cur.hex, idx);
        stroke.added = true;
      }
      for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
        for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
          const i = yy * W + xx;
          if (stroke.seen[i]) continue;
          stroke.seen[i] = 1;
          stroke.idx.push(i); stroke.prev.push(layer[i]);
          layer[i] = stroke.li;
        }
      return r;
    }
    function strokeTo(e) {
      const [x, y] = toPx(e);
      const [px, py] = stroke.at || [x, y];
      const r = Math.max(2, Math.round(Math.max(W, H) * sizeIn.value / 1000));
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / (r / 3)));
      for (let s = 1; s <= steps; s++) stamp(Math.round(px + (x - px) * s / steps), Math.round(py + (y - py) * s / steps));
      stroke.at = [x, y];
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
    }
    cv.addEventListener('pointerdown', e => {
      if (!orig || mode === 'fill') return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      const li = mode === 'erase' ? -1 : layers.findIndex(l => l.hex === cur.hex);
      stroke = { li: li === -1 && mode === 'brush' ? null : li, added: false, seen: new Uint8Array(W * H), idx: [], prev: [], at: null };
      strokeTo(e);
    });
    cv.addEventListener('pointermove', e => { if (stroke) strokeTo(e); });
    const endStroke = () => {
      if (!stroke) return;
      if (stroke.idx.length) {
        history.push({ idx: Uint32Array.from(stroke.idx), prev: Int16Array.from(stroke.prev), added: stroke.added });
        if (mode === 'brush') selected = stroke.li;
        last = null;
        setStatus(mode === 'erase' ? 'Erased ✓' : 'Painted ✓', 'is-done');
      }
      stroke = null;
      render();
      syncButtons();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => cv.addEventListener(ev, endStroke));

    modeBs.forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      modeBs.forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      spread.hidden = mode !== 'fill';
      sizeWrap.hidden = mode === 'fill';
      cv.classList.toggle('is-brush', mode !== 'fill');
      if (orig) setStatus(mode === 'fill' ? 'Tap a wall' : mode === 'brush' ? 'Paint with your finger' : 'Rub out mistakes');
    }));

    // spread slider redoes the most recent fill from the same spot
    tolIn.addEventListener('change', () => {
      if (!last || !history.length) return;
      const { x, y, li, added } = last;
      const hex = layers[li].hex;
      undo();
      if (added) { paint(x, y); layers[layers.length - 1].hex = hex; render(); }
      else paint(x, y, li);
    });

    sws.forEach(s => s.addEventListener('click', () => {
      sws.forEach(x => x.setAttribute('aria-checked', String(x === s)));
      const hex = getComputedStyle(s).getPropertyValue('--c').trim();
      customIn.value = hex;
      setColour(s.dataset.name, hex);
    }));
    customIn.addEventListener('input', () => {
      sws.forEach(x => x.setAttribute('aria-checked', 'false'));
      setColour('Your colour', customIn.value);
    });

    undoB.addEventListener('click', undo);
    resetB.addEventListener('click', () => {
      layer.fill(-1); layers = []; history = []; selected = -1; last = null;
      render(); syncButtons(); setStatus('Tap a wall');
    });
    const showBefore = on => { if (orig) ctx.putImageData(on ? orig : out, 0, 0); };
    beforeB.addEventListener('pointerdown', () => showBefore(true));
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => beforeB.addEventListener(ev, () => showBefore(false)));
    beforeB.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showBefore(true); } });
    beforeB.addEventListener('keyup', () => showBefore(false));
    beforeB.addEventListener('contextmenu', e => e.preventDefault());

    saveB.addEventListener('click', () => {
      cv.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `my-room-${cur.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/jpeg', 0.9);
    });

    showColour();
  })();

  /* ---------------------------------------------------------
     Process line + quote words (scroll-linked)
     --------------------------------------------------------- */
  const proc = $('.proc');
  const procPaths = $$('.proc-line path').map(p => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    return { p, len };
  });
  const steps = $$('.step');
  let procMax = 0;
  const quote = $('.quote-text');
  const qWords = $$('.quote-text span');

  /* ---------------------------------------------------------
     Gallery filters + lightbox (work page)
     --------------------------------------------------------- */
  const shots = $$('.shot');
  $$('.flt').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.f;
    $$('.flt').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    shots.forEach(s => {
      const show = f === 'all' || s.dataset.cat.split(' ').includes(f);
      s.classList.toggle('is-hidden', !show);
      if (show) {
        s.classList.add('is-in');
        s.classList.remove('is-pop'); void s.offsetWidth; s.classList.add('is-pop');
      }
    });
  }));

  const lb = $('.lightbox');
  if (lb && shots.length) {
    const lbImg = $('.lb-fig img', lb), lbCap = $('.lb-fig figcaption', lb), lbCount = $('.lb-count', lb);
    let lbList = [], lbIdx = 0, lbReturn = null, sx = null;
    const lbShow = i => {
      lbIdx = (i + lbList.length) % lbList.length;
      const s = lbList[lbIdx];
      const img = $('img', s);
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = $('figcaption', s).textContent;
      lbCount.textContent = `${String(lbIdx + 1).padStart(2, '0')} / ${String(lbList.length).padStart(2, '0')}`;
      lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = '';
    };
    const lbOpen = s => {
      lbList = shots.filter(x => !x.classList.contains('is-hidden'));
      lbReturn = document.activeElement;
      lb.hidden = false;
      root.style.overflow = 'hidden';
      lbShow(lbList.indexOf(s));
      $('.lb-close', lb).focus();
    };
    const lbClose = () => {
      lb.hidden = true;
      root.style.overflow = '';
      lbReturn && lbReturn.focus();
    };
    shots.forEach(s => $('button', s).addEventListener('click', () => lbOpen(s)));
    $('.lb-close', lb).addEventListener('click', lbClose);
    $('.lb-prev', lb).addEventListener('click', () => lbShow(lbIdx - 1));
    $('.lb-next', lb).addEventListener('click', () => lbShow(lbIdx + 1));
    lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });
    addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') lbClose();
      if (e.key === 'ArrowLeft') lbShow(lbIdx - 1);
      if (e.key === 'ArrowRight') lbShow(lbIdx + 1);
      if (e.key === 'Tab') {
        const f = $$('button', lb);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    lb.addEventListener('pointerdown', e => { sx = e.clientX; });
    lb.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) lbShow(lbIdx + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------------------------------------------------------
     Map <-> town chips (about page)
     --------------------------------------------------------- */
  const pins = $$('.map .pin');
  const towns = $$('.towns li');
  const hot = (name, on) => {
    pins.forEach(p => p.dataset.town === name && p.classList.toggle('is-hot', on));
    towns.forEach(t => t.dataset.town === name && t.classList.toggle('is-hot', on));
  };
  [...pins, ...towns].forEach(el => {
    el.addEventListener('pointerenter', () => hot(el.dataset.town, true));
    el.addEventListener('pointerleave', () => hot(el.dataset.town, false));
  });

  /* ---------------------------------------------------------
     Estimate form -> prefilled email (contact page)
     --------------------------------------------------------- */
  const form = $('.est-form');
  if (form) {
    const err = $('.form-err', form);
    const done = $('.form-done', form);

    // prefill from links like contact.html?type=Exterior&colour=Ojibway%20Sage
    const q = new URLSearchParams(location.search);
    const type = q.get('type');
    if (type) {
      const box = $$('input[name="type"]', form).find(x => x.value === type);
      if (box) box.checked = true;
    }
    const colour = q.get('colour');
    if (colour) $('textarea[name="details"]', form).value = `Colour Lab pick: ${colour.slice(0, 60)}`;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const v = k => String(fd.get(k) || '').trim();
      const name = v('name'), phone = v('phone'), email = v('email');
      if (!name || (!phone && !email)) {
        err.hidden = false;
        (name ? $('input[name="phone"]', form) : $('input[name="name"]', form)).focus();
        return;
      }
      err.hidden = true;
      const types = fd.getAll('type').join(', ') || 'Not specified';
      const lines = [
        'Hi Sam,', '', "I'd like a free painting estimate.", '',
        `What: ${types}`,
        `Size: ${v('size') || 'Not specified'}`,
        `Timing: ${v('when') || 'Not specified'}`,
        `Town: ${v('town') || 'Not specified'}`, '',
        `Details: ${v('details') || 'None'}`, '',
        `Name: ${name}`,
        `Phone: ${phone || 'Not given'}`,
        `Email: ${email || 'Not given'}`,
      ];
      const subject = `Free estimate request: ${types} (${name})`;
      done.hidden = false;
      window.location.href = `mailto:happypaintingbysam@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    });
    $('.form-again', form).addEventListener('click', () => { done.hidden = true; });
  }

  /* ---------------------------------------------------------
     Main loop
     --------------------------------------------------------- */
  let sy = scrollY, lastHeaderY = sy;
  const firstSection = $('main > section');

  function loop() {
    requestAnimationFrame(loop);
    sy = scrollY;

    // header + action bar
    header.classList.toggle('is-scrolled', sy > 30);
    if (Math.abs(sy - lastHeaderY) > 8) {
      header.classList.toggle('is-hidden', sy > lastHeaderY && sy > 700 && !body.classList.contains('menu-open'));
      lastHeaderY = sy;
    }
    body.classList.toggle('show-bar', sy > (firstSection ? firstSection.offsetHeight * 0.6 : 200));

    // process line
    if (proc) {
      const r = proc.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        const p = procMax = Math.max(procMax, clamp((vh * 0.8 - r.top) / (r.height * 0.85)));
        procPaths.forEach(o => { o.p.style.strokeDashoffset = (o.len * (1 - p)).toFixed(1); });
        steps.forEach((s, i) => { if (p > [0.04, 0.42, 0.8][i]) s.classList.add('is-hit'); });
      }
    }

    // quote words
    if (quote) {
      const r = quote.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        const n = Math.round(clamp((vh * 0.82 - r.top) / (vh * 0.5)) * qWords.length);
        qWords.forEach((w, i) => { if (i < n) w.classList.add('lit'); });
      }
    }
  }
  requestAnimationFrame(loop);

  /* ---------------------------------------------------------
     Resize
     --------------------------------------------------------- */
  let rzT = 0;
  addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      const wChanged = innerWidth !== vw;
      vw = innerWidth; vh = innerHeight;
      measurePanels();
      heroPaint && heroPaint.resize();
      if (wChanged) buildDrips(footDrips, { seed: 7, base: 12, count: 16, minW: 12, maxW: 30, minL: 24, maxL: 112 });
      procPaths.forEach(o => { o.len = o.p.getTotalLength(); o.p.style.strokeDasharray = `${o.len}`; });
    }, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measurePanels(); fitBadge(); });
})();
