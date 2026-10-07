const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'update-manifest.json'), 'utf8'));
const localChannelsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'barra_mansa_channels.json'), 'utf8')).response.docs;
const spChannelsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'channels.json'), 'utf8')).response.docs;
const categoryMap = {
  '124':'Canal NET','126':'Canal NET','16':'Abertos','84':'Abertos','184':'Abertos','204':'Abertos','8':'Variedades','45':'Variedades',
  '3':'Esportes','46':'Esportes','1':'Documentários','47':'Documentários','5':'Infantis','48':'Infantis',
  '4':'Filmes','51':'Filmes','64':'Telecine','52':'Telecine','65':'HBO','53':'HBO','66':'Premiere','125':'Premiere'
};
const canonicalName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const localIds = new Set(localChannelsRaw.map(c => String(c.id_canal)));
const localNames = new Set(localChannelsRaw.map(c => canonicalName(c.nome || c.st_canal)));
const spComplementRaw = spChannelsRaw.filter(c => !localIds.has(String(c.id_canal)) && !localNames.has(canonicalName(c.nome || c.st_canal)));
const spComplementIds = new Set(spComplementRaw.map(c => String(c.id_canal)));
const channelsRaw = [...localChannelsRaw.map(c => ({...c, origin:''})), ...spComplementRaw.map(c => ({...c, origin:'SP'}))];
let channels = channelsRaw.map(c => ({
  i:String(c.id_canal), n:String(c.nome || c.st_canal || 'Canal').trim(), c:String(c.cn_canal ?? '—').trim(),
  l:String(c.url_imagem || '').trim(), g:(['55','104'].includes(String(c.id_categoria)) || /BBC World News|Bloomberg TV|CNN International|DW-TV|JP News/i.test(String(c.nome || c.st_canal || ''))) ? 'Notícias' : (categoryMap[String(c.id_categoria)] || 'Outros'), s:c.origin
})).sort((a,b)=>a.n.localeCompare(b.n,'pt-BR',{sensitivity:'base'}) || Number(a.c)-Number(b.c));

const textKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sportTerms = /\b(futebol|futsal|brasileir|campeonato|copa|liga|superliga|formula|grand prix|gp\b|motogp|moto ?[23]\b|superbike|indy|nascar|rally|tenis|atp|wta|basquete|nba|nfl|mlb|nhl|volei|rugby|judo|boxe|knockout|ufc|mma|surf|skate|atletismo|handebol|automobilismo|corrida|ciclismo|golfe|pga|fifa|libertadores|sul-americana|champions|premier league|la liga|bundesliga|serie a|worldsbk|redzone)\b/;
const competitionTerms = /\b(oitavas|quartas|semifinais?|finais?|treino livre|classificacao|etapa|prova|partida|jogo)\b/;
const studioTerms = /\b(pre-jogo|pre-hora|aquecimento|sportscenter|news|redacao|selecao sportv|troca de passes|depois do jogo|mesa-redonda|resenha|sala do esporte|bola rolando|esporte agora|mundo f|equipe f|f show|ta on|ta na area|g4|tempo tecnico|pelas quadras|hello l\.a|mina de passe|supermotor|lancamento|pesagem)\b/;
const isLiveSport = title => {
  const value = textKey(title);
  return /\bao vivo\b/.test(value) && !studioTerms.test(value) && (sportTerms.test(value) || competitionTerms.test(value) || /\s+x\s+/.test(value));
};

const jpHtml = fs.readFileSync(path.join(__dirname, 'jovem_pan_programacao.html'), 'utf8');
const decodeHtml = value => String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const jpSchedule = {};
for (const section of jpHtml.matchAll(/<section[\s\S]*?data-day-of-week="([1-7])"[\s\S]*?<\/section>/g)) {
  const items = [];
  for (const article of section[0].matchAll(/<article[\s\S]*?<\/article>/g)) {
    const times = article[0].match(/(\d{2})h(\d{2})[\s\S]*?—\s*(\d{2})h(\d{2})/);
    const title = article[0].match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!times || !title) continue;
    const start = +times[1] * 60 + +times[2];
    let end = +times[3] * 60 + +times[4];
    if (end <= start) end += 1440;
    items.push([start, Math.min(1440, end), decodeHtml(title[1]), 0]);
  }
  jpSchedule[section[1]] = items;
}

