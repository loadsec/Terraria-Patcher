using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
#if !FNA
using System.CodeDom.Compiler;
#endif
#if !FNA
using System.Windows.Forms;
#endif
#if !FNA
using Microsoft.CSharp;
#endif
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
        static Loader()
        {
            AppDomain.CurrentDomain.UnhandledException += (sender, args) =>
            {
                try
                {
                    var exObj = args != null ? args.ExceptionObject : null;
                    AppendLog("ERROR", "AppDomain unhandled exception: " + (exObj ?? "<null>"));
                }
                catch
                {
                    // Best effort logging only.
                }
            };
        }

        #region UI / Logging

        private static readonly object logSync = new object();
        private static int logSequence;
        private static int errorSequence;
        private static bool logSessionHeaderWritten;

        private static void AppendLog(string level, string message)
        {
            try
            {
                lock (logSync)
                {
                    var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory ?? ".", "PluginLoader.log");
                    Directory.CreateDirectory(Path.GetDirectoryName(logPath) ?? ".");

                    if (!logSessionHeaderWritten)
                    {
                        logSessionHeaderWritten = true;
                        var p = Process.GetCurrentProcess();
                        var header =
                            Environment.NewLine +
                            "==================================================" + Environment.NewLine +
                            "PluginLoader session start " +
                            DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz", CultureInfo.InvariantCulture) + Environment.NewLine +
                            "PID=" + p.Id +
                            " EXE=" + (p.MainModule != null ? p.MainModule.FileName : "<unknown>") + Environment.NewLine +
                            "BaseDir=" + (AppDomain.CurrentDomain.BaseDirectory ?? "<null>") + Environment.NewLine +
                            "CurrentDir=" + Environment.CurrentDirectory + Environment.NewLine +
                            "MONO_IOMAP=" + (Environment.GetEnvironmentVariable("MONO_IOMAP") ?? "<null>") + Environment.NewLine +
                            "MONO_OPTIONS=" + (Environment.GetEnvironmentVariable("MONO_OPTIONS") ?? "<null>") + Environment.NewLine +
                            "==================================================" + Environment.NewLine;
                        File.AppendAllText(logPath, header, new UTF8Encoding(false));
                    }

                    var seq = Interlocked.Increment(ref logSequence);
                    var isError = string.Equals(level, "ERROR", StringComparison.OrdinalIgnoreCase);
                    var errSeq = isError ? Interlocked.Increment(ref errorSequence) : 0;
                    var timestamp = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss.fff zzz", CultureInfo.InvariantCulture);
                    var prefix = "[" + timestamp + "][" + level + "][L" + seq.ToString("D5", CultureInfo.InvariantCulture) + "]";
                    if (isError)
                        prefix += "[E" + errSeq.ToString("D4", CultureInfo.InvariantCulture) + "]";
                    prefix += "[T" + Thread.CurrentThread.ManagedThreadId.ToString(CultureInfo.InvariantCulture) + "] ";

                    var text = (message ?? string.Empty).Replace("\r\n", "\n");
                    var lines = text.Split('\n');
                    var sb = new StringBuilder();
                    if (lines.Length == 0)
                    {
                        sb.Append(prefix).AppendLine();
                    }
                    else
                    {
                        foreach (var line in lines)
                            sb.Append(prefix).AppendLine(line);
                    }

                    File.AppendAllText(logPath, sb.ToString(), new UTF8Encoding(false));
                }
            }
            catch
            {
                // Best effort logging only.
            }
        }

        private static void ShowInfo(string message, string title = "Terraria")
        {
            AppendLog("INFO", message);
#if FNA
            Console.WriteLine("[PluginLoader][INFO] " + message);
#else
            MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Information);
