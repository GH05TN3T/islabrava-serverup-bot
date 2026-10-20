// Isla Brava RP · bot de server up (Node + discord.js)
//
// - /serverup en Discord (solo staff): publica el aviso. Opciones: mensaje, mencionar, prueba.
// - Automático: mira cada CHECK_SECONDS si el servidor de FiveM responde; cuando pasa de apagado a
//   encendido, publica el server up.
// - Opcional: si pones PORT y SERVERUP_KEY, el recurso islabrava_serverup puede avisar al arrancar (POST /fivem/up).
//
// Toda la configuración va en variables de entorno o en el archivo .env (copia .env.example).

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events, GatewayIntentBits,
  InteractionContextType, MessageFlags, PermissionFlagsBits, REST, Routes, SlashCommandBuilder,
} from 'discord.js';

try { process.loadEnvFile?.('.env'); } catch { /* sin .env: se usan las variables del hosting */ }

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const C = {
  token: env('DISCORD_TOKEN'),
  guild: env('GUILD_ID'),
  channel: env('CHANNEL_ID'),
  ping: env('PING', 'everyone'),
  staffRoles: env('STAFF_ROLE_IDS').split(',').map((s) => s.trim()).filter(Boolean),
  name: env('SERVER_NAME', 'Isla Brava RP'),
  title: env('TITLE', 'SERVER UP'),
  message: env('MESSAGE', '¡La isla está abierta! Ya pueden entrar a rolear.'),
  gif: env('GIF_URL', 'https://r2.fivemanage.com/G9m8tDHp4yVCd283cW1YL/server_up.gif'),
  color: parseInt(env('COLOR', '#2ecc71').replace('#', ''), 16) || 0x2ecc71,
  connect: env('CONNECT_URL'),
  fivem: env('FIVEM_ENDPOINT').replace(/\/$/, ''),
  checkSeconds: Math.max(10, Number(env('CHECK_SECONDS', '30')) || 30),
  cooldownMin: Math.max(0, Number(env('COOLDOWN_MIN', '10')) || 0),
  port: Number(env('PORT', '')) || 0,
  key: env('SERVERUP_KEY'),
};
const MARK = 'islabrava-serverup'; // va en el pie del aviso para reconocer los nuestros

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[serverup]', ...a);
if (!C.token) { console.error('Falta DISCORD_TOKEN (en el .env o en las variables del hosting).'); process.exit(1); }
if (!C.channel) console.warn('Aviso: falta CHANNEL_ID, no se podrá publicar hasta que lo pongas.');

