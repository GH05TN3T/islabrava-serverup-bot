# Isla Brava RP · bot de server up

Bot de Discord que publica el aviso de que el servidor está abierto: GIF de server up, mención a @everyone,
el comando `connect` y un botón **Conectar**.

- **Automático:** el bot mira cada 30 segundos si tu servidor de FiveM responde. Cuando pasa de apagado
  a encendido, publica el server up. Si reinicia varias veces seguidas, no lo repite durante 10 minutos.
- **A mano:** el staff escribe `/serverup` en Discord. Opciones: `mensaje` (texto distinto),
  `mencionar` (quitar el @everyone) y `prueba` (te lo enseña solo a ti, sin publicarlo).

Funciona en cualquier hosting de bots que ejecute Node.js 20.12 o más nuevo. No necesita base de datos.

## Subirlo a tu hosting

1. Sube este repositorio (o conéctalo desde GitHub en tu hosting).
2. Comando de inicio: `npm install` y después `npm start` (o `node index.js`).
3. Pon la configuración en las **variables de entorno** del hosting. Si tu hosting no tiene variables,
   copia `.env.example` como `.env` y rellénalo allí (el `.env` no se sube a GitHub).

| Variable | Qué es |
|---|---|
| `DISCORD_TOKEN` | token del bot (Developer Portal → Bot → Reset Token). **Solo en el hosting, nunca en GitHub** |
| `CHANNEL_ID` | ID del canal donde se publica el server up |
| `GUILD_ID` | ID de tu servidor de Discord |
| `PING` | `everyone`, `here`, el ID de un rol, o vacío para no mencionar |
| `STAFF_ROLE_IDS` | roles que pueden usar `/serverup` además de los admins |
| `CONNECT_URL` | tu enlace `https://cfx.re/join/xxxxxx` |
| `FIVEM_ENDPOINT` | `http://IP:30120` de tu servidor de FiveM (para el aviso automático y los jugadores) |
| `MESSAGE`, `TITLE`, `COLOR`, `GIF_URL`, `SERVER_NAME` | el texto y el aspecto del aviso |
| `CHECK_SECONDS`, `COOLDOWN_MIN` | cada cuánto mira el servidor y cuántos minutos sin repetir |

Para copiar un ID en Discord: Ajustes → Avanzado → **Modo desarrollador**. Luego, clic derecho en el
servidor o en el canal → **Copiar ID**.

## Invitar el bot

En https://discord.com/developers/applications → tu aplicación → **Installation** (o OAuth2 → URL Generator):
marca `bot` y `applications.commands`, con los permisos *Ver canales*, *Enviar mensajes*,
*Insertar enlaces* y *Mencionar @everyone*. Abre el enlace e invítalo a tu servidor.

Al arrancar, el bot registra `/serverup` solo. En la consola del hosting verás:

```
[serverup] conectado como TuBot#1234
[serverup] comando /serverup listo en tu servidor
[serverup] vigilando http://123.45.67.89:30120 cada 30 s
```

`/serverup` lo ven los administradores. Para dárselo a otro rol: Ajustes del servidor → Integraciones →
el bot → `/serverup`, o pon ese rol en `STAFF_ROLE_IDS`.

## Opcional: aviso desde el servidor de FiveM

Si tu hosting te deja abrir un puerto, pon `PORT` y `SERVERUP_KEY` (una clave larga inventada) y usa el
recurso `islabrava_serverup`. Así el aviso sale justo al arrancar, sin esperar a la vigilancia.
En el `server.cfg`:

```
set serverup_url "http://IP-DEL-BOT:PUERTO"
set serverup_key "TU_SERVERUP_KEY"
set serverup_delay 45
ensure islabrava_serverup
```

## Otra opción: Cloudflare Workers

En la carpeta `cloudflare` está el mismo bot para Cloudflare Workers (gratis, sin hosting). Allí no hay
vigilancia del servidor: el aviso automático lo manda el recurso `islabrava_serverup`. Los pasos están
en los comentarios de `cloudflare/wrangler.jsonc`.
