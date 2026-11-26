import { readFile } from 'node:fs/promises';

const studios = {
  island: ['Island Map Studio (1).html', '/* ---------- app state / UI ---------- */', `
    export const data = buildData();
    export const validation = validateMap();
    export const terrainSvg = () => renderMap({bridge:0,farm:0,garden:0,mon:0}, {
      only:['ocean-background','terrain-base','terrain-transitions','water-details','paths-and-farmland'],noFx:true
    });
    export const tiles = Object.keys(TL).map(id => 't_'+id);
    export const environmentSvg = assetSVG;
    export const canopySvg = id => {
      const {m,w,h} = symMap('a_'+id+'__top');
      return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" shape-rendering="crispEdges">'+runs(m,w,h)+'</svg>';
    };
    export const effectSvg = (id,frame) => {
      const {m,w,h} = symMap('a_'+ANIMS[id].frames[frame]);
      return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" shape-rendering="crispEdges">'+runs(m,w,h)+'</svg>';
    };
    const waterfall = OBJS.find(o => o.type === 'waterfall');
    export const effects = [
      ...RIP.map(([x,y]) => ({id:'water_ripple',x:x*TS,y:y*TS})),
      ...WAV.map(([x,y,dx,dy]) => ({id:'shore_waves',x:x*TS+dx,y:y*TS+dy})),
      {id:'waterfall_flow',x:waterfall.anchor.x-24,y:waterfall.anchor.y-64}
    ];
  `],
  character: ['Villager Character Studio.html', '/* ---------- UI ---------- */', `
    export { createCharacter, generateRandomCharacter, renderCharacterSVG, animsFor, fps, metadata, DIRS, STG, A };
  `],
  building: ['Building Studio.html', '/* ---------- preview ---------- */', `
    const sprite = (type,state) => {
      const {w,h,svg} = get(type,state);
      return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" shape-rendering="crispEdges">'+svg+'</svg>';
    };
    export { BD, statesOf, meta, sprite };
  `],
  collectible: ['Collectible Studio.html', '/* ---------- state + UI ---------- */', `
    export { COLLECTIBLES, RARITY_DEFINITIONS, animsOf, renderCollectibleSVG, renderAnimationFrame };
  `],
  resource: ['Resource & Food Studio.html', '/* ---------- UI ---------- */', `
    export { ITEMS, SRC, atlasJSON, renderResourceSVG, renderInventorySlot };
  `],
  wildlife: ['Wildlife Studio.html', '/* ---------- UI state ---------- */', `
    export { WILDLIFE, HABITAT_TYPES, getAnimalMetadata, idleAnim, renderAnimalSVG };
  `],
};

function section(script, start, end) {
  const from = script.indexOf(start);
  const to = script.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Studio boundary missing: ${start} → ${end}`);
  return script.slice(from, to);
}

export async function readGuardianModule() {
  const html = await readFile(new URL('../assets/island-guardian-studio.html', import.meta.url), 'utf8');
  const start = '<script id="rendererSource">';
  const renderer = section(html, start, 'const renderGuardian=GuardianArt.renderGuardian;').slice(start.length);
  return '// Generated from assets/island-guardian-studio.html by npm run export:guardian.\n'
    + renderer.trim().replaceAll('\r\n', '\n') + '\n\nexport { GuardianArt };\n';
}

export async function readStudioModules() {
  const modules = await Promise.all(Object.entries(studios).map(async ([key, [file, boundary, exports]]) => {
    const html = await readFile(new URL('../assets/' + file, import.meta.url), 'utf8');
    const script = section(html, '<script>', '</script>').slice('<script>'.length);
    let code = section(script, '', boundary);
    if (key === 'island') {
      code += section(script, 'function validateMap()', "$('#bval').onclick");
      code += section(script, 'const assetSVG=', 'const CATS=');
      code += section(script, 'function buildData()', 'const XD=');
    }
    if (key === 'character') code += section(script, 'function metadata(', 'async function exportAs');
    return [key, `// Imported from ${file}\n${code}\n${exports}\nexport const sourceFile = ${JSON.stringify(file)};\n`];
  }));
  const sourceFile = 'ui-hud-studio.html';
  const html = await readFile(new URL('../assets/' + sourceFile, import.meta.url), 'utf8');
  const ui = [
    section(html, '/* ===================== NEW UI ARTWORK', '/*GAMEUI-START*/'),
    section(html, '/*GAMEUI-START*/', '/*GAMEUI-END*/'),
    section(html, 'const UI_COMPONENTS=', '\n'),
    `GameUI.icons = Object.fromEntries(Object.entries(UI_ICONS).map(([key, icon]) => [key, icon.svg]));
     export { GameUI, UI_ICONS, UI_MARKERS, UI_THEME, UI_COMPONENTS, applyTheme, timeBox };
     export const frames = buildFrames(UI_THEME);
     export const sourceFile = ${JSON.stringify(sourceFile)};`,
  ].join('\n');
  const uiCss = section(html, '<style id="gameui">', '</style>').slice('<style id="gameui">'.length);
  return { ...Object.fromEntries(modules), ui, uiCss };
}
