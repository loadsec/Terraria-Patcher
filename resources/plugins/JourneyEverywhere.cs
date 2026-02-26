using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using PluginLoader;
using Terraria;

namespace TildemancerPlugins
{
    public class JourneyModeUnlocked : MarshalByRefObject, IPluginPlayerUpdateBuffs, IPluginUpdate, IPluginDrawInterface, IPluginPlayerSave
    {
        private static readonly byte[] Aob = new byte[] { 0x74, 0x10, 0x8B, 0xCE, 0x33, 0xD2, 0xE8 };
        private const byte JourneyDifficulty = 3;

        private bool _enabled;
        private bool _showChatMessage;
        private bool _attempted;
        private bool _patched;
        private bool _fallbackMode;
        private bool _fallbackAnnounced;
        private bool _fallbackPowersUnlocked;

        private bool _uiDifficultySpoofActive;
        private bool _uiDifficultySpoofCaptured;
        private byte _uiDifficultyOriginal;

        private bool _uiGameModeOverrideCaptured;
        private object _uiGameModeOverrideOriginal;

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

            if (_fallbackMode)
                ApplyFallbackOneShot();
        }

        public void OnUpdate()
        {
            if (!_enabled || !_fallbackMode)
                return;

            Player player = GetLocalPlayerSafe();
            if (player == null)
                return;

            // Spoof only while inventory UI is visible so the player is not effectively converted.
            bool shouldSpoofForUi = Main.playerInventory;
            if (shouldSpoofForUi)
            {
                ApplyUiSpoof(player);
                if (!_fallbackPowersUnlocked)
                    _fallbackPowersUnlocked = TryUnlockCreativePowers(Main.myPlayer);
            }
            else
            {
                RestoreUiSpoof(player);
            }
        }

        public void OnDrawInterface()
        {
            if (!_enabled || !_fallbackMode)
                return;

            // DrawInterface hook runs after UI drawing. Restore immediately after the frame.
            RestoreUiSpoof(GetLocalPlayerSafe());
        }

        public void OnPlayerSave(Terraria.IO.PlayerFileData playerFileData, BinaryWriter binaryWriter)
        {
            if (!_enabled || !_fallbackMode)
                return;

            RestoreUiSpoof(GetLocalPlayerSafe());
        }

        private void ApplyFallbackOneShot()
        {
            if (!_fallbackAnnounced && _showChatMessage)
            {
                _fallbackAnnounced = true;
                TryChat("Journey Mode fallback active (compatibility mode).");
            }

            // Best-effort helpers. UI spoof (difficulty/override) happens only around inventory draw.
            TryApplyJourneyGameModeOverride();
            TryEnsureCreativeMenuEnabled();
        }

        private void ApplyUiSpoof(Player player)
        {
            if (player == null || player.whoAmI != Main.myPlayer)
                return;

            try
            {
                if (!_uiDifficultySpoofCaptured)
                {
                    _uiDifficultyOriginal = player.difficulty;
                    _uiDifficultySpoofCaptured = true;
                }

                if (player.difficulty != JourneyDifficulty)
                    player.difficulty = JourneyDifficulty;
            }
            catch
            {
            }

            TryApplyJourneyGameModeOverride();
            TryEnsureCreativeMenuEnabled();
            _uiDifficultySpoofActive = true;
        }

        private void RestoreUiSpoof(Player player)
        {
            if (!_uiDifficultySpoofActive)
                return;

            try
            {
                if (player != null && _uiDifficultySpoofCaptured && player.whoAmI == Main.myPlayer)
                    player.difficulty = _uiDifficultyOriginal;
            }
            catch
            {
            }

            TryRestoreJourneyGameModeOverride();
            _uiDifficultySpoofActive = false;
        }

