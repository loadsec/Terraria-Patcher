import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  "[307]",
  "[309]",
  "[310]",
  "[313]",
  "[315]",
  "[316]",
  "[319]",
  "[326]",
  "[337]",
  "[340]",
  "[312] A Nice Buff",
  "[335] Abigail",
  "[70] Acid Venom",
  "[302] Alien Skater",
  "[93] Ammo Box",
  "[112] Ammo Reservation",
  "[16] Archery",
  "[61] Baby Dinosaur",
  "[45] Baby Eater",
  "[154] Baby Face Monster",
  "[216] Baby Finch",
  "[92] Baby Grinch",
  "[51] Baby Hornet",
  "[261] Baby Imp",
  "[303] Baby Ogre",
];

const INITIAL_ACTIVE_BUFFS = ["[147] Banner", "[87] Cozy Fire", "[257] Lucky"];

export default function PatcherPage() {
  const [activeTab, setActiveTab] = useState<Tab>("qol");
  const { t } = useTranslation();

  const [availableBuffs, setAvailableBuffs] = useState<string[]>(
    ALL_POSSIBLE_BUFFS.filter((b) => !INITIAL_ACTIVE_BUFFS.includes(b)),
  );
  const [activeBuffs, setActiveBuffs] =
    useState<string[]>(INITIAL_ACTIVE_BUFFS);

  const [selectedAvailable, setSelectedAvailable] = useState<Set<string>>(
    new Set(),
  );
  const [selectedActive, setSelectedActive] = useState<Set<string>>(new Set());
  const [searchAvailable, setSearchAvailable] = useState("");
  const [searchActive, setSearchActive] = useState("");

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
  const filteredActive = activeBuffs.filter((b) =>
    b.toLowerCase().includes(searchActive.toLowerCase()),
  );

  const handleAddSelected = () => {
    setActiveBuffs((prev) => [...prev, ...Array.from(selectedAvailable)]);
    setAvailableBuffs((prev) => prev.filter((b) => !selectedAvailable.has(b)));
    setSelectedAvailable(new Set());
  };

  const handleRemoveSelected = () => {
    setAvailableBuffs((prev) => [...prev, ...Array.from(selectedActive)]);
    setActiveBuffs((prev) => prev.filter((b) => !selectedActive.includes(b)));
    setSelectedActive(new Set());
  };

  const handleAddAll = () => {
    setActiveBuffs((prev) => [...prev, ...filteredAvailable]);
    setAvailableBuffs((prev) =>
      prev.filter((b) => !filteredAvailable.includes(b)),
    );
    setSelectedAvailable(new Set());
  };

  const handleRemoveAll = () => {
    setAvailableBuffs((prev) => [...prev, ...filteredActive]);
    setActiveBuffs((prev) => prev.filter((b) => !filteredActive.includes(b)));
    setSelectedActive(new Set());
  };

  const qolSettings = [
    {
      id: "time",
      label: t("patcher.features.qol.time.label"),
      checked: true,
      description: t("patcher.features.qol.time.desc"),
    },
    {
      id: "social",
      label: t("patcher.features.qol.social.label"),
      checked: false,
      description: t("patcher.features.qol.social.desc"),
    },
    {
      id: "range",
      label: t("patcher.features.qol.range.label"),
      checked: false,
      description: t("patcher.features.qol.range.desc"),
    },
    {
      id: "pylon",
      label: t("patcher.features.qol.pylon.label"),
      checked: true,
      description: t("patcher.features.qol.pylon.desc"),
    },
    {
      id: "angler",
      label: t("patcher.features.qol.angler.label"),
      checked: false,
      description: t("patcher.features.qol.angler.desc"),
    },
  ];

  const combatSettings = [
    {
      id: "rod",
      label: t("patcher.features.combat.rod.label"),
      checked: false,
      description: t("patcher.features.combat.rod.desc"),
    },
    {
      id: "potion",
      label: t("patcher.features.combat.potion.label"),
      checked: false,
      description: t("patcher.features.combat.potion.desc"),
    },
    {
      id: "mana",
      label: t("patcher.features.combat.mana.label"),
      checked: true,
      description: t("patcher.features.combat.mana.desc"),
    },
    {
      id: "drowning",
      label: t("patcher.features.combat.drowning.label"),
      checked: false,
      description: t("patcher.features.combat.drowning.desc"),
    },
  ];

  const cheatSettings = [
    {
      id: "ohk",
      label: t("patcher.features.cheats.ohk.label"),
      checked: false,
      description: t("patcher.features.cheats.ohk.desc"),
    },
    {
      id: "ammo",
      label: t("patcher.features.cheats.ammo.label"),
      checked: true,
      description: t("patcher.features.cheats.ammo.desc"),
    },
    {
      id: "wings",
      label: t("patcher.features.cheats.wings.label"),
      checked: false,
      description: t("patcher.features.cheats.wings.desc"),
    },
    {
      id: "cloud",
      label: t("patcher.features.cheats.cloud.label"),
      checked: false,
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

  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("patcher.title", "Game Modifications")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "patcher.description",
              "Configure standalone patches to apply directly to the Terraria executable.",
            )}
          </p>
        </div>
        <Button className="gap-2 shrink-0">
          <Wrench className="h-4 w-4" />
          {t("patcher.patchBtn", "Patch & Save")}
        </Button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 flex flex-col gap-2 shrink-0">
          <Card className="shadow-none border-muted bg-muted/20">
            <CardContent className="p-2 flex flex-col gap-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-2">
                {t("patcher.title", "Modifications")}
              </div>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 outline-none",
                      isActive
                        ? "bg-foreground shadow-sm text-background"
                        : "text-muted-foreground hover:bg-foreground hover:text-background",
                    )}>
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}

              <div className="my-2 border-t border-muted/50" />

              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 mt-1">
                {t("patcher.external", "External")}
              </div>
              {pluginTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as Tab)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 outline-none",
                      isActive
                        ? "bg-foreground shadow-sm text-background"
                        : "text-muted-foreground hover:bg-foreground hover:text-background",
                    )}>
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="shadow-none border-muted bg-muted/20 mt-auto hidden md:block">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground leading-relaxed text-center">
                {t(
                  "patcher.pathAlert",
                  "Make sure your Terraria path is correctly set in the Config page before patching.",
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Dynamic Content Area */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-card rounded-xl border shadow-sm">
          {activeTab === "qol" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">
                  {t("patcher.tabs.qol")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Enhancements for standard gameplay flow.
                </p>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {qolSettings.map((setting) => (
                    <div
                      key={setting.id}
                      className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/30">
                      <Checkbox
                        id={setting.id}
                        defaultChecked={setting.checked}
                        className="mt-1"
                      />
                      <div className="space-y-1.5 leading-none">
                        <Label
                          htmlFor={setting.id}
                          className="text-sm font-medium cursor-pointer">
                          {setting.label}
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed pr-2">
                          {setting.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === "combat" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Combat & Debuffs</h3>
                <p className="text-sm text-muted-foreground">
                  Modifications to combat mechanics and negative effects.
                </p>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {combatSettings.map((setting) => (
                    <div
                      key={setting.id}
                      className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/30">
                      <Checkbox
                        id={setting.id}
                        defaultChecked={setting.checked}
                        className="mt-1"
                      />
                      <div className="space-y-1.5 leading-none">
                        <Label
                          htmlFor={setting.id}
                          className="text-sm font-medium cursor-pointer">
                          {setting.label}
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed pr-2">
                          {setting.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === "cheats" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">Overpowered / Cheats</h3>
                <p className="text-sm text-muted-foreground">
                  Features that strongly alter game balance.
                </p>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cheatSettings.map((setting) => (
                    <div
                      key={setting.id}
                      className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/30">
                      <Checkbox
                        id={setting.id}
                        defaultChecked={setting.checked}
                        className="mt-1"
                      />
                      <div className="space-y-1.5 leading-none">
                        <Label
                          htmlFor={setting.id}
                          className="text-sm font-medium cursor-pointer">
                          {setting.label}
                        </Label>
                        <p className="text-xs text-muted-foreground leading-relaxed pr-2">
                          {setting.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === "buffs" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">
                  {t("patcher.tabs.buffs")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Select buffs that will be permanently active for your
                  character.
                </p>
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
                  <div className="flex-1 border rounded-lg flex flex-col overflow-hidden">
                    <div className="bg-muted px-3 py-2 border-b text-xs font-medium text-muted-foreground tracking-wider uppercase">
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
                      title="Add All"
                      onClick={handleAddAll}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Add Selected"
                      onClick={handleAddSelected}
                      disabled={selectedAvailable.size === 0}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Remove Selected"
                      onClick={handleRemoveSelected}
                      disabled={selectedActive.size === 0}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Remove All"
                      onClick={handleRemoveAll}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 border rounded-lg flex flex-col overflow-hidden">
                    <div className="bg-muted px-3 py-2 border-b text-xs font-medium text-primary tracking-wider uppercase flex justify-between">
                      <span>{t("patcher.tabs.buffsActive")}</span>
                      <span>{activeBuffs.length} / 22</span>
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
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">
                  {t("patcher.tabs.healing")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("patcher.healing.desc")}
                </p>
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
                      defaultValue={7.5}
                      step={0.1}
                      className="w-32"
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
                      defaultValue={20.0}
                      step={0.1}
                      className="w-32"
                    />
                    <span className="text-sm font-medium">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "spawning" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">
                  {t("patcher.tabs.spawning")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("patcher.spawning.desc")}
                </p>
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
                      defaultValue={15}
                      min={0}
                      max={100}
                      className="w-32"
                    />
                    <span className="text-sm font-medium">%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "loot" && (
            <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-right-4 duration-300">
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">
                  {t("patcher.tabs.loot")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("patcher.lootFeature.desc")}
                </p>
              </div>
              <div className="p-6">
                <div className="flex items-start space-x-3 p-4 border rounded-lg bg-muted/30">
                  <Checkbox
                    id="boss-bags-loot"
                    defaultChecked
                    className="mt-1"
                  />
                  <div className="space-y-1 leading-none">
                    <Label
                      htmlFor="boss-bags-loot"
                      className="text-base font-medium cursor-pointer">
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
              <div className="p-6 border-b">
                <h3 className="text-lg font-semibold">
                  {t("plugins.title", "Plugins")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "plugins.subtitle",
                    "Browse, enable, and configure plugins",
                  )}
                </p>
              </div>
              <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-3">
                <Puzzle className="h-12 w-12 text-muted-foreground/30" />
                <h2 className="text-lg font-medium text-muted-foreground">
                  {t("plugins.emptyState.title", "No plugins loaded")}
                </h2>
                <p className="text-sm text-muted-foreground/70 max-w-md">
                  {t(
                    "plugins.emptyState.desc",
                    "This section will list all available plugins, allowing you to enable, disable, and configure each one individually.",
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
