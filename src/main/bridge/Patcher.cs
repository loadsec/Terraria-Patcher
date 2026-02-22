using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Mono.Cecil;
using Mono.Cecil.Cil;
using Mono.Cecil.Rocks;
using MethodAttributes = Mono.Cecil.MethodAttributes;

namespace TerrariaPatcherBridge
{
    public class TerrariaDetails
    {
        public bool PermanentWings = false;
        public bool RemovePotionSickness = false;
        public bool RemoveManaCost = false;
        public bool DisplayTime = false;
        public bool RemoveDiscordBuff = false;
        public bool RemoveAnglerQuestLimit = false;
        public bool RemoveDrowning = false;
        public bool OneHitKill = false;
        public bool InfiniteAmmo = false;
        public bool InfiniteCloudJumps = false;
        public bool FunctionalSocialSlots = false;
        public bool MaxCraftingRange = false;
        public bool PylonEverywhere = false;
        public float VampiricHealing = 7.5f;
        public float SpectreHealing = 20f;
        public int SpawnRateVoodoo = 100;
        public bool BossBagsDropAllLoot = false;
        public List<int> PermanentBuffs = new List<int>();
    }

    /// <summary>
    /// Edge.js entry point. Called from the Electron main process.
    /// </summary>
    public class Startup
    {
        public async Task<object> Invoke(object input)
        {
            try
            {
                var dict = (IDictionary<string, object>)input;
                
                if (dict.ContainsKey("command") && dict["command"].ToString() == "getVersions")
                {
                    var exePath = dict.ContainsKey("exePath") ? dict["exePath"]?.ToString() : null;
                    var bakPath = dict.ContainsKey("bakPath") ? dict["bakPath"]?.ToString() : null;
                    string exeV = null;
                    string bakV = null;
                    
                    try { if (!string.IsNullOrEmpty(exePath) && File.Exists(exePath)) exeV = IL.GetAssemblyVersion(exePath)?.ToString(); } catch {}
                    try { if (!string.IsNullOrEmpty(bakPath) && File.Exists(bakPath)) bakV = IL.GetAssemblyVersion(bakPath)?.ToString(); } catch {}
                    
                    return new { success = true, exeVersion = exeV, bakVersion = bakV };
                }

                var terrariaPath = dict["terrariaPath"].ToString();
                var options = (IDictionary<string, object>)dict["options"];

                if (!File.Exists(terrariaPath))
                {
                    return new { success = false, message = "Terraria.exe not found at: " + terrariaPath };
                }

                var details = new TerrariaDetails();

                // Boolean options
                if (options.ContainsKey("DisplayTime")) details.DisplayTime = (bool)options["DisplayTime"];
                if (options.ContainsKey("FunctionalSocialSlots")) details.FunctionalSocialSlots = (bool)options["FunctionalSocialSlots"];
                if (options.ContainsKey("MaxCraftingRange")) details.MaxCraftingRange = (bool)options["MaxCraftingRange"];
                if (options.ContainsKey("PylonEverywhere")) details.PylonEverywhere = (bool)options["PylonEverywhere"];
                if (options.ContainsKey("RemoveAnglerQuestLimit")) details.RemoveAnglerQuestLimit = (bool)options["RemoveAnglerQuestLimit"];
                if (options.ContainsKey("RemoveDiscordBuff")) details.RemoveDiscordBuff = (bool)options["RemoveDiscordBuff"];
                if (options.ContainsKey("RemovePotionSickness")) details.RemovePotionSickness = (bool)options["RemovePotionSickness"];
                if (options.ContainsKey("RemoveManaCost")) details.RemoveManaCost = (bool)options["RemoveManaCost"];
                if (options.ContainsKey("RemoveDrowning")) details.RemoveDrowning = (bool)options["RemoveDrowning"];
                if (options.ContainsKey("OneHitKill")) details.OneHitKill = (bool)options["OneHitKill"];
                if (options.ContainsKey("InfiniteAmmo")) details.InfiniteAmmo = (bool)options["InfiniteAmmo"];
                if (options.ContainsKey("PermanentWings")) details.PermanentWings = (bool)options["PermanentWings"];
                if (options.ContainsKey("InfiniteCloudJumps")) details.InfiniteCloudJumps = (bool)options["InfiniteCloudJumps"];
                if (options.ContainsKey("BossBagsDropAllLoot")) details.BossBagsDropAllLoot = (bool)options["BossBagsDropAllLoot"];

                // Numeric options
                if (options.ContainsKey("VampiricHealing"))
                    details.VampiricHealing = Convert.ToSingle(options["VampiricHealing"]);
                if (options.ContainsKey("SpectreHealing"))
                    details.SpectreHealing = Convert.ToSingle(options["SpectreHealing"]);
                if (options.ContainsKey("SpawnRateVoodoo"))
                    details.SpawnRateVoodoo = Convert.ToInt32(options["SpawnRateVoodoo"]);

                // Buff IDs
                if (options.ContainsKey("PermanentBuffs"))
                {
                    var buffsObj = options["PermanentBuffs"] as object[];
                    if (buffsObj != null)
                    {
                        foreach (var b in buffsObj)
                            details.PermanentBuffs.Add(Convert.ToInt32(b));
                    }
                }

                // Patch!
                Terraria.Patch(terrariaPath, terrariaPath, details);

                return new { success = true, message = "Terraria patched successfully!" };
            }
            catch (Exception ex)
            {
                return new { success = false, message = "Patch failed: " + ex.ToString() };
            }
        }
    }

    public class Terraria
    {
        private class BossBagDrop
        {
            public int Item;
            public int Stack;
        }

        private static ModuleDefinition _mainModule;

