(function(){
'use strict';

const TAU=Math.PI*2, DEG=Math.PI/180;
const clamp=(v,a=0,b=1)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const nextTick=()=>new Promise(r=>setTimeout(r,0));

/*TEX-START*/
/* ---------- Bề mặt tạo bằng nhiễu ---------- */
function makeRng(seed){
  let s=(seed>>>0)||1;
  return function(){ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
}
function createNoise(seed){
  const rnd=makeRng(seed);
  const p=new Uint8Array(256);
  for(let i=0;i<256;i++)p[i]=i;
  for(let i=255;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=p[i];p[i]=p[j];p[j]=t;}
  const perm=new Uint8Array(512);
  for(let i=0;i<512;i++)perm[i]=p[i&255];
  const val=new Float32Array(256);
  for(let i=0;i<256;i++)val[i]=rnd();
  function n3(x,y,z){
    const x0=Math.floor(x),y0=Math.floor(y),z0=Math.floor(z);
    const fx=x-x0,fy=y-y0,fz=z-z0;
    const X=x0&255,Y=y0&255,Z=z0&255;
    const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),w=fz*fz*(3-2*fz);
    const a=perm[X],b=perm[X+1];
    const aa=perm[a+Y],ab=perm[a+Y+1],ba=perm[b+Y],bb=perm[b+Y+1];
    const c000=val[perm[aa+Z]],c001=val[perm[aa+Z+1]],c010=val[perm[ab+Z]],c011=val[perm[ab+Z+1]];
    const c100=val[perm[ba+Z]],c101=val[perm[ba+Z+1]],c110=val[perm[bb+Z]],c111=val[perm[bb+Z+1]];
    const x00=c000+(c100-c000)*u, x01=c001+(c101-c001)*u;
    const x10=c010+(c110-c010)*u, x11=c011+(c111-c011)*u;
    const y0v=x00+(x10-x00)*v, y1v=x01+(x11-x01)*v;
    return y0v+(y1v-y0v)*w;
  }
  function fbm(x,y,z,oct){
    let amp=0.5,f=1,sum=0,norm=0;
    for(let i=0;i<oct;i++){
      sum+=amp*n3(x*f+i*17.3,y*f+i*9.1,z*f+i*5.7);
      norm+=amp; amp*=0.5; f*=2.03;
    }
    return sum/norm;
  }
  return {n3:n3,fbm:fbm};
}
function ramp(stops,t,out){
  t=clamp(t);
  let i=0;
  while(i<stops.length-2 && t>stops[i+1][0]) i++;
  const a=stops[i],b=stops[i+1];
  const k=clamp((t-a[0])/(b[0]-a[0]));
  out[0]=a[1]+(b[1]-a[1])*k;
  out[1]=a[2]+(b[2]-a[2])*k;
  out[2]=a[3]+(b[3]-a[3])*k;
}
function mixTo(out,r,g,b,k){
  out[0]=out[0]+(r-out[0])*k; out[1]=out[1]+(g-out[1])*k; out[2]=out[2]+(b-out[2])*k;
}
function gasShade(N,o){
  const off=o.off||0;
  return function(x,y,z,lat,out){
    const w=N.fbm(x*2.5+off,y*7,z*2.5,4)-0.5;
    const band=Math.sin((lat+w*o.warp)*o.bands)*0.6+Math.sin((lat*2.3+w*o.warp*1.3)*o.bands*0.9+1.7)*0.4;
    const fine=N.fbm(x*7,y*24,z*7,3)-0.5;
    ramp(o.stops,0.5+band*o.contrast*0.5+fine*o.detail,out);
    if(o.pole){ mixTo(out,o.pole[0],o.pole[1],o.pole[2],smooth(1.05,1.45,Math.abs(lat))*o.pole[3]); }
  };
}
function makeShade(kind,N){
  switch(kind){
    case 'sun':{
      const st=[[0,170,52,6],[0.35,232,104,16],[0.65,252,160,40],[1,255,225,130]];
      return function(x,y,z,lat,o){
        const g=N.fbm(x*5,y*5,z*5,4), f=N.fbm(x*26+3,y*26,z*26,3);
        ramp(st,(g-0.5)*1.4+(f-0.5)*1.1+0.55,o);
      };
    }
    case 'mercury':
      return function(x,y,z,lat,o){
        const a=N.fbm(x*3,y*3,z*3,5), b=N.fbm(x*11+7,y*11,z*11,3);
        const v=70+(0.5+(a-0.5)*1.5+(b-0.5)*0.5)*110;
        o[0]=v*1.03; o[1]=v*0.98; o[2]=v*0.93;
      };
    case 'venus':{
      const st=[[0,186,138,80],[0.5,224,188,124],[1,246,228,182]];
      return function(x,y,z,lat,o){
        const w=N.fbm(x*1.6,y*1.6,z*1.6,3);
        const t=N.fbm(x*2.4+w*2.2,y*4.5+w*1.4,z*2.4+w*2.2,5);
        ramp(st,(t-0.5)*1.8+0.5,o);
      };
    }
    case 'earth':
      return function(x,y,z,lat,o){
        const h=N.fbm(x*1.9+11,y*1.9,z*1.9,6);
        const al=Math.abs(lat);
        const sea=0.55;
        let r,g,b;
        if(h<sea){
          const d=clamp((sea-h)/0.2);
          r=lerp(40,6,d); g=lerp(112,30,d); b=lerp(172,88,d);
        }else{
          const e=clamp((h-sea)/0.2);
          const m=N.fbm(x*4+30,y*4,z*4,4);
          const dry=clamp((0.5-m)*3.5)*(al>0.15&&al<0.75?1:0.25);
          r=lerp(52,190,dry); g=lerp(112,160,dry); b=lerp(50,104,dry);
          const forest=smooth(0.55,0.72,m)*(1-dry);
          r=lerp(r,32,forest*0.6); g=lerp(g,82,forest*0.6); b=lerp(b,42,forest*0.6);
          const mt=smooth(0.45,0.8,e);
          r=lerp(r,126,mt); g=lerp(g,112,mt); b=lerp(b,94,mt);
          const sn=smooth(0.8,1,e);
          r=lerp(r,240,sn); g=lerp(g,244,sn); b=lerp(b,248,sn);
        }
        const cap=smooth(1.13+(N.fbm(x*6,y*6,z*6,3)-0.5)*0.4,1.3,al);
        r=lerp(r,238,cap); g=lerp(g,244,cap); b=lerp(b,250,cap);
        const c=N.fbm(x*3.2+40,y*5.5,z*3.2,5);
        const ca=clamp((c-0.52)*3.4)*0.8;
        o[0]=lerp(r,255,ca); o[1]=lerp(g,255,ca); o[2]=lerp(b,255,ca);
      };
    case 'mars':{
      const st=[[0,150,70,42],[0.5,200,108,66],[1,226,160,110]];
      return function(x,y,z,lat,o){
        const a=N.fbm(x*2.6,y*2.6,z*2.6,5), b=N.fbm(x*8+5,y*8,z*8,3);
        ramp(st,(a-0.5)*1.6+(b-0.5)*0.6+0.55,o);
        const dk=smooth(0.48,0.62,N.fbm(x*1.5+9,y*1.5,z*1.5,4));
        mixTo(o,92,52,40,dk*0.55);
        mixTo(o,240,236,232,smooth(1.3,1.45,Math.abs(lat)));
      };
    }
    case 'jupiter':
      return gasShade(N,{stops:[[0,120,78,52],[0.35,176,122,84],[0.55,214,176,132],[0.8,236,214,180],[1,246,236,214]],
        bands:22,warp:0.14,contrast:1.3,detail:0.5,off:3,pole:[112,120,132,0.55]});
    case 'saturn':
      return gasShade(N,{stops:[[0,168,138,92],[0.5,214,188,138],[1,238,222,182]],
        bands:16,warp:0.08,contrast:0.7,detail:0.3,off:8});
    case 'uranus':
      return gasShade(N,{stops:[[0,128,196,206],[0.5,158,220,226],[1,190,236,238]],
        bands:9,warp:0.05,contrast:0.25,detail:0.12,off:13});
    case 'neptune':
      return gasShade(N,{stops:[[0,28,52,150],[0.5,48,90,205],[1,96,148,236]],
        bands:11,warp:0.09,contrast:0.5,detail:0.3,off:21});
  }
  return function(x,y,z,lat,o){o[0]=o[1]=o[2]=128;};
}
function soft(ctx,W,x,y,rx,ry,stops,alpha){
  for(const dx of [-W,0,W]){
    const cx=x+dx;
    if(cx+rx<0||cx-rx>W) continue;
    ctx.save();
    ctx.globalAlpha=alpha==null?1:alpha;
    ctx.translate(cx,y);
    ctx.scale(rx/ry,1);
    const g=ctx.createRadialGradient(0,0,0,0,0,ry);
    for(const s of stops) g.addColorStop(s[0],s[1]);
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(0,0,ry,0,TAU); ctx.fill();
    ctx.restore();
  }
}
const SPOT=[[0,'rgba(15,5,2,.95)'],[0.4,'rgba(30,10,3,.9)'],[0.55,'rgba(115,42,10,.7)'],[1,'rgba(150,60,14,0)']];
const CRATER=[[0,'rgba(30,28,26,.5)'],[0.62,'rgba(70,66,62,.25)'],[0.78,'rgba(220,212,200,.55)'],[1,'rgba(220,212,200,0)']];
function decorate(kind,ctx,W,H,rnd){
  const yOf=lat=>(0.5-lat/Math.PI)*H;
  const stretch=lat=>1/Math.max(Math.cos(lat),0.3);
  if(kind==='sun'){
    for(let i=0;i<8;i++){
      const lat=(rnd()<0.5?-1:1)*(6+rnd()*20)*DEG, x=rnd()*W, r=5+rnd()*9, y=yOf(lat), s=stretch(lat);
      soft(ctx,W,x,y,r*s,r,SPOT);
      soft(ctx,W,x+r*s*1.9,y+(rnd()-0.5)*r*0.6,r*0.6*s,r*0.6,SPOT);
    }
  }else if(kind==='mercury'||kind==='mars'){
    const n=kind==='mercury'?650:110, a=kind==='mercury'?1:0.4;
    for(let i=0;i<n;i++){
      const lat=Math.asin(rnd()*2-1), x=rnd()*W, r=1.5+Math.pow(rnd(),4)*22, s=stretch(lat);
      soft(ctx,W,x,yOf(lat),r*1.25*s,r*1.25,CRATER,a);
    }
  }else if(kind==='jupiter'){
    const y=yOf(-22*DEG), x=W*0.62;
    soft(ctx,W,x,y,48,32,[[0,'rgba(235,215,190,.55)'],[1,'rgba(235,215,190,0)']]);
    soft(ctx,W,x,y,32,20,[[0,'rgba(170,52,32,.95)'],[0.6,'rgba(200,95,62,.75)'],[0.85,'rgba(226,170,130,.4)'],[1,'rgba(226,170,130,0)']]);
  }else if(kind==='neptune'){
    for(let i=0;i<16;i++){
      const lat=(rnd()-0.5)*100*DEG, x=rnd()*W;
      soft(ctx,W,x,yOf(lat),25+rnd()*50,2.5+rnd()*2.5,[[0,'rgba(235,245,255,.55)'],[1,'rgba(235,245,255,0)']]);
    }
    const y=yOf(-18*DEG), x=W*0.3;
    soft(ctx,W,x,y,42,23,[[0,'rgba(10,20,80,.85)'],[0.6,'rgba(15,30,110,.6)'],[1,'rgba(15,30,110,0)']]);
    soft(ctx,W,x+46,y-9,34,3.5,[[0,'rgba(240,248,255,.7)'],[1,'rgba(240,248,255,0)']]);
  }
}
async function buildTexture(def,W,H,onProgress){
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  const img=ctx.createImageData(W,H), d=img.data;
  const N=createNoise(def.seed);
  const cl=new Float32Array(W), sl=new Float32Array(W);
  for(let x=0;x<W;x++){const lon=(x+0.5)/W*TAU; cl[x]=Math.cos(lon); sl[x]=Math.sin(lon);}
  const shade=makeShade(def.kind,N), out=[0,0,0];
  for(let y=0;y<H;y++){
    const lat=(0.5-(y+0.5)/H)*Math.PI, cy=Math.cos(lat), sy=Math.sin(lat);
    for(let x=0;x<W;x++){
      shade(cy*cl[x],sy,cy*sl[x],lat,out);
      const i=(y*W+x)*4;
      d[i]=out[0]; d[i+1]=out[1]; d[i+2]=out[2]; d[i+3]=255;
    }
    if(y%24===23){ if(onProgress) onProgress(y/H); await nextTick(); }
  }
  ctx.putImageData(img,0,0);
  decorate(def.kind,ctx,W,H,makeRng(def.seed+7));
  return cv;
}
/*TEX-END*/

/* ---------- Số liệu ---------- */
const BODIES=[
{id:'sun',name:'Mặt Trời',sub:'Ngôi sao ở trung tâm hệ Mặt Trời',kind:'sun',seed:21,tilt:7.25,periodH:609.12,periodNote:'ở xích đạo',
 diam:'1.392.000 km',ratio:109,dist:null,cam:5.6,need:2.0,disc:['#ffe08a','#f0631a'],flat:0, orbitDays:0, rPseudo:3.5, dPseudo:0, orbitPhase: 0,
 fact:'Mặt Trời không quay như một khối cứng. Vùng xích đạo quay một vòng mất khoảng 25 ngày, còn gần hai cực mất tới khoảng 35 ngày. Mô phỏng này cho cả khối quay với tốc độ ở xích đạo. Các vết đen giúp bạn theo dõi chuyển động quay.'},
{id:'mercury',name:'Sao Thủy',sub:'Hành tinh đá, gần Mặt Trời nhất',kind:'mercury',seed:31,tilt:0.034,periodH:1407.6,
 diam:'4.879 km',ratio:0.38,dist:'57,9 triệu km',cam:5.6,need:2.0,disc:['#c9c3bc','#6f6a66'],flat:0, orbitDays:88, rPseudo:0.3, dPseudo:6, orbitPhase: Math.random() * Math.PI * 2,
 fact:'Sao Thủy quay 3 vòng quanh trục trong lúc đi 2 vòng quanh Mặt Trời, nên từ lần Mặt Trời mọc này đến lần mọc kế tiếp mất khoảng 176 ngày Trái Đất. Trục gần như thẳng đứng nên hầu như không có mùa.'},
{id:'venus',name:'Sao Kim',sub:'Hành tinh đá, thứ hai từ Mặt Trời',kind:'venus',seed:41,tilt:177.36,periodH:5832.5,
 diam:'12.104 km',ratio:0.95,dist:'108,2 triệu km',cam:5.6,need:2.0,disc:['#f3dcaa','#b98a4e'],flat:0, orbitDays:225, rPseudo:0.5, dPseudo:9, orbitPhase: Math.random() * Math.PI * 2,
 glow:{c:[1,0.85,0.5],k:0.85,s:1.12},
 fact:'Sao Kim gần như lộn ngược (177,36°) nên quay nghịch chiều với hầu hết các hành tinh: Mặt Trời mọc ở phía tây. Một vòng tự quay của nó (243 ngày) còn dài hơn một năm của chính nó (khoảng 225 ngày).'},
{id:'earth',name:'Trái Đất',sub:'Hành tinh đá, thứ ba từ Mặt Trời',kind:'earth',seed:51,tilt:23.44,periodH:23.9345,
 diam:'12.756 km',ratio:1,dist:'149,6 triệu km',cam:5.6,need:2.0,disc:['#6fb2ee','#1d4f96'],flat:0, orbitDays:365.25, rPseudo:0.6, dPseudo:13, orbitPhase: Math.random() * Math.PI * 2,
 glow:{c:[0.35,0.62,1],k:1.1,s:1.14},
 fact:'Trục nghiêng 23,44° tạo ra các mùa: nửa cầu nào ngả về phía Mặt Trời thì ở đó là mùa hè. Một ngày 24 giờ dài hơn một chút so với một vòng tự quay thật (23 giờ 56 phút) vì Trái Đất còn di chuyển trên quỹ đạo.'},
{id:'mars',name:'Sao Hỏa',sub:'Hành tinh đá, thứ tư từ Mặt Trời',kind:'mars',seed:61,tilt:25.19,periodH:24.6229,
 diam:'6.792 km',ratio:0.53,dist:'228 triệu km',cam:5.6,need:2.0,disc:['#e2946a','#9a3f22'],flat:0, orbitDays:687, rPseudo:0.4, dPseudo:17, orbitPhase: Math.random() * Math.PI * 2,
 glow:{c:[1,0.62,0.42],k:0.4,s:1.07},
 fact:'Trục Sao Hỏa nghiêng 25,19°, gần bằng Trái Đất, nên nó cũng có bốn mùa và một ngày dài xấp xỉ ngày của chúng ta (khoảng 24 giờ 40 phút). Mỗi mùa kéo dài gần gấp đôi vì một năm Sao Hỏa dài 687 ngày Trái Đất.'},
{id:'jupiter',name:'Sao Mộc',sub:'Hành tinh khí khổng lồ, thứ năm từ Mặt Trời',kind:'jupiter',seed:71,tilt:3.13,periodH:9.9259,
 diam:'142.984 km',ratio:11.2,dist:'778,5 triệu km',cam:5.6,need:2.0,disc:['#e9c9a0','#a4683c'],flat:0.065, orbitDays:4333, rPseudo:1.8, dPseudo:32, orbitPhase: Math.random() * Math.PI * 2,
 glow:{c:[1,0.88,0.7],k:0.3,s:1.08},
 fact:'Sao Mộc quay nhanh nhất trong các hành tinh: chưa đến 10 giờ một vòng dù to hơn Trái Đất hơn 11 lần. Trục chỉ nghiêng 3,13° nên gần như không có mùa. Vết đỏ trong mô phỏng là một cơn bão khổng lồ, vị trí chỉ mang tính minh họa.'},
{id:'saturn',name:'Sao Thổ',sub:'Hành tinh khí khổng lồ, thứ sáu từ Mặt Trời',kind:'saturn',seed:81,tilt:26.73,periodH:10.656,
 diam:'120.536 km',ratio:9.45,dist:'1.432 triệu km',cam:8.6,need:2.9,disc:['#efdcaa','#b08d55'],flat:0.098, orbitDays:10759, rPseudo:1.5, dPseudo:46, orbitPhase: Math.random() * Math.PI * 2,
 ring:{inner:1.24,outer:2.27,kind:'saturn'},glow:{c:[1,0.9,0.65],k:0.3,s:1.08},
 fact:'Trục nghiêng 26,73° làm các vành đai lúc mở rộng, lúc khép lại thành một đường mỏng khi nhìn từ Trái Đất, khoảng 15 năm một lần. Sao Thổ quay nhanh nên bị dẹt rõ ở hai cực.'},
{id:'uranus',name:'Sao Thiên Vương',sub:'Hành tinh băng khổng lồ, thứ bảy từ Mặt Trời',kind:'uranus',seed:91,tilt:97.77,periodH:17.24,
 diam:'51.118 km',ratio:4.0,dist:'2.867 triệu km',cam:6.6,need:2.5,disc:['#c4f0f2','#5fb0b9'],flat:0.023, orbitDays:30687, rPseudo:1.0, dPseudo:62, orbitPhase: Math.random() * Math.PI * 2,
 ring:{inner:1.64,outer:2.0,kind:'uranus'},glow:{c:[0.5,0.9,1],k:0.5,s:1.1},
 fact:'Sao Thiên Vương nghiêng tới 97,77°, gần như nằm ngang và lăn trên quỹ đạo. Vì vậy mỗi cực có khoảng 42 năm liên tục là ban ngày rồi đến 42 năm là ban đêm. Do trục nghiêng quá 90° nên nó quay nghịch chiều.'},
{id:'neptune',name:'Sao Hải Vương',sub:'Hành tinh băng khổng lồ, thứ tám từ Mặt Trời',kind:'neptune',seed:101,tilt:28.32,periodH:16.11,
 diam:'49.528 km',ratio:3.9,dist:'4.515 triệu km',cam:5.6,need:2.0,disc:['#6f9bff','#1b3a9e'],flat:0.017, orbitDays:60190, rPseudo:1.0, dPseudo:76, orbitPhase: Math.random() * Math.PI * 2,
 glow:{c:[0.3,0.5,1],k:0.6,s:1.1},
 fact:'Trục Sao Hải Vương nghiêng 28,32°, gần giống Trái Đất, nhưng một năm của nó dài khoảng 165 năm Trái Đất nên mỗi mùa kéo dài hơn 40 năm.'}
];
const BY_ID={}; BODIES.forEach(b=>BY_ID[b.id]=b);

/* ---------- Định dạng ---------- */
const nf=(n,d)=>n.toLocaleString('vi-VN',{maximumFractionDigits:d==null?1:d,minimumFractionDigits:0});
function fmtHours(h){
  if(h<1) return nf(h*60,0)+' phút';
  if(h<48){const H=Math.floor(h),M=Math.floor((h-H)*60); return M?H+' giờ '+M+' phút':H+' giờ';}
  const D=Math.floor(h/24),Hh=Math.floor(h-D*24);
  if(D>=730) return nf(D/365.25,1)+' năm';
  return Hh?D+' ngày '+Hh+' giờ':D+' ngày';
}
function fmtSpeed(hps){
  return '1 giây = '+(hps<48?nf(hps,hps<10?2:1)+' giờ':nf(hps/24,1)+' ngày');
}

/* ---------- Giao diện ---------- */
const $=id=>document.getElementById(id);
const stage=$('stage'), canvas=$('gl'), rail=$('rail'), hint=$('hint');
const failBox=$('fail');

BODIES.forEach(b=>{
  const btn=document.createElement('button');
  btn.type='button'; btn.className='chip'; btn.dataset.id=b.id; btn.setAttribute('aria-pressed','false');
  const disc=document.createElement('span'); disc.className='disc';
  disc.style.setProperty('--c1',b.disc[0]); disc.style.setProperty('--c2',b.disc[1]);
  btn.appendChild(disc); btn.appendChild(document.createTextNode(b.name));
  btn.addEventListener('click',()=>select(b.id));
  rail.appendChild(btn);
});

/* Cuộn ngang thanh chọn thiên thể: chuyển cuộn chuột dọc thành cuộn ngang,
   thêm nút mũi tên và lớp mờ hai bên để báo còn hành tinh ở ngoài tầm nhìn. */
const railPrev=$('railPrev'), railNext=$('railNext');
const fadeLeft=document.querySelector('.railFade.left'), fadeRight=document.querySelector('.railFade.right');
function updateRailNav(){
  const max=rail.scrollWidth-rail.clientWidth-1;
  const canLeft=rail.scrollLeft>4, canRight=rail.scrollLeft<max;
  railPrev.classList.toggle('show',canLeft);
  railNext.classList.toggle('show',canRight);
  fadeLeft.classList.toggle('show',canLeft);
  fadeRight.classList.toggle('show',canRight);
}
rail.addEventListener('wheel',e=>{
  if(Math.abs(e.deltaY)<=Math.abs(e.deltaX)) return;
  e.preventDefault();
  rail.scrollLeft+=e.deltaY;
},{passive:false});
rail.addEventListener('scroll',updateRailNav);
railPrev.addEventListener('click',()=>rail.scrollBy({left:-160,behavior:'smooth'}));
railNext.addEventListener('click',()=>rail.scrollBy({left:160,behavior:'smooth'}));
new ResizeObserver(updateRailNav).observe(rail);
updateRailNav();

function showFail(msg){ failBox.hidden=false; failBox.textContent=msg; }
if(typeof THREE==='undefined'){ showFail('Không tải được thư viện đồ họa 3D. Hãy kiểm tra kết nối mạng rồi tải lại trang.'); return; }

let renderer;
try{
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
}catch(e){
  showFail('Trình duyệt này không bật được WebGL nên không hiển thị được mô hình 3D.'); return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.setClearColor(0x05070f,1);

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,1,0.1,400);
scene.add(new THREE.AmbientLight(0xffffff,0.3));
const sunLight=new THREE.DirectionalLight(0xffffff,1.15);
scene.add(sunLight);
const LIGHT_OFF=new THREE.Vector3(-0.7,0.5,0.6);

/* Sao nền, dải sao sáng và tinh vân — gợi sự rộng lớn của không gian */
function dotTexture(){
  const c=document.createElement('canvas'); c.width=c.height=32;
  const g=c.getContext('2d'), gr=g.createRadialGradient(16,16,0,16,16,16);
  gr.addColorStop(0,'rgba(255,255,255,1)');
  gr.addColorStop(0.4,'rgba(255,255,255,.9)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,32,32);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.userData={temp:true};
  return t;
}
function nebulaTexture(seed,rgb){
  const W=256,H=256,cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  const img=ctx.createImageData(W,H), d=img.data;
  const N=createNoise(seed), cx=W/2,cy=H/2,R=W/2;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const nx=(x-cx)/R, ny=(y-cy)/R, dist=Math.sqrt(nx*nx+ny*ny);
      const wisp=clamp(N.fbm(nx*2.1+seed,ny*2.1,seed*0.6,5)*1.35-0.16);
      const a=clamp(wisp*clamp(1-dist*dist)*1.4)*255;
      const i=(y*W+x)*4;
      d[i]=rgb[0]; d[i+1]=rgb[1]; d[i+2]=rgb[2]; d[i+3]=a;
    }
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(cv); t.encoding=THREE.sRGBEncoding; t.userData={temp:true};
  return t;
}
function spherePoint(rnd,rMin,rMax){
  const u=rnd()*2-1, a=rnd()*TAU, r=Math.sqrt(1-u*u), R=rMin+rnd()*(rMax-rMin);
  return [R*r*Math.cos(a),R*u,R*r*Math.sin(a)];
}
const starDot=dotTexture();
function starLayer(n,rMin,rMax,size,opacity,seed,tinted){
  const rnd=makeRng(seed), pos=new Float32Array(n*3), col=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const p=spherePoint(rnd,rMin,rMax);
    pos[i*3]=p[0]; pos[i*3+1]=p[1]; pos[i*3+2]=p[2];
    const t=rnd();
    const c=tinted?(t<0.6?[0.8,0.87,1]:t<0.9?[1,1,1]:[1,0.85,0.66]):[0.86+t*0.14,0.9+t*0.1,1];
    col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:size,map:starDot,vertexColors:true,transparent:true,opacity:opacity,depthWrite:false,sizeAttenuation:false,blending:THREE.AdditiveBlending})));
}
starLayer(2600,95,195,1.1,0.55,5,false);
starLayer(420,90,190,2.05,0.85,23,true);

