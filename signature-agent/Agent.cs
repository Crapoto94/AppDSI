// Agent de signature DSI Hub (Windows) : permet au Parapheur de faire signer une empreinte (SHA-256) par une
// clé matérielle RGS** (carte à puce / clé USB, ex. Certinomis + SafeNet) branchée sur ce poste.
//
// Fonctionnement : le navigateur, sur la page de signature du Hub, appelle cet agent sur http://127.0.0.1:<port>.
// L'agent liste les certificats du magasin Windows (la clé les y publie via son pilote) et signe l'empreinte avec
// la clé privée via Windows CNG ; c'est le pilote de la clé (SafeNet) qui demande le code PIN.
//
// Sécurité :
//  - écoute uniquement sur 127.0.0.1 (jamais sur le réseau) ;
//  - n'accepte que les requêtes dont l'en-tête Origin figure dans la liste autorisée (agent.config.json) ;
//  - protection contre le « DNS rebinding » (en-tête Host contrôlé) ;
//  - chaque signature exige une confirmation explicite à l'écran (fenêtre Windows), puis le code PIN ;
//  - ne signe que des empreintes de 32 octets (SHA-256), jamais de document ; rien n'est écrit sur disque.
//
// Programme natif .NET Framework 4.x (présent par défaut sous Windows 10/11) : aucune dépendance, quelques dizaines de Ko.
// Compilation : build.ps1 (compilateur csc.exe livré avec Windows). Syntaxe C# 5 (compilateur du Framework).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Agent de signature DSI Hub")]
[assembly: AssemblyProduct("Agent de signature DSI Hub")]
[assembly: AssemblyCompany("Ville d'Ivry-sur-Seine - DSI")]
[assembly: AssemblyDescription("Signature des documents du Parapheur avec la clé cryptographique RGS** du poste")]
[assembly: AssemblyVersion("1.4.0.0")]
[assembly: AssemblyFileVersion("1.4.0.0")]

namespace DsiHubAgent
{
    // ─── Configuration (agent.config.json, à côté du programme) ─────────────────────────────────────
    static class Config
    {
        public const int DefaultPort = 47821;
        public static readonly string[] DefaultOrigins = { "https://dsihub.ivry.local", "https://parapheur.ivry94.fr", "http://localhost:5173" };
        public static readonly string BaseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        public static readonly string File = Path.Combine(BaseDir, "agent.config.json");
        static readonly object sync = new object();
        static List<string> origins;
        public static int Port;

        static string Clean(string o) { return (o ?? "").Trim().TrimEnd('/'); }

        public static void Load()
        {
            Dictionary<string, object> cfg = ReadFile();
            List<string> list = null;
            string env = Environment.GetEnvironmentVariable("AGENT_ORIGINS");
            if (!string.IsNullOrEmpty(env)) list = env.Split(',').ToList();
            else if (cfg.ContainsKey("origins") && cfg["origins"] is System.Collections.IEnumerable)
                list = ((System.Collections.IEnumerable)cfg["origins"]).Cast<object>().Select(x => Convert.ToString(x)).ToList();
            if (list == null) list = DefaultOrigins.ToList();
            origins = list.Select(Clean).Where(o => o.Length > 0).ToList();

            int port = 0;
            string envPort = Environment.GetEnvironmentVariable("AGENT_PORT");
            if (!string.IsNullOrEmpty(envPort)) int.TryParse(envPort, out port);
            else if (cfg.ContainsKey("port")) { try { port = Convert.ToInt32(cfg["port"]); } catch { port = 0; } }
            Port = port > 0 ? port : DefaultPort;
        }

        static Dictionary<string, object> ReadFile()
        {
            try
            {
                if (System.IO.File.Exists(File))
                {
                    object o = new JavaScriptSerializer().DeserializeObject(System.IO.File.ReadAllText(File, Encoding.UTF8));
                    Dictionary<string, object> d = o as Dictionary<string, object>;
                    if (d != null) return d;
                }
            }
            catch (Exception e) { Program.Log("agent.config.json illisible : " + e.Message); }
            return new Dictionary<string, object>();
        }

        public static string[] Origins { get { lock (sync) { return origins.ToArray(); } } }
        public static bool IsAllowed(string origin) { lock (sync) { return origins.Contains(origin); } }

