/* ============================================================
   GIMME.DOMAINS — Shared App JS
   ============================================================ */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8787/v1'
  : 'https://api.gimme.domains/v1';

// ---------- NAV SCROLL ----------
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const tick = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', tick, { passive: true });
  tick();
})();

// ---------- HAMBURGER ----------
(function () {
  const btn = document.getElementById('hamburger');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
})();

// ---------- SEARCH ROUTING ----------
function handleSearch(inputId) {
  const input = document.getElementById(inputId || 'heroSearch');
  if (!input) return;
  const raw = input.value.trim().toLowerCase();
  if (!raw) { input.focus(); return; }
  const domain = raw
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
  if (!domain) return;
  window.location.href = `status.html?domain=${encodeURIComponent(domain)}`;
}

(function () {
  document.querySelectorAll('.search-box input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch(input.id);
      }
    });
  });
})();

// ---------- FADE-UP ON SCROLL ----------
(function () {
  const els = document.querySelectorAll('.fade-up');
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  els.forEach((el, i) => {
    el.style.transitionDelay = `${i * 60}ms`;
    io.observe(el);
  });
})();

// ---------- STAGGER CARDS ----------
(function () {
  const cards = document.querySelectorAll('.step-card, .protect-card, .pricing-card, .rescue-option');
  if (!cards.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const idx = Array.from(cards).indexOf(e.target);
        setTimeout(() => e.target.classList.add('in-view'), idx * 80);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.06 });
  cards.forEach(c => {
    c.style.opacity = '0';
    c.style.transform = 'translateY(18px)';
    c.style.transition = 'opacity 0.45s cubic-bezier(0.16,1,0.3,1), transform 0.45s cubic-bezier(0.16,1,0.3,1)';
    io.observe(c);
  });
  const style = document.createElement('style');
  style.textContent = `
    .step-card.in-view,.protect-card.in-view,.pricing-card.in-view,.rescue-option.in-view
    { opacity:1 !important; transform:translateY(0) !important; }
    .pricing-card--featured.in-view { transform:scale(1.03) translateY(0) !important; }
  `;
  document.head.appendChild(style);
})();

// ---------- DOMAIN UTILITIES ----------
function parseDomain(raw) {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

function domainFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return parseDomain(params.get('domain') || '');
}

// ---------- API HELPERS ----------
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}

// ---------- COPY TO CLIPBOARD ----------
function copyText(text, el) {
  navigator.clipboard.writeText(text).then(() => {
    if (!el) return;
    const orig = el.textContent;
    el.textContent = 'Copied!';
    setTimeout(() => { el.textContent = orig; }, 1800);
  });
}
