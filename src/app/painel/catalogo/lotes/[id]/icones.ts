import type { SvgIconComponent } from "@mui/icons-material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LockIcon from "@mui/icons-material/Lock";
import SellIcon from "@mui/icons-material/Sell";
import type { StatusDeLote } from "@/lib/db/schema";

export const iconeDoStatus: Record<StatusDeLote, SvgIconComponent> = {
  disponivel: CheckCircleIcon,
  reservado: LockIcon,
  vendido: SellIcon,
};