        public static void SaveOrigins(List<string> list)
        {
            Dictionary<string, object> cfg = ReadFile();
            cfg["origins"] = list.ToArray();
            System.IO.File.WriteAllText(File, new JavaScriptSerializer().Serialize(cfg), new UTF8Encoding(false));
            lock (sync) { origins = list.ToList(); }
        }
    }

    // ─── Certificats et signature (CNG) ─────────────────────────────────────────────────────────────
    static class Keys
    {
        // Mode test uniquement : un certificat .pfx fourni par variable d'environnement, chargé en mémoire (jamais écrit dans le magasin Windows)
        static X509Certificate2 testCert;

        static IEnumerable<X509Certificate2> AllCerts()
        {
            List<X509Certificate2> all = new List<X509Certificate2>();
            X509Store store = new X509Store("My", StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly);
            try { foreach (X509Certificate2 c in store.Certificates) all.Add(c); }
            finally { store.Close(); }
            if (Program.TestMode)
            {
                string pfx = Environment.GetEnvironmentVariable("AGENT_TEST_PFX");
                if (!string.IsNullOrEmpty(pfx))
                {
                    if (testCert == null)
                        testCert = new X509Certificate2(pfx, Environment.GetEnvironmentVariable("AGENT_TEST_PFX_PASSWORD") ?? "", X509KeyStorageFlags.EphemeralKeySet);
                    all.Add(testCert);
                }
            }
            return all;
        }

        public static List<Dictionary<string, object>> List()
        {
            List<Dictionary<string, object>> output = new List<Dictionary<string, object>>();
            DateTime now = DateTime.Now;
            foreach (X509Certificate2 c in AllCerts())
            {
                try
                {
                    if (!c.HasPrivateKey) continue;
                    if (c.NotAfter < now || c.NotBefore > now) continue;
                    if (c.PublicKey.Oid.Value != "1.2.840.113549.1.1.1") continue; // RSA uniquement
                    bool nonRep = false, digSig = false;
                    foreach (X509Extension e in c.Extensions)
                    {
                        X509KeyUsageExtension ku = e as X509KeyUsageExtension;
                        if (ku == null) continue;
                        nonRep = (ku.KeyUsages & X509KeyUsageFlags.NonRepudiation) != 0;
                        digSig = (ku.KeyUsages & X509KeyUsageFlags.DigitalSignature) != 0;
                    }
                    List<string> chain = new List<string>();
                    using (X509Chain ch = new X509Chain())
                    {
                        ch.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                        ch.ChainPolicy.UrlRetrievalTimeout = TimeSpan.FromSeconds(6);
                        ch.Build(c);
                        foreach (X509ChainElement el in ch.ChainElements)
                        {
                            X509Certificate2 cc = el.Certificate;
                            if (cc.Thumbprint == c.Thumbprint) continue;
                            if (cc.Subject == cc.Issuer) continue; // racine : inutile dans la signature
                            chain.Add(Convert.ToBase64String(cc.RawData));
                        }
                    }
                    Dictionary<string, object> d = new Dictionary<string, object>();
                    d["thumbprint"] = c.Thumbprint;
                    d["subject"] = c.Subject;
                    d["issuer"] = c.Issuer;
                    d["friendlyName"] = c.FriendlyName;
                    d["notBefore"] = c.NotBefore.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
                    d["notAfter"] = c.NotAfter.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
                    d["nonRepudiation"] = nonRep;
                    d["digitalSignature"] = digSig;
                    d["certificate"] = Convert.ToBase64String(c.RawData);
                    d["chain"] = chain.ToArray();
                    output.Add(d);
                }
                catch (Exception e) { Program.Log("certificat ignoré : " + e.Message); }
            }
            return output.OrderByDescending(d => (bool)d["nonRepudiation"]).ThenBy(d => (string)d["subject"], StringComparer.CurrentCulture).ToList();
        }

        public static X509Certificate2 Find(string thumbprint)
        {
            foreach (X509Certificate2 c in AllCerts())
                if (string.Equals(c.Thumbprint, thumbprint, StringComparison.OrdinalIgnoreCase)) return c;
            return null;
        }
    }

    // ─── Serveur HTTP minimal, uniquement sur 127.0.0.1 ─────────────────────────────────────────────
    class HttpRequest
    {
        public string Method, Path, Body;
        public Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public string Header(string name) { string v; return Headers.TryGetValue(name, out v) ? v : ""; }
    }

