using System;
using System.CodeDom.Compiler;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
#if !FNA
using System.Windows.Forms;
#endif
using Microsoft.CSharp;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.Chat;
using Terraria.DataStructures;
using Terraria.IO;
using Keys = Microsoft.Xna.Framework.Input.Keys;

namespace PluginLoader
{
    public static class Loader
    {
        #region UI / Logging

        private static void ShowInfo(string message, string title = "Terraria")
        {
#if FNA
            Console.WriteLine("[PluginLoader][INFO] " + message);
#else
            MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
#endif
        }

        private static void ShowWarning(string message, string title = "Terraria")
        {
#if FNA
            Console.WriteLine("[PluginLoader][WARN] " + message);
#else
            MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
#endif
        }

        private static void ShowError(string message, string title = "Terraria")
        {
#if FNA
            Console.WriteLine("[PluginLoader][ERROR] " + message);
#else
            MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Error);
#endif
        }

        #endregion

        #region Data

#if FNA
        private static readonly HashSet<string> fnaCompilerExcludedReferences = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "mscorlib",
            "System",
            "System.Core",
            "System.Data",
            "System.Data.DataSetExtensions",
            "System.Drawing",
            "System.Net.Http",
            "System.Runtime.Serialization",
            "System.Windows.Forms",
            "System.Xml",
            "System.Xml.Linq",
            "Microsoft.CSharp",
            "Accessibility"
        };
#endif

        private static List<Hotkey> hotkeys = new List<Hotkey>();
        private static Keys[] keysdown;
        private static bool control, shift, alt;
        private static bool fresh = true;

        private static List<IPlugin> loadedPlugins = new List<IPlugin>();
        private static bool loaded, ingame;

        #endregion
        
        #region Load

        private static void Load()
        {
            if (!loaded)
            {
                loaded = true;
                
                try
                {
                    var pluginsFolder = Path.Combine(".", "Plugins");
                    var sharedFolder = Path.Combine(pluginsFolder, "Shared");

#if !FNA
                    if (!Utils.IsProcessElevated)
                    {
                        ShowWarning("Elevated administrator privileges not detected, you may run into issues! If you are running via Steam, please start Steam with elevated administrator privileges.");
                    }
#endif

                    if (!Directory.Exists(pluginsFolder))
                    {
                        ShowError(@"Your Terraria\Plugins folder is missing.");
                        Environment.Exit(0);
                    }

                    if (!Directory.Exists(sharedFolder))
                    {
                        ShowError(@"Your Terraria\Plugins\Shared folder is missing.");
                        Environment.Exit(0);
                    }
                    
                    var references = AppDomain.CurrentDomain
                        .GetAssemblies()
                        .Where(a => !a.IsDynamic && !string.IsNullOrEmpty(a.Location))
                        .Select(a => a.Location).ToList();
                    ExtractAndReference(references, "Newtonsoft.Json.dll");
                    ExtractAndReference(references, "ReLogic.dll", true);
                    references = NormalizeCompilerReferences(references);

                    Load(references.ToArray(), Directory.EnumerateFiles(pluginsFolder, "*.cs", SearchOption.AllDirectories).ToArray());

                    // Load hotkey binds
                    var result = IniAPI.GetIniKeys("HotkeyBinds").ToList();
                    foreach (var keys in result)
                    {
                        var val = IniAPI.ReadIni("HotkeyBinds", keys, null);
                        var key = ParseHotkey(keys);

                        if (string.IsNullOrEmpty(val) || !val.StartsWith("/") || key == null)
                            ShowWarning("Invalid record in [HotkeyBinds]: " + key + ".", "");
                        else
                            RegisterHotkey(val, key);
                    }
                }
                catch (Exception ex)
                {
                    ShowError(ex.ToString(), "PluginLoader");
                    throw;
                }
            }
        }

        private static void ExtractAndReference(List<string> references, string dllName, bool forceExtract = false)
        {
            if (!references.Any(s => s.Contains(dllName)))
            {
                // Dynamic compilation requires assemblies to be stored on file, thus we must extract the Newtonsoft.Json.dll embedded resource to a temp file if we want to use it.
                var assembly = Assembly.GetEntryAssembly();
                var error = "Could not extract " + dllName + " from Terraria.";
                var resourceName = assembly.GetManifestResourceNames().FirstOrDefault(s => s.Contains(dllName));
                if (resourceName == null) throw new Exception(error);

                var path = Path.Combine(".", dllName);
                if (!File.Exists(path) || forceExtract)
                {
                    using (var stream = assembly.GetManifestResourceStream(resourceName))
                    {
                        if (stream == null) throw new Exception(error);

                        using (var fileStream = new FileStream(path, FileMode.Create))
                        {
                            stream.CopyTo(fileStream);
                        }
                    }
                }

                references.Add(path);
            }
        }

        private static List<string> NormalizeCompilerReferences(IEnumerable<string> references)
        {
            var result = new List<string>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var path in references.Where(p => !string.IsNullOrWhiteSpace(p)))
            {
                var fileName = Path.GetFileName(path);
                if (string.IsNullOrEmpty(fileName))
                    continue;

#if FNA
                var asmName = Path.GetFileNameWithoutExtension(fileName);
                if (fnaCompilerExcludedReferences.Contains(asmName))
                    continue;
#endif

                if (seen.Add(path))
                    result.Add(path);
            }

            return result;
        }

        private static void Load(string[] references, params string[] sources)
        {
            string[] compileReferences = references;
            string[] compileSources = sources;
#if FNA
            // Resolve ALL paths to absolute BEFORE anything changes CurrentDirectory.
            var compilerWorkDir = Path.Combine(Path.GetTempPath(), "TerrariaPluginLoaderFNA", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(compilerWorkDir);
            compileReferences = references.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => Path.GetFullPath(r)).ToArray();
            compileSources = sources.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => Path.GetFullPath(s)).ToArray();
            // Do NOT change Environment.CurrentDirectory — it breaks Path.GetFullPath in CompileFnaAssemblyWithMcs.