#endif
        }

        private static void ShowWarning(string message, string title = "Terraria")
        {
            AppendLog("WARN", message);
#if FNA
            Console.WriteLine("[PluginLoader][WARN] " + message);
#else
            MessageBox.Show(message, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
#endif
        }

        private static void ShowError(string message, string title = "Terraria")
        {
            AppendLog("ERROR", message);
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
        private static bool loaded, ingame, startupMessageShown;
        private static int startupMessageDeferredWarnCount;
        private static bool keyStateUnavailableWarned;

        private static void TryShowStartupPluginCountMessage()
        {
            if (startupMessageShown)
                return;

            try
            {
#if FNA
                Main.NewText("Loaded " + loadedPlugins.Count + " plugins", Color.Purple.R, Color.Purple.G, Color.Purple.B);
#else
                Main.NewText("Loaded " + loadedPlugins.Count + " plugins", Color.Purple.R, Color.Purple.G, Color.Purple.B, false);
#endif
                startupMessageShown = true;
            }
            catch (NullReferenceException ex)
            {
                // Chat UI can be uninitialized in early FNA update ticks.
                if (startupMessageDeferredWarnCount < 5)
                {
                    startupMessageDeferredWarnCount++;
                    AppendLog("WARN", "Deferring plugin count chat message until UI is ready: " + ex.Message);
                }
            }
            catch (Exception ex)
            {
                // This is non-critical; never abort the game on a toast failure.
                startupMessageShown = true;
                AppendLog("WARN", "Skipping plugin count chat message due to unexpected error: " + ex);
            }
        }

        #endregion
        
        #region Load

        private static void Load()
        {
            if (!loaded)
            {
                loaded = true;
                
                try
                {
                    var gameBaseDirectory = IniAPI.GameBaseDirectory;
                    var pluginsFolder = Path.Combine(gameBaseDirectory, "Plugins");
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

                    CleanupOldFnaCompilerArtifacts(pluginsFolder);

                    var compilerCacheFolder = Path.GetFullPath(Path.Combine(pluginsFolder, ".PluginLoaderFNACompiler"));
                    var pluginSourceFiles = Directory
                        .EnumerateFiles(pluginsFolder, "*.cs", SearchOption.AllDirectories)
                        .Where(path =>
                        {
                            try
                            {
                                var fullPath = Path.GetFullPath(path);
                                return !fullPath.StartsWith(compilerCacheFolder + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
                                       !string.Equals(fullPath, compilerCacheFolder, StringComparison.OrdinalIgnoreCase);
                            }
                            catch
                            {
                                return true;
                            }
                        })
                        .ToArray();

                    Load(references.ToArray(), pluginSourceFiles);

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

                var path = Path.Combine(IniAPI.GameBaseDirectory, dllName);
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
            compileReferences = references.Where(r => !string.IsNullOrWhiteSpace(r)).Select(r => Path.GetFullPath(r)).ToArray();
            compileSources = sources.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => Path.GetFullPath(s)).ToArray();
            // Prefer local work dir under Terraria/Plugins to avoid Steam Runtime mount/namespace issues.
            var compilerWorkDir = CreateFnaCompilerWorkDir(compileSources, preferLocal: true);
            // Do NOT change Environment.CurrentDirectory — it breaks Path.GetFullPath in CompileFnaAssemblyWithMcs.
#endif
#if FNA
            Assembly compiledAssembly;
            try
            {
                compiledAssembly = CompileFnaAssemblyWithMcs(compileReferences, compileSources, compilerWorkDir);
            }
            catch (Exception ex) when (
                ex.Message != null &&
                (
                    ex.Message.IndexOf("error CS2001", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    ex.Message.IndexOf("error CS2011", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    ex.Message.IndexOf("Unable to open response file", StringComparison.OrdinalIgnoreCase) >= 0
                ))
            {
                var localCompilerWorkDir = CreateFnaCompilerWorkDir(compileSources, preferLocal: true);
                compiledAssembly = CompileFnaAssemblyWithMcs(compileReferences, compileSources, localCompilerWorkDir);
            }
            catch (Exception ex) when (
                ex.Message != null &&
                ex.Message.IndexOf("mcs", StringComparison.OrdinalIgnoreCase) >= 0 &&
                ex.Message.IndexOf("not found", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                throw new Exception(
                    "Plugin compilation failed because the Mono C# compiler (mcs) was not found. " +
                    "Install the Mono development tools (for example: mono-devel or mono-complete), " +
                    "or provide a bundled compiler toolchain in Plugins/.PluginLoaderTools, then try again.",
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
            // http://ayende.com/blog/1376/solving-the-assembly-load-context-problem
            var compilerParams = new CompilerParameters();
            compilerParams.GenerateInMemory = true;
            compilerParams.GenerateExecutable = false;
            compilerParams.TreatWarningsAsErrors = false;
            compilerParams.CompilerOptions = "/optimize";
            compilerParams.ReferencedAssemblies.AddRange(compileReferences);

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
                    "Install the Mono development tools (for example: mono-devel or mono-complete), " +
                    "or provide a bundled compiler toolchain in Plugins/.PluginLoaderTools, then try again.",
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
        private static Assembly CompileFnaAssemblyWithMcs(IEnumerable<string> compileReferences, IEnumerable<string> compileSources, string compilerWorkDir)
        {
            // Resolve all paths to absolute BEFORE CurrentDirectory is changed anywhere.
            var absWorkDir = Path.GetFullPath(compilerWorkDir);
            var sources = compileSources
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .Select(Path.GetFullPath)
                .ToArray();

            if (sources.Length == 0)
                throw new Exception("No plugin source files were found to compile.");

            // Write compiler output to a short path outside the game directory to avoid
            // issues with spaces in the install path and file locking quirks from older Mono/FNA setups.
            var outputRoot = Path.Combine(Path.GetTempPath(), "TerrariaPluginLoaderFNA-Out");
            Directory.CreateDirectory(outputRoot);
            var outputPath = Path.Combine(outputRoot, Guid.NewGuid().ToString("N") + ".dll");

            var missingSources = sources.Where(path => !File.Exists(path)).ToArray();
            if (missingSources.Length > 0)
                throw new Exception(
                    "Plugin source files missing before compilation:" + Environment.NewLine +
                    string.Join(Environment.NewLine, missingSources));

            // Stage sources via File.Copy — no shell involved, no CurrentDirectory dependency.
            var stagedSourcesDir = Path.Combine(absWorkDir, "sources");
            Directory.CreateDirectory(stagedSourcesDir);
            var stagedSources = new List<string>(sources.Length);
            var stagedSourcePairs = new List<KeyValuePair<string, string>>(sources.Length);
            for (var i = 0; i < sources.Length; i++)
            {
                var sourcePath = sources[i];
                var sourceName = Path.GetFileName(sourcePath);
                if (string.IsNullOrEmpty(sourceName))
                    sourceName = "Plugin" + i + ".cs";

                var stagedPath = Path.Combine(stagedSourcesDir, i.ToString("000") + "_" + sourceName);
                File.Copy(sourcePath, stagedPath, overwrite: true);
                stagedSources.Add(stagedPath);
                stagedSourcePairs.Add(new KeyValuePair<string, string>(sourcePath, stagedPath));
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
            foreach (var reference in compileReferences.Where(r => !string.IsNullOrWhiteSpace(r)))
                mcsArgs.Add("-r:" + Path.GetFullPath(reference));
            mcsArgs.AddRange(stagedSources);

            // Locate mcs. Steam Linux Runtime may hide host /usr/bin tools, so we also support
            // local bundled compilers and a configurable path via Plugins.ini.
            string configuredCompilerPathRaw;
            string configuredCompilerPathResolved;
            string[] localCompilerCandidates;
            var mcsPath = ResolveMcsExecutable(out configuredCompilerPathRaw, out configuredCompilerPathResolved, out localCompilerCandidates);
            if (mcsPath == null)
            {
                AppendLog("WARN",
                    "mcs compiler not found during plugin compile." + Environment.NewLine +
                    "SteamRuntimeDetected=" + (IsSteamRuntimeEnvironment() ? "true" : "false") + Environment.NewLine +
                    "PATH=" + (Environment.GetEnvironmentVariable("PATH") ?? "<null>") + Environment.NewLine +
                    "STEAM_RUNTIME=" + (Environment.GetEnvironmentVariable("STEAM_RUNTIME") ?? "<null>") + Environment.NewLine +
                    "PRESSURE_VESSEL_RUNTIME=" + (Environment.GetEnvironmentVariable("PRESSURE_VESSEL_RUNTIME") ?? "<null>") + Environment.NewLine +
                    "Configured PluginCompilerPath (raw)=" + (configuredCompilerPathRaw ?? "<null>") + Environment.NewLine +
                    "Configured PluginCompilerPath (resolved)=" + (configuredCompilerPathResolved ?? "<null>") + Environment.NewLine +
                    "Local mcs candidates checked:" + Environment.NewLine +
                    (localCompilerCandidates == null || localCompilerCandidates.Length == 0
                        ? "  <none>"
                        : string.Join(Environment.NewLine, localCompilerCandidates.Select(p => "  " + p + " (exists=" + (File.Exists(p) ? "yes" : "no") + ")"))));
                throw new Exception(
                    "mcs not found. Install Mono development tools (e.g. mono-devel or mono-complete), " +
                    "or place a bundled toolchain under Plugins/.PluginLoaderTools, " +
                    "or set [PluginLoader] PluginCompilerPath in Plugins.ini to a local/bundled mcs path " +
                    "(useful on Steam Linux Runtime where /usr/bin/mcs may be hidden).");
            }

            Func<string, string> shellQuote = p => "'" + (p ?? string.Empty).Replace("'", "'\"'\"'") + "'";

            var startInfo = new ProcessStartInfo();
            var shouldUseShellScriptLaunch =
                mcsPath.EndsWith(".sh", StringComparison.OrdinalIgnoreCase) ||
                mcsPath.EndsWith("/mcs", StringComparison.OrdinalIgnoreCase) ||
                mcsPath.EndsWith("\\mcs", StringComparison.OrdinalIgnoreCase);
            string scriptPath = null;
            if (shouldUseShellScriptLaunch)
            {
                scriptPath = Path.Combine(absWorkDir, "run-mcs.sh");
                File.WriteAllText(
                    scriptPath,
                    "#!/usr/bin/env bash\nset -e\n" +
                    "exec " + shellQuote(mcsPath) + " " + string.Join(" ", mcsArgs.Select(shellQuote)) + "\n",
                    new UTF8Encoding(false));

                var bashPath = FindExecutable("bash", new[] { "/usr/bin/bash", "/bin/bash" }) ?? "/bin/sh";
                startInfo.FileName = bashPath;
                startInfo.Arguments = "\"" + scriptPath.Replace("\"", "\\\"") + "\"";
            }
            else
            {
                startInfo.FileName = mcsPath;
                startInfo.Arguments = string.Join(" ", mcsArgs.Select(arg =>
                {
                    var value = arg ?? string.Empty;
                    return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
                }));
            }
            startInfo.WorkingDirectory = absWorkDir;
            startInfo.UseShellExecute = false;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.CreateNoWindow = true;
            var inheritedPath = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            var toolPath = "/usr/bin:/bin:/usr/local/bin:/opt/mono/bin:/opt/homebrew/bin";
            if (string.IsNullOrWhiteSpace(inheritedPath))
                startInfo.EnvironmentVariables["PATH"] = toolPath;
            else if (inheritedPath.IndexOf(toolPath, StringComparison.Ordinal) >= 0)
                startInfo.EnvironmentVariables["PATH"] = inheritedPath;
            else
                startInfo.EnvironmentVariables["PATH"] = toolPath + ":" + inheritedPath;
            try
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (!string.IsNullOrWhiteSpace(home))
                    startInfo.EnvironmentVariables["HOME"] = home;
            }
            catch { }
            // Keep compiler temporaries in the same location as staged sources to avoid
            // containerized /tmp visibility issues on some Linux/Steam runtimes.
            startInfo.EnvironmentVariables["TMPDIR"] = absWorkDir;
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("LANG")))
                startInfo.EnvironmentVariables["LANG"] = Environment.GetEnvironmentVariable("LANG");
            if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("LC_ALL")))
                startInfo.EnvironmentVariables["LC_ALL"] = Environment.GetEnvironmentVariable("LC_ALL");

            string stdout = string.Empty, stderr = string.Empty;
            string combinedError = string.Empty;
            const int maxCompileAttempts = 4;
            for (var attempt = 1; attempt <= maxCompileAttempts; attempt++)
            {
                using (var process = Process.Start(startInfo))
                {
                    if (process == null)
                        throw new Exception("Failed to start mcs process.");

                    stdout = process.StandardOutput.ReadToEnd();
                    stderr = process.StandardError.ReadToEnd();
                    process.WaitForExit();

                    if (process.ExitCode == 0)
                    {
                        combinedError = string.Empty;
                        break;
                    }

                    combinedError = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                    if (!string.IsNullOrWhiteSpace(stdout))
                        combinedError += Environment.NewLine + stdout;
                }

                var looksLikeTransientSourceLookupFailure =
                    combinedError.IndexOf("error CS2001", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    combinedError.IndexOf("Source file", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    stagedSources.All(File.Exists);

                if (!looksLikeTransientSourceLookupFailure || attempt >= maxCompileAttempts)
                    break;

                try
                {
                    var nowUtc = DateTime.UtcNow;
                    foreach (var pair in stagedSourcePairs)
                    {
                        if (File.Exists(pair.Key))
                            File.Copy(pair.Key, pair.Value, overwrite: true);
                        if (File.Exists(pair.Value))
                            File.SetLastWriteTimeUtc(pair.Value, nowUtc);
                    }
                    Directory.SetLastWriteTimeUtc(stagedSourcesDir, nowUtc);
                }
                catch { }

                AppendLog("WARN",
                    "Transient mcs CS2001 detected during FNA plugin compile. Retrying " + attempt + "/" + maxCompileAttempts +
                    " in " + (attempt * 100).ToString(CultureInfo.InvariantCulture) + "ms. WorkDir=" + absWorkDir);
                Thread.Sleep(attempt * 100);
            }

            if (!string.IsNullOrWhiteSpace(combinedError))
            {
                throw new Exception(
                    combinedError.Trim() + Environment.NewLine +
                    "Compiler work dir: " + absWorkDir + Environment.NewLine +
                    "Compiler output: " + outputPath + Environment.NewLine +
                    "Compiler executable: " + mcsPath + Environment.NewLine +
                    "Script: " + (scriptPath ?? "<none>") + Environment.NewLine +
                    "Parent MONO_IOMAP: " + (Environment.GetEnvironmentVariable("MONO_IOMAP") ?? "<null>") + Environment.NewLine +
                    "Parent MONO_OPTIONS: " + (Environment.GetEnvironmentVariable("MONO_OPTIONS") ?? "<null>") + Environment.NewLine +
                    "Parent MONO_PATH: " + (Environment.GetEnvironmentVariable("MONO_PATH") ?? "<null>") + Environment.NewLine +
                    "Args: " + string.Join(" ", mcsArgs.Select(shellQuote)));
            }

            if (!File.Exists(outputPath))
                throw new Exception("Plugin compilation succeeded but produced no output assembly.");

            var assemblyBytes = File.ReadAllBytes(outputPath);
            TryDeleteFile(outputPath);
            TryDeleteDirectoryRecursive(absWorkDir);
            return Assembly.Load(assemblyBytes);
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

        private static string ResolveMcsExecutable(out string configuredPathRaw, out string configuredPathResolved, out string[] localCandidates)
        {
            configuredPathRaw = null;
            configuredPathResolved = null;
            var candidates = new List<string>();

            try
            {
                configuredPathRaw = IniAPI.ReadIni("PluginLoader", "PluginCompilerPath", "", writeIt: false);
            }
            catch { }

            configuredPathResolved = ExpandConfiguredCompilerPath(configuredPathRaw);
            if (!string.IsNullOrWhiteSpace(configuredPathResolved))
                candidates.Add(configuredPathResolved);

            foreach (var candidate in GetLocalMcsCandidates())
            {
                if (!string.IsNullOrWhiteSpace(candidate) &&
                    !candidates.Contains(candidate, StringComparer.OrdinalIgnoreCase))
                {
                    candidates.Add(candidate);
                }
            }

            localCandidates = candidates.ToArray();

            foreach (var candidate in localCandidates)
            {
                try
                {
                    if (File.Exists(candidate))
                        return candidate;
                }
                catch { }
            }

            return FindExecutable("mcs", new[] { "/usr/bin/mcs", "/usr/local/bin/mcs", "/opt/mono/bin/mcs" });
        }

        private static string ExpandConfiguredCompilerPath(string rawPath)
        {
            if (string.IsNullOrWhiteSpace(rawPath))
                return null;

            try
            {
                var value = rawPath.Trim().Trim('"');
                value = Environment.ExpandEnvironmentVariables(value);

                if (!Path.IsPathRooted(value))
                    value = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory ?? ".", value));

                if (File.Exists(value))
                    return value;

                if (Directory.Exists(value))
                {
                    foreach (var candidate in GetMcsCandidatesInsideDirectory(value))
                    {
                        if (File.Exists(candidate))
                            return candidate;
                    }

                    return Path.Combine(value, "mcs");
                }

                return value;
            }
            catch
            {
                return rawPath;
            }
        }

        private static IEnumerable<string> GetLocalMcsCandidates()
        {
            var baseDirs = new List<string>();

            try
            {
                if (!string.IsNullOrWhiteSpace(AppDomain.CurrentDomain.BaseDirectory))
                    baseDirs.Add(Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory));
            }
            catch { }

            try
            {
                if (!string.IsNullOrWhiteSpace(Environment.CurrentDirectory))
                {
                    var cwd = Path.GetFullPath(Environment.CurrentDirectory);
                    if (!baseDirs.Contains(cwd, StringComparer.OrdinalIgnoreCase))
                        baseDirs.Add(cwd);
                }
            }
            catch { }

            var relativeDirs = new[]
            {
                ".",
                "Plugins",
                Path.Combine("Plugins", "Tools"),
                Path.Combine("Plugins", "Compiler"),
                Path.Combine("Plugins", ".PluginLoaderTools"),
                Path.Combine("Plugins", ".PluginLoaderTools", "mono"),
                Path.Combine("Plugins", ".PluginLoaderTools", "mono", "bin"),
                Path.Combine("mono"),
                Path.Combine("mono", "bin")
            };

            foreach (var baseDir in baseDirs)
            {
                foreach (var rel in relativeDirs)
                {
                    string dir;
                    try { dir = Path.GetFullPath(Path.Combine(baseDir, rel)); }
                    catch { continue; }

                    foreach (var candidate in GetMcsCandidatesInsideDirectory(dir))
                        yield return candidate;
                }
            }
        }

        private static IEnumerable<string> GetMcsCandidatesInsideDirectory(string dir)
        {
            if (string.IsNullOrWhiteSpace(dir))
                yield break;

            yield return Path.Combine(dir, "mcs");
            yield return Path.Combine(dir, "mcs.sh");
            yield return Path.Combine(dir, "bin", "mcs");
            yield return Path.Combine(dir, "bin", "mcs.sh");
            yield return Path.Combine(dir, "mono", "bin", "mcs");
            yield return Path.Combine(dir, "mono", "bin", "mcs.sh");
        }

        private static bool IsSteamRuntimeEnvironment()
        {
            return !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PRESSURE_VESSEL_RUNTIME")) ||
                   !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("STEAM_RUNTIME")) ||
                   !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("STEAM_COMPAT_DATA_PATH")) ||
                   !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("STEAM_COMPAT_CLIENT_INSTALL_PATH"));
        }

        private static string CreateFnaCompilerWorkDir(string[] compileSources, bool preferLocal)
        {
            string baseDir = null;

            if (preferLocal)
            {
                var firstSource = compileSources.FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
                if (!string.IsNullOrEmpty(firstSource))
                {
                    try
                    {
                        var pluginsDir = Path.GetDirectoryName(Path.GetFullPath(firstSource));
                        while (!string.IsNullOrEmpty(pluginsDir))
                        {
                            if (string.Equals(Path.GetFileName(pluginsDir), "Plugins", StringComparison.OrdinalIgnoreCase))
                                break;

                            var parent = Path.GetDirectoryName(pluginsDir);
                            if (string.Equals(parent, pluginsDir, StringComparison.Ordinal))
                                break;
                            pluginsDir = parent;
                        }

                        if (!string.IsNullOrEmpty(pluginsDir) &&
                            string.Equals(Path.GetFileName(pluginsDir), "Plugins", StringComparison.OrdinalIgnoreCase))
                        {
                            baseDir = Path.Combine(pluginsDir, ".PluginLoaderFNACompiler");
                        }
                    }
                    catch
                    {
                        // Fall back below.
                    }
                }
            }

            if (string.IsNullOrEmpty(baseDir))
                baseDir = Path.Combine(Path.GetTempPath(), "TerrariaPluginLoaderFNA");

            var compilerWorkDir = Path.Combine(baseDir, Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(compilerWorkDir);
            return compilerWorkDir;
        }

        private static void CleanupOldFnaCompilerArtifacts(string pluginsFolder)
        {
            try
            {
                PruneDirectoryChildren(Path.Combine(Path.GetTempPath(), "TerrariaPluginLoaderFNA"), TimeSpan.FromHours(12), keepNewest: 2);
                PruneDirectoryChildren(Path.Combine(Path.GetTempPath(), "TerrariaPluginLoaderFNA-Out"), TimeSpan.FromHours(12), keepNewest: 4);
            }
            catch { }

            try
            {
                var localCompilerCache = Path.Combine(pluginsFolder, ".PluginLoaderFNACompiler");
                PruneDirectoryChildren(localCompilerCache, TimeSpan.FromHours(12), keepNewest: 2);
            }
            catch { }
        }

        private static void PruneDirectoryChildren(string rootPath, TimeSpan maxAge, int keepNewest)
        {
            if (string.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
                return;

            var now = DateTime.UtcNow;
            var dirs = new DirectoryInfo(rootPath)
                .GetDirectories()
                .OrderByDescending(d =>
                {
                    try { return d.LastWriteTimeUtc; }
                    catch { return DateTime.MinValue; }
                })
                .ToArray();

            for (var i = 0; i < dirs.Length; i++)
            {
                if (i < Math.Max(keepNewest, 0))
                    continue;

                bool expired = false;
                try
                {
                    expired = (now - dirs[i].LastWriteTimeUtc) >= maxAge;
                }
                catch
                {
                    expired = true;
                }

                if (expired)
                    TryDeleteDirectoryRecursive(dirs[i].FullName);
            }

            // Also prune stray DLLs/files in the output cache root.
            foreach (var file in Directory.EnumerateFiles(rootPath))
            {
                try
                {
                    var info = new FileInfo(file);
                    if ((now - info.LastWriteTimeUtc) >= maxAge)
                        TryDeleteFile(file);
                }
                catch { }
            }
        }

        private static void TryDeleteFile(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return;

            try
            {
                if (File.Exists(path))
                {
                    File.SetAttributes(path, FileAttributes.Normal);
                    File.Delete(path);
                }
            }
            catch { }
        }

        private static void TryDeleteDirectoryRecursive(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
                return;

            try
            {
                foreach (var file in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
                {
                    try { File.SetAttributes(file, FileAttributes.Normal); }
                    catch { }
                }
            }
            catch { }

            try
            {
                Directory.Delete(path, recursive: true);
            }
            catch { }
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
            try
            {
                if (!ingame)
                    ingame = true;

                TryShowStartupPluginCountMessage();

                if (!Main.blockInput && !Main.drawingPlayerChat && !Main.editSign && !Main.editChest)
                {
                    if (Main.keyState == null)
                    {
                        if (!keyStateUnavailableWarned)
                        {
                            keyStateUnavailableWarned = true;
                            AppendLog("WARN", "Main.keyState is null during OnPreUpdate; deferring hotkey processing.");
                        }
                    }
                    else
                    {
                        keyStateUnavailableWarned = false;
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
                }

                foreach (var plugin in loadedPlugins.OfType<IPluginPreUpdate>())
                    plugin.OnPreUpdate();
            }
            catch (Exception ex)
            {
                AppendLog("ERROR", "Unhandled exception in Loader.OnPreUpdate: " + ex);
                // Never crash the game because of plugin loader pre-update logic.
            }
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