    class HttpResponse
    {
        public int Status = 200;
        public Dictionary<string, string> Headers = new Dictionary<string, string>();
        public string Body = "";
    }

    class HttpFail : Exception { public int Status; public HttpFail(int status, string msg) : base(msg) { Status = status; } }

    static class Server
    {
        const int MaxBody = 16 * 1024;
        static TcpListener listener;
        static int busy;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer();

        public static bool Start()
        {
            try
            {
                listener = new TcpListener(IPAddress.Loopback, Config.Port);
                listener.Start();
            }
            catch (SocketException e)
            {
                Program.Log("Le port " + Config.Port + " est déjà utilisé : l'agent est probablement déjà lancé. (" + e.Message + ")");
                return false;
            }
            Thread t = new Thread(AcceptLoop);
            t.IsBackground = true;
            t.Start();
            return true;
        }

        static void AcceptLoop()
        {
            while (true)
            {
                try { TcpClient c = listener.AcceptTcpClient(); ThreadPool.QueueUserWorkItem(Handle, c); }
                catch (Exception e) { Program.Log("serveur : " + e.Message); Thread.Sleep(200); }
            }
        }

        static void Handle(object state)
        {
            using (TcpClient client = (TcpClient)state)
            {
                try
                {
                    client.ReceiveTimeout = 15000;
                    client.SendTimeout = 30000;
                    NetworkStream stream = client.GetStream();
                    HttpResponse res;
                    try { res = Dispatch(ReadRequest(stream)); }
                    catch (HttpFail f) { res = Json(f.Status, Err(f.Message), null); }
                    catch (Exception e) { Program.Log("Erreur : " + e.Message); res = Json(500, Err(e.Message), null); }
                    WriteResponse(stream, res);
                }
                catch (Exception) { /* connexion fermée par le navigateur */ }
            }
        }

        static HttpRequest ReadRequest(NetworkStream s)
        {
            byte[] buf = new byte[MaxBody + 4096];
            int total = 0, end = -1;
            while (end < 0)
            {
                if (total >= buf.Length) throw new HttpFail(413, "Requête trop volumineuse.");
                int n = s.Read(buf, total, buf.Length - total);
                if (n <= 0) throw new HttpFail(400, "Requête incomplète.");
                total += n;
                for (int i = Math.Max(0, total - n - 3); i + 3 < total; i++)
                    if (buf[i] == 13 && buf[i + 1] == 10 && buf[i + 2] == 13 && buf[i + 3] == 10) { end = i; break; }
            }
            string head = Encoding.ASCII.GetString(buf, 0, end);
            string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            if (first.Length < 2) throw new HttpFail(400, "Requête invalide.");
            HttpRequest rq = new HttpRequest();
            rq.Method = first[0].ToUpperInvariant();
            rq.Path = first[1];
            for (int i = 1; i < lines.Length; i++)
            {
                int c = lines[i].IndexOf(':');
                if (c > 0) rq.Headers[lines[i].Substring(0, c).Trim()] = lines[i].Substring(c + 1).Trim();
            }
            int len = 0;
            int.TryParse(rq.Header("Content-Length"), out len);
            if (len < 0 || len > MaxBody) throw new HttpFail(413, "Requête trop volumineuse.");
            byte[] body = new byte[len];
            int have = Math.Min(len, total - (end + 4));
            if (have > 0) Buffer.BlockCopy(buf, end + 4, body, 0, have);
            while (have < len)
            {
                int n = s.Read(body, have, len - have);
                if (n <= 0) throw new HttpFail(400, "Requête incomplète.");
                have += n;
            }
            rq.Body = Encoding.UTF8.GetString(body);
            return rq;
        }

        static readonly Dictionary<int, string> StatusText = new Dictionary<int, string> {
            { 200, "OK" }, { 204, "No Content" }, { 400, "Bad Request" }, { 403, "Forbidden" }, { 404, "Not Found" },
            { 409, "Conflict" }, { 413, "Payload Too Large" }, { 500, "Internal Server Error" } };

