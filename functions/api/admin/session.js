import { json } from "../../_lib.js";

export async function onRequestGet() {
  return json({
    ok: true,
    message: "Session administrateur active."
  });
}
