// Gera assets/icon.ico e assets/icon.png a partir do ícone oficial (public/omni-gestao-pro-icon.svg).
// Roda dentro do Electron (npm run icons): o próprio Chromium rasteriza o SVG — sem dependência nova.
// O .ico usa entradas PNG (formato aceito pelo Windows Vista+).
const { app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const SIZES = [16, 24, 32, 48, 64, 128, 256]

function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const svg = fs
    .readFileSync(path.join(root, "..", "..", "public", "omni-gestao-pro-icon.svg"), "utf8")
    .replace("OmniGest�o", "OmniGestão")
  const win = new BrowserWindow({
    show: false,
    width: 512,
    height: 512,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c"></canvas></body></html>`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const svgB64 = Buffer.from(svg, "utf8").toString("base64")
  const pngs = []
  for (const size of [...SIZES, 512]) {
    const dataUrl = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => {
        const c = document.getElementById('c'); c.width = ${size}; c.height = ${size}
        const g = c.getContext('2d'); g.clearRect(0,0,${size},${size})
        g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, ${size}, ${size})
        res(c.toDataURL('image/png'))
      }
      img.onerror = () => rej(new Error('svg'))
      img.src = 'data:image/svg+xml;base64,${svgB64}'
    })`)
    pngs.push({ size, data: Buffer.from(dataUrl.split(",")[1], "base64") })
  }
  fs.mkdirSync(path.join(root, "assets"), { recursive: true })
  fs.writeFileSync(path.join(root, "assets", "icon.ico"), buildIco(pngs.filter((p) => p.size <= 256)))
  fs.writeFileSync(path.join(root, "assets", "icon.png"), pngs.find((p) => p.size === 512).data)
  console.log("assets/icon.ico e assets/icon.png gerados:", SIZES.join(","))
  app.quit()
})
