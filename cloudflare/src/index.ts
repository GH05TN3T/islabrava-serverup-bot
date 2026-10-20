// Bot de «server up» de Isla Brava RP
//
//  POST /interactions   → Discord (comando /serverup)
//  POST /fivem/up       → el recurso islabrava_serverup avisa de que el servidor ha arrancado
//  GET  /setup?key=…    → registra el comando /serverup en Discord (una vez, o tras cambiarlo)
//  GET  /               → comprobación rápida de que el bot está vivo

export interface Env {
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  SERVERUP_KEY: string;
  DISCORD_APP_ID: string;
  GUILD_ID?: string;
  CHANNEL_ID: string;
  PING?: string;
  STAFF_ROLE_IDS?: string;
  SERVER_NAME?: string;
  TITLE?: string;
  MESSAGE?: string;
  GIF_URL?: string;
  COLOR?: string;
  CONNECT_URL?: string;
  FIVEM_ENDPOINT?: string;
  COOLDOWN_MIN?: string;
  /** Solo para pruebas en local: otra dirección para la API de Discord */
  DISCORD_API?: string;
}

const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;
const EPHEMERAL = 64;
const MARK = 'islabrava-serverup'; // va en el pie del aviso para reconocer los nuestros

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const api = (env: Env) => (env.DISCORD_API || 'https://discord.com/api/v10').replace(/\/$/, '');

