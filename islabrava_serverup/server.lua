-- Isla Brava RP · server up automático
--
-- Solo hace falta si tu bot tiene un puerto abierto (PORT en el .env). Si no, el bot ya detecta solo el arranque.
-- En el server.cfg (la clave NO va en este archivo; usa set, no setr, para que no la vean los jugadores):
--   set serverup_url "http://IP-DEL-BOT:PUERTO"   (o la dirección de Cloudflare si usas esa versión)
--   set serverup_key "la-misma-clave-que-SERVERUP_KEY"
--   set serverup_delay 45          # segundos que espera tras arrancar (para que carguen todos los scripts)
--   ensure islabrava_serverup      # ponlo el último
--
-- En la consola del servidor:  serverup            → lo vuelve a publicar (respeta la espera anti-repetición)
--                              serverup forzar     → lo publica aunque se haya publicado hace poco

local function publish(force)
    local url = GetConvar('serverup_url', '')
    local key = GetConvar('serverup_key', '')
    if url == '' or key == '' then
        print('^1[serverup]^7 Falta serverup_url o serverup_key en el server.cfg')
        return
    end
    url = url:gsub('/+$', '') .. '/fivem/up'
    PerformHttpRequest(url, function(status, body)
        if status == 200 then
            local ok, res = pcall(json.decode, body or '')
            if ok and res and res.skipped then
                print('^3[serverup]^7 No se repite: ' .. tostring(res.reason))
            else
                print('^2[serverup]^7 Server up publicado en Discord')
            end
        elseif status == 401 then
            print('^1[serverup]^7 La clave no coincide con SERVERUP_KEY del bot')
        else
            print(('^1[serverup]^7 No se pudo publicar (%s): %s'):format(tostring(status), tostring(body)))
        end
    end, 'POST', json.encode({ force = force == true }), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. key,
    })
end

CreateThread(function()
    local delay = math.max(0, GetConvarInt('serverup_delay', 45))
    Wait(delay * 1000)
    publish(false)
end)

RegisterCommand('serverup', function(source, args)
    if source ~= 0 then return end -- solo desde la consola del servidor
    publish(args[1] == 'forzar' or args[1] == 'force')
end, true)