        public static void Patch(string original, string target, TerrariaDetails details)
        {
            using (var asm = AssemblyDefinition.ReadAssembly(original, new ReaderParameters()
            {
                AssemblyResolver = new MyAssemblyResolver(Path.GetDirectoryName(original))
            }))
            {
                _mainModule = asm.MainModule;

                void TestIL(string name) {
                    try {
                        using (var ms = new MemoryStream()) {
                            asm.Write(ms);
                        }
                    } catch (Exception) {
                        throw new Exception("IL broke at: " + name);
                    }
                }

                if (details.PermanentWings) { AddWings(); TestIL("PermanentWings"); }
                if (details.PermanentBuffs.Count > 0)
                {
                    if (details.PermanentBuffs.Contains(147))
                    {
                        EnableAllBannerBuffs();
                        TestIL("EnableAllBannerBuffs");
                    }
                    AddBuffs(details.PermanentBuffs);
                    TestIL("AddBuffs");
                }
                if (details.InfiniteAmmo) { InfiniteAmmo(); TestIL("InfiniteAmmo"); }
                if (details.RemovePotionSickness) { RemovePotionSickness(); TestIL("RemovePotionSickness"); }
                if (details.RemoveDiscordBuff) { RemoveDiscordBuff(); TestIL("RemoveDiscordBuff"); }
                if (details.MaxCraftingRange) { RecipeRange(); TestIL("MaxCraftingRange"); }
                if (details.FunctionalSocialSlots) { FunctionalSocialSlots(); TestIL("FunctionalSocialSlots"); }
                if (details.InfiniteCloudJumps) { InfiniteCloudJumps(); TestIL("InfiniteCloudJumps"); }
                if (details.RemoveManaCost) { RemoveManaCost(); TestIL("RemoveManaCost"); }
                if (details.RemoveDrowning) { RemoveDrowning(); TestIL("RemoveDrowning"); }
                if (details.DisplayTime) { DisplayTime(); TestIL("DisplayTime"); }
                if (details.OneHitKill) { OneHitKill(); TestIL("OneHitKill"); }
                if (details.RemoveAnglerQuestLimit) { RemoveAnglerQuestLimit(); TestIL("RemoveAnglerQuestLimit"); }
                if (details.PylonEverywhere) { PylonEverywhere(); TestIL("PylonEverywhere"); }
                if (Math.Abs(details.VampiricHealing - 7.5f) > 0.01) { ModVampiricKnives(details.VampiricHealing / 100f); TestIL("ModVampiricKnives"); }
                if (Math.Abs(details.SpectreHealing - 20f) > 0.01) { ModSpectreArmor(details.SpectreHealing / 100f); TestIL("ModSpectreArmor"); }
                if (details.SpawnRateVoodoo != 10) { ModSpawnRateVoodooDemon(details.SpawnRateVoodoo / 100f); TestIL("ModSpawnRateVoodooDemon"); }
                if (details.BossBagsDropAllLoot) { TreasureBagsDropAll(); TestIL("TreasureBagsDropAll"); }

                asm.Write(target + ".tmp");
            }

            if (File.Exists(target))
                File.Delete(target);
            File.Move(target + ".tmp", target);
            IL.MakeLargeAddressAware(target);
        }

        private static void FunctionalSocialSlots()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var ctor = IL.GetMethodDefinition(player, ".ctor");
            var updateEquips = IL.GetMethodDefinition(player, "UpdateEquips");

            int spot0 = IL.ScanForOpcodePattern(ctor, (i, instruction) =>
            {
                var i3 = ctor.Body.Instructions[i + 3].Operand as FieldReference;
                return i3 != null && i3.Name == "hideVisibleAccessory";
            }, OpCodes.Ldarg_0, OpCodes.Ldc_I4_S, OpCodes.Newarr, OpCodes.Stfld);
            ctor.Body.Instructions[spot0 + 1].Operand = (sbyte)20;

            int spot = 0;
            while (true)
            {
                spot = IL.ScanForOpcodePattern(updateEquips, (i, instruction) =>
                {
                    return (sbyte)updateEquips.Body.Instructions[i].Operand == (sbyte)10 &&
                           (updateEquips.Body.Instructions[i + 1].OpCode == OpCodes.Blt ||
                            updateEquips.Body.Instructions[i + 1].OpCode == OpCodes.Blt_S);
                }, spot, OpCodes.Ldc_I4_S);
                if (spot < 0)
                    break;
                updateEquips.Body.Instructions[spot].Operand = (sbyte)20;
                spot++;
            }

            var isItemSlotUnlockedAndUsable = IL.GetMethodDefinition(player, "IsItemSlotUnlockedAndUsable");
            isItemSlotUnlockedAndUsable.Body.ExceptionHandlers.Clear();
            isItemSlotUnlockedAndUsable.Body.Instructions.Clear();
            isItemSlotUnlockedAndUsable.Body.Instructions.Add(Instruction.Create(OpCodes.Ldc_I4_1));
            isItemSlotUnlockedAndUsable.Body.Instructions.Add(Instruction.Create(OpCodes.Ret));
        }

        private static void ModVampiricKnives(float healingRate)
        {
            var projectile = IL.GetTypeDefinition(_mainModule, "Projectile");
            var vampireHeal = IL.GetMethodDefinition(projectile, "vampireHeal");

            int spot = IL.ScanForOpcodePattern(vampireHeal, OpCodes.Ldc_R4);
            vampireHeal.Body.Instructions[spot].Operand = healingRate;
        }

        private static void ModSpectreArmor(float healingRate)
        {
            var projectile = IL.GetTypeDefinition(_mainModule, "Projectile");
            var ghostHeal = IL.GetMethodDefinition(projectile, "ghostHeal");

            int spot = IL.ScanForOpcodePattern(ghostHeal, OpCodes.Ldc_R4);
            ghostHeal.Body.Instructions[spot].Operand = healingRate;
        }

        private static void InfiniteCloudJumps()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var update = IL.GetMethodDefinition(player, "Update");