async function discord(env: Env, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(api(env) + path, {
    method,
    headers: {
      authorization: `Bot ${env.DISCORD_TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'DiscordBot (https://github.com, 1.0) islabrava-serverup',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ------------------------------------------------------------------ firma de Discord (Ed25519)
const hex = (s: string) => new Uint8Array((s.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));

async function verify(env: Env, request: Request, body: string): Promise<boolean> {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  if (!sig || !ts || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hex(env.DISCORD_PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hex(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

/** Compara dos textos sin dar pistas por el tiempo que tarda */
function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0 && a.length > 0;
}

// ------------------------------------------------------------------ el aviso
type Players = { online: number; max: number } | null;

async function readPlayers(env: Env): Promise<Players> {
  const base = (env.FIVEM_ENDPOINT || '').replace(/\/$/, '');
  if (!base) return null;
  try {
    const signal = AbortSignal.timeout(3000);
    const [p, i] = await Promise.all([fetch(`${base}/players.json`, { signal }), fetch(`${base}/info.json`, { signal })]);
    const players = (await p.json()) as unknown[];
    const info = (await i.json()) as { vars?: Record<string, string> };
    const max = Number(info?.vars?.sv_maxClients || 0);
    return { online: Array.isArray(players) ? players.length : 0, max };
  } catch {
    return null;
  }
}

function connectCode(url: string): string {
  const m = url.match(/cfx\.re\/join\/([a-z0-9]+)/i);
  return m ? `cfx.re/join/${m[1]}` : url.replace(/^https?:\/\//, '');
}

function colour(c?: string): number {
  const n = parseInt((c || '#2ecc71').replace('#', ''), 16);
  return Number.isFinite(n) ? n : 0x2ecc71;
}

function buildMessage(env: Env, opts: { text?: string; ping?: boolean; players?: Players; auto?: boolean }) {
  const name = env.SERVER_NAME || 'Isla Brava RP';
  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (env.CONNECT_URL) fields.push({ name: 'Conectar', value: '`connect ' + connectCode(env.CONNECT_URL) + '`', inline: true });
  if (opts.players) fields.push({ name: 'Jugadores', value: `${opts.players.online}${opts.players.max ? ` / ${opts.players.max}` : ''}`, inline: true });
  fields.push({ name: 'Estado', value: '🟢 En línea', inline: true });

  const embed = {
    title: `${env.TITLE || 'SERVER UP'} · ${name}`,
    description: opts.text || env.MESSAGE || '¡El servidor está abierto!',
    color: colour(env.COLOR),
    fields,
    image: env.GIF_URL ? { url: env.GIF_URL } : undefined,
    footer: { text: `${name} · ${opts.auto ? 'aviso automático' : 'aviso del staff'} · ${MARK}` },
    timestamp: new Date().toISOString(),
  };

  // a quién se menciona
  const ping = opts.ping === false ? '' : (env.PING || '').trim();
  let content = '';
  const allowed: { parse: string[]; roles: string[] } = { parse: [], roles: [] };
  if (ping === 'everyone' || ping === 'here') { content = `@${ping}`; allowed.parse.push('everyone'); }
  else if (/^\d{15,22}$/.test(ping)) { content = `<@&${ping}>`; allowed.roles.push(ping); }

  const components = env.CONNECT_URL && /^https?:\/\//.test(env.CONNECT_URL)
    ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Conectar', url: env.CONNECT_URL, emoji: { name: '🎮' } }] }]
    : [];

  return { content, embeds: [embed], components, allowed_mentions: allowed };
}

/** ¿Hemos publicado un server up hace menos de COOLDOWN_MIN minutos? (mira los últimos mensajes del canal) */
async function recentlyPosted(env: Env): Promise<boolean> {
  const mins = Number(env.COOLDOWN_MIN || 10);
  if (!(mins > 0)) return false;
  const r = await discord(env, 'GET', `/channels/${env.CHANNEL_ID}/messages?limit=15`);
  if (!r.ok) return false;
  const list = (await r.json()) as { timestamp: string; author?: { id: string }; embeds?: { footer?: { text?: string } }[] }[];
  const limit = Date.now() - mins * 60_000;
  return list.some((m) => m.author?.id === env.DISCORD_APP_ID && (m.embeds || []).some((e) => (e.footer?.text || '').includes(MARK)) && Date.parse(m.timestamp) > limit);
}

async function post(env: Env, opts: { text?: string; ping?: boolean; auto?: boolean }): Promise<{ ok: boolean; error?: string; url?: string }> {
  if (!env.CHANNEL_ID) return { ok: false, error: 'Falta CHANNEL_ID en wrangler.jsonc' };
  const players = await readPlayers(env);
  const r = await discord(env, 'POST', `/channels/${env.CHANNEL_ID}/messages`, buildMessage(env, { ...opts, players }));
  if (!r.ok) {
    const t = await r.text();
    const why = r.status === 403 ? 'El bot no puede escribir en ese canal (dale permiso de Ver canal, Enviar mensajes, Insertar enlaces y Mencionar @everyone).'
      : r.status === 404 ? 'No encuentro el canal: revisa CHANNEL_ID.'
      : r.status === 401 ? 'El token del bot no es válido: revisa el secret DISCORD_TOKEN.'
      : `Discord respondió ${r.status}: ${t.slice(0, 200)}`;
    return { ok: false, error: why };
  }
  const m = (await r.json()) as { id: string; channel_id: string };
  return { ok: true, url: env.GUILD_ID ? `https://discord.com/channels/${env.GUILD_ID}/${m.channel_id}/${m.id}` : undefined };
}

// ------------------------------------------------------------------ comando /serverup
const COMMAND = {
  name: 'serverup',
  description: 'Publica el aviso de que el servidor está abierto',
  default_member_permissions: String(MANAGE_GUILD), // lo ven los admins; puedes darlo a más roles en Ajustes → Integraciones
  dm_permission: false,
  options: [
    { type: 3, name: 'mensaje', description: 'Texto del aviso (si no, el de siempre)', required: false, max_length: 1500 },
    { type: 5, name: 'mencionar', description: 'Mencionar a todos (sí por defecto)', required: false },
    { type: 5, name: 'prueba', description: 'Solo te lo enseña a ti, sin publicarlo', required: false },
  ],
};

type Interaction = {
  type: number;
  token: string;
  application_id: string;
  data?: { name: string; options?: { name: string; value: string | boolean }[] };
  member?: { permissions?: string; roles?: string[] };
};

function isStaff(env: Env, i: Interaction): boolean {
  const perms = BigInt(i.member?.permissions || '0');
  if ((perms & ADMINISTRATOR) !== 0n || (perms & MANAGE_GUILD) !== 0n) return true;
  const roles = (env.STAFF_ROLE_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (i.member?.roles || []).some((r) => roles.includes(r));
}

async function followUp(env: Env, i: Interaction, body: unknown) {
  await fetch(`${api(env)}/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function onInteraction(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.text();
  if (!(await verify(env, request, body))) return new Response('firma no válida', { status: 401 });
  const i = JSON.parse(body) as Interaction;

  if (i.type === 1) return json({ type: 1 }); // PING de Discord al guardar la URL

  if (i.type === 2 && i.data?.name === 'serverup') {
    if (!isStaff(env, i)) return json({ type: 4, data: { flags: EPHEMERAL, content: 'Solo el staff puede publicar el server up.' } });
    const opt = (n: string) => i.data?.options?.find((o) => o.name === n)?.value;
    const text = typeof opt('mensaje') === 'string' ? (opt('mensaje') as string) : undefined;
    const ping = opt('mencionar') === false ? false : true;

    if (opt('prueba') === true) {
      const preview = buildMessage(env, { text, ping, players: await readPlayers(env) });
      return json({ type: 4, data: { flags: EPHEMERAL, content: `Así saldrá${preview.content ? ` (con ${preview.content})` : ''}:`, embeds: preview.embeds, components: preview.components } });
    }

    // Discord da 3 segundos: respondemos ya y publicamos detrás
    ctx.waitUntil((async () => {
      const r = await post(env, { text, ping, auto: false });
      await followUp(env, i, { content: r.ok ? `✅ Server up publicado${r.url ? `: ${r.url}` : '.'}` : `❌ ${r.error}` });
    })());
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  return json({ type: 4, data: { flags: EPHEMERAL, content: 'Comando desconocido.' } });
}

// ------------------------------------------------------------------ aviso automático desde FiveM
async function onFivem(request: Request, env: Env): Promise<Response> {
  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.SERVERUP_KEY || !same(auth, env.SERVERUP_KEY)) return json({ ok: false, error: 'clave incorrecta' }, 401);
  let data: { force?: boolean; message?: string } = {};
  try { data = (await request.json()) as typeof data; } catch { /* sin cuerpo */ }
  if (!data.force && (await recentlyPosted(env))) return json({ ok: true, skipped: true, reason: `ya se publicó hace menos de ${env.COOLDOWN_MIN || 10} minutos` });
  const r = await post(env, { auto: true, text: data.message || undefined });
  return json(r, r.ok ? 200 : 502);
}

// ------------------------------------------------------------------ registrar el comando
async function onSetup(url: URL, env: Env): Promise<Response> {
  if (!env.SERVERUP_KEY || !same(url.searchParams.get('key') || '', env.SERVERUP_KEY)) return json({ ok: false, error: 'clave incorrecta' }, 401);
  if (!env.DISCORD_APP_ID) return json({ ok: false, error: 'Falta DISCORD_APP_ID en wrangler.jsonc' }, 400);
  const path = env.GUILD_ID ? `/applications/${env.DISCORD_APP_ID}/guilds/${env.GUILD_ID}/commands` : `/applications/${env.DISCORD_APP_ID}/commands`;
  const r = await discord(env, 'PUT', path, [COMMAND]);
  if (!r.ok) return json({ ok: false, error: `Discord respondió ${r.status}: ${(await r.text()).slice(0, 300)}` }, 502);
  return json({ ok: true, message: `Comando /serverup registrado ${env.GUILD_ID ? 'en tu servidor' : 'en todos los servidores del bot'}.` });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/interactions') return onInteraction(request, env, ctx);
    if (request.method === 'POST' && url.pathname === '/fivem/up') return onFivem(request, env);
    if (request.method === 'GET' && url.pathname === '/setup') return onSetup(url, env);
    if (request.method === 'GET' && url.pathname === '/') return new Response(`${env.SERVER_NAME || 'Isla Brava RP'} · bot de server up funcionando`);
    return new Response('No encontrado', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
