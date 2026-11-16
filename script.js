/* ==========================================================================
   Mundo Mágico · script.js
   Sem dependências: animações de scroll, calendário, pedido pelo WhatsApp.
   ========================================================================== */
(() => {
  "use strict";

  /* ======================================================================
     1. CONFIGURAÇÃO (edite aqui)
     ====================================================================== */
  const CONFIG = {
    // DDI + DDD + número, só dígitos
    whatsapp: "5515998555233",

    // Horários de festa mostrados no calendário
    periodos: [
      { id: "tarde", nome: "Tarde", horario: "13h às 17h" },
      { id: "noite", nome: "Noite", horario: "18h às 22h" },
    ],

    agenda: {
      mesesParaFrente: 12,        // quantos meses o calendário mostra
      antecedenciaMinimaDias: 2,  // datas antes disso aparecem como indisponíveis
      diasFechados: [],           // 0 = domingo … 6 = sábado. Ex.: [1] fecha às segundas

      // SIMULAÇÃO: enquanto a agenda real não estiver conectada, o site gera
      // uma ocupação de exemplo (sempre igual para a mesma data).
      // Troque para false para mostrar só as reservas listadas abaixo.
      simular: true,

      // Reservas confirmadas: "AAAA-MM-DD": ["tarde", "noite"]
      reservas: {
        // "2026-12-12": ["tarde", "noite"],
      },
    },

    mensagens: {
      padrao: "Olá, Mundo Mágico! 💫 Quero saber mais sobre as festas e as datas disponíveis.",
      visita: "Olá, Mundo Mágico! 💫 Gostaria de agendar uma visita para conhecer o espaço. Quais horários vocês têm?",
      duvida: "Olá, Mundo Mágico! 💫 Tenho uma dúvida sobre as festas:",
    },
  };

  /* ======================================================================
     2. Utilidades
     ====================================================================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const damp = (dt, k) => 1 - Math.pow(1 - k, dt); // suavização independente do fps
  const root = document.documentElement;
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqDesktop = window.matchMedia("(min-width: 960px)");
  const mqFine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const motionOK = () => !mqReduce.matches;
  const waUrl = (msg) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY;
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  // datas
  const DAY = 86400000;
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtMonth = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const fmtLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const fmtWeekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
  const fmtNum = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtDayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
  const shortDate = (d) => `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;

  /* ======================================================================
     3. Motor de scroll (um único requestAnimationFrame para tudo)
     ====================================================================== */
  const Engine = (() => {
    const scenes = [];
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let lastY = window.scrollY;
    let vel = 0;
    let last = performance.now();
    let timer = 0;

    const measure = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      scenes.forEach((s) => s.measure && s.measure(vw, vh));
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(measure, 120); };

    const frame = (now) => {
      const dt = Math.min(4, Math.max(0.25, (now - last) / 16.667));
      last = now;
      const y = window.scrollY;
      vel += (y - lastY - vel) * damp(dt, 0.2);
      lastY = y;
      for (let i = 0; i < scenes.length; i++) scenes[i].update(y, dt, vel, vw, vh);
      requestAnimationFrame(frame);
    };

    return {
      add(scene) { scenes.push(scene); if (scene.measure) scene.measure(vw, vh); },
      start() {
        window.addEventListener("resize", schedule);
        if ("ResizeObserver" in window) new ResizeObserver(schedule).observe(document.body);
        window.addEventListener("load", measure);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        requestAnimationFrame(frame);
      },
      measure,
    };
  })();

  /* ======================================================================
     4. Textos que entram palavra por palavra + revelações
     ====================================================================== */
  function splitWords(el) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            const inner = document.createElement("span");
            w.className = "w";
            inner.className = "w-in";
            inner.style.setProperty("--i", i++);
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
  }

  function initReveal() {
    const targets = $$("[data-split], [data-reveal]");
    if (!motionOK() || !("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("is-in"));
      return;
    }
    $$("[data-split]").forEach(splitWords);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
    targets.forEach((t) => io.observe(t));
  }

  /* ======================================================================
     5. Brilhos (canvas)
     ====================================================================== */
  function createSparkles() {
    const canvas = $(".sparkles");
    const noop = { burst() {}, trail() {} };
    if (!canvas || !canvas.getContext || !motionOK()) return noop;
    const ctx = canvas.getContext("2d");
    if (!ctx) return noop;

    const parts = [];
    let w = 0;
    let h = 0;
    let running = false;
    const palette = ["--sun", "--coral", "--mint", "--violet", "--lime"].map(cssVar).filter(Boolean);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const star = (x, y, r, rot) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rad = i % 2 ? r * 0.36 : r;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += p.g;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life * 1.8);
        ctx.fillStyle = p.color;
        star(p.x, p.y, p.size * (0.35 + p.life * 0.65), p.rot);
      }
      ctx.globalAlpha = 1;
      if (parts.length) requestAnimationFrame(loop);
      else { running = false; ctx.clearRect(0, 0, w, h); }
    };

    const spawn = (x, y, n, power, g) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = power * (0.35 + Math.random() * 0.65);
        parts.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - power * 0.3,
          g,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.25,
          life: 1,
          decay: 0.012 + Math.random() * 0.014,
          size: 4 + Math.random() * 7,
          color: palette[(Math.random() * palette.length) | 0] || "#ffc83d",
        });
      }
      if (parts.length > 260) parts.splice(0, parts.length - 260);
      if (!running) { running = true; requestAnimationFrame(loop); }
    };

    return {
      burst: (x, y, n = 22, power = 7) => spawn(x, y, n, power, 0.09),
      trail: (x, y) => spawn(x, y, 1, 1.4, 0.04),
    };
  }

  /* ======================================================================
     6. Cenas de scroll
     ====================================================================== */

  // Hero: profundidade com o mouse e com o scroll, selo girando
  function heroScene() {
    const hero = $(".hero");
    if (!hero || !motionOK()) return;
    const badgeText = $(".badge-text", hero);
    let top = 0;
    let h = 1;
    let p = 0;
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;
    let spin = 0;
    let lastKey = "";

    if (mqFine.matches) {
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        tmx = (e.clientX - r.left) / r.width - 0.5;
        tmy = (e.clientY - r.top) / r.height - 0.5;
      });
      hero.addEventListener("pointerleave", () => { tmx = 0; tmy = 0; });
    }

    Engine.add({
      measure() { top = pageTop(hero); h = hero.offsetHeight || 1; },
      update(y, dt) {
        if (y > top + h + 200) return;
        const k = damp(dt, 0.1);
        p += (clamp((y - top) / h) - p) * k;
        mx += (tmx - mx) * k;
        my += (tmy - my) * k;
        spin += 0.12 * dt;
        const key = `${p.toFixed(4)}|${mx.toFixed(4)}|${my.toFixed(4)}`;
        if (key !== lastKey) {
          lastKey = key;
          hero.style.setProperty("--hp", p.toFixed(4));
          hero.style.setProperty("--mx", mx.toFixed(4));
          hero.style.setProperty("--my", my.toFixed(4));
        }
        if (badgeText) badgeText.style.transform = `rotate(${(y * 0.14 + spin).toFixed(1)}deg)`;
      },
    });
  }

  // Fitas: andam sozinhas e aceleram/invertem com a velocidade do scroll
  function tapesScene() {
    const tapes = $$("[data-tape]");
    if (!tapes.length) return;
    const holder = tapes[0].parentElement;
    const items = tapes.map((tape) => {
      const track = $(".tape-track", tape);
      const unit = track.innerHTML;
      let guard = 0;
      while (track.scrollWidth < window.innerWidth * 1.5 && guard++ < 12) track.insertAdjacentHTML("beforeend", unit);
      track.insertAdjacentHTML("beforeend", track.innerHTML);
      return { track, dir: Number(tape.dataset.tape) || 1, x: 0, w: 1 };
    });
    if (!motionOK()) return;

    let visible = true;
    let sign = 1;
    let boost = 0;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(holder);
    }

    Engine.add({
      measure() { items.forEach((it) => { it.w = it.track.scrollWidth / 2 || 1; }); },
      update(y, dt, vel) {
        if (!visible) return;
        if (Math.abs(vel) > 0.4) sign = vel > 0 ? 1 : -1;
        boost += (Math.min(Math.abs(vel) * 0.55, 20) - boost) * damp(dt, 0.12);
        const step = (1.1 + boost) * dt;
        items.forEach((it) => {
          it.x -= step * it.dir * sign;
          if (it.x <= -it.w) it.x += it.w;
          else if (it.x > 0) it.x -= it.w;
          it.track.style.transform = `translate3d(${it.x.toFixed(2)}px,0,0)`;
        });
      },
    });
  }

  // Cartas: começam em leque (como na mão de um mágico) e se abrem com o scroll
  function deckScene() {
    const deck = $("[data-deck]");
    if (!deck) return;
    const slots = $$(".deck-slot", deck);
    const fan = [{ r: -15, y: 50, z: 1 }, { r: 0, y: 0, z: 3 }, { r: 15, y: 50, z: 2 }];
    let enabled = false;
    let top = 0;
    let vh = 1;
    let p = -1;
    let offs = [];

    Engine.add({
      measure(_vw, _vh) {
        vh = _vh;
        enabled = mqDesktop.matches && motionOK();
        if (!enabled) {
          slots.forEach((s) => { s.style.transform = ""; s.style.zIndex = ""; });
          return;
        }
        top = pageTop(deck);
        const center = deck.clientWidth / 2;
        offs = slots.map((s) => center - (s.offsetLeft + s.offsetWidth / 2));
        p = -1;
      },
      update(y, dt) {
        if (!enabled) return;
        const start = top - vh * 0.95;
        const end = top - vh * 0.28;
        const target = clamp((y - start) / (end - start));
        if (p < 0) p = target;
        else {
          if (Math.abs(target - p) < 0.0004) return;
          p += (target - p) * damp(dt, 0.09);
        }
        const inv = 1 - easeInOut(p);
        slots.forEach((s, i) => {
          const f = fan[i] || { r: 0, y: 0, z: 1 };
          s.style.transform = `translate3d(${(offs[i] * inv).toFixed(1)}px, ${(f.y * inv).toFixed(1)}px, 0) rotate(${(f.r * inv).toFixed(2)}deg)`;
          s.style.zIndex = String(f.z);
        });
      },
    });
  }

  // Frase: seção presa enquanto as palavras acendem
  function statementScene() {
    const sec = $(".statement");
    const text = $("[data-words]");
    if (!sec || !text) return;
    const words = text.textContent.trim().split(/\s+/);
    const keys = [];
    text.textContent = "";
    words.forEach((w, i) => {
      const span = document.createElement("span");
      span.className = "sw";
      span.style.setProperty("--i", i);
      span.textContent = w;
      if (/^magia/i.test(w)) { span.classList.add("sw-key"); keys.push({ el: span, i }); }
      text.appendChild(span);
      if (i < words.length - 1) text.appendChild(document.createTextNode(" "));
    });
    text.style.setProperty("--n", words.length);
    if (!motionOK()) { keys.forEach((k) => k.el.classList.add("is-lit")); return; }

    let top = 0;
    let h = 1;
    let vh = 1;
    let p = 0;
    let last = "";
    Engine.add({
      measure(_vw, _vh) { top = pageTop(sec); h = sec.offsetHeight; vh = _vh; },
      update(y, dt) {
        if (y < top - vh * 1.2 || y > top + h) return;
        const start = top - vh * 0.35;
        const end = top + h - vh * 1.15;
        p += (clamp((y - start) / (end - start)) - p) * damp(dt, 0.12);
        const s = p.toFixed(4);
        if (s === last) return;
        last = s;
        text.style.setProperty("--p", s);
        keys.forEach((k) => k.el.classList.toggle("is-lit", p * (words.length + 6) - k.i >= 5));
      },
    });
  }

  // Galeria: presa na tela e rolando na horizontal (desktop)
  function reelScene() {
    const reel = $("[data-reel]");
    if (!reel) return;
    const track = $(".reel-track", reel);
    const items = $$(".reel-item", reel);
    let enabled = false;
    let top = 0;
    let dist = 0;
    let vw = 1;
    let vh = 1;
    let p = -1;
    let centers = [];

    Engine.add({
      measure(_vw, _vh) {
        vw = _vw;
        vh = _vh;
        enabled = mqDesktop.matches && motionOK();
        if (!enabled) {
          reel.style.height = "";
          track.style.transform = "";
          items.forEach((it) => { it.style.removeProperty("--r"); it.style.removeProperty("--ry"); });
          return;
        }
        dist = Math.max(0, track.scrollWidth - vw);
        const want = `${Math.round(dist + vh)}px`;
        if (reel.style.height !== want) reel.style.height = want;
        top = pageTop(reel);
        centers = items.map((it) => it.offsetLeft + it.offsetWidth / 2);
        p = -1;
      },
      update(y, dt) {
        if (!enabled) return;
        if (y < top - vh * 1.5 || y > top + dist + vh * 1.5) return;
        const target = clamp((y - top) / Math.max(1, dist));
        if (p < 0) p = target;
        else {
          if (Math.abs(target - p) < 0.0002) return;
          p += (target - p) * damp(dt, 0.14);
        }
        const x = -p * dist;
        track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        items.forEach((it, i) => {
          const n = clamp((centers[i] + x - vw / 2) / vw, -1, 1);
          it.style.setProperty("--r", `${(n * 8).toFixed(2)}deg`);
          it.style.setProperty("--ry", `${(Math.abs(n) * 30).toFixed(1)}px`);
        });
      },
    });
  }

  // Passo a passo: rastro de varinha que se desenha com o scroll
  function trailScene() {
    const wrap = $("[data-trail]");
    if (!wrap) return;
    const svg = $(".trail", wrap);
    const dots = $(".trail-dots", wrap);
    const reveal = $(".trail-reveal", wrap);
    const head = $(".trail-head", wrap);
    const steps = $$(".step", wrap);
    const nums = steps.map((s) => $(".step-n", s));
    let top = 0;
    let h = 1;
    let vh = 1;
    let len = 0;
    let p = -1;
    let stops = [];
    let last = "";

    const build = () => {
      const wr = wrap.getBoundingClientRect();
      const pts = nums.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2 };
      });
      if (pts.length < 2) return;
      const vertical = Math.abs(pts[1].x - pts[0].x) < 20;
      let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
      const partial = [d];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        let c1;
        let c2;
        if (vertical) {
          const dy = b.y - a.y;
          c1 = { x: a.x - 30, y: a.y + dy * 0.35 };
          c2 = { x: b.x + 30, y: b.y - dy * 0.35 };
        } else {
          const dx = b.x - a.x;
          c1 = { x: a.x + dx * 0.3, y: a.y - 150 };
          c2 = { x: b.x - dx * 0.25, y: b.y - 170 };
        }
        d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        partial.push(d);
      }
      dots.setAttribute("d", d);
      reveal.setAttribute("d", d);
      len = dots.getTotalLength();
      const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(tmp);
      stops = partial.map((pd, i) => {
        if (i === 0 || !len) return 0;
        tmp.setAttribute("d", pd);
        return tmp.getTotalLength() / len;
      });
      tmp.remove();
    };

    if (!motionOK()) {
      build();
      reveal.style.strokeDashoffset = "0";
      steps.forEach((s) => s.classList.add("is-lit"));
      window.addEventListener("resize", build);
      return;
    }

    Engine.add({
      measure(_vw, _vh) {
        vh = _vh;
        top = pageTop(wrap);
        h = wrap.offsetHeight;
        build();
        p = -1;
        last = "";
      },
      update(y, dt) {
        if (y < top - vh * 1.5 || y > top + h + vh) return;
        const start = top - vh * 0.72;
        const end = top + h - vh * 0.6;
        const target = clamp((y - start) / (end - start));
        p = p < 0 ? target : p + (target - p) * damp(dt, 0.1);
        const s = p.toFixed(4);
        if (s === last) return;
        last = s;
        reveal.style.strokeDashoffset = (1 - p).toFixed(4);
        if (len) {
          const pt = dots.getPointAtLength(p * len);
          head.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${(p * 540).toFixed(1)})`);
          head.classList.toggle("is-on", p > 0.01 && p < 0.985);
        }
        steps.forEach((st, i) => st.classList.toggle("is-lit", p > 0.01 && p >= (stops[i] || 0) - 0.01));
      },
    });
  }

  // Rodapé: “Mundo Mágico” gigante subindo letra por letra
  function footerScene() {
    const word = $("[data-footer-word]");
    if (!word) return;
    const text = word.textContent.trim();
    word.textContent = "";
    let i = 0;
    Array.from(text).forEach((ch) => {
      const s = document.createElement("span");
      if (ch === " ") s.className = "fl-space";
      else { s.className = "fl"; s.textContent = ch; s.style.setProperty("--i", i++); }
      word.appendChild(s);
    });

    const fit = () => {
      word.style.setProperty("--fw", "100px");
      const kids = word.children;
      const first = kids[0].getBoundingClientRect();
      const lastR = kids[kids.length - 1].getBoundingClientRect();
      const natural = lastR.right - first.left;
      if (natural > 0) word.style.setProperty("--fw", `${Math.max(40, Math.floor((100 * word.clientWidth * 0.95) / natural))}px`);
    };

    let top = 0;
    let vh = 1;
    let maxY = 1;
    let p = -1;
    let last = "";
    Engine.add({
      measure(_vw, _vh) {
        vh = _vh;
        fit();
        top = pageTop(word);
        maxY = Math.max(1, document.documentElement.scrollHeight - vh);
        p = -1;
      },
      update(y, dt) {
        if (!motionOK()) return;
        const start = top - vh;
        if (y < start - vh * 0.3) return;
        // termina de subir no fim da página (ou antes, se houver espaço)
        const end = Math.max(start + 1, Math.min(top - vh * 0.45, maxY - 4));
        const target = clamp((y - start) / (end - start));
        p = p < 0 ? target : p + (target - p) * damp(dt, 0.1);
        const s = p.toFixed(3);
        if (s === last) return;
        last = s;
        word.style.setProperty("--fp", s);
      },
    });
  }

  // Parallax genérico: data-speed (desloca) e data-rot (gira)
  function parallaxScene() {
    const els = $$("[data-speed], [data-rot]");
    if (!els.length || !motionOK()) return;
    const items = els.map((el) => ({
      el,
      speed: parseFloat(el.dataset.speed) || 0,
      rot: parseFloat(el.dataset.rot) || 0,
      top: 0,
      h: 0,
      cur: null,
      last: "",
    }));
    Engine.add({
      measure() {
        items.forEach((it) => {
          const prev = it.el.style.transform;
          it.el.style.transform = "";
          it.top = pageTop(it.el);
          it.h = it.el.offsetHeight;
          it.el.style.transform = prev;
        });
      },
      update(y, dt, vel, vw, vh) {
        items.forEach((it) => {
          const rel = (it.top + it.h / 2 - y - vh / 2) / vh;
          if (Math.abs(rel) > 1.8) return;
          it.cur = it.cur === null ? rel : it.cur + (rel - it.cur) * damp(dt, 0.12);
          let t = `translate3d(0,${(-it.cur * it.speed * 90).toFixed(1)}px,0)`;
          if (it.rot) t += ` rotate(${(y * it.rot).toFixed(1)}deg)`;
          if (t !== it.last) { it.el.style.transform = t; it.last = t; }
        });
      },
    });
  }

  /* ======================================================================
     7. Hover e interações de ponteiro
     ====================================================================== */
  function initButtonFill() {
    const setOrigin = (btn, e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--x", `${e.clientX - r.left}px`);
      btn.style.setProperty("--y", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointerover", (e) => {
      const b = e.target.closest && e.target.closest(".btn");
      if (b && !b.contains(e.relatedTarget)) setOrigin(b, e);
    });
    document.addEventListener("pointerout", (e) => {
      const b = e.target.closest && e.target.closest(".btn");
      if (b && !b.contains(e.relatedTarget)) setOrigin(b, e);
    });
  }

  function initMagnetic() {
    if (!mqFine.matches || !motionOK()) return;
    $$("[data-magnetic]").forEach((el) => {
      let cx = 0;
      let cy = 0;
      let hw = 1;
      let hh = 1;
      el.addEventListener("pointerenter", () => {
        const r = el.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
        hw = r.width / 2;
        hh = r.height / 2;
        el.classList.add("is-magnet");
      });
      el.addEventListener("pointermove", (e) => {
        const dx = clamp((e.clientX - cx) / hw, -1.2, 1.2);
        const dy = clamp((e.clientY - cy) / hh, -1.2, 1.2);
        el.style.setProperty("--mgx", `${(dx * 7).toFixed(1)}px`);
        el.style.setProperty("--mgy", `${(dy * 5).toFixed(1)}px`);
      });
      el.addEventListener("pointerleave", () => {
        el.classList.remove("is-magnet");
        el.style.setProperty("--mgx", "0px");
        el.style.setProperty("--mgy", "0px");
      });
    });
  }

  function initTilt() {
    if (!mqFine.matches || !motionOK()) return;
    $$("[data-tilt]").forEach((card) => {
      let raf = 0;
      card.addEventListener("pointerenter", () => card.classList.add("is-tilting"));
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          card.style.setProperty("--ty", `${(px * 10).toFixed(2)}deg`);
          card.style.setProperty("--tx", `${(-py * 8).toFixed(2)}deg`);
        });
      });
      card.addEventListener("pointerleave", () => {
        cancelAnimationFrame(raf);
        card.classList.remove("is-tilting");
        card.style.setProperty("--tx", "0deg");
        card.style.setProperty("--ty", "0deg");
      });
    });
  }

  // Letras de “Magia!”: pulam ao passar o mouse e soltam brilhos no clique
  function initLetters(Sparkles) {
    const letters = $$(".ltr-in");
    if (!letters.length) return;
    const hop = (el, big) => {
      if (!motionOK() || !el.animate) return;
      const rot = parseFloat(getComputedStyle(el).getPropertyValue("--rot")) || 0;
      el.animate([
        { transform: `rotate(${rot}deg)` },
        { transform: `translateY(${big ? -30 : -18}%) rotate(${-rot * 1.6}deg) scale(1.06)`, offset: 0.4 },
        { transform: `translateY(4%) rotate(${rot}deg) scale(0.97)`, offset: 0.75 },
        { transform: `rotate(${rot}deg)` },
      ], { duration: big ? 760 : 620, easing: "ease-out" });
      const r = el.getBoundingClientRect();
      Sparkles.burst(r.left + r.width / 2, r.top + r.height * 0.3, big ? 18 : 6, big ? 7 : 4);
    };
    letters.forEach((el) => {
      if (mqFine.matches) el.addEventListener("pointerenter", () => hop(el, false));
      el.addEventListener("click", () => hop(el, true));
    });
  }

  function initHeroTrail(Sparkles) {
    const hero = $(".hero");
    if (!hero || !mqFine.matches || !motionOK()) return;
    let lx = -999;
    let ly = -999;
    hero.addEventListener("pointermove", (e) => {
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      if (dx * dx + dy * dy < 1100) return;
      lx = e.clientX;
      ly = e.clientY;
      Sparkles.trail(e.clientX, e.clientY);
    });
  }

  /* ======================================================================
     8. Cabeçalho, menu, WhatsApp, FAQ, galeria
     ====================================================================== */
  function initWhatsapp() {
    $$("[data-whatsapp]").forEach((a) => {
      const key = a.dataset.whatsapp || "padrao";
      a.href = waUrl(CONFIG.mensagens[key] || CONFIG.mensagens.padrao);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  }

  function initHeader() {
    const header = $(".header");
    if (!header) return;
    let lastY = window.scrollY;
    let acc = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      header.classList.toggle("is-solid", y > 10);
      if (document.body.classList.contains("menu-open")) return;
      acc = Math.sign(dy) === Math.sign(acc) ? acc + dy : dy;
      if (y < 200) header.classList.remove("is-hidden");
      else if (acc > 50) header.classList.add("is-hidden");
      else if (acc < -24) header.classList.remove("is-hidden");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    header.addEventListener("focusin", () => header.classList.remove("is-hidden"));
    onScroll();
  }

  function initMenu() {
    const toggle = $("#menu-toggle");
    const nav = $("#site-nav");
    const body = document.body;
    if (!toggle || !nav) return;
    const set = (open, restoreFocus) => {
      body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      if (open) $(".header").classList.remove("is-hidden");
      if (!open && restoreFocus) toggle.focus();
    };
    toggle.addEventListener("click", () => set(toggle.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", (e) => {
      if (!body.classList.contains("menu-open") || mqDesktop.matches) return;
      if (e.key === "Escape") { set(false, true); return; }
      if (e.key !== "Tab") return;
      const items = [toggle, ...$$("a[href], button:not([disabled])", nav)].filter((el) => el.getClientRects().length);
      const first = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !items.includes(active))) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && (active === lastItem || !items.includes(active))) { e.preventDefault(); first.focus(); }
    });
    const onChange = (e) => { if (e.matches) set(false); };
    if (mqDesktop.addEventListener) mqDesktop.addEventListener("change", onChange);
    else if (mqDesktop.addListener) mqDesktop.addListener(onChange);
  }

  // botão flutuante: some no topo, na agenda (onde já há o formulário) e no fim do rodapé
  function initFloat() {
    const btn = $(".wa-float");
    if (!btn) return;
    const hero = $(".hero");
    const blockers = [$("#agenda"), $(".footer-bottom")].filter(Boolean);
    const visible = new Set();
    const update = () => {
      const past = window.scrollY > (hero ? hero.offsetHeight * 0.6 : 400);
      btn.classList.toggle("is-on", past && visible.size === 0);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
        update();
      }, { threshold: 0.1 });
      blockers.forEach((el) => io.observe(el));
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  // textos alternativos para telas de toque
  function initTouchTexts() {
    if (mqFine.matches) return;
    $$("[data-touch-text]").forEach((el) => { el.textContent = el.dataset.touchText; });
  }

  function initFaq() {
    $$(".qa").forEach((d) => {
      const summary = $("summary", d);
      const body = $(".qa-a", d);
      let anim = null;
      summary.addEventListener("click", (e) => {
        if (!motionOK() || !body.animate) return;
        e.preventDefault();
        const easing = "cubic-bezier(.22,1,.36,1)";
        if (d.open && !d.classList.contains("is-closing")) {
          d.classList.add("is-closing");
          const from = body.offsetHeight;
          if (anim) anim.cancel();
          anim = body.animate([{ height: `${from}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 380, easing });
          anim.onfinish = () => { d.open = false; d.classList.remove("is-closing"); anim = null; };
        } else {
          const from = anim ? body.offsetHeight : 0;
          d.classList.remove("is-closing");
          if (anim) anim.cancel();
          d.open = true;
          const to = body.scrollHeight;
          anim = body.animate([{ height: `${from}px`, opacity: from ? 1 : 0 }, { height: `${to}px`, opacity: 1 }], { duration: 480, easing });
          anim.onfinish = () => { anim = null; };
        }
      });
    });
  }

  function initLightbox() {
    const dlg = $("#lightbox");
    const shots = $$("[data-gallery]");
    if (!dlg || !shots.length || typeof dlg.showModal !== "function") return;
    const img = $("#lb-img");
    const cap = $("#lb-cap");
    let idx = 0;
    let opener = null;
    const show = (i) => {
      idx = (i + shots.length) % shots.length;
      const s = shots[idx];
      const im = $("img", s);
      img.src = im.currentSrc || im.src;
      img.alt = im.alt;
      const c = $(".snap-cap", s);
      cap.textContent = c ? c.textContent : im.alt;
      if (motionOK() && img.animate) img.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "ease-out" });
    };
    shots.forEach((s, i) => s.addEventListener("click", () => {
      opener = s;
      show(i);
      dlg.showModal();
      document.body.classList.add("dialog-open");
    }));
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-lb]");
      if (b) {
        const a = b.dataset.lb;
        if (a === "close") dlg.close();
        else show(idx + (a === "next" ? 1 : -1));
        return;
      }
      if (e.target === dlg) {
        const r = dlg.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
      }
    });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(idx + 1);
      if (e.key === "ArrowLeft") show(idx - 1);
    });
    dlg.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      if (opener) opener.focus({ preventScroll: true });
    });
  }

  /* ======================================================================
     9. Agenda (calendário com disponibilidade)
     ----------------------------------------------------------------------
     Para ligar a uma agenda real, troque o corpo de disponibilidade(d):
     ele precisa devolver { status, periodos: [{ id, nome, horario, livre }], livres }.
     ====================================================================== */
  function createAgenda(Sparkles) {
    const grid = $("#cal-grid");
    if (!grid) return null;
    const label = $("#cal-month");
    const prev = $('[data-cal="prev"]');
    const next = $('[data-cal="next"]');
    const slotsBox = $("#slots");

    const today = startOfDay(new Date());
    const minDate = addDays(today, CONFIG.agenda.antecedenciaMinimaDias);
    const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() + Math.max(1, CONFIG.agenda.mesesParaFrente) - 1, 1);
    let view = new Date(firstMonth);
    let selected = null;
    let period = null;
    const changeSubs = [];
    const goSubs = [];

    // número pseudoaleatório estável para cada data (simulação)
    const seeded = (str) => {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
      return (h >>> 0) / 4294967296;
    };

    function disponibilidade(d) {
      const key = toISO(d);
      const dow = d.getDay();
      if (d < minDate) return { status: "passado", periodos: [], livres: 0 };
      if (CONFIG.agenda.diasFechados.includes(dow)) return { status: "fechado", periodos: [], livres: 0 };
      const manual = CONFIG.agenda.reservas[key] || [];
      // sábados e domingos lotam primeiro; em dezembro, quinta e sexta recebem confraternizações
      const ahead = Math.round((d - today) / DAY);
      let base = dow === 6 ? 0.9 : dow === 0 ? 0.74 : dow === 5 ? 0.5 : 0.12;
      if (d.getMonth() === 11 && (dow === 4 || dow === 5)) base += 0.25;
      const chance = Math.min(0.95, base) * (1 - Math.min(ahead / 300, 0.6));
      const periodos = CONFIG.periodos.map((p) => {
        let ocupado = manual.includes(p.id);
        if (!ocupado && CONFIG.agenda.simular) ocupado = seeded(`${key}|${p.id}`) < chance;
        return { id: p.id, nome: p.nome, horario: p.horario, livre: !ocupado };
      });
      const livres = periodos.filter((p) => p.livre).length;
      const status = livres === 0 ? "lotado" : livres < periodos.length ? "ultimo" : "livre";
      return { status, periodos, livres };
    }

    const statusText = (info) => {
      if (info.status === "passado") return "indisponível";
      if (info.status === "fechado") return "fechado";
      if (info.status === "lotado") return "lotado";
      if (info.livres === 1) return info.periodos.length > 1 ? "último horário livre" : "1 horário livre";
      return `${info.livres} horários livres`;
    };

    const emit = () => changeSubs.forEach((fn) => fn({ date: selected, period }));

    function roving(target) {
      const days = $$(".day", grid).filter((b) => b.tagName === "BUTTON" && !b.disabled);
      days.forEach((b) => { b.tabIndex = -1; });
      const t = target || days.find((b) => b.getAttribute("aria-pressed") === "true") || days[0];
      if (t) t.tabIndex = 0;
      return t;
    }

    function render(dir = 0) {
      const y = view.getFullYear();
      const m = view.getMonth();
      label.textContent = capitalize(fmtMonth.format(view));
      prev.disabled = view <= firstMonth;
      next.disabled = view >= lastMonth;
      const offset = new Date(y, m, 1).getDay();
      const total = new Date(y, m + 1, 0).getDate();
      const frag = document.createDocumentFragment();
      for (let i = 0; i < offset; i++) {
        const s = document.createElement("span");
        s.className = "day day-empty";
        s.setAttribute("aria-hidden", "true");
        frag.appendChild(s);
      }
      for (let n = 1; n <= total; n++) {
        const d = new Date(y, m, n);
        const info = disponibilidade(d);
        const iso = toISO(d);
        const b = document.createElement("button");
        b.type = "button";
        b.className = `day day-${info.status}`;
        b.dataset.date = iso;
        b.style.setProperty("--i", offset + n);
        if (+d === +today) b.classList.add("day-hoje");
        b.setAttribute("aria-pressed", selected && toISO(selected) === iso ? "true" : "false");
        b.setAttribute("aria-label", `${capitalize(fmtLong.format(d))}: ${statusText(info)}`);
        b.tabIndex = -1;
        if (info.status === "passado" || info.status === "fechado" || info.status === "lotado") b.disabled = true;
        else b.dataset.tip = capitalize(statusText(info));
        let inner = `<span class="day-n">${n}</span>`;
        if (info.periodos.length) inner += `<span class="day-dots" aria-hidden="true">${info.periodos.map((p) => `<i class="${p.livre ? "on" : "off"}"></i>`).join("")}</span>`;
        b.innerHTML = inner;
        frag.appendChild(b);
      }
      grid.replaceChildren(frag);
      if (motionOK() && dir) restart(grid, dir < 0 ? "anim-l" : "anim-r");
      roving();
    }

    function renderSlots(isNew) {
      if (!selected) {
        slotsBox.innerHTML = '<p class="slots-empty">Toque em um dia livre para ver os horários.</p>';
        return;
      }
      const info = disponibilidade(selected);
      slotsBox.innerHTML = `
        <p class="slots-title">${capitalize(fmtLong.format(selected))}</p>
        <div class="slot-list" role="group" aria-label="Horários deste dia">
          ${info.periodos.map((p) => `
            <button type="button" class="slot" data-period="${p.id}" aria-pressed="${period && period.id === p.id ? "true" : "false"}" ${p.livre ? "" : "disabled"}>
              <strong>${p.nome}</strong><span>${p.horario}</span><em>${p.livre ? "Livre" : "Reservado"}</em>
            </button>`).join("")}
        </div>
        <button type="button" class="btn btn-sun slots-go" data-go ${period ? "" : "hidden"}><span>Continuar com essa data</span></button>`;
      if (isNew && motionOK()) restart(slotsBox, "is-new");
    }

    function select(d, btn) {
      selected = d;
      period = null;
      $$('.day[aria-pressed="true"]', grid).forEach((x) => x.setAttribute("aria-pressed", "false"));
      const b = btn || grid.querySelector(`[data-date="${toISO(d)}"]`);
      if (b) { b.setAttribute("aria-pressed", "true"); roving(b); }
      const livres = disponibilidade(d).periodos.filter((p) => p.livre);
      if (livres.length === 1) period = CONFIG.periodos.find((p) => p.id === livres[0].id) || null;
      renderSlots(true);
      emit();
    }

    function goTo(d) {
      const month = new Date(d.getFullYear(), d.getMonth(), 1);
      const dir = month > view ? 1 : month < view ? -1 : 0;
      view = month;
      render(dir);
      select(d);
    }

    function nextFree(dow) {
      const end = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      for (let d = new Date(minDate); d <= end; d = addDays(d, 1)) {
        if ((dow === undefined || d.getDay() === dow) && disponibilidade(d).livres > 0) return d;
      }
      return null;
    }

    function focusCalendar() {
      const cal = $("#calendario");
      if (cal) cal.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "center" });
      const t = roving();
      if (t) setTimeout(() => t.focus({ preventScroll: true }), motionOK() ? 450 : 0);
    }

    // eventos
    prev.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(-1); });
    next.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(1); });

    grid.addEventListener("click", (e) => {
      const b = e.target.closest("button.day");
      if (!b || b.disabled) return;
      select(fromISO(b.dataset.date), b);
    });

    grid.addEventListener("keydown", (e) => {
      const b = e.target.closest("button.day");
      if (!b) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      let d = fromISO(b.dataset.date);
      for (let tries = 0; tries < 70; tries++) {
        d = addDays(d, moves[e.key]);
        const month = new Date(d.getFullYear(), d.getMonth(), 1);
        if (month < firstMonth || month > lastMonth) return;
        if (+month !== +view) { const dir = month > view ? 1 : -1; view = month; render(dir); }
        const t = grid.querySelector(`[data-date="${toISO(d)}"]`);
        if (t && !t.disabled) { roving(t); t.focus(); return; }
      }
    });

    slotsBox.addEventListener("click", (e) => {
      const s = e.target.closest(".slot");
      if (s && !s.disabled) {
        period = CONFIG.periodos.find((p) => p.id === s.dataset.period) || null;
        $$(".slot", slotsBox).forEach((x) => x.setAttribute("aria-pressed", String(x === s)));
        const go = $("[data-go]", slotsBox);
        if (go) go.hidden = !period;
        const r = s.getBoundingClientRect();
        Sparkles.burst(r.left + r.width * 0.75, r.top + r.height * 0.3, 10, 5);
        emit();
        return;
      }
      if (e.target.closest("[data-go]")) goSubs.forEach((fn) => fn());
    });

    // primeira renderização + entrada quando o calendário aparece na tela
    render(0);
    if (motionOK() && "IntersectionObserver" in window) {
      grid.classList.add("is-waiting");
      const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        grid.classList.remove("is-waiting");
        restart(grid, "anim-in");
      }, { threshold: 0.2 });
      io.observe(grid);
    }

    return {
      onChange: (fn) => changeSubs.push(fn),
      onGo: (fn) => goSubs.push(fn),
      goTo,
      nextFree,
      info: disponibilidade,
      focus: focusCalendar,
    };
  }

  /* ======================================================================
     10. Pedido (mini formulário → WhatsApp)
     ====================================================================== */
  function initPedido(Agenda, Sparkles) {
    const form = $("#pedido");
    if (!form) return;
    const code = `MM-${Math.floor(1000 + Math.random() * 9000)}`;
    const codeEl = $("[data-code]", form);
    if (codeEl) codeEl.textContent = code;

    const state = { date: null, period: null };
    const sum = {
      evento: $('[data-sum="evento"]', form),
      convidados: $('[data-sum="convidados"]', form),
      data: $('[data-sum="data"]', form),
      periodo: $('[data-sum="periodo"]', form),
    };
    const datePick = $("#date-pick");
    const dateText = $("[data-date-text]", form);
    const dateHint = $("[data-date-hint]", form);
    const openCal = $("[data-open-cal]", form);
    const nome = $("#f-nome");
    const status = $("#form-status");
    const fallback = $("#form-fallback");
    const submit = $('button[type="submit"]', form);
    const conds = $$(".cond", form);

    const radioVal = (name) => {
      const r = form.querySelector(`input[name="${name}"]:checked`);
      return r ? r.value : "";
    };

    const setSum = (key, value, empty) => {
      const dd = sum[key];
      if (!dd) return;
      const txt = value || empty;
      if (dd.textContent === txt) return;
      dd.textContent = txt;
      dd.classList.toggle("is-empty", !value);
      if (motionOK()) restart(dd, "flip-in");
    };

    const renderDate = () => {
      dateText.textContent = "";
      if (!state.date) {
        dateText.textContent = "Nenhuma data escolhida ainda";
        datePick.classList.remove("has-date");
        dateHint.hidden = false;
        openCal.textContent = "Escolher no calendário";
        return;
      }
      const strong = document.createElement("strong");
      strong.textContent = capitalize(fmtLong.format(state.date));
      const small = document.createElement("span");
      small.textContent = state.period ? `${state.period.nome}, ${state.period.horario}` : "Falta escolher o horário";
      dateText.append(strong, small);
      datePick.classList.add("has-date");
      dateHint.hidden = true;
      openCal.textContent = "Trocar data";
    };

    const refresh = () => {
      const evento = radioVal("evento");
      conds.forEach((c) => c.classList.toggle("is-on", c.dataset.when === evento));
      setSum("evento", evento, "a escolher");
      setSum("convidados", radioVal("convidados"), "a definir");
      setSum("data", state.date ? shortDate(state.date) : "", "a definir");
      setSum("periodo", state.period ? `${state.period.nome}, ${state.period.horario}` : "", "a definir");
      renderDate();
    };

    const fieldOf = (name) => form.querySelector(`[data-field="${name}"]`);
    const showError = (name) => {
      const f = fieldOf(name);
      if (!f) return;
      f.classList.add("is-invalid");
      const er = $(".err", f);
      if (er) er.hidden = false;
      if (name === "nome") nome.setAttribute("aria-invalid", "true");
    };
    const clearError = (name) => {
      const f = fieldOf(name);
      if (!f) return;
      f.classList.remove("is-invalid");
      const er = $(".err", f);
      if (er) er.hidden = true;
      if (name === "nome") nome.removeAttribute("aria-invalid");
    };
    const resetSent = () => {
      status.textContent = "";
      fallback.hidden = true;
      form.classList.remove("is-sent");
    };

    const focusNext = () => {
      let target = null;
      if (!radioVal("evento")) target = form.querySelector('input[name="evento"]');
      else if (!nome.value.trim()) target = nome;
      else target = submit;
      target.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "center" });
      setTimeout(() => target.focus({ preventScroll: true }), motionOK() ? 400 : 0);
    };

    form.addEventListener("change", (e) => {
      if (e.target.name === "evento") clearError("evento");
      resetSent();
      refresh();
    });
    form.addEventListener("input", (e) => {
      if (e.target === nome) clearError("nome");
      resetSent();
    });
    openCal.addEventListener("click", () => { if (Agenda) Agenda.focus(); });

    if (Agenda) {
      Agenda.onChange(({ date, period }) => { state.date = date; state.period = period; resetSent(); refresh(); });
      Agenda.onGo(focusNext);
    }

    // “Quero uma festa …” nos cards já marca o tipo no pedido
    $$("[data-pick-event]").forEach((a) => a.addEventListener("click", () => {
      const r = form.querySelector(`input[name="evento"][value="${a.dataset.pickEvent}"]`);
      if (!r) return;
      r.checked = true;
      clearError("evento");
      refresh();
      const chip = r.closest(".chip");
      if (chip && motionOK()) setTimeout(() => restart(chip, "flash"), 700);
    }));

    const buildMessage = () => {
      const evento = radioVal("evento");
      const conv = radioVal("convidados");
      const aniv = $("#f-aniv").value.trim();
      const idade = parseInt($("#f-idade").value, 10);
      const celebra = $("#f-celebra").value.trim();
      const empresa = $("#f-empresa").value.trim();
      const obs = $("#f-obs").value.trim();
      const lines = [
        "Olá, Mundo Mágico! 💫",
        "Quero consultar a disponibilidade e receber um orçamento.",
        "",
        `*Pedido ${code}*`,
        `• Nome: ${nome.value.trim()}`,
        `• Evento: ${evento}`,
      ];
      if (evento === "Festa infantil" && (aniv || idade)) {
        const anos = idade > 0 ? `${idade} ${idade === 1 ? "ano" : "anos"}` : "";
        lines.push(`• Aniversariante: ${[aniv, anos].filter(Boolean).join(", ")}`);
      }
      if (evento === "Festa em família" && celebra) lines.push(`• Celebração: ${celebra}`);
      if (evento === "Evento corporativo" && empresa) lines.push(`• Empresa: ${empresa}`);
      lines.push(`• Data: ${state.date ? `${fmtWeekday.format(state.date)}, ${fmtNum.format(state.date)}` : "ainda vou definir"}`);
      if (state.period) lines.push(`• Horário: ${state.period.nome} (${state.period.horario})`);
      else if (state.date) lines.push("• Horário: a combinar");
      if (conv) lines.push(`• Convidados: ${conv}`);
      if (obs) lines.push(`• Observações: ${obs}`);
      lines.push("", "Enviado pelo site");
      return lines.join("\n");
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let firstBad = null;
      if (!radioVal("evento")) { showError("evento"); firstBad = form.querySelector('input[name="evento"]'); }
      if (!nome.value.trim()) { showError("nome"); firstBad = firstBad || nome; }
      if (firstBad) {
        if (motionOK()) restart(form, "shake");
        firstBad.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "center" });
        firstBad.focus({ preventScroll: true });
        return;
      }
      const url = waUrl(buildMessage());
      fallback.href = url;
      fallback.hidden = false;
      status.textContent = "Pedido pronto! Se o WhatsApp não abrir sozinho, toque no link abaixo.";
      restart(form, "is-sent");
      const r = submit.getBoundingClientRect();
      Sparkles.burst(r.left + r.width / 2, r.top, 34, 9);
      window.open(url, "_blank", "noopener");
    });

    refresh();
  }

  // Selo “próximo sábado livre” no topo
  function initNextFree(Agenda) {
    const link = $("[data-next-free]");
    if (!link || !Agenda) return;
    const d = Agenda.nextFree(6);
    if (!d) return;
    const textEl = $("[data-next-free-text]", link);
    textEl.textContent = `Próximo sábado com horário livre: ${fmtDayMonth.format(d)}`;
    if (Agenda.info(d).livres === 1) {
      const tag = document.createElement("em");
      tag.className = "next-free-tag";
      tag.textContent = "só 1 horário";
      link.appendChild(tag);
    }
    link.hidden = false;
    link.addEventListener("click", () => Agenda.goTo(d));
  }

  /* ======================================================================
     11. Início
     ====================================================================== */
  function init() {
    const Sparkles = createSparkles();
    initWhatsapp();
    initHeader();
    initMenu();
    initReveal();
    initButtonFill();
    initMagnetic();
    initTilt();
    initLetters(Sparkles);
    initHeroTrail(Sparkles);
    initFaq();
    initLightbox();
    initFloat();
    initTouchTexts();

    const Agenda = createAgenda(Sparkles);
    initPedido(Agenda, Sparkles);
    initNextFree(Agenda);

    $$("[data-year]").forEach((el) => { el.textContent = String(new Date().getFullYear()); });

    heroScene();
    tapesScene();
    deckScene();
    statementScene();
    reelScene();
    trailScene();
    footerScene();
    parallaxScene();
    Engine.start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
