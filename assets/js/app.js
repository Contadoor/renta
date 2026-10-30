/* ═══════════════════════════════════════════════════════════════════════
   Preparemos tu Renta 2027 · lógica del formulario público (sin frameworks, sin build)
   API: Edge renta-publica (contrato RENTA_PREPARACION_PAQUETE.md §2).
   SEGURIDAD (RENTA_PREPARACION_SEGURIDAD.md):
   - El token de sesión vive SOLO en la variable `sesion` de este cierre. Nunca en localStorage, sessionStorage,
     cookies, IndexedDB, la URL, history.state ni en `window`. Si se recarga la página, se pide un código nuevo.
   - Los números de cuenta viajan solo a la Edge (que los cifra). Tras un guardado exitoso se borran de la memoria
     y en pantalla quedan como ••••1234.
   - No se guarda ningún borrador en el navegador: el borrador vive en el servidor.
   - Claves SII (paquete F): campos type=password + autocomplete=new-password, sin botón "mostrar". Viven solo en memoria de este cierre,
     viajan solo a la Edge (que las cifra con la bóveda de Gestoor) y se borran de la memoria y de los campos apenas el servidor confirma.
     Nunca se muestran, ni en el resumen. Nunca en storage, URL, consola ni `window`.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Anti-clickjacking parcial (GitHub Pages no permite frame-ancestors por cabecera). */
  if (window.top !== window.self) {
    try { window.top.location.replace(window.self.location.href); } catch (e) { /* sin acceso al marco superior */ }
    document.body.textContent = '';
    return;
  }

  var CFG = window.RENTA_CONFIG || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────── Estado (solo en memoria) ─────────── */
  var sesion = null;            // token de sesión: SOLO aquí
  var verificado = false;
  var cerrado = false;
  var enviada = false;
  var PRE = null;               // respuesta de "precarga"
  var rutEmp = '';              // RUT normalizado de la empresa (12345678-5)
  var version = 0;
  var paso = 0;
  var uid = 0;
  var socios = [];
  var est = { empresa: '', contacto: '', correo: '', cuenta_empresa: '' };
  var siiEmp = { misma: '', c1: '', c2: '', entregadaAt: '' };   // clave SII de la empresa (solo memoria)
  var claveEmpRegistrada = true;
  var claveEmpConfirmada = false;  // el servidor confirma (true estricto) una clave SII activa de la empresa → no se pregunta
  var guardadoEmp4 = '';        // últimos 4 de la cuenta de la empresa ya guardada en el borrador
  var cambios = 0;              // contador de cambios sin guardar
  var cola = Promise.resolve(); // guardados en serie (versión optimista)
  var ultimasCuentas = [];
  var rutAcceso = '';

  var NOMBRES = ['Acceso', 'Empresa', 'Socios', 'Objetivos', 'Contexto', 'Resumen', 'Listo'];
  var BANCOS = ['Banco de Chile / Edwards', 'BancoEstado', 'Santander', 'BCI / MACH', 'Itaú', 'Scotiabank', 'BICE', 'Security', 'Banco Falabella',
    'Banco Ripley', 'Consorcio', 'Banco Internacional', 'BTG Pactual', 'Coopeuch', 'Tenpo', 'Mercado Pago', 'Otro'];
  var TIPOS = [{ v: 'corriente', t: 'Cuenta corriente' }, { v: 'vista', t: 'Cuenta vista / CuentaRUT' }, { v: 'ahorro', t: 'Cuenta de ahorro' }];
  var OTROS = { sueldo_otra: 'Sueldo en otra empresa', honorarios: 'Boletas de honorarios', arriendos: 'Arriendos', otras_sociedades: 'Otras sociedades' };
  var AHORRO = { apv: 'APV', dividendo: 'Crédito hipotecario (dividendo)' };
  var SINO = { si: 'Sí', no: 'No', nose: 'No sé' };
  var OBJ_NOM = { menos: 'Pagar lo menos posible, dentro de la ley', retiros: 'Retirar utilidades', reinvertir: 'Reinvertir en la empresa', inversion: 'Hacer una inversión',
    bancos: 'Ser más solvente para los bancos', deudas: 'Ordenar deudas tributarias o previsionales', regimen: 'Cambiar de régimen tributario', otro: 'Otro objetivo' };
  var FOCO = { empresa: 'Impuesto de la empresa', socios: 'Impuesto de los socios', ambos: 'Ambos' };
  var CREDITO = { si: 'Sí', no: 'No', tal_vez: 'Tal vez' };
  var DEUDA = { tributaria: 'Tributaria', previsional: 'Previsional', ambas: 'Ambas' };
  var VENTAS = { mas: 'Más', igual: 'Parecido', menos: 'Menos', nose: 'No sé' };
  var EVENTOS = { venta_activos: 'Venta de activos', socios: 'Entrada o salida de socios', contratacion: 'Contratación de personal',
    prestamo_socio_empresa: 'Préstamos de socios a la empresa', prestamo_empresa_socio: 'Préstamos de la empresa a socios', ninguno: 'Ninguno' };

  /* Textos cercanos para cada error de la API. */
  var TEXTOS = {
    SOLICITUD_INVALIDA: 'Algo no salió bien de nuestro lado. Intenta de nuevo en un momento.',
    ACCION_INVALIDA: 'Algo no salió bien de nuestro lado. Intenta de nuevo en un momento.',
    METODO: 'Algo no salió bien de nuestro lado. Intenta de nuevo en un momento.',
    RUT_INVALIDO: 'Revisa el RUT: parece que el dígito verificador no calza.',
    DATOS_INVALIDOS: 'Hay un dato que no pudimos guardar. Revisa los campos de este paso.',
    RUT_SOCIO_INVALIDO: 'Revisa el RUT de uno de los socios: el dígito verificador no calza.',
    SOCIO_REPETIDO: 'Hay un socio repetido (mismo RUT). Quita uno de los dos.',
    CUENTA_INVALIDA: 'Revisa los datos de la cuenta bancaria: banco, tipo y número (entre 4 y 20 dígitos).',
    TITULAR_NO_COINCIDE: 'La cuenta debe estar a nombre de su dueño: el RUT del titular no coincide.',
    INCOMPLETO: 'Falta completar algo antes de enviar. Te llevo al paso que falta.',
    CODIGO_INVALIDO: 'El código no es correcto o ya venció. Revisa el último correo que te llegó o pide uno nuevo.',
    SESION_INVALIDA: 'Tu sesión terminó (dura 2 horas). Pide un código nuevo: lo que ya se guardó sigue ahí.',
    ORIGEN: 'Este formulario solo funciona desde contadoor.github.io/renta.',
    VERSION_DESACTUALIZADA: 'Tus respuestas se editaron en otra pestaña o dispositivo. Cargamos la versión más reciente.',
    YA_ENVIADA: 'Ya habíamos recibido tus respuestas. ¡Gracias!',
    DEMASIADOS_INTENTOS: 'Hiciste varios intentos seguidos. Espera unos minutos y vuelve a probar.',
    NO_DISPONIBLE: 'Todavía no abrimos el formulario. Te avisaremos por correo.',
    ERROR_INTERNO: 'Tuvimos un problema al procesar tu solicitud. Intenta de nuevo en un momento.',
    RED: 'No pudimos conectarnos. Revisa tu conexión a internet e intenta de nuevo.',
    MUY_GRANDE: 'Tus respuestas quedaron muy largas. Acorta un poco los comentarios e intenta de nuevo.',
    CLAVES_NO_COINCIDEN: 'Las dos claves SII no coinciden. Escríbelas de nuevo.',
    CLAVE_INVALIDA: 'Revisa la clave SII: debe tener entre 4 y 64 caracteres.',
    CLAVE_NO_GUARDADA: 'No pudimos guardar una de las claves SII. Tus respuestas sí quedaron guardadas: avísanos por WhatsApp y lo revisamos.',
    SIN_SOBRE: 'No pudimos proteger la clave SII en este navegador, así que no la enviamos. Actualiza la página e intenta de nuevo (o usa otro navegador actualizado).',
    CLAVE_EN_CLARO: 'No pudimos proteger la clave SII en este navegador, así que no la enviamos. Actualiza la página e intenta de nuevo.',
    CORREOS_NO_COINCIDEN: 'Los dos correos no coinciden. Escríbelos de nuevo.',
    CORREO_INVALIDO: 'Revisa el correo: parece que el formato no es válido.'
  };
  var CERRADO = ['NO_DISPONIBLE', 'CAMPANA_CERRADA', 'CAMPANA_NO_ABIERTA', 'NO_ABIERTO', 'CERRADO'];
  function texto(codigo) { return TEXTOS[codigo] || TEXTOS.ERROR_INTERNO; }

  /* ─────────── Utilidades ─────────── */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function limpiaRut(s) { return String(s || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
  function dvRut(n) { var s = 0, m = 2; for (var i = n.length - 1; i >= 0; i--) { s += (+n[i]) * m; m = m === 7 ? 2 : m + 1; } var r = 11 - (s % 11); return r === 11 ? '0' : (r === 10 ? 'K' : String(r)); }
  /* Misma regla que validar.ts (rutNormal): cuerpo de 7 u 8 dígitos + DV. */
  function rutNormal(s) { var c = limpiaRut(s); if (c.length < 8 || c.length > 9) return ''; var cu = c.slice(0, -1), dv = c.slice(-1); if (!/^\d{7,8}$/.test(cu)) return ''; return dvRut(cu) === dv ? cu + '-' + dv : ''; }
  function rutValido(s) { return !!rutNormal(s); }
  function formatoRut(s) { var c = limpiaRut(s); if (c.length < 2) return String(s || ''); var cu = c.slice(0, -1), dv = c.slice(-1); return cu.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv; }
  function pctNum(s) { var t = String(s == null ? '' : s).trim(); if (!t) return null; if (!/^\d{1,3}([.,]\d{1,2})?$/.test(t)) return NaN; var n = Number(t.replace(',', '.')); return n >= 0 && n <= 100 ? n : NaN; }
  function num(s) { var n = pctNum(s); return n === null || isNaN(n) ? 0 : n; }
  function clp(s) { var d = String(s || '').replace(/\D/g, '').replace(/^0+(?=\d)/, ''); if (!d) return ''; return '$ ' + d.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function monto(s) { var d = String(s == null ? '' : s).replace(/\D/g, ''); if (!d) return null; var n = Number(d); return Number.isFinite(n) && n <= 1e13 ? n : null; }
  function clpDe(n) { return n == null ? '' : clp(String(n)); }
  function iniciales(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); if (!p.length) return '?'; return ((p[0][0] || '') + (p.length > 1 ? p[1][0] : '')).toUpperCase(); }
  function radioVal(name, ctx) { var el = $('input[name="' + name + '"]:checked', ctx); return el ? el.value : ''; }
  function radioMarcado(name, ctx) { return !!$('input[name="' + name + '"]:checked', ctx); }
  function setRadio(name, v, ctx) { $$('input[name="' + name + '"]', ctx).forEach(function (r) { r.checked = r.value === v && v !== undefined && v !== null; }); }
  function checks(name, ctx) { return $$('input[name="' + name + '"]:checked', ctx).map(function (e) { return e.value; }); }
  function fmtPct(n) { return (Math.round(n * 100) / 100).toString().replace('.', ',') + '%'; }
  function numeroCuenta(s) { return String(s || '').replace(/[\s.-]/g, ''); }
  function numeroOk(s) { return /^\d{4,20}$/.test(numeroCuenta(s)); }
  function enmascara(n) { var d = numeroCuenta(n); return d ? '••••' + d.slice(-4) : ''; }
  function tipoTxt(v) { for (var i = 0; i < TIPOS.length; i++) if (TIPOS[i].v === v) return TIPOS[i].t; return v || ''; }
  function titularNoCoincide(tit, dueno) { var a = rutNormal(tit), b = rutNormal(dueno); return !!(a && b && a !== b); }
  function hora(iso) { try { var d = iso ? new Date(iso) : new Date(); return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function fecha(iso) { try { return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } }
  function regCuenta(titular, rut) {
    var l = (PRE && PRE.cuentas_registradas) || [];
    for (var i = 0; i < l.length; i++) if (l[i].titular === titular && rutNormal(l[i].titular_rut) === rutNormal(rut)) return l[i];
    return null;
  }
  function txtCuentaReg(c) { return [c.banco, tipoTxt(c.tipo), c.ultimos4 ? '••••' + c.ultimos4 : ''].filter(Boolean).join(' · '); }

  /* ─────────── API ─────────── */
  function llamar(accion, extra, op) {
    op = op || {};
    var cuerpo = { accion: accion };
    if (extra) Object.keys(extra).forEach(function (k) { cuerpo[k] = extra[k]; });
    var json = JSON.stringify(cuerpo);
    if (json.length > 68000) return Promise.resolve({ ok: false, status: 0, data: { ok: false, error: 'MUY_GRANDE' } });
    var h = { 'Content-Type': 'application/json' };
    if (CFG.ENVIAR_APIKEY && CFG.SUPABASE_ANON_KEY) h.apikey = CFG.SUPABASE_ANON_KEY;
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    return fetch(CFG.API_URL, { method: 'POST', headers: h, body: json, mode: 'cors', credentials: 'omit', cache: 'no-store',
      referrerPolicy: 'no-referrer', keepalive: !!op.keepalive, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, error: r.ok ? 'ERROR_INTERNO' : (r.status === 503 ? 'NO_DISPONIBLE' : 'ERROR_INTERNO') }; })
          .then(function (d) { return { ok: r.ok && d && d.ok === true, status: r.status, data: d || {} }; });
      }, function () { return { ok: false, status: 0, data: { ok: false, error: 'RED' } }; })
      .then(function (res) { if (t) clearTimeout(t); return res; });
  }
  function errDe(r) { return (r && r.data && r.data.error) || 'ERROR_INTERNO'; }
  function esCerrado(r) { return CERRADO.indexOf(errDe(r)) > -1; }

  /* ─────────── Avisos ─────────── */
  function aviso(txt, tipo) {
    var a = $('#aviso-general');
    if (!txt) { a.hidden = true; return; }
    a.className = 'aviso ' + (tipo || 'info');
    $('#aviso-general-txt').textContent = txt;
    a.hidden = false;
  }
  function muestraError(m) { var e = $('#msg-error'); e.textContent = m; e.classList.add('on'); }
  function ocultaError() { var e = $('#msg-error'); e.textContent = ''; e.classList.remove('on'); }
  function errAcceso(id, m) { var e = $(id); e.textContent = m || ''; e.classList.toggle('on', !!m); }
  function ocupado(btn, si) { if (!btn) return; btn.disabled = !!si; if (si) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); }
  function indicador(txt, clase) { var g = $('#guardado'); g.textContent = txt || ''; g.className = 'guardado' + (clase ? ' ' + clase : ''); }

  /* ─────────── Video MP4 propio (media-src 'self'; sin terceros) ─────────── */
  (function video() {
    var caja = $('#video'), v = $('#video-el'), src = String(CFG.VIDEO_MP4 || '');
    // Solo rutas locales del propio sitio (la CSP igual bloquearía otro origen).
    if (!CFG.VIDEO_DISPONIBLE || !/^assets\/[A-Za-z0-9_\-\/]+\.mp4$/.test(src)) return;
    var muestraPoster = function () { v.hidden = true; v.removeAttribute('src'); $('#video-poster').hidden = false; $('#video-pronto').hidden = false; caja.classList.add('sin-video'); };
    v.addEventListener('error', muestraPoster);
    v.src = src;
    v.hidden = false; $('#video-poster').hidden = true; $('#video-pronto').hidden = true; caja.classList.remove('sin-video');
  })();
  if (CFG.FECHA_LIMITE) $('#fecha-limite').textContent = CFG.FECHA_LIMITE;

  /* ─────────── Bancos ─────────── */
  function llenaSelect(sel, lista, ph) {
    sel.textContent = '';
    var o = document.createElement('option'); o.value = ''; o.textContent = ph; sel.appendChild(o);
    lista.forEach(function (it) { var op = document.createElement('option'); op.value = it.v; op.textContent = it.t; sel.appendChild(op); });
  }
  function llenaBancos(ctx) {
    $$('.sel-banco', ctx).forEach(function (s) { llenaSelect(s, BANCOS.map(function (b) { return { v: b, t: b }; }), 'Elige el banco'); });
    $$('.sel-tipo', ctx).forEach(function (s) { llenaSelect(s, TIPOS, 'Elige el tipo'); });
  }
  llenaBancos(document);

  /* ─────────── Bloques precargados del paso 1 ─────────── */
  function pintaBloque(k) {
    var b = $('.pre-blk[data-blk="' + k + '"]'), e = est[k];
    b.classList.toggle('es-ok', e === 'ok'); b.classList.toggle('es-fix', e === 'fix');
    $('.b-ok', b).setAttribute('aria-pressed', String(e === 'ok')); $('.b-fix', b).setAttribute('aria-pressed', String(e === 'fix'));
    $('.pre-edit', b).hidden = e !== 'fix'; $('.pre-view', b).hidden = e === 'fix' && k !== 'correo';
    var p = $('[data-est]', b); p.className = 'est-pill' + (e === 'ok' ? ' v' : e === 'fix' ? ' a' : ''); p.textContent = e === 'ok' ? 'Validado' : e === 'fix' ? 'Corregido' : '';
    if (e) $('[data-e-blk]', b).classList.remove('on');
    if (k === 'cuenta_empresa') pintaCuentaEmpresa();
  }
  function pintaCuentaEmpresa() {
    var sin = $('#be-sin').checked;
    $('#be-cheque').hidden = !sin; $('#be-campos').hidden = sin;
    $('#w-be-dir').classList.toggle('on', sin && radioVal('be-dir') === 'cambio');
    if (radioMarcado('be-dir')) $('#e-be-dir').classList.remove('on');
    $('#w-be-tit').classList.toggle('on', !sin && titularNoCoincide($('#be-tit').value, rutEmp));
    var n = $('#be-num');
    n.placeholder = guardadoEmp4 ? 'Guardado: ••••' + guardadoEmp4 + ' (déjalo en blanco para mantenerlo)' : 'Solo números';
  }
  $('#form').addEventListener('click', function (e) {
    var bt = e.target.closest('[data-pre]'); if (!bt) return;
    var b = bt.closest('.pre-blk'), k = b.dataset.blk, v = bt.dataset.pre;
    est[k] = v; marcaCambio();
    if (v === 'ok' && PRE) {   // vuelve a los datos originales
      if (k === 'empresa') llenaEmpresaEdit();
      if (k === 'contacto') llenaContactoEdit();
      if (k === 'correo') { $('#r-correo').value = ''; $('#r-correo2').value = ''; }
    }
    pintaBloque(k); ocultaError();
    if (v === 'fix') { var f = $('.pre-edit input:not([type=checkbox]), .pre-edit select', b); if (f) setTimeout(function () { f.focus(); }, 30); }
  });
  document.addEventListener('change', function (e) { if (e.target.id === 'be-sin' || e.target.name === 'be-dir') pintaCuentaEmpresa(); });
  $('#be-num').addEventListener('input', function () { this.value = this.value.replace(/[^0-9.\- ]/g, ''); });
  $('#be-tit').addEventListener('input', pintaCuentaEmpresa);
  $('#be-tit').addEventListener('blur', function () { if (this.value.trim()) this.value = formatoRut(this.value); pintaCuentaEmpresa(); });

  /* ─────────── Clave SII de la empresa ─────────── */
  function pintaSiiEmp() {
    var preg = $('#sii-emp-preg');
    // Con la clave confirmada por el servidor la tarjeta no se muestra y se responde "sigue siendo la misma" (el envío la vuelve a validar).
    $('#sii-emp').hidden = claveEmpConfirmada;
    if (claveEmpConfirmada) { siiEmp.misma = 'si'; siiEmp.c1 = ''; siiEmp.c2 = ''; $('#sii-emp-1').value = ''; $('#sii-emp-2').value = ''; return; }
    preg.hidden = !claveEmpRegistrada; $('#sii-emp-sin').hidden = claveEmpRegistrada;
    if (!claveEmpRegistrada) siiEmp.misma = 'no';
    setRadio('sii-emp', siiEmp.misma || null);
    $('#sii-emp-campos').hidden = siiEmp.misma !== 'no';
    if (siiEmp.misma) $('#e-sii-emp').classList.remove('on');
    var e = $('#sii-emp-est');
    if (siiEmp.entregadaAt && !siiEmp.c1) { e.textContent = 'Ya nos entregaste la clave nueva (' + hora(siiEmp.entregadaAt) + ', ' + fecha(siiEmp.entregadaAt) + '). Si cambió otra vez, escríbela de nuevo.'; e.className = 'estado-sii ok'; }
    else e.textContent = '';
  }
  document.addEventListener('change', function (e) { if (e.target.name === 'sii-emp') { siiEmp.misma = e.target.value; pintaSiiEmp(); } });
  ['#sii-emp-1', '#sii-emp-2'].forEach(function (id, n) {
    $(id).addEventListener('input', function () { siiEmp[n ? 'c2' : 'c1'] = this.value; this.removeAttribute('aria-invalid'); $('#e-' + id.slice(1)).classList.remove('on'); });
  });
  function claveOk(c) { return typeof c === 'string' && c.length >= 4 && c.length <= 64 && !/[\u0000-\u001f\u007f]/.test(c); }
  function correoOk(c) { return c.length <= 200 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(c); }

  function llenaEmpresaEdit() {
    var e = PRE.empresa || {};
    $('#ed-rs').value = e.razon_social || ''; $('#ed-dir').value = e.direccion || ''; $('#ed-comuna').value = e.comuna || '';
    poneRegimen(e.regimen || '');
  }
  function poneRegimen(v) {
    var sel = $('#ed-reg');
    if (v && !$$('option', sel).some(function (o) { return o.value === v; })) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); }
    sel.value = v;
  }
  function llenaContactoEdit() {
    var c = PRE.contacto || {};
    $('#r-nombre').value = c.nombre || ''; $('#r-cargo').value = ''; $('#r-rut').value = ''; $('#r-wsp').value = c.wa || '';
  }

  /* ─────────── Acceso: RUT + código ─────────── */
  var timer = null;
  function panelAcceso(cual) { $('#acc-rut').hidden = cual !== 'rut'; $('#acc-cod').hidden = cual !== 'cod'; }
  function arrancaEspera(seg) {
    var s = Math.max(1, Math.min(600, +seg || 60)), b = $('#btn-reenviar'); clearInterval(timer); b.disabled = true;
    var pinta = function () { b.textContent = s > 0 ? 'Reenviar código (' + s + ' s)' : 'Reenviar código'; b.disabled = s > 0; };
    pinta(); timer = setInterval(function () { s--; pinta(); if (s <= 0) clearInterval(timer); }, 1000);
  }
  var otps = $$('#otp input');
  function codigo() { return otps.map(function (i) { return i.value; }).join(''); }
  function limpiaOtp() { otps.forEach(function (i) { i.value = ''; }); }
  function reparte(desde, txt) { var d = String(txt).replace(/\D/g, '').split(''); for (var k = desde; k < otps.length && d.length; k++) { otps[k].value = d.shift(); } var sig = otps.filter(function (i) { return !i.value; })[0]; (sig || otps[otps.length - 1]).focus(); }
  otps.forEach(function (inp, k) {
    inp.addEventListener('input', function () {
      var v = inp.value.replace(/\D/g, '');
      if (v.length > 1) { inp.value = ''; reparte(k, v); } else { inp.value = v; if (v && k < otps.length - 1) otps[k + 1].focus(); }
      $('#e-otp').classList.remove('on');
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !inp.value && k > 0) { otps[k - 1].focus(); otps[k - 1].value = ''; e.preventDefault(); }
      if (e.key === 'Enter') { e.preventDefault(); $('#btn-cod').click(); }
    });
    inp.addEventListener('paste', function (e) { var t = (e.clipboardData || window.clipboardData).getData('text'); if (t) { e.preventDefault(); reparte(k, t); } });
  });
  $('#acc-rut-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#btn-rut').click(); } });
  $('#acc-rut-in').addEventListener('blur', function () { if (this.value.trim()) this.value = formatoRut(this.value); });
  $('#acc-rut-in').addEventListener('input', function () { errAcceso('#e-acc-api', ''); });

  function pedirCodigo(reenvio) {
    var inp = $('#acc-rut-in'), rut = rutNormal(inp.value);
    if (!reenvio) {
      inp.setAttribute('aria-invalid', rut ? 'false' : 'true'); $('#e-acc-rut').classList.toggle('on', !rut);
      if (!rut) { inp.focus(); return; }
      inp.value = formatoRut(rut);
    }
    rut = rut || rutAcceso;
    var btn = reenvio ? $('#btn-reenviar') : $('#btn-rut');
    ocupado(btn, true); errAcceso('#e-acc-api', '');
    llamar('solicitar_codigo', { rut: rut }).then(function (r) {
      ocupado(btn, false);
      if (esCerrado(r)) return mostrarCerrado();
      if (!r.ok) {
        var m = texto(errDe(r));
        if (reenvio) { $('#reenvio-est').textContent = m; $('#reenvio-est').className = 'estado-sii'; arrancaEspera(60); }
        else { errAcceso('#e-acc-api', m); if (errDe(r) === 'RUT_INVALIDO') { inp.setAttribute('aria-invalid', 'true'); inp.focus(); } }
        return;
      }
      rutAcceso = rut;
      // Respuesta indistinguible (H1): el texto es fijo y no muestra ningún correo ni parte de él, exista o no el RUT.
      if (reenvio) { $('#reenvio-est').textContent = 'Si el RUT está registrado, te enviamos un código nuevo. Usa el último que te llegue.'; $('#reenvio-est').className = 'estado-sii ok'; limpiaOtp(); }
      else { limpiaOtp(); $('#reenvio-est').textContent = ''; $('#e-otp').classList.remove('on'); panelAcceso('cod'); setTimeout(function () { otps[0].focus(); }, 40); }
      arrancaEspera(r.data.reenviar_en_seg);
    });
  }
  $('#btn-rut').addEventListener('click', function () { pedirCodigo(false); });
  $('#btn-reenviar').addEventListener('click', function () { pedirCodigo(true); });
  $('#btn-otro-rut').addEventListener('click', function () { clearInterval(timer); panelAcceso('rut'); $('#acc-rut-in').focus(); });

  $('#btn-cod').addEventListener('click', function () {
    var c = codigo(), e = $('#e-otp');
    if (!/^\d{6}$/.test(c)) { e.textContent = 'Escribe los 6 dígitos del código.'; e.classList.add('on'); var v = otps.filter(function (i) { return !i.value; })[0]; (v || otps[0]).focus(); return; }
    var btn = this; ocupado(btn, true);
    llamar('verificar_codigo', { rut: rutAcceso, codigo: c }).then(function (r) {
      if (esCerrado(r)) { ocupado(btn, false); return mostrarCerrado(); }
      if (!r.ok || typeof r.data.sesion !== 'string') {
        ocupado(btn, false);
        e.textContent = texto(errDe(r)); e.classList.add('on'); limpiaOtp(); otps[0].focus();
        return;
      }
      sesion = r.data.sesion;    // SOLO en memoria
      r.data.sesion = null;
      clearInterval(timer); limpiaOtp();
      return cargarPrecarga({ reingreso: true }).then(function () { ocupado(btn, false); });
    });
  });

  /* ─────────── Precarga ─────────── */
  function cargarPrecarga(op) {
    op = op || {};
    return llamar('precarga', { sesion: sesion }).then(function (r) {
      if (!r.ok) return manejarError(r, 0);
      var d = r.data;
      var mismaEmpresa = verificadoAntes && rutEmp && rutNormal(d.empresa && d.empresa.rut) === rutEmp && socios.length > 0;
      verificado = true; verificadoAntes = true;
      if (op.reingreso && mismaEmpresa && !op.forzar) {
        // Sesión renovada: se conservan las respuestas en memoria y se sigue donde estaba.
        PRE = d; version = (d.respuesta && d.respuesta.version) || 0;
        if (d.respuesta && d.respuesta.estado === 'enviada') return mostrarEnviada(d.respuesta);
        aviso('Listo, seguimos donde quedaste.', 'info');
        irA(Math.max(1, Math.min(5, pasoPrevio || 1)));
        marcaCambio(); return guardar({ silencioso: true });
      }
      aplicarPrecarga(d);
    });
  }
  var verificadoAntes = false, pasoPrevio = 1;

  function aplicarPrecarga(d) {
    PRE = d;
    var e = d.empresa || {}, c = d.contacto || {};
    rutEmp = rutNormal(e.rut) || String(e.rut || '');
    $('#saludo-emp').textContent = e.razon_social || '';
    $('#emp-rs').textContent = e.razon_social || '—'; $('#emp-rut').textContent = formatoRut(rutEmp); $('#emp-reg').textContent = e.regimen || '—';
    $('#emp-dir').textContent = [e.direccion, e.comuna].filter(Boolean).join(', ') || '—';
    $('#ed-rut').textContent = formatoRut(rutEmp);
    llenaEmpresaEdit();
    $('#ct-nombre').textContent = c.nombre || '—'; $('#ct-wsp').textContent = c.wa || '—';
    llenaContactoEdit();
    $$('.ct-correo').forEach(function (x) { x.textContent = c.correo_mascara || '—'; });
    var reg = regCuenta('empresa', rutEmp), blk = $('.pre-blk[data-blk="cuenta_empresa"]');
    $('#bk-txt').textContent = reg ? txtCuentaReg(reg) : 'Aún no tenemos una cuenta registrada';
    $('#bk-tit').textContent = reg ? (e.razon_social || '') + ' · ' + formatoRut(rutEmp) : '—';
    $('.b-ok', blk).hidden = !reg;
    $('.b-fix-txt', blk).textContent = reg ? 'Corregir' : 'Agregar los datos';
    $('#be-dir-sii').textContent = [e.direccion, e.comuna].filter(Boolean).join(', ') || 'La revisamos en el SII';
    $('#be-tit').value = formatoRut(rutEmp); $('#be-sin').checked = false; setRadio('be-dir', null);
    $('#be-banco').value = ''; $('#be-tipo').value = ''; $('#be-num').value = ''; guardadoEmp4 = '';
    est = { empresa: '', contacto: '', correo: '', cuenta_empresa: '' };
    claveEmpRegistrada = d.clave_empresa_registrada !== false;
    claveEmpConfirmada = d.clave_empresa_registrada === true;   // ausente, null o error → comportamiento de siempre
    var clavesPrev = {}; (d.claves || []).forEach(function (k) { clavesPrev[k.titular === 'empresa' ? 'empresa' : rutNormal(k.titular_rut)] = k.entregada_at; });
    siiEmp = { misma: '', c1: '', c2: '', entregadaAt: clavesPrev.empresa || '' };
    $('#sii-emp-1').value = ''; $('#sii-emp-2').value = '';
    socios = (d.socios || []).map(function (x) {
      var s = nuevoSocio({ nombre: x.nombre || '', rut: formatoRut(x.rut), pct: x.pct == null ? '' : String(x.pct).replace('.', ',') });
      s.pre = true; s.orig = { nombre: s.nombre, rut: s.rut, pct: s.pct }; s.entregadaAt = clavesPrev[rutNormal(x.rut)] || ''; return s;
    });
    PRE.clavesPrev = clavesPrev;
    limpiaPasos35();
    var resp = d.respuesta;
    version = (resp && resp.version) || 0;
    if (resp && resp.estado === 'enviada') return mostrarEnviada(resp);
    if (resp && resp.datos) hidratar(resp.datos, resp.cuentas || []);
    ['empresa', 'contacto', 'correo', 'cuenta_empresa'].forEach(pintaBloque);
    pintaSiiEmp();
    renderSocios();
    cambios = 0; indicador(resp ? 'Borrador guardado' : '', resp ? 'ok' : '');
    if (resp) aviso('Retomamos tus respuestas guardadas' + (resp.actualizada_at ? ' (última vez a las ' + hora(resp.actualizada_at) + ')' : '') + '.', 'info');
    else aviso('');
    var p = resp && resp.datos && +resp.datos.paso;
    irA(p >= 1 && p <= 5 ? p : 1);
  }

  function limpiaPasos35() {
    $$('#objs input[name="obj"]').forEach(function (i) { i.checked = false; i.closest('.obj').classList.remove('sel'); var sg = $('.seguimiento', i.closest('.obj')); if (sg) sg.hidden = true; });
    ['menos-foco', 'banco-credito', 'deuda-tipo', 'ventas', 'retiros-hechos'].forEach(function (n) { setRadio(n, null); });
    ['#reinv-en', '#inv-monto', '#banco-monto', '#reg-por', '#otro-txt', '#ev-det', '#ret-monto', '#comentarios'].forEach(function (s) { $(s).value = ''; });
    $('#inv-tipo').value = ''; $('#inv-cuando').value = '';
    $$('input[name="evento"]').forEach(function (i) { i.checked = false; });
    $('#ret-monto-wrap').hidden = true;
    ['#acepto', '#declaro', '#privacidad'].forEach(function (s) { $(s).checked = false; });
  }

  /* Restaura el borrador guardado en el servidor (datos + cuentas enmascaradas). */
  function hidratar(d, cuentas) {
    var b = d.bloques || {};
    est = { empresa: b.empresa || '', contacto: b.contacto || '', correo: b.correo || '', cuenta_empresa: b.cuenta_empresa || '' };
    var ec = d.empresa_correccion || {};
    if (est.empresa === 'fix') { $('#ed-rs').value = ec.razon_social || ''; $('#ed-dir').value = ec.direccion || ''; $('#ed-comuna').value = ec.comuna || ''; poneRegimen(ec.regimen || ''); }
    var ct = d.contacto || {};
    if (est.contacto === 'fix') { $('#r-nombre').value = ct.nombre || ''; $('#r-cargo').value = ct.cargo || ''; $('#r-rut').value = ct.rut ? formatoRut(ct.rut) : ''; $('#r-wsp').value = ct.wa || ''; }
    var co = d.correo_oficial || {};
    if (est.correo === 'fix') { $('#r-correo').value = co.correo || ''; $('#r-correo2').value = co.correo || ''; }   // ya confirmado al guardarlo
    var se = d.sii_empresa || {}; if (se.misma) siiEmp.misma = se.misma;
    var ficha = {}; socios.forEach(function (s) { ficha[rutNormal(s.rut)] = s.orig; });
    if (Array.isArray(d.socios)) {
      socios = d.socios.map(function (x) {
        var s = nuevoSocio({ nombre: x.nombre || '', rut: x.rut ? formatoRut(x.rut) : '', pct: x.pct == null ? '' : String(x.pct).replace('.', ',') });
        var o = ficha[rutNormal(x.rut)];
        s.pre = x.origen === 'ficha' && !!o; s.estado = s.pre ? (x.estado === 'nuevo' ? '' : (x.estado || '')) : '';
        s.orig = s.pre ? o : null;
        s.sueldo = x.sueldo || ''; s.tgr = x.tgr || '';
        s.otros = (x.otros_ingresos || []).map(function (q) { if (q.monto_anual != null) s.montos[q.tipo] = clpDe(q.monto_anual); return q.tipo; });
        if (x.otros_ninguno) s.otros.push('ninguno');
        s.ahorro = (x.ahorro || []).slice();
        var sii = x.sii || {}; s.pendiente = sii.vigente === 'pendiente';
        s.entregadaAt = ((PRE && PRE.clavesPrev) || {})[rutNormal(x.rut)] || '';
        return s;
      });
    }
    (cuentas || []).forEach(function (c) {
      if (c.titular === 'empresa') {
        if (c.modo === 'cuenta') { $('#be-sin').checked = false; $('#be-banco').value = c.banco || ''; $('#be-tipo').value = c.tipo || ''; guardadoEmp4 = c.ultimos4 || ''; $('#be-tit').value = formatoRut(c.titular_rut || rutEmp); }
        if (c.modo === 'sin_cuenta') { $('#be-sin').checked = true; setRadio('be-dir', c.direccion_sii || null); }
        return;
      }
      var s = socios.filter(function (x) { return rutNormal(x.rut) === rutNormal(c.titular_rut); })[0];
      if (!s) return;
      s.cmodo = c.modo;
      if (c.modo === 'cuenta') { s.banco = c.banco || ''; s.tipo = c.tipo || ''; s.guardado4 = c.ultimos4 || ''; s.titular = formatoRut(c.titular_rut); }
      if (c.modo === 'sin_cuenta') s.dirsii = c.direccion_sii || '';
    });
    var ob = d.objetivos || {};
    (ob.lista || []).forEach(function (v) { var i = $('#objs input[name="obj"][value="' + v + '"]'); if (i) { i.checked = true; i.closest('.obj').classList.add('sel'); var sg = $('.seguimiento', i.closest('.obj')); if (sg) sg.hidden = false; } });
    setRadio('menos-foco', ob.menos_foco || null);
    (ob.retiros || []).forEach(function (r) { socios.forEach(function (s) { if (rutNormal(s.rut) === rutNormal(r.rut)) s.retiro = clpDe(r.monto); }); });
    $('#reinv-en').value = ob.reinvertir_en || '';
    var inv = ob.inversion || {}; $('#inv-tipo').value = inv.tipo || ''; $('#inv-monto').value = clpDe(inv.monto); $('#inv-cuando').value = inv.cuando || '';
    var bc = ob.bancos || {}; setRadio('banco-credito', bc.credito || null); $('#banco-monto').value = clpDe(bc.monto);
    setRadio('deuda-tipo', ob.deudas_tipo || null);
    $('#reg-por').value = ob.regimen_por || ''; $('#otro-txt').value = ob.otro_txt || '';
    var cx = d.contexto || {};
    setRadio('ventas', cx.ventas || null);
    (cx.eventos || []).forEach(function (v) { var i = $('input[name="evento"][value="' + v + '"]'); if (i) i.checked = true; });
    $('#ev-det').value = cx.eventos_detalle || '';
    setRadio('retiros-hechos', cx.retiros_hechos || null); $('#ret-monto-wrap').hidden = cx.retiros_hechos !== 'si'; $('#ret-monto').value = clpDe(cx.retiros_monto);
    $('#comentarios').value = cx.comentarios || '';
    $('#acepto').checked = d.aceptacion_uso === true; $('#declaro').checked = d.declaracion === true;
    $('#privacidad').checked = d.aviso_privacidad === CFG.AVISO_PRIVACIDAD;
    if ($('#objs input[value="retiros"]').checked) renderRetiros();
  }

  /* ─────────── Socios ─────────── */
  function nuevoSocio(d) {
    d = d || {};
    return { id: ++uid, nombre: d.nombre || '', rut: d.rut || '', pct: d.pct || '', sueldo: '', otros: [], montos: {}, tgr: '', ahorro: [],
      cmodo: '', banco: '', tipo: '', cuenta: '', guardado4: '', titular: '', dirsii: '', clave1: '', clave2: '', pendiente: false, entregadaAt: '', retiro: '',
      pre: false, estado: '', orig: null };
  }
  function modoSocio(s) { if (s.cmodo) return s.cmodo; return regCuenta('socio', s.rut) ? 'vigente' : 'cuenta'; }

  function renderSocios() {
    var cont = $('#socios'); cont.textContent = '';
    var tpl = $('#tpl-socio');
    socios.forEach(function (s, i) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = s.id;
      node.setAttribute('aria-label', 'Socio ' + (i + 1));
      llenaBancos(node);
      $$('[data-k]', node).forEach(function (inp) {
        var k = inp.dataset.k, id = 's' + s.id + '-' + k; inp.id = id;
        var lab = $('label[data-for="' + k + '"]', node); if (lab) lab.setAttribute('for', id);
        var err = $('[data-e="' + k + '"]', node); if (err) { err.id = 'e-' + id; inp.setAttribute('aria-describedby', err.id); }
        if (inp.type === 'checkbox') inp.checked = !!s[k]; else inp.value = s[k];
      });
      $$('[data-radio]', node).forEach(function (g) { var k = g.dataset.radio, val = k === 'cmodo' ? modoSocio(s) : s[k]; $$('input', g).forEach(function (r) { r.name = 's' + s.id + '-' + k; r.checked = (r.value === val); }); });
      $$('[data-check]', node).forEach(function (g) { var k = g.dataset.check; $$('input', g).forEach(function (c) { c.name = 's' + s.id + '-' + k; c.checked = s[k].indexOf(c.value) > -1; }); });
      $('[data-act="quitar"]', node).hidden = socios.length <= 1;
      cont.appendChild(node);
      renderMontos(node, s);
      pintaSocio(node, s, i);
    });
    $('#btn-add').hidden = socios.length >= 20;
    actualizaSuma();
  }

  function renderMontos(node, s) {
    var c = $('[data-f="montos"]', node); c.textContent = '';
    s.otros.filter(function (t) { return OTROS[t]; }).forEach(function (t) {
      var id = 's' + s.id + '-m-' + t;
      var d = document.createElement('div'); d.className = 'campo';
      var l = document.createElement('label'); l.setAttribute('for', id); l.textContent = OTROS[t] + ': monto anual aproximado (opcional)';
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = id; inp.className = 'clp'; inp.inputMode = 'numeric'; inp.maxLength = 20; inp.placeholder = '$ 0';
      inp.autocomplete = 'off'; inp.dataset.monto = t; inp.value = s.montos[t] || '';
      d.appendChild(l); d.appendChild(inp); c.appendChild(d);
    });
  }

  function pintaSocio(node, s, i) {
    $('[data-f="ini"]', node).textContent = iniciales(s.nombre);
    $('[data-f="titulo"]', node).textContent = s.nombre.trim() || ('Socio ' + (i + 1));
    $('[data-f="sub"]', node).textContent = 'Socio ' + (i + 1) + (s.pct ? (' · ' + fmtPct(num(s.pct))) : '');
    var e = s.pre ? s.estado : 'nuevo';
    node.classList.toggle('es-ok', e === 'ok'); node.classList.toggle('es-fix', e === 'fix');
    var pill = $('[data-f="pill"]', node); pill.className = 'est-pill' + (e === 'ok' ? ' v' : e === 'fix' ? ' a' : e === 'nuevo' ? ' n' : ''); pill.textContent = e === 'ok' ? 'Validado' : e === 'fix' ? 'Corregido' : e === 'nuevo' ? 'Nuevo' : '';
    $('[data-f="vista"]', node).hidden = !s.pre;
    $('[data-f="campos-id"]', node).hidden = s.pre && s.estado !== 'fix';
    if (s.pre) {
      $('[data-f="v-rut"]', node).textContent = s.rut; $('[data-f="v-pct"]', node).textContent = fmtPct(num(s.pct));
      $('[data-sact="ok"]', node).setAttribute('aria-pressed', String(s.estado === 'ok')); $('[data-sact="fix"]', node).setAttribute('aria-pressed', String(s.estado === 'fix'));
      if (s.estado) $('[data-f="e-est"]', node).classList.remove('on');
      $('dl.pre', node).hidden = s.estado === 'fix';
    }
    var reg = regCuenta('socio', s.rut), modo = modoSocio(s);
    $('[data-f="op-vigente"]', node).hidden = !reg;
    if (reg) $('[data-f="txt-vigente"]', node).textContent = 'Usar la registrada: ' + txtCuentaReg(reg);
    if (modo === 'vigente' && !reg) modo = 'cuenta';
    $('[data-f="cheque"]', node).hidden = modo !== 'sin_cuenta';
    $('[data-f="campos-banco"]', node).hidden = modo !== 'cuenta';
    if (s.dirsii) $('[data-f="e-dirsii"]', node).classList.remove('on');
    $('[data-f="warn"]', node).classList.toggle('on', modo === 'cuenta' && titularNoCoincide(s.titular, s.rut));
    var nc = $('[data-k="cuenta"]', node);
    nc.placeholder = s.guardado4 ? 'Guardado: ••••' + s.guardado4 + ' (déjalo en blanco para mantenerlo)' : 'Solo números';
    // Clave SII ACTUAL del socio: obligatoria, con una única salida explícita ("la enviaré después"). Nunca se muestra.
    var mismoRut = rutNormal(s.rut) && rutNormal(s.rut) === rutEmp;
    $('[data-f="sii-tit"]', node).textContent = 'Clave SII actual de ' + (s.nombre.trim() || ('el socio ' + (i + 1)));
    $('[data-f="sii-campos"]', node).hidden = mismoRut;
    $('[data-f="sii-inputs"]', node).hidden = s.pendiente;
    var es = $('[data-f="estado"]', node);
    if (mismoRut) { es.textContent = 'Es el mismo RUT de la empresa: usamos la clave SII de la empresa.'; es.className = 'estado-sii ok'; }
    else if (s.pendiente) { es.textContent = 'Queda pendiente. Cuando la tengas, avísanos por WhatsApp.'; es.className = 'estado-sii'; }
    else if (s.entregadaAt && !s.clave1) { es.textContent = 'Ya nos entregaste su clave (' + fecha(s.entregadaAt) + '). Si cambió otra vez, escríbela de nuevo.'; es.className = 'estado-sii ok'; }
    else es.textContent = '';
  }

  function socioDe(el) { var card = el.closest('.socio'); if (!card) return null; var id = +card.dataset.id; for (var i = 0; i < socios.length; i++) { if (socios[i].id === id) return { s: socios[i], i: i, card: card }; } return null; }

  $('#socios').addEventListener('input', function (e) {
    var t = e.target, r = socioDe(t); if (!r) return;
    if (t.dataset.monto) { r.s.montos[t.dataset.monto] = t.value; return; }
    if (t.dataset.k === 'cuenta') { t.value = t.value.replace(/[^0-9.\- ]/g, ''); }
    if (t.dataset.k && t.type !== 'checkbox') { r.s[t.dataset.k] = t.value; if (t.getAttribute('aria-invalid') === 'true') validaCampoSocio(t, r.s); }
    pintaSocio(r.card, r.s, r.i); actualizaSuma();
  });
  $('#socios').addEventListener('change', function (e) {
    var t = e.target, r = socioDe(t); if (!r) return;
    if (t.dataset.monto) return;
    var g = t.closest('[data-radio]'), c = t.closest('[data-check]');
    if (t.tagName === 'SELECT' && t.dataset.k) { r.s[t.dataset.k] = t.value; }
    else if (g) r.s[g.dataset.radio] = t.value;
    else if (c) {
      var k = c.dataset.check;
      if (t.value === 'ninguno' && t.checked) { $$('input', c).forEach(function (x) { if (x !== t) x.checked = false; }); }
      else if (t.checked) { var n = $('input[value="ninguno"]', c); if (n) n.checked = false; }
      r.s[k] = $$('input:checked', c).map(function (x) { return x.value; });
      if (k === 'otros') renderMontos(r.card, r.s);
    }
    else if (t.dataset.k && t.type === 'checkbox') {
      r.s[t.dataset.k] = t.checked;
      if (t.dataset.k === 'pendiente' && t.checked) {   // "la enviaré después": lo escrito se descarta de la memoria
        r.s.clave1 = ''; r.s.clave2 = ''; $$('input[type="password"]', r.card).forEach(function (x) { x.value = ''; });
      }
    }
    pintaSocio(r.card, r.s, r.i);
  });
  $('#socios').addEventListener('focusout', function (e) {
    var t = e.target, r = socioDe(t); if (!r || !t.dataset.k) return;
    if (t.dataset.k === 'rut' && t.value.trim()) { t.value = formatoRut(t.value); r.s.rut = t.value; validaCampoSocio(t, r.s); pintaSocio(r.card, r.s, r.i); }
    if (t.dataset.k === 'nombre' && t.value.trim()) validaCampoSocio(t, r.s);
    if (t.dataset.k === 'titular' && t.value.trim()) { t.value = formatoRut(t.value); r.s.titular = t.value; pintaSocio(r.card, r.s, r.i); }
  });
  $('#socios').addEventListener('click', function (e) {
    var a = e.target.closest('[data-sact]');
    if (a) {
      var rs = socioDe(a); if (!rs) return;
      rs.s.estado = a.dataset.sact; marcaCambio();
      if (rs.s.estado === 'ok' && rs.s.orig) { rs.s.nombre = rs.s.orig.nombre; rs.s.rut = rs.s.orig.rut; rs.s.pct = rs.s.orig.pct; }
      renderSocios(); ocultaError();
      var card = $('#socios .socio[data-id="' + rs.s.id + '"]');
      if (card) { var foco = rs.s.estado === 'fix' ? $('[data-k="nombre"]', card) : $('[data-sact="ok"]', card); if (foco) foco.focus({ preventScroll: true }); }
      return;
    }
    var b = e.target.closest('[data-act="quitar"]'); if (!b) return;
    var r = socioDe(b); if (!r) return;
    socios.splice(r.i, 1); marcaCambio(); renderSocios();
    var h = $('#h2'); if (h) h.focus();
  });
  $('#btn-add').addEventListener('click', function () {
    if (socios.length >= 20) return;
    socios.push(nuevoSocio()); marcaCambio(); renderSocios();
    var cards = $$('#socios .socio'); var last = cards[cards.length - 1];
    if (last) { last.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); var inp = $('[data-k="nombre"]', last); setTimeout(function () { inp.focus({ preventScroll: true }); }, reduce ? 0 : 300); }
  });

  function validaCampoSocio(inp, s) {
    var k = inp.dataset.k, ok = true;
    if (k === 'nombre') ok = s.nombre.trim().length >= 3;
    if (k === 'rut') ok = rutValido(s.rut);
    if (k === 'pct') { var n = pctNum(s.pct); ok = n !== null && !isNaN(n) && n > 0; }
    if (k === 'clave1') ok = claveOk(s.clave1);
    if (k === 'clave2') ok = s.clave1 === s.clave2;
    inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
    var err = document.getElementById('e-' + inp.id); if (err) err.classList.toggle('on', !ok);
    return ok;
  }
  function sumaPct() { return socios.reduce(function (a, s) { return a + num(s.pct); }, 0); }
  function actualizaSuma() {
    var t = Math.round(sumaPct() * 100) / 100;
    var box = $('#suma'); $('#suma-num').textContent = fmtPct(t);
    $('#suma-bar').style.width = Math.min(t, 100) + '%';
    box.classList.toggle('ok', t === 100); box.classList.toggle('mal', t !== 100 && t > 0); box.classList.toggle('over', t > 100);
  }

  /* ─────────── Objetivos y contexto ─────────── */
  $('#objs').addEventListener('change', function (e) {
    var t = e.target; if (t.name !== 'obj') return;
    var card = t.closest('.obj'); card.classList.toggle('sel', t.checked);
    var seg = $('.seguimiento', card); if (seg) seg.hidden = !t.checked;
    if (t.value === 'retiros' && t.checked) renderRetiros();
    ocultaError();
  });
  function renderRetiros() {
    var c = $('#retiros-socios'); c.textContent = '';
    socios.forEach(function (s, i) {
      var id = 'ret-s' + s.id, nombre = s.nombre.trim() || ('Socio ' + (i + 1));
      var d = document.createElement('div'); d.className = 'campo';
      var l = document.createElement('label'); l.setAttribute('for', id); l.textContent = nombre;
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = id; inp.className = 'clp'; inp.inputMode = 'numeric'; inp.maxLength = 20; inp.placeholder = '$ 0'; inp.autocomplete = 'off'; inp.value = s.retiro;
      inp.addEventListener('input', function () { s.retiro = inp.value; });
      d.appendChild(l); d.appendChild(inp); c.appendChild(d);
    });
  }
  $('#form').addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'retiros-hechos') { $('#ret-monto-wrap').hidden = t.value !== 'si'; }
    if (t.name === 'evento') {
      var g = $('#eventos');
      if (t.value === 'ninguno' && t.checked) $$('input', g).forEach(function (x) { if (x !== t) x.checked = false; });
      else if (t.checked) $('input[value="ninguno"]', g).checked = false;
    }
    if (t.name === 'ventas') { $('#e-ventas').classList.remove('on'); ocultaError(); }
    ['acepto', 'declaro', 'privacidad'].forEach(function (k) { if (t.id === k && t.checked) { $('#e-' + k).classList.remove('on'); ocultaError(); } });
  });
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('clp')) { var v = clp(t.value); if (v !== t.value) { t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); } }
  });
  function marcaCambio() { if (verificado && !enviada) { cambios++; indicador('Cambios sin guardar', ''); } }
  $('#form').addEventListener('input', marcaCambio);
  $('#form').addEventListener('change', function (e) { if (!e.target.closest('#acc-rut, #acc-cod')) marcaCambio(); });

  /* ─────────── Armado del cuerpo para la API (lista blanca del contrato) ─────────── */
  function armarSocio(s) {
    var rut = rutNormal(s.rut);
    var p = pctNum(s.pct);
    return {
      origen: s.pre ? 'ficha' : 'nuevo', estado: s.pre ? s.estado : 'nuevo',
      rut: rut ? formatoRut(rut) : '', nombre: s.nombre.trim().slice(0, 120), pct: p === null || isNaN(p) ? null : p,
      sueldo: s.sueldo,
      otros_ingresos: s.otros.filter(function (t) { return OTROS[t]; }).map(function (t) { return { tipo: t, monto_anual: monto(s.montos[t]) }; }),
      otros_ninguno: s.otros.indexOf('ninguno') > -1,
      tgr: s.tgr, ahorro: s.ahorro.filter(function (x) { return AHORRO[x]; }),
      sii: siiSocio(s)
    };
  }
  function siiSocio(s) {
    var r = rutNormal(s.rut);
    if (r && r === rutEmp) return {};
    if (s.pendiente) return { vigente: 'pendiente' };
    if ((claveOk(s.clave1) && s.clave1 === s.clave2) || s.entregadaAt) return { vigente: 'entregada' };
    return {};
  }
  /* Claves SII que viajan en este guardado (solo pares completos y coincidentes), SELLADAS aquí mismo con la llave PÚBLICA de recepción
     (sobre.js, ECIES P-256): la Edge y la base reciben solo el sobre; nada del servidor lo puede abrir. Tras el OK del servidor las claves
     se borran de la memoria. Sin llave válida, sin WebCrypto o si la llave publicada no es la vigente → NO se envía ninguna clave (fail-closed). */
  function llaveRecepcion() {
    var L = CFG.RECEPCION_LLAVE;
    if (!L || !/^[0-9a-f]{16}$/.test(L.kid || '') || typeof L.spki_b64 !== 'string' || !window.RentaSobre || !window.crypto || !window.crypto.subtle) return null;
    if (PRE && PRE.recepcion_kid && PRE.recepcion_kid !== L.kid) return null;   // el servidor ya usa otra llave: recargar el sitio
    return L;
  }
  function sellarClaves() {
    var pend = [], limpiar = [];
    if (rutEmp && siiEmp.misma === 'no' && claveOk(siiEmp.c1) && siiEmp.c1 === siiEmp.c2) {
      pend.push({ titular: 'empresa', rut: rutEmp, clave: siiEmp.c1 });
      limpiar.push(function (at) { siiEmp.c1 = ''; siiEmp.c2 = ''; siiEmp.entregadaAt = at; $('#sii-emp-1').value = ''; $('#sii-emp-2').value = ''; pintaSiiEmp(); });
    }
    var vistos = [rutEmp];
    socios.forEach(function (s) {
      var r = rutNormal(s.rut);
      if (!r || vistos.indexOf(r) > -1 || s.pendiente || !claveOk(s.clave1) || s.clave1 !== s.clave2) return;
      vistos.push(r);
      pend.push({ titular: 'socio', rut: r, clave: s.clave1 });
      limpiar.push(function (at) { s.clave1 = ''; s.clave2 = ''; s.entregadaAt = at;
        $$('#socios .socio[data-id="' + s.id + '"] input[type="password"]').forEach(function (x) { x.value = ''; });
        var card = $('#socios .socio[data-id="' + s.id + '"]'); if (card) { var rr = socioDe(card.firstElementChild); if (rr) pintaSocio(rr.card, rr.s, rr.i); } });
    });
    if (!pend.length) return Promise.resolve({ claves: [], limpiar: [] });
    var L = llaveRecepcion();
    if (!L) return Promise.resolve({ error: 'SIN_SOBRE' });
    return Promise.all(pend.map(function (k) {
      return window.RentaSobre.sellar(k.clave, L, { periodo: PRE && PRE.periodo, rut_empresa: rutEmp, titular: k.titular, titular_rut: k.rut })
        .then(function (sb) { return { titular: k.titular, rut: k.rut, v: sb.v, kid: sb.kid, epk: sb.epk, iv: sb.iv, ct: sb.ct }; });
    })).then(function (claves) { pend.length = 0; return { claves: claves, limpiar: limpiar }; },
      function () { pend.length = 0; return { error: 'SIN_SOBRE' }; });
  }
  function armarDatos(pasoGuardar) {
    var objs = checks('obj');
    var sociosD = socios.map(armarSocio);
    var ruts = sociosD.map(function (s) { return s.rut; }).filter(Boolean);
    var wa = $('#r-wsp').value.trim();
    var retiros = [];
    if (objs.indexOf('retiros') > -1) socios.forEach(function (s) { var r = rutNormal(s.rut); if (r && ruts.indexOf(formatoRut(r)) > -1 && !retiros.some(function (x) { return x.rut === formatoRut(r); })) retiros.push({ rut: formatoRut(r), monto: monto(s.retiro) }); });
    var ret = radioVal('retiros-hechos');
    return {
      paso: Math.max(0, Math.min(6, pasoGuardar)),
      empresa_correccion: est.empresa === 'fix' ? { razon_social: $('#ed-rs').value.trim(), direccion: $('#ed-dir').value.trim(), comuna: $('#ed-comuna').value.trim(), regimen: $('#ed-reg').value } : {},
      bloques: { empresa: est.empresa, contacto: est.contacto, correo: est.correo, cuenta_empresa: est.cuenta_empresa },
      contacto: est.contacto === 'fix' ? { nombre: $('#r-nombre').value.trim(), cargo: $('#r-cargo').value.trim(), rut: rutNormal($('#r-rut').value) ? formatoRut(rutNormal($('#r-rut').value)) : '',
        wa: /^\+?[\d\s()-]{8,25}$/.test(wa) ? wa : '' } : {},
      // Correo oficial corregido: solo si los dos campos coinciden y el formato es válido (si no, el paso no deja avanzar).
      correo_oficial: est.correo === 'fix' ? correoPar() : {},
      sii_empresa: { misma: siiEmp.misma },
      socios: sociosD,
      objetivos: {
        lista: objs,
        menos_foco: objs.indexOf('menos') > -1 ? radioVal('menos-foco') : '',
        retiros: retiros,
        reinvertir_en: objs.indexOf('reinvertir') > -1 ? $('#reinv-en').value.trim() : '',
        inversion: objs.indexOf('inversion') > -1 ? { tipo: $('#inv-tipo').value, monto: monto($('#inv-monto').value), cuando: $('#inv-cuando').value } : { tipo: '', monto: null, cuando: '' },
        bancos: objs.indexOf('bancos') > -1 ? { credito: radioVal('banco-credito'), monto: monto($('#banco-monto').value) } : { credito: '', monto: null },
        deudas_tipo: objs.indexOf('deudas') > -1 ? radioVal('deuda-tipo') : '',
        regimen_por: objs.indexOf('regimen') > -1 ? $('#reg-por').value.trim() : '',
        otro_txt: objs.indexOf('otro') > -1 ? $('#otro-txt').value.trim() : ''
      },
      contexto: {
        ventas: radioVal('ventas'), eventos: checks('evento'), eventos_detalle: $('#ev-det').value.trim(),
        retiros_hechos: ret, retiros_monto: ret === 'si' ? monto($('#ret-monto').value) : null, comentarios: $('#comentarios').value.trim()
      },
      aceptacion_uso: $('#acepto').checked, declaracion: $('#declaro').checked,
      aviso_privacidad: $('#privacidad').checked ? CFG.AVISO_PRIVACIDAD : ''
    };
  }
  function correoPar() {
    var a = $('#r-correo').value.trim().toLowerCase(), b = $('#r-correo2').value.trim().toLowerCase();
    return a && a === b && correoOk(a) ? { correo: a, correo2: b } : {};
  }
  /* Cuentas: solo se incluyen las completas y coherentes (titular = dueño). numero:null = conservar el ya guardado. */
  function armarCuentas() {
    var out = [], limpiar = [];
    if (rutEmp) {
      if (est.cuenta_empresa === 'ok' && regCuenta('empresa', rutEmp)) out.push({ titular: 'empresa', titular_rut: rutEmp, modo: 'vigente' });
      else if (est.cuenta_empresa === 'fix') {
        if ($('#be-sin').checked) { var dv = radioVal('be-dir'); if (dv) out.push({ titular: 'empresa', titular_rut: rutEmp, modo: 'sin_cuenta', direccion_sii: dv }); }
        else {
          var nEmp = $('#be-num').value, okNum = numeroOk(nEmp), tit = rutNormal($('#be-tit').value) || rutEmp;
          if ($('#be-banco').value && $('#be-tipo').value && (okNum || (!nEmp.trim() && guardadoEmp4)) && tit === rutEmp) {
            out.push({ titular: 'empresa', titular_rut: rutEmp, modo: 'cuenta', banco: $('#be-banco').value, tipo: $('#be-tipo').value, numero: okNum ? numeroCuenta(nEmp) : null });
            if (okNum) limpiar.push(function () { guardadoEmp4 = numeroCuenta(nEmp).slice(-4); $('#be-num').value = ''; pintaCuentaEmpresa(); });
          }
        }
      }
    }
    var vistos = [rutEmp];
    socios.forEach(function (s) {
      var r = rutNormal(s.rut); if (!r || vistos.indexOf(r) > -1) return;
      var modo = modoSocio(s), reg = regCuenta('socio', r);
      if (modo === 'vigente' && reg) { out.push({ titular: 'socio', titular_rut: r, modo: 'vigente' }); vistos.push(r); return; }
      if (modo === 'sin_cuenta') { if (s.dirsii) { out.push({ titular: 'socio', titular_rut: r, modo: 'sin_cuenta', direccion_sii: s.dirsii }); vistos.push(r); } return; }
      if (modo === 'cuenta') {
        var ok = numeroOk(s.cuenta), tit = rutNormal(s.titular) || r;
        if (s.banco && s.tipo && (ok || (!String(s.cuenta).trim() && s.guardado4)) && tit === r) {
          out.push({ titular: 'socio', titular_rut: r, modo: 'cuenta', banco: s.banco, tipo: s.tipo, numero: ok ? numeroCuenta(s.cuenta) : null }); vistos.push(r);
          if (ok) { var num4 = numeroCuenta(s.cuenta).slice(-4); limpiar.push(function () { s.guardado4 = num4; s.cuenta = ''; var inp = document.getElementById('s' + s.id + '-cuenta'); if (inp) inp.value = ''; var rr = socioDe(inp || document.body); if (rr) pintaSocio(rr.card, rr.s, rr.i); }); }
        }
      }
    });
    return { cuentas: out, limpiar: limpiar };
  }

  /* ─────────── Guardar / enviar ─────────── */
  function guardar(op) {
    op = op || {};
    cola = cola.then(function () { return guardarAhora(op); }, function () { return guardarAhora(op); });
    return cola;
  }
  function guardarAhora(op) {
    if (!sesion || enviada || cerrado) return Promise.resolve({ ok: false, omitido: true });
    var antes = cambios;
    var c = armarCuentas(), k = null, cuerpo = null;
    ultimasCuentas = c.cuentas;
    indicador('Guardando…', '');
    return sellarClaves().then(function (sk) {
      k = sk;
      if (k.error) return { ok: false, status: 0, data: { ok: false, error: k.error } };   // ninguna clave sale sin sellar
      cuerpo = { sesion: sesion, version: version, datos: armarDatos(op.paso || paso), cuentas: c.cuentas };
      if (k.claves.length) cuerpo.claves = k.claves;
      return llamar('guardar', cuerpo);
    }).then(function (r) {
      cuerpo = null;   // el cuerpo con las claves sale de la memoria
      if (!r.ok && typeof r.data.version === 'number') version = r.data.version;   // el borrador quedó guardado aunque una clave fallara
      if (r.ok) {
        version = r.data.version;
        c.limpiar.forEach(function (f) { f(); });   // los números ya están cifrados en el servidor: fuera de la memoria
        if (r.data.claves_guardadas) k.limpiar.forEach(function (f) { f(r.data.actualizada_at || new Date().toISOString()); });   // ídem claves SII
        if (cambios === antes) cambios = 0;
        indicador('Guardado ' + hora(r.data.actualizada_at), 'ok');
        return r;
      }
      indicador('Sin guardar', 'mal');
      if (!op.silencioso || ['SESION_INVALIDA', 'VERSION_DESACTUALIZADA', 'YA_ENVIADA', 'SIN_SOBRE'].indexOf(errDe(r)) > -1 || esCerrado(r)) manejarError(r, paso);
      return r;
    });
  }
  function enviar(btn) {
    ocupado(btn, true);
    cola = cola.then(function () {
      var c = armarCuentas(); ultimasCuentas = c.cuentas;
      return sellarClaves().then(function (k) {
        if (k.error) return { ok: false, status: 0, data: { ok: false, error: k.error } };
        var cuerpo = { sesion: sesion, version: version, datos: armarDatos(5), cuentas: c.cuentas };
        if (k.claves.length) cuerpo.claves = k.claves;
        return llamar('enviar', cuerpo).then(function (r) { if (r.ok && r.data.claves_guardadas) k.limpiar.forEach(function (f) { f(r.data.enviada_at || ''); }); return r; });
      });
    }).then(function (r) {
      ocupado(btn, false);
      if (!r.ok && typeof r.data.version === 'number') version = r.data.version;
      if (!r.ok) return manejarError(r, 5);
      enviada = true; version = r.data.version; cambios = 0;
      cerrarSesion();
      limpiarMemoriaSensible();
      irA(6);
    });
  }
  function cerrarSesion(keepalive) {
    if (!sesion) return;
    var s = sesion; sesion = null;
    llamar('cerrar_sesion', { sesion: s }, { keepalive: !!keepalive });
  }
  function limpiarMemoriaSensible() {
    $('#be-num').value = ''; socios.forEach(function (s) { s.cuenta = ''; s.clave1 = ''; s.clave2 = ''; });
    $$('#socios [data-k="cuenta"], input[type="password"]').forEach(function (i) { i.value = ''; });
    siiEmp.c1 = ''; siiEmp.c2 = '';
  }

  /* Paso al que lleva un campo informado por la API. */
  function pasoDeCampo(c) {
    c = String(c || '');
    var m = c.match(/^cuentas\[(\d+)\]/);
    if (m) { var cu = ultimasCuentas[+m[1]]; return cu && cu.titular === 'empresa' ? 1 : 2; }
    if (/^(bloques|contacto|correo|empresa_correccion|cuentas\.empresa|cuenta_empresa|sii_empresa|clave_empresa)/.test(c)) return 1;
    if (/^claves\[/.test(c)) return 2;
    if (/^clave_socio/.test(c)) return 2;
    if (/^(socios|cuentas)/.test(c)) return 2;
    if (/^objetivos/.test(c)) return 3;
    if (/^(contexto|ventas)/.test(c)) return 4;
    if (/^(aceptacion|declaracion|aviso_privacidad)/.test(c)) return 5;
    return null;
  }
  function manejarError(r, enPaso) {
    var cod = errDe(r);
    if (esCerrado(r)) return mostrarCerrado();
    if (cod === 'SESION_INVALIDA') return sesionVencida();
    if (cod === 'YA_ENVIADA') { enviada = true; cerrarSesion(); limpiarMemoriaSensible(); $('#fin-txt').textContent = TEXTOS.YA_ENVIADA; irA(6); return; }
    if (cod === 'VERSION_DESACTUALIZADA') {
      aviso(TEXTOS.VERSION_DESACTUALIZADA, 'alerta');
      return llamar('precarga', { sesion: sesion }).then(function (p) { if (!p.ok) return manejarError(p, enPaso); aplicarPrecarga(p.data); aviso(TEXTOS.VERSION_DESACTUALIZADA, 'alerta'); });
    }
    var destino = (cod === 'INCOMPLETO' || cod === 'DATOS_INVALIDOS' || cod === 'CUENTA_INVALIDA' || cod === 'TITULAR_NO_COINCIDE' || cod === 'RUT_SOCIO_INVALIDO' || cod === 'SOCIO_REPETIDO'
      || cod === 'CLAVES_NO_COINCIDEN' || cod === 'CLAVE_INVALIDA' || cod === 'CORREOS_NO_COINCIDEN' || cod === 'CORREO_INVALIDO' || cod === 'RUT_INVALIDO')
      ? (pasoDeCampo(r.data.campo) || (/^(CUENTA|TITULAR)/.test(cod) ? 2 : (/SOCIO/.test(cod) ? 2 : null))) : null;
    if (enPaso === 0) { errAcceso('#e-acc-api', texto(cod)); return; }
    if (destino && destino !== paso) irA(destino);
    muestraError(texto(cod));
  }
  function sesionVencida() {
    sesion = null; pasoPrevio = paso >= 1 && paso <= 5 ? paso : pasoPrevio;
    verificado = false;
    clearInterval(timer);
    $('#acc-rut-in').value = rutAcceso ? formatoRut(rutAcceso) : '';
    panelAcceso('rut');
    irA(0);
    aviso(TEXTOS.SESION_INVALIDA, 'alerta');
  }
  function mostrarCerrado() {
    cerrado = true; sesion = null; verificado = false; clearInterval(timer);
    aviso('');
    irA('cerrado');
  }
  function mostrarEnviada(resp) {
    enviada = true; cerrarSesion();
    $('#fin-txt').textContent = 'Ya recibimos tus respuestas' + (resp && resp.enviada_at ? ' el ' + fecha(resp.enviada_at) : '') + '. Si algo cambió, escríbenos en tu grupo de WhatsApp.';
    irA(6);
  }

  /* ─────────── Validación por paso ─────────── */
  function marca(inp, errId, ok) { inp.setAttribute('aria-invalid', ok ? 'false' : 'true'); $('#' + errId).classList.toggle('on', !ok); return ok; }
  function valida(p) {
    var primero = null, msg = '';
    function falla(el, m) { if (!primero) { primero = el; msg = m || msg; } }
    if (p === 1) {
      var sinDecidir = false;
      ['empresa', 'contacto', 'correo', 'cuenta_empresa'].forEach(function (k) {
        var b = $('.pre-blk[data-blk="' + k + '"]');
        if (!est[k]) { $('[data-e-blk]', b).classList.add('on'); falla($('.b-ok:not([hidden])', b) || $('.b-fix', b), 'Cuéntame en cada bloque si está correcto o hay que corregirlo.'); sinDecidir = true; }
      });
      if (est.empresa === 'fix') { var rs = $('#ed-rs'); if (!marca(rs, 'e-ed-rs', rs.value.trim().length >= 3)) falla(rs); }
      if (est.contacto === 'fix') {
        var n = $('#r-nombre'), w = $('#r-wsp');
        if (!marca(n, 'e-r-nombre', n.value.trim().length >= 3)) falla(n);
        if (!marca(w, 'e-r-wsp', w.value.replace(/\D/g, '').length >= 8 && /^\+?[\d\s()-]{8,25}$/.test(w.value.trim()))) falla(w);
        var rr = $('#r-rut'); if (!marca(rr, 'e-r-rut', !rr.value.trim() || rutValido(rr.value))) falla(rr);
      }
      if (est.correo === 'fix') {
        var c1 = $('#r-correo'), c2 = $('#r-correo2'), v1 = c1.value.trim().toLowerCase();
        if (!marca(c1, 'e-r-correo', correoOk(v1))) falla(c1, 'Revisa el correo oficial.');
        else if (!marca(c2, 'e-r-correo2', v1 === c2.value.trim().toLowerCase())) falla(c2, TEXTOS.CORREOS_NO_COINCIDEN);
      }
      // Clave SII de la empresa
      if (!siiEmp.misma) { $('#e-sii-emp').classList.add('on'); falla($('input[name="sii-emp"]'), 'Cuéntame si la clave SII de la empresa sigue siendo la misma.'); }
      if (siiEmp.misma === 'no' && (siiEmp.c1 || siiEmp.c2 || !siiEmp.entregadaAt)) {
        var k1 = $('#sii-emp-1'), k2 = $('#sii-emp-2');
        if (!marca(k1, 'e-sii-emp-1', claveOk(siiEmp.c1))) falla(k1, 'Escribe la clave SII nueva de la empresa (entre 4 y 64 caracteres).');
        else if (!marca(k2, 'e-sii-emp-2', siiEmp.c1 === siiEmp.c2)) falla(k2, TEXTOS.CLAVES_NO_COINCIDEN);
      }
      if (est.cuenta_empresa === 'ok' && !regCuenta('empresa', rutEmp)) { est.cuenta_empresa = 'fix'; pintaBloque('cuenta_empresa'); }
      if (est.cuenta_empresa === 'fix') {
        if ($('#be-sin').checked) { if (!radioMarcado('be-dir')) { $('#e-be-dir').classList.add('on'); falla($('input[name="be-dir"]')); } }
        else {
          var bb = $('#be-banco'), bt = $('#be-tipo'), bn = $('#be-num'), bti = $('#be-tit');
          if (!marca(bb, 'e-be-banco', !!bb.value)) falla(bb);
          if (!marca(bt, 'e-be-tipo', !!bt.value)) falla(bt);
          if (!marca(bn, 'e-be-num', numeroOk(bn.value) || (!bn.value.trim() && !!guardadoEmp4))) falla(bn);
          var tOk = !bti.value.trim() || rutNormal(bti.value) === rutEmp;
          bti.setAttribute('aria-invalid', tOk ? 'false' : 'true');
          if (!tOk) falla(bti, 'La cuenta de la empresa debe estar a nombre de la empresa (mismo RUT).');
        }
      }
      if (primero && !msg) msg = sinDecidir ? 'Cuéntame en cada bloque si está correcto o hay que corregirlo.' : 'Revisa los campos marcados.';
    }
    if (p === 2) {
      var falta = false, rutsV = [];
      $$('#socios .socio').forEach(function (card) {
        var r = socioDe(card.firstElementChild);
        if (r.s.pre && !r.s.estado) { $('[data-f="e-est"]', card).classList.add('on'); falla($('[data-sact="ok"]', card)); falta = true; }
        else if (!(r.s.pre && r.s.estado === 'ok')) {
          ['nombre', 'rut', 'pct'].forEach(function (k) { var inp = $('[data-k="' + k + '"]', card); if (!validaCampoSocio(inp, r.s)) falla(inp); });
        }
        var rn = rutNormal(r.s.rut);
        if (rn) { if (rutsV.indexOf(rn) > -1) falla($('[data-k="rut"]', card) || card, TEXTOS.SOCIO_REPETIDO); rutsV.push(rn); }
        // Clave SII actual: obligatoria, salvo "la enviaré después" o mismo RUT de la empresa (si ya la entregó, puede dejarla en blanco).
        if (!(rn && rn === rutEmp) && !r.s.pendiente && (r.s.clave1 || r.s.clave2 || !r.s.entregadaAt)) {
          var ic1 = $('[data-k="clave1"]', card), ic2 = $('[data-k="clave2"]', card);
          if (!validaCampoSocio(ic1, r.s)) falla(ic1, 'Escribe la clave SII actual de cada socio o marca "No la tengo a mano ahora".');
          else if (!validaCampoSocio(ic2, r.s)) falla(ic2, TEXTOS.CLAVES_NO_COINCIDEN);
        }
        var modo = modoSocio(r.s);
        if (modo === 'sin_cuenta' && !r.s.dirsii) { $('[data-f="e-dirsii"]', card).classList.add('on'); falla($('[data-radio="dirsii"] input', card)); }
        if (modo === 'cuenta') {
          var algo = r.s.banco || r.s.tipo || String(r.s.cuenta).trim();
          var completo = r.s.banco && r.s.tipo && (numeroOk(r.s.cuenta) || (!String(r.s.cuenta).trim() && r.s.guardado4));
          var inpC = $('[data-k="cuenta"]', card);
          var okC = !algo || completo;
          inpC.setAttribute('aria-invalid', okC ? 'false' : 'true'); $('[data-e="cuenta"]', card).classList.toggle('on', !okC);
          if (!okC) falla(inpC, 'Completa la cuenta bancaria del socio o elige otra opción.');
          if (algo && titularNoCoincide(r.s.titular, r.s.rut)) falla($('[data-k="titular"]', card), 'La cuenta del socio debe estar a su nombre (mismo RUT).');
        }
      });
      var t = Math.round(sumaPct() * 100) / 100;
      if (primero) { if (!msg) msg = falta ? 'Confirma o corrige los datos de cada socio.' : 'Revisa los datos de los socios.'; }
      else if (!socios.length) { msg = 'Agrega al menos un socio.'; primero = $('#btn-add'); }
      else if (t !== 100) { msg = 'La participación suma ' + fmtPct(t) + '. Debe sumar 100%.'; primero = $('#socios .socio [data-k="pct"]') || $('#socios .socio [data-sact="fix"]'); }
    }
    if (p === 3) { if (!checks('obj').length) { msg = 'Marca al menos un objetivo.'; primero = $('#objs input[name="obj"]'); } }
    if (p === 4) { if (!radioVal('ventas')) { $('#e-ventas').classList.add('on'); msg = 'Falta la pregunta de ventas.'; primero = $('input[name="ventas"]'); } }
    if (p === 5) {
      [['acepto', 'Falta aceptar el uso de la información.'], ['declaro', 'Falta confirmar la declaración sobre la información.'], ['privacidad', 'Falta confirmar que leíste el aviso de privacidad.']].forEach(function (x) {
        if (!$('#' + x[0]).checked) { $('#e-' + x[0]).classList.add('on'); falla($('#' + x[0]), x[1]); }
      });
    }
    if (primero) { muestraError(msg); primero.focus(); return false; }
    ocultaError(); return true;
  }

  /* ─────────── Resumen (todo con esc(); sin estilos en línea) ─────────── */
  function fila(k, v) { return '<div><dt>' + esc(k) + '</dt><dd>' + (v ? esc(v) : '<span class="tenue">Sin respuesta</span>') + '</dd></div>'; }
  function seccion(icono, titulo, irPaso, html) {
    return '<div class="res-sec"><header><h3><svg class="ic" aria-hidden="true"><use href="#' + icono + '"/></svg>' + esc(titulo) + '</h3><button type="button" class="btn-edit" data-go="' + irPaso + '"><svg class="ic" aria-hidden="true"><use href="#i-edit"/></svg>Editar<span class="sr-only"> ' + esc(titulo) + '</span></button></header>' + html + '</div>';
  }
  function pillEst(e) { return e === 'ok' ? '<span class="pill v">Validado</span>' : e === 'fix' ? '<span class="pill a">Corregido</span>' : '<span class="pill n">Nuevo</span>'; }
  function blk(titulo, e, html) { return '<div class="res-blk"><h4>' + esc(titulo) + ' ' + pillEst(e) + '</h4>' + html + '</div>'; }
  function detalleObjetivo(k) {
    switch (k) {
      case 'menos': return radioVal('menos-foco') ? 'Le preocupa: ' + FOCO[radioVal('menos-foco')] : '';
      case 'retiros': return socios.map(function (s, i) { return (s.nombre.trim() || ('Socio ' + (i + 1))) + ': ' + (clp(s.retiro) || 'sin monto'); }).join(' · ');
      case 'reinvertir': return $('#reinv-en').value.trim();
      case 'inversion': return [$('#inv-tipo').value, clp($('#inv-monto').value), $('#inv-cuando').value].filter(Boolean).join(' · ');
      case 'bancos': return [radioVal('banco-credito') ? 'Crédito en 12 meses: ' + CREDITO[radioVal('banco-credito')] : '', clp($('#banco-monto').value)].filter(Boolean).join(' · ');
      case 'deudas': return DEUDA[radioVal('deuda-tipo')] || '';
      case 'regimen': return $('#reg-por').value.trim();
      case 'otro': return $('#otro-txt').value.trim();
    }
    return '';
  }
  function cuentaTxt(banco, tipo, numero, g4) {
    if (!banco && !numero && !g4) return '';
    return [banco, tipoTxt(tipo), numero ? enmascara(numero) : (g4 ? '••••' + g4 : '')].filter(Boolean).join(' · ');
  }
  /* Nunca la clave: solo el estado. */
  function accesoSii(s) {
    var r = rutNormal(s.rut);
    if (r && r === rutEmp) return { t: 'Clave SII: la de la empresa', c: 'v' };
    if (s.pendiente) return { t: 'Clave SII: la enviará después', c: 'r' };
    if (claveOk(s.clave1) && s.clave1 === s.clave2) return { t: 'Clave SII: se guarda cifrada al enviar', c: 'v' };
    if (s.entregadaAt) return { t: 'Clave SII: entregada', c: 'v' };
    return { t: 'Clave SII: falta', c: 'r' };
  }
  function claveEmpTxt() {
    if (siiEmp.misma === 'si') return claveEmpConfirmada ? 'Ya la tenemos registrada' : 'Sigue siendo la misma';
    if (siiEmp.misma === 'no') return claveOk(siiEmp.c1) && siiEmp.c1 === siiEmp.c2 ? 'Cambió · la nueva se guarda cifrada al enviar' : (siiEmp.entregadaAt ? 'Cambió · nueva entregada' : 'Cambió · falta escribir la nueva');
    return '';
  }
  function renderResumen() {
    var h = '', e = PRE.empresa || {}, c = PRE.contacto || {};
    var fixE = est.empresa === 'fix', fixC = est.contacto === 'fix';
    var cuenta, reg = regCuenta('empresa', rutEmp);
    if (est.cuenta_empresa === 'ok' && reg) cuenta = txtCuentaReg(reg);
    else cuenta = $('#be-sin').checked ? ('Sin cuenta · devolución por cheque al domicilio del SII' + (radioVal('be-dir') ? (radioVal('be-dir') === 'vigente' ? ' (dirección vigente)' : ' (la dirección cambió)') : ''))
      : cuentaTxt($('#be-banco').value, $('#be-tipo').value, $('#be-num').value, guardadoEmp4);
    h += seccion('i-building', 'Empresa y contacto', 1,
      blk('Datos de la empresa', est.empresa, '<dl class="kv">' + fila('Razón social', fixE ? $('#ed-rs').value.trim() : e.razon_social) + fila('RUT', formatoRut(rutEmp)) + fila('Régimen actual', fixE ? $('#ed-reg').value : e.regimen) + fila('Dirección', fixE ? [$('#ed-dir').value.trim(), $('#ed-comuna').value.trim()].filter(Boolean).join(', ') : [e.direccion, e.comuna].filter(Boolean).join(', ')) + '</dl>')
      + blk('Responsable', est.contacto, '<dl class="kv">' + fila('Nombre', fixC ? [$('#r-nombre').value.trim(), $('#r-cargo').value.trim()].filter(Boolean).join(', ') : c.nombre)
        + (fixC && rutNormal($('#r-rut').value) ? fila('RUT', formatoRut(rutNormal($('#r-rut').value))) : '') + fila('WhatsApp', fixC ? $('#r-wsp').value.trim() : c.wa) + '</dl>')
      + blk('Correo de contacto oficial', est.correo, '<dl class="kv">' + fila('Correo', est.correo === 'fix' ? ($('#r-correo').value.trim().toLowerCase() + ' (lo confirma tu asesor; mientras, todo llega a ' + (c.correo_mascara || 'el registrado') + ')') : c.correo_mascara) + '</dl>')
      + '<div class="res-blk"><h4>Clave SII de la empresa</h4><dl class="kv">' + fila('Clave', claveEmpTxt()) + '</dl></div>'
      + blk('Cuenta bancaria de la empresa', est.cuenta_empresa, '<dl class="kv">' + fila('Cuenta', cuenta) + '</dl>'));
    var hs = socios.map(function (s, i) {
      var a = accesoSii(s), modo = modoSocio(s), regS = regCuenta('socio', s.rut), ct;
      if (modo === 'vigente' && regS) ct = 'Registrada: ' + txtCuentaReg(regS);
      else if (modo === 'sin_cuenta') ct = 'Sin cuenta · devolución por cheque al domicilio del SII' + (s.dirsii ? (s.dirsii === 'vigente' ? ' (dirección vigente)' : ' (la dirección cambió)') : '');
      else ct = cuentaTxt(s.banco, s.tipo, s.cuenta, s.guardado4);
      var otros = s.otros.map(function (t) { return t === 'ninguno' ? 'Ninguno' : OTROS[t] + (monto(s.montos[t]) != null ? ' (' + clp(s.montos[t]) + ' al año)' : ''); }).join(', ');
      var pills = pillEst(s.pre ? s.estado : 'nuevo') + '<span class="pill">' + esc(fmtPct(num(s.pct))) + '</span>'
        + (s.sueldo ? '<span class="pill">Sueldo en la empresa: ' + esc(SINO[s.sueldo]) + '</span>' : '')
        + (s.tgr ? '<span class="pill' + (s.tgr === 'si' ? ' r' : '') + '">Deuda TGR: ' + esc(SINO[s.tgr]) + '</span>' : '')
        + '<span class="pill ' + a.c + '">' + esc(a.t) + '</span>';
      return '<div class="res-socio"><b>' + esc(s.nombre.trim() || ('Socio ' + (i + 1))) + '</b> <span class="tenue">' + esc(s.rut) + '</span><div class="res-pills">' + pills + '</div><dl class="kv">'
        + fila('Otros ingresos', otros)
        + fila('APV / dividendo', s.ahorro.map(function (x) { return x === 'ninguno' ? 'Ninguno' : AHORRO[x]; }).join(', '))
        + fila('Cuenta bancaria', ct)
        + '</dl></div>';
    }).join('');
    h += seccion('i-users', 'Socios (' + socios.length + ')', 2, hs + '<p class="nota-correo"><svg class="ic" aria-hidden="true"><use href="#i-info"/></svg><span>Ingresos, Tesorería, APV y cuentas de los socios son respuestas nuevas.</span></p>');
    var objs = checks('obj');
    h += seccion('i-target', 'Objetivos', 3, '<p class="mb8">' + pillEst('nuevo') + '</p><dl class="kv">' + objs.map(function (k) { return fila(OBJ_NOM[k], detalleObjetivo(k) || 'Marcado'); }).join('') + '</dl>');
    var ret = radioVal('retiros-hechos');
    h += seccion('i-chart', 'Contexto del año', 4, '<p class="mb8">' + pillEst('nuevo') + '</p><dl class="kv">'
      + fila('Ventas vs. 2025', VENTAS[radioVal('ventas')])
      + fila('Eventos', checks('evento').map(function (v) { return EVENTOS[v]; }).join(', '))
      + fila('Detalle', $('#ev-det').value.trim())
      + fila('Retiros ya hechos', ret ? SINO[ret] + (ret === 'si' && $('#ret-monto').value ? ' · ' + clp($('#ret-monto').value) : '') : '')
      + fila('Comentarios', $('#comentarios').value.trim())
      + '</dl>');
    $('#resumen').innerHTML = '<p class="leyenda"><span class="pill v">Validado</span>precargado y confirmado <span class="pill a">Corregido</span>precargado y modificado <span class="pill n">Nuevo</span>respuesta nueva</p>' + h;
  }

  /* ─────────── Navegación ─────────── */
  function subeA(el) {
    var y = el ? (el.getBoundingClientRect().top + window.pageYOffset - 84) : 0;
    window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
  }
  function irA(n, op) {
    op = op || {};
    if (cerrado) n = 'cerrado';
    else if (enviada) n = 6;
    else if (!verificado) n = 0;
    ocultaError();
    if (n === 3 && checks('obj').indexOf('retiros') > -1) renderRetiros();
    if (n === 5) renderResumen();
    if (n === 6) {
      var pend = socios.filter(function (s) { return s.pendiente; }).map(function (s) { return s.nombre.trim() || 'un socio'; });
      $('#sig-sii').innerHTML = pend.length ? '<b>Quedó pendiente la clave SII</b> de ' + esc(pend.join(', ')) + '. Cuando la tengas, avísanos por tu grupo de WhatsApp y te habilitamos el formulario para agregarla.'
        : '<b>Recibimos las claves SII</b> cifradas: solo tu asesor puede verlas.';
      indicador('');
    }
    paso = n;
    $$('.step').forEach(function (s) { s.hidden = (s.dataset.step !== String(n)); });
    var enFlujo = typeof n === 'number' && n >= 1 && n <= 5;
    $('#progreso').hidden = !enFlujo;
    $('#acciones').hidden = !enFlujo;
    if (enFlujo) {
      var pct = Math.round(((n - 1) / 5) * 100);
      $('#p-num').textContent = n; $('#p-nom').textContent = NOMBRES[n]; $('#p-pct').textContent = pct + '%';
      $$('#p-bar i').forEach(function (seg, k) { seg.classList.toggle('on', k < n); });
      $('#p-bar').setAttribute('aria-valuenow', pct);
      $$('#p-lista li').forEach(function (li) { var p = +li.dataset.p; li.className = p < n ? 'ok' : (p === n ? 'act' : ''); if (p === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      $('#btn-atras').classList.toggle('oculto-vis', n === 1);
      $('#btn-sig .btn-sig-txt').textContent = n === 5 ? 'Enviar mis respuestas' : 'Continuar';
      $('#btn-sig use').setAttribute('href', n === 5 ? '#i-send' : '#i-right');
    }
    $('#saludo').hidden = !(verificado && !enviada && !cerrado);
    if (op.quieto) return;
    subeA($('#form-box'));
    var foco = n === 0 ? ($('#acc-rut').hidden ? $('#otp input') : $('#acc-rut-in')) : (n === 'cerrado' ? $('#hc') : $('.step[data-step="' + n + '"] h2'));
    if (foco) setTimeout(function () { foco.focus({ preventScroll: true }); }, reduce ? 0 : 350);
  }

  $('#btn-sig').addEventListener('click', function () {
    var btn = this;
    if (btn.disabled || !valida(paso)) return;
    if (paso === 5) return enviar(btn);
    var siguiente = paso + 1;
    ocupado(btn, true);
    guardar({ silencioso: true, paso: siguiente }).then(function (r) {
      ocupado(btn, false);
      if (!r || r.omitido || r.ok) { if (!cerrado && !enviada && verificado) irA(siguiente); return; }
      var cod = errDe(r);
      if (['SESION_INVALIDA', 'VERSION_DESACTUALIZADA', 'YA_ENVIADA'].indexOf(cod) > -1 || esCerrado(r)) return;   // ya manejado
      if (cod === 'RED' || cod === 'ERROR_INTERNO' || cod === 'DEMASIADOS_INTENTOS') {
        // No se bloquea el avance: lo escrito sigue en memoria y se reintenta en el próximo guardado.
        aviso('No pudimos guardar en este momento (' + texto(cod).replace(/\.$/, '').toLowerCase() + '). Puedes seguir: lo intentamos de nuevo en el próximo paso.', 'alerta');
        irA(siguiente); return;
      }
      manejarError(r, paso);
    });
  });
  $('#btn-atras').addEventListener('click', function () { irA(Math.max(1, paso - 1)); });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]'); if (!g) return;
    e.preventDefault();
    if (g.dataset.go === 'form') irA(cerrado ? 'cerrado' : (verificado ? paso : 0));
    else irA(+g.dataset.go);
  });
  $('#btn-salir').addEventListener('click', function () {
    var btn = this; ocupado(btn, true);
    var fin = function () { cerrarSesion(); window.location.replace(window.location.pathname); };
    if (cambios > 0) guardar({ silencioso: true }).then(fin, fin); else fin();
  });
  $('#form').addEventListener('submit', function (e) { e.preventDefault(); });
  $('#form').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); } });

  /* Autoguardado en el servidor (nunca en el navegador). */
  setInterval(function () {
    if (verificado && sesion && !enviada && !cerrado && cambios > 0 && typeof paso === 'number' && paso >= 1 && paso <= 5) guardar({ silencioso: true });
  }, Math.max(20, +CFG.AUTOGUARDADO_SEG || 60) * 1000);

  /* Al salir: avisar si hay cambios sin guardar y cerrar la sesión en el servidor. */
  window.addEventListener('beforeunload', function (e) { if (verificado && !enviada && cambios > 0) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', function () { cerrarSesion(true); });

  /* Botón "Comenzar" fijo en el celular: se oculta al llegar al formulario. */
  var mcta = $('#movil-cta');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { mcta.classList.toggle('fuera', en[0].isIntersecting); }, { threshold: 0.05 }).observe($('#formulario'));
  }

  /* Inicio */
  renderSocios();
  if (CFG.FORMULARIO_ABIERTO === false) { cerrado = true; irA('cerrado', { quieto: true }); }
  else irA(0, { quieto: true });
})();
