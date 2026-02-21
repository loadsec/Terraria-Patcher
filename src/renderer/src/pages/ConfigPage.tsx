import { Settings } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function ConfigPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Config</h1>
          <p className="text-sm text-muted-foreground">
            Application settings and preferences
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Game Directory Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              Game Directory
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure the installation path for Terraria.
            </p>
          </div>
          <div className="p-6">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="terraria-path"
                className="text-sm font-medium leading-none">
                Terraria Executable Location
              </label>
              <div className="flex gap-2">
                <input
                  id="terraria-path"
                  defaultValue="E:\SteamLibrary\steamapps\common\Terraria\Terraria.exe"
                  readOnly
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 py-2">
                  Browse...
                </button>
              </div>
              <p className="text-[13px] text-muted-foreground mt-1">
                The patcher needs to locate your main game executable to apply
                modifications.
              </p>
            </div>
          </div>
        </div>

        {/* App Preferences */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6 border-b bg-muted/20">
            <h3 className="font-semibold leading-none tracking-tight">
              App Preferences
            </h3>
            <p className="text-sm text-muted-foreground">
              General settings for the application.
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
                  Enable Plugin Support
                </Label>
                <p className="text-sm text-muted-foreground">
                  Load third-party patches from the <code>\Plugins\*.cs</code>{" "}
                  directory.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
