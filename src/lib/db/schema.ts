import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
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

// Base de conhecimento, planos de pagamento e material de marketing entram
// em tabelas próprias nos tickets 04 e 05, referenciando `empreendimentos.id`.
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
