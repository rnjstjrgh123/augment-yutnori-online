from playwright.sync_api import sync_playwright
from pathlib import Path
html=Path('/mnt/data/yutcheck/public/index.html').read_text()
html=html.replace('<script src="/socket.io/socket.io.js"></script><script>', '''<script>
window.__fakeHandlers={}; window.__fakeSent=[]; window.__phaseAfterPick='augment';
window.io=function(){return {id:'A',on:(e,f)=>{window.__fakeHandlers[e]=f;if(e==='connect')setTimeout(f,0)},emit:(e,d,ack)=>{window.__fakeSent.push({event:e,data:d});if(ack)ack({ok:true,phase:window.__phaseAfterPick})}}};
window.__fakeDeliver=(e,d)=>window.__fakeHandlers[e](d);
</script><script>''')
room={"id":"ROOM","name":"test","mode":"solo","maxPlayers":2,"pieceCount":2,"hasPassword":False,"players":[{"id":"A","name":"A","ready":True,"host":True,"augment":None,"augmentLocked":False},{"id":"B","name":"B","ready":True,"host":False,"augment":None,"augmentLocked":False}],"started":True,"phase":"augment","code":"ROOM"}
state={"turnIndex":0,"pending":[],"currentResult":None,"extraRolls":0,"gameOver":False,"winner":None,"players":[{"id":"A","name":"A","color":"#5aa9ff","pieces":[None,None],"finished":0,"augment":None,"augmentUsed":False,"shieldUsed":False},{"id":"B","name":"B","color":"#ff6868","pieces":[None,None],"finished":0,"augment":None,"augmentUsed":False,"shieldUsed":False}],"lastRoll":None,"log":[]}
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,700),(375,812),(390,844),(768,1024),(1280,720),(1920,1080)]:
    page=browser.new_page(viewport={"width":width,"height":height})
    errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html,wait_until='load')
    page.evaluate('({room,state})=>{window.__fakeDeliver("room:update",{room,state});window.__fakeDeliver("game:state",{room,state})}',{"room":room,"state":state})
    assert page.locator('#augmentSetup').evaluate("e=>getComputedStyle(e).display!=='none'"),f'{width}: modal not visible'
    assert page.locator('#gamePlayArea').evaluate("e=>getComputedStyle(e).display==='none'"),f'{width}: board visible early'
    assert page.locator('#confirmAugmentStart').is_disabled(),f'{width}: confirm enabled before selection'
    page.locator('[data-augment="swift"]').click()
    assert not page.locator('#confirmAugmentStart').is_disabled(),f'{width}: confirm did not enable'
    assert page.locator('#augmentSetup').evaluate('e=>e.getBoundingClientRect().width>0'),f'{width}: modal has no layout'
    assert not errors,f'{width}: page errors {errors}'
    print(f'PASS viewport {width}x{height}')
    page.close()
  browser.close()
