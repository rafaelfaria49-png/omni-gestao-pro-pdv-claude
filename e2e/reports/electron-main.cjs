const {app,BrowserWindow}=require("electron")
const target="http://127.0.0.1:3107/dashboard/relatorios/produtos?from=2026-11-01&to=2026-11-10"
if(!process.env.REPORTS_QA_ELECTRON_PROFILE)throw new Error("Isolated QA profile required")
app.setPath("userData",process.env.REPORTS_QA_ELECTRON_PROFILE)
app.disableHardwareAcceleration()
app.whenReady().then(()=>{
  const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}})
  window.webContents.setWindowOpenHandler(()=>({action:"deny"}))
  window.webContents.on("will-navigate",(event,url)=>{if(new URL(url).origin!=="http://127.0.0.1:3107")event.preventDefault()})
  return window.loadURL(target)
})
app.on("window-all-closed",()=>app.quit())