        private bool TryApplyJourneyGameModeOverride()
        {
            try
            {
                Type mainType = typeof(Main);
                FieldInfo overrideField = mainType.GetField("_gameModeDifficultyOverride",
                    BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (overrideField == null)
                    return false;

                if (!_uiGameModeOverrideCaptured)
                {
                    _uiGameModeOverrideOriginal = overrideField.GetValue(null);
                    _uiGameModeOverrideCaptured = true;
                }

                float journeyLevel;
                if (!TryGetJourneyGameDifficultyLevel(out journeyLevel))
                    return false;

                overrideField.SetValue(null, new float?(journeyLevel));
                InvokeMainUpdateCreativeGameModeOverride();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void TryRestoreJourneyGameModeOverride()
        {
            if (!_uiGameModeOverrideCaptured)
                return;

            try
            {
                Type mainType = typeof(Main);
                FieldInfo overrideField = mainType.GetField("_gameModeDifficultyOverride",
                    BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (overrideField == null)
                    return;

                overrideField.SetValue(null, _uiGameModeOverrideOriginal);
                InvokeMainUpdateCreativeGameModeOverride();
            }
            catch
            {
            }
        }

        private static void InvokeMainUpdateCreativeGameModeOverride()
        {
            try
            {
                Type mainType = typeof(Main);
                MethodInfo updateMethod = mainType.GetMethod("UpdateCreativeGameModeOverride",
                    BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (updateMethod == null || updateMethod.GetParameters().Length != 0)
                    return;

                object target = null;
                if (!updateMethod.IsStatic)
                {
                    FieldInfo instanceField = mainType.GetField("instance", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    target = instanceField != null ? instanceField.GetValue(null) : null;
                }

                updateMethod.Invoke(target, null);
            }
            catch
            {
            }
        }

        private static bool TryGetJourneyGameDifficultyLevel(out float value)
        {
            value = 0f;
            try
            {
                Type t = Type.GetType("Terraria.DataStructures.GameDifficultyLevel, Terraria");
                if (t == null)
                    return false;

                FieldInfo field = t.GetField("Journey", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                if (field == null)
                    return false;

                object raw = field.GetValue(null);
                if (raw == null)
                    return false;

                value = Convert.ToSingle(raw);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void TryEnsureCreativeMenuEnabled()
        {
            try
            {
                object creativeMenu;
                Type creativeMenuType;
                if (!TryGetCreativeMenuObject(out creativeMenu, out creativeMenuType))
                    return;

                PropertyInfo enabledProp = creativeMenuType.GetProperty("Enabled",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (enabledProp == null || !enabledProp.CanWrite)
                    return;

                object current = enabledProp.GetValue(creativeMenu, null);
                if (!(current is bool) || !(bool)current)
                    enabledProp.SetValue(creativeMenu, true, null);
            }
            catch
            {
            }
        }

        private static bool TryGetCreativeMenuObject(out object creativeMenu, out Type creativeMenuType)
        {
            creativeMenu = null;
            creativeMenuType = null;

            try
            {
                Type mainType = typeof(Main);
                FieldInfo creativeMenuField = mainType.GetField("CreativeMenu",
                    BindingFlags.Static | BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (creativeMenuField == null)
                    return false;

                object target = null;
                if (!creativeMenuField.IsStatic)
                {
                    FieldInfo instanceField = mainType.GetField("instance",
                        BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                    target = instanceField != null ? instanceField.GetValue(null) : null;
                }

                creativeMenu = creativeMenuField.GetValue(target);
                if (creativeMenu == null)
                    return false;

                creativeMenuType = creativeMenu.GetType();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private bool TryUnlockCreativePowers(int playerIndex)
        {
            try
            {
                Type mgrType = Type.GetType("Terraria.GameContent.Creative.CreativePowerManager, Terraria");
                if (mgrType == null)
                    return false;

                FieldInfo instanceField = mgrType.GetField("Instance", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                PropertyInfo instanceProp = mgrType.GetProperty("Instance", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
                object instance = instanceProp != null ? instanceProp.GetValue(null, null) : (instanceField != null ? instanceField.GetValue(null) : null);
                if (instance == null)
                    return false;

                MethodInfo unlockAll = mgrType.GetMethod("UnlockAllPowersForPlayer",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (unlockAll != null)
                {
                    unlockAll.Invoke(instance, new object[] { playerIndex });
                    return true;
                }

                FieldInfo powersField = mgrType.GetField("_powersById", BindingFlags.Instance | BindingFlags.NonPublic);
                System.Collections.IEnumerable powers = powersField != null ? powersField.GetValue(instance) as System.Collections.IEnumerable : null;
                if (powers == null)
                    return false;

                foreach (object kv in powers)
                {
                    PropertyInfo powerProp = kv.GetType().GetProperty("Value");
                    object power = powerProp != null ? powerProp.GetValue(kv, null) : null;
                    if (power == null)
                        continue;

                    MethodInfo unlock = power.GetType().GetMethod("UnlockForPlayer",
                        BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                    if (unlock != null)
                        unlock.Invoke(power, new object[] { playerIndex });
                }

                return true;
            }
            catch
            {
                return false;
            }
        }

        private static Player GetLocalPlayerSafe()
        {
            try
            {
                if (Main.player == null || Main.myPlayer < 0 || Main.myPlayer >= Main.player.Length)
                    return null;
                return Main.player[Main.myPlayer];
            }
            catch
            {
                return null;
            }
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
            PlatformID p = Environment.OSVersion.Platform;
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