(function(){ /* Tinh vân xa, tô màu theo bảng màu của giao diện */
  const rnd=makeRng(17), colors=[[130,95,245],[80,205,255],[255,95,150],[255,175,90],[255,215,120]];
  for(let i=0;i<6;i++){
    const tex=nebulaTexture(210+i*17,colors[i%colors.length]);
    const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,opacity:0.4+rnd()*0.18}));
    const p=spherePoint(rnd,108,172); spr.position.set(p[0],p[1]*0.55,p[2]);
    const s=48+rnd()*54; spr.scale.set(s,s,1); spr.renderOrder=-1;
    scene.add(spr);
  }
})();

const twinkles=[];
(function(){ /* Vài ngôi sao sáng nổi bật, lấp lánh nhẹ */
  const rnd=makeRng(29);
  for(let i=0;i<16;i++){
    const sp=radialSprite([[0,'rgba(255,255,255,1)'],[0.25,'rgba(222,236,255,.9)'],[0.6,'rgba(150,190,255,.22)'],[1,'rgba(150,190,255,0)']],1.5+rnd()*1.6);
    const p=spherePoint(rnd,88,182); sp.position.set(p[0],p[1],p[2]);
    sp.material.depthWrite=false;
    const base=0.55+rnd()*0.45;
    sp.material.opacity=base;
    sp.userData={phase:rnd()*TAU,rate:0.5+rnd()*0.8,base:base};
    scene.add(sp); twinkles.push(sp);
  }
})();

