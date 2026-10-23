import type { Repositories } from "@/domain/ports/repositories";
import type { Db } from "..";
import { createImobiliariaRepository } from "./imobiliarias";

export function createRepositories(db: Db): Repositories {
  return {
    imobiliarias: createImobiliariaRepository(db),
  };
}
