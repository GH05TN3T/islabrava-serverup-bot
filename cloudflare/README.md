# Isla Brava RP · bot de server up

Publica en Discord el aviso de que el servidor está abierto, con el GIF de server up, mención a @everyone,
el comando `connect` y un botón **Conectar**.

- **Automático:** el recurso `islabrava_serverup` avisa al bot cada vez que el servidor de FiveM arranca.
  Si el servidor reinicia varias veces seguidas, no repite el aviso durante 10 minutos.
- **A mano:** el staff escribe `/serverup` en Discord. Opciones: `mensaje` (texto distinto),
  `mencionar` (quitar el @everyone) y `prueba` (te lo enseña solo a ti, sin publicarlo).

El bot corre en Cloudflare Workers (gratis), igual que la tienda. No hace falta tener un PC encendido.

## 1. La aplicación de Discord

En https://discord.com/developers/applications, abre tu aplicación (Application ID `1562153483032072263`):

1. **General Information:** copia la **Public Key**.
2. **Bot:** pulsa **Reset Token** y copia el **token**. No se lo pases a nadie ni lo pegues en ningún chat.
3. **Installation** (o **OAuth2 → URL Generator**): marca `bot` y `applications.commands`, con los permisos
   *Ver canales*, *Enviar mensajes*, *Insertar enlaces* y *Mencionar @everyone*. Abre el enlace que sale
   e invita el bot a tu servidor.

El **Client Secret** no se usa para este bot.

## 2. Subir el bot a Cloudflare

Dentro de la carpeta `cloudflare`:

```
npm install
npx wrangler login
npx wrangler deploy
```

Al terminar te da la dirección del bot, algo como `https://islabrava-serverup.TU-CUENTA.workers.dev`.

Después, guarda las tres claves como Secrets (te pide el valor de cada una):

```
npx wrangler secret put DISCORD_TOKEN        # el token del bot
npx wrangler secret put DISCORD_PUBLIC_KEY   # la Public Key
npx wrangler secret put SERVERUP_KEY         # invéntate una clave larga; la misma va en el server.cfg
```

También se puede hacer desde el panel de Cloudflare: Workers → islabrava-serverup → Settings → Variables and Secrets.

## 3. Ajustes (`cloudflare/wrangler.jsonc`)

| Ajuste | Qué es |
|---|---|
| `GUILD_ID` | ID de tu servidor de Discord (con él, el comando sale al momento) |
| `CHANNEL_ID` | ID del canal donde se publica el server up |
| `PING` | `everyone`, `here`, el ID de un rol, o vacío para no mencionar |
| `STAFF_ROLE_IDS` | roles que pueden usar `/serverup` además de los admins |
| `CONNECT_URL` | tu enlace `https://cfx.re/join/xxxxxx` |
| `FIVEM_ENDPOINT` | opcional, `http://IP:30120`, para enseñar cuántos jugadores hay |
| `MESSAGE`, `TITLE`, `COLOR`, `GIF_URL`, `SERVER_NAME` | el texto y el aspecto del aviso |
| `COOLDOWN_MIN` | minutos sin repetir el aviso automático |

Para copiar un ID en Discord: Ajustes → Avanzado → **Modo desarrollador**. Luego, clic derecho en el
servidor o en el canal → **Copiar ID**.

Cada vez que cambies algo, vuelve a ejecutar `npx wrangler deploy`.

## 4. Conectar el bot con Discord

1. En el Developer Portal → **General Information → Interactions Endpoint URL**, pon
   `https://islabrava-serverup.TU-CUENTA.workers.dev/interactions` y guarda.
   Discord comprueba la dirección: si da error, revisa el secret `DISCORD_PUBLIC_KEY`.
2. Abre en el navegador `https://islabrava-serverup.TU-CUENTA.workers.dev/setup?key=TU_SERVERUP_KEY`
   para registrar el comando `/serverup`. Tiene que decir «Comando /serverup registrado».
3. En Discord, escribe `/serverup prueba:True` para ver cómo queda sin publicarlo.

`/serverup` lo ven los administradores. Para dárselo a otro rol: Ajustes del servidor → Integraciones →
el bot → `/serverup`, o pon ese rol en `STAFF_ROLE_IDS`.

## 5. Server up automático en FiveM

Copia la carpeta `islabrava_serverup` en `resources` y añade esto al final del `server.cfg`:

```
set serverup_url "https://islabrava-serverup.TU-CUENTA.workers.dev"
set serverup_key "TU_SERVERUP_KEY"
set serverup_delay 45
ensure islabrava_serverup
```

Usa `set` y no `setr`, así los jugadores no ven la clave. `serverup_delay` son los segundos que espera
después de arrancar para que carguen todos los scripts.

En la consola del servidor:
- `serverup` lo vuelve a publicar (respeta los 10 minutos).
- `serverup forzar` lo publica aunque ya se haya publicado hace poco.
