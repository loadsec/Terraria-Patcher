const edge = require("electron-edge-js");
const path = require("path");

const getMethods = edge.func(`
    #r "src/main/bridge/bin/Release/Mono.Cecil.dll"
    using System;
    using System.Threading.Tasks;
    using Mono.Cecil;
    using System.Linq;

    public class Startup {
        public async Task<object> Invoke(dynamic input) {
            try {
                var asm = AssemblyDefinition.ReadAssembly((string)input.path);
                var netplay = asm.MainModule.Types.FirstOrDefault(t => t.Name == "Netplay");
                if (netplay == null) return "Netplay not found";
                return string.Join(", ", netplay.Methods.Select(m => m.Name).ToArray());
            } catch (Exception ex) {
                return ex.ToString();
            }
        }
    }
`);

getMethods(
  { path: "E:\\SteamLibrary\\steamapps\\common\\Terraria\\Terraria.exe" },
  (error, result) => {
    if (error) console.error(error);
    else console.log(result);
  },
);
