import { Settings, Search, Check, Save } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslation, Trans } from "react-i18next";
import { useState } from "react";

const AVAILABLE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "pt-BR", label: "Português Brasileiro" },
];

export default function ConfigPage() {
  const { t, i18n } = useTranslation();

  // Local state for the selected language before saving
  const [selectedLang, setSelectedLang] = useState(
    i18n.resolvedLanguage || "en",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLanguages = AVAILABLE_LANGUAGES.filter((lang) =>
    lang.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSaveConfig = () => {
    i18n.changeLanguage(selectedLang);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("config.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("config.subtitle")}
            </p>
          </div>
        </div>
        <Button onClick={handleSaveConfig} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {t("config.saveBtn", "Save Configuration")}
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        {/* Language Preferences */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.language.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("config.language.desc")}
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-4">
              <label
                htmlFor="language-search"
                className="text-sm font-medium leading-none">
                {t("config.language.label")}
              </label>

              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="language-search"
                    placeholder={t(
                      "config.language.searchPlaceholder",
                      "Search...",
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="h-[200px] rounded-md border bg-muted/30">
                <ScrollArea className="h-full p-4">
                  <div className="flex flex-col gap-2">
                    {filteredLanguages.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-4">
                        {t("patcher.empty", "No results found.")}
                      </div>
                    ) : (
                      filteredLanguages.map((lang) => (
                        <button
                          key={lang.id}
                          onClick={() => {
                            setSelectedLang(lang.id);
                            i18n.changeLanguage(lang.id);
                          }}
                          className={cn(
                            "flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm transition-colors",
                            selectedLang === lang.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted font-normal text-muted-foreground hover:text-foreground",
                          )}>
                          <span>{lang.label}</span>
                          {selectedLang === lang.id && (
                            <Check className="h-4 w-4" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        {/* Game Directory Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.gameDirectory.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("config.gameDirectory.desc")}
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="terraria-path"
                className="text-sm font-medium leading-none">
                {t("config.gameDirectory.label")}
              </label>
              <div className="flex gap-2">
                <input
                  id="terraria-path"
                  defaultValue="E:\SteamLibrary\steamapps\common\Terraria\Terraria.exe"
                  readOnly
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 py-2">
                  {t("config.gameDirectory.browse")}
                </button>
              </div>
              <p className="text-[13px] text-muted-foreground mt-1">
                {t("config.gameDirectory.help")}
              </p>
            </div>
          </div>
        </div>

        {/* App Preferences */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              {t("config.appPreferences.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("config.appPreferences.desc")}
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-start space-x-3 group">
              <Checkbox
                id="plugin-support"
                defaultChecked={true}
                className="mt-0.5"
              />
              <div className="space-y-1 leading-none">
                <Label
                  htmlFor="plugin-support"
                  className="text-sm font-medium leading-none cursor-pointer group-hover:text-primary transition-colors">
                  {t("config.appPreferences.pluginLabel")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  <Trans i18nKey="config.appPreferences.pluginDesc">
                    Load third-party patches from the <code>\Plugins\*.cs</code>{" "}
                    directory.
                  </Trans>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save Action */}
      <div className="flex justify-end pt-4 mt-4 border-t border-muted/20">
        <Button onClick={handleSaveConfig} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {t("config.saveBtn", "Save Configuration")}
        </Button>
      </div>
    </div>
  );
}
