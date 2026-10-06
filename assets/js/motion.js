/* ==========================================================================
   وِكاد — طبقة الحركة
   Lenis للتمرير الناعم، وGSAP لافتتاحية الواجهة والإزاحة عند النزول.
   كل شيء اختياري: إن لم تُحمَّل المكتبة، أو طلب الجهاز تقليل الحركة،
   تظهر الصفحة كاملة وثابتة بلا أي نقص في المحتوى.
   ========================================================================== */
(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // ---------- التمرير الناعم ----------
  let lenis = null;

  if (!reduced && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({
      duration: 1.05,
      easing: (x) => Math.min(1, 1.001 - (2 ** (-10 * x))),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });

    // scroll-behavior من CSS يتعارك مع Lenis، فنوقفه عند تشغيله فقط
    root.classList.add('lenis-on');

    const frame = (time) => { lenis.raf(time); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);

    // روابط الصفحة تمرّ عبر Lenis حتى تبقى الحركة واحدة
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -70 });
    });

    // app.js يستعملها لتمرير خطوات الحجز
    window.wekadScrollTo = (target, offset = -80) => lenis.scrollTo(target, { offset });
    window.wekadLenis = lenis;
  }

  // ---------- افتتاحية الواجهة ----------
  const gsap = window.gsap;
  if (!gsap || reduced) return;

  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  const pick = (name) => document.querySelectorAll(`[data-hero="${name}"]`);
  const lines = pick('line');
  if (!lines.length) return;                       // لسنا في الصفحة الرئيسية

  // الحالة الابتدائية تُضبط من جافاسكربت لا من CSS: إن فشل التحميل يبقى كل شيء ظاهراً
  gsap.set(lines, { yPercent: 115 });
  gsap.set([pick('eyebrow'), pick('lede'), pick('cta'), pick('foot')], { opacity: 0, y: 18 });
  gsap.set(pick('mark'), { opacity: 0, y: 26, filter: 'blur(10px)' });
  gsap.set(pick('rule'), { scaleX: 0 });
  gsap.set(pick('motif'), { opacity: 0, scale: 1.12, rotate: -4 });
  gsap.set(pick('img'), { scale: 1.16 });

  const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });

  // الإيقاع متعمَّد لكنه قصير: الزر الأساسي يصل خلال ثانية ونصف تقريباً
  intro
    .to(pick('img'), { scale: 1, duration: 2, ease: 'power2.out' })
    .to(pick('motif'), { opacity: 0.05, scale: 1, rotate: 0, duration: 2.1, ease: 'power3.out' }, 0)
    .to(pick('eyebrow'), { opacity: 1, y: 0, duration: 0.9 }, 0.12)
    .to(pick('mark'), { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2 }, 0.2)
    .to(lines, { yPercent: 0, duration: 1.1, stagger: 0.1 }, 0.5)
    .to(pick('rule'), { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }, 0.8)
    .to(pick('lede'), { opacity: 1, y: 0, duration: 0.9 }, 0.85)
    .to(pick('cta'), { opacity: 1, y: 0, duration: 0.9 }, 0.95)
    .to(pick('foot'), { opacity: 1, y: 0, duration: 0.9 }, 1.05)
    // مسحة الضوء تمرّ مرة واحدة فوق الحرير
    .fromTo(pick('sheen'),
      { xPercent: 0, opacity: 0 },
      { xPercent: 420, opacity: 1, duration: 1.9, ease: 'power2.inOut' }, 0.35)
    .to(pick('sheen'), { opacity: 0, duration: 0.5 }, '-=0.5');

  // ---------- الإزاحة عند النزول ----------
  if (!window.ScrollTrigger) return;

  const hero = document.querySelector('.hero');
  const scroller = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };

  gsap.to(pick('img'), { yPercent: 14, scale: 1.1, ease: 'none', scrollTrigger: scroller });
  gsap.to(pick('motif'), { yPercent: -18, rotate: 5, ease: 'none', scrollTrigger: scroller });
  gsap.to('.hero-in', { yPercent: -12, opacity: 0.15, ease: 'none', scrollTrigger: scroller });
  gsap.to(pick('foot'), { opacity: 0, ease: 'none', scrollTrigger: { ...scroller, end: '30% top' } });

  if (lenis) window.ScrollTrigger.addEventListener('refresh', () => lenis.resize());
})();
