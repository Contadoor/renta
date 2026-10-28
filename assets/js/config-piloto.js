/* ═══════════════════════════════════════════════════════════════════════
   Preparemos tu Renta 2027 · configuración de la PÁGINA PILOTO (piloto.html)
   Igual a config.js salvo FORMULARIO_ABIERTO. La seguridad NO depende de este archivo: quién recibe
   un código lo decide SIEMPRE el servidor. Se borra al cerrar la prueba (E4).
   Único archivo que se edita para operar el sitio (sin build).
   Aquí NO hay secretos: todo lo de este archivo es público por diseño.
   ═══════════════════════════════════════════════════════════════════════ */
window.RENTA_CONFIG = Object.freeze({
  /* API pública (Edge Function renta-publica). Debe calzar EXACTO con connect-src de la CSP en index.html. */
  API_URL: 'https://ulxoxqbuxiuylaolaqxj.supabase.co/functions/v1/renta-publica',

  /* VIDEO (MP4 propio, sin YouTube): el Editor deja assets/renta_video.mp4 y assets/renta_poster.jpg.
     Ya está en el sitio (true). Si se quita el MP4, poner false: así se muestra el póster con "Video disponible pronto". */
  VIDEO_DISPONIBLE: true,
  VIDEO_MP4: 'assets/renta_video.mp4',

  /* Interruptor manual de la campaña. false = el sitio muestra "Todavía no abrimos el formulario" sin llamar a la API.
     (Además, si la API responde NO_DISPONIBLE, el sitio muestra el mismo mensaje.) */
  FORMULARIO_ABIERTO: true,   /* SOLO en la página piloto. index.html sigue con config.js (false). */

  /* Fecha sugerida que se muestra en el hero (tanda 1: 15 de noviembre; tanda Cumplimiento: 22 de noviembre). */
  FECHA_LIMITE: '15 de noviembre',

  /* Versión del aviso de privacidad que se acepta (debe ser la misma que exige el servidor). */
  AVISO_PRIVACIDAD: 'renta-2027-v1',

  /* Autoguardado del borrador en el servidor (segundos). Nunca se guarda nada en el navegador. */
  AUTOGUARDADO_SEG: 60,

  /* La Edge NO exige apikey (verify_jwt = false). Si algún día la exigiera, poner true:
     se enviaría la clave "anon" del proyecto, que es PÚBLICA (rol anon, la misma que ya publica Gestoor en supabase.js).
     No da acceso a tablas desde este sitio: la CSP solo permite conectarse a la Edge. NUNCA poner aquí service_role. */
  ENVIAR_APIKEY: false,
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVseG94cWJ1eGl1eWxhb2xhcXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNDMwNDcsImV4cCI6MjA5OTcxOTA0N30.bN_KeSJFEBKSBzwTixRQs92y6aEhBo-SJs4fGxZgAbA'
});
