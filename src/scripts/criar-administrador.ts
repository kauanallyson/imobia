// Cria o primeiro administrador: não há cadastro público.
// Uso: bun run admin:create <email> <senha> <nome>
import "dotenv/config";
import { criarAdministrador } from "@/data/administradores";
import { db } from "@/lib/db";

const [email, senha, ...nome] = process.argv.slice(2);
if (!email || !senha || nome.length === 0) {
  console.error("Uso: bun run admin:create <email> <senha> <nome>");
  process.exit(1);
}

const administrador = await criarAdministrador({
  email,
  senha,
  nome: nome.join(" "),
});
console.log(`Administrador criado: ${administrador.email}`);
await db.$client.end();
