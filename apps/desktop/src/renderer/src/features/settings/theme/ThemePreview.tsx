import type { ResolvedTheme, ThemePreference } from '@relay/shared';

function MiniWindow({ theme }: { readonly theme: ResolvedTheme }) {
  return (
    <span className="thm-win" data-theme={theme}>
      <span className="thm-side">
        <i className="on" />
        <i />
        <i />
      </span>
      <span className="thm-body">
        <i className="t" />
        <i />
        <i className="s" />
        <b />
      </span>
    </span>
  );
}

export function ThemePreview({ theme }: { readonly theme: ThemePreference }) {
  if (theme === 'system') {
    return (
      <span className="thm-prev split" aria-hidden="true">
        <MiniWindow theme="light" />
        <MiniWindow theme="dark" />
      </span>
    );
  }
  return (
    <span className="thm-prev" aria-hidden="true">
      <MiniWindow theme={theme} />
    </span>
  );
}
