import i18n from '.';

// Node 21+ has navigator.languages, so detection could pick another catalog; tests assert English copy.
void i18n.changeLanguage('en');
