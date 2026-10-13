/* Cliente Supabase + acesso a dados da Império Pie (window.DB) */
(function () {
  const cfg = window.IP_CONFIG || {};
  const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const hasSupabaseLib = typeof window.supabase !== "undefined" && cfg.url && cfg.key;
  const db = hasSupabaseLib
    ? window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

  const listeners = new Set();
  let session = null;
  let adminCache = null;

  function emit(s) {
    session = s;
    adminCache = null;
    listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } });
  }

  const api = {
    brl,
    get disponivel() { return !!db; },
    get db() { return db; },
    getSession() { return session; },
    getUser() { return session?.user ?? null; },
    onSessionChange(fn) {
      listeners.add(fn);
      if (session !== null) fn(session);
      return () => listeners.delete(fn);
    },

    async init() {
      if (!db) return null;
      const { data } = await db.auth.getSession();
      emit(data.session);
      db.auth.onAuthStateChange((_e, s) => emit(s));
      return data.session;
    },

    async entrar({ email, senha }) {
      if (!db) throw new Error("Supabase indisponível");
      const { data, error } = await db.auth.signInWithPassword({ email, password: senha });
      if (error) {
        console.warn("[auth] signInWithPassword:", error.status, error.message, error.code);
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("not confirmed")) {
          throw new Error("Confirme seu e-mail antes de entrar (veja o link enviado).");
        }
        if (msg.includes("invalid login")) {
          throw new Error("E-mail ou senha incorretos. Se é seu primeiro acesso, use “Criar conta”.");
        }
        throw new Error(error.message || "Não foi possível entrar.");
      }
      emit(data.session); // nao esperar o evento: getUser() ja vale imediatamente
      return data.session;
    },

    async cadastrar({ nome, email, senha }) {
      if (!db) throw new Error("Supabase indisponível");
      const { data, error } = await db.auth.signUp({
        email, password: senha, options: { data: { nome } },
      });
      if (error) throw new Error(error.message || "Não foi possível criar a conta.");
      if (data && data.session) emit(data.session);
      return data;
    },

    async sair() {
      if (!db) return;
      await db.auth.signOut();
      emit(null);
    },

    async recuperarSenha(email) {
      if (!db) throw new Error("Supabase indisponível");
      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + "/index.html",
      });
      if (error) throw new Error(error.message);
    },

    /* Admin = papel na propria conta (public.perfis.papel), igual ao
       public.is_admin() no banco. Nao ha mais consulta a `admins`:
       essa lista por e-mail foi removida em 0002_admin_por_papel.sql
       porque dava acesso a quem se cadastrasse com o e-mail do admin. */
    async ehAdmin() {
      const u = api.getUser();
      if (!u || !db) return false;
      if (adminCache !== null) return adminCache;
      const { data: perfil } = await db.from("perfis").select("papel").eq("id", u.id).maybeSingle();
      adminCache = perfil?.papel === "admin";
      return adminCache;
    },

    async atualizarPerfil({ nome, telefone }) {
      const { data, error } = await db.from("perfis").update({ nome, telefone })
        .eq("id", api.getUser().id).select().single();
      if (error) throw error;
      return data;
    },

    async cardapio() {
      const { data, error } = await db.from("cardapio").select("*").order("ordem");
      if (error) throw error;
      return data || [];
    },

    async opcoes() {
      const { data, error } = await db.from("opcoes_torta").select("*")
        .eq("ativo", true).order("ordem");
      if (error) throw error;
      return data || [];
    },

    async configuracoes() {
      const { data, error } = await db.from("configuracoes").select("chave, valor");
      if (error) throw error;
      const out = {};
      (data || []).forEach((r) => { out[r.chave] = r.valor; });
      return out;
    },

    async precoCustomizado({ base, recheio, cobertura, tamanho }) {
      const faltando = Object.entries({ base, recheio, cobertura, tamanho }).filter(([, v]) => !v);
      if (faltando.length) throw new Error(`Opções sem id: ${faltando.map(([k]) => k).join(", ")}`);
      const { data, error } = await db.rpc("calcular_preco_customizado", {
        p_base: base, p_recheio: recheio, p_cobertura: cobertura, p_tamanho: tamanho,
      });
      if (error) {
        console.warn("[rpc calcular_preco_customizado]", error.code, error.message, error.details);
        throw new Error(error.message || "Não foi possível calcular o preço.");
      }
      return Number(data);
    },

    async salvarTortaMontada({ base, recheio, cobertura, tamanho, preco, descricao }) {
      const { data, error } = await db.from("tortas_customizadas").insert({
        base_id: base, recheio_id: recheio, cobertura_id: cobertura, tamanho_id: tamanho,
        preco_calculado: preco, usuario_id: api.getUser().id,
        detalhes: { nome: "Torta montada", descricao },
      }).select().single();
      if (error) throw error;
      return data;
    },

    async enviarPedido(itens, dados) {
      const { data, error } = await db.rpc("registrar_compra", { p_itens: itens, p_dados: dados });
      if (error) throw new Error(error.message);
      return data;
    },

    async meusPedidos() {
      const { data, error } = await db.from("compras").select("*, compra_itens(*)")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async cancelarPedido(id) {
      const { error } = await db.from("compras").update({ status: "cancelada" }).eq("id", id);
      if (error) throw error;
    },

    /* área admin */
    async listar(tabela, ordem = "criado_em", crescente = false) {
      const q = db.from(tabela).select("*").order(ordem, { ascending: crescente });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async inserir(tabela, valores) {
      const { data, error } = await db.from(tabela).insert(valores).select().single();
      if (error) throw error;
      return data;
    },
    async atualizar(tabela, id, valores) {
      const { data, error } = await db.from(tabela).update(valores).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    async remover(tabela, id) {
      const { error } = await db.from(tabela).delete().eq("id", id);
      if (error) throw error;
    },
    async auditar(acao, entidade, entidade_id, detalhes) {
      try {
        await db.from("auditoria").insert({
          usuario_id: api.getUser()?.id ?? null,
          acao, entidade, entidade_id: entidade_id ? String(entidade_id) : null,
          detalhes: detalhes || null,
        });
      } catch (e) { /* auditoria é best effort */ }
    },
  };

  window.DB = api;
})();
