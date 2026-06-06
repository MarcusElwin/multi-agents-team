import Link from 'next/link';

const REPO_URL = 'https://github.com/MarcusElwin/multi-agents-team';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/harness', label: 'Harness' },
  { href: '/references', label: 'References' },
  { href: '/chat', label: 'Open the app' },
];

/**
 * Shared site footer with a navigation menu. The menu matters most on mobile,
 * where the header links collapse — it keeps About / Harness / References
 * reachable from every page.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 py-10">
      <nav className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-6 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-stone-500 transition-colors hover:text-stone-900">
            {l.label}
          </Link>
        ))}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-stone-500 transition-colors hover:text-stone-900"
        >
          GitHub
        </a>
      </nav>
      <p className="mt-6 px-6 text-center text-xs text-stone-400">
        Made with <span className="text-red-400">♥</span> in Stockholm by{' '}
        <a
          href="https://umai-tech.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
        >
          Marcus Elwin @ UmaiTech
        </a>
        {' · '}MIT
      </p>
    </footer>
  );
}
