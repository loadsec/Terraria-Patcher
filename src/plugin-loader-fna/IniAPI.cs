using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

namespace PluginLoader
{
    public static class IniAPI
    {
        public static readonly string GameBaseDirectory = GetGameBaseDirectory();
        private static readonly string iniPath = System.IO.Path.Combine(GameBaseDirectory, "Plugins.ini");

        private static string GetGameBaseDirectory()
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(AppDomain.CurrentDomain.BaseDirectory))
                    return System.IO.Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
            }
            catch
            {
            }

            try
            {
                if (!string.IsNullOrWhiteSpace(Environment.CurrentDirectory))
                    return System.IO.Path.GetFullPath(Environment.CurrentDirectory);
            }
            catch
            {
            }

            return ".";
        }

#if FNA
        private static Dictionary<string, Dictionary<string, string>> ParseIni(string path)
        {
            var data = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
            if (!System.IO.File.Exists(path))
                return data;

            string currentSection = string.Empty;
            foreach (var rawLine in System.IO.File.ReadAllLines(path))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith(";") || line.StartsWith("#"))
                    continue;

                if (line.StartsWith("[") && line.EndsWith("]") && line.Length > 2)
                {
                    currentSection = line.Substring(1, line.Length - 2).Trim();
                    if (!data.ContainsKey(currentSection))
                        data[currentSection] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    continue;
                }

                var equals = line.IndexOf('=');
                if (equals < 0)
                    continue;

                var key = line.Substring(0, equals).Trim();
                var value = line.Substring(equals + 1);
                if (!data.ContainsKey(currentSection))
                    data[currentSection] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                data[currentSection][key] = value;
            }

            return data;
        }

        private static void WriteIniFile(string path, Dictionary<string, Dictionary<string, string>> data)
        {
            var sb = new StringBuilder();
            foreach (var section in data)
            {
                if (!string.IsNullOrEmpty(section.Key))
                    sb.AppendLine("[" + section.Key + "]");

                foreach (var entry in section.Value)
                    sb.AppendLine(entry.Key + "=" + entry.Value);

                sb.AppendLine();
            }

            System.IO.File.WriteAllText(path, sb.ToString());
        }

        public static long WriteIni(string section, string key, string val, string path)
        {
            if (string.IsNullOrEmpty(path))
                path = iniPath;

            var data = ParseIni(path);
            if (!data.ContainsKey(section))
                data[section] = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            data[section][key] = val ?? string.Empty;
            WriteIniFile(path, data);
            return 1;
        }
#else
        [DllImport("kernel32", EntryPoint = "WritePrivateProfileString")]
        public static extern long WriteIni(string section, string key, string val, string path);
        [DllImport("kernel32.dll")]
        private static extern int GetPrivateProfileSection(string section, byte[] retVal, int size, string filePath);
        [DllImport("kernel32")]
        private static extern int GetPrivateProfileString(string section, string key, string def, StringBuilder retVal, int size, string filePath);
        [DllImport("kernel32")]
        private static extern int GetPrivateProfileString(string section, string key, string def, [In, Out] char[] retVal, int size, string filePath);
#endif

        public static long WriteIni(string section, string key, string val)
        {
            return WriteIni(section, key, val, iniPath);
        }

        public static string ReadIni(string section, string key, string def, int size = 255, string path = null, bool writeIt = false)
        {
            if (path == null)
                path = iniPath;

#if FNA
            var data = ParseIni(path);
            Dictionary<string, string> sectionData;
            string ret;
            if (!data.TryGetValue(section, out sectionData) || !sectionData.TryGetValue(key, out ret) || string.IsNullOrEmpty(ret))
            {
                ret = def;
                if (writeIt)
                    WriteIni(section, key, ret, path);
            }

            return ret;
#else
            var temp = new StringBuilder(255);
            GetPrivateProfileString(section, key, writeIt ? "" : def, temp, size, path);
            string ret = temp.ToString();

            if (writeIt && string.IsNullOrEmpty(ret))
            {
                ret = def;
                WriteIni(section, key, ret, path);
            }

            return ret;
#endif
        }

        public static IEnumerable<string> GetIniKeys(string section, string path = null)
        {
            if (path == null)
                path = iniPath;

#if FNA
            var data = ParseIni(path);
            Dictionary<string, string> sectionData;
            if (!data.TryGetValue(section, out sectionData))
                return Enumerable.Empty<string>();
            return sectionData.Keys.ToList();
#else
            var temp = new byte[2048];
            GetPrivateProfileSection(section, temp, temp.Length, path);
            string[] ret = Encoding.ASCII.GetString(temp).Trim('\0').Split('\0');

            return (from entry in ret let @equals = entry.IndexOf('=') select @equals >= 0 ? entry.Substring(0, @equals) : entry).Where(s => !string.IsNullOrEmpty(s));
#endif
        }

        /// <summary>
        /// Retrieves the .ini file's sections.
        /// </summary>
        public static IEnumerable<string> GetIniSections(string path)
        {
#if FNA
            return ParseIni(path).Keys.Where(s => !string.IsNullOrEmpty(s)).ToList();
#else
            char[] ret = new char[ushort.MaxValue];
            GetPrivateProfileString(null, null, null, ret, ushort.MaxValue, path);
            return new List<string>(new string(ret).Split(new char[] { '\0' }, StringSplitOptions.RemoveEmptyEntries));
#endif
        }
    }
}