#endif
            // http://ayende.com/blog/1376/solving-the-assembly-load-context-problem
            var compilerParams = new CompilerParameters();
            compilerParams.GenerateInMemory = true;
            compilerParams.GenerateExecutable = false;
            compilerParams.TreatWarningsAsErrors = false;
            compilerParams.CompilerOptions = "/optimize";
            compilerParams.ReferencedAssemblies.AddRange(compileReferences);

#if FNA
            Assembly compiledAssembly;
            try
            {
                compiledAssembly = CompileFnaAssemblyWithMcs(compilerParams, compileSources, compilerWorkDir);
            }
            catch (Exception ex) when (
                ex.Message != null &&
                ex.Message.IndexOf("mcs", StringComparison.OrdinalIgnoreCase) >= 0 &&
                ex.Message.IndexOf("not found", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                throw new Exception(
                    "Plugin compilation failed because the Mono C# compiler (mcs) was not found. " +
                    "Install the Mono development tools in your Linux environment (for example: mono-devel or mono-complete), then try again.",
                    ex);
            }
            catch (Exception ex) when (
                ex.Message != null &&
                ex.Message.IndexOf("Corlib not in sync with this runtime", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                throw new Exception(
                    "Plugin compilation failed because Terraria's bundled framework libraries were passed to Mono's compiler and do not match the installed Mono runtime. " +
                    "Use the patched FNA plugin loader build that filters framework references, or update the loader/runtime configuration.",
                    ex);
            }
#else
            var provider = new CSharpCodeProvider();
            CompilerResults compile;
            try
            {
                var compileSourceContents = compileSources.Select(File.ReadAllText).ToArray();
                compile = provider.CompileAssemblyFromSource(compilerParams, compileSourceContents);
            }
            catch (SystemException ex) when (
                ex.Message != null &&
                ex.Message.IndexOf("Error running mcs", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                throw new Exception(
                    "Plugin compilation failed because the Mono C# compiler (mcs) was not found. " +
                    "Install the Mono development tools in your Linux environment (for example: mono-devel or mono-complete), then try again.",
                    ex);
            }
            catch (Exception ex) when (
                ex.Message != null &&
                ex.Message.IndexOf("Corlib not in sync with this runtime", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                throw new Exception(
                    "Plugin compilation failed because Terraria's bundled framework libraries were passed to Mono's compiler and do not match the installed Mono runtime. " +
                    "Use the patched FNA plugin loader build that filters framework references, or update the loader/runtime configuration.",
                    ex);
            }

            if (compile.Errors.HasErrors)
            {
                throw new Exception(compile.Errors.Cast<CompilerError>().Aggregate("", (current, ce) => current + (ce + Environment.NewLine)));
            }

            Assembly compiledAssembly = compile.CompiledAssembly;
#endif

            foreach (var type in compiledAssembly.GetTypes().Where(type1 => type1.GetInterfaces().Contains(typeof (IPlugin))))
            {
                loadedPlugins.Add(Activator.CreateInstance(type) as IPlugin);
            }
        }

#if FNA
        private static Assembly CompileFnaAssemblyWithMcs(CompilerParameters compilerParams, IEnumerable<string> compileSources, string compilerWorkDir)
        {
            // Resolve all paths to absolute BEFORE CurrentDirectory is changed anywhere.
            var absWorkDir = Path.GetFullPath(compilerWorkDir);
            var sources = compileSources
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .Select(Path.GetFullPath)
                .ToArray();

            if (sources.Length == 0)
                throw new Exception("No plugin source files were found to compile.");

            var outputPath = Path.Combine(absWorkDir, "PluginLoader.DynamicPlugins.dll");

            var missingSources = sources.Where(path => !File.Exists(path)).ToArray();
            if (missingSources.Length > 0)
                throw new Exception(
                    "Plugin source files missing before compilation:" + Environment.NewLine +
                    string.Join(Environment.NewLine, missingSources));

            // Stage sources via File.Copy — no shell involved, no CurrentDirectory dependency.
            var stagedSourcesDir = Path.Combine(absWorkDir, "sources");
            Directory.CreateDirectory(stagedSourcesDir);
            var stagedSources = new List<string>(sources.Length);
            for (var i = 0; i < sources.Length; i++)
            {
                var sourcePath = sources[i];
                var sourceName = Path.GetFileName(sourcePath);
                if (string.IsNullOrEmpty(sourceName))
                    sourceName = "Plugin" + i + ".cs";

                var stagedPath = Path.Combine(stagedSourcesDir, i.ToString("000") + "_" + sourceName);
                File.Copy(sourcePath, stagedPath, overwrite: true);
                stagedSources.Add(stagedPath);
            }

            var missingStagedSources = stagedSources.Where(p => !File.Exists(p)).ToArray();
            if (missingStagedSources.Length > 0)
                throw new Exception(
                    "Failed to stage plugin source files:" + Environment.NewLine +
                    string.Join(Environment.NewLine, missingStagedSources));

            // Build the mcs argument list directly.
            var mcsArgs = new List<string>();
            mcsArgs.Add("-target:library");
            mcsArgs.Add("-optimize+");
            mcsArgs.Add("-out:" + outputPath);
            foreach (var reference in compilerParams.ReferencedAssemblies.Cast<string>().Where(r => !string.IsNullOrWhiteSpace(r)))
                mcsArgs.Add("-r:" + Path.GetFullPath(reference));
            mcsArgs.AddRange(stagedSources);

            // Write run-mcs.sh for diagnostics only.
            string ShellQuote(string p) => "'" + (p ?? string.Empty).Replace("'", "'\"'\"'") + "'";
            var scriptPath = Path.Combine(absWorkDir, "run-mcs.sh");
            File.WriteAllText(scriptPath,
                "#!/usr/bin/env bash\nset -e\nmcs " +
                string.Join(" ", mcsArgs.Select(ShellQuote)) + "\n");

            // Write a response file to safely pass all arguments without risking shell/OS parsing or command line limits.
            var rspPath = Path.Combine(absWorkDir, "args.rsp");
            File.WriteAllLines(rspPath, mcsArgs.Select(a => "\"" + (a ?? "").Replace("\"", "\\\"") + "\""));

            // Locate mcs.
            var mcsPath = FindExecutable("mcs", new[] { "/usr/bin/mcs", "/usr/local/bin/mcs", "/opt/mono/bin/mcs" });
            if (mcsPath == null)
                throw new Exception("mcs not found. Install Mono development tools (e.g. mono-devel or mono-complete).");

            // Pass the response file to mcs using @args.rsp
            var startInfo = new ProcessStartInfo();
            startInfo.FileName = mcsPath;
            startInfo.WorkingDirectory = absWorkDir;
            startInfo.UseShellExecute = false;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.CreateNoWindow = true;
            startInfo.Arguments = "@\"" + rspPath + "\"";
            startInfo.EnvironmentVariables["PATH"] =
                "/usr/bin:/usr/local/bin:/opt/mono/bin:" +
                (startInfo.EnvironmentVariables.ContainsKey("PATH") ? startInfo.EnvironmentVariables["PATH"] : "");

            string stdout, stderr;
            using (var process = Process.Start(startInfo))
            {
                if (process == null)
                    throw new Exception("Failed to start mcs process.");

                stdout = process.StandardOutput.ReadToEnd();
                stderr = process.StandardError.ReadToEnd();
                process.WaitForExit();

                if (process.ExitCode != 0)
                {
                    var combinedError = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                    if (!string.IsNullOrWhiteSpace(stdout))
                        combinedError += Environment.NewLine + stdout;
                    throw new Exception(
                        combinedError.Trim() + Environment.NewLine +
                        "Compiler work dir: " + absWorkDir + Environment.NewLine +
                        "Script: " + scriptPath + Environment.NewLine +
                        "Args: " + string.Join(" ", mcsArgs.Select(ShellQuote)));
                }
            }

            if (!File.Exists(outputPath))
                throw new Exception("Plugin compilation succeeded but produced no output assembly.");

            return Assembly.Load(File.ReadAllBytes(outputPath));
        }

        private static string FindExecutable(string name, string[] fallbackPaths)
        {
            // Check PATH via `which`
            try
            {
                var which = new ProcessStartInfo("/usr/bin/which", name);
                which.UseShellExecute = false;
                which.RedirectStandardOutput = true;
                which.RedirectStandardError = true;
                which.CreateNoWindow = true;
                using (var p = Process.Start(which))
                {
                    if (p != null)
                    {
                        var result = p.StandardOutput.ReadToEnd().Trim();
                        p.WaitForExit();
                        if (p.ExitCode == 0 && !string.IsNullOrEmpty(result) && File.Exists(result))
                            return result;
                    }
                }
            }
            catch { }

            // Try fallback paths
            foreach (var path in fallbackPaths)
            {
                if (File.Exists(path))
                    return path;
            }

            return null;
        }

        private static string ToMcsPath(string fullPath)
        {
            if (string.IsNullOrEmpty(fullPath))
                return string.Empty;

            var normalizedPath = Path.GetFullPath(fullPath);
            return normalizedPath.Replace('\\', '/');
        }

        private static void PrepareFnaCompilerInputs(
            IEnumerable<string> references,
            IEnumerable<string> sources,
            out string[] compileReferences,
            out string[] compileSources,
            out string compilerWorkDir)
        {
            compilerWorkDir = Path.Combine(Path.GetTempPath(), "TerrariaPluginLoaderFNA", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(compilerWorkDir);

            var stagedReferences = new List<string>();
            foreach (var reference in references.Where(r => !string.IsNullOrWhiteSpace(r)))
            {
                var fullPath = Path.GetFullPath(reference);
                if (!File.Exists(fullPath))
                    continue;

                var fileName = Path.GetFileName(fullPath);
                if (string.IsNullOrEmpty(fileName))
                    continue;

                var stagedPath = Path.Combine(compilerWorkDir, fileName);
                if (!File.Exists(stagedPath))
                    File.Copy(fullPath, stagedPath, true);

                stagedReferences.Add(stagedPath);
            }

            var stagedSourcesDir = Path.Combine(compilerWorkDir, "sources");
            Directory.CreateDirectory(stagedSourcesDir);
            var stagedSources = new List<string>();
            var sourceIndex = 0;
            foreach (var source in sources.Where(s => !string.IsNullOrWhiteSpace(s)))
            {
                var fullPath = Path.GetFullPath(source);
                if (!File.Exists(fullPath))
                    continue;

                var fileName = Path.GetFileName(fullPath);
                if (string.IsNullOrEmpty(fileName))
                    fileName = "plugin.cs";

                // Stage sources into a temp directory without spaces to avoid mcs path parsing issues on Mono.
                var stagedPath = Path.Combine(stagedSourcesDir, sourceIndex.ToString("D3") + "_" + fileName);
                File.Copy(fullPath, stagedPath, true);
                stagedSources.Add(stagedPath);
                sourceIndex++;
            }

            compileReferences = stagedReferences.ToArray();
            compileSources = stagedSources.ToArray();
        }
#endif

        #endregion
        
        #region Hotkeys

        public static void RegisterHotkey(string command, Keys key, bool control = false, bool shift = false, bool alt = false, bool ignoreModifierKeys = false)
        {
            RegisterHotkey(command, new Hotkey() { Key = key, Control = control, Shift = shift, Alt = alt, IgnoreModifierKeys = ignoreModifierKeys });
        }

        public static void RegisterHotkey(string command, Hotkey key)
        {
            key.Tag = command;
            key.Action = () =>
            {
                var split = command.Substring(1).Split(new[] {' '}, 2);
                var cmd = split[0].ToLower();
                var args = split.Length > 1 ? split[1].Split(' ') : new string[0];

                foreach (var plugin in loadedPlugins.OfType<IPluginChatCommand>())
                    plugin.OnChatCommand(cmd, args);
            };
            RegisterHotkey(key);
        }

        public static void RegisterHotkey(Action action, Keys key, bool control = false, bool shift = false, bool alt = false, bool ignoreModifierKeys = false)
        {
            RegisterHotkey(new Hotkey() { Action = action, Key = key, Control = control, Shift = shift, Alt = alt, IgnoreModifierKeys = ignoreModifierKeys });
        }

        public static void RegisterHotkey(Action action, Hotkey key)
        {
            key.Action = action;
            RegisterHotkey(key);
        }

        public static void RegisterHotkey(Hotkey hotkey)
        {
            hotkeys.Add(hotkey);
        }

        public static void UnregisterHotkey(Keys key, bool control = false, bool shift = false, bool alt = false, bool ignoreModifierKeys = false)
        {
            UnregisterHotkey(new Hotkey() { Key = key, Control = control, Shift = shift, Alt = alt, IgnoreModifierKeys = ignoreModifierKeys });
        }

        public static void UnregisterHotkey(Hotkey hotkey)
        {
            hotkeys.RemoveAll(key => key.Equals(hotkey));
        }

        public static IReadOnlyCollection<Hotkey> GetHotkeys()
        {
            return hotkeys.AsReadOnly();
        }

        public static Hotkey ParseHotkey(string hotkey)
        {
            var key = Keys.None;
            var control = false;
            var shift = false;
            var alt = false;
            bool hotkeyParseFailed = false;
            foreach (var keyStr in hotkey.Split(','))
            {
                switch (keyStr.ToLower())
                {
                    case "control":
                        control = true;
                        break;
                    case "shift":
                        shift = true;
                        break;
                    case "alt":
                        alt = true;
                        break;
                    default:
                        if (key != Keys.None || !Keys.TryParse(keyStr, true, out key)) hotkeyParseFailed = true;
                        break;
                }
            }

            if (hotkeyParseFailed || key == Keys.None)
                return null;

            return new Hotkey() {Key = key, Control = control, Alt = alt, Shift = shift};
        }

        public static bool IsAltModifierKeyDown()
        {
            return alt;
        }

        public static bool IsControlModifierKeyDown()
        {
            return control;
        }

        public static bool IsShiftModifierKeyDown()
        {
            return shift;
        }

        #endregion

        #region Main
        
        public static void OnInitialize()
        {
            Load();

            foreach (var plugin in loadedPlugins.OfType<IPluginInitialize>())
                plugin.OnInitialize();
        }

        public static void OnDrawInventory()
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginDrawInventory>())
                plugin.OnDrawInventory();
        }

        public static void OnDrawInterface()
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginDrawInterface>())
                plugin.OnDrawInterface();
        }

        public static void OnPreUpdate()
        {
            if (!ingame)
            {
                ingame = true;
#if FNA
                Main.NewText("Loaded " + loadedPlugins.Count + " plugins", Color.Purple.R, Color.Purple.G, Color.Purple.B);
#else
                Main.NewText("Loaded " + loadedPlugins.Count + " plugins", Color.Purple.R, Color.Purple.G, Color.Purple.B, false);
#endif
            }

            if (!Main.blockInput && !Main.drawingPlayerChat && !Main.editSign && !Main.editChest)
            {
                keysdown = Main.keyState.GetPressedKeys();
                control = keysdown.Contains(Keys.LeftControl) || keysdown.Contains(Keys.RightControl);
                shift = keysdown.Contains(Keys.LeftShift) || keysdown.Contains(Keys.RightShift);
                alt = keysdown.Contains(Keys.LeftAlt) || keysdown.Contains(Keys.RightAlt);
                var anyPresses = false;
                foreach (var hotkey in hotkeys)
                {
                    if (keysdown.Contains(hotkey.Key) &&
                        (hotkey.IgnoreModifierKeys || (control == hotkey.Control && shift == hotkey.Shift && alt == hotkey.Alt)))
                    {
                        anyPresses = true;
                        if (fresh) hotkey.Action();
                    }
                }

                fresh = !anyPresses;
            }

            foreach (var plugin in loadedPlugins.OfType<IPluginPreUpdate>())
                plugin.OnPreUpdate();
        }

        public static void OnUpdate()
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginUpdate>())
                plugin.OnUpdate();
        }

        public static void OnUpdateTime()
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginUpdateTime>())
                plugin.OnUpdateTime();
        }

        public static bool OnCheckXmas()
        {
            var ret = false;

            foreach (var plugin in loadedPlugins.OfType<IPluginCheckSeason>())
                ret = plugin.OnCheckXmas() || ret;

            return ret;
        }

        public static bool OnCheckHalloween()
        {
            var ret = false;

            foreach (var plugin in loadedPlugins.OfType<IPluginCheckSeason>())
                ret = plugin.OnCheckHalloween() || ret;

            return ret;
        }

        public static bool OnPlaySound(int type, int x, int y, int style)
        {
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginPlaySound>())
                ret = plugin.OnPlaySound(type, x, y, style) || ret;

            return ret;
        }

        #endregion

        #region Player

        public static void OnPlayerPreSpawn(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerPreSpawn>())
                plugin.OnPlayerPreSpawn(player);
        }

        public static void OnPlayerSpawn(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerSpawn>())
                plugin.OnPlayerSpawn(player);
        }

        public static void OnPlayerLoad(PlayerFileData playerFileData, Player player, BinaryReader binaryReader)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerLoad>())
                plugin.OnPlayerLoad(playerFileData, player, binaryReader);
        }

        public static void OnPlayerSave(PlayerFileData playerFileData, BinaryWriter binaryWriter)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerSave>())
                plugin.OnPlayerSave(playerFileData, binaryWriter);
        }

        public static void OnPlayerUpdate(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerUpdate>())
                plugin.OnPlayerUpdate(player);
        }

        public static void OnPlayerPreUpdate(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerPreUpdate>())
                plugin.OnPlayerPreUpdate(player);
        }

        public static void OnPlayerUpdateBuffs(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerUpdateBuffs>())
                plugin.OnPlayerUpdateBuffs(player);
        }

        public static void OnPlayerUpdateEquips(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerUpdateEquips>())
                plugin.OnPlayerUpdateEquips(player);
        }

        public static void OnPlayerUpdateArmorSets(Player player)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerUpdateArmorSets>())
                plugin.OnPlayerUpdateArmorSets(player);
        }

        public static bool OnPlayerHurt(Player player, PlayerDeathReason damageSource, int damage, int hitDirection, bool pvp, bool quiet, bool crit, int cooldownCounter, out double result)
        {
            result = 0.0;
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerHurt>())
            {
                double temp;
                if (plugin.OnPlayerHurt(player, damageSource, damage, hitDirection, pvp, quiet, crit, cooldownCounter, out temp))
                {
                    ret = true;
                    result = temp;
                }
            }

            return ret;
        }

        public static bool OnPlayerKillMe(Player player, PlayerDeathReason damageSource, double dmg, int hitDirection, bool pvp)
        {
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerKillMe>())
                ret = plugin.OnPlayerKillMe(player, damageSource, dmg, hitDirection, pvp) || ret;

            return ret;
        }

        public static void OnPlayerPickAmmo(Player player, Item weapon, ref int shoot, ref float speed, ref bool canShoot, ref int damage, ref float knockback)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerPickAmmo>())
                plugin.OnPlayerPickAmmo(player, weapon, ref shoot, ref speed, ref canShoot, ref damage, ref knockback);
        }

        public static bool OnPlayerGetItem(Player player, Item newItem, out Item resultItem)
        {
            resultItem = null;
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerGetItem>())
            {
                Item temp;
                if (plugin.OnPlayerGetItem(player, newItem, out temp))
                {
                    ret = true;
                    resultItem = temp;
                }
            }

            return ret;
        }

        public static bool OnPlayerQuickBuff(Player player)
        {
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginPlayerQuickBuff>())
                ret = plugin.OnPlayerQuickBuff(player) || ret;

            return ret;
        }

        #endregion
        
        #region Item

        public static void OnItemSetDefaults(Item item)
        {
            Load();

            foreach (var plugin in loadedPlugins.OfType<IPluginItemSetDefaults>())
                plugin.OnItemSetDefaults(item);
        }

        public static bool OnItemSlotRightClick(Item[] inv, int context, int slot)
        {
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginItemSlotRightClick>())
                ret = plugin.OnItemSlotRightClick(inv, context, slot) || ret;

            return ret;
        }

        #endregion

        #region Projectile

        public static void OnProjectileAI001(Projectile projectile)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginProjectileAI>())
                plugin.OnProjectileAI001(projectile);
        }

        #endregion

        #region NetMessage

        public static bool OnSendChatMessageFromClient(ChatMessage msg)
        {
            var text = msg.Text;
            bool chatRet = false;
            
            if (!string.IsNullOrEmpty(text) && text[0] == '/')
            {
                var split = text.Substring(1).Split(new[] {' '}, 2);
                var cmd = split[0].ToLower();
                var args = split.Length > 1 ? split[1].Split(' ') : new string[0];

                switch (cmd)
                {
                    case "plugins":
                        Main.NewText(string.Join(", ", loadedPlugins.Select(plugin => plugin.GetType().Name)), Color.Purple.R, Color.Purple.G, Color.Purple.B);
                        chatRet = true;
                        break;
                    default:
                        foreach (var plugin in loadedPlugins.OfType<IPluginChatCommand>())
                            chatRet = plugin.OnChatCommand(cmd, args) || chatRet;
                        break;
                }
            }

            return chatRet;
        }

        #endregion

        #region Lighting

        public static bool OnLightingGetColor(int x, int y, out Color color)
        {
            color = Color.White;
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginLightingGetColor>())
            {
                Color temp;
                var result = plugin.OnLightingGetColor(x, y, out temp);
                if (result)
                {
                    ret = true;
                    color = temp;
                }
            }

            return ret;
        }

        #endregion

        #region Chest

        public static void OnChestSetupShop(Chest chest, int type)
        {
            foreach (var plugin in loadedPlugins.OfType<IPluginChestSetupShop>())
            {
                plugin.OnChestSetupShop(chest, type);
            }
        }

        #endregion

        #region NPC

        public static bool OnNPCLoot(NPC npc)
        {
            var ret = false;
            foreach (var plugin in loadedPlugins.OfType<IPluginNPCLoot>())
                ret = plugin.OnNPCLoot(npc) || ret;

            return ret;
        }

        #endregion
    }
}
