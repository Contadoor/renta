/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   Preparemos tu Renta 2027 · SOBRE SELLADO de las claves SII (paquete F2). MISMO archivo, byte a byte, en:
     · el sitio público (assets/js/sobre.js): SOLO usa `sellar` con la llave PÚBLICA de recepción (config.js);
     · la herramienta del Master (herramientas/renta-claves): usa `abrir` con la llave PRIVADA (llavero del Mac);
     · las pruebas (Deno/Node).
   Esquema ECIES (WebCrypto estándar, sin librerías): ECDH P-256 efímero → HKDF-SHA256 → AES-256-GCM.
     · kid  = primeros 16 hex de SHA-256(SPKI DER de la llave pública).
     · sal  = epk (65 bytes, punto sin comprimir) ‖ kid (ASCII);  info = "contadoor/prep-renta/sobre-v1".
     · AAD  = "PRT|v1|<periodo>|<rut empresa>|<titular>|<rut titular>|<kid>"  → amarra el sobre a SU empresa y SU titular:
              un sobre movido a otra fila/empresa/titular NO abre (sustitución detectada al promover).
     · texto plano con relleno fijo: 2 bytes de largo (big endian) + UTF-8 + ceros hasta 256 bytes → ct SIEMPRE 272 bytes
       (no revela el largo de la clave).
   Nada de este archivo es secreto. La clave en claro solo existe en la memoria del navegador (antes de sellar) y en la memoria del
   proceso del Master (al promover). Nunca se registra.
   ═══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function (g) {
  'use strict';
  var ALG = 'ECIES-P256-HKDF-SHA256-A256GCM-v1', INFO = 'contadoor/prep-renta/sobre-v1', LARGO = 256, CT = LARGO + 16;
  var S = g.crypto && g.crypto.subtle;
  var te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return g.btoa(s); }
  function deB64(t) {
    if (typeof t !== 'string' || !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(t)) throw new Error('SOBRE_INVALIDO');
    var s = g.atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u;
  }
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }
  function unir(a, b) { var u = new Uint8Array(a.length + b.length); u.set(a, 0); u.set(b, a.length); return u; }
  function claveOk(c) { return typeof c === 'string' && c.length >= 4 && c.length <= 64 && !/[\u0000-\u001f\u007f]/.test(c); }
  function aad(ctx, kid) {
    var p = [ctx && ctx.periodo, ctx && ctx.rut_empresa, ctx && ctx.titular, ctx && ctx.titular_rut];
    if (!/^AT\d{4}$/.test(p[0]) || !/^\d{7,8}-[0-9K]$/.test(p[1]) || (p[2] !== 'empresa' && p[2] !== 'socio') || !/^\d{7,8}-[0-9K]$/.test(p[3])
        || !/^[0-9a-f]{16}$/.test(kid)) throw new Error('CONTEXTO_INVALIDO');
    return te.encode('PRT|v1|' + p.join('|') + '|' + kid);
  }
  async function kidDe(spki) { return hex(new Uint8Array(await S.digest('SHA-256', spki))).slice(0, 16); }
  async function llaveAes(priv, pub, epkRaw, kid) {
    var bits = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
    var base = await S.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return S.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: unir(epkRaw, te.encode(kid)), info: te.encode(INFO) }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /** Sella una clave SII con la llave PÚBLICA de recepción. llave = { kid, spki_b64 }. Devuelve { v, kid, epk, iv, ct } en base64. */
  async function sellar(clave, llave, ctx) {
    if (!S) throw new Error('SIN_WEBCRYPTO');
    if (!claveOk(clave)) throw new Error('CLAVE_INVALIDA');
    var spki = deB64(llave && llave.spki_b64);
    var kid = await kidDe(spki);
    if (kid !== (llave && llave.kid)) throw new Error('LLAVE_INVALIDA');       // la llave publicada debe calzar con su huella
    var pub = await S.importKey('spki', spki, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    var ef = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    var epk = new Uint8Array(await S.exportKey('raw', ef.publicKey));
    var k = await llaveAes(ef.privateKey, pub, epk, kid);
    var u = te.encode(clave), plano = new Uint8Array(LARGO);
    plano[0] = u.length >> 8; plano[1] = u.length & 255; plano.set(u, 2);
    var iv = g.crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad(ctx, kid), tagLength: 128 }, k, plano));
    plano.fill(0); u.fill(0);
    return { v: 1, kid: kid, epk: b64(epk), iv: b64(iv), ct: b64(ct) };
  }
  /** Abre un sobre con la llave PRIVADA (CryptoKey ECDH P-256, uso deriveBits). Cualquier falla → Error('SOBRE_NO_ABRE'). */
  async function abrir(sobre, privada, ctx) {
    try {
      if (!sobre || sobre.v !== 1) throw 0;
      var epk = deB64(sobre.epk), iv = deB64(sobre.iv), ct = deB64(sobre.ct);
      if (epk.length !== 65 || epk[0] !== 4 || iv.length !== 12 || ct.length !== CT) throw 0;
      var pub = await S.importKey('raw', epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      var k = await llaveAes(privada, pub, epk, sobre.kid);
      var plano = new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: iv, additionalData: aad(ctx, sobre.kid), tagLength: 128 }, k, ct));
      var n = (plano[0] << 8) | plano[1];
      if (n < 1 || n > LARGO - 2) throw 0;
      for (var i = 2 + n; i < LARGO; i++) if (plano[i] !== 0) throw 0;
      var clave = td.decode(plano.subarray(2, 2 + n)); plano.fill(0);
      if (!claveOk(clave)) throw 0;
      return clave;
    } catch (e) { throw new Error('SOBRE_NO_ABRE'); }
  }
  /** Genera el par de recepción (solo en el Mac del Master). Devuelve { kid, spki_b64, pkcs8_b64 }. */
  async function generarPar() {
    var p = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var spki = new Uint8Array(await S.exportKey('spki', p.publicKey)), pk8 = new Uint8Array(await S.exportKey('pkcs8', p.privateKey));
    var r = { kid: await kidDe(spki), spki_b64: b64(spki), pkcs8_b64: b64(pk8) }; pk8.fill(0); return r;
  }
  /** F2.1 · HMAC-SHA256(sal de la operación, clave) en hex: el Mac lo presenta al confirmar y la Edge lo calcula al escribir (recibo). */
  async function huella(sal_b64, clave) {
    var k = await S.importKey('raw', deB64(sal_b64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(new Uint8Array(await S.sign('HMAC', k, te.encode(clave))));
  }
  /** Importa la privada (PKCS8 base64) como NO extraíble, solo para deriveBits. */
  async function importarPrivada(pkcs8_b64) { return S.importKey('pkcs8', deB64(pkcs8_b64), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']); }
  g.RentaSobre = Object.freeze({ ALG: ALG, LARGO_CT: CT, sellar: sellar, abrir: abrir, generarPar: generarPar, importarPrivada: importarPrivada, kidDe: kidDe, claveOk: claveOk, huella: huella });
})(typeof globalThis !== 'undefined' ? globalThis : window);