const espn3Html = fs.readFileSync(path.join(__dirname, 'espn3_programacao.html'), 'utf8');
const espn3Schedule = {};
const espn3Days = {quarta:'2026-10-07',quinta:'2026-10-08',sexta:'2026-10-09',sabado:'2026-10-10',domingo:'2026-10-11'};
for (const [anchor,date] of Object.entries(espn3Days)) {
  const section = espn3Html.match(new RegExp('<h2 id="' + anchor + '"[\\s\\S]*?<\\/h2>([\\s\\S]*?)(?=<h2 id="|$)'));
  if (!section) continue;
  const entries = [...section[1].matchAll(/<li>(\d{2}):(\d{2})\s+([\s\S]*?)<\/li>/g)].map(m => [+m[1] * 60 + +m[2], decodeHtml(m[3])]);
  espn3Schedule[date] = entries.map((item,index) => [item[0], index + 1 < entries.length ? entries[index + 1][0] : 1440, item[1], isLiveSport(item[1]) ? 1 : 0]);
}
const espn6Docs = JSON.parse(fs.readFileSync(path.join(__dirname, 'programs_channel_1091.json'), 'utf8')).response.docs;
const history2Docs = JSON.parse(fs.readFileSync(path.join(__dirname, 'programs_channel_1329.json'), 'utf8')).response.docs;

const programs = {};
for (const key of manifest.dates) {
  const localDocs = JSON.parse(fs.readFileSync(path.join(__dirname, `barra_mansa_programs_${key}.json`), 'utf8')).response.docs;
  const spDocs = JSON.parse(fs.readFileSync(path.join(__dirname, `programs_${key}.json`), 'utf8')).response.docs.filter(p => spComplementIds.has(String(p.id_canal)));
  const hasEspn6 = localDocs.some(p => String(p.id_canal) === '1091');
  const espn6Fallback = hasEspn6 ? [] : espn6Docs.filter(p => String(p.dh_inicio || '').startsWith(key));
  const hasHistory2 = localDocs.some(p => String(p.id_canal) === '1011');
  const history2Fallback = hasHistory2 ? [] : history2Docs.filter(p => String(p.dh_inicio || '').startsWith(key)).map(p => ({...p,id_canal:'1011'}));
  const docs = [...localDocs, ...spDocs, ...espn6Fallback, ...history2Fallback];
  const grouped = {};
  for (const p of docs) {
    const start = String(p.dh_inicio || '');
    const end = String(p.dh_fim || '');
    const sm = +(start.slice(11,13)||0)*60 + +(start.slice(14,16)||0);
    let em = +(end.slice(11,13)||0)*60 + +(end.slice(14,16)||0);
    if (end.slice(0,10) > start.slice(0,10) || em <= sm) em += 1440;
    const title = String(p.titulo || p.st_titulo || 'Título não informado');
    (grouped[String(p.id_canal)] ||= []).push([sm, Math.min(1440,em), title, isLiveSport(title) ? 1 : 0]);
  }
  const jsDay = new Date(key + 'T12:00:00Z').getUTCDay();
  const jpDay = String(jsDay === 0 ? 7 : jsDay);
  if (!(grouped['2430'] || []).length && jpSchedule[jpDay]?.length) grouped['2430'] = jpSchedule[jpDay];
  if (!(grouped['427'] || []).length && grouped['2432']?.length) grouped['427'] = grouped['2432'].map(p => [...p]);
  if (!(grouped['1853'] || []).length && grouped['1855']?.length) grouped['1853'] = grouped['1855'].map(p => [...p]);
  if (!(grouped['2251'] || []).length && espn3Schedule[key]?.length) grouped['2251'] = espn3Schedule[key].map(p => [...p]);
  programs[key] = grouped;
}

