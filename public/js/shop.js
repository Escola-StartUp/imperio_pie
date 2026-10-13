/* Ponte entre o Supabase e a UI da Império Pie (window.SHOP) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let cfgTortas = {};      // {preco_base_torta:14, whatsapp:'55...'}
  let whatsappPadrao = "5500000000000";

  const toast = (t) => { if (typeof window.toast === "function") window.toast(t); };

  /* ---------- ponte usada pelo script inline ---------- */
  window.estaLogado = () => !!(window.DB && window.DB.getUser());
  window.getUsuarioLogado = () => (window.DB ? window.DB.getUser() : null);
  window.getWhatsapp = () => String(cfgTortas.whatsapp || whatsappPadrao).replace(/\D/g, "");
  window.enviarPedido = async (itens, dados) => {
    if (!window.DB || !window.DB.disponivel) throw new Error("Banco não configurado");
    const id = await window.DB.enviarPedido(itens, dados);
    await window.DB.auditar("criar", "compra", id, { origem: "site" });
    return id;
  };

  /* ---------- login / cadastro ---------- */
  function abrirLogin(modo) {
    const dlg = $("#dLogin");
    if (!dlg) return;
    modoLogin = modo === "criar" ? "criar" : "entrar";
    pintarLogin();
    ["#li_email", modoLogin === "criar" ? "#cr_senha" : "#li_senha", "#cr_nome", "#cr_senha2"].forEach((s) => { const e = $(s); if (e) e.value = ""; });
    $$("#dLogin .eye").forEach((b) => { b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", "Mostrar senha"); b.title = "Mostrar senha"; });
    $("#li_email")?.focus();
    (window.abrirDialog ? window.abrirDialog(dlg) : dlg.showModal());
  }
  window.abrirLogin = abrirLogin;

  /* Modal unico: email + senha. "Criar conta" revela o campo de nome no mesmo formulario. */
  let modoLogin = "entrar"; // entrar | criar

  function pintarLogin() {
    const criar = modoLogin === "criar";
    const dlg = $("#dLogin");
    $("#li_titulo") && ($("#li_titulo").textContent = criar ? "Criar conta" : "Entrar");
    dlg.classList.toggle("criar", criar);
    $("#li_pwBox").hidden = criar;
    $("#cr_pwBox").hidden = !criar;
    $("#cr_confBox").hidden = !criar;
    $("#cr_nome").hidden = !criar;
    $("#cr_nome").required = criar;
    $("#cr_senha2").required = criar;
    $("#cr_senha2").placeholder = "Repita a senha";
    $("#li_esqueci").hidden = criar;
    $("#cr_termos").hidden = !criar;
    $("#li_trocar").textContent = criar ? "Já tem conta? Entrar" : "Não tem conta? Criar conta";
    $("#li_enviar").textContent = criar ? "Criar conta" : "Entrar";
    const senha = criar ? $("#cr_senha") : $("#li_senha");
    senha.required = true;
    senha.autocomplete = criar ? "new-password" : "current-password";
    senha.placeholder = criar ? "Crie uma senha (mínimo 6 caracteres)" : "Sua senha";
  }

  async function sincronizarBotoes() {
    const user = window.DB?.getUser();
    $$("[data-ir-login]").forEach((b) => {
      b.textContent = user ? "Minha conta" : "Entrar";
      b.setAttribute("aria-label", user ? `Conta de ${user.email}` : "Entrar ou criar conta");
    });
  }

  /* ---------- admins entram pelo mesmo botão e caem no painel ---------- */
  async function encaminharAdminSeFor() {
    try {
      if (await window.DB.ehAdmin()) {
        location.href = "admin.html";
        return true;
      }
    } catch (e) { /* sem sessão ou sem banco: segue na loja */ }
    return false;
  }

  function montarDialogo() {
    const dlg = $("#dLogin");
    if (!dlg) return;
    dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) (window.fecharDialog ? window.fecharDialog(dlg) : dlg.close()); });
    /* alternar entre entrar e criar conta */
    $("#li_trocar").onclick = () => {
      modoLogin = modoLogin === "criar" ? "entrar" : "criar";
      pintarLogin();
      (modoLogin === "criar" ? $("#cr_nome") : $("#li_email")).focus();
    };
    $("#li_esqueci").onclick = async () => {
      const email = $("#li_email").value.trim();
      if (!email) { toast("Digite seu e-mail primeiro."); $("#li_email").focus(); return; }
      try {
        await window.DB.recuperarSenha(email);
        toast("E-mail de recuperação enviado.");
      } catch (err) { toast(err.message); }
    };

    /* mostrar/ocultar senha */
    $$("#dLogin .eye").forEach((b) => {
      b.onclick = () => {
        const input = $("#" + b.dataset.alvo);
        if (!input) return;
        const mostrando = input.type === "text";
        input.type = mostrando ? "password" : "text";
        b.setAttribute("aria-pressed", String(!mostrando));
        b.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Ocultar senha");
        b.title = mostrando ? "Mostrar senha" : "Ocultar senha";
        input.focus();
      };
    });

    $("#fLogin").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("#li_email").value.trim();
      const senha = (modoLogin === "criar" ? $("#cr_senha") : $("#li_senha")).value;
      const nome = $("#cr_nome").value.trim();

      if (modoLogin === "criar" && !nome) { toast("Diga como podemos te chamar."); $("#cr_nome").focus(); return; }

      const marcarErro = (campo, msg) => {
        toast(msg);
        campo.setAttribute("aria-invalid", "true");
        campo.style.boxShadow = "inset 0 0 0 2px #c62828";
        campo.focus();
      };

      if (modoLogin === "criar" && $("#cr_senha2").value !== $("#cr_senha").value) {
        marcarErro($("#cr_senha2"), "As senhas não são iguais.");
        return;
      }
      if (senha.length < 6) {
        marcarErro($("#cr_senha"), "A senha precisa ter ao menos 6 caracteres.");
        return;
      }
      [modoLogin === "criar" ? $("#cr_senha") : $("#li_senha"), $("#cr_senha2")]
        .forEach((c) => { c.removeAttribute("aria-invalid"); c.style.boxShadow = ""; });

      const btn = $("#li_enviar");
      btn.disabled = true;
      try {
        if (modoLogin === "criar") {
          const { user, session } = await window.DB.cadastrar({ nome, email, senha });
          dlg.close();
          if (session && !(await encaminharAdminSeFor())) toast("Conta criada! Bem-vindo.");
          else if (user && !session) toast("Conta criada! Confirme seu e-mail para entrar.");
        } else {
          await window.DB.entrar({ email, senha });
          dlg.close();
          if (!(await encaminharAdminSeFor())) toast("Bem-vindo de volta!");
        }
      } catch (err) { toast(err.message); }
      finally { btn.disabled = false; }
    };

    $("#btnSair")?.addEventListener("click", async () => {
      await window.DB.sair();
      (window.fecharDialog ? window.fecharDialog($("#dConta")) : null);
      toast("Você saiu da conta.");
    });

    $("#ctIrAdmin")?.addEventListener("click", () => { location.href = "admin.html"; });
  }

  /* ---------- dados do catálogo ---------- */
  async function carregarCatalogo() {
    if (!window.DB?.disponivel) return false;
    try {
      const [cardapio, opcoes, configuracoes] = await Promise.all([
        window.DB.cardapio(), window.DB.opcoes(), window.DB.configuracoes(),
      ]);
      cfgTortas = configuracoes || {};
      if (cfgTortas.whatsapp) whatsappPadrao = cfgTortas.whatsapp;

      if (cardapio.length) window.aplicarCardapio(cardapio);

      const mapa = { base: [], recheio: [], cobertura: [], tamanho: [] };
      opcoes.forEach((o) => {
        (mapa[o.categoria] = mapa[o.categoria] || []).push({
          id: o.id, nome: o.nome, preco: Number(o.preco_adicional || 0),
          mult: Number(o.multiplicador || 1), cor: o.cor_hex,
        });
      });
      if (mapa.base.length) window.aplicarOpcoes(mapa);
      return true;
    } catch (err) {
      console.warn("Falha ao carregar o catálogo; usando dados locais.", err);
      return false;
    }
  }

  async function atualizarPrecoCustomizado() {
    if (!window.DB?.disponivel || !window.opcoesComId()) return;
    const sel = window.selecaoAtual?.();
    if (!sel) return;
    const faltando = Object.entries(sel).filter(([, v]) => !v || !v.id).map(([k]) => k);
    if (faltando.length) return; // configurador ainda usando o fallback local
    try {
      const preco = await window.DB.precoCustomizado({
        base: sel.base.id, recheio: sel.recheio.id,
        cobertura: sel.cobertura.id, tamanho: sel.tamanho.id,
      });
      window.definirPrecoCustomizado(preco);
    } catch (e) { console.warn("[configurador] preço local mantido:", e.message); }
  }

  async function adicionarTortaMontada(info) {
    const temIds = info.base?.id && info.recheio?.id && info.cobertura?.id && info.tamanho?.id;
    if (window.DB?.disponivel && temIds) {
      if (!window.estaLogado()) {
        abrirLogin("entrar");
        toast("Entre na sua conta para salvar sua montagem");
        return false;
      }
      try {
        const preco = await window.DB.precoCustomizado({
          base: info.base.id, recheio: info.recheio.id,
          cobertura: info.cobertura.id, tamanho: info.tamanho.id,
        });
        const saved = await window.DB.salvarTortaMontada({
          base: info.base.id, recheio: info.recheio.id, cobertura: info.cobertura.id,
          tamanho: info.tamanho.id, preco, descricao: info.desc,
        });
        return { nome: info.name, desc: info.desc, preco, id: saved.id };
      } catch (err) {
        toast(err.message || "Não foi possível salvar a montagem");
        return false;
      }
    }
    return { nome: info.name, desc: info.desc, preco: info.price, id: null };
  }
  window.adicionarTortaMontada = adicionarTortaMontada;

  /* ---------- minha conta ---------- */
  async function abrirConta() {
    const dlg = $("#dConta");
    if (!dlg) return abrirLogin("entrar");
    if (!window.estaLogado()) return abrirLogin("entrar");
    const u = window.DB.getUser();
    $("#ct_email").textContent = u.email;
    const ehAdmin = await window.DB.ehAdmin().catch(() => false);
    $("#ct_painel").classList.toggle("escondido", !ehAdmin);
    $("#ct_body").innerHTML = "<p>Carregando pedidos…</p>";
    (window.abrirDialog ? window.abrirDialog(dlg) : dlg.showModal());
    try {
      const pedidos = await window.DB.meusPedidos();
      $("#ct_body").innerHTML = pedidos.length
        ? pedidos.map((p) => `
          <div class="pedido">
            <div class="pedido-topo">
              <b>#${String(p.id).slice(0, 8)}</b>
              <span class="tag st-${p.status}">${p.status.replace("_", " ")}</span>
            </div>
            <small>${new Date(p.criado_em).toLocaleDateString("pt-BR")} · ${p.entrega}</small>
            <ul>${(p.compra_itens || []).map((i) => `<li>${i.quantidade}× ${i.nome} — ${window.DB.brl(i.subtotal)}</li>`).join("")}</ul>
            <b>Total: ${window.DB.brl(p.total)}</b>
            ${p.status === "pendente" ? `<button class="btn sm ghost" data-cancelar="${p.id}">Cancelar pedido</button>` : ""}
          </div>`).join("")
        : "<p>Você ainda não fez pedidos.</p>";
      $$("#ct_body [data-cancelar]").forEach((b) => {
        b.onclick = async () => {
          try { await window.DB.cancelarPedido(b.dataset.cancelar); abrirConta(); toast("Pedido cancelado."); }
          catch (err) { toast(err.message); }
        };
      });
    } catch (err) {
      $("#ct_body").innerHTML = `<p>Não foi possível carregar seus pedidos.</p>`;
    }
  }

  /* ---------- boot ---------- */
  async function boot() {
    montarDialogo();

    $$("[data-ir-login]").forEach((b) => b.addEventListener("click", () => (window.estaLogado() ? abrirConta() : abrirLogin("entrar"))));

    if (window.DB?.disponivel) {
      await window.DB.init().catch(() => null);
      window.DB.onSessionChange(async () => { await sincronizarBotoes(); });
      await sincronizarBotoes();
      const ok = await carregarCatalogo();
      if (ok) {
        await atualizarPrecoCustomizado();
        document.querySelectorAll('.opts input').forEach((i) => i.addEventListener("change", atualizarPrecoCustomizado));
      }
    } else {
      console.warn("Supabase não carregou — o site segue com os dados locais.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
