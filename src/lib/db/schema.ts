import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ADR-0001: toda tabela de domínio referencia a imobiliária dona.
export const imobiliarias = pgTable("imobiliarias", {
  id: uuid().primaryKey().defaultRandom(),
  nome: text().notNull(),
  criadaEm: timestamp("criada_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Tabelas do Better Auth (infraestrutura, por isso em inglês). As chaves JS
// seguem os nomes de campo que o Better Auth espera.
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    role: text({ enum: ["administrador", "corretor"] }).notNull(),
    // Corretor pertence a uma imobiliária; administrador não pertence a
    // nenhuma.
    imobiliariaId: uuid("imobiliaria_id").references(() => imobiliarias.id),
    ativo: boolean().notNull().default(true),
    // WhatsApp do corretor (só dígitos com DDI), para os avisos do número de
    // sistema (ticket 11). Nulo: o corretor não recebe avisos.
    telefone: text(),
  },
  (t) => [
    check(
      "users_role_imobiliaria",
      sql`(${t.role} = 'administrador') = (${t.imobiliariaId} is null)`,
    ),
    index("users_imobiliaria_id_idx").on(t.imobiliariaId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text(),
    password: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: uuid().primaryKey().defaultRandom(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// WhatsApp (ticket 06). Uma conexão por corretor: o aceite de risco
// (ADR-0004) fica registrado aqui com data e hora, e a instância da Evolution
// só é criada depois dele.
// ---------------------------------------------------------------------------

export const estadosDaConexao = [
  "desconectado",
  "conectando",
  "conectado",
] as const;
export type EstadoDaConexao = (typeof estadosDaConexao)[number];

export const whatsappConexoes = pgTable(
  "whatsapp_conexoes",
  {
    corretorId: uuid("corretor_id")
      .primaryKey()
      .references(() => users.id),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    aceiteEm: timestamp("aceite_em", { withTimezone: true }).notNull(),
    // Nome da instância na Evolution; nulo até o corretor pedir o QR code.
    instancia: text().unique(),
    estado: text({ enum: estadosDaConexao }).notNull().default("desconectado"),
    atualizadaEm: timestamp("atualizada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("whatsapp_conexoes_imobiliaria_id_idx").on(t.imobiliariaId)],
);

export const clientes = pgTable(
  "clientes",
  {
    id: uuid().primaryKey().defaultRandom(),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    corretorId: uuid("corretor_id")
      .notNull()
      .references(() => users.id),
    nome: text().notNull(),
    // Só dígitos com DDI (ex.: 5588999990000).
    telefone: text().notNull(),
    email: text(),
    cpf: text(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("clientes_corretor_telefone").on(t.corretorId, t.telefone),
    index("clientes_corretor_id_idx").on(t.corretorId),
  ],
);

// Etapas fixas do funil (GLOSSARY.md → Etapa).
export const etapas = [
  "novo",
  "em_atendimento",
  "visita_agendada",
  "coletando_dados",
  "proposta_em_revisao",
  "aguardando_assinatura",
  "aguardando_pagamento",
  "ganho",
  "perdido",
] as const;
export type Etapa = (typeof etapas)[number];

export const interesses = ["lote", "lote_e_casa"] as const;
export type Interesse = (typeof interesses)[number];

export const negocios = pgTable(
  "negocios",
  {
    id: uuid().primaryKey().defaultRandom(),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    corretorId: uuid("corretor_id")
      .notNull()
      .references(() => users.id),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id),
    etapa: text({ enum: etapas }).notNull().default("novo"),
    motivoPerda: text("motivo_perda"),
    // Lote de interesse (opcional); escolhido pelo assistente ou na proposta.
    loteInteresseId: uuid("lote_interesse_id").references(() => lotes.id),
    // Empreendimento sobre o qual o assistente conversa quando ainda não há
    // lote escolhido (a imobiliária pode ter vários).
    empreendimentoInteresseId: uuid("empreendimento_interesse_id").references(
      () => empreendimentos.id,
    ),
    // O que o cliente procura: só o lote ou lote + casa (GLOSSARY →
    // Material de marketing). Registrado pelo assistente.
    interesse: text({ enum: interesses }),
    // ---- ticket 12: orçamento do cliente e plano escolhido. Valores em
    // centavos inteiros (o cálculo em src/data/planos-de-pagamento.ts também
    // trabalha em centavos; a interface e as ferramentas convertem).
    orcamentoEntrada: integer("orcamento_entrada"),
    orcamentoParcelaMaxima: integer("orcamento_parcela_maxima"),
    // Nenhuma combinação plano + lote coube no orçamento; o negócio segue
    // aberto com a opção mais próxima oferecida.
    foraDoOrcamento: boolean("fora_do_orcamento").notNull().default(false),
    planoEscolhidoId: uuid("plano_escolhido_id").references(
      () => planosDePagamento.id,
    ),
    // Modelo de casa da opção escolhida (só para lote + casa).
    modeloDeCasaEscolhidoId: uuid("modelo_de_casa_escolhido_id").references(
      () => modelosDeCasa.id,
    ),
    // ---- fim ticket 12
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("negocios_corretor_id_idx").on(t.corretorId),
    index("negocios_cliente_id_idx").on(t.clienteId),
  ],
);

// Quem levou o negócio à etapa: o corretor na interface, o assistente por
// ferramenta, ou o sistema (criação pela mensagem de número novo, jobs).
export const autoresDeEtapa = ["corretor", "assistente", "sistema"] as const;
export type AutorDeEtapa = (typeof autoresDeEtapa)[number];

// Histórico de mudanças de etapa; `de` é nulo na criação.
export const negocioEtapas = pgTable(
  "negocio_etapas",
  {
    id: uuid().primaryKey().defaultRandom(),
    negocioId: uuid("negocio_id")
      .notNull()
      .references(() => negocios.id, { onDelete: "cascade" }),
    de: text({ enum: etapas }),
    para: text({ enum: etapas }).notNull(),
    autor: text({ enum: autoresDeEtapa }).notNull().default("sistema"),
    em: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("negocio_etapas_negocio_id_idx").on(t.negocioId)],
);

export const estadosDoAssistente = ["ativo", "pausado", "desligado"] as const;

// A conversa de WhatsApp de um cliente com o número do corretor.
export const conversas = pgTable(
  "conversas",
  {
    id: uuid().primaryKey().defaultRandom(),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    corretorId: uuid("corretor_id")
      .notNull()
      .references(() => users.id),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id),
    assistente: text({ enum: estadosDoAssistente }).notNull().default("ativo"),
    ultimaMensagemCorretorEm: timestamp("ultima_mensagem_corretor_em", {
      withTimezone: true,
    }),
    optOut: boolean("opt_out").notNull().default(false),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("conversas_corretor_cliente").on(t.corretorId, t.clienteId),
    index("conversas_corretor_id_idx").on(t.corretorId),
  ],
);

export const autoresDeMensagem = ["cliente", "assistente", "corretor"] as const;

export type Midia = {
  tipo: "imagem" | "audio" | "video" | "documento" | "figurinha";
  mimetype: string | null;
  nomeDoArquivo: string | null;
  url: string | null;
};

export const mensagens = pgTable(
  "mensagens",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversaId: uuid("conversa_id")
      .notNull()
      .references(() => conversas.id, { onDelete: "cascade" }),
    // key.id da Evolution: a chave natural que torna o webhook idempotente.
    evolutionId: text("evolution_id").notNull(),
    autor: text({ enum: autoresDeMensagem }).notNull(),
    texto: text(),
    midia: jsonb().$type<Midia>(),
    transcricao: text(),
    fromMe: boolean("from_me").notNull().default(false),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }).notNull(),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("mensagens_conversa_evolution_id").on(t.conversaId, t.evolutionId),
    index("mensagens_conversa_id_idx").on(t.conversaId),
  ],
);

// Catálogo: compartilhado entre os corretores da imobiliária (spec →
// Permissão). Lotes e modelos de casa herdam a imobiliária do empreendimento.
export const incorporadoras = pgTable(
  "incorporadoras",
  {
    id: uuid().primaryKey().defaultRandom(),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    nome: text().notNull(),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("incorporadoras_imobiliaria_id_idx").on(t.imobiliariaId)],
);

// Planos de pagamento e material de marketing entram em tabelas próprias no
// ticket 04, referenciando `empreendimentos.id`.
export const empreendimentos = pgTable(
  "empreendimentos",
  {
    id: uuid().primaryKey().defaultRandom(),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    incorporadoraId: uuid("incorporadora_id")
      .notNull()
      .references(() => incorporadoras.id),
    nome: text().notNull(),
    cidade: text().notNull(),
    // Endereço/localização em texto livre (ponto de encontro padrão das
    // visitas).
    endereco: text().notNull(),
    // Texto integral da base de conhecimento (ticket 05), como o corretor
    // escreveu; os trechos indexados ficam em `trechos_de_conhecimento`.
    baseDeConhecimento: text("base_de_conhecimento"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("empreendimentos_imobiliaria_id_idx").on(t.imobiliariaId),
    index("empreendimentos_incorporadora_id_idx").on(t.incorporadoraId),
  ],
);

export const statusDeLote = ["disponivel", "reservado", "vendido"] as const;
export type StatusDeLote = (typeof statusDeLote)[number];

export const lotes = pgTable(
  "lotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    empreendimentoId: uuid("empreendimento_id")
      .notNull()
      .references(() => empreendimentos.id),
    quadra: text().notNull(),
    numero: text().notNull(),
    // Medidas em m² e metros; preço em reais.
    area: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    frente: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    fundo: numeric({ precision: 12, scale: 2, mode: "number" }).notNull(),
    preco: numeric({ precision: 14, scale: 2, mode: "number" }).notNull(),
    status: text({ enum: statusDeLote }).notNull().default("disponivel"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("lotes_empreendimento_quadra_numero").on(
      t.empreendimentoId,
      t.quadra,
      t.numero,
    ),
  ],
);

export const modelosDeCasa = pgTable(
  "modelos_de_casa",
  {
    id: uuid().primaryKey().defaultRandom(),
    empreendimentoId: uuid("empreendimento_id")
      .notNull()
      .references(() => empreendimentos.id),
    nome: text().notNull(),
    areaConstruida: numeric("area_construida", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    quartos: integer().notNull(),
    banheiros: integer().notNull(),
    suites: integer().notNull(),
    vagas: integer().notNull(),
    preco: numeric({ precision: 14, scale: 2, mode: "number" }).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("modelos_de_casa_empreendimento_id_idx").on(t.empreendimentoId),
  ],
);

// Trechos da base de conhecimento com embedding (text-embedding-3-small,
// 1536 dims). `imobiliaria_id` é redundante com o empreendimento de propósito:
// a busca filtra por ele sem join (spec: sempre filtrada pela imobiliária).
export const trechosDeConhecimento = pgTable(
  "trechos_de_conhecimento",
  {
    id: uuid().primaryKey().defaultRandom(),
    empreendimentoId: uuid("empreendimento_id")
      .notNull()
      .references(() => empreendimentos.id, { onDelete: "cascade" }),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    ordem: integer().notNull(),
    texto: text().notNull(),
    embedding: vector({ dimensions: 1536 }).notNull(),
  },
  (t) => [
    index("trechos_de_conhecimento_empreendimento_id_idx").on(
      t.empreendimentoId,
    ),
    index("trechos_de_conhecimento_imobiliaria_id_idx").on(t.imobiliariaId),
    index("trechos_de_conhecimento_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Planos de pagamento e material de marketing (ticket 04). Ambos pertencem a
// um empreendimento e herdam dele a imobiliária.
// ---------------------------------------------------------------------------

// Estrutura provisória (spec → Dados): a regra definitiva com taxas virá
// depois e substitui só `calcularPlano` em src/data/planos-de-pagamento.ts.
export const planosDePagamento = pgTable(
  "planos_de_pagamento",
  {
    id: uuid().primaryKey().defaultRandom(),
    empreendimentoId: uuid("empreendimento_id")
      .notNull()
      .references(() => empreendimentos.id),
    nome: text().notNull(),
    // Percentual de entrada sobre o preço total (0 a 100, ex.: 20.5).
    percentualDeEntrada: numeric("percentual_de_entrada", {
      precision: 5,
      scale: 2,
      mode: "number",
    }).notNull(),
    numeroDeParcelas: integer("numero_de_parcelas").notNull(),
    // Texto livre: correção, taxas, carência.
    condicoes: text().notNull().default(""),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("planos_de_pagamento_empreendimento_id_idx").on(t.empreendimentoId),
    check(
      "planos_de_pagamento_percentual",
      sql`${t.percentualDeEntrada} >= 0 and ${t.percentualDeEntrada} <= 100`,
    ),
    check("planos_de_pagamento_parcelas", sql`${t.numeroDeParcelas} >= 1`),
  ],
);

export const tiposDeArquivo = ["pdf", "imagem", "video"] as const;
export type TipoDeArquivo = (typeof tiposDeArquivo)[number];

// A quem o material se destina (GLOSSARY → Material de marketing).
export const destinosDoMaterial = ["lote", "lote_e_casa", "ambos"] as const;
export type DestinoDoMaterial = (typeof destinosDoMaterial)[number];

export const materiaisDeMarketing = pgTable(
  "materiais_de_marketing",
  {
    id: uuid().primaryKey().defaultRandom(),
    empreendimentoId: uuid("empreendimento_id")
      .notNull()
      .references(() => empreendimentos.id),
    nome: text().notNull(),
    tipoDeArquivo: text("tipo_de_arquivo", { enum: tiposDeArquivo }).notNull(),
    destino: text({ enum: destinosDoMaterial }).notNull(),
    // Chave do objeto no R2 (src/lib/storage.ts):
    // imobiliarias/<id>/empreendimentos/<id>/materiais/<uuid>
    chave: text().notNull().unique(),
    contentType: text("content_type").notNull(),
    // Em bytes.
    tamanho: integer().notNull(),
    enviadoEm: timestamp("enviado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("materiais_de_marketing_empreendimento_id_idx").on(
      t.empreendimentoId,
    ),
  ],
);

// ---- ticket 10: estado do assistente por conversa (só tipo; colunas já
// existem em `conversas`).
export type EstadoDoAssistente = (typeof estadosDoAssistente)[number];

// ---- ticket 11: pendências --------------------------------------------------
// O que o assistente não resolve sozinho e espera o corretor (GLOSSARY →
// Pendência). Escopo pelo corretor dono do negócio.

export const tiposDePendencia = [
  "revisar_proposta",
  "pergunta_sem_resposta",
  "cliente_pediu_pessoa",
  "confirmar_assinatura",
  "confirmar_pagamento",
] as const;
export type TipoDePendencia = (typeof tiposDePendencia)[number];

export const estadosDePendencia = ["aberta", "resolvida"] as const;
export type EstadoDePendencia = (typeof estadosDePendencia)[number];

export const pendencias = pgTable(
  "pendencias",
  {
    id: uuid().primaryKey().defaultRandom(),
    imobiliariaId: uuid("imobiliaria_id")
      .notNull()
      .references(() => imobiliarias.id),
    corretorId: uuid("corretor_id")
      .notNull()
      .references(() => users.id),
    negocioId: uuid("negocio_id")
      .notNull()
      .references(() => negocios.id, { onDelete: "cascade" }),
    tipo: text({ enum: tiposDePendencia }).notNull(),
    descricao: text().notNull(),
    estado: text({ enum: estadosDePendencia }).notNull().default("aberta"),
    criadaEm: timestamp("criada_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvidaEm: timestamp("resolvida_em", { withTimezone: true }),
    // Quando o número de sistema avisou o corretor; nulo enquanto espera a
    // janela de 8h–20h (ou o telefone do corretor).
    avisoEnviadoEm: timestamp("aviso_enviado_em", { withTimezone: true }),
  },
  (t) => [
    index("pendencias_corretor_id_idx").on(t.corretorId),
    index("pendencias_negocio_id_idx").on(t.negocioId),
    // Chave natural: uma pendência aberta por negócio, tipo e descrição.
    uniqueIndex("pendencias_aberta_unica")
      .on(t.negocioId, t.tipo, t.descricao)
      .where(sql`${t.estado} = 'aberta'`),
  ],
);
