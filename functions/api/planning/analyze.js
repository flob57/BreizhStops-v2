
import { error } from "../../_planning.js";

export async function onRequestPost() {
  return error(
    "La V10.1 analyse désormais les captures directement dans le navigateur.",
    410
  );
}
