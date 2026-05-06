import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Wrench,
  Settings2,
  Sparkles,
  HeartPlus,
  Ghost,
  Gift,
  Search,
  ChevronRight,
  ChevronsRight,
  ChevronLeft,
  ChevronsLeft,
  Puzzle,
  Loader2,
  Package,
  DownloadCloud,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tab =
  | "qol"
  | "combat"
  | "cheats"
  | "buffs"
  | "healing"
  | "spawning"
  | "loot"
  | "plugins";

const ALL_POSSIBLE_BUFFS = [
  "[1] Obsidian Skin",
  "[2] Regeneration",
  "[3] Swiftness",
  "[4] Gills",
  "[5] Ironskin",
  "[6] Mana Regeneration",
  "[7] Magic Power",
  "[8] Featherfall",
  "[9] Spelunker",
  "[10] Invisibility",
  "[11] Shine",
  "[12] Night Owl",
  "[13] Battle",
  "[14] Thorns",
  "[15] Water Walking",
  "[16] Archery",
  "[17] Hunter",
  "[18] Gravitation",
  "[19] Shadow Orb",
  "[20] Poisoned",
  "[21] Potion Sickness",
  "[22] Darkness",
  "[23] Cursed",
  "[24] On Fire!",
  "[25] Tipsy",
  "[26] Well Fed",
  "[27] Fairy (Blue)",
  "[28] Werewolf",
  "[29] Clairvoyance",
  "[30] Bleeding",
  "[31] Confused",
  "[32] Slow",
  "[33] Weak",
  "[34] Merfolk",
  "[35] Silenced",
  "[36] Broken Armor",
  "[37] Horrified",
  "[38] The Tongue",
  "[39] Cursed Inferno",
  "[40] Pet Bunny",
  "[41] Baby Penguin",
  "[42] Pet Turtle",
  "[43] Paladin's Shield",
  "[44] Frostburn",
  "[45] Baby Eater",
  "[46] Chilled",
  "[47] Frozen",
  "[48] Honey",
  "[49] Pygmies",
  "[50] Baby Skeletron Head",
  "[51] Baby Hornet",
  "[52] Tiki Spirit",
  "[53] Pet Lizard",
  "[54] Pet Parrot",
  "[55] Baby Truffle",
  "[56] Pet Sapling",
  "[57] Wisp",
  "[58] Rapid Healing",
  "[59] Holy Protection",
  "[60] Leaf Crystal",
  "[61] Baby Dinosaur",
  "[62] Ice Barrier",
  "[63] Panic!",
  "[64] Baby Slime",
  "[65] Eyeball Spring",
  "[66] Baby Snowman",
  "[67] Burning",
  "[68] Suffocation",
  "[69] Ichor",
  "[70] Acid Venom",
  "[71] Weapon Imbue: Acid Venom",
  "[72] Midas",
  "[73] Weapon Imbue: Cursed Flames",
  "[74] Weapon Imbue: Fire",
  "[75] Weapon Imbue: Gold",
  "[76] Weapon Imbue: Ichor",
  "[77] Weapon Imbue: Nanites",
  "[78] Weapon Imbue: Confetti",
  "[79] Weapon Imbue: Poison",
  "[80] Blackout",
  "[81] Pet Spider",
  "[82] Squashling",
  "[83] Ravens",
  "[84] Black Cat",
  "[85] Cursed Sapling",
  "[86] Water Candle",
  "[87] Cozy Fire",
  "[88] Chaos State",
  "[89] Heart Lamp",
  "[90] Rudolph",
  "[91] Puppy",
  "[92] Baby Grinch",
  "[93] Ammo Box",
  "[94] Mana Sickness",
  "[95] Beetle Endurance (15%)",
  "[96] Beetle Endurance (30%)",
  "[97] Beetle Endurance (45%)",
  "[98] Beetle Might (10%)",
  "[99] Beetle Might (20%)",
  "[100] Beetle Might (30%)",
  "[101] Fairy (Red)",
  "[102] Fairy (Green)",
  "[103] Wet",
  "[104] Mining",
  "[105] Heartreach",
  "[106] Calm",
  "[107] Builder",
  "[108] Titan",
  "[109] Flipper",
  "[110] Summoning",
  "[111] Dangersense",
  "[112] Ammo Reservation",
  "[113] Lifeforce",
  "[114] Endurance",
  "[115] Rage",
  "[116] Inferno",
  "[117] Wrath",
  "[118] Minecart (Left)",
  "[119] Lovestruck",
  "[120] Stinky",
  "[121] Fishing",
  "[122] Sonar",
  "[123] Crate",
  "[124] Warmth",
  "[125] Hornet",
  "[126] Imp",
  "[127] Zephyr Fish",
  "[128] Bunny Mount",
  "[129] Pigron Mount",
  "[130] Slime Mount",
  "[131] Turtle Mount",
  "[132] Bee Mount",
  "[133] Spider",
  "[134] Twins",
  "[135] Pirate",
  "[136] Mini Minotaur",
  "[137] Slime",
  "[138] Minecart (Right)",
  "[139] Sharknado",
  "[140] UFO",
  "[141] UFO Mount",
  "[142] Drill Mount",
  "[143] Scutlix Mount",
  "[144] Electrified",
  "[145] Moon Bite",
  "[146] Happy!",
  "[147] Banner",
  "[148] Feral Bite",
  "[149] Webbed",
  "[150] Bewitched",
  "[151] Life Drain",
  "[152] Magic Lantern",
  "[153] Shadowflame",
  "[154] Baby Face Monster",
  "[155] Crimson Heart",
  "[156] Stoned",
  "[157] Peace Candle",
  "[158] Star in a Bottle",
  "[159] Sharpened",
  "[160] Dazed",
  "[161] Deadly Sphere",
  "[162] Unicorn Mount",
  "[163] Obstructed",
  "[164] Distorted",
  "[165] Dryad's Blessing",
  "[166] Minecart (Mechanical (Right))",
  "[167] Minecart (Mechanical (Left))",
  "[168] Cute Fishron Mount",
  "[169] Penetrated",
  "[170] Solar Blaze (1 stack)",
  "[171] Solar Blaze (2 stacks)",
  "[172] Solar Blaze (3 stacks)",
  "[173] Life Nebula (1 stack)",
  "[174] Life Nebula (2 stacks)",
  "[175] Life Nebula (3 stacks)",
  "[176] Mana Nebula (1 stack)",
  "[177] Mana Nebula (2 stacks)",
  "[178] Mana Nebula (3 stacks)",
  "[179] Damage Nebula (1 stack)",
  "[180] Damage Nebula (2 stacks)",
  "[181] Damage Nebula (3 stacks)",
  "[182] Stardust Cell (Stardust Minion)",
  "[183] Celled",
  "[184] Minecart (Wooden (Right))",
  "[185] Minecart (Wooden (Left))",
  "[186] Dryad's Bane",
  "[187] Stardust Guardian",
  "[188] Stardust Dragon",
  "[189] Daybroken",
  "[190] Suspicious Looking Eye",
  "[191] Companion Cube",
  "[192] Sugar Rush",
  "[193] Basilisk Mount",
  "[194] Mighty Wind",
  "[195] Withered Armor",
  "[196] Withered Weapon",
  "[197] Oozed",
  "[198] Striking Moment",
  "[199] Creative Shock",
  "[200] Propeller Gato",
  "[201] Flickerwick",
  "[202] Hoardagron",
  "[203] Betsy's Curse",
  "[204] Oiled",
  "[205] Ballista Panic!",
  "[206] Plenty Satisfied",
  "[207] Exquisitely Stuffed",
  "[208] Minecart (Desert (Right))",
  "[209] Minecart (Desert (Left))",
  "[210] Minecart (Minecarp (Right))",
  "[211] Minecart (Minecarp (Left))",
  "[212] Golf Cart",
  "[213] Sanguine Bat",
  "[214] Vampire Frog",
  "[215] The Bast Defense",
  "[216] Baby Finch",
  "[217] Estee",
  "[218] Sugar Glider",
  "[219] Shark Pup",
  "[220] Minecart (Bee (Right))",
  "[221] Minecart (Bee (Left))",
  "[222] Minecart (Ladybug (Right))",
  "[223] Minecart (Ladybug (Left))",
  "[224] Minecart (Pigron (Right))",
  "[225] Minecart (Pigron (Left))",
  "[226] Minecart (Sunflower (Right))",
  "[227] Minecart (Sunflower (Left))",
  "[228] Minecart (Demonic Hellcart (Right))",
  "[229] Minecart (Demonic Hellcart (Left))",
  "[230] Witch's Broom",
  "[231] Minecart (Shroom (Right))",
  "[232] Minecart (Shroom (Left))",
  "[233] Minecart (Amethyst (Right))",
  "[234] Minecart (Amethyst (Left))",
  "[235] Minecart (Topaz (Right))",
  "[236] Minecart (Topaz (Left))",
  "[237] Minecart (Sapphire (Right))",
  "[238] Minecart (Sapphire (Left))",
  "[239] Minecart (Emerald (Right))",
  "[240] Minecart (Emerald (Left))",
  "[241] Minecart (Ruby (Right))",
  "[242] Minecart (Ruby (Left))",
  "[243] Minecart (Diamond (Right))",
  "[244] Minecart (Diamond (Left))",
  "[245] Minecart (Amber (Right))",
  "[246] Minecart (Amber (Left))",
  "[247] Minecart (Beetle (Right))",
  "[248] Minecart (Beetle (Left))",
  "[249] Minecart (Meowmere (Right))",
  "[250] Minecart (Meowmere (Left))",
  "[251] Minecart (Party (Right))",
  "[252] Minecart (Party (Left))",
  "[253] Minecart (The Dutchman (Right))",
  "[254] Minecart (The Dutchman (Left))",
  "[255] Minecart (Steampunk (Right))",
  "[256] Minecart (Steampunk (Left))",
  "[257] Lucky",
  "[258] Lil' Harpy",
  "[259] Fennec Fox",
  "[260] Glittery Butterfly",
  "[261] Baby Imp",
  "[262] Baby Red Panda",
  "[263] Desert Tiger",
  "[264] Plantero",
  "[265] Flamingo",
  "[266] Dynamite Kitten",
  "[267] Baby Werewolf",
  "[268] Shadow Mimic",
  "[269] Minecart (Coffin (Right))",
  "[270] Minecart (Coffin (Left))",
  "[271] Enchanted Daggers",
  "[272] Digging Molecart (Left)",
  "[273] Digging Molecart (Right)",
  "[274] Volt Bunny",
  "[275] Painted Horse Mount",
  "[276] Majestic Horse Mount",
  "[277] Dark Horse Mount",
  "[278] Pogo Stick Mount",
  "[279] Pirate Ship Mount",
  "[280] Tree Mount",
  "[281] Santank Mount",
  "[282] Goat Mount",
  "[283] Book Mount",
  "[284] Slime Prince",
  "[285] Suspicious Eye",
  "[286] Eater of Worms",
  "[287] Spider Brain",
  "[288] Skeletron Jr.",
  "[289] Honey Bee",
  "[290] Destroyer-Lite",
  "[291] Rez and Spaz",
  "[292] Mini Prime",
  "[293] Plantera Seedling",
  "[294] Toy Golem",
  "[295] Tiny Fishron",
  "[296] Phantasmal Dragon",
  "[297] Moonling",
  "[298] Fairy Princess",
  "[299] Jack 'O Lantern",
  "[300] Everscream Sapling",
  "[301] Ice Queen",
  "[302] Alien Skater",
  "[303] Baby Ogre",
  "[304] Itsy Betsy",
  "[305] Lava Shark Mount",
  "[306] Titanium Barrier",
  "[307]",
  "[308] Durendal's Blessing",
  "[309]",
  "[310]",
  "[311] Harvest Time",
  "[312] A Nice Buff",
  "[313]",
  "[314] Jungle's Fury",
  "[315]",
  "[316]",
  "[317] Slime Princess",
  "[318] Winged Slime Mount",
  "[319]",
  "[320] Sparkle Slime",
  "[321] Cerebral Mindtrick",
  "[322] Terraprisma",
  "[323] Hellfire",
  "[324] Frostbite",
  "[325] Flinx",
  "[326]",
  "[327] Bernie",
  "[328] Glommer",
  "[329] Tiny Deerclops",
  "[330] Pig",
  "[331] Chester",
  "[332] Peckish",
  "[333] Hungry",
  "[334] Starving",
  "[335] Abigail",
  "[336] Hearty Meal",
  "[337]",
  "[338] Fart Kart",
  "[339] Fart Kart",
  "[340]",
  "[341] Slime Royals",
  "[342] Blessing of the Moon",
  "[343] Biome Sight",
  "[344] Blood Butchered",
  "[345] Junimo",
  "[346] Terra Fart Kart",
  "[347] Terra Fart Kart",
  "[348] Strategist",
  "[349] Blue Chicken",
  "[350] Shadow Candle",
  "[351] Spiffo",
  "[352] Caveling Gardener",
  "[353] Shimmering",
  "[354] The Dirtiest Block",
];

