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
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = t => -(Math.cos(Math.PI * t) - 1) / 2;

  let vw = innerWidth;
  let vh = innerHeight;

  // visitors arriving on an old /page.html address see the clean /page one
  if (/\.html$/.test(location.pathname)) {
    history.replaceState(null, '', location.pathname.replace(/(index)?\.html$/, '') + location.search + location.hash);
  }

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
     Colour Lab: repaints the walls of a real room photo.
     img/room-walls.png marks where the walls are (white = wall).
     --------------------------------------------------------- */
  (() => {
    const box = $('.room-photo');
    if (!box) return;
    const lab = box.closest('.lab');
    const cv = $('canvas', box), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const sws = $$('.sw', lab);
    const stage = $('.lab-stage', lab);
    const cta = $('.lab-cta', lab);
    const nameEl = $('.lab-name', lab), hexEl = $('.lab-hex', lab), chip = $('.lab-chip', lab), status = $('.lab-status', lab);
    let base = null, walls = null, Y = null, meanY = 1, shown = null;
    let busy = false, queued = null, touched = false;

    const setStatus = (t, cls) => { status.textContent = t; status.className = `lab-status ${cls || ''}`; };
    const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });

    // the photo with its walls in one colour, keeping the photo's light and shadow
    function coat(hex) {
      const out = new ImageData(new Uint8ClampedArray(base.data), W, H), d = out.data;
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      for (let i = 0, n = W * H; i < n; i++) {
        const a = walls[i];
        if (!a) continue;
        const f = clamp(Math.pow(Y[i] / meanY, 0.8), 0.3, 1.6), p = i * 4;
        for (let c = 0; c < 3; c++) {
          let v = rgb[c] * f;
          if (f > 1) v += (255 - v) * (f - 1) * 0.35;
          d[p + c] += (v - d[p + c]) * a / 255;
        }
      }
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').putImageData(out, 0, 0);
      return c;
    }

    // a roller sweep from left to right
    function roll(hex) {
      if (busy) { queued = hex; return; }
      busy = true;
      const next = coat(hex), prev = shown;
      setStatus('Rolling…', 'is-busy');
      const dur = reduce ? 0 : 1100, t0 = performance.now();
      const step = now => {
        const t = dur ? clamp((now - t0) / dur) : 1, x = Math.round(easeInOut(t) * W);
        ctx.drawImage(prev, 0, 0);
        if (x > 0) ctx.drawImage(next, 0, 0, x, H, 0, 0, x, H);
        if (t < 1) { requestAnimationFrame(step); return; }
        shown = next;
        setStatus('Fresh coat ✓', 'is-done');
        busy = false;
        if (queued) { const q = queued; queued = null; roll(q); }
      };
      requestAnimationFrame(step);
    }

    const current = () => sws.find(x => x.getAttribute('aria-checked') === 'true') || sws[0];
    const hexOf = btn => getComputedStyle(btn).getPropertyValue('--c').trim();

    function select(btn, user = true) {
      if (user) touched = true;
      sws.forEach(x => x.setAttribute('aria-checked', String(x === btn)));
      const c = hexOf(btn);
      nameEl.textContent = btn.dataset.name;
      hexEl.textContent = c.toUpperCase();
      chip.style.setProperty('--c', c);
      if (cta && touched) cta.href = `/contact?type=Interior&colour=${encodeURIComponent(btn.dataset.name)}`;
      if (base) roll(c);
    }

    Promise.all([load($('img', box).currentSrc || $('img', box).src), load('img/room-walls.png')]).then(([photo, map]) => {
      ctx.drawImage(photo, 0, 0, W, H);
      base = ctx.getImageData(0, 0, W, H);
      const mc = document.createElement('canvas');
      mc.width = W; mc.height = H;
      const mx = mc.getContext('2d');
      mx.drawImage(map, 0, 0, W, H);
      const md = mx.getImageData(0, 0, W, H).data, bd = base.data;
      walls = new Uint8Array(W * H); Y = new Float32Array(W * H);
      let sum = 0, k = 0;
      for (let i = 0; i < W * H; i++) {
        walls[i] = md[i * 4];
        Y[i] = 0.299 * bd[i * 4] + 0.587 * bd[i * 4 + 1] + 0.114 * bd[i * 4 + 2];
        if (walls[i] > 127) { sum += Y[i]; k++; }
      }
      meanY = sum / k || 1;
      shown = coat(hexOf(current()));
      ctx.drawImage(shown, 0, 0);
      box.classList.add('is-ready');
      setStatus('Pick a colour');
    }).catch(() => setStatus('Pick a colour'));

    sws.forEach(x => x.addEventListener('click', () => select(x)));
    stage.addEventListener('click', () => select(sws[(sws.indexOf(current()) + 1) % sws.length]));

    // one demo roll the first time the room is on screen
    new IntersectionObserver(([e], obs) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      setTimeout(() => { if (!touched) select(sws[0], false); }, 700);
    }, { threshold: 0.45 }).observe(stage);
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

  // every project photo on the page opens in the viewer
  const lb = $('.lightbox');
  const zoomables = $$('.shot img, .pcard img, .svc-pic img, .teaser-grid img, .sd-media img, .ai-media img, .x-photos img');
  if (lb && zoomables.length) {
    const lbImg = $('.lb-fig img', lb), lbCap = $('.lb-fig figcaption', lb), lbCount = $('.lb-count', lb);
    let lbList = [], lbIdx = 0, lbReturn = null, sx = null;
    const caption = img => {
      const c = img.closest('figure, a');
      const t = c && $('figcaption, span', c);
      return t ? t.textContent.trim() : img.alt;
    };
    const lbShow = i => {
      lbIdx = (i + lbList.length) % lbList.length;
      const img = lbList[lbIdx];
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbCap.textContent = caption(img);
      lbCount.textContent = `${String(lbIdx + 1).padStart(2, '0')} / ${String(lbList.length).padStart(2, '0')}`;
      lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = '';
    };
    const lbOpen = img => {
      lbList = zoomables.filter(x => !x.closest('.is-hidden'));
      lbReturn = document.activeElement;
      lb.hidden = false;
      root.style.overflow = 'hidden';
      lbShow(lbList.indexOf(img));
      $('.lb-close', lb).focus();
    };
    const lbClose = () => {
      lb.hidden = true;
      root.style.overflow = '';
      lbReturn && lbReturn.focus();
    };
    zoomables.forEach(img => {
      const btn = img.closest('.shot button');
      if (btn) { btn.addEventListener('click', () => lbOpen(img)); return; }
      img.classList.add('zoomable');
      // photos inside a link (home page preview) enlarge instead of following it; the link stays
      // reachable by keyboard, so only photos outside links become focusable
      if (!img.closest('a')) {
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', `Enlarge photo: ${img.alt}`);
        img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lbOpen(img); } });
      }
      img.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); lbOpen(img); });
    });
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
     Estimate form (contact page). Sends through Web3Forms when
     the page has an access key, otherwise opens a prefilled email.
     --------------------------------------------------------- */
  const form = $('.est-form');
  if (form) {
    const err = $('.form-err:not(.form-fail)', form);
    const fail = $('.form-fail', form);
    const done = $('.form-done', form);
    const key = form.dataset.key;
    const to = $('.direct-card[href^="mailto:"]').getAttribute('href').slice(7);
    const btn = $('button[type="submit"]', form), btnHTML = btn.innerHTML;
    const again = $('.form-again', form);

    // prefill from links like /contact?type=Exterior&colour=Ojibway%20Sage
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
      fail.hidden = true;
      const types = fd.getAll('type').join(', ') || 'Not specified';
      const info = {
        What: types,
        Size: v('size') || 'Not specified',
        Timing: v('when') || 'Not specified',
        Town: v('town') || 'Not specified',
        Details: v('details') || 'None',
        Name: name,
        Phone: phone || 'Not given',
        Email: email || 'Not given',
      };
      const lines = ['Hi Sam,', '', "I'd like a free painting estimate.", '',
        ...['What', 'Size', 'Timing', 'Town'].map(k => `${k}: ${info[k]}`), '',
        `Details: ${info.Details}`, '',
        ...['Name', 'Phone', 'Email'].map(k => `${k}: ${info[k]}`)];
      const subject = `Free estimate request: ${types} (${name})`;
      const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;

      if (!key) {
        done.hidden = false;
        window.location.href = mailto;
        return;
      }
      const sent = () => {
        $('h3', done).textContent = 'Request sent!';
        $('p', done).innerHTML = 'Thanks! Sam will be in touch soon. Need him sooner? Call or text <a href="tel:+15199917783">519-991-7783</a>.';
        again.textContent = 'Send another request';
        done.hidden = false;
        form.reset();
      };
      if (v('website')) { sent(); return; }  // spam bots fill the hidden field
      btn.disabled = true;
      btn.textContent = 'Sending…';
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ access_key: key, subject, from_name: 'Happy Painting website', replyto: email || undefined, ...info }),
      })
        .then(r => r.json())
        .then(d => { if (!d.success) throw new Error(d.message); sent(); })
        .catch(() => {
          $('.fail-mail', fail).href = mailto;
          fail.hidden = false;
          fail.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        })
        .finally(() => { btn.disabled = false; btn.innerHTML = btnHTML; });
    });
    again.addEventListener('click', () => { done.hidden = true; });
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
      heroPaint && heroPaint.resize();
      if (wChanged) buildDrips(footDrips, { seed: 7, base: 12, count: 16, minW: 12, maxW: 30, minL: 24, maxL: 112 });
      procPaths.forEach(o => { o.len = o.p.getTotalLength(); o.p.style.strokeDasharray = `${o.len}`; });
    }, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBadge);
})();