const world=new THREE.Group(); scene.add(world);

/* ---------- Tiện ích dựng hình ---------- */
function tube(points,radius,color,opacity,closed){
  const curve=new THREE.CatmullRomCurve3(points,!!closed,'centripetal');
  const geo=new THREE.TubeGeometry(curve,Math.max(24,points.length*2),radius,6,!!closed);
  const mat=new THREE.MeshBasicMaterial({color:color,transparent:opacity<1,opacity:opacity==null?1:opacity});
  return new THREE.Mesh(geo,mat);
}
function circlePts(radius,n){
  const pts=[]; for(let i=0;i<n;i++){const a=i/n*TAU; pts.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));}
  return pts;
}
function makeLabel(text,color,w){
  const c=document.createElement('canvas'); c.width=256; c.height=96;
  const g=c.getContext('2d');
  g.font='600 44px "Be Vietnam Pro", system-ui, sans-serif';
  g.textAlign='center'; g.textBaseline='middle';
  g.shadowColor='rgba(0,0,0,.85)'; g.shadowBlur=8;
  g.fillStyle=color; g.fillText(text,128,48);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.userData={temp:true};
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));
  s.scale.set(w,w*96/256,1); s.renderOrder=10;
  return s;
}
function glowMaterial(c,k,s){
  return new THREE.ShaderMaterial({
    uniforms:{c:{value:new THREE.Color(c[0],c[1],c[2])},k:{value:k},lim:{value:Math.sqrt(1-1/(s*s))}},
    vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 c;uniform float k;uniform float lim;varying vec3 vN;varying vec3 vV;void main(){float d=-dot(normalize(vN),normalize(vV));float f=pow(clamp(d/lim,0.0,1.0),1.6)*k;gl_FragColor=vec4(c*f,f);}',
    side:THREE.BackSide,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false
  });
}
function limbMaterial(){
  return new THREE.ShaderMaterial({
    vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying vec3 vN;varying vec3 vV;void main(){float d=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);float a=pow(1.0-d,2.2)*0.6;gl_FragColor=vec4(0.25,0.05,0.0,a);}',
    transparent:true,depthWrite:false
  });
}
function radialSprite(stops,size){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'), gr=g.createRadialGradient(128,128,0,128,128,128);
  stops.forEach(s=>gr.addColorStop(s[0],s[1]));
  g.fillStyle=gr; g.fillRect(0,0,256,256);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.userData={temp:true};
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
  sp.scale.set(size,size,1);
  return sp;
}
function ringTexture(kind){
  const W=1024,c=document.createElement('canvas'); c.width=W; c.height=4;
  const g=c.getContext('2d'), img=g.createImageData(W,4), N=createNoise(9);
  for(let x=0;x<W;x++){
    const u=x/W, rl=N.n3(u*90,1,2)*0.5+N.n3(u*30,3,4)*0.5;
    let dens=0, r,gg,b;
    if(kind==='saturn'){
      if(u<0.28) dens=0.18; else if(u<0.69) dens=0.9; else if(u<0.765) dens=0.06;
      else if(u>0.94&&u<0.95) dens=0.05; else dens=0.6;
      if(u<0.02||u>0.995) dens*=0.3;
      r=lerp(150,228,rl); gg=lerp(130,208,rl); b=lerp(100,168,rl);
      dens=clamp(dens*(0.65+0.7*rl));
    }else{
      const lines=[0.02,0.1,0.18,0.3,0.5,0.62,0.9];
      lines.forEach(p=>{ if(Math.abs(u-p)<0.008) dens=0.5; });
      r=gg=b=125;
    }
    for(let y=0;y<4;y++){const i=(y*W+x)*4; img.data[i]=r; img.data[i+1]=gg; img.data[i+2]=b; img.data[i+3]=dens*255;}
  }
  g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.userData={temp:true};
  return t;
}

