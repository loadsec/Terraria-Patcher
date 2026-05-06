import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/hooks/use-theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
          "--success-bg": "var(--popover)",
          "--success-border": "var(--primary)",
          "--success-text": "var(--popover-foreground)",
          "--error-bg": "var(--popover)",
          "--error-border": "var(--destructive)",
          "--error-text": "var(--popover-foreground)",
          "--warning-bg": "var(--popover)",
          "--warning-border": "oklch(0.795 0.184 86)",
          "--warning-text": "var(--popover-foreground)",
          "--border-radius": "0px",
          "--font": '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