interface PatchOptionsState {
  steamFix: boolean;
  time: boolean;
  social: boolean;
  range: boolean;
  pylon: boolean;
  angler: boolean;
  rod: boolean;
  potion: boolean;
  mana: boolean;
  drowning: boolean;
  ohk: boolean;
  ammo: boolean;
  wings: boolean;
  cloud: boolean;
  bossBagsLoot: boolean;
  vampiricHealing: number;
  spectreHealing: number;
  spawnRateVoodoo: number;
  activeBuffs: string[];
}

const DEFAULT_OPTIONS: PatchOptionsState = {
  steamFix: false,
  time: false,
  social: false,
  range: false,
  pylon: false,
  angler: false,
  rod: false,
  potion: false,
  mana: false,
  drowning: false,
  ohk: false,
  ammo: false,
  wings: false,
  cloud: false,
  bossBagsLoot: false,
  vampiricHealing: 7.5,
  spectreHealing: 20.0,
  spawnRateVoodoo: 15,
  activeBuffs: [],
};

export default function PatcherPage() {
  const [activeTab, setActiveTab] = useState<Tab>("qol");
  const { t } = useTranslation();

  // Main patch options state
  const [options, setOptions] = useState<PatchOptionsState>(DEFAULT_OPTIONS);
  const [isSyncing, setIsSyncing] = useState(false);

  // workflow state for patching dialog
  const [patchStage, setPatchStage] = useState<
    | "idle"
    | "checking"
    | "restorePrompt"
    | "restoreSuccess"
    | "backupPrompt"
    | "backupSuccess"
    | "patching"
    | "done"
    | "error"
  >("idle");
  const isPatching = patchStage !== "idle";
  const [patchError, setPatchError] = useState<string | null>(null);

  // Warning Modals
  const [showAnglerWarning, setShowAnglerWarning] = useState(false);

  // information about existing backup (used in restorePrompt warning)
  const [backupInfo, setBackupInfo] = useState<{
    hasBackup: boolean;
    exeVersion: string | null;
    bakVersion: string | null;
  } | null>(null);

  const [patchMessage, setPatchMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Buff selection state (derived from options.activeBuffs)
  const [availableBuffs, setAvailableBuffs] = useState<string[]>([]);
  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(
    new Set(),
  );
  const [selectedActive, setSelectedActive] = useState<Set<string>>(new Set());
  const [searchAvailable, setSearchAvailable] = useState("");
  const [searchActive, setSearchActive] = useState("");

  const [pluginsList, setPluginsList] = useState<string[]>([]);
  const [activePlugins, setActivePlugins] = useState<string[]>([]);
  const [pluginSupport, setPluginSupport] = useState(false);

  // Load config from store
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const stored = (await window.api.config.get(
          "patchOptions",
        )) as PatchOptionsState | null;
        if (stored) {
          setOptions({ ...DEFAULT_OPTIONS, ...stored });
          const active = stored.activeBuffs || DEFAULT_OPTIONS.activeBuffs;
          setAvailableBuffs(
            ALL_POSSIBLE_BUFFS.filter((b) => !active.includes(b)),
          );
        } else {
          setAvailableBuffs(
            ALL_POSSIBLE_BUFFS.filter(
              (b) => !DEFAULT_OPTIONS.activeBuffs.includes(b),
            ),
          );
        }

        const availablePlugins = await window.api.plugins.list();
        setPluginsList(availablePlugins);

        const storeSupport = (await window.api.config.get(
          "pluginSupport",
        )) as boolean;
        setPluginSupport(storeSupport || false);

        const activePlug = (await window.api.config.get("activePlugins")) as
          | string[]
          | undefined;

        // Sanitize out any stray strings (like buffs) that might have been saved previously.
        const sanitizedPlugins = (activePlug || []).filter((p) =>
          availablePlugins.includes(p),
        );
        setActivePlugins(sanitizedPlugins);

        // If the store was dirty, auto-clean it
        if (activePlug && activePlug.length !== sanitizedPlugins.length) {
          window.api.config
            .set("activePlugins", sanitizedPlugins)
            .catch(console.error);
        }
      } catch (err) {
        console.error("Failed to load patch options:", err);
        setAvailableBuffs(
          ALL_POSSIBLE_BUFFS.filter(
            (b) => !DEFAULT_OPTIONS.activeBuffs.includes(b),
          ),
        );
      }
    };
    loadOptions();
  }, []);

  // Persist options to store whenever they change
  const persistOptions = useCallback(async (newOptions: PatchOptionsState) => {
    try {
      await window.api.config.set("patchOptions", newOptions);
    } catch (err) {
      console.error("Failed to persist options:", err);
    }
  }, []);

  const togglePlugin = async (pluginName: string, checked: boolean) => {
    let newActivePlugins = [...activePlugins];
    if (checked) {
      if (!newActivePlugins.includes(pluginName)) {
        newActivePlugins.push(pluginName);
      }
    } else {
      newActivePlugins = newActivePlugins.filter((p) => p !== pluginName);
    }

    setActivePlugins(newActivePlugins);
    await window.api.config.set("activePlugins", newActivePlugins);
  };

  // Helper to update a single boolean option
  const setOption = useCallback(
    (key: keyof PatchOptionsState, value: boolean | number | string[]) => {
      setOptions((prev) => {
        const updated = { ...prev, [key]: value };

        // Mutually exclusive features
        if (key === "wings" && value === true) {
          updated.cloud = false;
        } else if (key === "cloud" && value === true) {
          updated.wings = false;
        }

        persistOptions(updated);
        return updated;
      });
    },
    [persistOptions],
  );

  const handleSettingChange = (
    id: keyof PatchOptionsState,
    checked: boolean,
  ) => {
    if (id === "angler" && checked) {
      setShowAnglerWarning(true);
    }
    setOption(id, checked);
  };

  // Extract buff IDs from strings like "[147] Banner" -> 147
  const extractBuffIds = (buffStrings: string[]): number[] => {
    return buffStrings
      .map((s) => {
        const match = s.match(/^\[(\d+)\]/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((id): id is number => id !== null);
  };

  // Patch handler
  const handlePatch = async () => {
    setPatchStage("checking");
    setPatchMessage(null);
    setPatchError(null);

    try {
      const terrariaPath = (await window.api.config.get(
        "terrariaPath",
      )) as string;
      if (!terrariaPath) {
        setPatchStage("error");
        setPatchError(
          t(
            "patcher.errors.noPath",
            "No Terraria path configured. Go to Config to set it.",
          ),
        );
        return;
      }

      // Verify clean executable to prevent double-patching
      const verifyResult = await window.api.patcher.verifyClean(terrariaPath);
      if (!verifyResult.safe) {
        setPatchStage("error");
        setPatchError(
          verifyResult.key
            ? t(verifyResult.key, verifyResult.message!)
            : verifyResult.message || "Executable already patched error",
        );
        return;
      }

      // Check for backup
      const checkResult = await window.api.patcher.checkBackup(terrariaPath);
      setBackupInfo(checkResult);

      if (checkResult.hasBackup) {
        setPatchStage("restorePrompt");
      } else {
        setPatchStage("backupPrompt");
      }
    } catch (err) {
      setPatchStage("error");
      setPatchError(String(err));
    }
  };

  const handleSyncPlugins = async () => {
    setIsSyncing(true);
    setPatchMessage(null);
    setPatchError(null);
    try {
      const terrariaPath = (await window.api.config.get(
        "terrariaPath",
      )) as string;
      if (!terrariaPath) {
        setPatchStage("error");
        setPatchError(
          t(
            "patcher.errors.noPath",
            "No Terraria path configured. Go to Config to set it.",
          ),
        );
        return;
      }

      const aPlugins =
        ((await window.api.config.get("activePlugins")) as string[]) || [];
      const result = await window.api.patcher.syncPlugins({
        terrariaPath,
        activePlugins: aPlugins,
      });

      if (result.success) {
        setPatchMessage({
          type: "success",
          text: t(
            result.key || "patcher.messages.pluginsSynced",
            "Plugins synced successfully!",
          ),
        });
      } else {
        setPatchStage("error");
        setPatchError(
          t(
            result.key || "patcher.messages.error",
            result.args?.error || "Error syncing plugins",
          ),
        );
      }
    } catch (err) {
      setPatchStage("error");
      setPatchError(String(err));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreBackup = async (restore: boolean) => {
    try {
      if (restore) {
        setPatchStage("checking"); // Show checking while restoring
        const terrariaPath = (await window.api.config.get(
          "terrariaPath",
        )) as string;
        const result = await window.api.patcher.restoreBackup(terrariaPath);
        if (!result.success) {
          setPatchStage("error");
          setPatchError(
            result.key ? t(result.key, result.args) : "Restore failed",
          );
          return;
        }

        setPatchMessage({
          type: "success",
          text: t(
            result.key || "patcher.messages.restoreSuccess",
            "Backup restored successfully.",
          ),
        });
        setPatchStage("restoreSuccess");
        return;
      }
      setPatchStage("backupPrompt");
    } catch (err) {
      setPatchStage("error");
      setPatchError(String(err));
    }
  };

  const handleCreateBackup = async (createBackup: boolean) => {
    try {
      const terrariaPath = (await window.api.config.get("terrariaPath")) as string;
      if (createBackup) {
        setPatchStage("patching"); // Let UI show patching/backup
        const backupResult = await window.api.patcher.backup(terrariaPath);
        if (!backupResult.success) {
          setPatchStage("error");
          setPatchError(
            backupResult.key
              ? t(backupResult.key, backupResult.args)
              : "Backup failed",
          );
          return;
        }

        setPatchMessage({
          type: "success",
          text: backupResult.key
            ? t(backupResult.key, backupResult.args)
            : t("patcher.messages.backupSuccess", backupResult.args),
        });
        setPatchStage("backupSuccess");
        return;
      }

      await runPatcher(terrariaPath);
    } catch (err) {
      setPatchStage("error");
      setPatchError(String(err));
    }
  };

  const handleProceedToPatch = async () => {
    try {
      const terrariaPath = (await window.api.config.get("terrariaPath")) as string;
      await runPatcher(terrariaPath);
    } catch (err) {
      setPatchStage("error");
      setPatchError(String(err));
    }
  };

  const runPatcher = async (terrariaPath: string) => {
    try {
      // Proceed to patch
      setPatchStage("patching");

      const pluginSupport =
        (await window.api.config.get("pluginSupport")) || false;
      const activePlugins =
        (await window.api.config.get("activePlugins")) || [];

      const patcherInput = {
        terrariaPath,
        options: {
          DisplayTime: options.time,
          FunctionalSocialSlots: options.social,
          MaxCraftingRange: options.range,
          PylonEverywhere: options.pylon,
          RemoveAnglerQuestLimit: options.angler,
          RemoveDiscordBuff: options.rod,
          RemovePotionSickness: options.potion,
          RemoveManaCost: options.mana,
          RemoveDrowning: options.drowning,
          OneHitKill: options.ohk,
          InfiniteAmmo: options.ammo,
          PermanentWings: options.wings,
          InfiniteCloudJumps: options.cloud,
          BossBagsDropAllLoot: options.bossBagsLoot,
          VampiricHealing: options.vampiricHealing,
          SpectreHealing: options.spectreHealing,
          SpawnRateVoodoo: options.spawnRateVoodoo,
          PermanentBuffs: extractBuffIds(options.activeBuffs),
          SteamFix: options.steamFix || false,
          Plugins: pluginSupport,
          activePlugins: activePlugins,
        },
      };

      const result = await window.api.patcher.run(patcherInput);
      if (result.success) {
        setPatchStage("done");
        setPatchMessage({
          type: "success",
          text: result.key ? t(result.key, result.args) : "Success",
        });
      } else {
        setPatchStage("error");
        setPatchError(
          result.key ? t(result.key, result.args) : "Unknown patch error",
        );
      }
    } catch (err) {
      setPatchStage("error");
      const msg = err instanceof Error ? err.message : String(err);
      setPatchError(BaseErrorMessage(msg));
    }
  };

  function BaseErrorMessage(msg: string) {
    return t("patcher.errors.unexpected", "Unexpected error: ") + msg;
  }

  // Buff transfer handlers
  const toggleAvailable = (buff: string) => {
    const newSet = new Set(selectedAvailable);
    if (newSet.has(buff)) newSet.delete(buff);
    else newSet.add(buff);
    setSelectedAvailable(newSet);
  };

  const toggleActive = (buff: string) => {
    const newSet = new Set(selectedActive);
    if (newSet.has(buff)) newSet.delete(buff);
    else newSet.add(buff);
    setSelectedActive(newSet);
  };

  const filteredAvailable = availableBuffs.filter((b) =>
    b.toLowerCase().includes(searchAvailable.toLowerCase()),
  );
  const filteredActive = options.activeBuffs.filter((b) =>
    b.toLowerCase().includes(searchActive.toLowerCase()),
  );

  const handleAddSelected = () => {
    const newActive = [
      ...options.activeBuffs,
      ...Array.from(selectedAvailable),
    ];
    setAvailableBuffs((prev) => prev.filter((b) => !selectedAvailable.has(b)));
    setSelectedAvailable(new Set());
    setOption("activeBuffs", newActive);
  };

  const handleRemoveSelected = () => {
    setAvailableBuffs((prev) => [...prev, ...Array.from(selectedActive)]);
    const newActive = options.activeBuffs.filter((b) => !selectedActive.has(b));
    setSelectedActive(new Set());
    setOption("activeBuffs", newActive);
  };

  const handleAddAll = () => {
    const newActive = [...options.activeBuffs, ...filteredAvailable];
    setAvailableBuffs((prev) =>
      prev.filter((b) => !filteredAvailable.includes(b)),
    );
    setSelectedAvailable(new Set());
    setOption("activeBuffs", newActive);
  };

  const handleRemoveAll = () => {
    setAvailableBuffs((prev) => [...prev, ...filteredActive]);
    const newActive = options.activeBuffs.filter(
      (b) => !filteredActive.includes(b),
    );
    setSelectedActive(new Set());
    setOption("activeBuffs", newActive);
  };

  // Settings arrays with controlled checked state
  const qolSettings = [
    {
      id: "time" as const,
      label: t("patcher.features.qol.time.label"),
      description: t("patcher.features.qol.time.desc"),
    },
    {
      id: "social" as const,
      label: t("patcher.features.qol.social.label"),
      description: t("patcher.features.qol.social.desc"),
    },
    {
      id: "range" as const,
      label: t("patcher.features.qol.range.label"),
      description: t("patcher.features.qol.range.desc"),
    },
    {
      id: "pylon" as const,
      label: t("patcher.features.qol.pylon.label"),
      description: t("patcher.features.qol.pylon.desc"),
    },
    {
      id: "angler" as const,
      label: t("patcher.features.qol.angler.label"),
      description: t("patcher.features.qol.angler.desc"),
    },
  ];

  const combatSettings = [
    {
      id: "rod" as const,
      label: t("patcher.features.combat.rod.label"),
      description: t("patcher.features.combat.rod.desc"),
    },
    {
      id: "potion" as const,
      label: t("patcher.features.combat.potion.label"),
      description: t("patcher.features.combat.potion.desc"),
    },
    {
      id: "mana" as const,
      label: t("patcher.features.combat.mana.label"),
      description: t("patcher.features.combat.mana.desc"),
    },
    {
      id: "drowning" as const,
      label: t("patcher.features.combat.drowning.label"),
      description: t("patcher.features.combat.drowning.desc"),
    },
  ];

  const cheatSettings = [
    {
      id: "ohk" as const,
      label: t("patcher.features.cheats.ohk.label"),
      description: t("patcher.features.cheats.ohk.desc"),
    },
    {
      id: "ammo" as const,
      label: t("patcher.features.cheats.ammo.label"),
      description: t("patcher.features.cheats.ammo.desc"),
    },
    {
      id: "wings" as const,
      label: t("patcher.features.cheats.wings.label"),
      description: t("patcher.features.cheats.wings.desc"),
    },
    {
      id: "cloud" as const,
      label: t("patcher.features.cheats.cloud.label"),
      description: t("patcher.features.cheats.cloud.desc"),
    },
  ];

  const tabs = [
    { id: "qol", label: t("patcher.tabs.qol"), icon: Settings2 },
    { id: "combat", label: t("patcher.tabs.combat"), icon: Settings2 },
    { id: "cheats", label: t("patcher.tabs.cheats"), icon: Settings2 },
    { id: "buffs", label: t("patcher.tabs.buffs"), icon: Sparkles },
    { id: "healing", label: t("patcher.tabs.healing"), icon: HeartPlus },
    { id: "spawning", label: t("patcher.tabs.spawning"), icon: Ghost },
    { id: "loot", label: t("patcher.tabs.loot"), icon: Gift },
  ];

  const pluginTabs = [
    { id: "plugins", label: t("plugins.title", "Plugins"), icon: Puzzle },
  ];

  // Reusable setting checkbox component
  const SettingCheckbox = ({
    setting,
  }: {
    setting: {
      id: keyof PatchOptionsState;
      label: string;
      description: string;
    };
  }) => {
    const checked = options[setting.id] as boolean;
    return (
      <div
        className={cn(
          "flex items-start gap-3 p-3.5 border rounded-lg transition-colors cursor-pointer",
          checked
            ? "border-primary/30 bg-primary/5"
            : "border-border/60 bg-card/50 hover:bg-muted/30",
        )}
        onClick={() => handleSettingChange(setting.id, !checked)}>
        <Checkbox
          id={setting.id}
          checked={checked}
          onCheckedChange={(v) => handleSettingChange(setting.id, v === true)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0"
        />
        <div className="space-y-1 leading-none min-w-0">
          <Label htmlFor={setting.id} className="text-sm font-medium cursor-pointer">
            {setting.label}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {setting.description}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <span className="text-primary select-none">&gt;_</span>
            {t("patcher.title", "Game Modifications")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 pl-6 font-mono">
            {t(
              "patcher.description",
              "Configure standalone patches to apply directly to the Terraria executable.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {patchMessage && (
            <span
              className={cn(
                "text-sm max-w-xs truncate animate-in fade-in duration-300",
                patchMessage.type === "success"
                  ? "text-primary"
                  : "text-destructive",
              )}>
              {patchMessage.text}
            </span>
          )}
          {pluginSupport && (
            <Button
              variant="secondary"
              className="gap-2"
              onClick={handleSyncPlugins}
              disabled={isPatching || isSyncing || patchStage !== "idle"}>
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Puzzle className="h-4 w-4" />
              )}
              {isSyncing
                ? t("patcher.syncing", "Syncing...")
                : t("patcher.syncBtn", "Sync Plugins Only")}
            </Button>
          )}
          <Button
            className="gap-2"
            onClick={handlePatch}
            disabled={isPatching || isSyncing || patchStage !== "idle"}>
            {isPatching || patchStage !== "idle" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            {isPatching || patchStage !== "idle"
              ? t("patcher.patching", "Patching...")
              : t("patcher.patchBtn", "Patch & Save")}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 flex flex-col gap-2 shrink-0">
          <Card className="shadow-none border-border/50 bg-muted/10">
            <CardContent className="p-2 flex flex-col gap-0.5">
              <div className="text-[9px] font-bold text-primary/50 uppercase tracking-widest mb-1.5 px-2 mt-2 font-mono">
                // {t("patcher.title", "Modifications")}
              </div>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-mono font-medium transition-all duration-200 outline-none",
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-l-primary pl-2.5"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border-l-2 border-l-transparent pl-2.5",
                    )}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}

              <div className="my-2 border-t border-border/40" />

              <div className="text-[9px] font-bold text-primary/50 uppercase tracking-widest mb-1.5 px-2 mt-1 font-mono">
                // {t("patcher.external", "External")}
              </div>
              {pluginTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={cn(
                      "flex items-center gap-2.5 w-full px-3 py-2 text-xs font-mono font-medium transition-all duration-200 outline-none",
                      isActive
                        ? "bg-primary/10 text-primary border-l-2 border-l-primary pl-2.5"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border-l-2 border-l-transparent pl-2.5",
                    )}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {tab.label}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <div className="mt-auto hidden md:block border border-primary/20 bg-primary/5 p-3">
            <p className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
              <span className="text-primary/50 select-none">// </span>
              {t(
                "patcher.pathAlert",
                "Make sure your Terraria path is correctly set in the Config page before patching.",
              )}
            </p>
          </div>
        </div>

        {/* Dynamic Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-card border border-l-2 border-l-primary/30">
          {activeTab === "qol" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
                    {t("patcher.tabs.qol")}
                  </h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.tabsDescriptions.qol")}</p>
                </div>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {qolSettings.map((setting) => (
                    <SettingCheckbox key={setting.id} setting={setting} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === "combat" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("patcher.tabs.combat")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.tabsDescriptions.combat")}</p>
                </div>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {combatSettings.map((setting) => (
                    <SettingCheckbox key={setting.id} setting={setting} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === "cheats" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("patcher.tabs.cheats")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.tabsDescriptions.cheats")}</p>
                </div>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cheatSettings.map((setting) => (
                    <SettingCheckbox key={setting.id} setting={setting} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === "buffs" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("patcher.tabs.buffs")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.tabsDescriptions.buffs")}</p>
                </div>
              </div>
              <div className="flex-1 p-6 flex flex-col gap-4 min-h-0">
                {/* Search Bars */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("patcher.tabs.searchAvailable")}
                      value={searchAvailable}
                      onChange={(e) => setSearchAvailable(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="w-12 shrink-0"></div>
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("patcher.tabs.searchActive")}
                      value={searchActive}
                      onChange={(e) => setSearchActive(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Dual Listbox Layout */}
                <div className="flex flex-1 gap-4 min-h-0">
                  <div className="flex-1 border flex flex-col overflow-hidden">
                    <div className="bg-muted/40 px-3 py-2 border-b text-[10px] font-mono font-bold text-muted-foreground tracking-widest uppercase">
                      {t("patcher.tabs.available")} ({filteredAvailable.length})
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-0.5">
                        {filteredAvailable.map((buff) => (
                          <div
                            key={buff}
                            onClick={() => toggleAvailable(buff)}
                            className={cn(
                              "text-sm px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors",
                              selectedAvailable.has(buff)
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-accent text-foreground",
                            )}>
                            {buff}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Transfer Buttons */}
                  <div className="flex flex-col justify-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      title={t("patcher.buffTransfer.addAll", "Add All")}
                      onClick={handleAddAll}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title={t("patcher.buffTransfer.addSelected", "Add Selected")}
                      onClick={handleAddSelected}
                      disabled={selectedAvailable.size === 0}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title={t(
                        "patcher.buffTransfer.removeSelected",
                        "Remove Selected",
                      )}
                      onClick={handleRemoveSelected}
                      disabled={selectedActive.size === 0}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title={t("patcher.buffTransfer.removeAll", "Remove All")}
                      onClick={handleRemoveAll}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 border border-l-2 border-l-primary/40 flex flex-col overflow-hidden">
                    <div className="bg-muted/40 px-3 py-2 border-b text-[10px] font-mono font-bold text-primary tracking-widest uppercase flex justify-between">
                      <span>{t("patcher.tabs.buffsActive")}</span>
                      <span>{options.activeBuffs.length} / 22</span>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-2 space-y-0.5">
                        {filteredActive.map((buff) => (
                          <div
                            key={buff}
                            onClick={() => toggleActive(buff)}
                            className={cn(
                              "text-sm px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors",
                              selectedActive.has(buff)
                                ? "bg-destructive text-destructive-foreground"
                                : "hover:bg-destructive/10 hover:text-destructive text-foreground",
                            )}>
                            {buff}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "healing" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("patcher.tabs.healing")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.healing.desc")}</p>
                </div>
              </div>
              <div className="p-6 max-w-xl space-y-6">
                <div className="space-y-3">
                  <Label className="text-base">
                    {t("patcher.healing.vampiric")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("patcher.healing.default", { value: "7.5" })}
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={options.vampiricHealing}
                      step={0.1}
                      className="w-32"
                      onChange={(e) =>
                        setOption(
                          "vampiricHealing",
                          parseFloat(e.target.value) || 7.5,
                        )
                      }
                    />
                    <span className="text-sm font-medium">%</span>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-base">
                    {t("patcher.healing.spectre")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("patcher.healing.default", { value: "20.0" })}
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={options.spectreHealing}
                      step={0.1}
                      className="w-32"
                      onChange={(e) =>
                        setOption(
                          "spectreHealing",
                          parseFloat(e.target.value) || 20.0,
                        )
                      }
                    />
                    <span className="text-sm font-medium">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "spawning" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("patcher.tabs.spawning")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.spawning.desc")}</p>
                </div>
              </div>
              <div className="p-6 max-w-xl space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-base">
                      {t("patcher.tabs.voodooDemon")}
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("patcher.spawning.voodooDesc")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Input
                      type="number"
                      value={options.spawnRateVoodoo}
                      min={0}
                      max={100}
                      className="w-32"
                      onChange={(e) =>
                        setOption(
                          "spawnRateVoodoo",
                          parseInt(e.target.value, 10) || 15,
                        )
                      }
                    />
                    <span className="text-sm font-medium">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "loot" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("patcher.tabs.loot")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("patcher.lootFeature.desc")}</p>
                </div>
              </div>
              <div className="p-6">
                <div
                  className={cn(
                    "flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition-colors",
                    options.bossBagsLoot
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/60 bg-card/50 hover:bg-muted/30",
                  )}
                  onClick={() => setOption("bossBagsLoot", !options.bossBagsLoot)}>
                  <Checkbox
                    id="boss-bags-loot"
                    checked={options.bossBagsLoot}
                    onCheckedChange={(checked) => setOption("bossBagsLoot", checked === true)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="space-y-1 leading-none min-w-0">
                    <Label htmlFor="boss-bags-loot" className="text-sm font-medium cursor-pointer">
                      {t("patcher.lootFeature.treasureBags")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("patcher.lootFeature.treasureBagsDesc")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "plugins" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="px-5 py-3 border-b bg-muted/10 flex items-center gap-2.5">
                <div className="h-4 w-[2px] bg-primary/50 shrink-0" />
                <div>
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{t("plugins.title", "Plugins")}</h3>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">{t("plugins.subtitle", "Browse, enable, and configure plugins")}</p>
                </div>
              </div>
              <div
                className={cn(
                  "p-0 flex-1 flex flex-col min-h-0",
                  pluginsList.length === 0 &&
                    "items-center justify-center text-center space-y-3",
                )}>
                {pluginsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <Package className="h-12 w-12 text-muted-foreground/30" />
                    <h2 className="text-lg font-medium text-muted-foreground">
                      {t("plugins.emptyState.title", "No plugins loaded")}
                    </h2>
                    <p className="text-sm text-muted-foreground/70 max-w-md">
                      {t(
                        "plugins.emptyState.desc",
                        "This section lists all available plugins located in resources/plugins dir.",
                      )}
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-full w-full">
                    <div className="p-6 space-y-2">
                      <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground px-2">
                        <DownloadCloud className="h-4 w-4" />
                        {t("plugins.listTitle", "Available Plugins")} (
                        {activePlugins.length} / {pluginsList.length}{" "}
                        {t("plugins.activeLabel", "active")})
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {pluginsList.map((plugin) => (
                          <div
                            key={plugin}
                            className={cn(
                              "flex flex-row items-center space-x-3 p-4 border text-left transition-all",
                              activePlugins.includes(plugin) && pluginSupport
                                ? "border-primary/50 border-l-2 border-l-primary bg-primary/5"
                                : "border-border/50 hover:bg-accent/50",
                              pluginSupport
                                ? "cursor-pointer"
                                : "opacity-50 grayscale cursor-not-allowed",
                            )}
                            onClick={() => {
                              if (!pluginSupport) return;
                              togglePlugin(
                                plugin,
                                !activePlugins.includes(plugin),
                              );
                            }}>
                            <Checkbox
                              id={plugin}
                              checked={activePlugins.includes(plugin)}
                              onCheckedChange={(checked) => {
                                if (!pluginSupport) return;
                                togglePlugin(plugin, checked === true);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-5 w-5 rounded-sm data-[state=checked]:bg-primary"
                              disabled={!pluginSupport}
                            />
                            <div className="flex-1 flex flex-col cursor-pointer overflow-hidden">
                              <span className="text-sm font-medium leading-none mb-1 text-foreground">
                                {plugin}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                {t(
                                  "plugins.localScriptLabel",
                                  "Local C# script",
                                )}
                              </span>
                            </div>
                            {activePlugins.includes(plugin) && (
                              <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in duration-200" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Patching Workflow Modal */}
      <Dialog
        open={patchStage !== "idle"}
        onOpenChange={(open) => !open && setPatchStage("idle")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("patcher.modal.title", "Patching Terraria")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {patchStage === "checking" && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p>{t("patcher.modal.stepCheck", "Checking files...")}</p>
              </div>
            )}

            {patchStage === "restorePrompt" && (
              <div className="space-y-4">
                <p className="text-sm">
                  {t(
                    "patcher.modal.stepRestorePrompt",
                    "A backup (Terraria.exe.bak) was found. Would you like to restore it before patching?",
                  )}
                </p>
                {backupInfo?.exeVersion &&
                  backupInfo?.bakVersion &&
                  backupInfo.exeVersion !== backupInfo.bakVersion && (
                    <p className="text-sm text-amber-500 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                      {t("patcher.modal.stepRestoreWarning", {
                        exeVersion: backupInfo.exeVersion,
                        bakVersion: backupInfo.bakVersion,
                        defaultValue: `Warning: The current version (${backupInfo.exeVersion}) differs from the backup version (${backupInfo.bakVersion}).`,
                      })}
                    </p>
                  )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => handleRestoreBackup(false)}>
                    {t("patcher.modal.btnSkipRestore", "Skip Restore")}
                  </Button>
                  <Button onClick={() => handleRestoreBackup(true)}>
                    {t("patcher.modal.btnRestore", "Restore Backup")}
                  </Button>
                </div>
              </div>
            )}

            {patchStage === "backupPrompt" && (
              <div className="space-y-4">
                <p className="text-sm">
                  {t(
                    "patcher.modal.stepBackupPrompt",
                    "Would you like to create a backup of the current executable before applying new patches?",
                  )}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => handleCreateBackup(false)}>
                    {t("patcher.modal.btnSkipBackup", "Skip Backup")}
                  </Button>
                  <Button onClick={() => handleCreateBackup(true)}>
                    {t("patcher.modal.btnBackup", "Create Backup")}
                  </Button>
                </div>
              </div>
            )}

            {patchStage === "restoreSuccess" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  <p className="font-medium">
                    {t("patcher.modal.restoreSuccessTitle", "Backup restored")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  {patchMessage?.text ||
                    t(
                      "patcher.modal.restoreSuccessDesc",
                      "The backup was restored successfully. Continue to the backup step before patching?",
                    )}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPatchStage("idle")}>
                    {t("patcher.modal.btnStopHere", "Stop here")}
                  </Button>
                  <Button onClick={() => setPatchStage("backupPrompt")}>
                    {t("patcher.modal.btnContinueToBackup", "Continue to Backup")}
                  </Button>
                </div>
              </div>
            )}

            {patchStage === "backupSuccess" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  <p className="font-medium">
                    {t("patcher.modal.backupSuccessTitle", "Backup created")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  {patchMessage?.text ||
                    t(
                      "patcher.modal.backupSuccessDesc",
                      "Backup completed successfully. Continue to apply patches now?",
                    )}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPatchStage("idle")}>
                    {t("patcher.modal.btnStopHere", "Stop here")}
                  </Button>
                  <Button onClick={handleProceedToPatch}>
                    {t("patcher.modal.btnContinueToPatch", "Apply Patches")}
                  </Button>
                </div>
              </div>
            )}

            {patchStage === "patching" && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p>{t("patcher.modal.stepPatching", "Applying patches...")}</p>
              </div>
            )}

            {patchStage === "done" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  <p className="font-medium">
                    {t("patcher.modal.successTitle", "Success!")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  {patchMessage?.text ||
                    t(
                      "patcher.modal.successDesc",
                      "Terraria was patched successfully.",
                    )}
                </p>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setPatchStage("idle")}>
                    {t("patcher.modal.btnClose", "Close")}
                  </Button>
                </div>
              </div>
            )}

            {patchStage === "error" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-destructive">
                  <Wrench className="h-5 w-5" />
                  <p className="font-medium">
                    {t("patcher.modal.errorTitle", "Error")}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "patcher.modal.errorDesc",
                    "An error occurred during patching:",
                  )}
                </p>
                <pre className="text-xs bg-muted p-2 rounded border overflow-auto whitespace-pre-wrap break-all max-h-[50vh] text-destructive/80">
                  {patchError}
                </pre>
                <div className="flex justify-end pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPatchStage("idle")}>
                    {t("patcher.modal.btnClose", "Close")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Warning Modals */}
      <Dialog open={showAnglerWarning} onOpenChange={setShowAnglerWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <Sparkles className="h-5 w-5" />
              {t(
                "patcher.features.qol.angler.warningTitle",
                "Achievement Warning",
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-foreground">
              {t(
                "patcher.features.qol.angler.warningDesc",
                "This mod is reported to break Steam achievements for the Angler. It will still allow you to get in-game achievements though.",
              )}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowAnglerWarning(false)}>
              {t("patcher.modal.btnClose", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
