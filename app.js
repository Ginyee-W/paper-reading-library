'use strict';
(() => {
 const papers = window.PAPER_LIBRARY;
 const standalone = Boolean(window.PAPER_EMBEDDED_ASSETS);
 const singlePage = standalone || document.documentElement.dataset.routing==='hash';
 const base = document.documentElement.dataset.base || '.';
 const $ = id => document.getElementById(id);
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem('paper-library:'+key)) ?? fallback; } catch { return fallback; } };
 const saveStore = (key, value) => { try { localStorage.setItem('paper-library:'+key,JSON.stringify(value)); } catch {} };
 const asset = path => standalone ? window.PAPER_EMBEDDED_ASSETS[path] : `${base}/${path}`;
 const pdfUrls = {};
 function pdfUrl(paper) {
  if (!standalone) return `${base}/originals/${paper.id}.pdf`;
  if (!pdfUrls[paper.id]) {
   const bytes = atob(window.PAPER_EMBEDDED_PDFS[paper.id]);
   const data = Uint8Array.from(bytes, c => c.charCodeAt(0));
   pdfUrls[paper.id] = URL.createObjectURL(new Blob([data],{type:'application/pdf'}));
  }
  return pdfUrls[paper.id];
 }
 function link(paper, page, query='', section=null) {
  const params = new URLSearchParams();
  if (singlePage) params.set('paper',paper.id);
  params.set('page',String(page));
  if (query) params.set('q',query);
  if (section !== null) params.set('section',String(section));
  return (singlePage?'':`${base}/papers/${paper.id}.html`) + '#' + params.toString();
 }
 const homeLink = () => singlePage ? '#home' : `${base}/index.html`;
 let currentPaper = null;
 let currentPage = 1;
 let currentQuery = '';
 let mode = 'parallel';
 let fontSize = Math.min(25,Math.max(15,Number(readStore('font',18)) || 18));
 let showNotes = readStore('notes',true);
 let sourceMode = 'text';
 let scrollFrame = false;
 let activeSection = -1;
 let zoom = 100;
 let toastTimer;
 let currentTopic=readStore('topic','all');
 const KEYWORDS=[['convolutional','卷积'],['self-attention','自注意力'],['multi-head','多头'],['positional encoding','位置编码'],['masked language model','掩码语言模型'],['fine-tuning','微调'],['pre-training','预训练'],['generator','生成器'],['discriminator','判别器'],['adversarial','对抗'],['back-propagation','反向传播'],['Graph Transformer','图变换'],['gradient','梯度'],['function space','函数空间'],['loss function','损失函数'],['negative gradient','负梯度'],['shrinkage','收缩'],['learning rate','学习率'],['regularization','正则化'],['overfitting','过拟合'],['regression tree','回归树'],['least squares','最小二乘'],['least-squares','最小二乘'],['partial dependence','部分依赖'],['interaction','交互'],['weighted quantile','加权分位数'],['sparsity','稀疏'],['split','分裂'],['histogram','直方图'],['GOSS','GOSS'],['EFB','EFB'],['categorical features','类别特征'],['ordered boosting','有序提升'],['prediction shift','预测偏移'],['target leakage','目标泄漏'],['dropout','Dropout'],['over-specialization','过度专门化'],['Shapley','Shapley'],['feature attribution','特征归因'],['local accuracy','局部准确性'],['consistency','一致性'],['missingness','缺失性']];
 function aliases(query){
  if(!query)return [];
  const found=KEYWORDS.filter(pair=>pair.some(t=>t.toLowerCase()===query.toLowerCase()));
  return [...new Set([query,...found.flat()])].sort((a,b)=>b.length-a.length);
 }
 function highlighted(text,query){
  const terms=aliases(query);if(!terms.length)return escape(text);
  const pattern=new RegExp(terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gi');
  let out='',last=0;
  for(const hit of text.matchAll(pattern)){out+=escape(text.slice(last,hit.index))+'<mark>'+escape(hit[0])+'</mark>';last=hit.index+hit[0].length;}
  return out+escape(text.slice(last));
 }
 function mathText(text,query){
  return text.split(/(\$\$[\s\S]*?\$\$|\$(?:\\[\s\S]|[^$\\\n])+\$)/g).map(part=>{
   if(part.startsWith('$$')&&part.endsWith('$$')){
    const raw=part.slice(2,-2),tag=raw.match(/\\tag\*?\{([^{}]+)\}/);
    const tex=raw.replace(/\\tag\*?\{[^{}]+\}/g,'');
    return `<span class="equation-block"><span class="latex display-math equation-body" data-display="true" data-tex="${escape(tex)}">${escape(tex)}</span>${tag?`<span class="equation-number">(${escape(tag[1])})</span>`:''}</span>`;
   }
   if(part.startsWith('$')&&part.endsWith('$'))return `<span class="latex" data-tex="${escape(part.slice(1,-1))}">${escape(part.slice(1,-1))}</span>`;
   return highlighted(part,query);
  }).join('');
 }
 function renderMath(){
  if(!window.katex)return;
  document.querySelectorAll('.latex').forEach(el=>{
   try{window.katex.render(el.dataset.tex,el,{displayMode:el.dataset.display==='true',throwOnError:true,strict:'ignore',trust:false});}
   catch{el.classList.add('math-source-error');el.title='公式排版待核对，请对照左侧原版';}
  });
  fitDisplayMath();
 }
 function fitDisplayMath(){
  requestAnimationFrame(()=>{document.querySelectorAll('.equation-body').forEach(el=>{
   el.style.fontSize='';
   const content=el.querySelector('.katex-html');if(!content||!el.clientWidth)return;
   const width=content.getBoundingClientRect().width;
   if(width>el.clientWidth-8)el.style.fontSize=`${Math.floor((el.clientWidth-8)/width*100)}%`;
  });alignArticles();});
 }
 if('ResizeObserver'in window){
  const equationResize=new ResizeObserver(fitDisplayMath);
  equationResize.observe($('reading-columns'));
  const headerResize=new ResizeObserver(()=>document.documentElement.style.setProperty('--reader-header-height',$('reader-header').getBoundingClientRect().height+'px'));
  headerResize.observe($('reader-header'));
 }
 document.fonts?.ready.then(fitDisplayMath);
 function headingSection(text,page,paper){
  if(text==='附录')return paper.sections.findIndex(s=>s.page===page.page&&/^附录/.test(s.label));
  const number=(text.match(/^(\d+(?:\.\d+)*|[A-G](?:\.\d+)*)(?:[.．]?\s+)(?=\S)/)||[])[1];
  return number?paper.sections.findIndex(s=>s.number===number&&Math.abs(s.page-page.page)<=1):-1;
 }
 function headingKey(text,index){
  if(index>=0)return `section:${index}`;
  const sub=(text.match(/^(\d+(?:\.\d+)+|[A-G](?:\.\d+)+)[.．]?\s+/)||[])[1];
  if(sub)return `subsection:${sub}`;
  if(/^(?:Abstract\.?|ABSTRACT|摘要)$/.test(text))return 'abstract';
  if(/^参考文献[（(]续/.test(text))return '';
  if(/^(?:References|REFERENCES|参考文献)(?:$|[（(])/.test(text))return 'references';
  if(/^(?:Acknowledg(?:e)?ments?\.?|Acknoledgments|ACKNOWLEDGMENTS|致谢)$/.test(text))return 'acknowledgments';
  return '';
 }
 const FRONTMATTER={
  adaboost:{en:['publication','title','authors','affiliation','contact'],zh:['publication','title','authors','affiliation','contact']},
  gbdt:{en:['publication','publication','publication','title','authors','affiliation'],zh:['publication','publication','title','authors']},
  xgboost:{en:['title','authors'],zh:['title','authors']},
  lightgbm:{en:['title','authors','affiliation','contact'],zh:['title','authors','affiliation','contact']},
  catboost:{en:['title','authors','authors','affiliation','affiliation','contact'],zh:['title','authors']},
  dart:{en:['title','authors','affiliation'],zh:['title','authors','affiliation']},
  shap:{en:['title','authors','affiliation','affiliation','affiliation','contact','contact'],zh:['title','authors']}
 };
 function frontmatterRole(paper,page,language,index,text){
  if(page.page===1)return FRONTMATTER[paper.id]?.[language]?.[index];
  if(language==='en'&&index<2&&(/^(?:\d{4}\s+J\.\s*H\.\s*FRIEDMAN|GREEDY FUNCTION APPROXIMATION\s*\d+|K\. V\. Rashmi,? Ran Gilad-Bachrach)$/i.test(text)||/^DAR\s*\$?T\$?: Dropouts meet Multiple Additive Regression/.test(text)))return 'publication';
  return null;
 }
 function referencesContinue(paper,page){
  const previous=paper.sections.filter(s=>s.page<page.page).at(-1);
  return Boolean(previous&&/参考文献/.test(previous.label));
 }
 function articleClass(text,{heading=false,number='',role=null,references=false,caption=false}={}){
  if(role==='title')return 'article-title';
  if(role)return 'article-meta article-'+role;
  if(heading){
   const level=number?Math.min(3,number.split('.').length):1;
   const statement=/^(?:Algorithm|Theorem|Lemma|Definition|算法|定理|引理|定义)\s*/i.test(text);
   return 'article-heading heading-level-'+level+(statement?' article-statement':'');
  }
  if(caption)return 'caption-translation';
  if(references||/^[\[［]\d+[\]］]/.test(text))return 'article-reference';
  if(/^(?:Received\b|\d*\s*Supported\b|AMS\b|Key words\b|Keywords\b|Home page:|Permission\b|KDD [’']|Appearing in Proceedings|收稿[：:]|脚注|关键词[：:]|第\s*\d+\s*届|允许免费)/.test(text)||/^\d+\s*(?:URL\b|https?:\/\/|This algorithm|We use the term|We deliberately|Gradient tree boosting)/.test(text))return 'article-meta article-footnote';
  return '';
 }
 function mediaHTML(page,index,language,afterTitle=false){
  return (page.media||[]).filter(m=>m[language+'Anchor']===index&&Boolean(m[language+'AfterTitle'])===afterTitle).sort((a,b)=>(a[language+'Order']??0)-(b[language+'Order']??0)).map(m=>{
   const label=(m.kind==='figure'?'原图':'原表')+' '+m.number;
   return `<figure class="paper-visual" data-align-key="${m.kind}:${m.number}" data-visual-id="${m.paper}-${m.kind}-${m.number}"><button class="visual-open" data-visual="${escape(m.image)}" data-visual-title="${escape(label)} · PDF ${page.page}" aria-label="放大${label}"><img src="${asset(m.image)}" width="${m.width}" height="${m.height}" loading="lazy" alt="${label}，保留原版图形、文字和图注"></button><figcaption>${label} · PDF 第 ${page.page} 页 <span>点击放大 ↗</span></figcaption></figure>`;
  }).join('');
 }
 function originalHTML(page,query,paper){
  if(page.blocks)return typedHTML(page,query,paper,'en');
  if(!page.en)throw new Error('Missing verified English text');
  const seen=new Set();
  let references=referencesContinue(paper,page);
  const lines=page.en.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  return (page.enReadingOrder||lines.map((_,i)=>i)).map(i=>{
   const text=lines[i];
   const index=headingSection(text,page,paper);
   const number=(text.match(/^(\d+(?:\.\d+)*|[A-G](?:\.\d+)*)[.．]?\s+/)||[])[1];
   const runIn=paper.id==='gbdt'&&index>=0?text.match(/^(\d+(?:\.\d+)*\.)\s+(.+?\.)\s+([\s\S]+)$/):null;
   const title=runIn?runIn[1]+' '+runIn[2]:text;
   const numbered=(index>=0||number?.includes('.'))&&(runIn||text.length<150&&!/[.,;:]$/.test(text)&&!/^\b[A-G]\s+[a-z]/.test(text))&&!seen.has(number)&&!/^\d+\s+.*(?:Supported|https?:|Yandex|University|Institute|Russia)/.test(text);
   const named=/^(?:ABSTRACT|Abstract|References|REFERENCES|Acknowledg|Acknoledgments|APPENDIX|Appendix|Algorithm\s|Theorem\s|Lemma\s|Definition\s)/.test(text)&&text.length<150;
   const paperTitle=text.length<150&&/^[A-Z][A-Z ,:–—()0-9-]{10,}$/.test(text)&&!/(?:\d{4}|\bLECTURE\b)/.test(text);
   if(numbered)seen.add(number);
   const role=frontmatterRole(paper,page,'en',i,text);
   const heading=role?role==='title':numbered||named||paperTitle;
   const key=role==='title'?'article:title':heading?headingKey(title,numbered?index:-1):'';
   if(key==='references'||heading&&/^\d+[.]?\s+REFERENCES$/i.test(title))references=true;
   else if(heading&&key&&key!=='article:title')references=false;
   const classes=articleClass(title,{heading,number:index>=0?paper.sections[index].number:number,role,references});
   if(heading){
    const attrs=`${numbered&&index>=0?` data-section-index="${index}"`:''}${key?` data-align-key="${key}"`:''}`;
    return mediaHTML(page,i,'en')+`<h3 class="${classes}" id="en-p-${page.page}-${i}"${attrs}>${mathText(title,query)}</h3>`+mediaHTML(page,i,'en',true)+(runIn?`<p id="en-p-${page.page}-${i}-body">${mathText(runIn[3],query)}</p>`:'');
   }
   return mediaHTML(page,i,'en')+`<p id="en-p-${page.page}-${i}"${classes?` class="${classes}"`:''}>${mathText(text,query)}</p>`;
  }).join('');
 }
 function bestNoteAnchor(note,lines){
  let best=0,score=-1;
  lines.forEach((line,i)=>{
   if(line.length<35||line.startsWith('$$'))return;
   let n=0;const seen=new Set();for(let j=0;j<note.length-1;j++){const pair=note.slice(j,j+2);if(!seen.has(pair)&&/[\u4e00-\u9fff]{2}/.test(pair)&&line.includes(pair)){n++;seen.add(pair);}}
   if(n>score){score=n;best=i;}
  });return best;
 }
 function renderTOC(paper,active){
  const children=new Map();paper.sections.forEach((s,i)=>{const parent=s.parent??-1;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(i);});
  const branch=i=>{const s=paper.sections[i];const kids=children.get(i)||[];const anchor=`<a class="toc-link${i===active?' active':''}" data-section-index="${i}" href="${link(paper,s.page,'',i)}"${i===active?' aria-current="location"':''}><span class="toc-name">${escape(s.label)}</span><span class="toc-page">${s.page}</span></a>`;
   return kids.length?`<details class="toc-group" open><summary><span class="toc-chevron">›</span>${anchor}</summary><div class="toc-children">${kids.map(branch).join('')}</div></details>`:anchor;
  };return (children.get(-1)||[]).map(branch).join('');
 }
 function renderKeywords(page,query){
  const en=(page.original||'').toLowerCase(),zh=page.zh.toLowerCase();
  const seen=new Set();const pairs=KEYWORDS.filter(pair=>{if(seen.has(pair[1]))return false;const yes=en.includes(pair[0].toLowerCase())&&zh.includes(pair[1].toLowerCase());if(yes)seen.add(pair[1]);return yes;}).slice(0,9);
  $('keyword-bar').innerHTML=pairs.length?'<span>关键词定位</span>'+pairs.map(([en,zh])=>`<button data-keyword="${escape(zh)}" title="${escape(en)}" class="keyword-chip${aliases(query).includes(zh)?' active':''}">${escape(zh)}</button>`).join('')+(query?'<button data-clear-keyword="true" class="clear-keyword">清除高亮 ×</button>':''):'';
 }
 function focusSection(section){
  if(!section)return;
  const targetIndex=currentPaper.sections.indexOf(section);
  requestAnimationFrame(()=>{const target=$('translation-content').querySelector(`[data-section-index="${targetIndex}"]`)||$('original-text').querySelector(`[data-section-index="${targetIndex}"]`);if(target)scrollWithin(null,target);});
 }
 function documentTop(){return window.scrollY||0;}
 function readingMarker(){return 140;}
 function scrollWithin(container,target){
  window.scrollTo({top:target.getBoundingClientRect().top+documentTop()-120,behavior:'smooth'});
 }
 function updateActiveSection(index){
  if(!Number.isInteger(index)||index<0||!currentPaper||activeSection===index)return;
  activeSection=index;
  const links=[...$('toc-list').querySelectorAll('.toc-link')];
  for(const a of links){const active=Number(a.dataset.sectionIndex)===index;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');}
  const linkEl=links.find(a=>Number(a.dataset.sectionIndex)===index);
  if(linkEl){
   for(let parent=linkEl.parentElement;parent&&parent!==$('toc-list');parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   const rect=linkEl.getBoundingClientRect(),side=$('sidebar'),bounds=side.getBoundingClientRect();
   if(rect.top<bounds.top+20||rect.bottom>bounds.bottom-20)side.scrollTo({top:side.scrollTop+rect.top-bounds.top-80,behavior:'smooth'});
  }
  const section=currentPaper.sections[index];if(section)$('page-context').innerHTML=`<span>PDF ${String(currentPage).padStart(2,'0')}</span><span class="small-rule"></span><strong>${escape(section.label)}</strong>`;
 }
 function observeReading(){activeSection=-1;}
 function visiblePage(container){
  const pages=[...container.querySelectorAll('[data-page]')];if(!pages.length)return null;
  const marker=readingMarker(container);let page=pages[0];
  for(const el of pages){if(el.getBoundingClientRect().top<=marker)page=el;else break;}
  return page;
 }
 function applyParagraphMap(paper){
  if(!paper.paragraphGroups?.length)return;
  const right=$('translation-content'),left=$('original-text');
  const byTranslatedId=new Map();
  for(const group of paper.paragraphGroups){
   const en=group.en.map($).filter(Boolean),zh=group.zh.map($).filter(Boolean);
   for(const [language,members] of [['en',en],['zh',zh]])for(const el of members){
    el.dataset.paragraphGroup=group.key;el.dataset.paragraphRelation=group.relation;
    if(el.dataset.alignKey){el.dataset.contentAlignKey=el.dataset.alignKey;delete el.dataset.alignKey;}
   }
   if(en.length&&zh.length){en[0].dataset.alignKey=zh[0].dataset.alignKey=group.key;}
   group.zh.forEach(id=>byTranslatedId.set(id,group));
  }
  // Put each unchanged visual beside its paired caption/passage on both sides.
  const visuals=[...right.querySelectorAll('.paper-visual')];
  const english=new Map([...left.querySelectorAll('.paper-visual')].map(el=>[el.dataset.visualId,el]));
  const media=paper.pages.flatMap(p=>(p.media||[]).map(m=>({...m,page:p.page})));
  for(const target of visuals){
   const original=english.get(target.dataset.visualId);if(!original)continue;
   const m=media.find(m=>`${m.paper}-${m.kind}-${m.number}`===target.dataset.visualId);if(!m)continue;
   let group=byTranslatedId.get(`zh-p-${m.page}-${m.zhAnchor}`);
   if(group&&(!group.en.length||!group.zh.length)){
    const at=paper.paragraphGroups.indexOf(group);group=paper.paragraphGroups.slice(at+1).find(g=>g.en.length&&g.zh.length)||paper.paragraphGroups.slice(0,at).reverse().find(g=>g.en.length&&g.zh.length);
   }
   const en=group&&$(group.en[0]),zh=group&&$(group.zh[0]);
   if(en&&zh){en.before(original);zh.before(target);}
  }
  paper.sections.forEach((section,index)=>{
   if(section.number)return;
   const key=/摘要/.test(section.label)?'abstract':/参考文献/.test(section.label)?'references':/致谢/.test(section.label)?'acknowledgments':null;
   if(!key)return;
   for(const root of [left,right]){
    const target=[...root.querySelectorAll('[data-align-key],[data-content-align-key]')].find(el=>el.dataset.alignKey===key||el.dataset.contentAlignKey===key);
    if(target)target.dataset.sectionIndex=String(index);
   }
  });
 }
 function alignArticles(){
  const left=sourceMode==='image'?$('source-pages'):$('original-text'),right=$('translation-content');
  for(const root of [$('original-text'),$('source-pages'),right]){
   root.querySelectorAll('.alignment-spacer').forEach(el=>el.remove());
   root.querySelectorAll('.waterfall-page').forEach(el=>el.style.minHeight='');
  }
  const enabled=mode==='parallel'&&!window.matchMedia?.('(max-width:720px)').matches;
  $('reading-columns').dataset.alignment=enabled?'on':'off';
  if(!enabled)return;
  // Match the entire article: PDF page breaks are not semantic boundaries.
  const selector=sourceMode==='image'?'[data-page]':'[data-align-key]';
  const key=el=>sourceMode==='image'?'page:'+el.dataset.page:el.dataset.alignKey;
  const translated=new Map();
  for(const target of right.querySelectorAll(selector))if(!translated.has(key(target)))translated.set(key(target),target);
  delete $('reading-columns').dataset.alignmentError;
  const pairs=[];let lastTarget=null;
  for(const heading of left.querySelectorAll(selector)){
   const target=translated.get(key(heading));if(!target)continue;
   if(lastTarget&&!(lastTarget.compareDocumentPosition(target)&4)){
    $('reading-columns').dataset.alignmentError=heading.dataset.alignKey;continue;
   }
   const spacers=[heading,target].map(el=>{const spacer=document.createElement('div');spacer.className='alignment-spacer';spacer.setAttribute('aria-hidden','true');spacer.style.height='0.01px';el.before(spacer);return spacer;});
   pairs.push({heading,target,spacers});lastTarget=target;
  }
  const positions=pairs.map(({heading,target})=>[heading.getBoundingClientRect().top,target.getBoundingClientRect().top]);
  let leftPadding=0,rightPadding=0;
  pairs.forEach(({spacers},i)=>{
   const delta=positions[i][0]+leftPadding-positions[i][1]-rightPadding;
   if(Math.abs(delta)>.5){const height=Math.abs(delta);spacers[delta>0?1:0].style.height=(height+.01)+'px';if(delta>0)rightPadding+=height;else leftPadding+=height;}
  });
  $('reading-columns').dataset.alignedPairs=String(pairs.length);
 }
 function updateReadingPosition(container){
  if(!currentPaper||mode==='pdf')return;
  const visible=visiblePage(container);if(!visible)return;
  const page=Number(visible.dataset.page);
  if(page&&page!==currentPage){
   currentPage=page;
   $('translation-page-label').textContent=`PDF 第 ${page} 页`;
   $('open-pdf-top').href=pdfUrl(currentPaper)+`#page=${page}`;
   saveStore(`progress:${currentPaper.id}`,page);history.replaceState(null,'',link(currentPaper,page,currentQuery));
  }
  let index=-1;
  for(let i=0;i<currentPaper.sections.length;i++)if(currentPaper.sections[i].page<page)index=i;
  for(const el of container.querySelectorAll('[data-section-index]'))if(el.getBoundingClientRect().top<=readingMarker(container)+25)index=Number(el.dataset.sectionIndex);else break;
  if(index>=0)updateActiveSection(index);
 }
 function focusMatches(){requestAnimationFrame(()=>{
  const zh=$('translation-content').querySelector('mark'),en=$('original-text').querySelector('mark');
  if(zh||en)scrollWithin(null,zh||en);
 });}
 function excerpt(page, query) {
  const zh = page.zh;
  const source = zh.toLowerCase().includes(query.toLowerCase()) ? zh : page.original;
  const index = source.toLowerCase().indexOf(query.toLowerCase());
  const begin = Math.max(0,index-45);
  return (begin?'…':'')+source.slice(begin,Math.max(begin+145,index+query.length+55)).replace(/\s+/g,' ')+(source.length>begin+145?'…':'');
 }
 function card(paper,index) {
  const progress = Number(readStore(`progress:${paper.id}`,1));
  const page = progress>=1 && progress<=paper.pages.length ? progress : 1;
  return `<a class="paper-card" href="${link(paper,page)}" aria-label="阅读 ${escape(paper.name)}：${escape(paper.zhTitle)}"><div class="card-meta"><span>${escape(paper.year)} · ${escape(paper.venue)}</span><span class="card-number">${String(index+1).padStart(2,'0')}</span></div><div class="card-body"><div class="card-info"><h3>${escape(paper.name)}</h3><p class="card-subtitle">${escape(paper.zhTitle)}</p><p class="card-english" lang="en">${escape(paper.title)}</p><div class="tags">${paper.tags.map(t=>`<span class="tag">${escape(t)}</span>`).join('')}</div></div><img class="card-cover" src="${asset(`assets/${paper.id}/cover.webp`)}" alt="${escape(paper.name)} 原版首页" loading="lazy"></div><div class="card-footer"><span>${paper.pages.length} 页 · 中英对照</span><span class="card-cta">${page>1?`继续第 ${page} 页`:'开始阅读'} <b>↗</b></span></div></a>`;
 }
 const topicKey=paper=>(paper.topicPath||[]).map(t=>t.id).join('/');
 const inTopic=paper=>currentTopic==='all'||topicKey(paper)===currentTopic||topicKey(paper).startsWith(currentTopic+'/');
 function topicTree(){
  const roots=[];
  for(const paper of papers){let children=roots,path=[];for(const part of paper.topicPath||[]){path.push(part.id);const id=path.join('/');let node=children.find(n=>n.id===id);if(!node){node={id,label:part.label,count:0,children:[]};children.push(node);}node.count++;children=node.children;}}
  return roots;
 }
 function renderCollectionNav(){
  const tree=topicTree(),flat=[];
  const flatten=nodes=>nodes.forEach(n=>{flat.push(n);flatten(n.children);});flatten(tree);
  if(currentTopic!=='all'&&!flat.some(n=>n.id===currentTopic))currentTopic='all';
  const button=(id,label,count)=>`<button class="topic-button${currentTopic===id?' active':''}" data-topic="${id}" aria-pressed="${currentTopic===id}"><span>${escape(label)}</span><small>${count}</small></button>`;
  const branch=node=>node.children.length?`<details class="topic-branch" open><summary><span class="topic-chevron">›</span>${button(node.id,node.label,node.count)}</summary><div class="topic-children">${node.children.map(branch).join('')}</div></details>`:button(node.id,node.label,node.count);
  $('collection-nav').innerHTML=button('all','全部论文',papers.length)+tree.map(branch).join('');
  const leaves=flat.filter(n=>!n.children.length);
  $('reading-path').innerHTML=leaves.map(n=>`<button class="path-link topic-shortcut${currentTopic===n.id?' active':''}" data-topic="${n.id}">${escape(n.label)} <small>${n.count}</small></button>`).join('');
  const selected=flat.find(n=>n.id===currentTopic);
  $('shelf-title').innerHTML=(selected?escape(selected.label):'全部论文')+' <small>THE COLLECTION</small>';
 }
 function collectionCards(list){
  const groups=new Map();for(const paper of list){const key=topicKey(paper);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(paper);}
  return [...groups.values()].map(group=>`<div class="collection-group-heading"><span>${escape((group[0].topicPath||[]).slice(0,-1).map(t=>t.label).join(' / '))}</span><b>${escape(group[0].topicPath?.at(-1)?.label||'论文')}</b><small>${group.length} 篇</small></div>`+group.map(p=>card(p,papers.indexOf(p))).join('')).join('');
 }
 function selectTopic(id){currentTopic=id;saveStore('topic',id);renderCollectionNav();homeSearch();}
 function renderHome() {
  $('home-view').hidden=false;
  $('reader-view').hidden=true;
  document.title='机器学习与深度学习 · 论文精读馆';
  renderCollectionNav();
  homeSearch();
 }
 function homeSearch() {
  const query = $('home-search').value.trim();
  $('clear-home-search').classList.toggle('hidden',!query);
  $('home-results').hidden=!query;
  if (!query) {
   const visible=papers.filter(inTopic);
   $('collection-active').textContent=`${visible.length} 篇论文 · ${visible.reduce((n,p)=>n+p.pages.length,0)} 页原文 · 逐段双语对照`;
   $('paper-grid').hidden=false;
   $('paper-grid').innerHTML=collectionCards(visible);
   $('home-results').innerHTML='';
   return;
  }
  const needle=query.toLowerCase();
  const matches=[];
  const matchingPapers=[];
  for (const paper of papers.filter(inTopic)) {
   const metadata = [paper.name,paper.title,paper.zhTitle,...paper.tags,...(paper.topicPath||[]).map(t=>t.label)].join(' ').toLowerCase().includes(needle);
   const pageMatches = paper.pages.filter(p=>(p.original+'\n'+p.zh).toLowerCase().includes(needle));
   if (metadata || pageMatches.length) matchingPapers.push(paper);
   for (const page of pageMatches) matches.push({paper,page});
  }
  $('paper-grid').hidden=!matchingPapers.length;
  $('paper-grid').innerHTML=collectionCards(matchingPapers);
  $('collection-active').textContent=`找到 ${matchingPapers.length} 篇论文 · ${matches.length} 页包含匹配内容`;
  $('home-results').innerHTML=`<div class="results-heading" style="margin-top:25px">${matches.length?`在 ${matches.length} 页中找到“${escape(query)}”${matches.length>30?'，先显示前 30 项':''}`:matchingPapers.length?'论文匹配结果见上方':'没有找到匹配内容，可试试其他中英文关键词。'}</div>`+matches.slice(0,30).map(({paper,page})=>`<a class="search-result" href="${link(paper,page.page,query)}"><strong>${escape(paper.name)}</strong><small>PDF 第 ${page.page} / ${paper.pages.length} 页</small><p>${highlighted(excerpt(page,query),query)}</p></a>`).join('');
 }
 function renderReader(paper,page,query,sectionIndex) {
  const changedPaper = !currentPaper || currentPaper.id!==paper.id;
  const changedPage = changedPaper || currentPage!==page;
  currentPaper=paper;
  currentPage=page;
  currentQuery=query;
  const pageData=paper.pages[page-1];
  $('home-view').hidden=true;
  $('reader-view').hidden=false;
  $('reader-home-brand').href=homeLink();
  $('back-home').href=homeLink();
  document.title=`${paper.name} · 第 ${page} 页 — 论文精读馆`;
  if (changedPaper) {
   mode='parallel';sourceMode='text';
   $('side-title').textContent=paper.name;
   $('side-subtitle').textContent=paper.zhTitle;
   $('paper-eyebrow').textContent=`${paper.venue.toUpperCase()} · ${paper.year} / ${paper.pages.length} PAGES`;
   $('paper-title').textContent=paper.title;
   $('paper-byline').textContent=paper.authors+' · '+paper.zhTitle;
   $('toc-count').textContent=String(paper.sections.length).padStart(2,'0');
   $('paper-search').value='';
   $('paper-search-results').hidden=true;
   $('toc-list').hidden=false;
   $('toc-heading').textContent='章节目录';
  }
  let active=-1;
  for (let i=0;i<paper.sections.length;i++) if (paper.sections[i].page<=page) active=i;
  if (Number.isInteger(sectionIndex) && paper.sections[sectionIndex]?.page===page) active=sectionIndex;
  activeSection=-1;
  $('toc-list').innerHTML=renderTOC(paper,active);
  $('source-pages').innerHTML=paper.pages.map(p=>`<section class="original-page" data-page="${p.page}" id="image-page-${p.page}"><button class="original-page-open" data-source-page="${p.page}" aria-label="放大 PDF 第 ${p.page} 页"><img class="source-page" src="${asset(p.image)}" width="${p.imageWidth}" height="${p.imageHeight}" loading="lazy" decoding="async" alt="${escape(paper.name)} 原版 PDF 第 ${p.page} 页"></button></section>`).join('');
  $('original-text').innerHTML=paper.pages.map(p=>`<section class="waterfall-page" data-page="${p.page}" id="en-page-${p.page}">${originalHTML(p,query,paper)}</section>`).join('');
  $('translation-page-label').textContent=`PDF 第 ${page} 页起`;
  $('translation-content').innerHTML=paper.pages.map(p=>`<section class="waterfall-page" data-page="${p.page}" id="zh-page-${p.page}">${translationHTML(p,query,paper)}</section>`).join('');
  applyParagraphMap(paper);
  renderKeywords(pageData,query);
  renderMath();
  $('page-context').innerHTML=`<span>PDF ${String(page).padStart(2,'0')}</span><span class="small-rule"></span><strong>${escape(active>=0?paper.sections[active].label:'论文首页')}</strong>`;
  const pdf=pdfUrl(paper);
  $('open-pdf-top').href=pdf+`#page=${page}`;
  $('pdf-fallback-link').href=pdf+`#page=${page}`;
  setMode(mode,false);
  setSourceMode(sourceMode);
  updateSettings();
  saveStore(`progress:${paper.id}`,page);
  if (changedPage) window.scrollTo({top:0,behavior:'instant'});
  closeSidebar();
  if(query){setMode('parallel',false);setSourceMode('text');}
  observeReading();

  if(Number.isInteger(sectionIndex)){setSourceMode('text');focusSection(paper.sections[sectionIndex]);}
  else if(changedPage){requestAnimationFrame(()=>{const a=$(`en-page-${page}`),b=$(`zh-page-${page}`);if(b)scrollWithin(null,b);});}
 }
 function translationHTML(page,query,paper) {
  if(page.blocks)return typedHTML(page,query,paper,'zh');
  const lines=page.zh.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const anchors=page.noteAnchors||[];
  const seen=new Set();
  let references=referencesContinue(paper,page);
  return lines.map((line,i)=>{
   const clean=line.replace(/^#{1,4}\s*/,'').replace(/\*\*([^*]+)\*\*/g,'$1');
   let heading=clean.length<85 && /^(摘要$|致谢$|参考文献(?:$|[（(])|附录|[A-G](?:\.\d+)?[.．\s]|\d+(?:\.\d+)*[.．\s]\s*[^［\[]|定义\s*[A-Z]?\.?\d|定理\s*[A-Z]?\.?\d|引理\s*[A-Z]?\.?\d|算法\s*(?:\d|AdaBoost))/.test(clean);
   const caption=/^(图|表)\s*\d/.test(clean);
   let sectionIndex=heading?headingSection(clean,page,paper):-1;
   if(clean==='附录'&&lines.some(l=>/^[A-G](?:[.．]?\s+)/.test(l)))sectionIndex=-1;
   if(sectionIndex>=0&&(seen.has(sectionIndex)||/[。；：:]$/.test(clean))){heading=false;sectionIndex=-1;}
   if(sectionIndex>=0)seen.add(sectionIndex);
   if(sectionIndex<0&&/^\d+[.．\s]/.test(clean)&&!/^\d+(?:\.\d+)+[.．]?\s/.test(clean))heading=false;
   const role=frontmatterRole(paper,page,'zh',i,clean);
   if(role){heading=role==='title';sectionIndex=-1;}
   const tag=heading?'h3':'p';
   const key=role==='title'?'article:title':heading?headingKey(clean,sectionIndex):'';
   if(key==='references'||heading&&/参考文献/.test(clean))references=true;
   else if(heading&&key&&key!=='article:title')references=false;
   const number=(clean.match(/^(\d+(?:\.\d+)*|[A-G](?:\.\d+)*)[.．]?\s+/)||[])[1]||'';
   const classes=articleClass(clean,{heading,number:sectionIndex>=0?paper.sections[sectionIndex].number:number,role,references,caption});
   const headingNote=heading&&clean.match(/^(参考文献)([（(].*)$/);
   const content=headingNote?mathText(headingNote[1],query)+`<span class="heading-note">${mathText(headingNote[2],query)}</span>`:mathText(clean,query);
   let result=mediaHTML(page,i,'zh')+`<${tag} id="zh-p-${page.page}-${i}"${classes?` class="${classes}"`:''}${sectionIndex>=0?` data-section-index="${sectionIndex}"`:''}${key?` data-align-key="${key}"`:''}>${content}</${tag}>`;
   (page.notes||[]).forEach((note,j)=>{
    const target=Number.isInteger(anchors[j])?anchors[j]:bestNoteAnchor(note,lines);
    if(Math.min(lines.length-1,target)===i)result+=`<aside class="inline-note"><b>解读</b><div>${mathText(note,query)}</div></aside>`;
   });
   return result;
  }).join('');
 }
 function typedHTML(page,query,paper,language){
  return page.blocks.map((block,index)=>{
   const text=block[language],section=block.sectionAnchor?paper.sections.findIndex(s=>s.anchor===block.sectionAnchor):-1;
   const heading=block.kind==='heading'||block.kind==='title';
   const tag=heading?'h3':'p';
   const classes=block.kind==='title'?'article-title':block.kind==='heading'?`article-heading heading-level-${Math.min(3,block.level||1)}`:['authors','affiliation','contact','publication','footnote'].includes(block.kind)?`article-meta article-${block.kind}`:block.kind==='reference'?'article-reference':block.kind==='caption'?'caption-translation':'';
   const key=block.kind==='title'?'article:title':section>=0?`section:${section}`:'';
   let html=mediaHTML(page,index,language)+`<${tag} id="${language}-p-${page.page}-${index}"${classes?` class="${classes}"`:''}${key?` data-align-key="${key}"`:''}${section>=0?` data-section-index="${section}"`:''}>${mathText(text,query)}</${tag}>`+mediaHTML(page,index,language,true);
   if(language==='zh')(page.notes||[]).forEach((note,i)=>{if(page.noteAnchors[i]===index)html+=`<aside class="inline-note"><b>解读</b><div>${mathText(note,query)}</div></aside>`;});
   return html;
  }).join('');
 }
 function setMode(value,persist=true) {
  mode=value;
  for (const button of document.querySelectorAll('[data-mode]')) {
   const selected=button.dataset.mode===mode;
   button.classList.toggle('active',selected);
   button.setAttribute('aria-pressed',String(selected));
  }
  $('main-content').classList.toggle('focus-mode',mode==='focus');
  $('reading-columns').hidden=mode==='pdf';
  $('pdf-panel').hidden=mode!=='pdf';
  if (mode==='pdf' && currentPaper) {
   const url=pdfUrl(currentPaper)+`#page=${currentPage}&view=FitH`;
   if ($('pdf-frame').getAttribute('src')!==url) $('pdf-frame').src=url;
  }
  fitDisplayMath();
 }
 function setSourceMode(value) {
  sourceMode=value;
  $('source-pages').hidden=value!=='image';
  $('original-text').hidden=value!=='text';
  $('source-image-mode').classList.toggle('active',value==='image');
  $('source-text-mode').classList.toggle('active',value==='text');
  $('source-image-mode').setAttribute('aria-pressed',String(value==='image'));
  $('source-text-mode').setAttribute('aria-pressed',String(value==='text'));
  $('source-foot-label').textContent=value==='text'?'英文全文 · LaTeX 公式':'图、表、公式与原页排版完整保留';
  fitDisplayMath();
 }
 function updateSettings() {
  document.documentElement.style.setProperty('--reading',fontSize+'px');
  $('show-notes').checked=showNotes;
  $('main-content').classList.toggle('hide-notes',!showNotes);
  $('font-down').disabled=fontSize<=15;
  $('font-up').disabled=fontSize>=25;
  fitDisplayMath();
 }
 function route() {
  const params=new URLSearchParams(location.hash.slice(1));
  const id=params.get('paper') || (location.hash==='#home'?'':document.body.dataset.initialPaper);
  const paper=papers.find(p=>p.id===id);
  if (!paper) { currentPaper=null; renderHome(); return; }
  const parsed=Number(params.get('page'));
  const remembered=Number(readStore(`progress:${paper.id}`,1)) || 1;
  const page=Math.min(paper.pages.length,Math.max(1,Number.isInteger(parsed)&&parsed>0?parsed:remembered));
  const section=params.has('section')?Number(params.get('section')):null;
  renderReader(paper,page,params.get('q')||'',section);
 }
 function paperSearch() {
  if (!currentPaper) return;
  const query=$('paper-search').value.trim();
  $('toc-list').hidden=Boolean(query);
  $('paper-search-results').hidden=!query;
  $('toc-heading').textContent=query?'搜索结果':'章节目录';
  currentQuery=query;
  const page=currentPaper.pages[currentPage-1];
  $('original-text').innerHTML=currentPaper.pages.map(p=>`<section class="waterfall-page" data-page="${p.page}" id="en-page-${p.page}">${originalHTML(p,query,currentPaper)}</section>`).join('');
  $('translation-content').innerHTML=currentPaper.pages.map(p=>`<section class="waterfall-page" data-page="${p.page}" id="zh-page-${p.page}">${translationHTML(p,query,currentPaper)}</section>`).join('');
  applyParagraphMap(currentPaper);
  observeReading();
  renderKeywords(page,query);renderMath();
  if(query){setMode('parallel',false);setSourceMode('text');focusMatches();}
  const terms=aliases(query).map(t=>t.toLowerCase());
  const matches=currentPaper.pages.filter(p=>terms.some(t=>(p.original+'\n'+p.zh).toLowerCase().includes(t)));
  if(!query)return;
  $('paper-search-results').innerHTML=matches.length?matches.map(p=>`<a class="search-result" href="${link(currentPaper,p.page,query)}"><strong>第 ${p.page} 页</strong><p>${highlighted(excerpt(p,query),query)}</p></a>`).join(''):'<div class="search-no-results">未找到匹配内容</div>';
 }
 function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-backdrop').classList.remove('open');
  $('mobile-toc').setAttribute('aria-expanded','false');
 }
 function openZoom(page=currentPage) {
  if (!currentPaper) return;
  zoom=100;
  $('zoom-image').src=asset(currentPaper.pages[page-1].image);
  $('zoom-title').textContent=`${currentPaper.name} · PDF 第 ${page} 页 · 原版`;
  updateZoom();
  $('image-dialog').showModal();
  $('modal-canvas').scrollTop=0;
  $('modal-canvas').scrollLeft=0;
 }
 function updateZoom() {
  $('zoom-image').style.width=zoom+'%';
  $('zoom-level').textContent=zoom+'%';
  $('zoom-out').disabled=zoom<=75;
  $('zoom-in').disabled=zoom>=250;
 }
 function notify(text) {
  clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,2300);
 }
 $('toc-list').addEventListener('click',event=>{
  const summary=event.target.closest('summary');
  if(!summary||event.target.closest('a'))return;
  const group=summary.parentElement;
  const content=group.querySelector(':scope > .toc-children');
  if(!content||!content.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  event.preventDefault();
  group._transition?.cancel();
  const opening=group._closing||!group.open;
  group._closing=!opening;
  if(opening)group.open=true;
  const height=content.scrollHeight;
  group._transition=content.animate(opening?[{height:'0px',opacity:0},{height:height+'px',opacity:1}]:[{height:height+'px',opacity:1},{height:'0px',opacity:0}],{duration:opening?260:200,easing:'cubic-bezier(.2,.7,.2,1)'});
  group._transition.onfinish=()=>{if(!opening)group.open=false;group._closing=false;group._transition=null;};
 });
 $('keyword-bar').addEventListener('click',e=>{const chip=e.target.closest('[data-keyword],[data-clear-keyword]');if(!chip)return;$('paper-search').value=chip.dataset.keyword||'';paperSearch();});
 let homeTimer,paperTimer;
 $('home-search').addEventListener('input',()=>{clearTimeout(homeTimer);homeTimer=setTimeout(homeSearch,160);});
 $('clear-home-search').onclick=()=>{$('home-search').value='';homeSearch();$('home-search').focus();};
 for(const id of ['collection-nav','reading-path'])$(id).addEventListener('click',event=>{const button=event.target.closest('[data-topic]');if(!button)return;event.preventDefault();selectTopic(button.dataset.topic);});
 $('paper-search').addEventListener('input',()=>{clearTimeout(paperTimer);paperTimer=setTimeout(paperSearch,160);});
 for (const button of document.querySelectorAll('[data-mode]')) button.onclick=()=>setMode(button.dataset.mode);
 $('source-image-mode').onclick=()=>setSourceMode('image');
 $('source-text-mode').onclick=()=>setSourceMode('text');
 $('font-down').onclick=()=>{fontSize=Math.max(15,fontSize-1);saveStore('font',fontSize);updateSettings();};
 $('font-up').onclick=()=>{fontSize=Math.min(25,fontSize+1);saveStore('font',fontSize);updateSettings();};
 $('show-notes').onchange=e=>{showNotes=e.target.checked;saveStore('notes',showNotes);updateSettings();};
 $('reading-columns').addEventListener('click',event=>{
  const visual=event.target.closest('[data-visual]');if(!visual)return;
  zoom=100;$('zoom-image').src=asset(visual.dataset.visual);$('zoom-title').textContent=currentPaper.name+' · '+visual.dataset.visualTitle;updateZoom();$('image-dialog').showModal();$('modal-canvas').scrollTop=0;
 });
 $('source-viewport').addEventListener('click',event=>{const page=event.target.closest('[data-source-page]');if(page)openZoom(Number(page.dataset.sourcePage));});
 $('zoom-source').onclick=()=>openZoom();
 $('zoom-in').onclick=()=>{zoom=Math.min(250,zoom+25);updateZoom();};
 $('zoom-out').onclick=()=>{zoom=Math.max(75,zoom-25);updateZoom();};
 $('zoom-fit').onclick=()=>{zoom=100;updateZoom();};
 $('close-dialog').onclick=()=>$('image-dialog').close();
 $('image-dialog').addEventListener('click',event=>{if(event.target===$('image-dialog'))$('image-dialog').close();});
 $('mobile-toc').onclick=()=>{const open=!$('sidebar').classList.contains('open');$('sidebar').classList.toggle('open',open);$('sidebar-backdrop').classList.toggle('open',open);$('mobile-toc').setAttribute('aria-expanded',String(open));};
 $('sidebar-backdrop').onclick=closeSidebar;
 $('copy-original').onclick=async()=>{
  const text=currentPaper.pages.map(p=>p.original).join('\n\n');
  try {
   if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
   else {
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.left='-9999px';document.body.appendChild(area);area.select();
    const success=document.execCommand('copy');area.remove();if(!success)throw new Error('copy');
   }
   notify('已复制英文全文');
  } catch {setSourceMode('text');notify('请在原文文本中选择并复制');}
 };
 window.addEventListener('scroll',()=>{
  if(scrollFrame||!currentPaper)return;scrollFrame=true;
  requestAnimationFrame(()=>{scrollFrame=false;updateReadingPosition($('translation-content'));});
 },{passive:true});
 window.addEventListener('hashchange',route);
 if(singlePage)document.querySelectorAll('a[href$="/index.html"]').forEach(a=>a.href='#home');
 route();
})();
