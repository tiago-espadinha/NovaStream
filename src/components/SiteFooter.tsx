import { Trans, useTranslation } from 'react-i18next';
import { DATA_SOURCES, DEVELOPER_LINKS, DEVELOPER_NAME, DEVELOPER_PORTFOLIO } from '../data/credits';
import FooterIcon from './FooterIcon';

export function SiteFooter() {
  const { t } = useTranslation();
  const newTab = t('footer.newTab');

  return (
    <footer className="site-footer">
      <div className="footer-developer">
        <p>
          <Trans
            i18nKey="footer.builtBy"
            values={{ name: DEVELOPER_NAME }}
            components={{
              strong: (
                <a
                  className="footer-developer-name"
                  href={DEVELOPER_PORTFOLIO}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t('footer.portfolio', { name: DEVELOPER_NAME })} ${newTab}`}
                />
              ),
            }}
          />
        </p>
        <ul className="footer-social" aria-label={t('footer.profiles', { name: DEVELOPER_NAME })}>
          {DEVELOPER_LINKS.map((link) => (
            <li key={link.kind}>
              <a
                className="footer-social-link"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} ${newTab}`}
              >
                <FooterIcon kind={link.kind} />
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="footer-sources">
        {t('footer.dataFrom')}{' '}
        {DATA_SOURCES.map((source, index) => (
          <span key={source.name}>
            {index > 0 && (index === DATA_SOURCES.length - 1 ? t('common.listAnd') : t('common.listComma'))}
            <a href={source.href} target="_blank" rel="noopener noreferrer">
              {source.name}<span className="visually-hidden"> {newTab}</span>
            </a>
          </span>
        ))}
      </p>
    </footer>
  );
}
