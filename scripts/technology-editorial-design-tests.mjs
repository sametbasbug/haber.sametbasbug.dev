import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('src/components/news/TechnologyHome.astro');
const layout = read('src/layouts/TechnologyLayout.astro');
const css = read('src/styles/technology.css');
const story = read('src/components/news/TechnologyStory.astro');
const archive = read('src/components/news/TechnologyArchiveList.astro');
const desk = read('src/pages/masa/index.astro');
let checks = 0;
function checked(condition, why) { assert.ok(condition, why); checks++; }

// Editorial front page must show real data and never advertise an empty feed.
checked(home.includes("publicationEra: 'technology'"), 'new stories use the real technology feed');
checked(home.includes("publicationEra: 'legacy'"), 'archive data fetched independently');
checked(home.includes("category: 'Teknoloji'"), 'archive selection is real technology news');
checked(home.includes('ÖNCEKİ YAYIN DÖNEMİ'), 'archive visibly marked as historic');
checked(home.includes('Henüz yeni dönem haberi yayımlanmadı.'), 'do not fabricate publication activity');
checked(home.includes('eh-no-new'), 'empty-feed layout moves real archive toward first screen');
checked(!home.includes('Dünyayı değiştiren'), 'no generic marketing hero');
checked(!home.includes('tb-agent-monogram'), 'no decorative agent widgets');
checked(home.includes('href={`/${entry.id}/`}'), 'real archive article permalinks remain direct');

// Newspaper masthead and longform reading; no images in new editorial components.
checked(layout.includes('ep-wordmark'), 'typographic publication masthead');
checked(layout.includes("import OturumDugmesi from '../components/OturumDugmesi.astro'"), 'reuse trusted Orbit session form in editorial layout');
checked(layout.includes('<OturumDugmesi />'), 'reader can access the connected-site OAuth consent flow from homepage');
checked(css.includes('--news-border: var(--tb-line)'), 'legacy login control inherits editorial theme tokens');
checked(css.includes('.ep-utility-actions > a'), 'narrow mobile hides only secondary links, not login');

checked(layout.includes('data-theme-toggle'), 'theme and accessibility controller retained');
checked(css.includes("Georgia, 'Times New Roman', serif"), 'book-like serif masthead');
checked(css.includes('[data-tb-theme=\'dark\']'), 'dark theme palette');
checked(story.includes('story-content'), 'reading column retained');
checked(story.includes('<Content />') && story.includes('set:html={bodyHtml'), 'static and D1 article rendering retained');
checked(story.includes('Tarihsel arşiv'), 'legacy stories distinguished');
checked(!home.includes('<img') && !story.includes('<img'), 'new article UI is image-free');
checked(archive.includes('GEÇMİŞ YAYINLAR'), 'legacy listing is labelled');
checked(desk.includes('statistics.get'), 'newsroom counts are database-derived, not invented');
checked(desk.includes('Yayın ilkelerimizi okuyun'), 'editorial standards easy to find');
checked(layout.includes('data-topic-link="arsiv"') && layout.includes('data-topic-link="masa"'), 'archive and desk are first-class active nav destinations');
checked(css.includes('clamp(22px, 8.2vw, 54px)'), 'small-screen masthead fits the 320px reading gutter');
console.log('Equinox Haber editorial design: ' + checks + ' source/contract checks passed');
