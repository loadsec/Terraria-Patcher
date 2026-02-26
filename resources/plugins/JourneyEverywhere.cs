using System;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.IO;
using PluginLoader;
using Terraria;
using Terraria.IO;

namespace TildemancerPlugins
{
    public class JourneyModeUnlocked : MarshalByRefObject, IPluginPlayerUpdateBuffs, IPluginPlayerSave
    {
        private static readonly byte[] Aob = new byte[] { 0x74, 0x10, 0x8B, 0xCE, 0x33, 0xD2, 0xE8 };
        private const byte JourneyDifficulty = 3;

        private bool _enabled;
        private bool _showChatMessage;
        private bool _attempted;
        private bool _patched;
        private bool _fallbackMode;
        private bool _fallbackAnnounced;
        private byte? _originalDifficulty;

        private IntPtr _patchAddress = IntPtr.Zero;
        private byte _originalOpcode;

        public JourneyModeUnlocked()
        {
            bool enabled;
            if (!bool.TryParse(IniAPI.ReadIni("JourneyModeUnlocked", "Enabled", "True", writeIt: true), out enabled))
                enabled = true;

            bool showMsg;
            if (!bool.TryParse(IniAPI.ReadIni("JourneyModeUnlocked", "ShowChatMessage", "True", writeIt: true), out showMsg))
                showMsg = true;

            _enabled = enabled;
            _showChatMessage = showMsg;
        }

        public void OnPlayerUpdateBuffs(Player player)
        {
            if (!_enabled)
                return;

            if (_attempted || player == null || player.whoAmI != Main.myPlayer)
                return;

            _attempted = true;

            try
            {
                if (IsWindows())
                    _patched = TryApplyPatch();

                if (_patched && _showChatMessage)
                {
                    TryChat("Journey Mode UI loaded successfully. Have fun!");
                }
                else
                {
                    _fallbackMode = true;
                    if (_showChatMessage)
                    {
                        if (IsWindows())
                            TryChat("Journey Mode UI signature patch not found; using fallback mode.");
                        else
                            TryChat("Journey Mode UI using Linux/mac fallback mode.");
                    }
                }
            }
            catch (Exception ex)
            {
                _fallbackMode = true;
                if (_showChatMessage)
                    TryChat("Journey Mode UI native patch failed; using fallback mode (" + ex.GetType().Name + ").");
            }

            ApplyFallback(player);
        }

        // FNA interface: OnPlayerSave(PlayerFileData, BinaryWriter)
        public void OnPlayerSave(PlayerFileData playerFileData, BinaryWriter binaryWriter)
        {
            // Prevent the spoofed difficulty from being serialized to the character file.
            if (!_enabled || !_fallbackMode || !_originalDifficulty.HasValue || Main.player == null)
                return;

            int idx = Main.myPlayer;
            if (idx < 0 || idx >= Main.player.Length)
                return;

            var player = Main.player[idx];
            if (player == null)
                return;

            if (player.difficulty == JourneyDifficulty && _originalDifficulty.Value != JourneyDifficulty)
                player.difficulty = _originalDifficulty.Value;
        }

        // XNA interface: OnPlayerSave(PlayerFileData, Player, BinaryWriter)
        public void OnPlayerSave(PlayerFileData playerFileData, Player player, BinaryWriter binaryWriter)
        {
            OnPlayerSave(playerFileData, binaryWriter);
        }

        private void ApplyFallback(Player player)
        {
            if (!_fallbackMode || player == null || player.whoAmI != Main.myPlayer)
                return;

            if (!_fallbackAnnounced && _showChatMessage)
            {
                _fallbackAnnounced = true;
                TryChat("Journey Mode fallback active (compatibility mode).");
            }

            if (!_originalDifficulty.HasValue)
                _originalDifficulty = player.difficulty;

            if (player.difficulty != JourneyDifficulty)
                player.difficulty = JourneyDifficulty;
        }

        private static void TryChat(string message)
        {
            try
            {
                Main.NewText(message);
            }
            catch
            {
            }
        }

        private static bool IsWindows()
        {
            var p = Environment.OSVersion.Platform;
            return p == PlatformID.Win32NT || p == PlatformID.Win32Windows || p == PlatformID.Win32S || p == PlatformID.WinCE;
        }

