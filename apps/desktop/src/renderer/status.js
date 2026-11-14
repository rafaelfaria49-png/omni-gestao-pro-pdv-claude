// Tela local de status. Sem dependências; recebe estado do processo principal pelo preload.
;(function () {
  "use strict"

  var COPY = {
    loading: {
      title: "Abrindo o OmniGestão",
      message: "Conectando ao servidor da sua loja.",
    },
    offline: {
      title: "Sem conexão com o servidor",
      message:
        "O computador está sem internet ou o servidor não respondeu. Vendas feitas sem conexão e ainda não enviadas ficam guardadas neste computador e são enviadas quando o PDV abrir de novo com internet — não desinstale nem limpe o programa agora. O programa tenta conectar sozinho.",
    },
    "server-error": {
      title: "O servidor respondeu com erro",
      message: "O OmniGestão na nuvem não conseguiu abrir agora. Tente de novo em alguns instantes.",
    },
    certificate: {
      title: "Conexão não é segura",
      message:
        "O certificado do servidor não foi aceito. Por segurança o programa não continua. Confira a data e a hora do Windows e avise o suporte se o problema seguir.",
    },
    fatal: {
      title: "O programa não pôde iniciar",
      message: "A configuração deste instalador está inválida. Reinstale com um instalador oficial.",
    },
    about: {
      title: "OmniGestão Pro para Windows",
      message: "Este programa abre o OmniGestão da nuvem numa janela própria. O sistema se atualiza sozinho a cada publicação; o programa do Windows muda só quando sair um instalador novo.",
    },
  }

  var $ = function (id) { return document.getElementById(id) }

  function render(state) {
    var kind = COPY[state.kind] ? state.kind : "loading"
    var copy = COPY[kind]
    document.body.setAttribute("data-kind", kind)
    $("title").textContent = copy.title
    $("message").textContent = copy.message

    var detail = $("detail")
    var detailText = state.detail || (kind === "about" && state.update ? state.update.message : "")
    detail.hidden = !detailText
    detail.textContent = detailText || ""

    $("retry").hidden = !(kind === "offline" || kind === "server-error" || kind === "certificate")
    $("close").hidden = kind !== "about"
    $("update").hidden = !(kind === "about" && state.update && state.update.available)

    var strip = $("channel-strip")
    if (state.channel !== "production") {
      strip.hidden = false
      strip.textContent = "Ambiente de " + state.channelLabel + " — " + state.host + ". Não use para vendas reais."
    } else {
      strip.hidden = true
    }

    var meta = $("meta")
    meta.textContent = ""
    ;[
      "Versão " + state.appVersion,
      "Canal " + state.channelLabel,
      "Servidor " + state.host,
      "Build " + String(state.buildCommit).slice(0, 7),
      "Electron " + state.electronVersion,
    ].forEach(function (t) {
      var s = document.createElement("span")
      s.textContent = t
      meta.appendChild(s)
    })

    var focusTarget = !$("retry").hidden ? $("retry") : !$("close").hidden ? $("close") : null
    if (focusTarget) focusTarget.focus()
  }

  $("retry").addEventListener("click", function () { window.omniStatus.retry() })
  $("close").addEventListener("click", function () { window.omniStatus.close() })
  $("update").addEventListener("click", function () { window.omniStatus.openUpdate() })
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.body.getAttribute("data-kind") === "about") window.omniStatus.close()
  })

  window.omniStatus.onState(render)
})()
