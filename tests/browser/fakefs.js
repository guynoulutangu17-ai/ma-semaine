/* SDK Firebase SIMULÉ (auth + firestore) : le « cloud » est un dictionnaire partagé côté test. */
const KEY="__fake_user"; let acb=null; const subs=[];
export const initializeApp=()=>({});
export const getAuth=()=>({});
export const browserLocalPersistence={};
export const setPersistence=async()=>{};
export class GoogleAuthProvider{setCustomParameters(){}}
export const onAuthStateChanged=(a,f)=>{acb=f;setTimeout(()=>f(JSON.parse(localStorage.getItem(KEY)||"null")),30);return()=>{}};
export const signInWithPopup=async()=>{const m=localStorage.getItem("__fake_mode")||"ok";if(m!=="ok"){const e=new Error(m);e.code=m;throw e}const uid=localStorage.getItem("__fake_uid")||"u1";const u={uid,displayName:"Test "+uid,email:uid+"@gmail.com",photoURL:null};localStorage.setItem(KEY,JSON.stringify(u));acb(u);return{user:u}};
export const signOut=async()=>{localStorage.removeItem(KEY);acb&&acb(null)};
export const getFirestore=()=>({});
export const doc=(db,...p)=>({path:p.join("/")});
export const serverTimestamp=()=>({__ts:1});
const snap=(r)=>({exists:()=>!!r,data:()=>r?JSON.parse(JSON.stringify(r)):undefined,metadata:{hasPendingWrites:false}});
const call=async(op,a)=>{const r=await window.__cloud(op,JSON.stringify(a));if(r&&r.err){const e=new Error(r.err);e.code=r.err;throw e}return r.v};
export const getDocFromServer=async(ref)=>snap(await call("get",{p:ref.path}));
export const runTransaction=async(db,fn)=>{
  const tx={w:null,get:async(ref)=>snap(await call("get",{p:ref.path})),set:(ref,d)=>{tx.w={p:ref.path,d}}};
  const out=await fn(tx);
  if(tx.w) await call("set",tx.w);
  return out;
};
export const onSnapshot=(ref,cb,err)=>{let last=null;const t=setInterval(async()=>{try{const r=await call("get",{p:ref.path});const k=r?r.rev:-1;if(k!==last){last=k;cb(snap(r))}}catch(e){}},400);return()=>clearInterval(t)};
