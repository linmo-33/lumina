import { version } from "../../package.json";

const GITHUB_REPOSITORY_URL = "https://github.com/linmo-33/lumina";

interface AppFooterProps {
  variant?: "default" | "auth";
}

export function AppFooter({ variant = "default" }: AppFooterProps) {
  if (variant === "auth") {
    return (
      <footer className="lumina-footer lumina-footer-login">
        <strong>Lumina</strong>
        <span className="lumina-footer-meta">
          <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub</a>
        </span>
      </footer>
    );
  }

  return (
    <footer className="lumina-footer">
      <span>Lumina <span className="text-muted-foreground">v{version}</span></span>
      <span className="lumina-footer-meta">
        <span>让灵感成为画面</span>
        <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">GitHub</a>
      </span>
    </footer>
  );
}