// ------------------------------------------------------------------ jugadores (opcional)
async function fivemInfo() {
  if (!C.fivem) return null;
  try {
    const signal = AbortSignal.timeout(4000);
    const [i, p] = await Promise.all([fetch(`${C.fivem}/info.json`, { signal }), fetch(`${C.fivem}/players.json`, { signal })]);
    if (!i.ok) return null;
    const info = await i.json();
    const players = p.ok ? await p.json() : [];
    return { online: Array.isArray(players) ? players.length : 0, max: Number(info?.vars?.sv_maxClients || 0) };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ el aviso
const connectCode = (u) => (u.match(/cfx\.re\/join\/([a-z0-9]+)/i) ? `cfx.re/join/${u.match(/cfx\.re\/join\/([a-z0-9]+)/i)[1]}` : u.replace(/^https?:\/\//, ''));

function buildMessage({ text, ping = true, players = null, auto = false } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`${C.title} · ${C.name}`)
    .setDescription(text || C.message)
    .setColor(C.color)
    .setFooter({ text: `${C.name} · ${auto ? 'aviso automático' : 'aviso del staff'} · ${MARK}` })
    .setTimestamp(new Date());
  if (C.gif) embed.setImage(C.gif);
  const fields = [];
  if (C.connect) fields.push({ name: 'Conectar', value: '`connect ' + connectCode(C.connect) + '`', inline: true });
  if (players) fields.push({ name: 'Jugadores', value: `${players.online}${players.max ? ` / ${players.max}` : ''}`, inline: true });
  fields.push({ name: 'Estado', value: '🟢 En línea', inline: true });
  embed.addFields(fields);

  let content = '';
  const allowedMentions = { parse: [], roles: [] };
  const p = ping ? C.ping : '';
  if (p === 'everyone' || p === 'here') { content = `@${p}`; allowedMentions.parse.push('everyone'); }
  else if (/^\d{15,22}$/.test(p)) { content = `<@&${p}>`; allowedMentions.roles.push(p); }

  const components = /^https?:\/\//.test(C.connect)
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Conectar').setEmoji('🎮').setURL(C.connect))]
    : [];
  return { content, embeds: [embed], components, allowedMentions };
}

// ------------------------------------------------------------------ Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function channel() {
  const ch = await client.channels.fetch(C.channel);
  if (!ch || !ch.isTextBased()) throw new Error('CHANNEL_ID no es un canal de texto');
  return ch;
}

/** ¿Hemos publicado un server up hace menos de COOLDOWN_MIN minutos? */
async function recentlyPosted() {
  if (!C.cooldownMin) return false;
  try {
    const ch = await channel();
    const msgs = await ch.messages.fetch({ limit: 15 });
    const limit = Date.now() - C.cooldownMin * 60_000;
    return msgs.some((m) => m.author.id === client.user.id && m.createdTimestamp > limit && m.embeds.some((e) => (e.footer?.text || '').includes(MARK)));
  } catch {
    return false;
  }
}

async function publish({ text, ping = true, auto = false, force = false } = {}) {
  if (!C.channel) return { ok: false, error: 'Falta CHANNEL_ID' };
  if (auto && !force && (await recentlyPosted())) return { ok: true, skipped: true, reason: `ya se publicó hace menos de ${C.cooldownMin} minutos` };
  try {
    const ch = await channel();
    const m = await ch.send(buildMessage({ text, ping, auto, players: await fivemInfo() }));
    log(auto ? 'server up automático publicado' : 'server up publicado desde /serverup');
    return { ok: true, url: m.url };
  } catch (e) {
    const code = e?.code;
    const why = code === 50013 || code === 50001
      ? 'El bot no puede escribir en ese canal: dale Ver canal, Enviar mensajes, Insertar enlaces y Mencionar @everyone.'
      : code === 10003 ? 'No encuentro el canal: revisa CHANNEL_ID.' : String(e?.message || e);
    log('no se pudo publicar:', why);
    return { ok: false, error: why };
  }
}

const command = new SlashCommandBuilder()
  .setName('serverup')
  .setDescription('Publica el aviso de que el servidor está abierto')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('mensaje').setDescription('Texto del aviso (si no, el de siempre)').setMaxLength(1500))
  .addBooleanOption((o) => o.setName('mencionar').setDescription('Mencionar a todos (sí por defecto)'))
  .addBooleanOption((o) => o.setName('prueba').setDescription('Solo te lo enseña a ti, sin publicarlo'));

client.once(Events.ClientReady, async (c) => {
  log(`conectado como ${c.user.tag}`);
  try {
    const rest = new REST().setToken(C.token);
    const route = C.guild ? Routes.applicationGuildCommands(c.user.id, C.guild) : Routes.applicationCommands(c.user.id);
    await rest.put(route, { body: [command.toJSON()] });
    log(`comando /serverup listo ${C.guild ? 'en tu servidor' : 'en todos los servidores del bot'}`);
  } catch (e) {
    log('no se pudo registrar /serverup:', e?.message || e);
  }
  startMonitor();
});

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== 'serverup') return;
  const staff = i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || i.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || (Array.isArray(i.member?.roles) ? i.member.roles : [...(i.member?.roles?.cache?.keys() || [])]).some((r) => C.staffRoles.includes(r));
  if (!staff) return i.reply({ content: 'Solo el staff puede publicar el server up.', flags: MessageFlags.Ephemeral });

  const text = i.options.getString('mensaje') || undefined;
  const ping = i.options.getBoolean('mencionar') !== false;
  if (i.options.getBoolean('prueba')) {
    const preview = buildMessage({ text, ping, players: await fivemInfo() });
    return i.reply({ ...preview, content: `Así saldrá${preview.content ? ` (con ${preview.content})` : ''}:`, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const r = await publish({ text, ping });
  await i.editReply(r.ok ? `✅ Server up publicado: ${r.url}` : `❌ ${r.error}`);
});

// ------------------------------------------------------------------ automático: ¿ha pasado de apagado a encendido?
function startMonitor() {
  if (!C.fivem) { log('FIVEM_ENDPOINT vacío: el server up automático por vigilancia está apagado'); return; }
  let state = 'unknown'; // unknown → al arrancar el bot no publica si el servidor ya estaba encendido
  let fails = 0;
  const tick = async () => {
    const up = (await fivemInfo()) !== null;
    if (up) {
      if (state === 'down') {
        log('el servidor de FiveM vuelve a responder');
        await publish({ auto: true });
      }
      state = 'up';
      fails = 0;
    } else if (++fails >= 2 && state !== 'down') {
      // dos fallos seguidos para no confundir un corte de un segundo con un reinicio
      state = 'down';
      log('el servidor de FiveM no responde (apagado o reiniciando)');
    }
  };
  tick();
  setInterval(tick, C.checkSeconds * 1000);
  log(`vigilando ${C.fivem} cada ${C.checkSeconds} s`);
}

// ------------------------------------------------------------------ opcional: aviso desde el recurso de FiveM
function same(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
if (C.port) {
  http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'GET' && req.url === '/') return send(200, { ok: true, bot: client.user?.tag || null });
    if (req.method !== 'POST' || req.url !== '/fivem/up') return send(404, { ok: false });
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!C.key || !same(auth, C.key)) return send(401, { ok: false, error: 'clave incorrecta' });
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 10_000) req.destroy(); });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* sin cuerpo */ }
      if (!client.isReady()) return send(503, { ok: false, error: 'el bot aún no está conectado a Discord' });
      const r = await publish({ auto: true, force: data.force === true, text: data.message || undefined });
      send(r.ok ? 200 : 502, r);
    });
  }).listen(C.port, () => log(`escuchando avisos de FiveM en el puerto ${C.port}`));
}

client.login(C.token).catch((e) => { console.error('No se pudo entrar en Discord:', e?.message || e); process.exit(1); });
