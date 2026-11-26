// Generated from assets/island-guardian-studio.html by npm run export:guardian.
/* Auron • original 96px portrait. All artwork is integer pixel geometry. */
const GuardianArt = (() => {
 const palette={ink:'#29343f',deep:'#384958',slate:'#526775',silver:'#84999e',mist:'#b5c7c5',white:'#e1e6d7',light:'#f8efd7',skinDark:'#85534a',skinShade:'#b87858',skin:'#dba274',skinLight:'#f2c38b',skinGlow:'#ffdda1',goldDark:'#805836',gold:'#c58a45',goldLight:'#edbe68',goldGlow:'#ffe3a0',tealDark:'#275d60',teal:'#448b83',tealLight:'#80c5ad',sea:'#345a6d',seaLight:'#608a91',cream:'#e0c89e',creamDark:'#a88e70',mouth:'#683f42',tongue:'#c57868',eye:'#f6e9cf',iris:'#397d79'};
 const specs=[
 ['neutral','Neutral','Calm and attentive','flat','open','calm'],['happy','Happy','Warm and welcoming','soft','smile','smile'],['laughing','Laughing','Delighted and theatrical','lift','laugh','laugh'],['thinking','Thinking','Puzzling over a clue','think','side','think'],['surprised','Surprised','Wide-eyed discovery','high','wide','o'],['worried','Worried','Anxious for the villagers','worry','worried','tense'],['angry','Angry','Controlled, comical frustration','angry','narrow','grit'],['smug','Smug','Playful and self-satisfied','smug','smug','smirk'],['sad','Sad','Quiet sorrow','sad','sad','frown'],['sleepy','Sleepy','Drowsy and unhurried','low','sleep','sleep'],['proud','Proud','Quietly triumphant','proud','proud','proud'],['mysterious','Mysterious','A knowing, secretive gaze','mystery','mystery','secret']
 ];
 const expressions=specs.map(([key,name,description,brow,eye,mouth],i)=>({id:`E${String(i+1).padStart(2,'0')}`,key,name,description,brow,eye,mouth,atlas:{x:i%4*96,y:Math.floor(i/4)*96,width:96,height:96},layers:['robe','hair','head','beard','headpiece','eyebrows','eyes','mouth','moustache'],animations:['idle','blink','talking','appearance'],mouthStates:['closed','slightly-open','open'],filename:`guardian-${key}.svg`}));
 const animations={idle:{frames:[{}, {}, {}, {}, {}, {blinking:true}, {}],fps:3},blink:{frames:[{}, {blinking:true}, {}],fps:6},talking:{frames:[{mouthFrame:0},{mouthFrame:1},{mouthFrame:2}],fps:7},appearance:{frames:[{effect:1},{effect:2},{effect:3},{effect:2},{effect:0}],fps:6}};
 const col=c=>palette[c]||c;
 const rect=(x,y,w,h,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col(c)}"/>`;
 // Rasterize hand-authored silhouettes into integer pixel runs (not smooth vector diagonals).
 const poly=(c,pts)=>{let d='',prev=new Map();const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);for(let y=Math.min(...ys);y<Math.max(...ys);y++){let runs=[],start=null;for(let x=Math.min(...xs);x<=Math.max(...xs);x++){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const [a,b]=pts[i],[u,v]=pts[j];if(((b>y+.5)!=(v>y+.5))&&(x+.5<(u-a)*(y+.5-b)/(v-b)+a))inside=!inside;}if(inside&&start===null)start=x;if(!inside&&start!==null){runs.push([start,x-start]);start=null;}}let next=new Map();for(const [x,w] of runs){let k=x+','+w;next.set(k,prev.has(k)?prev.get(k):y);}for(const [k,sy] of prev)if(!next.has(k)){let [x,w]=k.split(',');d+=`M${x} ${sy}h${w}v${y-sy}h-${w}Z`;}prev=next;}for(const [k,sy] of prev){let [x,w]=k.split(',');d+=`M${x} ${sy}h${w}v${Math.max(...ys)-sy}h-${w}Z`;}return `<path fill="${col(c)}" d="${d}"/>`;};
 const P=(c,...coords)=>poly(c,coords.reduce((a,v,i)=>{if(i%2===0)a.push([v,coords[i+1]]);return a;},[]));
 const R=rect; const group=(id,s)=>`<g data-layer="${id}">${s}</g>`;
 const base=group('back-hair',[
 P('ink',19,29,20,18,26,10,38,6,54,6,66,10,76,18,78,29,76,41,82,52,81,65,87,75,82,83,70,82,60,75,35,78,20,85,10,79,14,68,12,56,18,43),
 P('slate',22,29,23,19,30,13,41,9,56,10,68,15,74,23,73,40,79,54,77,65,83,75,79,79,69,77,60,70,35,73,20,80,14,77,18,66,16,55,22,43),
 P('silver',24,24,33,14,45,11,58,13,70,20,72,33,69,45,75,56,72,67,78,75,70,73,64,64,63,49,32,47,27,63,20,74,18,73,22,60,20,54,25,40),
 P('mist',25,25,31,17,40,13,44,13,35,22,30,33,28,47,22,58,26,46,25,37),P('mist',58,14,69,21,70,31,67,42,70,51,73,59,69,62,64,52,63,40,65,29),
 P('white',28,25,34,17,40,15,35,22,31,32,29,41,27,40),P('white',61,18,67,23,68,30,65,39,64,32,65,26)
 ].join(''))+group('robe',[
 P('ink',33,66,62,66,72,72,83,76,91,85,93,94,92,96,4,96,4,90,9,81,19,75,30,72),
 P('sea',34,70,62,70,70,76,82,80,88,86,90,96,7,96,10,87,17,80,30,76),
 P('seaLight',13,86,22,80,33,75,40,78,31,85,20,88,16,96,9,96),P('deep',67,77,79,81,86,88,88,96,76,96,73,88),
 P('creamDark',32,72,43,75,52,83,63,73,71,77,67,88,60,96,34,96,26,85),
 P('cream',33,74,43,78,50,85,58,77,65,75,68,80,62,90,57,96,36,96,31,87),
 P('light',34,76,42,80,47,86,43,91,37,89,32,83),P('goldDark',65,76,74,78,72,85,66,96,59,96,63,87),P('gold',66,78,71,79,69,86,64,96,61,96),R(67,81,3,2,'goldLight'),
 P('goldDark',16,86,25,82,30,86,27,92,23,96,16,96,19,91),P('gold',18,86,25,84,27,87,24,92,21,96,19,96,22,89),R(20,86,3,2,'goldLight'),
 P('ink',47,85,53,85,58,90,55,95,46,95,42,90),P('gold',47,86,53,86,56,90,53,94,47,94,44,90),P('tealDark',48,88,52,88,54,90,51,93,48,92,46,90),R(49,88,2,2,'tealLight'),R(51,90,2,1,'teal'),R(77,89,5,2,'seaLight'),R(79,91,5,2,'seaLight'),R(12,94,4,2,'slate')
 ].join(''))+group('head',[
 P('ink',31,22,39,17,57,17,66,23,70,34,70,45,74,44,77,48,76,55,70,60,66,68,57,76,39,76,30,68,25,59,20,56,18,49,21,44,26,45,26,33),
 P('skinShade',30,26,39,20,56,20,65,26,67,35,67,48,71,46,74,48,73,54,67,57,64,67,56,73,40,73,32,67,28,57,23,55,21,49,23,47,28,49,28,35),
 P('skin',32,27,40,22,55,22,63,27,65,36,64,49,66,54,61,65,55,69,40,69,33,63,30,53,31,44,30,35),
 P('skinLight',34,28,42,24,54,24,60,28,62,35,58,41,55,47,57,53,53,61,42,61,35,56,32,47,33,38),
 P('skinGlow',36,28,43,25,53,25,57,28,50,29,43,28,37,31),
 P('skinShade',32,43,36,45,37,52,34,55,31,51),P('skinShade',59,43,63,43,65,50,61,56,58,54),
 P('skinDark',23,49,26,50,28,54,25,54),P('skinDark',70,49,73,49,71,53,68,55),R(23,48,2,1,'skinLight'),R(71,48,2,1,'skinLight'),
 // nose: strong, rounded, with warm highlight
 P('skinShade',46,40,50,40,51,45,54,50,52,54,46,55,43,52,44,48),P('skinLight',46,42,49,41,49,48,52,50,50,52,45,51),R(47,44,2,5,'skinGlow'),R(44,52,3,1,'skinDark'),R(51,52,2,1,'skinDark'),
 R(37,30,9,1,'skin'),R(39,32,5,1,'skin'),R(53,31,5,1,'skin'),R(34,53,4,1,'skin'),R(59,53,3,1,'skinShade')
 ].join(''))+group('beard',[
 P('ink',28,48,32,52,33,57,39,60,57,60,63,56,64,51,68,47,70,59,68,69,64,74,65,80,60,87,53,91,44,90,36,86,33,80,27,75,25,66,25,57),
 P('silver',29,51,33,59,38,63,57,63,64,58,67,52,67,61,65,68,61,74,62,80,58,85,52,88,45,87,38,83,36,78,30,73,28,65),
 P('mist',30,54,35,62,41,65,54,65,60,62,65,55,65,64,60,71,59,78,55,82,51,85,45,84,41,81,38,75,32,71,30,65),
 P('white',31,58,37,65,42,66,44,71,40,75,37,72,36,68,32,66),P('white',62,60,59,68,54,72,56,77,52,82,47,83,43,80,46,74,45,68,52,67,57,65),
 P('slate',31,68,34,72,38,74,41,80,45,83,43,85,37,81,35,77,30,73),P('silver',63,67,59,73,60,77,56,83,52,86,52,82,56,78,55,73),
 P('light',40,68,43,69,43,72,40,73,38,71),P('light',51,69,55,68,55,71,51,74,49,73),R(47,79,4,2,'white'),R(46,82,3,1,'mist'),
 // face opening, behind expression mouth
 P('slate',38,55,57,55,60,60,58,65,53,68,43,68,37,65,35,60),P('skinShade',39,56,56,56,58,60,56,64,52,66,44,66,39,64,37,60),P('skin',40,57,55,57,56,61,53,65,44,65,40,62)
 ].join(''))+group('front-hair',[
 P('deep',23,22,29,15,39,12,51,13,57,10,65,14,72,22,72,33,68,42,64,44,63,38,65,31,60,24,54,21,43,22,35,26,31,33,32,41,28,45,24,39),
 P('mist',25,23,31,17,40,14,51,15,57,12,64,16,69,23,69,33,66,40,65,40,67,31,62,23,55,19,43,20,34,24,29,32,30,39,27,42,26,36),
 P('white',27,23,33,18,42,15,48,16,39,20,33,25,30,31,28,36,28,29),P('white',52,16,57,14,63,17,67,23,67,28,63,23,58,20),P('light',32,20,39,17,44,17,37,20,33,23),
 P('silver',23,31,25,37,25,47,22,48,21,43),P('silver',70,32,73,37,73,45,70,47,69,42),
 // ear ornaments, shell studs
 R(22,56,4,4,'ink'),R(23,56,3,3,'gold'),R(23,56,1,1,'goldGlow'),R(70,56,4,4,'ink'),R(70,56,3,3,'gold'),R(71,57,1,2,'tealLight')
 ].join(''))+group('headpiece',[
 // tide compass: two asymmetric wave fins and central sea-glass lozenge
 P('ink',28,24,25,17,31,19,31,10,37,15,41,14,48,6,55,14,59,15,65,10,65,19,72,16,69,25,61,29,48,31,35,28),
 P('goldDark',29,23,28,19,34,22,34,14,38,18,43,16,48,9,53,16,58,18,63,14,62,22,69,19,67,24,60,27,48,29,36,26),
 P('gold',30,22,36,24,36,18,40,20,44,17,48,11,52,17,56,20,61,18,60,24,67,21,65,24,59,26,48,28,37,25),
 P('goldLight',35,23,37,20,40,22,45,19,48,13,51,19,56,22,60,20,61,23,56,25,48,26,40,25),
 P('ink',48,14,54,20,54,24,48,29,42,24,42,20),P('tealDark',48,16,52,20,52,24,48,27,44,24,44,20),P('teal',48,17,51,21,50,24,48,26,45,23,45,20),P('tealLight',48,18,50,20,48,23,46,22,46,20),R(47,19,2,2,'light'),R(36,24,3,1,'goldGlow'),R(57,24,3,1,'goldGlow')
 ].join(''));
 const browPoints={flat:[[33,35,38,33,43,34,44,37,38,36,33,38],[52,34,58,33,63,35,63,38,58,36,52,37]],soft:[[33,36,37,33,42,33,44,36,38,35,33,39],[52,36,54,33,59,33,63,36,63,39,58,35,52,36]],lift:[[33,34,38,31,43,32,44,35,38,34,33,37],[52,35,53,32,58,31,63,34,63,37,58,34,52,35]],think:[[33,35,37,31,42,30,44,33,39,34,33,38],[52,37,58,35,63,36,63,39,58,38,52,40]],high:[[33,33,37,29,42,29,44,32,38,32,33,36],[52,32,54,29,59,29,63,33,63,36,58,32,52,32]],worry:[[33,37,38,36,43,31,45,34,42,38,34,40],[51,34,53,31,58,36,63,37,62,40,54,38]],angry:[[32,33,37,34,44,39,44,42,37,38,32,37],[52,39,59,34,64,33,64,37,59,38,52,42]],smug:[[32,35,37,31,43,31,44,34,38,34,33,38],[52,37,58,35,63,36,63,39,58,38,52,40]],sad:[[33,38,39,36,43,32,45,35,42,39,34,41],[51,35,53,32,57,36,63,38,62,41,54,39]],low:[[33,36,38,35,43,36,44,39,38,38,33,39],[52,36,58,35,63,36,63,39,58,38,52,39]],proud:[[33,34,38,31,43,32,44,35,38,34,33,37],[52,35,53,32,58,31,63,34,63,37,58,34,52,35]],mystery:[[33,35,38,32,43,33,44,36,38,35,33,38],[52,35,58,34,63,36,63,39,58,37,52,38]]};
 function brows(type){return browPoints[type].map(p=>P('slate',...p)+P('white',...p.map((v,i)=>i%2?v-1:v))).join('');}
 function eyes(type,blink){let s='';for(let i=0;i<2;i++){let x=i?52:33;let y=39;let mode=type;if(blink)mode='closed';if(mode==='laugh'||mode==='smile'||mode==='closed'){let a=mode==='closed'?0:mode==='laugh'?3:2;s+=P('skinDark',x,y+4,x+2,y+3-a,x+5,y+2-a,x+8,y+3-a,x+11,y+4,x+10,y+5,x+8,y+4-a,x+5,y+4-a,x+2,y+5,x,y+5);if(mode!=='closed')s+=R(x+1,y+7,3,1,'skinShade');continue;}
 let h=mode==='wide'?8:mode==='narrow'||mode==='sleep'?3:mode==='smug'?(i?3:5):mode==='mystery'?4:mode==='proud'?4:5;let yy=y+(mode==='wide'?-1:mode==='narrow'||mode==='sleep'?3:mode==='mystery'||mode==='proud'?2:1);let irisX=mode==='side'?x+7:mode==='mystery'?x+3:x+5; if(mode==='smug'&&i)irisX=x+6;
 s+=P('skinDark',x,yy+1,x+2,yy-1,x+9,yy-1,x+11,yy+1,x+10,yy+h,x+2,yy+h,x,yy+h-1);s+=R(x+2,yy+1,8,Math.max(1,h-1),'eye');s+=R(irisX-1,yy+1,3,Math.max(1,h-1),'iris');s+=R(irisX,yy+1,2,Math.max(1,h-2),'ink');if(h>=4)s+=R(irisX-1,yy+1,1,1,'light');
 if(mode==='sad'||mode==='worried')s+=R(i?x+8:x+1,yy+h+1,2,1,'skinShade');if(mode==='sleep')s+=R(x+2,yy-1,8,2,'skinShade');if(mode==='narrow')s+=P('skinDark',x,yy-2,x+11,yy+(i?-1:2),x+11,yy+1,x,yy+1);
 }return s;}
 function mouth(type,frame){if(frame===1||frame===2){let h=frame===1?3:6;return P('mouth',42,59,46,58,51,58,55,60,53,60+h,45,60+h,41,61)+R(45,59,7,1,'light')+(frame===2?R(46,64,6,1,'tongue'):'');}if(frame===0) return P('mouth',41,60,45,59,51,59,55,60,52,62,45,62);switch(type){case 'smile':case 'proud':return P('mouth',39,59,43,61,51,61,56,58,55,63,52,65,44,65,40,62)+R(44,61,9,2,'light');case 'laugh':return P('mouth',39,58,44,59,53,59,57,58,56,63,53,67,44,67,40,63)+R(43,60,11,2,'light')+R(46,65,7,1,'tongue');case 'think':return P('mouth',43,61,49,60,54,61,53,63,48,62,43,63);case 'o':return P('mouth',45,58,51,58,54,61,53,65,50,67,46,66,43,63,43,60)+R(47,64,4,1,'tongue');case 'tense':return P('mouth',40,63,44,60,51,60,55,62,54,64,50,62,45,62,41,64);case 'grit':return P('mouth',40,59,54,59,56,62,53,65,43,65,40,63)+R(43,60,10,3,'light')+R(43,62,10,1,'skinShade');case 'smirk':return P('mouth',41,61,47,61,52,59,56,57,56,61,52,64,46,64,41,63)+R(49,61,5,1,'light');case 'frown':return P('mouth',40,64,44,60,51,59,55,63,55,65,51,62,45,62,41,66);case 'sleep':return P('mouth',45,60,50,60,52,62,50,65,46,65,44,63);case 'secret':return P('mouth',42,61,47,62,52,61,55,59,55,62,51,64,46,64);default:return P('mouth',41,60,46,61,51,61,55,60,53,63,44,63);}}
 const moustache=group('moustache',P('slate',47,53,43,53,39,55,34,57,32,56,33,60,38,62,43,60,48,57,53,60,58,62,63,59,64,56,60,57,55,55,51,53)+P('white',47,53,43,54,39,56,35,58,33,57,35,60,39,60,43,58,48,56,53,58,58,60,61,59,63,57,60,58,56,56,51,54)+P('light',42,55,46,54,47,55,42,57,38,58,38,57)+P('light',49,54,54,55,58,57,57,58,53,57,49,55));
 function effect(n){if(!n)return '';const spark=(x,y,c)=>R(x,y-2,1,5,c)+R(x-2,y,5,1,c);return group('magic',spark(14,26,'goldLight')+spark(82,35,'tealLight')+(n>1?spark(10,65,'tealLight')+spark(84,67,'goldLight'):'')+(n>2?spark(77,13,'goldGlow')+spark(19,14,'light'):'') );}
 function body(options={}){const {expression='neutral',blinking=false,talking=false,mouthFrame,effect:fx=0}=options;const e=expressions.find(e=>e.key===expression||e.id===expression)||expressions[0];let accents='';if(['happy','laughing','proud'].includes(e.key))accents=R(34,50,4,2,'skinShade')+R(59,50,3,2,'skinShade');if(e.key==='surprised')accents=R(43,28,10,1,'skinShade')+R(45,30,6,1,'skin');if(e.key==='angry')accents=R(46,36,1,4,'skinShade')+R(50,36,1,4,'skinShade');return base+group('eyebrows',brows(e.brow))+group('eyes',eyes(e.eye,blinking))+group('expression-accents',accents)+group('mouth',mouth(e.mouth,mouthFrame??(talking?1:undefined)))+moustache+effect(fx);}
 function renderGuardian(options={}){let scale=Number(options.scale)||1;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${96*scale}" height="${96*scale}" shape-rendering="crispEdges" style="image-rendering:pixelated" role="img" aria-label="Island guardian portrait">${body(options)}</svg>`;}
 function atlas(keys,frames=[{}],columns=4){const count=keys.length*frames.length,rows=Math.ceil(count/columns);let s='',i=0;for(const key of keys)for(const f of frames){s+=`<g transform="translate(${i%columns*96} ${Math.floor(i/columns)*96})">${body({expression:key,...f})}</g>`;i++;}return `<svg xmlns="http://www.w3.org/2000/svg" width="${columns*96}" height="${rows*96}" viewBox="0 0 ${columns*96} ${rows*96}" shape-rendering="crispEdges">${s}</svg>`;}
 return {palette,expressions,animations,renderGuardian,atlas};
})();

export { GuardianArt };
