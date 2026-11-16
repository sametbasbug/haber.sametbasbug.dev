import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// The real inline script is executed directly against deterministic DOM and
// MediaQuery mocks, so a markup refactor cannot make a fake duplicated
// controller test green while the shipped Astro layout is still broken.
const layout=readFileSync(new URL('../src/layouts/TechnologyLayout.astro',import.meta.url),'utf8');
const inlineScripts=[...layout.matchAll(/<script is:inline>\s*([\s\S]*?)\s*<\/script>/gu)].map((match)=>match[1]);
assert.equal(inlineScripts.length,2,'A theme bootstrap in <head> must prevent a dark-to-light flash');
const [bootstrap,script]=inlineScripts;
assert.ok(script,'TechnologyLayout must contain its real inline theme controller');
let checks=1;

function renderTheme({saved=null,systemDark=false,storeThrows=false}={}) {
  const attrs=new Map(), storage=new Map();
  const root={dataset:{}};
  let onClick=null,onSystemChange=null;
  let metaColor=null;
  const themeMeta={setAttribute(name,value){assert.equal(name,'content');metaColor=value;}};
  const media={
    matches:systemDark,
    addEventListener(name,cb){assert.equal(name,'change');onSystemChange=cb;},
  };
  const button={
    setAttribute(name,value){attrs.set(name,value);},
    addEventListener(name,cb){assert.equal(name,'click');onClick=cb;},
  };
  const doc={
    documentElement:root,
    querySelector(name){
      return name==='[data-theme-toggle]'?button:
        name==='meta[name="theme-color"]'?themeMeta:null;
    },
    querySelectorAll(){return [];},
  };
  const localStorage={
    getItem(name){assert.equal(name,'equinox-haber-theme');if(storeThrows)throw Error('no storage');return saved;},
    setItem(name,value){if(storeThrows)throw Error('no storage');storage.set(name,value);},
  };
  runInNewContext(script,{document:doc,window:{matchMedia(){return media;}},location:{pathname:'/'},localStorage});
  return {root,attrs,storage,button,media,metaColor:()=>metaColor,click:()=>onClick(),change:()=>onSystemChange()};
}
// The actual pre-paint script executes before the stylesheet is rendered.
function renderEarly({saved=null,systemDark=false,storeThrows=false}={}) {
  const root={dataset:{}};
  let chromeColor=null;
  const meta={setAttribute(name,value){assert.equal(name,'content');chromeColor=value;}};
  const doc={
    documentElement:root,
    querySelector(name){return name==='meta[name="theme-color"]'?meta:null;},
  };
  runInNewContext(bootstrap,{
    document:doc,
    window:{matchMedia(){return {matches:systemDark};}},
    localStorage:{
      getItem(name){assert.equal(name,'equinox-haber-theme');if(storeThrows)throw Error('storage denied');return saved;},
    },
  });
  return {root,chromeColor};
}
for(const [options,expectedColor,expectedChoice] of [
  [{},'#fbfaf7',undefined],
  [{systemDark:true},'#171a19',undefined],
  [{saved:'dark'},'#171a19','dark'],
  [{saved:'light',systemDark:true},'#fbfaf7','light'],
  [{storeThrows:true,systemDark:true},'#171a19',undefined],
]) {
  const early=renderEarly(options);
  assert.equal(early.chromeColor,expectedColor);
  assert.equal(early.root.dataset.tbTheme,expectedChoice);
  checks+=2;
}
let ui=renderTheme();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui=renderTheme({saved:'dark'});
assert.equal(ui.root.dataset.tbTheme,'dark');checks++;
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
assert.equal(ui.metaColor(),'#171a19');checks++;
ui.click();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
assert.equal(ui.root.dataset.tbTheme,'light');checks++;
assert.equal(ui.metaColor(),'#fbfaf7');checks++;
assert.equal(ui.storage.get('equinox-haber-theme'),'light');checks++;
ui=renderTheme({saved:'light',systemDark:true});
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui=renderTheme({systemDark:true});
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
ui.media.matches=false;ui.change();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui.media.matches=true;ui.change();
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
assert.equal(ui.metaColor(),'#171a19');checks++;
ui.click();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui.media.matches=false;ui.change();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui=renderTheme({storeThrows:true,systemDark:true});
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
assert.equal(ui.metaColor(),'#171a19');checks++;
ui.click();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;

// The same shipped inline controller also selects the primary navigation.
// A story is not the homepage, a historical /sayfa/N page is the archive,
// and the Orbit newsroom must not mark the news feed as active.
function activeNavigation(pathname) {
  const nav = ['tumu', 'yapay-zeka', 'yazilim', 'donanim', 'arsiv', 'masa'].map((value) => {
    const attrs = new Map();
    return {
      value,
      attrs,
      getAttribute(name) { assert.equal(name, 'data-topic-link'); return value; },
      setAttribute(name, value) { attrs.set(name, value); },
    };
  });
  const doc = {
    documentElement: {dataset: {}},
    querySelector(name) { return name === '[data-theme-toggle]' ? null : null; },
    querySelectorAll(name) { assert.equal(name, '[data-topic-link]'); return nav; },
  };
  runInNewContext(script, {
    document: doc,
    window: {matchMedia(){ return { matches: false, addEventListener(){} }; }},
    location: {pathname},
    localStorage: {getItem() {return null;}},
  });
  return nav.filter((link) => link.attrs.get('aria-current') === 'page').map((link) => link.value);
}
for (const [path, expected] of [
  ['/', 'tumu'],
  ['/yeni/', 'tumu'],
  ['/kategori/yapay-zeka/', 'yapay-zeka'],
  ['/yeni/kategori/yazilim/', 'yazilim'],
  ['/arsiv/', 'arsiv'],
  ['/yeni/arsiv/', 'arsiv'],
  ['/sayfa/2/', 'arsiv'],
  ['/masa/', 'masa'],
  ['/yeni/masa/', 'masa'],
  ['/avrupada-klima-talebi-sicak-hava-dalgalariyla-yeniden-gundemde/', null],
  ['/hakkimizda/', null],
]) {
  assert.deepEqual(activeNavigation(path), expected ? [expected] : [], `Active nav on ${path}`);
  checks++;
}
console.log('Theme and primary navigation: '+checks+' real inline controller checks passed');