        static void WriteResponse(NetworkStream s, HttpResponse res)
        {
            byte[] body = Encoding.UTF8.GetBytes(res.Body ?? "");
            StringBuilder sb = new StringBuilder();
            string text; if (!StatusText.TryGetValue(res.Status, out text)) text = "OK";
            sb.Append("HTTP/1.1 ").Append(res.Status).Append(' ').Append(text).Append("\r\n");
            foreach (KeyValuePair<string, string> h in res.Headers) sb.Append(h.Key).Append(": ").Append(h.Value).Append("\r\n");
            sb.Append("Content-Length: ").Append(body.Length).Append("\r\nConnection: close\r\n\r\n");
            byte[] head = Encoding.ASCII.GetBytes(sb.ToString());
            s.Write(head, 0, head.Length);
            if (body.Length > 0) s.Write(body, 0, body.Length);
            s.Flush();
        }

        static Dictionary<string, object> Err(string message) { Dictionary<string, object> d = new Dictionary<string, object>(); d["error"] = message; return d; }

        static HttpResponse Json(int status, object body, Dictionary<string, string> cors)
        {
            HttpResponse r = new HttpResponse();
            r.Status = status;
            r.Headers["Content-Type"] = "application/json; charset=utf-8";
            r.Headers["Cache-Control"] = "no-store";
            if (cors != null) foreach (KeyValuePair<string, string> h in cors) r.Headers[h.Key] = h.Value;
            r.Body = json.Serialize(body);
            return r;
        }

        static HttpResponse Empty(int status, Dictionary<string, string> headers)
        {
            HttpResponse r = new HttpResponse();
            r.Status = status;
            if (headers != null) foreach (KeyValuePair<string, string> h in headers) r.Headers[h.Key] = h.Value;
            return r;
        }

        static HttpResponse Dispatch(HttpRequest rq)
        {
            string origin = rq.Header("Origin").TrimEnd('/');
            string host = rq.Header("Host");
            string path = rq.Path; int q = path.IndexOf('?'); if (q >= 0) path = path.Substring(0, q);
            bool hostOk = host == "127.0.0.1:" + Config.Port || host == "localhost:" + Config.Port;
            bool originOk = Config.IsAllowed(origin) || (Program.TestMode && origin.Length == 0);

            // Diagnostic : /status est lisible depuis n'importe quel site, pour que la page puisse expliquer POURQUOI l'agent est refusé
            Dictionary<string, string> statusCors = new Dictionary<string, string>();
            if (origin.Length > 0) { statusCors["Access-Control-Allow-Origin"] = origin; statusCors["Access-Control-Allow-Private-Network"] = "true"; statusCors["Vary"] = "Origin"; }
            Dictionary<string, string> cors = new Dictionary<string, string>();
            if (originOk && origin.Length > 0)
            {
                cors["Access-Control-Allow-Origin"] = origin;
                cors["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                cors["Access-Control-Allow-Headers"] = "Content-Type";
                cors["Access-Control-Allow-Private-Network"] = "true"; // navigateurs Chromium : accès d'un site à un service local
                cors["Access-Control-Max-Age"] = "600";
                cors["Vary"] = "Origin";
            }

            if (!hostOk) return Json(400, Err("Hôte non autorisé."), null);

            if (rq.Method == "OPTIONS")
            {
                if (path == "/status" && origin.Length > 0)
                {
                    Dictionary<string, string> h = new Dictionary<string, string>(statusCors);
                    h["Access-Control-Allow-Methods"] = "GET, OPTIONS"; h["Access-Control-Max-Age"] = "600";
                    return Empty(204, h);
                }
                return originOk ? Empty(204, cors) : Empty(403, null);
            }
            if (rq.Method == "GET" && path == "/status")
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["agent"] = "dsihub-signature-agent"; d["version"] = Program.Version; d["platform"] = "win32";
                d["originAllowed"] = originOk || origin.Length == 0;
                return Json(200, d, statusCors);
            }
            if (!originOk) return Json(403, Err("Origine non autorisée : ajoutez-la dans les paramètres de l'agent (icône près de l'horloge)."), null);

            if (rq.Method == "GET" && path == "/certificates")
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["certificates"] = Keys.List();
                return Json(200, d, cors);
            }
            if (rq.Method == "POST" && path == "/sign") return Sign(rq, origin, cors);
            return Json(404, Err("Route inconnue."), cors);
        }

        static string Str(Dictionary<string, object> d, string key) { object v; return d.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : ""; }

