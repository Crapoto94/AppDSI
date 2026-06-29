# Sync-Listener.ps1
# À déployer sur le serveur Azure AD Connect (O365 ou O365-2)
# HttpListener sur le port 8088 qui déclenche Start-ADSyncSyncCycle à chaque requête POST /trigger-sync
#
# Installation :
#   1. Copier ce fichier sur le serveur AD Connect
#   2. Lancer en admin : powershell -File Sync-Listener.ps1
#   (Ou créer une tâche planifiée au démarrage)

$port = 8088
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()
Write-Host "[Sync-Listener] En écoute sur le port $port..."

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $path = $ctx.Request.Url.AbsolutePath
        $method = $ctx.Request.HttpMethod

        if ($method -eq 'POST' -and $path -eq '/trigger-sync') {
            Write-Host "[Sync-Listener] Déclenchement synchro delta..."
            Import-Module ADSync -ErrorAction Stop
            Start-ADSyncSyncCycle -PolicyType Delta
            $ctx.Response.StatusCode = 200
            $responseBytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
            $ctx.Response.OutputStream.Write($responseBytes, 0, $responseBytes.Length)
            Write-Host "[Sync-Listener] Synchro terminée avec succès"
        } else {
            $ctx.Response.StatusCode = 404
        }
    } catch {
        Write-Host "[Sync-Listener] Erreur : $_"
        $ctx.Response.StatusCode = 500
    } finally {
        $ctx.Response.Close()
    }
}

$listener.Stop()
