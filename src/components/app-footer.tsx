import { version } from "../../package.json";

const GITHUB_REPOSITORY_URL = "https://github.com/linmo-33/lumina";

export function AppFooter() {
  return (
    <footer className="lumina-footer">
      <span className="lumina-footer-brand">
        Lumina
        <span className="lumina-footer-version">v{version}</span>
      </span>
      <span className="lumina-footer-meta">
        <span>让灵感成为画面</span>
        <a
          href={GITHUB_REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="在 GitHub 上查看 Lumina 仓库"
        >
          GitHub
        </a>
      </span>
    </footer>
  );
}