/* ---------- Thiên thể hiện tại ---------- */
let current=null, playing=true, simHours=0, hps=1;
const texCache=new Map();
let selToken=0;

let appMode = 'planet'; // 'solar', 'transition', 'planet'
let solarGroup = null;
const solarMeshes = [];
let transStart = 0, transDuration = 1500;
let camStart = {az:0, el:0, d:0}, camEnd = {az:0, el:0, d:0};
let lookStart = new THREE.Vector3(), lookEnd = new THREE.Vector3();
let currentLook = new THREE.Vector3();
let transitionTargetDef = null;

async function initSolarSystem() {
  if (solarGroup) return;
  solarGroup = new THREE.Group();
  scene.add(solarGroup);
  
  await Promise.all(BODIES.map(async b => {
    if (!b._texLow) {
      const cv = await buildTexture(b, 256, 128);
      b._texLow = new THREE.CanvasTexture(cv);
      b._texLow.encoding = THREE.sRGBEncoding;
    }
    if (b.id !== 'sun') {
      const orbit = tube(circlePts(b.dPseudo, 128), 0.04, 0x445577, 0.4, true);
      solarGroup.add(orbit);
    }
    const geo = new THREE.SphereGeometry(b.rPseudo, 32, 24);
    const mat = b.kind === 'sun' ? new THREE.MeshBasicMaterial({map: b._texLow}) : new THREE.MeshStandardMaterial({map: b._texLow, roughness: 0.9, metalness: 0});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { id: b.id };
    
    if (b.id === 'sun') {
      mesh.add(radialSprite([[0,'rgba(255,190,80,.85)'],[1,'rgba(255,90,10,0)']], 16));
    } else if (b.ring) {
      const rg = new THREE.RingGeometry(b.rPseudo * 1.3, b.rPseudo * 2.2, 64);
      const rm = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({color: 0xaa9988, transparent: true, opacity: 0.6, side: THREE.DoubleSide}));
      rm.rotation.x = -Math.PI / 2;
      mesh.add(rm);
    }
    b._solarMesh = mesh;
    solarGroup.add(mesh);
    solarMeshes.push(mesh);
  }));
}