const removedChannelIds = new Set(['1986','2181','2063','2066','1292','2359','953','2351','2442','2437','1066','1648','2121','2157']);
const programCount = id => Object.values(programs).reduce((total,day) => total + (day[id]?.length || 0), 0);
const hdBase = name => textKey(name).replace(/[³²¹]/g, '').replace(/\s+hd\b/g, '').replace(/\s*\((?:local|tv rio sul|nova friburgo)\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
const duplicateGroups = new Map();
for (const channel of channels) (duplicateGroups.get(hdBase(channel.n)) || duplicateGroups.set(hdBase(channel.n), []).get(hdBase(channel.n))).push(channel);
const logoScore = value => !value ? 0 : value.includes('/brands/') ? 3 : value.includes('/default/') ? 2 : 1;
for (const group of duplicateGroups.values()) {
  const bestLogo = group.map(c => c.l).sort((a,b) => logoScore(b) - logoScore(a))[0] || '';
  for (const channel of group) if (!channel.l && bestLogo) channel.l = bestLogo.trim();
  const normals = group.filter(c => !/\bHD\b/i.test(c.n) && !removedChannelIds.has(c.i));
  const hd = group.filter(c => /\bHD\b/i.test(c.n));
  if (!normals.length || !hd.length) continue;
  const keeper = normals.sort((a,b) => programCount(b.i) - programCount(a.i) || a.n.length - b.n.length)[0];
  for (const duplicate of hd) {
    if (programCount(keeper.i) > 0 && programCount(duplicate.i) > 0) {
      removedChannelIds.add(duplicate.i);
      if (logoScore(duplicate.l) > logoScore(keeper.l)) keeper.l = duplicate.l.trim();
    }
  }
}
channels = channels.filter(c => !removedChannelIds.has(c.i));
for (const day of Object.values(programs)) for (const id of removedChannelIds) delete day[id];

const data = JSON.stringify({channels, programs});
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#b00020"><meta name="application-name" content="Grade TV Brasil"><meta name="description" content="Grade de programação da Claro TV Brasil com dados incorporados para consulta offline."><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Grade TV"><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='15' fill='%23b00020'/%3E%3Crect x='10' y='15' width='44' height='32' rx='7' fill='white'/%3E%3Cpath d='m24 8 8 7 8-7' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='m28 25 12 6-12 7z' fill='%23b00020'/%3E%3Ccircle cx='21' cy='52' r='3' fill='white'/%3E%3Ccircle cx='43' cy='52' r='3' fill='white'/%3E%3C/svg%3E"><title>Grade de Programação — Claro TV Brasil</title>
<style>
:root{--brand:#b00020;--red:#d6002f;--ink:#172033;--muted:#667085;--line:#e2e7ee;--soft:#f5f7fa;--slot:112px;--channel:218px;--row:86px}*{box-sizing:border-box}html,body{height:100%;margin:0}body{font:15px/1.35 Inter,Segoe UI,Arial,sans-serif;color:var(--ink);background:#eef1f5;overflow:hidden}.app{height:100%;display:grid;grid-template-rows:auto auto auto 1fr}.topbar{z-index:40;color:#fff;background:linear-gradient(115deg,#850017,#bf0025 62%,#df123d);padding:13px 18px;display:flex;align-items:center;gap:13px;box-shadow:0 2px 14px #71001642}.tvmark{width:42px;height:34px;border:2px solid #fff;border-radius:9px;display:grid;place-items:center;font-weight:900}.brand{display:flex;align-items:center;gap:12px}.brand h1{font-size:1.13rem;margin:0}.brand small{display:block;opacity:.82}.count{margin-left:auto;background:#ffffff1c;border:1px solid #ffffff48;padding:7px 11px;border-radius:20px;font-weight:750}.filters{z-index:35;background:#fff;border-bottom:1px solid var(--line);padding:10px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px #1018280b}.search-wrap{position:relative;min-width:280px;flex:0 1 470px}.search{width:100%;height:43px;border:1px solid #cfd5df;border-radius:11px;padding:0 42px 0 14px;font-size:1rem;outline:none}.search:focus{border-color:var(--brand);box-shadow:0 0 0 3px #b0002018}.clear{position:absolute;right:5px;top:5px;width:33px;height:33px;border:0;background:transparent;border-radius:8px;font-size:20px;cursor:pointer;color:#667085}.genres{display:flex;gap:7px;overflow:auto;scrollbar-width:thin}.genre{height:37px;border:1px solid #d7dce5;background:#fff;border-radius:19px;padding:0 13px;white-space:nowrap;color:#344054;font-weight:700;cursor:pointer}.genre.active{background:#172033;color:#fff;border-color:#172033}.now{margin-left:auto;height:41px;border:0;border-radius:10px;background:var(--brand);color:#fff;padding:0 17px;font-weight:800;cursor:pointer}.dates{z-index:30;background:#fff;border-bottom:1px solid var(--line);display:flex;gap:8px;padding:9px 14px;align-items:center}.date-strip{display:flex;gap:7px;overflow:auto;scrollbar-width:thin}.date,.navdate{border:1px solid #dce1e8;background:#fff;border-radius:10px;padding:7px 12px;min-width:68px;color:#344054;cursor:pointer}.navdate{min-width:44px}.date strong,.date span{display:block}.date span{font-size:.72rem;color:#667085;text-transform:uppercase}.date.active{background:var(--brand);color:#fff;border-color:var(--brand);box-shadow:0 5px 13px #b0002030}.date.active span{color:#fff}.source{margin-left:auto;color:#667085;font-size:.78rem;white-space:nowrap}.guide{min-height:0;overflow:auto;background:#fff;position:relative;scrollbar-color:#98a2b3 #eef1f5}.grid{min-width:calc(var(--channel) + 48 * var(--slot));position:relative}.row{display:grid;grid-template-columns:var(--channel) calc(48 * var(--slot));min-height:var(--row);border-bottom:1px solid var(--line)}.head{position:sticky;top:0;z-index:20;min-height:52px;background:#f8fafc}.channel-head,.channel{position:sticky;left:0;z-index:15;background:#fff;border-right:1px solid var(--line)}.channel-head{z-index:24;background:#f8fafc;display:flex;align-items:center;padding:0 15px;font-weight:850}.times{display:grid;grid-template-columns:repeat(48,var(--slot));height:52px}.time{border-right:1px solid var(--line);display:flex;align-items:center;padding-left:10px;color:#475467;font-weight:800;font-size:.82rem}.channel{height:var(--row);display:grid;grid-template-columns:76px 1fr;align-items:center;padding:8px 11px;gap:10px}.logo-wrap{position:relative;width:70px;height:50px;display:grid;place-items:center}.logo{width:70px;height:46px;object-fit:contain;background:#fff;border-radius:8px}.fallback{display:none;width:68px;height:44px;border-radius:8px;background:#eef1f5;color:#344054;place-items:center;font-weight:900;font-size:.75rem;text-align:center}.origin-badge{position:absolute;right:0;bottom:-2px;min-width:22px;padding:1px 5px;border-radius:7px;background:#667085;color:#fff;border:2px solid #fff;font-size:.58rem;font-weight:800;line-height:1.25;text-align:center;letter-spacing:.03em}.chname{font-weight:800;line-height:1.12}.chnum{margin-top:5px;color:var(--brand);font-weight:900;font-size:.86rem}.genre-label{margin-top:2px;color:#667085;font-size:.71rem}.programs{height:var(--row);position:relative;background:repeating-linear-gradient(to right,#fff 0,#fff calc(var(--slot) - 1px),#edf0f4 calc(var(--slot) - 1px),#edf0f4 var(--slot))}.program{position:absolute;top:9px;height:68px;border:1px solid #e1e5eb;background:#f8fafc;border-radius:6px;padding:8px 9px;overflow:hidden}.program:hover{z-index:9;border-color:#c8ced8;background:#fff;box-shadow:0 5px 14px #10182812}.ptitle{font-size:.78rem;font-weight:600;color:#344054;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ptime{font-size:.69rem;font-weight:500;color:#7b8494;margin-top:5px}.empty{position:absolute;inset:11px 14px;display:flex;align-items:center;border:1px dashed #c9ced7;background:#f8fafc;border-radius:10px;color:#667085;padding:0 15px;font-size:.84rem}.now-line{position:absolute;top:0;bottom:0;width:2px;background:#ec1747;z-index:18;pointer-events:none;box-shadow:0 0 0 1px #fff8}.now-line:before{content:'AGORA';position:sticky;top:2px;display:block;transform:translateX(-19px);width:40px;background:#ec1747;color:#fff;font:700 9px/18px Arial;text-align:center;border-radius:5px}.hidden{display:none!important}.no-results{padding:34px;position:sticky;left:0;width:100vw;color:#667085;font-size:1rem}@media(max-width:850px){:root{--channel:160px;--slot:94px;--row:80px}.topbar{padding:10px 12px}.count,.source{display:none}.filters{flex-wrap:wrap;padding:8px}.search-wrap{min-width:0;flex:1 1 calc(100% - 75px)}.genres{order:3;width:100%}.now{margin-left:0}.dates{padding:7px}.channel{grid-template-columns:54px 1fr;padding:7px}.logo-wrap{width:52px;height:43px}.logo,.fallback{width:52px;height:39px}.program{height:62px}}
.app{grid-template-rows:auto auto auto auto 1fr}.tabs{z-index:38;display:flex;gap:5px;padding:7px 14px 0;background:#fff;border-bottom:1px solid var(--line)}.tab{border:0;background:transparent;color:#667085;padding:9px 15px 10px;border-bottom:3px solid transparent;font-weight:800;cursor:pointer}.tab.active{color:var(--brand);border-bottom-color:var(--brand)}.tab[data-view="sports"]{color:#168447}.tab[data-view="sports"].active{color:#fff;background:#168447;border-bottom-color:#168447;border-radius:8px 8px 0 0}.sports-note{font-size:.75rem;color:#667085;margin-left:auto;align-self:center;padding-bottom:7px}.sports-live .program{background:#f7faf8;border-color:#dbe8df}.sports-live .program:hover{border-color:#b8d2c0}@media(max-width:850px){.tabs{padding-left:8px;overflow:auto}.tab{white-space:nowrap;padding-inline:10px}.sports-note{display:none}}
</style></head><body><main class="app"><header class="topbar"><div class="brand"><div class="tvmark">TV</div><div><h1>Grade de Programação</h1><small>Claro TV · Barra Mansa–RJ · dados incorporados</small></div></div><div class="count" id="count"></div></header><nav class="tabs" aria-label="Seções da programação"><button class="tab active" data-view="all">Grade completa</button><button class="tab" data-view="sports">Esportes ao vivo</button><span class="sports-note" id="sportsNote">Eventos marcados como “Ao Vivo” pela fonte oficial</span></nav><section class="filters" aria-label="Busca e filtros"><div class="search-wrap"><input id="search" class="search" type="search" placeholder="Digite o nome do canal ou programa" aria-label="Digite o nome do canal ou programa"><button id="clear" class="clear" aria-label="Limpar busca">×</button></div><div class="genres" id="genres" aria-label="Filtrar por gênero"></div><button id="nowBtn" class="now">Agora</button></section><nav class="dates" aria-label="Datas"><button class="navdate" id="prev" aria-label="Datas anteriores">‹</button><div class="date-strip" id="dateStrip"></div><button class="navdate" id="next" aria-label="Datas seguintes">›</button><span class="source">Barra Mansa–RJ · complementos SP identificados · Fonte: Claro</span></nav><section class="guide" id="guide" aria-label="Grade de programação"><div class="grid"><div class="row head"><div class="channel-head">CANAL</div><div class="times" id="times"></div></div><div id="rows"></div><div class="now-line hidden" id="nowLine"></div></div></section></main>
<script>const DB=${data};
const genres=['Todos','Abertos','Notícias','Variedades','Esportes','Documentários','Infantis','Filmes','Telecine','HBO','Premiere','Canal NET','Outros'];let selected=${JSON.stringify(manifest.dates[0])},activeGenre='Todos',activeView='all';const $=s=>document.querySelector(s),rows=$('#rows'),guide=$('#guide');const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();const hm=m=>String(Math.floor((m%1440)/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');for(let i=0;i<48;i++)$('#times').insertAdjacentHTML('beforeend','<div class="time">'+hm(i*30)+'</div>');
function dates(){return Object.keys(DB.programs)}function drawDates(){const strip=$('#dateStrip');strip.innerHTML=dates().map(k=>{const d=new Date(k+'T12:00:00');return '<button class="date '+(k===selected?'active':'')+'" data-date="'+k+'"><strong>'+String(d.getDate()).padStart(2,'0')+'</strong><span>'+d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')+'</span></button>'}).join('');strip.querySelector('.active')?.scrollIntoView({inline:'center',block:'nearest'});strip.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{selected=b.dataset.date;drawDates();render()})}function drawGenres(){$('#genres').innerHTML=genres.map(g=>'<button class="genre '+(g===activeGenre?'active':'')+'" data-genre="'+g+'">'+g+'</button>').join('');document.querySelectorAll('[data-genre]').forEach(b=>b.onclick=()=>{activeGenre=b.dataset.genre;drawGenres();render()})}function initials(n){return n.split(/\\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}function block(p){const left=p[0]/30,w=Math.max(.27,(p[1]-p[0])/30),title=p[2].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');return '<div class="program" style="left:calc('+left+' * var(--slot));width:calc('+w+' * var(--slot) - 3px)" title="'+title+' · '+hm(p[0])+'–'+hm(p[1])+'"><div class="ptitle">'+title+'</div><div class="ptime">'+hm(p[0])+' – '+hm(p[1])+'</div></div>'}
function render(){const q=norm($('#search').value),day=DB.programs[selected]||{},sports=activeView==='sports';const entries=DB.channels.map(c=>({c,ps:(day[c.i]||[]).filter(p=>!sports||p[3]===1)}));const list=entries.filter(({c,ps})=>{if(sports&&!ps.length)return false;if(activeGenre!=='Todos'&&c.g!==activeGenre)return false;if(!q)return true;if(norm(c.n).includes(q)||norm(c.c).includes(q))return true;return ps.some(p=>norm(p[2]).includes(q))});const eventCount=list.reduce((n,x)=>n+x.ps.length,0);$('#count').textContent=sports?(list.length+' canais · '+eventCount+' transmissões'):(list.length+' de '+DB.channels.length+' canais');guide.classList.toggle('sports-live',sports);rows.innerHTML=list.length?list.map(({c,ps})=>'<div class="row"><div class="channel"><div class="logo-wrap"><img class="logo" src="'+c.l+'" alt="Logo '+c.n+'" onerror="this.style.display=&quot;none&quot;;this.nextElementSibling.style.display=&quot;grid&quot;"><span class="fallback">'+initials(c.n)+'</span>'+(c.s?'<span class="origin-badge" title="Canal complementado com a grade de São Paulo">'+c.s+'</span>':'')+'</div><div><div class="chname">'+c.n+'</div><div class="chnum">Canal '+c.c+'</div><div class="genre-label">'+c.g+'</div></div></div><div class="programs">'+ps.map(block).join('')+'</div></div>').join(''):'<div class="no-results">'+(sports?'Nenhuma transmissão esportiva marcada como “Ao Vivo” corresponde aos filtros nesta data.':'Nenhum canal ou programa corresponde aos filtros selecionados.')+'</div>';positionNow()}
function positionNow(){const n=new Date(),today=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'),line=$('.now-line');line.classList.toggle('hidden',today!==selected);if(today===selected)line.style.left='calc(var(--channel) + '+((n.getHours()*60+n.getMinutes())/30)+' * var(--slot))'}function goToCurrentTime(){const n=new Date(),today=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');if(!DB.programs[today])return;selected=today;drawDates();render();requestAnimationFrame(()=>{const slot=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slot'))||112;guide.scrollLeft=Math.max(0,(n.getHours()*60+n.getMinutes())/30*slot-innerWidth/2)})}document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{activeView=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));$('#sportsNote').style.visibility=activeView==='sports'?'visible':'hidden';render()});$('#sportsNote').style.visibility='hidden';$('#search').addEventListener('input',render);$('#clear').onclick=()=>{$('#search').value='';render();$('#search').focus()};$('#nowBtn').onclick=goToCurrentTime;$('#prev').onclick=()=>$('#dateStrip').scrollBy({left:-430,behavior:'smooth'});$('#next').onclick=()=>$('#dateStrip').scrollBy({left:430,behavior:'smooth'});drawGenres();drawDates();render();goToCurrentTime();setInterval(positionNow,30000);</script></body></html>`;
fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log(JSON.stringify({channels:channels.length,dates:Object.keys(programs).length,programs:Object.values(programs).reduce((n,d)=>n+Object.values(d).reduce((a,x)=>a+x.length,0),0),bytes:Buffer.byteLength(html)}));
