from playwright.sync_api import sync_playwright
from pathlib import Path
html=Path('/mnt/data/yutcheck/public/index.html').read_text()
stub='''<script>
window.__fakeHandlers={}; window.__fakeSent=[]; window.__phaseAfterPick='augment';
window.io=function(){return {id:'A',on:(e,f)=>{window.__fakeHandlers[e]=f;if(e==='connect')setTimeout(f,0)},emit:(e,d,ack)=>{window.__fakeSent.push({event:e,data:d});if(ack){let res={ok:true,phase:window.__phaseAfterPick};ack(res)}}}};
window.__fakeDeliver=(e,d)=>window.__fakeHandlers[e](d);
</script><script>'''
html=html.replace('<script src="/socket.io/socket.io.js"></script><script>',stub)
room={"id":"ROOM","name":"증강 테스트 방","mode":"solo","maxPlayers":2,"pieceCount":2,"hasPassword":False,"players":[{"id":"A","name":"테스터A","ready":True,"host":True,"augment":None,"augmentLocked":False},{"id":"B","name":"테스터B","ready":True,"host":False,"augment":None,"augmentLocked":False}],"started":False,"phase":"waiting","code":"ROOM"}
state={"turnIndex":0,"pending":[],"currentResult":None,"extraRolls":0,"gameOver":False,"winner":None,"players":[{"id":"A","name":"테스터A","color":"#5aa9ff","pieces":[None,None],"finished":0,"augment":None,"augmentUsed":False,"shieldUsed":False},{"id":"B","name":"테스터B","color":"#ff6868","pieces":[None,None],"finished":0,"augment":None,"augmentUsed":False,"shieldUsed":False}],"lastRoll":None,"log":[]}
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={"width":1280,"height":900},device_scale_factor=1)
  errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load')
  page.evaluate('({room,state})=>{window.__fakeDeliver("room:update",{room,state});window.__fakeDeliver("game:state",{room,state});document.querySelectorAll(".screen").forEach(s=>s.classList.remove("show"));document.querySelector("#waiting").classList.add("show")}',{"room":room,"state":state})
  assert page.locator('#start').is_visible(), 'waiting room start button not visible'
  page.locator('#start').click()
  assert page.locator('#game').evaluate("e=>e.classList.contains('show')"), 'game screen not shown after start click'
  print('DEBUG', page.locator('#augmentSetup').evaluate("e=>({display:getComputedStyle(e).display,cls:e.className,visible:e.getAttribute('data-visible'),game:document.querySelector('#game').className,sent:window.__fakeSent,errors:[]})")); assert page.locator('#augmentSetup').is_visible(), 'augment selection modal did not appear after clicking game start'
  assert page.locator('#augmentDraftTitle').inner_text().strip()=='증강을 선택하세요', 'wrong modal title'
  assert page.locator('.augmentCard').count()==4, 'not all four augment choices visible'
  assert page.locator('#gamePlayArea').evaluate("e=>getComputedStyle(e).display==='none'"), 'board visible behind augment selection'
  assert page.locator('#confirmAugmentStart').is_disabled(), 'confirm enabled before a choice'
  page.screenshot(path='/mnt/data/yutcheck/augment-selection-visible.png',full_page=True)
  for augment in ['fortune','capturer','guardian','swift']:
    page.locator(f'[data-augment="{augment}"]').click()
    assert page.locator(f'[data-augment="{augment}"]').evaluate("e=>e.classList.contains('selected')"), f'{augment} did not become selected'
    assert not page.locator('#confirmAugmentStart').is_disabled(), f'{augment} did not enable confirmation'
  page.locator('[data-augment="swift"]').click()
  page.locator('#confirmAugmentStart').click()
  assert '기다려' in page.locator('#augmentWaiting').inner_text(), 'waiting-for-other-player message did not appear'
  assert page.locator('#augmentSetup').is_visible(), 'modal disappeared before other player picked'
  assert page.locator('#gamePlayArea').evaluate("e=>getComputedStyle(e).display==='none'"), 'board appeared before all players picked'
  assert not errors, f'javascript errors: {errors}'
  print('PASS: clicked actual “게임 시작” button -> visible “증강을 선택하세요” modal -> 4 choices visible -> each choice selectable -> confirmation works -> modal remains and board stays hidden while waiting for second player.')
  print('Screenshot: /mnt/data/yutcheck/augment-selection-visible.png')
  print('JS errors:',errors)
  browser.close()
