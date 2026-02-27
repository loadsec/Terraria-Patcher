using System;
using System.Globalization;
using System.IO;
using Terraria;
using PluginLoader;
using Terraria.IO;

namespace TranscendPlugins
{
    public class SavePosition : MarshalByRefObject, IPluginPlayerLoad, IPluginPlayerSave, IPluginPlayerSpawn
    {
        private bool justLoadedIn = false;

        // FNA PluginLoader signature
        public void OnPlayerSave(PlayerFileData playerFileData, BinaryWriter binaryWriter)
        {
            OnPlayerSaveCore(GetSavePlayerFallback());
        }

        // XNA PluginLoader signature
        public void OnPlayerSave(PlayerFileData playerFileData, Player player, BinaryWriter binaryWriter)
        {
            OnPlayerSaveCore(player);
        }

        private void OnPlayerSaveCore(Player player)
        {
            if (justLoadedIn) return;
            if (player == null) return;

            if (Main.worldID == 0) return;
            if (player.position.X == 0f && player.position.Y == 0f) return;

            var key = Main.worldID + "," + player.name;
            var x = player.position.X.ToString(CultureInfo.InvariantCulture);
            var y = player.position.Y.ToString(CultureInfo.InvariantCulture);
            IniAPI.WriteIni("SavePosition", key, string.Concat(x, ",", y));
        }

        private static Player GetSavePlayerFallback()
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

        public void OnPlayerLoad(PlayerFileData playerFileData, Player player, BinaryReader binaryReader)
        {
            justLoadedIn = true;
        }
		
        public void OnPlayerSpawn(Player player)
        {
            if (player.whoAmI != Main.myPlayer || !justLoadedIn) return;

            var vector = IniAPI.ReadIni("SavePosition", Main.worldID + "," + Main.player[Main.myPlayer].name, null);
            if (!string.IsNullOrEmpty(vector))
            {
                var parts = vector.Split(',');
                if (parts.Length == 2)
                {
                    float x, y;
                    if (float.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out x) &&
                        float.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out y))
                    {
                        player.position.X = x;
                        player.position.Y = y;
                        player.fallStart = (int)(player.position.Y / 16f);
                        player.fallStart2 = player.fallStart;
                        player.oldPosition = player.position;
                        Main.screenPosition.X = player.position.X + player.width / 2 - Main.screenWidth / 2;
                        Main.screenPosition.Y = player.position.Y + player.height / 2 - Main.screenHeight / 2;
                    }
                }
            }

            justLoadedIn = false;
        }
    }
}
