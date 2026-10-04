// Headless browser verification via the Chrome DevTools Protocol (no extra dependencies).
const fs = require("fs");
const path = require("path");
const os = require("os");
const {spawn} = require("child_process");
const assert = require("node:assert/strict");
const {createTestEnvironment} = require("./question-test-support");
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const env = await createTestEnvironment();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "studyforge-questions-"));
  const executable = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  let chrome, ws;
  const errors = [];
  try {
    chrome = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], {windowsHide:true, stdio:"ignore"});
    chrome.on("error", e => errors.push(e.message));
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i=0; i<150 && !fs.existsSync(portFile); i++) await wait(100);
    if (!fs.existsSync(portFile)) throw Error("Chrome não iniciou: " + errors.join("; "));
    const port = fs.readFileSync(portFile,"utf8").split("\n")[0].trim();
    const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
    ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve,reject) => {ws.addEventListener("open",resolve,{once:true}); ws.addEventListener("error",reject,{once:true});});
    let serial=0; const pending=new Map();
    ws.addEventListener("message", event => {
      const msg=JSON.parse(event.data);
      if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.text + ": " + (msg.params.exceptionDetails.exception?.description || ""));
      if (msg.id && pending.has(msg.id)) {
        const {resolve,reject,timer}=pending.get(msg.id); clearTimeout(timer); pending.delete(msg.id);
        msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
      }
    });
    function cdp(method,params={}) {
      const id=++serial;
      return new Promise((resolve,reject) => {
        const timer=setTimeout(() => {pending.delete(id);reject(Error("CDP timeout: " + method));},15000);
        pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params}));
      });
    }
    async function evaluate(expression) {
      const result=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
      if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function until(expression) {
      for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(100);}
      throw Error("UI timeout: " + expression);
    }
    const click=selector => evaluate("document.querySelector(" + JSON.stringify(selector) + ").click()");
    await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
    await cdp("Network.setCookie",{name:"sf_session",value:env.token(env.userId),url:env.base,httpOnly:true,sameSite:"Lax"});
    await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await cdp("Page.navigate",{url:env.base});
    await until('document.querySelector("#dashboard-screen").classList.contains("active-screen")');
    await click('[data-view="questions"]');
    await until('document.querySelectorAll(".q-subject-card").length === 6');
    await click('[data-q-action="subject"][data-subject="Matemática"]');
    await until('document.querySelectorAll(".q-number").length === 10');
    await click('input[name="q-option"][value="2"]');
    await click('[data-q-action="answer"]');
    await until('document.querySelector(".q-feedback")?.textContent.includes("Você acertou")');
    assert.equal((await env.request("/sessions")).data.history.length,0);
    await click('[data-q-action="retry"]');
    await until('!document.querySelector(".q-feedback")');
    await click('[data-q-action="start"]');
    await until('document.querySelector("#q-session-clock") !== null');
    await wait(1200);
    await click('input[name="q-option"][value="2"]'); await click('[data-q-action="answer"]');
    await until('document.querySelector(".q-feedback")?.textContent.includes("Você acertou")');
    await click('[data-q-action="subject"][data-subject="Biologia"]');
    await wait(1200);
    await click('input[name="q-option"][value="0"]'); await click('[data-q-action="answer"]');
    await until('document.querySelector(".q-feedback")?.textContent.includes("A resposta correta")');
    assert.equal((await env.request("/sessions")).data.active.percentage,50);
    // Leaving and reloading must resume the session and restore its answers.
    await cdp("Page.reload");
    await until('document.querySelector("#dashboard-screen").classList.contains("active-screen")');
    await click('[data-view="questions"]');
    await until('document.querySelector("#q-session-clock") !== null');
    assert.ok((await evaluate('document.querySelector(".q-report").textContent')).includes("50"));
    await click('[data-q-action="subject"][data-subject="Biologia"]');
    await until('document.querySelector(".q-feedback") !== null');
    assert.equal(await evaluate('document.querySelectorAll(".q-options input:disabled").length'),4);
    await click('[data-q-action="finish"]');
    await until('document.querySelector(".q-report")?.textContent.includes("Concluída")');
    const saved = (await env.request("/sessions")).data.history[0];
    assert.ok(saved.seconds >= 2);
    assert.ok(saved.subjects.every(s => s.seconds >= 1));
    assert.equal(await evaluate('document.querySelectorAll(".q-history-item").length'),1);
    assert.equal(await evaluate('document.querySelectorAll(".q-table tbody tr").length'),2);
    fs.mkdirSync("artifacts/questions",{recursive:true});
    await evaluate('window.scrollTo(0,0)');
    const desktop=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
    fs.writeFileSync("artifacts/questions/desktop.png",Buffer.from(desktop.data,"base64"));
    await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await wait(400); // Wait for the existing mobile sidebar transition.
    await click('[data-q-action="subject"][data-subject="Química"]');
    await until('document.querySelector(".q-player") !== null');
    const widths=await evaluate('({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth})');
    assert.ok(widths.scroll <= widths.viewport,JSON.stringify(widths));
    await evaluate('window.scrollTo(0,0)');
    const mobile=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
    fs.writeFileSync("artifacts/questions/mobile.png",Buffer.from(mobile.data,"base64"));
    await evaluate('document.documentElement.setAttribute("data-theme","dark")');
    await wait(400);
    const dark=await cdp("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
    fs.writeFileSync("artifacts/questions/mobile-dark.png",Buffer.from(dark.data,"base64"));
    assert.deepEqual(errors,[]);
    console.log("OK: navegador desktop/mobile, prática avulsa, nova tentativa, sessão com duas matérias, retomada após reload, resumo 50%, histórico, tema escuro e ausência de overflow.");
  } finally {
    if(ws)ws.close();
    if(chrome){chrome.kill();await wait(1000);}
    const checked=path.resolve(profile);
    const expected=path.resolve(os.tmpdir()) + path.sep + "studyforge-questions-";
    if(!checked.startsWith(expected))throw Error("Invalid test profile path");
    try{fs.rmSync(checked,{recursive:true,force:true});}catch(e){console.warn("Perfil temporário do Chrome ainda em uso.");}
    await env.close();
  }
})().catch(e => {console.error(e);process.exitCode=1;});
