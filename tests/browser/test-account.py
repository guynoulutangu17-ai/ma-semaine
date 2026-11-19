import sys, json, subprocess, time, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright
S=os.environ['S']
H=functools.partial(http.server.SimpleHTTPRequestHandler, directory=S+'/www')
H.log_message=lambda *a,**k:None
socketserver.TCPServer.allow_reuse_address=True
srv=socketserver.TCPServer(("127.0.0.1",8766),H)
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8766/ma-semaine/'
res=[]
def ok(n,c,d=''): res.append((n,bool(c),d)); print(('PASS' if c else 'FAIL'),n,d)
FAKE=open(os.environ['S']+'/fakefs.js').read()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    # ---- A: config vide (état livré)
    c=b.new_context(viewport={'width':390,'height':780}); pg=c.new_page(); errs=[]
    pg.route('**/firebase-config.js',lambda r:r.fulfill(body='window.MS_FIREBASE_CONFIG={};',content_type='application/javascript')); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
    pg.goto(URL); pg.wait_for_selector('#hero'); pg.wait_for_timeout(500)
    ok('A1 app ouvre sans compte (hero visible)', pg.is_visible('#hero'))
    ok('A2 bouton compte present', pg.is_visible('#acct-btn'))
    for t in ['#t-etude','#t-questions','#t-horaire']:
        pg.click(t); 
    ok('A3 onglets Horaire/Étude/Rentrée fonctionnent', pg.get_attribute('#t-horaire','aria-selected')=='true')
    before=pg.evaluate('JSON.stringify(Object.keys(localStorage).sort())')
    pg.click('#acct-btn'); pg.wait_for_selector('#acct:not([hidden])')
    ok('A4 dialogue ouvert, bouton Google désactivé (non configuré)', pg.is_disabled('#acct .gbtn'))
    ok('A5 message non configuré affiché', 'pas encore activée' in pg.inner_text('#acct'))
    pg.keyboard.press('Escape'); ok('A6 Échap ferme', pg.is_hidden('#acct'))
    after=pg.evaluate('JSON.stringify(Object.keys(localStorage).sort())')
    ok('A7 aucune clé de stockage ajoutée/modifiée à l\'ouverture', before==after, after)
    ok('A8 aucune erreur JS', not errs, str(errs))
    # données existantes préservées : note + rappel
    pg.click('#t-questions'); pg.fill('#note','note de test'); pg.wait_for_timeout(900)
    pg.reload(); pg.wait_for_selector('#hero'); pg.click('#t-questions')
    ok('A9 note conservée après rechargement', pg.input_value('#note')=='note de test')
    # ---- B: config factice + vrai SDK (pas de réseau Google)
    c2=b.new_context(viewport={'width':390,'height':780},service_workers='block'); pg2=c2.new_page(); e2=[]
    pg2.on('pageerror',lambda e:e2.append(str(e)))
    cfg='window.MS_FIREBASE_CONFIG={apiKey:"fake",authDomain:"x.firebaseapp.com",projectId:"x",appId:"1:1:web:1"};'
    pg2.route('**/firebase-config.js',lambda r:r.fulfill(body=cfg,content_type='application/javascript'))
    pg2.goto(URL); pg2.wait_for_selector('#hero'); pg2.wait_for_timeout(1500)
    pg2.click('#acct-btn'); pg2.wait_for_timeout(500)
    ok('B1 vrai SDK local chargé, bouton Google actif, session absente', pg2.is_enabled('#acct-go'), pg2.inner_text('#acct')[:120])
    ok('B2 aucune erreur JS (vrai SDK)', not e2, str(e2))
    # ---- C: SDK simulé (logique UI uniquement)
    c3=b.new_context(viewport={'width':390,'height':780},service_workers='block'); c3.expose_function('__cloud',lambda op,a:{'v':None} if op=='get' else {'v':1}); pg3=c3.new_page(); e3=[]
    pg3.on('pageerror',lambda e:e3.append(str(e)))
    pg3.route('**/firebase-config.js',lambda r:r.fulfill(body=cfg,content_type='application/javascript'))
    pg3.route('**/vendor/firebase/firebase-auth.js',lambda r:r.fulfill(body=FAKE,content_type='application/javascript'))
    pg3.goto(URL); pg3.wait_for_selector('#hero'); pg3.wait_for_timeout(600)
    pg3.click('#acct-btn')
    for mode,exp in [('auth/popup-closed-by-user',''),('auth/popup-blocked','bloqué'),('auth/network-request-failed','Connexion internet'),('auth/unauthorized-domain','autorisé dans Firebase')]:
        pg3.evaluate(f'localStorage.setItem("__fake_mode","{mode}")'); pg3.click('#acct-go'); pg3.wait_for_timeout(200)
        t=pg3.inner_text('#acct-msg'); ok(f'C erreur {mode}', (exp in t) if exp else t=='' , t[:60])
        ok(f'C app non bloquée après {mode}', pg3.is_enabled('#acct-go'))
    pg3.evaluate('localStorage.setItem("__fake_mode","ok")'); pg3.click('#acct-go'); pg3.wait_for_selector('#acct-uni')
    ok('C1 connexion simulée : nom + email affichés', 'Test u1' in pg3.inner_text('#acct') and 'u1@gmail.com' in pg3.inner_text('#acct'))
    pg3.fill('#acct-uni','UNIKIN'); pg3.fill('#acct-lvl','L1 LMD'); pg3.click('#acct button:text-is("Enregistrer")'); 
    ok('C2 profil enregistré (message)', 'Profil enregistré' in pg3.inner_text('#acct-saved'))
    prof=pg3.evaluate('JSON.parse(localStorage.getItem("ma-semaine-profile"))')
    ok('C3 profil en localStorage', prof['university']=='UNIKIN' and prof['level']=='L1 LMD', str(prof))
    pg3.keyboard.press('Escape'); pg3.reload(); pg3.wait_for_selector('#hero'); pg3.wait_for_timeout(700); pg3.click('#acct-btn'); pg3.wait_for_selector('#acct-uni')
    ok('C4 session + profil conservés après rechargement', pg3.input_value('#acct-uni')=='UNIKIN' and 'Test u1' in pg3.inner_text('#acct'))
    pg3.click('#acct button:text-is("Se déconnecter")'); pg3.wait_for_selector('#acct-out-ok'); pg3.click('#acct-out-ok'); pg3.wait_for_selector('#hero'); pg3.wait_for_timeout(800); pg3.click('#acct-btn'); pg3.wait_for_selector('#acct-go')
    ok('C5 déconnexion : retour à Continuer avec Google', True)
    ok('C6 déconnexion : profil retiré de l\'appareil (isolation entre comptes)', pg3.evaluate('!localStorage.getItem("ma-semaine-profile")'))
    ok('C7 aucune erreur JS (SDK simulé)', not e3, str(e3))
    # ---- D: hors connexion (service worker)
    c4=b.new_context(viewport={'width':390,'height':780}); pg4=c4.new_page()
    pg4.goto(URL); pg4.wait_for_selector('#hero'); pg4.wait_for_function('navigator.serviceWorker.controller!==null',timeout=15000) if False else None
    pg4.evaluate('navigator.serviceWorker.ready.then(()=>1)'); pg4.wait_for_timeout(2500); pg4.reload(); pg4.wait_for_timeout(1500)
    names=pg4.evaluate('caches.keys().then(async k=>{const c=await caches.open(k[0]);return [k,(await c.keys()).map(r=>new URL(r.url).pathname)]})')
    ok('D1 cache v15 contient account, sync, ui, config', all(any(x.endswith(f) for x in names[1]) for f in ['/account.js','/firebase-config.js','/sync.js','/sync-core.js','/ui.css','/ui.js']) and names[0]==['ma-semaine-v15'], str(names[0]))
    c4.set_offline(True); pg4.reload(); pg4.wait_for_selector('#hero',timeout=10000)
    pg4.click('#acct-btn'); ok('D2 hors connexion : app + fenêtre compte s\'ouvrent', pg4.is_visible('#acct'))
    b.close()
print('RESULT',sum(1 for r in res if r[1]),'/',len(res))
sys.exit(0 if all(r[1] for r in res) else 1)