        static HttpResponse Sign(HttpRequest rq, string origin, Dictionary<string, string> cors)
        {
            Dictionary<string, object> b;
            try { b = (json.DeserializeObject(rq.Body.Length > 0 ? rq.Body : "{}") as Dictionary<string, object>) ?? new Dictionary<string, object>(); }
            catch (Exception) { return Json(400, Err("JSON invalide."), cors); }

            byte[] hash;
            try { hash = Convert.FromBase64String(Str(b, "hash")); } catch (FormatException) { hash = new byte[0]; }
            if (hash.Length != 32) return Json(400, Err("Empreinte SHA-256 de 32 octets attendue."), cors);
            string thumb = Str(b, "thumbprint");
            if (!Regex.IsMatch(thumb, "^[0-9A-Fa-f]{40}$")) return Json(400, Err("Certificat invalide."), cors);
            if (Interlocked.CompareExchange(ref busy, 1, 0) != 0) return Json(409, Err("Une signature est déjà en cours sur ce poste."), cors);
            try
            {
                string label = Regex.Replace(Str(b, "label"), "[\r\n]+", " ");
                if (label.Length == 0) label = "document";
                if (label.Length > 120) label = label.Substring(0, 120);
                string who = origin.Length > 0 ? origin : "test";
                Program.Log("demande de signature « " + label + " » (origine " + who + ")");
                Stopwatch sw = Stopwatch.StartNew();

                X509Certificate2 cert = Keys.Find(thumb);
                if (cert == null) throw new Exception("Certificat introuvable dans le magasin Windows.");
                long tFind = sw.ElapsedMilliseconds, tConfirm = 0;
                if (!Program.TestMode)
                {
                    bool yes = Program.Confirm(label, cert.Subject, who);
                    tConfirm = sw.ElapsedMilliseconds - tFind;
                    if (!yes)
                    {
                        Dictionary<string, object> c = new Dictionary<string, object>(); c["cancelled"] = true;
                        return Json(200, c, cors);
                    }
                }
                long t0 = sw.ElapsedMilliseconds;
                using (RSA rsa = cert.GetRSAPrivateKey())
                {
                    if (rsa == null) throw new Exception("Clé privée inaccessible (clé débranchée ou PIN refusé).");
                    long tKey = sw.ElapsedMilliseconds - t0;
                    long t1 = sw.ElapsedMilliseconds;
                    byte[] sig = rsa.SignHash(hash, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                    long tSign = sw.ElapsedMilliseconds - t1;
                    Dictionary<string, object> timings = new Dictionary<string, object>();
                    timings["findMs"] = tFind; timings["confirmMs"] = tConfirm; timings["keyMs"] = tKey; timings["signMs"] = tSign; timings["totalMs"] = sw.ElapsedMilliseconds;
                    Program.Log("signature effectuée (" + json.Serialize(timings) + ")");
                    Dictionary<string, object> ok = new Dictionary<string, object>();
                    ok["signature"] = Convert.ToBase64String(sig); ok["timings"] = timings;
                    return Json(200, ok, cors);
                }
            }
            finally { Interlocked.Exchange(ref busy, 0); }
        }
    }

    // ─── Programme : icône de la zone de notification, fenêtre Paramètres, démarrage automatique ────
    static class Program
    {
        public const string Version = "1.4.0";
        public const string Title = "Agent de signature DSI Hub";
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunValue = "DSIHubSignatureAgent";
        static readonly string LogDir = Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? Path.GetTempPath(), "DSIHubSignatureAgent");
        public static readonly string LogFile = Path.Combine(LogDir, "agent.log");
        static readonly object logLock = new object();
        // Mode test (jamais en production) : autorise les requêtes sans Origin (curl) et saute la confirmation à l'écran
        public static readonly bool TestMode = Environment.GetEnvironmentVariable("AGENT_TEST") == "1";
        static Control ui;
        static Form settings;
        static Icon icon;
        static NotifyIcon tray;

