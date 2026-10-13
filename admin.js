/* Área administrativa da Império Pie */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
  const num = (v, d = 0) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

  const STATUS = ["pendente", "confirmada", "em_producao", "pronta", "entregue", "cancelada"];
  const CAT_OPCAO = ["base", "recheio", "cobertura", "tamanho"];
  const aviso = (txt, tipo = "info") => { $("#msg").innerHTML = `<p class="aviso ${tipo}">${esc(txt)}</p>`; setTimeout(() => { $("#msg").innerHTML = ""; }, 4000); };

  const state = { tab: "pedidos", cache: {} };

  /* ---------------- guard ---------------- */
  async function iniciar() {
    if (!window.DB?.disponivel) return mostrarAviso("Não foi possível carregar o Supabase (CDN). Verifique a conexão.");
    $("#fLogin").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        await window.DB.entrar({ email: $("#li_email").value.trim(), senha: $("#li_senha").value });
      } catch (err) { aviso(err.message, "erro"); }
      finally { btn.disabled = false; }
    };
    $("#btnSair").onclick = async () => { await window.DB.sair(); };

    window.DB.onSessionChange(async (s) => {
      if (!s) { $("#app").classList.add("escondido"); $("#guard").classList.remove("escondido"); $("#whoami").textContent = ""; return; }
      const admin = await window.DB.ehAdmin();
      if (!admin) {
        $("#app").classList.add("escondido"); $("#guard").classList.remove("escondido");
        $("#guard .aviso").className = "aviso erro";
        $("#guard .aviso").textContent = "Esta conta não tem acesso administrativo.";
        return;
      }
      $("#whoami").textContent = s.user.email;
      $("#guard").classList.add("escondido");
      $("#app").classList.remove("escondido");
      await carregar();
    });
    await window.DB.init();
  }

  function mostrarAviso(txt) {
    $("#guard .aviso").className = "aviso erro";
    $("#guard .aviso").textContent = txt;
  }

  $$(".tabs button").forEach((b) => {
    b.onclick = () => {
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      state.tab = b.dataset.tab;
      carregar();
    };
  });

  async function carregar() {
    const p = $("#painel");
    p.innerHTML = "<p>Carregando…</p>";
    try {
      const fn = vistas[state.tab];
      if (!fn) return (p.innerHTML = "<p>Em breve.</p>");
      p.innerHTML = await fn();
      ligarEventos();
    } catch (err) {
      p.innerHTML = `<p class="aviso erro">${esc(err.message || "Erro ao carregar")}</p>`;
    }
  }

  /* ---------------- helpers de tabela ---------------- */
  function tabela(colunas, linhas) {
    return `<table><thead><tr>${colunas.map((c) => `<th>${c.t}</th>`).join("")}</tr></thead><tbody>${
      linhas.length ? linhas.map((l) => `<tr>${colunas.map((c) => `<td>${c.f(l)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${colunas.length}">Nada por aqui ainda.</td></tr>`}</tbody></table>`;
  }

  /* ---------------- vistas ---------------- */
  const vistas = {
    async pedidos() {
      const compras = await window.DB.listar("compras");
      const itens = await window.DB.db.from("compra_itens").select("*");
      const porCompra = {};
      (itens.data || []).forEach((i) => { (porCompra[i.compra_id] = porCompra[i.compra_id] || []).push(i); });
      return `<h2>Pedidos (${compras.length})</h2>` + tabela([
        { t: "Pedido", f: (c) => `<b>#${esc(String(c.id).slice(0, 8))}</b><br><small>${dataBr(c.criado_em)}</small>` },
        { t: "Cliente", f: (c) => `${esc(c.nome)}<br><small>${esc(c.contato || "")}</small>` },
        { t: "Itens", f: (c) => (porCompra[c.id] || []).map((i) => `${i.quantidade}× ${esc(i.nome)}`).join("<br>") || "—" },
        { t: "Total", f: (c) => `<b>${brl(c.total)}</b>${c.desconto > 0 ? `<br><small>desconto ${brl(c.desconto)}</small>` : ""}` },
        {
          t: "Status", f: (c) => `<select data-status="${c.id}">${STATUS.map((s) =>
            `<option value="${s}" ${s === c.status ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("")}</select>`,
        },
        {
          t: "Ações", f: (c) => `<div class="row">
            <button class="btn sm ghost" data-ver="${c.id}">Detalhes</button>
            <button class="btn sm ghost" data-entrega="${c.id}">Editar</button>
            <button class="btn sm ghost" data-del-pedido="${c.id}">Excluir</button></div>
            <div class="painel-detalhe escondido" id="det-${c.id}"></div>`,
        },
      ], compras);
    },

    async tortas() {
      const tortas = await window.DB.listar("tortas", "ordem", true);
      return `<h2>Cardápio</h2>
      <details><summary class="disp" style="cursor:pointer">Nova torta</summary>
      <form class="f" data-form="torta" style="margin:12px 0 22px">
        <input name="nome" placeholder="Nome" required aria-label="Nome">
        <input name="slug" placeholder="slug (ex.: classica)" required aria-label="Slug">
        <input name="descricao" placeholder="Descrição" aria-label="Descrição">
        <input name="imagem" placeholder="Caminho ou URL da imagem" aria-label="Imagem">
        <div class="row"><label>Preço base (R$)<input name="preco_base" type="number" step="0.01" min="0" value="14"></label>
        <label>Estoque (vazio = sob encomenda)<input name="estoque" type="number" min="0"></label>
        <label>Ordem<input name="ordem" type="number" value="0"></label></div>
        <button class="btn alt">Criar torta</button>
      </form></details>` + tabela([
        { t: "Torta", f: (t) => `<b>${esc(t.nome)}</b><br><small>${esc(t.slug)}</small>` },
        { t: "Preço", f: (t) => brl(t.preco_base) },
        { t: "Estoque", f: (t) => (t.estoque === null ? "sob encomenda" : t.estoque) },
        { t: "Vendas", f: (t) => t.vendas || 0 },
        { t: "Ativa", f: (t) => `<input type="checkbox" data-ativo-torta="${t.id}" ${t.ativo ? "checked" : ""}>` },
        {
          t: "Ações", f: (t) => `<div class="row">
          <button class="btn sm ghost" data-edit-torta='${esc(JSON.stringify({ id: t.id, nome: t.nome, descricao: t.descricao, imagem: t.imagem, preco_base: t.preco_base, estoque: t.estoque, ordem: t.ordem }))}'>Editar</button>
          <button class="btn sm ghost" data-del-torta="${t.id}">Excluir</button></div>`,
        },
      ], tortas);
    },

    async precos() {
      const [precos, tortas] = await Promise.all([window.DB.listar("precos", "criado_em", false), window.DB.listar("tortas", "nome", true)]);
      const nomeDe = (id) => (tortas.find((t) => t.id === id)?.nome || "—");
      return `<h2>Preços praticados</h2>
      <form class="f" data-form="preco" style="margin-bottom:22px">
        <label>Torta<select name="torta_id" required>${tortas.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join("")}</select></label>
        <div class="row"><label>Preço (R$)<input name="preco" type="number" step="0.01" min="0" required></label>
        <label>Vigência início<input name="vigencia_inicio" type="date" required></label>
        <label>Vigência fim (opcional)<input name="vigencia_fim" type="date"></label></div>
        <button class="btn alt">Lançar preço</button>
        <small>Um novo preço não apaga o histórico: o vigente é o de início mais recente.</small>
      </form>` + tabela([
        { t: "Torta", f: (p) => esc(nomeDe(p.torta_id)) },
        { t: "Valor", f: (p) => `<b>${brl(p.preco)}</b>` },
        { t: "Vigência", f: (p) => `${dataBr(p.vigencia_inicio)} → ${p.vigencia_fim ? dataBr(p.vigencia_fim) : "sem fim"}` },
        { t: "Ativo", f: (p) => `<input type="checkbox" data-ativo-preco="${p.id}" ${p.ativo ? "checked" : ""}>` },
        { t: "", f: (p) => `<button class="btn sm ghost" data-del-preco="${p.id}">Excluir</button>` },
      ], precos);
    },

    async promocoes() {
      const promos = await window.DB.listar("promocoes", "criado_em", false);
      return `<h2>Promoções</h2>
      <form class="f" data-form="promo" style="margin-bottom:22px">
        <input name="nome" placeholder="Nome da promoção" required aria-label="Nome">
        <div class="row">
          <label>Tipo<select name="tipo"><option value="percentual">Percentual</option><option value="fixo">Valor fixo</option></select></label>
          <label>Valor<input name="valor" type="number" step="0.01" min="0" required></label>
          <label>Cupom (opcional)<input name="cupom" placeholder="ex.: BEMVINDO" style="text-transform:uppercase"></label>
        </div>
        <div class="row"><label>Início<input name="vigencia_inicio" type="date"></label>
        <label>Fim<input name="vigencia_fim" type="date"></label>
        <label>Limite de usos<input name="limite_usos" type="number" min="1"></label></div>
        <button class="btn alt">Criar promoção</button>
      </form>` + tabela([
        { t: "Promoção", f: (p) => `<b>${esc(p.nome)}</b><br><small>${p.cupom ? "cupom " + esc(p.cupom) : "sem cupom"}</small>` },
        { t: "Desconto", f: (p) => (p.tipo === "percentual" ? `${p.valor}%` : brl(p.valor)) },
        { t: "Vigência", f: (p) => `${dataBr(p.vigencia_inicio)} → ${p.vigencia_fim ? dataBr(p.vigencia_fim) : "sem fim"}` },
        { t: "Usos", f: (p) => `${p.usos || 0}${p.limite_usos ? " / " + p.limite_usos : ""}` },
        { t: "Ativa", f: (p) => `<input type="checkbox" data-ativo-promo="${p.id}" ${p.ativo ? "checked" : ""}>` },
        {
          t: "Ações", f: (p) => `<button class="btn sm ghost" data-del-promo="${p.id}">Excluir</button>`,
        },
      ], promos);
    },

    async opcoes() {
      const lista = await window.DB.listar("opcoes_torta", "ordem", true);
      return `<h2>Opções do configurador</h2>
      <form class="f" data-form="opcao" style="margin-bottom:22px">
        <div class="row">
          <label>Categoria<select name="categoria">${CAT_OPCAO.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
          <label>Nome<input name="nome" required></label>
          <label>Ordem<input name="ordem" type="number" value="0"></label>
        </div>
        <input name="descricao" placeholder="Descrição (opcional)">
        <div class="row">
          <label>Preço adicional (R$)<input name="preco_adicional" type="number" step="0.01" min="0" value="0"></label>
          <label>Multiplicador<input name="multiplicador" type="number" step="0.1" min="0.1" value="1"></label>
          <label>Cor (hex)<input name="cor_hex" placeholder="#3A1F1A"></label>
        </div>
        <button class="btn alt">Adicionar opção</button>
      </form>` + tabela([
        { t: "Opção", f: (o) => `<b>${esc(o.nome)}</b><br><small>${o.categoria}</small>` },
        { t: "Preço", f: (o) => brl(o.preco_adicional) },
        { t: "Mult.", f: (o) => o.multiplicador },
        { t: "Ativa", f: (o) => `<input type="checkbox" data-ativo-opcao="${o.id}" ${o.ativo ? "checked" : ""}>` },
        { t: "", f: (o) => `<button class="btn sm ghost" data-del-opcao="${o.id}">Excluir</button>` },
      ], lista);
    },

    async usuarios() {
      const { data: perfis } = await window.DB.db.from("perfis").select("*").order("criado_em");
      const lista = perfis || [];
      // Admin é o campo "Papel" abaixo. A antiga lista public.admins foi
      // removida: ela liberava acesso a quem se cadastrasse com o e-mail
      // do admin, sem nenhuma autorização. Ver 0002_admin_por_papel.sql.
      return `<h2>Usuários (${lista.length})</h2>
      <p class="aviso info">O acesso administrativo vem do campo <strong>Papel</strong> abaixo. Troque para
      <code>admin</code> e a pessoa entra no painel no próximo login — o e-mail não concede acesso por si só.</p>` + tabela([
        { t: "Nome", f: (u) => esc(u.nome || "—") },
        { t: "Papel", f: (u) => `<select data-papel="${u.id}">
            <option value="cliente" ${u.papel === "cliente" ? "selected" : ""}>cliente</option>
            <option value="admin" ${u.papel === "admin" ? "selected" : ""}>admin</option></select>` },
        { t: "Desde", f: (u) => dataBr(u.criado_em) },
      ], lista);
    },

    async config() {
      const { data } = await window.DB.db.from("configuracoes").select("*").order("chave");
      const lista = data || [];
      return `<h2>Configurações do site</h2>
      <p class="aviso info">O valor é JSON: números sem aspas, textos entre aspas. Ex.: <code>14</code> ou <code>"5500000000000"</code>.</p>` + tabela([
        { t: "Chave", f: (c) => `<b>${esc(c.chave)}</b><br><small>${esc(c.descricao || "")}</small>` },
        { t: "Valor", f: (c) => `<input data-cfg="${esc(c.chave)}" value="${esc(JSON.stringify(c.valor))}">` },
        { t: "", f: (c) => `<button class="btn sm" data-save-cfg="${esc(c.chave)}">Salvar</button>` },
      ], lista);
    },

    async auditoria() {
      const registros = await window.DB.listar("auditoria");
      return `<h2>Auditoria (${registros.length})</h2>` + tabela([
        { t: "Quando", f: (a) => new Date(a.criado_em).toLocaleString("pt-BR") },
        { t: "Ação", f: (a) => esc(a.acao) },
        { t: "Entidade", f: (a) => `${esc(a.entidade)} ${a.entidade_id ? `<small>${esc(String(a.entidade_id).slice(0, 8))}</small>` : ""}` },
        { t: "Detalhes", f: (a) => `<small>${esc(JSON.stringify(a.detalhes || {}))}</small>` },
      ], registros.slice(0, 60));
    },
  };

  /* ---------------- eventos ---------------- */
  function ligarEventos() {
    /* pedidos */
    $$("[data-status]").forEach((s) => {
      s.onchange = async () => {
        try {
          await window.DB.atualizar("compras", s.dataset.status, { status: s.value });
          await window.DB.auditar("status", "compra", s.dataset.status, { para: s.value });
          aviso("Status atualizado.", "ok");
        } catch (e) { aviso(e.message, "erro"); carregar(); }
      };
    });
    $$("[data-ver]").forEach((b) => {
      b.onclick = async () => {
        const box = $(`#det-${b.dataset.ver}`);
        if (!box.classList.contains("escondido")) return box.classList.add("escondido");
        const { data: itens } = await window.DB.db.from("compra_itens").select("*").eq("compra_id", b.dataset.ver);
        const { data: c } = await window.DB.db.from("compras").select("*").eq("id", b.dataset.ver).single();
        box.innerHTML = `
          <b>${esc(c.nome)}</b> · ${esc(c.contato || "")}<br>
          Entrega: ${esc(c.entrega)}${c.endereco ? " — " + esc(c.endereco) : ""}<br>
          Pagamento: ${esc(c.pagamento || "a combinar")} · Janela: ${esc(c.janela || "—")}<br>
          Observações: ${esc(c.observacoes || "—")}<br>
          <ul>${(itens || []).map((i) => `<li>${i.quantidade}× ${esc(i.nome)} — ${brl(i.preco_unitario)}</li>`).join("")}</ul>`;
        box.classList.remove("escondido");
      };
    });
    $$("[data-entrega]").forEach((b) => {
      b.onclick = async () => {
        const { data: c } = await window.DB.db.from("compras").select("*").eq("id", b.dataset.entrega).single();
        const entrega = prompt("Entrega (retirada | entrega)", c.entrega);
        if (entrega === null) return;
        const janela = prompt("Janela de entrega (ex.: sábado 15h)", c.janela || "");
        if (janela === null) return;
        const pagamento = prompt("Pagamento (pix | cartao | na_entrega)", c.pagamento || "pix");
        if (pagamento === null) return;
        const observacoes = prompt("Observações", c.observacoes || "");
        if (observacoes === null) return;
        try {
          await window.DB.atualizar("compras", c.id, { entrega, janela, pagamento, observacoes });
          await window.DB.auditar("editar", "compra", c.id, { entrega, janela, pagamento });
          aviso("Pedido atualizado.", "ok"); carregar();
        } catch (e) { aviso(e.message, "erro"); }
      };
    });
    $$("[data-del-pedido]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Excluir este pedido? Os itens dele também serão removidos.")) return;
        try {
          await window.DB.remover("compras", b.dataset.delPedido);
          await window.DB.auditar("excluir", "compra", b.dataset.delPedido, {});
          aviso("Pedido excluído.", "ok"); carregar();
        } catch (e) { aviso(e.message, "erro"); }
      };
    });

    /* tortas */
    $$("[data-ativo-torta]").forEach((c) => c.onchange = async () => {
      try { await window.DB.atualizar("tortas", c.dataset.ativoTorta, { ativo: c.checked }); aviso("Cardápio atualizado.", "ok"); }
      catch (e) { aviso(e.message, "erro"); }
    });
    $$("[data-del-torta]").forEach((b) => b.onclick = async () => {
      if (!confirm("Excluir esta torta do cardápio?")) return;
      try { await window.DB.remover("tortas", b.dataset.delTorta); aviso("Torta excluída.", "ok"); carregar(); }
      catch (e) { aviso(e.message, "erro"); }
    });
    $$("[data-edit-torta]").forEach((b) => b.onclick = async () => {
      const t = JSON.parse(b.dataset.editTorta);
      const nome = prompt("Nome", t.nome); if (nome === null) return;
      const descricao = prompt("Descrição", t.descricao || ""); if (descricao === null) return;
      const imagem = prompt("Imagem (caminho ou URL)", t.imagem || ""); if (imagem === null) return;
      const preco = prompt("Preço base (R$)", t.preco_base); if (preco === null) return;
      const estoque = prompt("Estoque (vazio = sob encomenda)", t.estoque ?? ""); if (estoque === null) return;
      try {
        await window.DB.atualizar("tortas", t.id, {
          nome, descricao, imagem, preco_base: num(preco), estoque: estoque === "" ? null : num(estoque),
        });
        await window.DB.auditar("editar", "torta", t.id, { nome, preco_base: num(preco) });
        aviso("Torta atualizada.", "ok"); carregar();
      } catch (e) { aviso(e.message, "erro"); }
    });

    /* precos */
    $$("[data-ativo-preco]").forEach((c) => c.onchange = async () => {
      try { await window.DB.atualizar("precos", c.dataset.ativoPreco, { ativo: c.checked }); aviso("Preço atualizado.", "ok"); }
      catch (e) { aviso(e.message, "erro"); }
    });
    $$("[data-del-preco]").forEach((b) => b.onclick = async () => {
      try { await window.DB.remover("precos", b.dataset.delPreco); aviso("Preço removido.", "ok"); carregar(); }
      catch (e) { aviso(e.message, "erro"); }
    });

    /* promocoes */
    $$("[data-ativo-promo]").forEach((c) => c.onchange = async () => {
      try { await window.DB.atualizar("promocoes", c.dataset.ativoPromo, { ativo: c.checked }); aviso("Promoção atualizada.", "ok"); }
      catch (e) { aviso(e.message, "erro"); }
    });
    $$("[data-del-promo]").forEach((b) => b.onclick = async () => {
      if (!confirm("Excluir esta promoção?")) return;
      try { await window.DB.remover("promocoes", b.dataset.delPromo); aviso("Promoção excluída.", "ok"); carregar(); }
      catch (e) { aviso(e.message, "erro"); }
    });

    /* opcoes */
    $$("[data-ativo-opcao]").forEach((c) => c.onchange = async () => {
      try { await window.DB.atualizar("opcoes_torta", c.dataset.ativoOpcao, { ativo: c.checked }); aviso("Opção atualizada.", "ok"); }
      catch (e) { aviso(e.message, "erro"); }
    });
    $$("[data-del-opcao]").forEach((b) => b.onclick = async () => {
      if (!confirm("Excluir esta opção? Torta montadas antigas continuam salvas.")) return;
      try { await window.DB.remover("opcoes_torta", b.dataset.delOpcao); aviso("Opção excluída.", "ok"); carregar(); }
      catch (e) { aviso(e.message, "erro"); }
    });

    /* usuarios */
    $$("[data-papel]").forEach((s) => s.onchange = async () => {
      if (!confirm(`Alterar o papel para "${s.value}"?`)) return;
      try {
        await window.DB.atualizar("perfis", s.dataset.papel, { papel: s.value });
        await window.DB.auditar("papel", "perfil", s.dataset.papel, { papel: s.value });
        aviso("Papel atualizado.", "ok");
      } catch (e) { aviso(e.message, "erro"); carregar(); }
    });

    /* configuracoes */
    $$("[data-save-cfg]").forEach((b) => b.onclick = async () => {
      const chave = b.dataset.saveCfg;
      const bruto = $(`[data-cfg="${CSS.escape(chave)}"]`).value.trim();
      let valor;
      try { valor = JSON.parse(bruto); } catch { return aviso("Valor inválido. Use JSON (ex.: 14 ou \"texto\").", "erro"); }
      try {
        await window.DB.atualizar("configuracoes", chave, { valor });
        await window.DB.auditar("editar", "configuracao", chave, { valor });
        aviso("Configuração salva.", "ok");
      } catch (e) { aviso(e.message, "erro"); }
    });

    /* formularios */
    $('[data-form="torta"]')?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await window.DB.inserir("tortas", {
          nome: f.nome, slug: f.slug, descricao: f.descricao || null, imagem: f.imagem || null,
          preco_base: num(f.preco_base), estoque: f.estoque === "" ? null : num(f.estoque), ordem: num(f.ordem),
        });
        await window.DB.auditar("criar", "torta", null, { nome: f.nome });
        aviso("Torta criada.", "ok"); carregar();
      } catch (err) { aviso(err.message, "erro"); }
    });

    $('[data-form="preco"]')?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await window.DB.inserir("precos", {
          torta_id: f.torta_id, preco: num(f.preco),
          vigencia_inicio: f.vigencia_inicio, vigencia_fim: f.vigencia_fim || null,
        });
        await window.DB.auditar("criar", "preco", null, { preco: num(f.preco) });
        aviso("Preço lançado.", "ok"); carregar();
      } catch (err) { aviso(err.message, "erro"); }
    });

    $('[data-form="promo"]')?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await window.DB.inserir("promocoes", {
          nome: f.nome, tipo: f.tipo, valor: num(f.valor),
          cupom: f.cupom ? f.cupom.toUpperCase() : null,
          vigencia_inicio: f.vigencia_inicio ? new Date(f.vigencia_inicio).toISOString() : new Date().toISOString(),
          vigencia_fim: f.vigencia_fim ? new Date(f.vigencia_fim).toISOString() : null,
          limite_usos: f.limite_usos === "" ? null : num(f.limite_usos),
        });
        await window.DB.auditar("criar", "promocao", null, { nome: f.nome, cupom: f.cupom });
        aviso("Promoção criada.", "ok"); carregar();
      } catch (err) { aviso(err.message, "erro"); }
    });

    $('[data-form="opcao"]')?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        await window.DB.inserir("opcoes_torta", {
          categoria: f.categoria, nome: f.nome, descricao: f.descricao || null,
          preco_adicional: num(f.preco_adicional), multiplicador: num(f.multiplicador, 1),
          cor_hex: f.cor_hex || null, ordem: num(f.ordem),
        });
        await window.DB.auditar("criar", "opcao", null, { nome: f.nome, categoria: f.categoria });
        aviso("Opção adicionada.", "ok"); carregar();
      } catch (err) { aviso(err.message, "erro"); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