        private bool TryApplyPatch()
        {
            Type creativeUiType = Type.GetType("Terraria.GameContent.Creative.CreativeUI, Terraria");
            if (creativeUiType == null)
                return false;

            MethodInfo draw = creativeUiType.GetMethod("Draw",
                BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);

            if (draw == null)
                return false;

            RuntimeHelpers.PrepareMethod(draw.MethodHandle);

            IntPtr entry = draw.MethodHandle.GetFunctionPointer();
            IntPtr codeStart = FollowJumps(entry);

            const int scanSize = 0x3000;

            IntPtr found = FindPattern(codeStart, scanSize, Aob);
            if (found == IntPtr.Zero)
                return false;

            byte[] check = new byte[Aob.Length];
            Marshal.Copy(found, check, 0, check.Length);
            for (int i = 0; i < Aob.Length; i++)
            {
                if (check[i] != Aob[i])
                    return false;
            }

            _patchAddress = found;
            _originalOpcode = check[0];

            return WriteByte(found, 0x76);
        }

        private static IntPtr FindPattern(IntPtr start, int length, byte[] pattern)
        {
            if (start == IntPtr.Zero || length <= 0 || pattern == null || pattern.Length == 0)
                return IntPtr.Zero;

            byte[] buf = new byte[length];
            Marshal.Copy(start, buf, 0, buf.Length);

            for (int i = 0; i <= buf.Length - pattern.Length; i++)
            {
                bool match = true;
                for (int j = 0; j < pattern.Length; j++)
                {
                    if (buf[i + j] != pattern[j])
                    {
                        match = false;
                        break;
                    }
                }

                if (match)
                    return Add(start, i);
            }

            return IntPtr.Zero;
        }

        private static IntPtr Add(IntPtr p, int offset)
        {
            return new IntPtr(p.ToInt64() + offset);
        }

        private static bool WriteByte(IntPtr address, byte value)
        {
            uint oldProtect;
            if (!VirtualProtect(address, (UIntPtr)1, PAGE_EXECUTE_READWRITE, out oldProtect))
                return false;

            try
            {
                Marshal.WriteByte(address, value);
                FlushInstructionCache(GetCurrentProcess(), address, (UIntPtr)1);
                return true;
            }
            finally
            {
                uint _;
                VirtualProtect(address, (UIntPtr)1, oldProtect, out _);
            }
        }

        private static IntPtr FollowJumps(IntPtr p)
        {
            if (p == IntPtr.Zero)
                return p;

            byte[] b = new byte[16];
            Marshal.Copy(p, b, 0, b.Length);

            if (b[0] == 0xE9)
            {
                int rel = BitConverter.ToInt32(b, 1);
                return Add(p, 5 + rel);
            }

            if (b[0] == 0xEB)
            {
                sbyte rel8 = unchecked((sbyte)b[1]);
                return Add(p, 2 + rel8);
            }

            if (b[0] == 0x48 && b[1] == 0xB8 && b[10] == 0xFF && b[11] == 0xE0)
            {
                long target = BitConverter.ToInt64(b, 2);
                return new IntPtr(target);
            }

            if (b[0] == 0x49 && b[1] == 0xBB && b[10] == 0x41 && b[11] == 0xFF && b[12] == 0xE3)
            {
                long target = BitConverter.ToInt64(b, 2);
                return new IntPtr(target);
            }

            if (b[0] == 0xFF && b[1] == 0x25)
            {
                int disp = BitConverter.ToInt32(b, 2);

                if (IntPtr.Size == 8)
                {
                    IntPtr ripTargetPtr = Add(p, 6 + disp);
                    long target = Marshal.ReadInt64(ripTargetPtr);
                    return new IntPtr(target);
                }
                else
                {
                    IntPtr absPtr = new IntPtr(disp);
                    int target = Marshal.ReadInt32(absPtr);
                    return new IntPtr(target);
                }
            }

            return p;
        }

        private const uint PAGE_EXECUTE_READWRITE = 0x40;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool VirtualProtect(IntPtr lpAddress, UIntPtr dwSize, uint flNewProtect, out uint lpflOldProtect);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FlushInstructionCache(IntPtr hProcess, IntPtr lpBaseAddress, UIntPtr dwSize);
    }
}
