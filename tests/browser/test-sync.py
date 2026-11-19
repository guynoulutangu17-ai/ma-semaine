import sys, json, os, functools, http.server, socketserver, threading, time
from playwright.sync_api import sync_playwright
S=os.environ['S']
socketserver.TCPServer.allow_reuse_address=True
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=S+'/www'); H.log_message=lambda *a,**k:None
srv=socketserver.TCPServer(("127.0.0.1",8768),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8768/ma-semaine/'
FAKE=open(S+'/fakefs.js').read()
CFG='window.MS_FIREBASE_CONFIG={apiKey:"f",authDomain:"x.firebaseapp.com",projectId:"x",appId:"1"};'
cloud={}; down={'v':False}; writes={'n':0}
def handler(op,a):
    a=json.loads(a)
    if down['v']: return {'err':'unavailable'}
    if op=='get': return {'v':cloud.get(a['p'])}
    if op=='set':
        cur=cloud.get(a['p']); d=a['d']
        if (cur['rev'] if cur else 0)+1!=d['rev']: return {'err':'aborted'}
        d['updatedAt']=int(time.time()*1000); cloud[a['p']]=d; writes['n']+=1; return {'v':1}
res=[]
def ok(n,c,d=''): res.append(bool(c)); print('PASS' if c else 'FAIL',n,d)
def device(b):
    c=b.new_context(viewport={'width':390,'height':780},service_workers='block'); errs=[]
    c.expose_function('__cloud',lambda op,a:handler(op,a))
    pg=c.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/firebase-config.js',lambda r:r.fulfill(body=CFG,content_type='application/javascript'))
    pg.route('**/vendor/firebase/firebase-auth.js',lambda r:r.fulfill(body=FAKE,content_type='application/javascript'))
    return c,pg,errs
def st(pg): return pg.evaluate('MSSync.status()')
def wait_state(pg,s,t=15000): pg.wait_for_function(f'window.MSSync&&MSSync.status().state==="{s}"',timeout=t)
def ls(pg,k): return pg.evaluate(f'localStorage.getItem({json.dumps(k)})')
def login(pg,uid):
    pg.evaluate(f'localStorage.setItem("__fake_uid","{uid}")'); pg.click('#acct-btn'); pg.wait_for_selector('#acct-go:not([disabled])'); pg.click('#acct-go')
def leaves(uid): d=cloud.get(f'users/{uid}/sync/state'); return d['leaves'] if d else {}
SEED_B={"done":{"0:lun-0":True},"q":{},"note":"Ma note du vieux téléphone","eoe":"","theme":"dark","rem":{"2026-11-20":[{"id":"r1","t":"Rendre le TP","done":False},{"id":"r2","t":"Acheter cahier","done":True}]},"off":{"2026-11-19|1":True},"offDay":{},"plan":{},"icsRem":0,"tm":{"p":"classic","w":25,"r":5}}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    # ===== A : appareil 1, migration des données locales =====
    c1,d1,e1=device(b)
    d1.goto(URL); d1.wait_for_selector('#hero')
    d1.evaluate('(s)=>{localStorage.setItem("ma-semaine-cls","B");localStorage.setItem("l1b-planner-v2",JSON.stringify(s));localStorage.setItem("ma-semaine-profile",JSON.stringify({university:"UNIKIN",level:"L1 LMD",updatedAt:1}))}',SEED_B)
    ok('A0 sans compte : aucune écriture cloud', writes['n']==0)
    d1.reload(); d1.wait_for_selector('#hero'); login(d1,'u1')
    d1.wait_for_function('localStorage.getItem("ma-semaine-sync")&&JSON.parse(localStorage.getItem("ma-semaine-sync")).migrated',timeout=15000); d1.wait_for_selector('#hero'); d1.wait_for_timeout(800)
    L=leaves('u1')
    ok('A1 migration : données locales présentes dans le cloud', len(L)>=8 and any('note' in k for k in L) and any('rem' in k for k in L) and any('off' in k for k in L), str(len(L)))
    ok('A2 profil université/promotion envoyés', any(k=='profile~university' for k in L))
    ok('A3 copie de sécurité avant fusion créée', 'Ma note du vieux' in (ls(d1,'ma-semaine-premerge') or ''))
    ok('A4 données locales intactes après migration', json.loads(ls(d1,'l1b-planner-v2'))['note']=='Ma note du vieux téléphone' and len(json.loads(ls(d1,'l1b-planner-v2'))['rem']['2026-11-20'])==2)
    wait_state(d1,'synced'); ok('A5 statut Synchronisé + date de dernière synchro', st(d1)['lastSync']>0)
    n0=writes['n']; d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(1200); d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(1200)
    ok('A6 migration répétable : aucune écriture ni doublon supplémentaire', writes['n']==n0 and len(leaves('u1'))==len(L))
    # ===== B : sauvegarde automatique groupée via l'interface =====
    d1.keyboard.press('Escape'); d1.wait_for_function('window.MSSync&&MSSync.status().state=="synced"',timeout=20000); d1.click('#t-questions'); n0=writes['n']
    for t in ['Ma note du vieux téléphone +1','Ma note du vieux téléphone +12','Ma note du vieux téléphone +123']:
        d1.fill('#note',t); d1.wait_for_timeout(250)
    d1.wait_for_function('MSSync.status().state==="pending"',timeout=5000); ok('B1 statut « Modifications en attente » après modification', True)
    ls0=st(d1)['lastSync']; d1.wait_for_function('MSSync.status().state==="synced"&&MSSync.status().lastSync>'+str(ls0),timeout=15000); d1.wait_for_timeout(500)
    ok('B2 une seule écriture groupée pour 3 frappes', writes['n']==n0+1, f'{writes["n"]-n0}')
    ok('B3 note à jour dans le cloud', any('+123' in json.loads(v.get('j','""')) for k,v in leaves('u1').items() if k.endswith('note')))
    # ===== C : nouveau téléphone =====
    c2,d2,e2=device(b); d2.goto(URL); d2.wait_for_selector('#hero'); login(d2,'u1')
    d2.wait_for_function('localStorage.getItem("l1b-planner-v2")',timeout=20000); d2.wait_for_selector('#hero'); d2.wait_for_timeout(1000)
    s2=json.loads(ls(d2,'l1b-planner-v2'))
    ok('C1 restauration : note, rappels, cours annulé, séances faites, thème', s2['note'].endswith('+123') and len(s2['rem']['2026-11-20'])==2 and s2['off'].get('2026-11-19|1') and s2['done'].get('0:lun-0') and s2['theme']=='dark')
    ok('C2 restauration : classe, profil', ls(d2,'ma-semaine-cls')=='B' and json.loads(ls(d2,'ma-semaine-profile'))['university']=='UNIKIN')
    ok('C3 identifiants de rappels conservés', {r['id'] for r in s2['rem']['2026-11-20']}=={'r1','r2'})
    d2.keyboard.press('Escape'); d2.click('#t-questions'); ok('C4 la note restaurée est affichée dans l\'application', d2.input_value('#note').endswith('+123'))
    ok('C5 identifiants intacts après reconnexion (pas de doublon)', len(leaves('u1'))==len(L))
    # ===== D : deux appareils =====
    def setls(pg,mut):
        pg.evaluate('(m)=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));'+mut+';localStorage.setItem(k,JSON.stringify(s))}',None)
    d1.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));s.rem["2026-11-20"].push({id:"rA",t:"Rappel appareil 1",done:false});s.done["0:mar-0"]=true;localStorage.setItem(k,JSON.stringify(s))}')
    d2.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));s.rem["2026-11-20"].push({id:"rB",t:"Rappel appareil 2",done:false});s.off["2026-11-21|2"]=true;s.rem["2026-11-20"]=s.rem["2026-11-20"].filter(x=>x.id!=="r2");localStorage.setItem(k,JSON.stringify(s))}')
    d1.evaluate('MSSync.syncNow("t")'); d2.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(2500)
    d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(2000); d2.evaluate('MSSync.syncNow("t")'); d2.wait_for_timeout(2000)
    d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(1500)
    for pg in (d1,d2):
        if st(pg)['applyPending']:
            try: pg.evaluate('MSSync.applyNow()'); pg.wait_for_selector('#hero'); pg.wait_for_timeout(1200)
            except Exception: pass
    for nm,pg in (('d1',d1),('d2',d2)):
        s=json.loads(ls(pg,'l1b-planner-v2')); ids=sorted(r['id'] for r in s['rem']['2026-11-20'])
        ok(f'D {nm} : rappels fusionnés des deux appareils, suppression propagée, sans doublon', ids==['r1','rA','rB'], str(ids))
        ok(f'D {nm} : séances et cours annulés des deux appareils', s['done'].get('0:mar-0') and s['done'].get('0:lun-0') and s['off'].get('2026-11-21|2') and s['off'].get('2026-11-19|1'))
    # note modifiée simultanément : rien n'est perdu
    d1.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));s.note+=" AJOUT-UN";localStorage.setItem(k,JSON.stringify(s))}'); d1.wait_for_timeout(300)
    d2.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));s.note+=" AJOUT-DEUX";localStorage.setItem(k,JSON.stringify(s))}')
    d1.evaluate('MSSync.syncNow("t")'); d2.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(2500); d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(2000); d2.evaluate('MSSync.syncNow("t")'); d2.wait_for_timeout(2000)
    cn=' '.join(json.loads(v['j']) for k,v in leaves('u1').items() if k.endswith('note'))
    ok('D3 note modifiée sur les deux appareils : les deux ajouts conservés', 'AJOUT-UN' in cn and 'AJOUT-DEUX' in cn, cn[-80:])
    # ===== E : hors connexion =====
    down['v']=True; before=json.loads(json.dumps(cloud))
    d1.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));s.rem["2026-11-22"]=[{id:"rOff",t:"Rappel hors ligne",done:false}];localStorage.setItem(k,JSON.stringify(s))}')
    d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(1500); s=st(d1)
    ok('E1 cloud injoignable : statut erreur/attente, jamais « Synchronisé »', s['state'] in ('error','pending'), s['state'])
    ok('E2 données conservées localement pendant la panne', 'rOff' in ls(d1,'l1b-planner-v2'))
    ok('E3 rien n\'a été écrit dans le cloud pendant la panne', cloud==before)
    down['v']=False; d1.evaluate('window.dispatchEvent(new Event("online"))'); wait_state(d1,'synced',20000)
    ok('E4 retour du réseau : modifications envoyées automatiquement', any('rOff' in k for k in leaves('u1')))
    # ===== F : séparation des comptes + déconnexion =====
    d1.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k));s.note+=" NON-ENVOYE";localStorage.setItem(k,JSON.stringify(s))}'); down['v']=True
    d1.click('#acct-btn'); d1.wait_for_selector('#acct:not([hidden])'); d1.click('#acct button:text-is("Se déconnecter")'); d1.wait_for_selector('#acct-out-ok')
    ok('F1 confirmation de déconnexion + avertissement modifications non envoyées', 'pas encore été envoyées' in d1.inner_text('#acct'))
    cloud_before=json.loads(json.dumps(cloud)); d1.click('#acct-out-ok'); d1.wait_for_selector('#hero'); d1.wait_for_timeout(1500)
    ok('F2 déconnexion : données du compte retirées de l\'appareil', all(ls(d1,k) is None for k in ['l1b-planner-v2','ma-semaine-profile','ma-semaine-cls','ma-semaine-premerge','ma-semaine-sync']))
    ok('F3 déconnexion : données cloud intactes (pas de suppression de compte)', cloud==cloud_before and len(leaves('u1'))>0)
    ok('F4 modifications non envoyées mises à l\'abri', 'NON-ENVOYE' in (ls(d1,'ma-semaine-vault-u1') or ''))
    down['v']=False; login(d1,'u2'); d1.wait_for_timeout(3000)
    ok('F5 autre compte (u2) : aucune donnée de u1 visible', 'Ma note' not in (ls(d1,'l1b-planner-v2') or '') and 'ma-semaine-vault' not in (ls(d1,'ma-semaine-sync') or ''))
    ok('F6 autre compte (u2) : espace cloud séparé, rien de u1 copié', not any('Ma note' in v.get('j','') for v in leaves('u2').values()))
    d1.evaluate('()=>{const k="l1b-planner-v2";const s=JSON.parse(localStorage.getItem(k)||"{}");s.note="note de u2";localStorage.setItem(k,JSON.stringify(s))}'); d1.evaluate('MSSync.syncNow("t")'); d1.wait_for_timeout(2500)
    ok('F7 écriture de u2 dans son propre espace uniquement', any('note de u2' in v.get('j','') for v in leaves('u2').values()) and not any('note de u2' in v.get('j','') for v in leaves('u1').values()))
    d1.keyboard.press('Escape'); d1.click('#acct-btn'); d1.wait_for_selector('#acct:not([hidden])'); d1.click('#acct button:text-is("Se déconnecter")'); d1.wait_for_selector('#acct-out-ok'); d1.click('#acct-out-ok'); d1.wait_for_selector('#hero'); d1.wait_for_timeout(1000)
    login(d1,'u1'); d1.wait_for_function('localStorage.getItem("l1b-planner-v2")',timeout=20000); d1.wait_for_timeout(2500)
    d1.wait_for_selector('#hero'); fin=ls(d1,'l1b-planner-v2') or ''
    ok('F8 reconnexion u1 : données cloud + modifications mises à l\'abri retrouvées', 'NON-ENVOYE' in fin and 'rOff' in fin and 'note de u2' not in fin, fin[:0])
    ok('F9 aucune erreur JS sur les appareils', not (e1+e2), str(e1+e2))
    b.close()
print('RESULT',sum(res),'/',len(res)); sys.exit(0 if all(res) else 1)
