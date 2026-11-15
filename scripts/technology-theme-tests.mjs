import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// The real inline script is executed directly against deterministic DOM and
// MediaQuery mocks, so a markup refactor cannot make a fake duplicated
// controller test green while the shipped Astro layout is still broken.
const layout=readFileSync(new URL('../src/layouts/TechnologyLayout.astro',import.meta.url),'utf8');
const script=layout.match(/<script is:inline>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
assert.ok(script,'TechnologyLayout must contain its real inline theme controller');
let checks=1;

function renderTheme({saved=null,systemDark=false,storeThrows=false}={}) {
  const attrs=new Map(), storage=new Map();
  const root={dataset:{}};
  let onClick=null,onSystemChange=null;
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
    querySelector(name){return name==='[data-theme-toggle]'?button:null;},
    querySelectorAll(){return [];},
  };
  const localStorage={
    getItem(name){assert.equal(name,'equinox-haber-theme');if(storeThrows)throw Error('no storage');return saved;},
    setItem(name,value){if(storeThrows)throw Error('no storage');storage.set(name,value);},
  };
  runInNewContext(script,{document:doc,window:{matchMedia(){return media;}},location:{pathname:'/'},localStorage});
  return {root,attrs,storage,button,media,click:()=>onClick(),change:()=>onSystemChange()};
}
let ui=renderTheme();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui=renderTheme({saved:'dark'});
assert.equal(ui.root.dataset.tbTheme,'dark');checks++;
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
ui.click();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
assert.equal(ui.root.dataset.tbTheme,'light');checks++;
assert.equal(ui.storage.get('equinox-haber-theme'),'light');checks++;
ui=renderTheme({saved:'light',systemDark:true});
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui=renderTheme({systemDark:true});
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
ui.media.matches=false;ui.change();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui.media.matches=true;ui.change();
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
ui.click();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui.media.matches=false;ui.change();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
ui=renderTheme({storeThrows:true,systemDark:true});
assert.equal(ui.attrs.get('aria-pressed'),'true');checks++;
ui.click();
assert.equal(ui.attrs.get('aria-pressed'),'false');checks++;
console.log('Technology theme accessibility: '+checks+' real inline controller checks passed');
