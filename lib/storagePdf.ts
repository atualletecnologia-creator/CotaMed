"use client";

import { supabase } from "@/lib/supabase";

export async function abrirPdfRegistro(path?: string | null) {
  if (!path) {
    throw new Error("PDF não vinculado.");
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    window.open(path, "_blank");
    return;
  }

  const pathLimpo = path.replace(/^registros-anvisa\//, "");

  const { data, error } = await supabase.storage
    .from("registros-anvisa")
    .createSignedUrl(pathLimpo, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Não foi possível abrir o PDF.");
  }

  window.open(data.signedUrl, "_blank");
}

export async function baixarBlobPdfRegistro(path?: string | null) {
  if (!path) {
    return null;
  }

  let url = path;

  if (!path.startsWith("http://") && !path.startsWith("https://")) {
    const pathLimpo = path.replace(/^registros-anvisa\//, "");

    const { data, error } = await supabase.storage
      .from("registros-anvisa")
      .createSignedUrl(pathLimpo, 60 * 10);

    if (error || !data?.signedUrl) {
      return null;
    }

    url = data.signedUrl;
  }

  const resp = await fetch(url);

  if (!resp.ok) {
    return null;
  }

  return await resp.blob();
}
