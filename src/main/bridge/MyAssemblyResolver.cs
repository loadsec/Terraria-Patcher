using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Mono.Cecil;

namespace TerrariaPatcherBridge
{
    class MyAssemblyResolver : BaseAssemblyResolver
    {
        private readonly List<string> _extraDirectories = new List<string>();

        public MyAssemblyResolver(params string[] extraDirectories)
        {
            AddSearchDirectories(extraDirectories);
            AddWindowsXnaGacDirectories();
        }

        protected override AssemblyDefinition SearchDirectory(AssemblyNameReference name, IEnumerable<string> directories, ReaderParameters parameters)
        {
            var mergedDirectories = new List<string>();

            AddDistinctDirectories(
                mergedDirectories,
                directories.Where(d => !string.IsNullOrWhiteSpace(d)));
            AddDistinctDirectories(mergedDirectories, _extraDirectories);

            return base.SearchDirectory(name, mergedDirectories, parameters);
        }

        private void AddSearchDirectories(IEnumerable<string> directories)
        {
            if (directories == null)
                return;

            foreach (var directory in directories)
            {
                if (string.IsNullOrWhiteSpace(directory))
                    continue;

                if (!Directory.Exists(directory))
                    continue;

                if (!_extraDirectories.Contains(directory, StringComparer.OrdinalIgnoreCase))
                    _extraDirectories.Add(directory);
            }
        }

        private static void AddDistinctDirectories(List<string> target, IEnumerable<string> directories)
        {
            foreach (var directory in directories)
            {
                if (!Directory.Exists(directory))
                    continue;

                if (!target.Contains(directory, StringComparer.OrdinalIgnoreCase))
                    target.Add(directory);
            }
        }

        private void AddWindowsXnaGacDirectories()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return;

            var windowsDir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (string.IsNullOrWhiteSpace(windowsDir) || !Directory.Exists(windowsDir))
                return;

            var gacRoots = new[]
            {
                Path.Combine(windowsDir, "Microsoft.NET", "assembly", "GAC_32"),
                Path.Combine(windowsDir, "Microsoft.NET", "assembly", "GAC_64"),
                Path.Combine(windowsDir, "Microsoft.NET", "assembly", "GAC_MSIL"),
                Path.Combine(windowsDir, "assembly", "GAC_32"),
                Path.Combine(windowsDir, "assembly", "GAC_64"),
                Path.Combine(windowsDir, "assembly", "GAC_MSIL")
            };

            foreach (var gacRoot in gacRoots)
            {
                if (!Directory.Exists(gacRoot))
                    continue;

                try
                {
                    var frameworkFolders = Directory.GetDirectories(
                        gacRoot,
                        "Microsoft.Xna.Framework*",
                        SearchOption.TopDirectoryOnly);

                    foreach (var frameworkFolder in frameworkFolders)
                    {
                        var versionFolders = Directory.GetDirectories(frameworkFolder);
                        if (versionFolders.Length == 0)
                        {
                            AddSearchDirectories(new[] { frameworkFolder });
                            continue;
                        }

                        AddSearchDirectories(versionFolders);
                    }
                }
                catch
                {
                    // Ignore missing/locked GAC roots and keep best-effort resolution.
                }
            }
        }
    }
}