        public static void Log(string message)
        {
            string line = "[" + DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture) + "] " + message;
            try
            {
                lock (logLock)
                {
                    Directory.CreateDirectory(LogDir);
                    FileInfo fi = new FileInfo(LogFile);
                    if (fi.Exists && fi.Length > 1024 * 1024) { File.Copy(LogFile, LogFile + ".old", true); File.Delete(LogFile); } // 1 Mo maximum
                    File.AppendAllText(LogFile, line + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch (Exception) { /* journal indisponible : on continue */ }
        }

        [STAThread]
        static int Main(string[] args)
        {
            Config.Load();
            bool created;
            using (Mutex mutex = new Mutex(true, @"Local\DSIHubSignatureAgent" + (TestMode ? "-test" + Config.Port : ""), out created))
            {
                if (!created) return 0; // déjà lancé (ex. clic sur « Démarrer l'agent » de la page web)
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                AppDomain.CurrentDomain.UnhandledException += (s, e) => Log("erreur non gérée : " + e.ExceptionObject);
                Application.ThreadException += (s, e) => Log("erreur d'interface : " + e.Exception.Message);

                icon = MakeIcon();
                ui = new Control(); IntPtr force = ui.Handle; // permet de rapatrier les demandes de confirmation sur le thread de l'interface

                if (args.Length >= 2 && args[0] == "--selftest") // capture d'écran de la fenêtre Paramètres (tests)
                {
                    Form f = BuildSettings();
                    f.Show(); f.Refresh();
                    using (Bitmap bmp = new Bitmap(f.Width, f.Height)) { f.DrawToBitmap(bmp, new Rectangle(0, 0, f.Width, f.Height)); bmp.Save(args[1], System.Drawing.Imaging.ImageFormat.Png); }
                    return 0;
                }

                if (!Server.Start()) return 1;
                Log("Agent de signature DSI Hub " + Version + " — http://127.0.0.1:" + Config.Port);
                Log("Origines autorisées : " + string.Join(", ", Config.Origins) + (TestMode ? "  [MODE TEST]" : ""));
                if (!TestMode && Environment.GetEnvironmentVariable("AGENT_NO_TRAY") != "1") StartTray();
                Application.Run();
                if (tray != null) tray.Visible = false;
            }
            return 0;
        }

        // Fenêtre de confirmation (thread de l'interface) ; retourne true si l'utilisateur accepte
        public static bool Confirm(string label, string subject, string origin)
        {
            return (bool)ui.Invoke(new Func<bool>(delegate
            {
                string nl = Environment.NewLine;
                string msg = "Signer le document :" + nl + label + nl + nl + "Certificat : " + subject + nl + "Demandé par : " + origin + nl + nl + "Après confirmation, votre code PIN sera demandé.";
                // Fenêtre propriétaire invisible au premier plan : la confirmation ne reste pas cachée derrière le navigateur
                using (Form owner = new Form())
                {
                    owner.TopMost = true; owner.ShowInTaskbar = false; owner.StartPosition = FormStartPosition.CenterScreen;
                    owner.Size = new Size(0, 0); owner.Opacity = 0; owner.Show();
                    return MessageBox.Show(owner, msg, Title, MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
                }
            }));
        }

        static Icon MakeIcon()
        {
            using (Bitmap bmp = new Bitmap(32, 32))
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (SolidBrush br = new SolidBrush(Color.FromArgb(79, 70, 229))) g.FillEllipse(br, 1, 1, 30, 30);
                using (Pen pen = new Pen(Color.White, 3))
                {
                    g.DrawEllipse(pen, 6, 11, 9, 9);
                    g.DrawLine(pen, 15, 15, 26, 15);
                    g.DrawLine(pen, 22, 15, 22, 20);
                    g.DrawLine(pen, 26, 15, 26, 19);
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
        }

        // ─── Démarrage automatique (clé Run de l'utilisateur) ───
        // « Installé » = présence du désinstalleur d'Inno Setup à côté du programme
        static bool IsInstalled() { return File.Exists(Path.Combine(Config.BaseDir, "unins000.exe")); }

        static bool IsAutostart()
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey)) return k != null && k.GetValue(RunValue) != null;
        }

        static void SetAutostart(bool enabled)
        {
            if (!IsInstalled()) throw new Exception("Le démarrage automatique n'est géré que pour la version installée.");
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (enabled) k.SetValue(RunValue, "\"" + Application.ExecutablePath + "\"");
                else k.DeleteValue(RunValue, false);
            }
            Log("démarrage automatique " + (enabled ? "activé" : "désactivé"));
        }