function showSolarSystem() {
  appMode = 'solar';
  disposeCurrent();
  $('btn-back-solar').style.display = 'none';
  $('planetOnlyInfo').style.display = 'none';
  $('planetViews').style.display = 'none';
  $('name').textContent = 'Hệ Mặt Trời';
  $('sub').textContent = 'Mô phỏng tổng quan hệ hành tinh của chúng ta';
  $('fact').textContent = 'Kéo chuột trái để xoay, chuột phải (hoặc 2 ngón) để dịch chuyển bản đồ, cuộn để thu phóng. Nhấp vào hành tinh bất kỳ để xem chi tiết.';
  rail.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed','false'));
  document.title = 'Hệ Mặt Trời | Xoay hành tinh 3D';
  
  if (!solarGroup) {
    $('loadingText').textContent = 'Đang khởi tạo Hệ Mặt Trời...';
    setLoading(true);
    initSolarSystem().then(() => {
      setLoading(false);
      solarGroup.visible = true;
    });
  } else {
    solarGroup.visible = true;
  }
  
  if(!$('keepSpeed').checked){
    speed.value = "3.2"; // ~1500 hours/sec
  }
  setSpeedFromSlider();

  view.base = 280; view.zoom = 1;
  goView('side');
  view.taz = 0; view.tel = 0.9; view.anim = true;
}
$('btn-back-solar').addEventListener('click', showSolarSystem);

