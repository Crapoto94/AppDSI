# Sync-Listener.ps1
# HttpListener sur le port 8088 qui déclenche Start-ADSyncSyncCycle
# en arrière-plan et répond immédiatement.
#
# Installation :
#   1. Copier sur le serveur AD Connect (O365 ou O365-2)
#   2. Lancer en admin : powershell -File Sync-Listener.ps1

$port = 8088
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()
Write-Host "[Sync-Listener] En écoute sur le port $port..."

while ($listener.IsListening) {
    $ctx = $null
    try {
        $ctx = $listener.GetContext()
        $path = $ctx.Request.Url.AbsolutePath
        $method = $ctx.Request.HttpMethod

        if ($method -eq 'POST' -and $path -eq '/trigger-sync') {
            Write-Host "[Sync-Listener] Déclenchement synchro delta..."

            # Répondre immédiatement (la synchro prend 30-60s)
            $responseBytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $ctx.Response.StatusCode = 200
            $ctx.Response.OutputStream.Write($responseBytes, 0, $responseBytes.Length)
            $ctx.Response.Close()
            $ctx = $null

            # Lancer la synchro en arrière-plan
            Start-Job -ScriptBlock {
                Import-Module ADSync -ErrorAction Stop
                Start-ADSyncSyncCycle -PolicyType Delta
            } | Out-Null
            Write-Host "[Sync-Listener] Synchro lancée en arrière-plan"
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        Write-Host "[Sync-Listener] Erreur : $_"
    } finally {
        if ($ctx -ne $null) {
            try { $ctx.Response.Close() } catch {}
        }
    }
}

$listener.Stop()
