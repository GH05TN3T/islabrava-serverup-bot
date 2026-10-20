# Isla Brava RP · bot de server up

Bot de Discord para publicar el aviso de **server up** en tu servidor de Discord.

El staff escribe `/serverup` y el bot publica en el canal de anuncios el aviso con el GIF de server up,
la mención a @everyone y un botón **Conectar**.

Opciones del comando:
- `mensaje`: escribe un texto distinto al de siempre.
- `mencionar: False`: lo publica sin mencionar a nadie.
- `prueba: True`: te lo enseña solo a ti, sin publicarlo.

## Subirlo a tu hosting

1. Conecta este repositorio en tu hosting de bots (rama `main`).
2. Comandos: `npm install` y después `npm start`. Necesita Node.js 20.12 o más nuevo.
3. Pon la configuración en las **variables de entorno** del hosting. Si tu hosting no tiene variables,
   copia `.env.example` como `.env` y rellénalo allí (el `.env` no se sube a GitHub).

| Variable | Qué es |
|---|---|
| `DISCORD_TOKEN` | token del bot (Developer Portal → Bot → Reset Token). **Solo en el hosting, nunca en GitHub** |
| `CHANNEL_ID` | ID del canal donde se publica el server up |
| `GUILD_ID` | ID de tu servidor de Discord |
| `PING` | `everyone`, `here`, el ID de un rol, o vacío para no mencionar |
| `STAFF_ROLE_IDS` | roles que pueden usar `/serverup` además de los admins (separados por comas) |
| `MESSAGE` | el texto de siempre |
| `TITLE`, `SERVER_NAME`, `COLOR`, `GIF_URL` | el título, el nombre, el color de la barra y el GIF |
| `CONNECT_URL` | opcional: tu enlace `https://cfx.re/join/xxxxxx` (sale el botón **Conectar**) |

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
```

`/serverup` lo ven los administradores. Para dárselo a otro rol: Ajustes del servidor → Integraciones →
el bot → `/serverup`, o pon ese rol en `STAFF_ROLE_IDS`.