async function getTexture(def){
  if(texCache.has(def.id)) return texCache.get(def.id);
  const cv=await buildTexture(def,1024,512,p=>{ $('loadingText').textContent='Đang tạo bề mặt '+def.name+'… '+Math.round(p*100)+'%'; });
  const t=new THREE.CanvasTexture(cv);
  t.encoding=THREE.sRGBEncoding; t.wrapS=THREE.RepeatWrapping;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  texCache.set(def.id,t);
  return t;
}
function disposeObject(o){
  try{
    if(o.geometry && !o.isSprite) o.geometry.dispose();
    if(o.material){
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.forEach(m=>{
        try{ if(m.map && m.map.userData && m.map.userData.temp) m.map.dispose(); }catch(e){}
        try{ m.dispose(); }catch(e){}
      });
    }
  }catch(e){}
}
function disposeCurrent(){
  /* Dọn sạch toàn bộ nhóm world, không chỉ vật thể đang được theo dõi trong
     biến "current" — để không bao giờ có hai hành tinh cùng tồn tại trên
     khung hình dù có xảy ra tình huống bất thường nào. */
  while(world.children.length){
    const obj=world.children[0];
    obj.traverse(disposeObject);
    world.remove(obj);
  }
  current=null;
}
function buildBody(def,tex){
  disposeCurrent();
  const root=new THREE.Group(); world.add(root);
  const tilt=new THREE.Group(); tilt.rotation.z=def.tilt*DEG; root.add(tilt);

  const geo=new THREE.SphereGeometry(1,96,64);
  const mat=def.kind==='sun'?new THREE.MeshBasicMaterial({map:tex}):new THREE.MeshStandardMaterial({map:tex,roughness:0.95,metalness:0});
  const spin=new THREE.Mesh(geo,mat);
  spin.scale.y=1-def.flat;
  tilt.add(spin);

  if(def.kind==='sun'){
    const limb=new THREE.Mesh(new THREE.SphereGeometry(1.004,64,48),limbMaterial());
    tilt.add(limb);
    root.add(radialSprite([[0,'rgba(255,190,80,.85)'],[0.3,'rgba(255,140,40,.4)'],[0.6,'rgba(255,100,20,.12)'],[1,'rgba(255,90,10,0)']],5.6));
  }
  if(def.glow){
    const gm=new THREE.Mesh(new THREE.SphereGeometry(def.glow.s,64,48),glowMaterial(def.glow.c,def.glow.k,def.glow.s));
    gm.scale.y=1-def.flat; tilt.add(gm);
  }
  if(def.ring){
    const rg=new THREE.RingGeometry(def.ring.inner,def.ring.outer,192,1);
    const p=rg.attributes.position, uv=rg.attributes.uv, v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){
      v.fromBufferAttribute(p,i);
      uv.setXY(i,(v.length()-def.ring.inner)/(def.ring.outer-def.ring.inner),0.5);
    }
    const rm=new THREE.Mesh(rg,new THREE.MeshStandardMaterial({map:ringTexture(def.ring.kind),transparent:true,side:THREE.DoubleSide,roughness:1,metalness:0,depthWrite:false}));
    rm.rotation.x=-Math.PI/2;
    tilt.add(rm);
  }

  const L=def.ring?def.ring.outer+0.35:1.8;
  const planeR=def.ring?def.ring.outer+0.9:2.7;

  /* trục quay, mũi tên và nhãn */
  const axisG=new THREE.Group();
  const axis=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,2*L,8),new THREE.MeshBasicMaterial({color:0xffb454}));
  axisG.add(axis);
  const cone=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.18,16),new THREE.MeshBasicMaterial({color:0xffb454}));
  cone.position.y=L+0.05; axisG.add(cone);
  const north=makeLabel('Bắc','#ffb454',0.75); north.position.set(0,L+0.33,0); axisG.add(north);
  tilt.add(axisG);

  /* cung góc nghiêng, nằm trong mặt phẳng hình */
  const arcG=new THREE.Group();
  const arcR=L-0.2, span=Math.max(def.tilt*DEG,0.004), pts=[];
  for(let i=0;i<=48;i++){const a=span*i/48; pts.push(new THREE.Vector3(-Math.sin(a)*arcR,Math.cos(a)*arcR,0));}
  arcG.add(tube(pts,0.011,0xffb454,0.9,false));
  const la=Math.max(span/2,0.1);
  const tl=makeLabel(nf(def.tilt,def.tilt<1?3:2)+'°','#ffd08a',1.0);
  tl.position.set(-Math.sin(la)*(arcR+0.35),Math.cos(la)*(arcR+0.35),0);
  arcG.add(tl);
  root.add(arcG);

  /* mặt phẳng quỹ đạo và đường vuông góc */
  const planeG=new THREE.Group();
  planeG.add(tube(circlePts(planeR,128),0.008,0x6fd3ff,0.55,true));
  const disc=new THREE.Mesh(new THREE.CircleGeometry(planeR,96),new THREE.MeshBasicMaterial({color:0x3aa8e0,transparent:true,opacity:0.07,side:THREE.DoubleSide,depthWrite:false}));
  disc.rotation.x=-Math.PI/2; planeG.add(disc);
  const nl=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-L,0),new THREE.Vector3(0,L,0)]),
    new THREE.LineDashedMaterial({color:0xffffff,dashSize:0.07,gapSize:0.06,transparent:true,opacity:0.6}));
  nl.computeLineDistances(); planeG.add(nl);
  root.add(planeG);

  /* xích đạo */
  const eqG=new THREE.Group();
  eqG.add(tube(circlePts(1.035,128),0.007,0xb79cff,0.9,true));
  tilt.add(eqG);

  /* kinh tuyến đánh dấu, quay cùng bề mặt */
  const merG=new THREE.Group(), mp=[];
  for(let i=0;i<=64;i++){const a=-Math.PI/2+Math.PI*i/64; mp.push(new THREE.Vector3(Math.cos(a)*1.012,Math.sin(a)*1.012,0));}
  merG.add(tube(mp,0.009,0xff6b9a,1,false));
  const dot=new THREE.Mesh(new THREE.SphereGeometry(0.055,20,14),new THREE.MeshBasicMaterial({color:0xff6b9a}));
  dot.position.set(1.02,0,0); merG.add(dot);
  spin.add(merG);

  current={def:def,root:root,spin:spin,axisG:axisG,arcG:arcG,planeG:planeG,eqG:eqG,merG:merG};
  applyToggles();
}
function applyToggles(){
  if(!current) return;
  current.axisG.visible=current.arcG.visible=$('t-axis').checked;
  current.planeG.visible=$('t-plane').checked;
  current.eqG.visible=$('t-eq').checked;
  current.merG.visible=$('t-mer').checked;
}
['t-axis','t-plane','t-eq','t-mer'].forEach(id=>$(id).addEventListener('change',applyToggles));

