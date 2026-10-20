// Isla Brava RP · bot de server up (Node + discord.js)
//
// El staff escribe /serverup en Discord y el bot publica el aviso en el canal de anuncios:
// GIF de server up, mención a @everyone y botón «Conectar».
// Opciones del comando: mensaje (texto distinto), mencionar (quitar la mención) y prueba (solo te lo enseña a ti).
//
// Toda la configuración va en variables de entorno o en el archivo .env (copia .env.example).

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
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[serverup]', ...a);
if (!C.token) { console.error('Falta DISCORD_TOKEN (en el .env o en las variables del hosting).'); process.exit(1); }
if (!C.channel) console.warn('Aviso: falta CHANNEL_ID, no se podrá publicar hasta que lo pongas.');

// ------------------------------------------------------------------ el aviso
function connectCode(u) {
  const m = u.match(/cfx\.re\/join\/([a-z0-9]+)/i);
  return m ? `cfx.re/join/${m[1]}` : u.replace(/^https?:\/\//, '');
}

function buildMessage({ text, ping = true, by } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`${C.title} · ${C.name}`)
    .setDescription(text || C.message)
    .setColor(C.color)
    .setFooter({ text: by ? `${C.name} · publicado por ${by}` : C.name })
    .setTimestamp(new Date());
  if (C.gif) embed.setImage(C.gif);
  const fields = [];
  if (C.connect) fields.push({ name: 'Conectar', value: '`connect ' + connectCode(C.connect) + '`', inline: true });
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

async function publish({ text, ping, by }) {
  if (!C.channel) return { ok: false, error: 'Falta CHANNEL_ID en la configuración del bot.' };
  try {
    const ch = await client.channels.fetch(C.channel);
    if (!ch || !ch.isTextBased()) return { ok: false, error: 'CHANNEL_ID no es un canal de texto.' };
    const m = await ch.send(buildMessage({ text, ping, by }));
    log(`server up publicado por ${by}`);
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
    log(`comando /serverup listo ${C.guild ? 'en tu servidor' : 'en todos los servidores del bot (puede tardar unos minutos)'}`);
  } catch (e) {
    log('no se pudo registrar /serverup:', e?.message || e);
  }
});

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== 'serverup') return;
  const roles = Array.isArray(i.member?.roles) ? i.member.roles : [...(i.member?.roles?.cache?.keys() || [])];
  const staff = i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || i.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || roles.some((r) => C.staffRoles.includes(r));
  if (!staff) return i.reply({ content: 'Solo el staff puede publicar el server up.', flags: MessageFlags.Ephemeral });

  const text = i.options.getString('mensaje') || undefined;
  const ping = i.options.getBoolean('mencionar') !== false;
  const by = i.member?.displayName || i.user.username;

  if (i.options.getBoolean('prueba')) {
    const preview = buildMessage({ text, ping, by });
    return i.reply({ ...preview, content: `Así saldrá${preview.content ? ` (con ${preview.content})` : ''}:`, allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const r = await publish({ text, ping, by });
  await i.editReply(r.ok ? `✅ Server up publicado: ${r.url}` : `❌ ${r.error}`);
});

client.login(C.token).catch((e) => { console.error('No se pudo entrar en Discord:', e?.message || e); process.exit(1); });
