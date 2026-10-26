from playwright.sync_api import sync_playwright
from pathlib import Path
html=Path(__file__).resolve().parent / 'public' / 'index.html'.read_text()
html=html.replace('<script src="/socket.io/socket.io.js"></script><script>', '''<script>
window.__fakeHandlers={}; window.__fakeSent=[]; window.__fakeAck=null;
window.io=function(){return {id:'A',on:(e,f)=>{window.__fakeHandlers[e]=f;if(e==='connect')setTimeout(f,0)},emit:(e,d,ack)=>{window.__fakeSent.push({event:e,data:d});if(ack){let res={ok:true,phase:'augment'};if(e==='player:augment'){window.__fakeAck=d;res.phase=window.__phaseAfterPick||'augment'}ack(res)}}}};
window.__fakeDeliver=(e,d)=>window.__fakeHandlers[e](d);
</script><script>''')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(viewport={"width":1280,"height":900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='load')
    page.wait_for_timeout(100)
    room={"id":"ROOM","name":"test","mode":"solo","maxPlayers":2,"pieceCount":2,"hasPassword":False,"players":[{"id":"A","name":"A","ready":True,"host":True,"augment":None,"augmentLocked":False},{"id":"B","name":"B","ready":True,"host":False,"augment":None,"augmentLocked":False}],"started":True,"phase":"augment","code":"ROOM"}
    state={"turnIndex":0,"pending":[],"currentResult":None,"extraRolls":0,"gameOver":False,"winner":None,"players":[{"id":"A","name":"A","color":"#5aa9ff","pieces":[None,None],"finished":0,"augment":None,"augmentUsed":False,"shieldUsed":False},{"id":"B","name":"B","color":"#ff6868","pieces":[None,None],"finished":0,"augment":None,"augmentUsed":False,"shieldUsed":False}],"lastRoll":None,"log":[]}
    page.evaluate("({room,state})=>{window.__phaseAfterPick='augment';window.__fakeDeliver('room:update',{room,state});window.__fakeDeliver('game:state',{room,state})}", {"room":room,"state":state})
    assert page.locator('#game').evaluate("e=>e.classList.contains('show')"), 'game screen not shown'
    assert page.locator('#augmentSetup').evaluate("e=>getComputedStyle(e).display !== 'none' && e.getAttribute('data-visible')==='true'"), 'augment modal not visible'
    assert page.locator('#gamePlayArea').evaluate("e=>getComputedStyle(e).display==='none'"), 'board area not hidden during draft'
    page.locator('[data-augment="swift"]').click()
    assert not page.locator('#confirmAugmentStart').is_disabled(), 'confirm should enable after selection'
    page.locator('#confirmAugmentStart').click()
    assert page.locator('#augmentWaiting').inner_text().find('기다려')>=0, 'waiting state not shown after first pick'
    # Deliver authoritative room state after one player confirms: overlay must remain, board hidden.
    room1={**room,"players":[{**room['players'][0],"augment":"swift","augmentLocked":True},room['players'][1]]}
    state1={**state,"players":[{**state['players'][0],"augment":"swift"},state['players'][1]]}
    page.evaluate("({room,state})=>window.__fakeDeliver('game:state',{room,state})", {"room":room1,"state":state1})
    assert page.locator('#augmentSetup').evaluate("e=>getComputedStyle(e).display !== 'none'"), 'modal disappeared before all picks'
    assert page.locator('#gamePlayArea').evaluate("e=>getComputedStyle(e).display==='none'"), 'board appeared before all picks'
    # All picks complete -> phase playing; UI must hide overlay and show board.
    room2={**room1,"phase":"playing","players":[room1['players'][0],{**room['players'][1],"augment":"fortune","augmentLocked":True}]}
    state2={**state1,"players":[state1['players'][0],{**state['players'][1],"augment":"fortune"}]}
    page.evaluate("({room,state})=>window.__fakeDeliver('game:state',{room,state})", {"room":room2,"state":state2})
    assert page.locator('#augmentSetup').evaluate("e=>getComputedStyle(e).display==='none'"), 'modal still visible after all picks'
    assert page.locator('#gamePlayArea').evaluate("e=>getComputedStyle(e).display!=='none'"), 'board still hidden after all picks'
    assert not errors, 'browser errors: '+repr(errors)
    print('PASS: Chromium DOM integration test — augment modal shown first, board hidden, modal stays while second player unselected, board appears after phase=playing.')
    print('PAGE_ERRORS:', errors)
    browser.close()
