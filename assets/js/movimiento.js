/* Movimiento decorativo (adaptado de movimiento.js de la página de venta). Nunca bloquea el formulario.
   Se carga en <head> SIN defer para marcar <html class="mov"> antes del primer pintado; el resto corre al terminar de cargar el DOM. */
(function () {
  'use strict';
  var html = document.documentElement;
  if (!('IntersectionObserver' in window)) return;   // sin observador: todo queda visible y quieto
  html.classList.add('mov');

  document.addEventListener('DOMContentLoaded', function () {
    var reducir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Título principal palabra por palabra
    var h1 = document.querySelector('.hero h1');
    if (h1 && !reducir) {
      var i = 0, frag = document.createDocumentFragment();
      Array.prototype.slice.call(h1.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            var sp = document.createElement('span'); sp.className = 'pal'; sp.style.setProperty('--i', i++); sp.textContent = t; frag.appendChild(sp);
          });
        } else {
          var w = document.createElement('span'); w.className = 'pal'; w.style.setProperty('--i', i++); w.appendChild(n.cloneNode(true)); frag.appendChild(w);
        }
      });
      h1.textContent = ''; h1.appendChild(frag);
      setTimeout(function () { h1.classList.add('listo'); }, 80 + i * 45 + 250);
    } else if (h1) { h1.classList.add('listo'); }

    // Secciones: aparecen una sola vez al llegar a ellas (el formulario no se oculta nunca)
    var objetivos = document.querySelectorAll('.sec .sec-h .eyebrow, .sec .sec-h h2, .sec .sec-h .lead, .sec .info, .sec .resp, .sec > .wrap > .wsp');
    var grupo = new Map();
    objetivos.forEach(function (el) {
      el.classList.add('aparece');
      var padre = el.parentNode, k = grupo.get(padre) || 0;
      el.style.transitionDelay = Math.min(k, 4) * 70 + 'ms';
      grupo.set(padre, k + 1);
    });
    var ver = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (en.isIntersecting) {
          var el = en.target; el.classList.add('visible'); ver.unobserve(el);
          setTimeout(function () { el.style.transitionDelay = ''; }, 1000);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    objetivos.forEach(function (el) { ver.observe(el); });
  });
})();