        // ─── Icône de notification ───
        static void StartTray()
        {
            tray = new NotifyIcon();
            tray.Icon = icon; tray.Text = Title; tray.Visible = true;
            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripItem miSettings = menu.Items.Add("Paramètres…");
            miSettings.Font = new Font(miSettings.Font, FontStyle.Bold);
            ToolStripItem miLog = menu.Items.Add("Ouvrir le journal");
            menu.Items.Add("-");
            ToolStripItem miQuit = menu.Items.Add("Quitter l'agent");
            tray.ContextMenuStrip = menu;
            miSettings.Click += (s, e) => ShowSettings();
            tray.DoubleClick += (s, e) => ShowSettings();
            miLog.Click += (s, e) => OpenLog();
            miQuit.Click += (s, e) =>
            {
                if (MessageBox.Show("Arrêter l'agent de signature ? La signature avec votre clé ne sera plus possible jusqu'à son redémarrage.", Title, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    Log("arrêt demandé depuis l'icône de notification");
                    tray.Visible = false;
                    Application.Exit();
                }
            };
        }

        static void OpenLog()
        {
            if (File.Exists(LogFile)) Process.Start("notepad.exe", "\"" + LogFile + "\"");
            else MessageBox.Show("Aucun journal pour le moment.", Title);
        }

        static void ShowSettings()
        {
            try
            {
                if (settings == null || settings.IsDisposed) settings = BuildSettings();
                // Un programme en arrière-plan n'a pas le droit de passer au premier plan : on force l'affichage au-dessus des autres fenêtres
                settings.WindowState = FormWindowState.Normal;
                settings.TopMost = true; settings.Show(); settings.Activate(); settings.BringToFront(); settings.TopMost = false;
            }
            catch (Exception e) { Log("ERREUR paramètres : " + e); MessageBox.Show(e.Message, Title); }
        }

        static Form BuildSettings()
        {
            Form f = new Form();
            f.Text = "Paramètres - " + Title;
            f.Size = new Size(720, 640);
            f.StartPosition = FormStartPosition.CenterScreen;
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false;
            f.Font = new Font("Segoe UI", 9);
            f.Icon = icon;

            Label lblState = new Label();
            lblState.Location = new Point(16, 14); lblState.Size = new Size(670, 38);
            lblState.Text = "État : en cours d'exécution - version " + Version + " - port " + Config.Port + (TestMode ? " - MODE TEST" : "");
            lblState.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            f.Controls.Add(lblState);

            GroupBox gbStart = new GroupBox();
            gbStart.Text = "Démarrage"; gbStart.Location = new Point(16, 56); gbStart.Size = new Size(670, 52);
            CheckBox cbAuto = new CheckBox();
            cbAuto.Text = "Lancer l'agent automatiquement à l'ouverture de session Windows";
            cbAuto.Location = new Point(14, 22); cbAuto.Size = new Size(630, 22);
            cbAuto.Checked = IsAutostart();
            cbAuto.Enabled = IsInstalled();
            if (!IsInstalled()) cbAuto.Text += " (version installée uniquement)";
            cbAuto.Click += (s, e) =>
            {
                try { SetAutostart(cbAuto.Checked); }
                catch (Exception ex) { MessageBox.Show(ex.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Warning); cbAuto.Checked = !cbAuto.Checked; }
            };
            gbStart.Controls.Add(cbAuto);
            f.Controls.Add(gbStart);

            GroupBox gbOrig = new GroupBox();
            gbOrig.Text = "Adresses du Hub autorisées à utiliser l'agent"; gbOrig.Location = new Point(16, 116); gbOrig.Size = new Size(670, 170);
            TextBox tbOrig = new TextBox();
            tbOrig.Multiline = true; tbOrig.Location = new Point(14, 24); tbOrig.Size = new Size(640, 84); tbOrig.ScrollBars = ScrollBars.Vertical;
            tbOrig.Text = string.Join(Environment.NewLine, Config.Origins);
            tbOrig.SelectionStart = 0; tbOrig.SelectionLength = 0;
            Label lblNote = new Label();
            lblNote.Text = "Une adresse par ligne, ex. https://dsihub.ivry.local. Appliqué immédiatement.";
            lblNote.Location = new Point(14, 112); lblNote.Size = new Size(460, 20); lblNote.ForeColor = Color.DimGray;
            Button btnSave = new Button();
            btnSave.Text = "Enregistrer"; btnSave.Location = new Point(554, 130); btnSave.Size = new Size(100, 28);
            btnSave.Click += (s, e) =>
            {
                try
                {
                    List<string> list = Regex.Split(tbOrig.Text, "\r?\n").Select(x => x.Trim().TrimEnd('/')).Where(x => x.Length > 0).ToList();
                    if (list.Count == 0) throw new Exception("Indiquez au moins une adresse autorisée.");
                    string bad = list.FirstOrDefault(x => !Regex.IsMatch(x, @"^https?://[A-Za-z0-9.-]+(:\d{1,5})?$"));
                    if (bad != null) throw new Exception("Adresse invalide : " + bad + " (attendu : https://hote ou https://hote:port).");
                    Config.SaveOrigins(list);
                    Log("paramètres enregistrés : origines = " + string.Join(", ", list));
                    MessageBox.Show("Paramètres enregistrés.", Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            };
            gbOrig.Controls.Add(tbOrig); gbOrig.Controls.Add(lblNote); gbOrig.Controls.Add(btnSave);
            f.Controls.Add(gbOrig);

            GroupBox gbCerts = new GroupBox();
            gbCerts.Text = "Certificats détectés sur ce poste"; gbCerts.Location = new Point(16, 294); gbCerts.Size = new Size(670, 200);
            ListView lv = new ListView();
            lv.View = View.Details; lv.FullRowSelect = true; lv.GridLines = true; lv.Location = new Point(14, 24); lv.Size = new Size(640, 130);
            lv.Columns.Add("Titulaire", 190); lv.Columns.Add("Émetteur", 190); lv.Columns.Add("Valide jusqu'au", 100); lv.Columns.Add("Usage", 140);
            Button btnRefresh = new Button();
            btnRefresh.Text = "Actualiser"; btnRefresh.Location = new Point(554, 160); btnRefresh.Size = new Size(100, 28);
            Action fill = delegate
            {
                lv.Items.Clear();
                lv.Items.Add("Lecture des certificats…");
                ThreadPool.QueueUserWorkItem(delegate
                {
                    List<ListViewItem> items = new List<ListViewItem>();
                    try
                    {
                        foreach (Dictionary<string, object> c in Keys.List())
                        {
                            ListViewItem it = new ListViewItem(Cn((string)c["subject"]));
                            it.SubItems.Add(Cn((string)c["issuer"]));
                            it.SubItems.Add(DateTime.Parse((string)c["notAfter"], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToLocalTime().ToString("dd/MM/yyyy"));
                            it.SubItems.Add((bool)c["nonRepudiation"] ? "Signature" : "Authentification");
                            items.Add(it);
                        }
                    }
                    catch (Exception ex) { items.Add(new ListViewItem("Lecture impossible : " + ex.Message)); }
                    try { lv.BeginInvoke(new Action(delegate { lv.Items.Clear(); lv.Items.AddRange(items.ToArray()); })); } catch (Exception) { /* fenêtre fermée */ }
                });
            };
            btnRefresh.Click += (s, e) => fill();
            gbCerts.Controls.Add(lv); gbCerts.Controls.Add(btnRefresh);
            f.Controls.Add(gbCerts);
            f.Shown += (s, e) => fill();

            Label lblInfo = new Label();
            lblInfo.Location = new Point(16, 502); lblInfo.Size = new Size(670, 52); lblInfo.ForeColor = Color.DimGray;
            lblInfo.Text = "Programme : " + Application.ExecutablePath + Environment.NewLine + "Configuration : " + Config.File + Environment.NewLine + "Journal : " + LogFile;
            f.Controls.Add(lblInfo);

            Button btnLog = new Button();
            btnLog.Text = "Ouvrir le journal"; btnLog.Location = new Point(16, 566); btnLog.Size = new Size(130, 28);
            btnLog.Click += (s, e) => OpenLog();
            Button btnDir = new Button();
            btnDir.Text = "Ouvrir le dossier"; btnDir.Location = new Point(154, 566); btnDir.Size = new Size(130, 28);
            btnDir.Click += (s, e) => Process.Start("explorer.exe", "\"" + Config.BaseDir + "\"");
            Button btnClose = new Button();
            btnClose.Text = "Fermer"; btnClose.Location = new Point(586, 566); btnClose.Size = new Size(100, 28);
            btnClose.Click += (s, e) => f.Close();
            f.Controls.Add(btnLog); f.Controls.Add(btnDir); f.Controls.Add(btnClose);
            f.CancelButton = btnClose;
            return f;
        }

        static string Cn(string dn)
        {
            Match m = Regex.Match(dn ?? "", @"(?:^|,\s*)CN=([^,]+)");
            return m.Success ? m.Groups[1].Value : dn;
        }
    }
}
