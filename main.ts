import{readFileSync,mkdirSync,writeFileSync}from'node:fs'
let{MAKEFUN_INPUT_DIR:I='/input',MAKEFUN_OUTPUT_DIR:O='/output'}=process.env,z=(a,b)=>a-b
function s(t){
let r=t.split('\n'),W=r[0].length,S=r.join(''),N=S.length,D=[1,-1,W,-W],V='rldu',B=[],G=[],P=0
for(let p=0;p<N;p++){let c=S[p];if('$*'.includes(c))B.push(p);if('.*+'.includes(c))G.push(p);if('@+'.includes(c))P=p}
let F=(X,s)=>{let m=new Map([[s]]),q=[s];for(let p of q)for(let j=4;j--;){let n=p+D[j];if(!m.has(n)&&S[n]!='#'&&!X.includes(n)){m.set(n,[p,j]);q.push(n)}}return m}
let w=(X,s,t)=>{let m=F(X,s);if(!m.has(t))return null;let o='',c=t;while(c!=s){let[a,b]=m.get(c);o=V[b]+o;c=a}return o}
let H=P/W|0,HS=Array.from({length:W},(_,i)=>H*W+i),R=[]
for(let p=0;p<N;p++){if(S[p]=='#'||(p/W|0)==H||R.some(r=>r[0].has(p)))continue;let cp=new Set(F(HS,p).keys());let b=B.filter(x=>cp.has(x)),g=G.filter(x=>cp.has(x)),h=-1;for(let x of cp)for(let d of D){let n=x+d;if((n/W|0)==H&&S[n]!='#')h=n}if(b.length)R.push([cp,b,g,h])}
let SR=(f,rb,rg,ot,ps)=>{let gl=b=>b.every(x=>rg.includes(x)),cur=[...rb];if(gl(cur))return[];let q=[[cur,ps,-1,0,0]],sd=new Set([cur.join()+'|'+Math.min(...F([...cur,...ot],ps).keys())]);for(let i=0;i<q.length;i++){let[b,p]=q[i],al=[...b,...ot],rg2=F(al,p);for(let bi=b.length;bi--;)for(let di=4;di--;){let bp=b[bi],d=D[di],be=bp+d,bh=bp-d;if(!f.has(be)||al.includes(be)||!rg2.has(bh))continue;let nb=[...b];nb[bi]=be;nb.sort(z);let nk=nb.join()+'|'+Math.min(...F([...nb,...ot],bp).keys());if(sd.has(nk))continue;sd.add(nk);q.push([nb,bp,i,bp,di]);if(gl(nb)){let o=[],c=q.length-1;while(c>0){o.unshift([q[c][3],q[c][4]]);c=q[c][2]}return o}}if(q.length>5e5)return null}return null}
let o='',cp=P,cb=[...B]
for(let[fl,rb,rg,h]of R){let w0=w(cb,cp,h);if(w0==null)return'';o+=w0;cp=h;let ot=cb.filter(x=>!rb.includes(x)),ps=SR(fl,rb,rg,ot,cp);if(!ps)return'';let r2=[...rb];for(let[bp,di]of ps){let d=D[di],bh=bp-d,w2=w([...r2,...ot],cp,bh);if(w2==null)return'';o+=w2+V[di];r2=r2.map(x=>x==bp?bp+d:x).sort(z);cp=bp}cb=[...ot,...r2].sort(z)}
return o
}
for(let k=6;k-->1;){let m=s(readFileSync(I+'/i00'+k+'/level.txt','utf8'));mkdirSync(O+'/i00'+k);writeFileSync(O+'/i00'+k+'/solution.txt',m+'\n')}