/* ---------- Camera ---------- */
const EL_MAX=1.55, ZMIN=0.42, ZMAX=2.0;
const REDUCE=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const view={az:0,el:0.14,zoom:1,base:5.6,anim:false,taz:0,tel:0.14};
const vel={az:0,el:0};
let dragging=false;

function refit(){
  if (appMode === 'solar') {
    view.base = 280;
  } else {
    const need=current?current.def.need:2.0, cam=current?current.def.cam:5.6;
    view.base=Math.max(cam,need/(0.3443*camera.aspect));
  }
}
function resize(){
  const r=stage.getBoundingClientRect();
  const w=Math.max(1,Math.floor(r.width)), h=Math.max(1,Math.floor(r.height));
  renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  refit();
}
new ResizeObserver(resize).observe(stage);

function goView(kind){
  const t=current?current.def.tilt*DEG:0;
  let az=0, el=0.14;
  if(kind==='top'){az=view.az; el=EL_MAX;}
  else if(kind==='pole'){az=-Math.PI/2; el=clamp(Math.PI/2-t,-EL_MAX,EL_MAX);}
  view.taz=az; view.tel=el;
  if(REDUCE){view.az=az; view.el=el; view.anim=false;} else view.anim=true;
  vel.az=vel.el=0;
}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>goView(b.dataset.view)));

function hideHint(){ hint.classList.add('gone'); }
const ptrs=new Map(); let pinch=0, lastMove=0, lastMid=null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY});
  view.anim=false; vel.az=vel.el=0; dragging=true; canvas.classList.add('drag'); hideHint();
  if(ptrs.size===2){
    const v=[...ptrs.values()]; 
    pinch=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
    lastMid={x: (v[0].x+v[1].x)/2, y: (v[0].y+v[1].y)/2};
  }
});
canvas.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId); if(!p) return;
  const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
  if(ptrs.size===1){
    if (appMode === 'solar' && (e.buttons & 6)) { 
      const pDx = -dx * (view.base * view.zoom) * 0.0015;
      const pDz = -dy * (view.base * view.zoom) * 0.0015;
      currentLook.x += pDx * Math.cos(view.az) + pDz * -Math.sin(view.az);
      currentLook.z += pDx * -Math.sin(view.az) + pDz * -Math.cos(view.az);
    } else {
      view.az-=dx*0.006; view.el=clamp(view.el+dy*0.006,-EL_MAX,EL_MAX);
      const now=performance.now(), dt=Math.max(8,now-lastMove)/1000; lastMove=now;
      vel.az=clamp(-dx*0.006/dt,-6,6); vel.el=clamp(dy*0.006/dt,-6,6);
    }
  }else if(ptrs.size===2){
    const v=[...ptrs.values()], d=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
    const mx = (v[0].x + v[1].x) / 2, my = (v[0].y + v[1].y) / 2;
    if(pinch>0) {
      if (appMode === 'solar') {
        view.zoom=clamp(view.zoom*pinch/d, 0.1, 5.0);
        if (lastMid) {
          const mdx = mx - lastMid.x, mdy = my - lastMid.y;
          const pDx = -mdx * (view.base * view.zoom) * 0.0015;
          const pDz = -mdy * (view.base * view.zoom) * 0.0015;
          currentLook.x += pDx * Math.cos(view.az) + pDz * -Math.sin(view.az);
          currentLook.z += pDx * -Math.sin(view.az) + pDz * -Math.cos(view.az);
        }
      } else {
        view.zoom=clamp(view.zoom*pinch/d,ZMIN,ZMAX);
      }
    }
    pinch=d; lastMid={x: mx, y: my}; vel.az=vel.el=0;
  }
});
const raycaster = new THREE.Raycaster();
function endPtr(e){
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if(ptrs.size<2) pinch=0;
  if(ptrs.size===0){
    dragging=false; canvas.classList.remove('drag');
    if(performance.now()-lastMove>90){vel.az=vel.el=0;}
    if (appMode === 'solar' && p && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 10) {
      const r = stage.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const my = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
      const hits = raycaster.intersectObjects(solarMeshes);
      if (hits.length > 0) {
        select(hits[0].object.userData.id);
      }
    }
  }
}
canvas.addEventListener('pointerup',endPtr);
canvas.addEventListener('pointercancel',endPtr);
canvas.addEventListener('wheel',e=>{
  e.preventDefault(); hideHint();
  if (appMode === 'solar') {
    view.zoom=clamp(view.zoom*Math.exp(e.deltaY*0.0012), 0.1, 5.0);
  } else {
    view.zoom=clamp(view.zoom*Math.exp(e.deltaY*0.0012), ZMIN, ZMAX);
  }
},{passive:false});
canvas.addEventListener('keydown',e=>{
  const s=0.09; let used=true;
  if(e.key==='ArrowLeft') view.az+=s;
  else if(e.key==='ArrowRight') view.az-=s;
  else if(e.key==='ArrowUp') view.el=clamp(view.el+s,-EL_MAX,EL_MAX);
  else if(e.key==='ArrowDown') view.el=clamp(view.el-s,-EL_MAX,EL_MAX);
  else if(e.key==='+'||e.key==='=') {
    view.zoom=clamp(view.zoom/1.12, appMode==='solar'?0.1:ZMIN, appMode==='solar'?5.0:ZMAX);
  }
  else if(e.key==='-') {
    view.zoom=clamp(view.zoom*1.12, appMode==='solar'?0.1:ZMIN, appMode==='solar'?5.0:ZMAX);
  }
  else used=false;
  if(used){e.preventDefault(); view.anim=false; hideHint();}
});

/* ---------- Điều khiển thời gian ---------- */
const speed=$('speed');
function setSpeedFromSlider(){ hps=Math.pow(10,Number(speed.value)); $('speedOut').textContent=fmtSpeed(hps); }
speed.addEventListener('input',setSpeedFromSlider);
const playBtn=$('play');
function setPlaying(v){ playing=v; playBtn.textContent=v?'Tạm dừng':'Tiếp tục'; }
playBtn.addEventListener('click',()=>setPlaying(!playing));
$('reset').addEventListener('click',()=>{simHours=0;});
if(REDUCE) setPlaying(false);

