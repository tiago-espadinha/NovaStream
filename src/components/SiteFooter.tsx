import { DATA_SOURCES, DEVELOPER_LINKS, DEVELOPER_NAME, TMDB_NOTICE } from '../data/credits';
import FooterIcon from './FooterIcon';

const NEW_TAB = '(opens in a new tab)';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-developer">
        <p>
          Nova Stream is designed and built by <strong>{DEVELOPER_NAME}</strong>.
        </p>
        <ul className="footer-social" aria-label={`${DEVELOPER_NAME}'s profiles`}>
          {DEVELOPER_LINKS.map((link) => (
            <li key={link.kind}>
              <a
                className="footer-social-link"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} ${NEW_TAB}`}
              >
                <FooterIcon kind={link.kind} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="footer-sources">
        Data from{' '}
        {DATA_SOURCES.map((source, index) => (
          <span key={source.name}>
            {index > 0 && (index === DATA_SOURCES.length - 1 ? ' and ' : ', ')}
            <a href={source.href} target="_blank" rel="noopener noreferrer">
              {source.name}{' '}
              <span className="visually-hidden">{NEW_TAB}</span>
            </a>{' '}
            ({source.covers}
            {source.credit && `, ${source.credit}`})
          </span>
        ))}
        . {TMDB_NOTICE}
      </p>
    </footer>
  );
}
