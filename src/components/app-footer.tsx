import { version } from "../../package.json";

const GITHUB_REPOSITORY_URL = "https://github.com/linmo-33/lumina";

export function AppFooter() {
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
