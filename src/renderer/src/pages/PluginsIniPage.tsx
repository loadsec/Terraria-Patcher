import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type PluginIniEntry = {
  key: string;
  value: string;
};

type PluginIniSection = {
  name: string;
  entries: PluginIniEntry[];
};

type LoadStatus = "idle" | "loading" | "loaded" | "notFound" | "noPath" | "error";

function humanizeIniKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function isBooleanValue(value: string): boolean {
  return /^(true|false)$/i.test(value.trim());
}

function isNumericValue(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function isHotkeyField(key: string): boolean {
  return /(hotkey|key)$/i.test(key);
}

function normalizeHotkeyValue(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z]$/i.test(trimmed)) return trimmed.toUpperCase();
  return trimmed;
}

function formatBooleanLike(original: string, next: boolean): string {
  if (original === original.toLowerCase()) return next ? "true" : "false";
  return next ? "True" : "False";
}

export default function PluginsIniPage() {
  const { t } = useTranslation();

  const [terrariaPath, setTerrariaPath] = useState<string>("");
  const [iniPath, setIniPath] = useState<string>("");
  const [sections, setSections] = useState<PluginIniSection[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const getFieldTypeLabel = (fieldType: "bool" | "number" | "hotkey" | "text") => {
    switch (fieldType) {
      case "bool":
        return t("plugins.ini.fieldTypes.bool", "Boolean");
      case "number":
        return t("plugins.ini.fieldTypes.number", "Number");
      case "hotkey":
        return t("plugins.ini.fieldTypes.hotkey", "Hotkey");
      default:
        return t("plugins.ini.fieldTypes.text", "Text");
    }
  };

  const updateEntryValue = (
    sectionIndex: number,
    entryIndex: number,
    nextValue: string,
  ) => {
    setSections((prev) =>
      prev.map((section, sIdx) =>
        sIdx !== sectionIndex
          ? section
          : {
              ...section,
              entries: section.entries.map((entry, eIdx) =>
                eIdx !== entryIndex ? entry : { ...entry, value: nextValue },
              ),
            },
      ),
    );
  };

  const loadIni = useCallback(async () => {
    setStatus("loading");
    setMessage(null);

    try {
      const path = ((await window.api.config.get("terrariaPath")) as string) || "";
      setTerrariaPath(path);

      if (!path) {
        setSections([]);
        setIniPath("");
        setStatus("noPath");
        return;
      }

      const result = await window.api.plugins.iniLoad(path);
      if (!result.success) {
        setSections([]);
        setIniPath(result.path || "");
        setStatus("error");
        setMessage({
          type: "error",
          text: t(
            result.key || "plugins.ini.messages.loadFailed",
            result.args ?? { error: "Unknown error" },
          ),
        });
        return;
      }

      setIniPath(result.path || "");

      if (!result.exists) {
        setSections([]);
        setStatus("notFound");
        return;
      }

      setSections(result.sections || []);
      setStatus("loaded");
    } catch (error) {
      setSections([]);
      setStatus("error");
      setMessage({
        type: "error",
        text: t("plugins.ini.messages.loadFailed", {
          error: String(error),
          defaultValue: `Failed to load Plugins.ini: ${String(error)}`,
        }),
      });
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadIni();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadIni]);

  const handleSave = async () => {
    setMessage(null);
    setIsSaving(true);
    try {
      const path = terrariaPath || ((await window.api.config.get("terrariaPath")) as string) || "";
      setTerrariaPath(path);
      if (!path) {
        setStatus("noPath");
        setMessage({
          type: "error",
          text: t("plugins.ini.errors.noTerrariaPath"),
        });
        return;
      }

      const result = await window.api.plugins.iniSave({
        terrariaPath: path,
        sections,
      });

      if (!result.success) {
        setMessage({
          type: "error",
          text: t(result.key || "plugins.ini.messages.saveFailed", result.args),
        });
        return;
      }

      setIniPath(result.path || iniPath);
      setStatus("loaded");
      setMessage({
        type: "success",
        text: t(result.key || "plugins.ini.messages.saveSuccess"),
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: t("plugins.ini.messages.saveFailed", {
          error: String(error),
          defaultValue: `Failed to save Plugins.ini: ${String(error)}`,
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      t(
        "plugins.ini.deleteConfirm",
        "Delete Plugins.ini? This only removes the generated plugin settings file.",
      ),
    );
    if (!ok) return;

    setMessage(null);
    setIsDeleting(true);
    try {
      const path = terrariaPath || ((await window.api.config.get("terrariaPath")) as string) || "";
      setTerrariaPath(path);
      if (!path) {
        setStatus("noPath");
        setMessage({
          type: "error",
          text: t("plugins.ini.errors.noTerrariaPath"),
        });
        return;
      }

      const result = await window.api.plugins.iniDelete(path);
      if (!result.success) {
        setMessage({
          type: "error",
          text: t(result.key || "plugins.ini.messages.deleteFailed", result.args),
        });
        return;
      }

      setSections([]);
      setStatus("notFound");
      setMessage({
        type: "success",
        text: t(result.key || "plugins.ini.messages.deleteSuccess"),
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: t("plugins.ini.messages.deleteFailed", {
          error: String(error),
          defaultValue: `Failed to delete Plugins.ini: ${String(error)}`,
        }),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderFieldInput = (
    entry: PluginIniEntry,
    sectionIndex: number,
    entryIndex: number,
  ) => {
    const value = entry.value ?? "";

    if (isBooleanValue(value)) {
      const checked = /^true$/i.test(value.trim());
      return (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{value}</span>
          <Switch
            checked={checked}
            onCheckedChange={(next) =>
              updateEntryValue(
                sectionIndex,
                entryIndex,
                formatBooleanLike(value, next),
              )
            }
          />
        </div>
      );
    }

    if (isNumericValue(value)) {
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) =>
            updateEntryValue(sectionIndex, entryIndex, e.target.value)
          }
          className="h-9"
        />
      );
    }

    if (isHotkeyField(entry.key)) {
      return (
        <Input
          type="text"
          value={value}
          onChange={(e) =>
            updateEntryValue(sectionIndex, entryIndex, e.target.value)
          }
          onBlur={(e) =>
            updateEntryValue(
              sectionIndex,
              entryIndex,
              normalizeHotkeyValue(e.target.value),
            )
          }
          placeholder={t(
            "plugins.ini.hotkeyPlaceholder",
            "R / F / OemSemicolon",
          )}
          className="h-9"
        />
      );
    }

    return (
      <Input
        type="text"
        value={value}
        onChange={(e) => updateEntryValue(sectionIndex, entryIndex, e.target.value)}
        className="h-9"
      />
    );
  };

  const isLoading = status === "loading";
  const canSave =
    status === "loaded" || (status === "notFound" && sections.length > 0);

  return (
    <div className="min-h-full flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 font-mono">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            {t("plugins.ini.title", "Plugins.ini Editor")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 pl-6 font-mono">
            {t("plugins.ini.subtitle", "Edit only the settings generated by PluginLoader and your plugins.")}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5 pl-6 font-mono break-all">
            {iniPath || t("plugins.ini.pathUnknown", "Plugins.ini path will appear here after loading.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            className="gap-2"
            onClick={loadIni}
            disabled={status === "loading" || isSaving || isDeleting}>
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("plugins.ini.reloadBtn", "Reload")}
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={handleDelete}
            disabled={isDeleting || isSaving || !iniPath}>
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("plugins.ini.deleteBtn", "Delete File")}
          </Button>
          <Button
            className="gap-2"
            onClick={handleSave}
            disabled={!canSave || isSaving || isDeleting || isLoading}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("plugins.ini.saveBtn", "Save")}
          </Button>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {message.type === "success"
              ? t("plugins.ini.status.success", "Success")
              : message.type === "error"
                ? t("plugins.ini.status.error", "Error")
                : t("plugins.ini.status.info", "Info")}
          </AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {status === "noPath" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("plugins.ini.errors.noTerrariaPathTitle", "Terraria path not configured")}</AlertTitle>
          <AlertDescription>
            {t(
              "plugins.ini.errors.noTerrariaPathDesc",
              "Set the Terraria.exe path in the Config page before using the Plugins.ini editor.",
            )}
          </AlertDescription>
        </Alert>
      )}

      {status === "notFound" && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("plugins.ini.messages.notFoundTitle", "Plugins.ini not found")}</AlertTitle>
          <AlertDescription>
            <p>
              {t(
                "plugins.ini.messages.notFoundDesc",
                "The file was not found yet. First apply the plugin patch, then run Terraria once so PluginLoader can generate Plugins.ini.",
              )}
            </p>
            {terrariaPath && (
              <p className="break-all text-xs mt-1">
                {t("plugins.ini.messages.expectedPath", {
                  path: iniPath || "Plugins.ini",
                  defaultValue: `Expected path: ${iniPath || "Plugins.ini"}`,
                })}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {status === "loaded" && sections.length === 0 && (
        <div className="border border-dashed border-border/60 p-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-mono text-muted-foreground">
            {t("plugins.ini.emptyTitle", "No plugin settings found")}
          </p>
          <p className="text-xs font-mono text-muted-foreground/60 mt-1">
            {t("plugins.ini.emptyDesc", "Plugins.ini exists but currently has no generated sections.")}
          </p>
        </div>
      )}

      {sections.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sections.map((section, sectionIndex) => (
            <div key={`${section.name}-${sectionIndex}`} className="border border-l-2 border-l-primary/30 bg-card">
              <div className="px-4 py-3 border-b bg-muted/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80 break-all">
                      {humanizeIniKey(section.name)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground break-all mt-0.5">
                      [{section.name}]
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {section.entries.length}{" "}
                    {t("plugins.ini.fieldsLabel", "fields")}
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-4">
                  {section.entries.length === 0 ? (
                    <p className="text-xs font-mono text-muted-foreground">
                      {t("plugins.ini.noFields", "No fields in this section.")}
                    </p>
                  ) : (
                    section.entries.map((entry, entryIndex) => {
                      const rawValue = entry.value ?? "";
                      const fieldType = isBooleanValue(rawValue)
                        ? "bool"
                        : isNumericValue(rawValue)
                          ? "number"
                          : isHotkeyField(entry.key)
                            ? "hotkey"
                            : "text";

                      return (
                        <div
                          key={`${entry.key}-${entryIndex}`}
                          className="grid gap-2 border p-3 bg-card/50">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <Label className="text-xs font-mono font-medium break-all">
                                {humanizeIniKey(entry.key)}
                              </Label>
                              <p className="text-[10px] font-mono text-muted-foreground break-all">
                                {entry.key}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "text-[10px] uppercase tracking-wider px-2 py-1 border font-mono font-medium",
                                fieldType === "bool" &&
                                  "border-primary/30 bg-primary/10 text-primary",
                                fieldType === "number" &&
                                  "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
                                fieldType === "hotkey" &&
                                  "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                                fieldType === "text" &&
                                  "border-muted-foreground/20 bg-muted/60 text-foreground/80 dark:bg-muted/30 dark:text-muted-foreground",
                              )}>
                              {getFieldTypeLabel(fieldType)}
                            </span>
                          </div>
                          {renderFieldInput(entry, sectionIndex, entryIndex)}
                          {fieldType === "hotkey" && (
                            <p className="text-[10px] font-mono text-muted-foreground/60">
                              {t(
                                "plugins.ini.hotkeyHint",
                                "Use key names from the plugin format (examples: R, F, OemSemicolon).",
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
