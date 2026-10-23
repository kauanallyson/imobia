import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
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