/* ---------- Chọn thiên thể ---------- */
function showInfo(def){
  $('name').textContent=def.name;
  $('sub').textContent=def.sub;
  $('s-tilt').textContent=nf(def.tilt,def.tilt<1?3:2)+'°';
  $('s-period').textContent=fmtHours(def.periodH)+(def.periodNote?' ('+def.periodNote+')':'');
  $('s-dir').textContent=def.tilt>90?'Nghịch (quay ngược)':'Thuận';
  $('s-diam').textContent=def.diam+(def.ratio===1?'':(def.ratio<1?', bằng ':', gấp ')+nf(def.ratio,def.ratio<1?2:1)+' lần Trái Đất');
  $('row-dist').hidden=!def.dist;
  if(def.dist) $('s-dist').textContent=def.dist;
  $('fact').textContent=def.fact;
  document.title=def.name+' | Xoay hành tinh 3D';
}
function setLoading(on){ $('loading').hidden=!on; }
async function select(id){
  const def=BY_ID[id], token=++selToken;
  rail.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',String(c.dataset.id===id)));
  const cached=texCache.has(id);
  
  if (appMode === 'solar' && def._solarMesh) {
    appMode = 'transition';
    transitionTargetDef = def;
    transStart = performance.now();
    lookStart.copy(currentLook);
    def._solarMesh.getWorldPosition(lookEnd);
    camStart = {az: view.az, el: view.el, d: view.base * view.zoom};
    camEnd = {az: view.az, el: 0.2, d: def.rPseudo * 4.5};
    if(!cached){ $('loadingText').textContent='Đang bay đến '+def.name+'…'; setLoading(true); }
  } else {
    disposeCurrent(); 
    if(!cached){ $('loadingText').textContent='Đang tạo bề mặt '+def.name+'…'; setLoading(true); }
  }

  let tex;
  try{ tex=await getTexture(def); }
  catch(e){ setLoading(false); showFail('Không tạo được bề mặt cho '+def.name+'.'); return; }
  if(token!==selToken) return;
  setLoading(false);
  
  if (appMode === 'transition') {
    const remain = transDuration - (performance.now() - transStart);
    if (remain > 0) await new Promise(r => setTimeout(r, remain));
  }
  
  appMode = 'planet';
  if (solarGroup) solarGroup.visible = false;
  currentLook.set(0,0,0);
  
  buildBody(def,tex);
  showInfo(def);
  $('btn-back-solar').style.display = 'block';
  $('planetOnlyInfo').style.display = 'block';
  $('planetViews').style.display = 'block';

  simHours=0;
  if(!$('keepSpeed').checked){
    speed.value=String(Math.round(clamp(Math.log10(def.periodH/20),-1,4)*50)/50);
  }
  setSpeedFromSlider();
  refit();
  view.zoom=1;
  goView('side');
}

/* ---------- Vòng lặp ---------- */
let last=performance.now(), lastUi=0;
function frame(now){
  const dt=Math.min(0.1,(now-last)/1000); last=now;
  if(!REDUCE){
    const t=now*0.001;
    for(let i=0;i<twinkles.length;i++){
      const s=twinkles[i], u=s.userData;
      s.material.opacity=u.base*(0.6+0.4*Math.sin(t*u.rate+u.phase));
    }
  }
  if(!current && playing){
    simHours+=dt*hps;
  }
  if(current){
    if(playing) simHours+=dt*hps;
    const turns=simHours/current.def.periodH;
    current.spin.rotation.y=(turns%1)*TAU;
    if(now-lastUi>100){
      lastUi=now;
      $('r-turns').parentNode.childNodes[0].textContent = 'Đã quay ';
      $('r-turns').textContent=nf(turns,2)+' vòng';
      $('r-time').textContent=fmtHours(simHours);
    }
  } else if (appMode === 'solar' || appMode === 'transition') {
    if(now-lastUi>100){
      lastUi=now;
      $('r-turns').parentNode.childNodes[0].textContent = 'Đã trôi qua ';
      let days = simHours / 24;
      if (days < 365) {
        $('r-turns').textContent = nf(days, 1) + ' ngày';
      } else {
        $('r-turns').textContent = nf(days/365, 2) + ' năm';
      }
      $('r-time').textContent='';
    }
  }
  if(view.anim){
    const k=1-Math.exp(-dt*6);
    let da=((view.taz-view.az+Math.PI)%TAU+TAU)%TAU-Math.PI;
    view.az+=da*k; view.el+=(view.tel-view.el)*k;
    if(Math.abs(da)<0.002&&Math.abs(view.tel-view.el)<0.002){view.az=view.taz; view.el=view.tel; view.anim=false;}
  }else if(!dragging && appMode !== 'transition'){
    view.az+=vel.az*dt; view.el=clamp(view.el+vel.el*dt,-EL_MAX,EL_MAX);
    const f=Math.pow(0.04,dt); vel.az*=f; vel.el*=f;
  }
  
  let d = view.base * view.zoom;
  
  if (appMode === 'solar' && solarGroup) {
    BODIES.forEach(b => {
      if (b._solarMesh && b.id !== 'sun') {
        const angle = -(simHours / 24 / b.orbitDays) * TAU + (b.orbitPhase || 0);
        b._solarMesh.position.set(Math.cos(angle) * b.dPseudo, 0, Math.sin(angle) * b.dPseudo);
      }
      if (b._solarMesh) {
         b._solarMesh.rotation.y = (simHours / b.periodH % 1) * TAU;
      }
    });
  }

  if (appMode === 'transition') {
    const t = smooth(0, transDuration, now - transStart);
    view.az = lerp(camStart.az, camEnd.az, t);
    view.el = lerp(camStart.el, camEnd.el, t);
    d = lerp(camStart.d, camEnd.d, t);
    currentLook.lerpVectors(lookStart, lookEnd, t);
    
    if (solarGroup) {
      BODIES.forEach(b => {
        if (b._solarMesh && b.id !== 'sun') {
          const angle = -(simHours / 24 / b.orbitDays) * TAU + (b.orbitPhase || 0);
          b._solarMesh.position.set(Math.cos(angle) * b.dPseudo, 0, Math.sin(angle) * b.dPseudo);
        }
        if (b._solarMesh) {
           b._solarMesh.rotation.y = (simHours / b.periodH % 1) * TAU;
        }
      });
      if (transitionTargetDef && transitionTargetDef._solarMesh) {
        transitionTargetDef._solarMesh.getWorldPosition(lookEnd);
      }
    }
  } else if (appMode === 'solar') {
    currentLook.set(0,0,0);
  } else {
    currentLook.set(0,0,0);
  }

  const ce=Math.cos(view.el);
  camera.position.set(currentLook.x + d*ce*Math.sin(view.az), currentLook.y + d*Math.sin(view.el), currentLook.z + d*ce*Math.cos(view.az));
  camera.lookAt(currentLook);
  sunLight.position.copy(LIGHT_OFF).applyQuaternion(camera.quaternion).multiplyScalar(20);
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
resize();
setSpeedFromSlider();
if(!REDUCE) setPlaying(true);
showSolarSystem();
requestAnimationFrame(frame);
})();