            using (update.JumpFix())
            {
                var names = new HashSet<string>
                {
                    "canJumpAgain_Basilisk", "canJumpAgain_Blizzard", "canJumpAgain_Cloud", "canJumpAgain_Fart", "canJumpAgain_Sail",
                    "canJumpAgain_Sandstorm", "canJumpAgain_Santank", "canJumpAgain_Unicorn", "canJumpAgain_WallOfFleshGoat"
                };

                for (int i = 1; i < update.Body.Instructions.Count; i++)
                {
                    if (update.Body.Instructions[i].OpCode == OpCodes.Stfld &&
                        update.Body.Instructions[i].Operand is FieldReference f &&
                        names.Contains(f.Name) &&
                        update.Body.Instructions[i - 1].OpCode == OpCodes.Ldc_I4_0)
                    {
                        update.Body.Instructions[i - 1].OpCode = OpCodes.Ldc_I4_1;
                    }
                }
            }
        }

        private static void OneHitKill()
        {
            var npc = IL.GetTypeDefinition(_mainModule, "NPC");
            var strikeNPC = IL.GetMethodDefinition(npc, "StrikeNPC");

            using (strikeNPC.JumpFix())
            {
                int spot = IL.ScanForOpcodePattern(strikeNPC,
                    OpCodes.Ldarg_1,
                    OpCodes.Conv_R8,
                    OpCodes.Stloc_1);

                var life = IL.GetFieldDefinition(npc, "life");
                strikeNPC.Body.Instructions[spot].OpCode = OpCodes.Ldarg_0;
                strikeNPC.Body.Instructions.Insert(spot + 1, Instruction.Create(OpCodes.Ldfld, life));

                int spot2 = IL.ScanForOpcodePattern(strikeNPC,
                    (i, instruction) =>
                    {
                        var i0 = strikeNPC.Body.Instructions[i].Operand as ParameterReference;
                        return i0 != null && i0.Name == "crit";
                    },
                    spot,
                    OpCodes.Ldarg_S,
                    OpCodes.Brfalse_S);

                // Instead of NOPping things out which might leave stack fragments, we just Br to spot2!
                if (spot2 >= 0)
                {
                    // Convert the instruction after our Ldfld insert into a Br to spot2 + 1
                    strikeNPC.Body.Instructions[spot + 2].OpCode = OpCodes.Br;
                    strikeNPC.Body.Instructions[spot + 2].Operand = strikeNPC.Body.Instructions[spot2 + 1];

                    // Nop out the remaining ones safely since they are now dead code and unreachable
                    for (int i = spot + 3; i < spot2 + 1; i++)
                    {
                        strikeNPC.Body.Instructions[i].OpCode = OpCodes.Nop;
                        strikeNPC.Body.Instructions[i].Operand = null;
                    }
                }
            }
        }

        private static void DisplayTime()
        {
            var main = IL.GetTypeDefinition(_mainModule, "Main");
            var drawInfoAccs = IL.GetMethodDefinition(main, "DrawInfoAccs");

            int spot = IL.ScanForOpcodePattern(drawInfoAccs, (i, instruction) =>
            {
                var fieldReference = instruction.Operand as FieldReference;
                return fieldReference != null && fieldReference.Name == "accWatch";
            },
                OpCodes.Ldfld,
                OpCodes.Ldc_I4_0,
                OpCodes.Ble
            );

            if (spot >= 0)
            {
                drawInfoAccs.Body.Instructions[spot + 1].OpCode = OpCodes.Ldc_I4_M1;
            }
            else
            {
                spot = IL.ScanForOpcodePattern(drawInfoAccs, (i, instruction) =>
                {
                    var fieldReference = instruction.Operand as FieldReference;
                    return fieldReference != null && fieldReference.Name == "accWatch";
                },
                    OpCodes.Ldfld,
                    OpCodes.Ldc_I4_0,
                    OpCodes.Ble_S
                );

                if (spot >= 0)
                {
                    drawInfoAccs.Body.Instructions[spot + 1].OpCode = OpCodes.Ldc_I4_M1;
                }
            }
        }

        private static void RemoveDrowning()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var checkDrowning = IL.GetMethodDefinition(player, "CheckDrowning");
            checkDrowning.Body.ExceptionHandlers.Clear();
            checkDrowning.Body.Instructions.Clear();
            checkDrowning.Body.Instructions.Add(Instruction.Create(OpCodes.Ret));
        }

        private static void RemoveAnglerQuestLimit()
        {
            var main = IL.GetTypeDefinition(_mainModule, "Main");
            var npcChatTextDoAnglerQuest = IL.GetMethodDefinition(main, "NPCChatText_DoAnglerQuest");
            var questSwap = IL.GetMethodDefinition(main, "AnglerQuestSwap");

            int spot = IL.ScanForOpcodePattern(npcChatTextDoAnglerQuest,
                                               (i, instruction) =>
                                               {
                                                   var i3 = npcChatTextDoAnglerQuest.Body.Instructions[i + 3].Operand as FieldReference;
                                                   return i3 != null && i3.Name == "anglerQuestFinished";
                                               },
                                               OpCodes.Ldloc_0,
                                               OpCodes.Brfalse_S,
                                               OpCodes.Ldc_I4_1);

            if (spot >= 0)
            {
                npcChatTextDoAnglerQuest.Body.Instructions[spot + 2].OpCode = OpCodes.Call;
                npcChatTextDoAnglerQuest.Body.Instructions[spot + 2].Operand = questSwap;

                // Instead of NOpping everything repeatedly (which can hit branch targets),
                // we'll just insert a Ret immediately.
                npcChatTextDoAnglerQuest.Body.Instructions.Insert(spot + 3, Instruction.Create(OpCodes.Ret));
            }
        }

        private static void InfiniteAmmo()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var pickAmmo = IL.GetMethodDefinition(player, "PickAmmo");

            int spot = IL.ScanForOpcodePattern(pickAmmo,
                                                (i, instruction) =>
                                                {
                                                    var i1 = instruction.Operand as FieldReference;
                                                    return i1 != null && i1.Name == "stack";
                                                },
                                                OpCodes.Ldfld,
                                                OpCodes.Ldc_I4_1,
                                                OpCodes.Sub,
                                                OpCodes.Stfld);

            if (spot >= 0)
                pickAmmo.Body.Instructions[spot + 1].OpCode = OpCodes.Ldc_I4_0;
        }

        private static void RemovePotionSickness()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var quickHeal = IL.GetMethodDefinition(player, "QuickHeal");
            var applyLifeAndOrMana = IL.GetMethodDefinition(player, "ApplyLifeAndOrMana");
            var applyPotionDelay = IL.GetMethodDefinition(player, "ApplyPotionDelay");

            int spot1 = IL.ScanForOpcodePattern(quickHeal,
                (i, instruction) =>
                {
                    var i1 = quickHeal.Body.Instructions[i + 1].Operand as FieldReference;
                    return i1 != null && i1.Name == "buffType";
                },
                OpCodes.Ldloc_0,
                OpCodes.Ldfld,
                OpCodes.Ldc_I4_0,
                OpCodes.Ble_S);

            if (spot1 >= 0)
            {
                // Spot1 points to Ldloc_0. The instruction at spot1+3 is Ble_S.
                // We want this Ble_S to always branch (meaning buffType <= 0, so it skips applying sickness).
                // We replace the value compared against with int.MaxValue, so buffType is always <= int.MaxValue.
                quickHeal.Body.Instructions[spot1 + 2].OpCode = OpCodes.Ldc_I4;
                quickHeal.Body.Instructions[spot1 + 2].Operand = int.MaxValue;
            }

            int spot2 = IL.ScanForOpcodePattern(applyLifeAndOrMana,
                (i, instruction) =>
                {
                    var i2 = applyLifeAndOrMana.Body.Instructions[i + 2].Operand as FieldReference;
                    var i5 = applyLifeAndOrMana.Body.Instructions[i + 4].Operand as MethodReference;
                    return i2 != null && i2.Name == "manaSickTime" &&
                           i5 != null && i5.Name == "AddBuff";
                },
                OpCodes.Ldarg_0,
                OpCodes.Ldc_I4_S,
                OpCodes.Ldsfld,
                OpCodes.Ldc_I4_0,
                OpCodes.Call);

            if (spot2 >= 0)
            {
                // spot2 points to Ldarg_0. This is the start of `this.AddBuff(94, Player.manaSickTime, true, false)`
                // Before spot2 there should be a branch checking if we should add mana sickness.
                // We can instead just replace the Call to AddBuff with a branch that jumps OVER the Call and Pops the arguments.
                // Or much easier: Find the branch *before* spot2 that jumps over AddBuff, and force it to jump!
                int branchIndex = -1;
                for (int i = spot2 - 1; i >= 0; i--)
                {
                    if (applyLifeAndOrMana.Body.Instructions[i].OpCode == OpCodes.Ble_S ||
                        applyLifeAndOrMana.Body.Instructions[i].OpCode == OpCodes.Ble)
                    {
                        branchIndex = i;
                        break;
                    }
                }

                if (branchIndex >= 0)
                {
                    // The instruction before Ble_S is usually Ldc_I4_0. Let's make it Ldc_I4_M1 so the <= 0 check always passes.
                    if (applyLifeAndOrMana.Body.Instructions[branchIndex - 1].OpCode == OpCodes.Ldc_I4_0)
                    {
                        applyLifeAndOrMana.Body.Instructions[branchIndex - 1].OpCode = OpCodes.Ldc_I4_M1;
                    }
                    else if (applyLifeAndOrMana.Body.Instructions[branchIndex].OpCode == OpCodes.Ble_S || applyLifeAndOrMana.Body.Instructions[branchIndex].OpCode == OpCodes.Ble)
                    {
                        // If we can't find the constant, change Ble to unconditional Br
                        applyLifeAndOrMana.Body.Instructions[branchIndex].OpCode = (applyLifeAndOrMana.Body.Instructions[branchIndex].OpCode == OpCodes.Ble_S) ? OpCodes.Br_S : OpCodes.Br;
                    }
                }
            }

            applyPotionDelay.Body.ExceptionHandlers.Clear();
            applyPotionDelay.Body.Instructions.Clear();
            applyPotionDelay.Body.Instructions.Add(Instruction.Create(OpCodes.Ret));
        }

        private static void RemoveManaCost()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");

            var checkMana = IL.GetMethodDefinition(player, "CheckMana", 3, verbose: false);
            var actuallyPayMana = IL.GetMethodDefinition(player, "ItemCheck_ActuallyPayMana", 1, verbose: false);

            if (checkMana != null && actuallyPayMana != null)
            {
                checkMana.Body.ExceptionHandlers.Clear();
                checkMana.Body.Instructions.Clear();
                checkMana.Body.Instructions.Add(Instruction.Create(OpCodes.Ldc_I4_1));
                checkMana.Body.Instructions.Add(Instruction.Create(OpCodes.Ret));

                actuallyPayMana.Body.ExceptionHandlers.Clear();
                actuallyPayMana.Body.Instructions.Clear();
                actuallyPayMana.Body.Instructions.Add(Instruction.Create(OpCodes.Ldc_I4_1));
                actuallyPayMana.Body.Instructions.Add(Instruction.Create(OpCodes.Ret));
            }
            else
            {
                var skipManaUse = IL.GetMethodDefinition(player, "ItemCheck_PayMana_ShouldSkipManaUse");
                skipManaUse.Body.ExceptionHandlers.Clear();
                skipManaUse.Body.Instructions.Clear();
                skipManaUse.Body.Instructions.Add(Instruction.Create(OpCodes.Ldc_I4_1));
                skipManaUse.Body.Instructions.Add(Instruction.Create(OpCodes.Ret));
            }
        }

        private static void RemoveDiscordBuff()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var itemCheckUseRodOfDiscord = IL.GetMethodDefinition(player, "ItemCheck_UseTeleportRod");

            int spot = IL.ScanForOpcodePattern(itemCheckUseRodOfDiscord, (i, instruction) =>
                {
                    var fieldReference = instruction.Operand as FieldReference;
                    return fieldReference != null && fieldReference.Name == "chaosState";
                },
                OpCodes.Ldfld,
                OpCodes.Brfalse_S);

            if (spot >= 0)
            {
                var target = itemCheckUseRodOfDiscord.Body.Instructions[spot - 1]; // Ldfld
                bool done = false;
                for (; target != null && !done; target = target.Next)
                {
                    if (target.OpCode == OpCodes.Call && (target.Operand as MethodReference)?.Name == "AddBuff")
                        done = true;

                    target.OpCode = OpCodes.Nop;
                    target.Operand = null;
                }
            }

            int spot2 = IL.ScanForOpcodePattern(itemCheckUseRodOfDiscord, (i, instruction) =>
                {
                    var methodReference = instruction.Operand as MethodReference;
                    return methodReference != null && methodReference.Name == "SolidCollision";
                },
                OpCodes.Call,
                OpCodes.Brtrue);

            if (spot2 >= 0)
            {
                // Instead of popping the result of SolidCollision, change the branch to always jump or never jump.
                // SolidCollision returns bool (leaves 1 value on stack).
                // We'll replace the Call with a constant (Ldc_I4_0) so Brtrue never jumps, allowing teleport.
                itemCheckUseRodOfDiscord.Body.Instructions[spot2].OpCode = OpCodes.Ldc_I4_0;
                itemCheckUseRodOfDiscord.Body.Instructions[spot2].Operand = null;
            }
        }

        private static void ModSpawnRateVoodooDemon(float rate)
        {
            var npc = IL.GetTypeDefinition(_mainModule, "NPC");
            var spawner = npc.NestedTypes.First(t => t.Name == "Spawner");
            var spawn = IL.GetMethodDefinition(spawner, "SpawnAnNPC");

            int spot = IL.ScanForOpcodePattern(spawn, (i, instruction) =>
                                           {
                                               var instr = spawn.Body.Instructions[i + 12];
                                               return (instr.Operand as sbyte?) == 66;
                                           }, new[]
                                           {
                                               OpCodes.Ldc_I4_S,
                                               OpCodes.Callvirt,
                                               OpCodes.Brtrue_S
                                           });

            spawn.Body.Instructions[spot].OpCode = OpCodes.Ldc_I4_S;
            spawn.Body.Instructions[spot].Operand = Math.Abs(rate) < 0.001 ? sbyte.MaxValue : (sbyte)Math.Round(1 / rate);
        }

        private static void AddBuffs(IEnumerable<int> buffs)
        {
            var main = IL.GetTypeDefinition(_mainModule, "Main");
            var update = IL.GetMethodDefinition(main, "DoUpdate");
            var playerArr = IL.GetFieldDefinition(main, "player");
            var myPlayer = IL.GetFieldDefinition(main, "myPlayer");
            var gameMenu = IL.GetFieldDefinition(main, "gameMenu");

            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var addBuff = IL.GetMethodDefinition(player, "AddBuff");

            using (update.JumpFix())
            {
                var first = update.Body.Instructions.First();

                foreach (int buff in buffs)
                {
                    IL.MethodPrepend(update, new[]
                    {
                        Instruction.Create(OpCodes.Ldsfld, playerArr),
                        Instruction.Create(OpCodes.Ldsfld, myPlayer),
                        Instruction.Create(OpCodes.Ldelem_Ref),
                        Instruction.Create(OpCodes.Ldc_I4, buff),
                        Instruction.Create(OpCodes.Ldc_I4_2),
                        Instruction.Create(OpCodes.Ldc_I4_0),
                        Instruction.Create(OpCodes.Call, addBuff)
                    });
                }

                IL.MethodPrepend(update, new[]
                {
                    Instruction.Create(OpCodes.Ldsfld, gameMenu),
                    Instruction.Create(OpCodes.Brtrue, first)
                });
            }
        }

        private static void EnableAllBannerBuffs()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var hasNpcBannerBuff = IL.GetMethodDefinition(player, "HasNPCBannerBuff");

            hasNpcBannerBuff.Body.ExceptionHandlers.Clear();
            hasNpcBannerBuff.Body.Instructions.Clear();

            var il = hasNpcBannerBuff.Body.GetILProcessor();
            il.Emit(OpCodes.Ldc_I4_1);
            il.Emit(OpCodes.Ret);
        }

        private static void PylonEverywhere()
        {
            var pylonSystem = IL.GetTypeDefinition(_mainModule, "TeleportPylonsSystem");
            if (pylonSystem == null) return;

            var isNearPylon = IL.GetMethodDefinition(pylonSystem, "IsPlayerNearAPylon");
            if (isNearPylon != null)
            {
                isNearPylon.Body.ExceptionHandlers.Clear();
                isNearPylon.Body.Instructions.Clear();
                var il0 = isNearPylon.Body.GetILProcessor();
                il0.Emit(OpCodes.Ldc_I4_1);
                il0.Emit(OpCodes.Ret);
            }

            var doesHaveNPCs = IL.GetMethodDefinition(pylonSystem, "DoesPylonHaveEnoughNPCsAroundIt");
            if (doesHaveNPCs != null)
            {
                doesHaveNPCs.Body.ExceptionHandlers.Clear();
                doesHaveNPCs.Body.Instructions.Clear();
                var il1 = doesHaveNPCs.Body.GetILProcessor();
                il1.Emit(OpCodes.Ldc_I4_1);
                il1.Emit(OpCodes.Ret);
            }

            var doesAccept = IL.GetMethodDefinition(pylonSystem, "DoesPylonAcceptTeleportation");
            if (doesAccept != null)
            {
                doesAccept.Body.ExceptionHandlers.Clear();
                doesAccept.Body.Instructions.Clear();
                var il2 = doesAccept.Body.GetILProcessor();
                il2.Emit(OpCodes.Ldc_I4_1);
                il2.Emit(OpCodes.Ret);
            }

            var handleRequest = IL.GetMethodDefinition(pylonSystem, "HandleTeleportRequest");
            if (handleRequest != null)
            {
                for (int i = 0; i < handleRequest.Body.Instructions.Count; i++)
                {
                    var instr = handleRequest.Body.Instructions[i];
                    if (instr.OpCode == OpCodes.Callvirt)
                    {
                        var methodRef = instr.Operand as MethodReference;
                        if (methodRef != null && methodRef.Name == "InTileEntityInteractionRange")
                        {
                            if (i + 1 < handleRequest.Body.Instructions.Count)
                            {
                                var branch = handleRequest.Body.Instructions[i + 1];
                                if (branch.OpCode == OpCodes.Brfalse || branch.OpCode == OpCodes.Brfalse_S)
                                {
                                    // InTileEntityInteractionRange returns bool (leaves 1 val on stack)
                                    // Brfalse consumes it. We can't NOP the branch, or stack will be unbalanced.
                                    // We replace the Callvirt itself with Ldc_I4_1 so Brfalse won't jump!
                                    handleRequest.Body.Instructions[i].OpCode = OpCodes.Ldc_I4_1;
                                    handleRequest.Body.Instructions[i].Operand = null;
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }

        private static void RecipeRange()
        {
            var tileReachCheckSettings = IL.GetTypeDefinition(_mainModule, "TileReachCheckSettings");
            var getRanges = IL.GetMethodDefinition(tileReachCheckSettings, "GetRanges");
            var tileReachLimit = IL.GetFieldDefinition(tileReachCheckSettings, "TileReachLimit");

            using (getRanges.JumpFix())
            {
                IL.MethodPrepend(getRanges, new[]
                {
                    Instruction.Create(OpCodes.Ldarg_0),
                    Instruction.Create(OpCodes.Ldflda, tileReachLimit),
                    Instruction.Create(OpCodes.Initobj, _mainModule.ImportReference(typeof(int?)))
                });
            }
        }

        private static void AddWings()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var updatePlayerEquips = IL.GetMethodDefinition(player, "UpdateEquips");
            var wings = IL.GetFieldDefinition(player, "wings");
            var wingsLogic = IL.GetFieldDefinition(player, "wingsLogic");
            var wingTimeMax = IL.GetFieldDefinition(player, "wingTimeMax");

            using (updatePlayerEquips.JumpFix())
            {
                IL.MethodAppend(updatePlayerEquips, updatePlayerEquips.Body.Instructions.Count - 1, 1, new[]
                {
                    Instruction.Create(OpCodes.Ldarg_0),
                    Instruction.Create(OpCodes.Ldc_I4, 32),
                    Instruction.Create(OpCodes.Stfld, wings),
                    Instruction.Create(OpCodes.Ldarg_0),
                    Instruction.Create(OpCodes.Ldc_I4, 32),
                    Instruction.Create(OpCodes.Stfld, wingsLogic),
                    Instruction.Create(OpCodes.Ldarg_0),
                    Instruction.Create(OpCodes.Ldc_I4, int.MaxValue),
                    Instruction.Create(OpCodes.Stfld, wingTimeMax),
                    Instruction.Create(OpCodes.Ret)
                });
            }
        }


        private static void TreasureBagsDropAll()
        {
            var player = IL.GetTypeDefinition(_mainModule, "Player");
            var openBossBag = IL.GetMethodDefinition(player, "OpenBossBag");
            if (openBossBag == null) return;

            if (openBossBag.Body.Variables.Count < 2) return;
            var entitySourceType = openBossBag.Body.Variables[1].VariableType;

            var quickSpawn = player.Methods.FirstOrDefault(m =>
                m.Name == "QuickSpawnItem" &&
                m.Parameters.Count == 3 &&
                m.Parameters[0].ParameterType.FullName.Contains("IEntitySource"));
            var getItemSource = IL.GetMethodDefinition(player, "GetItemSource_OpenItem");
            if (quickSpawn == null || getItemSource == null) return;

            var instructions = openBossBag.Body.Instructions;
            var indexMap = instructions.Select((ins, idx) => new { ins, idx }).ToDictionary(x => x.ins, x => x.idx);
            var loot = new Dictionary<int, List<BossBagDrop>>();
            var coinIds = new HashSet<int> { 71, 72, 73, 74 };
            var killSegments = new List<List<Instruction>>();
            var listAdds = new Dictionary<int, List<int>>();
            var arrayAdds = new Dictionary<int, List<int>>();
            var arrayFieldRefs = new Dictionary<int, List<FieldReference>>();

            for (int i = 0; i < instructions.Count - 2; i++)
            {
                if (instructions[i].OpCode != OpCodes.Ldarg_1 || instructions[i + 1].OpCode != OpCodes.Ldc_I4)
                    continue;

                int bagId;
                if (!int.TryParse(instructions[i + 1].Operand.ToString(), out bagId))
                    continue;

                var branch = instructions[i + 2];
                if (branch == null || branch.Operand == null || !indexMap.ContainsKey(branch.Operand as Instruction))
                    continue;

                int start = i + 3;
                int end = indexMap[(Instruction)branch.Operand] - 1;
                if (end < start) continue;

                var listLocalMap = new Dictionary<int, List<int>>();
                _currentBagListAdds = listLocalMap;

                for (int j = start; j <= end - 1; j++)
                {
                    if (instructions[j].OpCode == OpCodes.Newobj &&
                        instructions[j].Operand is MethodReference ctor &&
                        ctor.DeclaringType.FullName.Contains("System.Collections.Generic.List`1<System.Int32>"))
                    {
                        var added = new List<int>();
                        int k = j + 1;
                        while (k < end - 1 &&
                               instructions[k].OpCode == OpCodes.Dup &&
                               instructions[k + 1].OpCode == OpCodes.Ldc_I4)
                        {
                            added.Add((int)instructions[k + 1].Operand);
                            k += 3;
                        }
                        if (added.Count > 0)
                        {
                            if (!listAdds.ContainsKey(bagId)) listAdds[bagId] = new List<int>();
                            foreach (var c in added)
                                if (!listAdds[bagId].Contains(c)) listAdds[bagId].Add(c);

                            int st = j + 1;
                            while (st <= end && !IsStoreToAnyLocal(instructions[st])) st++;
                            if (st <= end && IsStoreToAnyLocal(instructions[st]))
                            {
                                int lidx = GetStoreLocalIndex(instructions[st]);
                                if (lidx >= 0)
                                {
                                    listLocalMap[lidx] = new List<int>(added);
                                }
                            }
                        }
                    }
                }

                for (int j = start; j <= end - 3; j++)
                {
                    if (instructions[j].OpCode == OpCodes.Newarr &&
                        instructions[j].Operand is TypeReference tr &&
                        tr.FullName == "System.Int32")
                    {
                        var added = new List<int>();
                        int k = j + 1;
                        while (k <= end - 3 &&
                               instructions[k].OpCode == OpCodes.Dup &&
                               IsAnyConstant(instructions[k + 1]) &&
                               IsAnyConstant(instructions[k + 2]) &&
                               instructions[k + 3].OpCode == OpCodes.Stelem_I4)
                        {
                            int val;
                            if (TryGetConstantInt(instructions[k + 2], out val))
                                added.Add(val);
                            k += 4;
                        }
                        if (added.Count > 0)
                        {
                            if (!arrayAdds.ContainsKey(bagId)) arrayAdds[bagId] = new List<int>();
                            foreach (var c in added)
                                if (!arrayAdds[bagId].Contains(c)) arrayAdds[bagId].Add(c);
                        }
                    }
                }

                for (int j = start + 2; j <= end; j++)
                {
                    if (instructions[j].OpCode == OpCodes.Stelem_I4 &&
                        IsAnyConstant(instructions[j - 1]))
                    {
                        int val;
                        if (TryGetConstantInt(instructions[j - 1], out val))
                        {
                            if (!arrayAdds.ContainsKey(bagId)) arrayAdds[bagId] = new List<int>();
                            if (!arrayAdds[bagId].Contains(val)) arrayAdds[bagId].Add(val);
                        }
                    }
                }

                for (int j = start; j <= end; j++)
                {
                    var instr = instructions[j];
                    if (instr.OpCode != OpCodes.Call) continue;
                    var mr = instr.Operand as MethodReference;
                    if (mr == null || mr.Name != "QuickSpawnItem" || mr.Parameters.Count != 3) continue;
                    if (j < 2) continue;

                    var itemCandidates = ResolvePossibleInts(instructions, j - 2);
                    var stackCandidates = ResolvePossibleInts(instructions, j - 1);
                    if (stackCandidates.Count == 0) stackCandidates.Add(1);
                    if (stackCandidates.Count > 5)
                    {
                        stackCandidates = new List<int> { stackCandidates.Max() };
                    }

                    if (itemCandidates.Count == 0 && IsLoadLocal(instructions[j - 2]))
                    {
                        int localIdx = GetLocalIndex(instructions[j - 2]);
                        if (localIdx >= 0)
                        {
                            var constants = CollectConstAssignments(instructions, localIdx);
                            foreach (var c in constants) if (!itemCandidates.Contains(c)) itemCandidates.Add(c);
                        }
                    }

                    if (itemCandidates.Count == 0 &&
                        instructions[j - 2].OpCode.Code == Code.Ldelem_I4)
                    {
                        for (int back = j - 3; back >= j - 8 && back >= start; back--)
                        {
                            if (instructions[back].OpCode == OpCodes.Ldsfld &&
                                instructions[back].Operand is FieldReference fr &&
                                fr.FieldType.FullName == "System.Int32[]")
                            {
                                if (!arrayFieldRefs.ContainsKey(bagId)) arrayFieldRefs[bagId] = new List<FieldReference>();
                                if (!arrayFieldRefs[bagId].Any(x => x.FullName == fr.FullName))
                                    arrayFieldRefs[bagId].Add(fr);
                                break;
                            }
                        }
                    }

                    foreach (var item in itemCandidates)
                    {
                        if (coinIds.Contains(item)) continue;
                        foreach (var stack in stackCandidates)
                        {
                            if (!loot.ContainsKey(bagId))
                                loot[bagId] = new List<BossBagDrop>();
                            if (!loot[bagId].Any(x => x.Item == item))
                                loot[bagId].Add(new BossBagDrop { Item = item, Stack = stack });
                        }
                    }

                    if (itemCandidates.Count > 0 && itemCandidates.All(x => !coinIds.Contains(x)))
                    {
                        int callStart = j - 4;
                        if (callStart >= 0 &&
                            IsLoadPlayer(instructions[callStart]) &&
                            IsLoadLocal(instructions[callStart + 1]) &&
                            IsAnyConstantOrLocal(instructions[callStart + 2]) &&
                            IsAnyConstant(instructions[callStart + 3]))
                        {
                            var segment = new List<Instruction>();
                            for (int k = callStart; k <= j; k++) segment.Add(instructions[k]);
                            killSegments.Add(segment);
                        }
                    }
                }

                _currentBagListAdds = null;
            }

            for (int i = 0; i < instructions.Count - 2; i++)
            {
                if (instructions[i].OpCode != OpCodes.Ldarg_1 || instructions[i + 1].OpCode != OpCodes.Ldc_I4)
                    continue;
                int bagId;
                if (!int.TryParse(instructions[i + 1].Operand.ToString(), out bagId)) continue;
                if (!loot.ContainsKey(bagId)) continue;

                var branch2 = instructions[i + 2] as Instruction;
                if (branch2 == null || !indexMap.ContainsKey(branch2)) continue;
                int start = i + 3;
                int end = indexMap[branch2] - 1;
                if (end < start) continue;

                for (int j = start; j <= end; j++)
                {
                    var instr = instructions[j];
                    if (instr.OpCode != OpCodes.Call) continue;
                    var mr = instr.Operand as MethodReference;
                    if (mr == null || mr.Name != "QuickSpawnItem" || mr.Parameters.Count != 3) continue;
                    if (j < 2) continue;
                    var items = ResolvePossibleInts(instructions, j - 2);
                    if (items.Count == 0 && IsLoadLocal(instructions[j - 2]))
                    {
                        int li = GetLocalIndex(instructions[j - 2]);
                        if (li >= 0) items = CollectConstAssignments(instructions, li);
                    }
                    if (items.Any(it => !coinIds.Contains(it) && loot[bagId].Any(x => x.Item == it)))
                    {
                        int callStart = j - 4;
                        if (callStart >= 0)
                        {
                            var segment = new List<Instruction>();
                            for (int k = callStart; k <= j; k++) segment.Add(instructions[k]);
                            killSegments.Add(segment);
                        }
                    }
                }
            }

            var helper = new MethodDefinition("ForceBossBagAllLoot", MethodAttributes.Private, _mainModule.TypeSystem.Boolean);
            helper.Parameters.Add(new ParameterDefinition(_mainModule.TypeSystem.Int32));
            helper.Parameters.Add(new ParameterDefinition(entitySourceType));
            helper.Body.InitLocals = true;
            player.Methods.Add(helper);

            var allBags = new HashSet<int>(loot.Keys);
            foreach (var k in listAdds.Keys) allBags.Add(k);
            foreach (var k in arrayAdds.Keys) allBags.Add(k);
            foreach (var k in arrayFieldRefs.Keys) allBags.Add(k);

            var hIL = helper.Body.GetILProcessor();
            foreach (var bagId in allBags)
            {
                if (!loot.ContainsKey(bagId))
                    loot[bagId] = new List<BossBagDrop>();

                if (listAdds.TryGetValue(bagId, out var extras))
                {
                    foreach (var ex in extras)
                        if (!loot[bagId].Any(x => x.Item == ex))
                            loot[bagId].Add(new BossBagDrop { Item = ex, Stack = 1 });
                }
                if (arrayAdds.TryGetValue(bagId, out var aextras))
                {
                    foreach (var ex in aextras)
                        if (!loot[bagId].Any(x => x.Item == ex))
                            loot[bagId].Add(new BossBagDrop { Item = ex, Stack = 1 });
                }

                var skip = Instruction.Create(OpCodes.Nop);
                hIL.Emit(OpCodes.Ldarg_1);
                hIL.Emit(OpCodes.Ldc_I4, bagId);
                hIL.Emit(OpCodes.Bne_Un, skip);

                foreach (var drop in loot[bagId])
                {
                    hIL.Emit(OpCodes.Ldarg_0);
                    hIL.Emit(OpCodes.Ldarg_2);
                    hIL.Emit(OpCodes.Ldc_I4, drop.Item);
                    hIL.Emit(OpCodes.Ldc_I4, drop.Stack);
                    hIL.Emit(OpCodes.Call, quickSpawn);
                }

                if (arrayFieldRefs.TryGetValue(bagId, out var fields))
                {
                    foreach (var fr in fields)
                    {
                        var arrVar = new VariableDefinition(_mainModule.ImportReference(typeof(int[])));
                        var idxVar = new VariableDefinition(_mainModule.TypeSystem.Int32);
                        helper.Body.Variables.Add(arrVar);
                        helper.Body.Variables.Add(idxVar);

                        var loopStart = Instruction.Create(OpCodes.Ldloc, idxVar);
                        var loopEnd = Instruction.Create(OpCodes.Nop);

                        hIL.Emit(OpCodes.Ldsfld, fr);
                        hIL.Emit(OpCodes.Stloc, arrVar);
                        hIL.Emit(OpCodes.Ldc_I4_0);
                        hIL.Emit(OpCodes.Stloc, idxVar);

                        hIL.Append(loopStart);
                        hIL.Emit(OpCodes.Ldloc, idxVar);
                        hIL.Emit(OpCodes.Ldloc, arrVar);
                        hIL.Emit(OpCodes.Ldlen);
                        hIL.Emit(OpCodes.Conv_I4);
                        hIL.Emit(OpCodes.Bge, loopEnd);

                        hIL.Emit(OpCodes.Ldarg_0);
                        hIL.Emit(OpCodes.Ldarg_2);
                        hIL.Emit(OpCodes.Ldloc, arrVar);
                        hIL.Emit(OpCodes.Ldloc, idxVar);
                        hIL.Emit(OpCodes.Ldelem_I4);
                        hIL.Emit(OpCodes.Ldc_I4_1);
                        hIL.Emit(OpCodes.Call, quickSpawn);

                        hIL.Emit(OpCodes.Ldloc, idxVar);
                        hIL.Emit(OpCodes.Ldc_I4_1);
                        hIL.Emit(OpCodes.Add);
                        hIL.Emit(OpCodes.Stloc, idxVar);

                        hIL.Emit(OpCodes.Br, loopStart);
                        hIL.Append(loopEnd);
                    }
                }

                hIL.Emit(OpCodes.Ldc_I4_1);
                hIL.Emit(OpCodes.Ret);
                hIL.Append(skip);
            }
            hIL.Emit(OpCodes.Ldc_I4_0);
            hIL.Emit(OpCodes.Ret);

            var newSourceVar = new VariableDefinition(entitySourceType);
            openBossBag.Body.Variables.Add(newSourceVar);

            var first = openBossBag.Body.Instructions.First();
            var prepend = new List<Instruction>
            {
                Instruction.Create(OpCodes.Ldarg_0),
                Instruction.Create(OpCodes.Ldarg_1),
                Instruction.Create(OpCodes.Call, getItemSource),
                Instruction.Create(OpCodes.Stloc, newSourceVar),
                Instruction.Create(OpCodes.Ldarg_0),
                Instruction.Create(OpCodes.Ldarg_1),
                Instruction.Create(OpCodes.Ldloc, newSourceVar),
                Instruction.Create(OpCodes.Call, helper),
                Instruction.Create(OpCodes.Pop)
            };
            IL.MethodPrepend(openBossBag, first, prepend);

            foreach (var segment in killSegments)
            {
                foreach (var instr in segment)
                {
                    instr.OpCode = OpCodes.Nop;
                    instr.Operand = null;
                }
            }
            killSegments.Clear();
        }

        private static List<int> ResolvePossibleInts(IList<Instruction> instrs, int index)
        {
            var result = new List<int>();
            if (index < 0 || index >= instrs.Count) return result;

            var instr = instrs[index];
            int constant;
            if (TryGetConstantInt(instr, out constant))
            {
                result.Add(constant);
                return result;
            }

            if (instr.OpCode.Code == Code.Ldloc || instr.OpCode.Code == Code.Ldloc_S ||
                instr.OpCode.Code == Code.Ldloc_0 || instr.OpCode.Code == Code.Ldloc_1 ||
                instr.OpCode.Code == Code.Ldloc_2 || instr.OpCode.Code == Code.Ldloc_3)
            {
                int localIndex = GetLocalIndex(instr);
                for (int i = index - 1; i >= 0; i--)
                {
                    var prev = instrs[i];
                    if (!IsStoreToLocal(prev, localIndex)) continue;

                    if (i > 0 && instrs[i - 1].OpCode == OpCodes.Callvirt &&
                        instrs[i - 1].Operand is MethodReference mr &&
                        mr.Name == "Next" &&
                        mr.DeclaringType.FullName.Contains("UnifiedRandom"))
                    {
                        if (mr.Parameters.Count == 1)
                        {
                            int max;
                            if (TryGetConstantInt(instrs[i - 2], out max))
                            {
                                for (int v = 0; v < max; v++) result.Add(v);
                            }
                        }
                        else if (mr.Parameters.Count == 2)
                        {
                            int min, max;
                            if (TryGetConstantInt(instrs[i - 3], out min) && TryGetConstantInt(instrs[i - 2], out max))
                            {
                                for (int v = min; v < max; v++) result.Add(v);
                            }
                        }
                    }
                    break;
                }
            }

            return result;
        }

        private static bool TryGetConstantInt(Instruction instr, out int value)
        {
            value = 0;
            if (instr == null) return false;
            switch (instr.OpCode.Code)
            {
                case Code.Ldc_I4: value = (int)instr.Operand; return true;
                case Code.Ldc_I4_S: value = (sbyte)instr.Operand; return true;
                case Code.Ldc_I4_M1: value = -1; return true;
                case Code.Ldc_I4_0: value = 0; return true;
                case Code.Ldc_I4_1: value = 1; return true;
                case Code.Ldc_I4_2: value = 2; return true;
                case Code.Ldc_I4_3: value = 3; return true;
                case Code.Ldc_I4_4: value = 4; return true;
                case Code.Ldc_I4_5: value = 5; return true;
                case Code.Ldc_I4_6: value = 6; return true;
                case Code.Ldc_I4_7: value = 7; return true;
                case Code.Ldc_I4_8: value = 8; return true;
                default: return false;
            }
        }

        private static bool IsAnyConstant(Instruction instr)
        {
            int _;
            return TryGetConstantInt(instr, out _);
        }

        private static bool IsAnyConstantOrLocal(Instruction instr)
        {
            return IsAnyConstant(instr) || IsLoadLocal(instr);
        }

        private static bool IsLoadPlayer(Instruction instr)
        {
            return instr != null && (instr.OpCode == OpCodes.Ldarg_0 || instr.OpCode == OpCodes.Ldarg || instr.OpCode == OpCodes.Ldarg_S);
        }

        private static bool IsLoadLocal(Instruction instr)
        {
            if (instr == null) return false;
            switch (instr.OpCode.Code)
            {
                case Code.Ldloc:
                case Code.Ldloc_S:
                case Code.Ldloc_0:
                case Code.Ldloc_1:
                case Code.Ldloc_2:
                case Code.Ldloc_3:
                    return true;
                default:
                    return false;
            }
        }

        private static List<int> CollectConstAssignments(IList<Instruction> instrs, int localIndex)
        {
            var result = new List<int>();
            for (int i = 0; i < instrs.Count - 1; i++)
            {
                if (!IsStoreToLocal(instrs[i], localIndex)) continue;
                int c;
                if (TryGetConstantInt(instrs[i - 1], out c))
                {
                    if (!result.Contains(c)) result.Add(c);
                }
                else if (i >= 3 &&
                         instrs[i - 1].OpCode.Code == Code.Callvirt &&
                         (instrs[i - 1].Operand as MethodReference)?.Name == "get_Item" &&
                         IsLoadLocal(instrs[i - 2]) &&
                         IsLoadLocal(instrs[i - 3]))
                {
                    var listVar = GetLocalIndex(instrs[i - 3]);
                    if (listVar >= 0 && _currentBagListAdds != null && _currentBagListAdds.TryGetValue(listVar, out var elems))
                    {
                        foreach (var e in elems) if (!result.Contains(e)) result.Add(e);
                    }
                }
            }
            return result;
        }

        private static Dictionary<int, List<int>> _currentBagListAdds;

        private static bool IsStoreToLocal(Instruction instr, int localIndex)
        {
            if (instr == null) return false;
            switch (instr.OpCode.Code)
            {
                case Code.Stloc_0: return localIndex == 0;
                case Code.Stloc_1: return localIndex == 1;
                case Code.Stloc_2: return localIndex == 2;
                case Code.Stloc_3: return localIndex == 3;
                case Code.Stloc:
                case Code.Stloc_S:
                    return instr.Operand is VariableDefinition v && v.Index == localIndex;
                default:
                    return false;
            }
        }

        private static bool IsStoreToAnyLocal(Instruction instr)
        {
            if (instr == null) return false;
            switch (instr.OpCode.Code)
            {
                case Code.Stloc:
                case Code.Stloc_S:
                case Code.Stloc_0:
                case Code.Stloc_1:
                case Code.Stloc_2:
                case Code.Stloc_3:
                    return true;
                default:
                    return false;
            }
        }

        private static int GetStoreLocalIndex(Instruction instr)
        {
            if (instr == null) return -1;
            switch (instr.OpCode.Code)
            {
                case Code.Stloc_0: return 0;
                case Code.Stloc_1: return 1;
                case Code.Stloc_2: return 2;
                case Code.Stloc_3: return 3;
                case Code.Stloc:
                case Code.Stloc_S:
                    return (instr.Operand as VariableDefinition)?.Index ?? -1;
                default:
                    return -1;
            }
        }

        private static int GetLocalIndex(Instruction instr)
        {
            switch (instr.OpCode.Code)
            {
                case Code.Ldloc_0: return 0;
                case Code.Ldloc_1: return 1;
                case Code.Ldloc_2: return 2;
                case Code.Ldloc_3: return 3;
                case Code.Ldloc:
                case Code.Ldloc_S:
                    var v = instr.Operand as VariableDefinition;
                    return v != null ? v.Index : -1;
                default:
                    return -1;
            }
        }
    }
}
