import sys, json, os, functools, http.server, socketserver, threading
from playwright.sync_api import sync_playwright
S=os.environ['S']
socketserver.TCPServer.allow_reuse_address=True
H=functools.partial(http.server.SimpleHTTPRequestHandler,directory=S+'/www'); H.log_message=lambda *a,**k:None
srv=socketserver.TCPServer(("127.0.0.1",8773),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8773/ma-semaine/'; res=[]
def ok(n,c,d=''): res.append(bool(c)); print('PASS' if c else 'FAIL',n,d)
SEED={"done":{"0:lun-0":True},"q":{"q1":True},"note":"Ma note","eoe":"","theme":"auto","rem":{"2026-11-20":[{"id":"r1","t":"Rendre le TP","done":False}]},"off":{},"offDay":{},"plan":{},"icsRem":0,"tm":{"p":"classic","w":25,"r":5}}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for w in (360,390,768):
        c=b.new_context(viewport={'width':w,'height':800},service_workers='block'); pg=c.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#hero')
        pg.evaluate('(s)=>{localStorage.setItem("ma-semaine-cls","B");localStorage.setItem("l1b-planner-v2",JSON.stringify(s))}',SEED)
        pg.reload(); pg.wait_for_selector('#hero'); pg.wait_for_timeout(800)
        sw=pg.evaluate('document.documentElement.scrollWidth'); ok(f'{w}px : pas de défilement horizontal',sw<=w,str(sw))
        ok(f'{w}px : onglet « Notes » (et plus « Rentrée »)', pg.inner_text('#t-questions').strip()=='Notes' and 'Rentrée' not in pg.inner_text('body'))
        ok(f'{w}px : compte à rebours h / min / s présent', all(pg.is_visible(x) for x in ['#c-h','#c-m','#c-s']))
        ok(f'{w}px : date et professeur séparés dans la carte', pg.locator('#hs .hs-date').count()==1 and pg.locator('#hs .hs-who').count()==1)
        if w==390:
            # thèmes
            pg.click('#acct-btn'); pg.wait_for_selector('#acct:not([hidden])')
            for lab,attr in [('Sombre','dark'),('Clair','light'),('Automatique',None)]:
                pg.click(f'#acct .acct-theme button:text-is("{lab}")'); pg.wait_for_timeout(200)
                cur=pg.evaluate('document.documentElement.getAttribute("data-theme")')
                st=json.loads(pg.evaluate('localStorage.getItem("l1b-planner-v2")'))['theme']
                ok(f'thème {lab} : appliqué et enregistré', cur==attr and st==(attr or 'auto'), f'{cur}/{st}')
                ok(f'thème {lab} : bouton sélectionné', pg.get_attribute(f'#acct .acct-theme button:text-is("{lab}")','aria-pressed')=='true')
            pg.click('#acct .acct-theme button:text-is("Sombre")'); pg.keyboard.press('Escape'); pg.reload(); pg.wait_for_selector('#hero')
            ok('thème sombre conservé après rechargement', pg.evaluate('document.documentElement.getAttribute("data-theme")')=='dark')
            # cloche
            pg.click('#t-etude'); pg.click('#bell'); pg.wait_for_timeout(600)
            ok('cloche : ramène aux rappels du jour', pg.get_attribute('#t-horaire','aria-selected')=='true' and pg.is_visible('#reminput'))
            # onglet notes : données
            pg.click('#t-questions'); ok('Notes : note et liste conservées', pg.input_value('#note')=='Ma note' and pg.is_visible('#qlist'))
            # données non modifiées par l'affichage
            s=json.loads(pg.evaluate('localStorage.getItem("l1b-planner-v2")'))
            ok('données intactes (rappel, séance, note, liste)', s['rem']['2026-11-20'][0]['id']=='r1' and s['done'].get('0:lun-0') and s['q'].get('q1') and s['note']=='Ma note')
            # annulation d'un cours
            pg.click('#t-horaire'); pg.wait_for_timeout(300)
            if pg.locator('#blocks .mini').count():
                t0=pg.inner_text('#blocks .mini >> nth=0'); ok('bouton « Annuler ce cours » (clair)', t0=='Annuler ce cours', t0)
                pg.click('#blocks .mini >> nth=0'); pg.wait_for_timeout(300)
                ok('cours annulé : étiquette + bouton Rétablir', pg.locator('#blocks .block.off').count()==1 and pg.inner_text('#blocks .mini >> nth=0')=='Rétablir')
                pg.click('#blocks .mini >> nth=0'); pg.wait_for_timeout(300)
                ok('cours rétabli', pg.locator('#blocks .block.off').count()==0)
        ok(f'{w}px : aucune erreur JS', not errs, str(errs))
    b.close()
print('RESULT',sum(res),'/',len(res)); sys.exit(0 if all(res) else 1)
